#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import math
import pathlib
import subprocess
from typing import Any

import numpy as np
import soundfile as sf

SCRIPT_SHA = "2649ce70e5ab824dbc6b797e07082567fda2443962016e8e6c7dbe454f5ee555"
SAMPLE_RATE = 24000


def sha256_file(path: pathlib.Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def ffprobe(path: pathlib.Path) -> dict[str, Any]:
    result = subprocess.run(
        ["ffprobe", "-v", "error", "-show_entries", "format=duration:stream=codec_name,sample_rate,channels", "-of", "json", str(path)],
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout)


def rms(values: np.ndarray) -> float:
    return float(np.sqrt(np.mean(np.square(values.astype(np.float64)))))


def verify_continuity(path: pathlib.Path, block_seconds: float = 5.0) -> dict[str, float]:
    audio, rate = sf.read(path, dtype="float32", always_2d=True)
    block = max(1, int(block_seconds * rate))
    values = [rms(audio[start : min(len(audio), start + block)]) for start in range(0, len(audio), block)]
    minimum = min(values)
    maximum = max(values)
    if minimum < 1e-5:
        raise RuntimeError(f"Support dropout in {path.name}: minimum block RMS {minimum}")
    if float(np.max(np.abs(audio))) >= 0.999:
        raise RuntimeError(f"Clipping in {path.name}")
    return {"minimum_5s_rms": minimum, "maximum_5s_rms": maximum, "peak": float(np.max(np.abs(audio)))}


def frequency_power(channel: np.ndarray, rate: int, frequency: float, seconds: float = 30.0) -> float:
    count = min(len(channel), int(seconds * rate))
    data = channel[:count].astype(np.float64)
    data -= np.mean(data)
    window = np.hanning(count)
    spectrum = np.fft.rfft(data * window)
    frequencies = np.fft.rfftfreq(count, 1 / rate)
    index = int(np.argmin(np.abs(frequencies - frequency)))
    return float(np.abs(spectrum[index]) ** 2)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=pathlib.Path, required=True)
    args = parser.parse_args()
    output = args.output.resolve()
    manifest_path = output / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    errors: list[str] = []
    if manifest.get("script_sha256") != SCRIPT_SHA:
        errors.append("script SHA mismatch")
    if manifest.get("release_authority") != "ZERO_RELEASE":
        errors.append("release authority changed")
    if len(manifest.get("cue_renders", [])) != 35:
        errors.append("expected 35 cue renders")
    if manifest.get("runtime_contract", {}).get("test_no_completion_credit") is not True:
        errors.append("diagnostic completion guard missing")
    if manifest.get("runtime_contract", {}).get("no_runtime_tts_provider") is not True:
        errors.append("runtime TTS provider still required")

    asset_records: dict[str, dict[str, Any]] = {}
    for record in manifest.get("assets", []):
        path = output / record["path"]
        if not path.exists():
            errors.append(f"missing asset {record['path']}")
            continue
        actual = sha256_file(path)
        if actual != record["sha256"]:
            errors.append(f"hash mismatch {record['path']}")
        if path.stat().st_size >= 95 * 1024 * 1024:
            errors.append(f"asset exceeds 95 MiB {record['path']}")
        asset_records[path.name] = record

    expected_durations = {
        "voice-1500.mp3": 1500.0,
        "support-ambient-1500.mp3": 1500.0,
        "support-binaural-low-a-1500.mp3": 1500.0,
        "support-minimal-1500.mp3": 1500.0,
        "composite-ambient-low-1500.mp3": 1500.0,
        "acceptance-ambient.mp3": 300.0,
        "acceptance-binaural-low-a.mp3": 300.0,
        "acceptance-minimal.mp3": 300.0,
    }
    duration_results: dict[str, float] = {}
    for name, expected in expected_durations.items():
        path = output / name
        if not path.exists():
            errors.append(f"missing timed asset {name}")
            continue
        probe = ffprobe(path)
        duration = float(probe["format"]["duration"])
        duration_results[name] = duration
        if abs(duration - expected) > 0.20:
            errors.append(f"duration mismatch {name}: {duration}")

    work = output / "_work"
    continuity_results: dict[str, Any] = {}
    for name in ["support-ambient-1500.wav", "support-binaural-1500.wav", "support-minimal-1500.wav", "acceptance-ambient.wav", "acceptance-binaural.wav", "acceptance-minimal.wav"]:
        path = work / name
        if not path.exists():
            errors.append(f"missing QA WAV {name}")
            continue
        try:
            continuity_results[name] = verify_continuity(path)
        except Exception as exc:
            errors.append(str(exc))

    binaural_path = work / "support-binaural-1500.wav"
    binaural_result: dict[str, Any] = {}
    if binaural_path.exists():
        stereo, rate = sf.read(binaural_path, dtype="float32", always_2d=True)
        left_216 = frequency_power(stereo[:, 0], rate, 216.0)
        left_224 = frequency_power(stereo[:, 0], rate, 224.0)
        right_216 = frequency_power(stereo[:, 1], rate, 216.0)
        right_224 = frequency_power(stereo[:, 1], rate, 224.0)
        binaural_result = {"left_216": left_216, "left_224": left_224, "right_216": right_216, "right_224": right_224}
        if not (left_216 > left_224 * 2.0 and right_224 > right_216 * 2.0):
            errors.append("binaural channel-frequency contract failed")

    voice_path = work / "voice-1500.wav"
    onset_results: list[dict[str, Any]] = []
    if voice_path.exists():
        voice, rate = sf.read(voice_path, dtype="float32")
        if float(np.max(np.abs(voice))) >= 0.999:
            errors.append("voice stem clips")
        for cue in manifest.get("cue_renders", []):
            start = int(float(cue["start_seconds"]) * rate)
            segment = voice[start : min(len(voice), start + int(0.7 * rate))]
            energy = rms(segment)
            onset_results.append({"cue_id": cue["cue_id"], "start_seconds": cue["start_seconds"], "onset_rms": energy})
            if energy < 1e-4:
                errors.append(f"inaudible cue onset {cue['cue_id']}")

    critical_terms = {
        "D1-A02-108": ["release", "accepting", "force"],
        "D1-A02-210": ["five", "out"],
        "D1-A02-480": ["ears", "space"],
        "D1-A02-1440": ["feet", "chair", "hands", "breath"],
    }
    asr_path = output / "critical-asr.json"
    asr_result: dict[str, Any] = {}
    if asr_path.exists():
        asr_result = json.loads(asr_path.read_text(encoding="utf-8"))
        for cue_id, terms in critical_terms.items():
            transcript = str(asr_result.get(cue_id, {}).get("transcript", "")).lower()
            missing = [term for term in terms if term not in transcript]
            if missing:
                errors.append(f"ASR missing {cue_id}: {', '.join(missing)}")
    else:
        errors.append("critical ASR report missing")

    html = (output / "index.html").read_text(encoding="utf-8") if (output / "index.html").exists() else ""
    for required in ["TEST — NO COMPLETION CREDIT", "acceptance-ambient.mp3", "acceptance-binaural-low-a.mp3", "acceptance-minimal.mp3"]:
        if required not in html:
            errors.append(f"acceptance page missing {required}")
    if "heygen" in html.lower() or "resource2" in html.lower():
        errors.append("acceptance page includes external TTS address")

    report = {
        "schema": "qctp-day1-a03-machine-verification-v1",
        "result": "FAIL" if errors else "PASS",
        "script_sha256": SCRIPT_SHA,
        "manifest_sha256": sha256_file(manifest_path),
        "duration_results": duration_results,
        "continuity_results": continuity_results,
        "binaural_result": binaural_result,
        "cue_onset_results": onset_results,
        "critical_asr": asr_result,
        "errors": errors,
        "release_authority": "ZERO_RELEASE",
        "physical_iphone_acceptance": "OPEN",
    }
    report_path = output / "machine-verification.json"
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    if errors:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
