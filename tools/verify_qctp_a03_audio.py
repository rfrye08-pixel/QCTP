#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import re
import subprocess
from typing import Any

import numpy as np
import soundfile as sf
from jiwer import wer

SCRIPT_SHA = "2649ce70e5ab824dbc6b797e07082567fda2443962016e8e6c7dbe454f5ee555"
SAMPLE_RATE = 24000
EXPECTED_AUDIO_ASSETS = 8
DIGIT_WORDS = {
    "0": "zero",
    "1": "one",
    "2": "two",
    "3": "three",
    "4": "four",
    "5": "five",
    "6": "six",
    "7": "seven",
    "8": "eight",
    "9": "nine",
    "10": "ten",
}


def sha256_file(path: pathlib.Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def ffprobe(path: pathlib.Path) -> dict[str, Any]:
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration:stream=codec_name,sample_rate,channels",
            "-of",
            "json",
            str(path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout)


def rms(values: np.ndarray) -> float:
    if values.size == 0:
        return 0.0
    return float(np.sqrt(np.mean(np.square(values.astype(np.float64)))))


def normalize_words(text: str) -> str:
    tokens = re.findall(r"[a-z]+|\d+", text.lower())
    normalized: list[str] = []
    for token in tokens:
        if token in DIGIT_WORDS:
            normalized.append(DIGIT_WORDS[token])
        elif token.isdigit():
            normalized.extend(DIGIT_WORDS.get(character, character) for character in token)
        else:
            normalized.append(token)
    return " ".join(normalized)


def verify_continuity(path: pathlib.Path, block_seconds: float = 5.0) -> dict[str, float]:
    audio, rate = sf.read(path, dtype="float32", always_2d=True)
    block = max(1, int(block_seconds * rate))
    values = [rms(audio[start : min(len(audio), start + block)]) for start in range(0, len(audio), block)]
    minimum = min(values)
    maximum = max(values)
    peak = float(np.max(np.abs(audio)))
    if minimum < 1e-5:
        raise RuntimeError(f"Support dropout in {path.name}: minimum block RMS {minimum}")
    if peak >= 0.999:
        raise RuntimeError(f"Clipping in {path.name}")
    return {"minimum_5s_rms": minimum, "maximum_5s_rms": maximum, "peak": peak}


def frequency_power(channel: np.ndarray, rate: int, frequency: float, seconds: float = 30.0) -> float:
    count = min(len(channel), int(seconds * rate))
    data = channel[:count].astype(np.float64)
    data -= np.mean(data)
    window = np.hanning(count)
    spectrum = np.fft.rfft(data * window)
    frequencies = np.fft.rfftfreq(count, 1 / rate)
    index = int(np.argmin(np.abs(frequencies - frequency)))
    return float(np.abs(spectrum[index]) ** 2)


def critical_semantic_errors(cue_id: str, normalized: str) -> list[str]:
    tokens = normalized.split()
    token_set = set(tokens)
    if cue_id == "D1-A02-108":
        required = {"release", "accepting", "force"}
        return [f"missing term {term}" for term in sorted(required - token_set)]
    if cue_id == "D1-A02-210":
        errors: list[str] = []
        if tokens.count("five") < 2:
            errors.append("fewer than two audible five anchors")
        if not ({"out", "exhale"} & token_set):
            errors.append("outbound-breath word not recognized")
        required_counts = {"one": 2, "two": 2, "three": 2, "four": 2}
        for term, minimum in required_counts.items():
            if tokens.count(term) < minimum:
                errors.append(f"count word {term} recognized fewer than {minimum} times")
        return errors
    if cue_id == "D1-A02-480":
        required = {"ears", "space"}
        return [f"missing term {term}" for term in sorted(required - token_set)]
    if cue_id == "D1-A02-1440":
        required = {"feet", "chair", "hands", "breath"}
        return [f"missing term {term}" for term in sorted(required - token_set)]
    return ["unknown critical cue"]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=pathlib.Path, required=True)
    args = parser.parse_args()
    output = args.output.resolve()
    manifest_path = output / "manifest.json"
    errors: list[str] = []

    if not manifest_path.exists():
        raise SystemExit(f"Missing manifest: {manifest_path}")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("script_sha256") != SCRIPT_SHA:
        errors.append("script SHA mismatch")
    if manifest.get("release_authority") != "ZERO_RELEASE":
        errors.append("release authority changed")
    cue_renders = manifest.get("cue_renders", [])
    if len(cue_renders) != 35:
        errors.append("expected 35 cue renders")
    runtime_contract = manifest.get("runtime_contract", {})
    if runtime_contract.get("test_no_completion_credit") is not True:
        errors.append("diagnostic completion guard missing")
    if runtime_contract.get("no_runtime_tts_provider") is not True:
        errors.append("runtime TTS provider still required")
    if runtime_contract.get("continuous_composite_acceptance") is not True:
        errors.append("continuous acceptance composite contract missing")

    asset_records: dict[str, dict[str, Any]] = {}
    assets = manifest.get("assets", [])
    if len(assets) != EXPECTED_AUDIO_ASSETS:
        errors.append(f"expected {EXPECTED_AUDIO_ASSETS} audio assets, found {len(assets)}")
    for record in assets:
        relative_path = str(record.get("path", ""))
        path = output / relative_path
        if not path.exists():
            errors.append(f"missing asset {relative_path}")
            continue
        actual = sha256_file(path)
        if actual != record.get("sha256"):
            errors.append(f"hash mismatch {relative_path}")
        if path.stat().st_size >= 95 * 1024 * 1024:
            errors.append(f"asset exceeds 95 MiB {relative_path}")
        asset_records[path.name] = record

    expected_durations = {
        "voice-1500.mp3": (1500.0, 1),
        "support-ambient-1500.mp3": (1500.0, 2),
        "support-binaural-low-a-1500.mp3": (1500.0, 2),
        "support-minimal-1500.mp3": (1500.0, 2),
        "composite-ambient-low-1500.mp3": (1500.0, 2),
        "acceptance-ambient.mp3": (300.0, 2),
        "acceptance-binaural-low-a.mp3": (300.0, 2),
        "acceptance-minimal.mp3": (300.0, 2),
    }
    duration_results: dict[str, Any] = {}
    for name, (expected_duration, expected_channels) in expected_durations.items():
        path = output / name
        if not path.exists():
            errors.append(f"missing timed asset {name}")
            continue
        probe = ffprobe(path)
        duration = float(probe["format"]["duration"])
        streams = probe.get("streams", [])
        stream = streams[0] if streams else {}
        channels = int(stream.get("channels", 0))
        sample_rate = int(stream.get("sample_rate", 0))
        codec = stream.get("codec_name")
        duration_results[name] = {
            "duration_seconds": duration,
            "channels": channels,
            "sample_rate": sample_rate,
            "codec": codec,
        }
        if abs(duration - expected_duration) > 0.20:
            errors.append(f"duration mismatch {name}: {duration}")
        if channels != expected_channels:
            errors.append(f"channel mismatch {name}: {channels}")
        if sample_rate != SAMPLE_RATE:
            errors.append(f"sample-rate mismatch {name}: {sample_rate}")
        if codec != "mp3":
            errors.append(f"codec mismatch {name}: {codec}")

    work = output / "_work"
    continuity_results: dict[str, Any] = {}
    qa_wavs = [
        "support-ambient-1500.wav",
        "support-binaural-1500.wav",
        "support-minimal-1500.wav",
        "acceptance-ambient.wav",
        "acceptance-binaural.wav",
        "acceptance-minimal.wav",
    ]
    for name in qa_wavs:
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
        binaural_result = {
            "left_216": left_216,
            "left_224": left_224,
            "right_216": right_216,
            "right_224": right_224,
        }
        if not (left_216 > left_224 * 2.0 and right_224 > right_216 * 2.0):
            errors.append("binaural channel-frequency contract failed")

    voice_path = work / "voice-1500.wav"
    onset_results: list[dict[str, Any]] = []
    marker_results: list[dict[str, Any]] = []
    if voice_path.exists():
        voice, rate = sf.read(voice_path, dtype="float32")
        if float(np.max(np.abs(voice))) >= 0.999:
            errors.append("voice stem clips")
        for index, cue in enumerate(cue_renders):
            start_seconds = float(cue["start_seconds"])
            start = int(start_seconds * rate)
            segment = voice[start : min(len(voice), start + int(0.7 * rate))]
            energy = rms(segment)
            onset_results.append(
                {"cue_id": cue["cue_id"], "start_seconds": start_seconds, "onset_rms": energy}
            )
            if energy < 1e-4:
                errors.append(f"inaudible cue onset {cue['cue_id']}")
            if index > 0:
                marker_start = max(0, int((start_seconds - 0.40) * rate))
                marker_end = max(marker_start, int((start_seconds - 0.14) * rate))
                marker_energy = rms(voice[marker_start:marker_end])
                marker_results.append(
                    {
                        "cue_id": cue["cue_id"],
                        "marker_start_seconds": start_seconds - 0.40,
                        "marker_rms": marker_energy,
                    }
                )
                if marker_energy < 1e-3:
                    errors.append(f"predictive marker missing or too quiet {cue['cue_id']}")
    else:
        errors.append("missing voice QA WAV")

    asr_path = output / "critical-asr.json"
    asr_result: dict[str, Any] = {}
    asr_gate: dict[str, Any] = {}
    expected_critical = {"D1-A02-108", "D1-A02-210", "D1-A02-480", "D1-A02-1440"}
    if asr_path.exists():
        asr_result = json.loads(asr_path.read_text(encoding="utf-8"))
        for cue_id in sorted(expected_critical):
            record = asr_result.get(cue_id, {})
            raw_transcript = str(record.get("raw_transcript", record.get("transcript", "")))
            normalized_transcript = normalize_words(
                str(record.get("normalized_transcript", raw_transcript))
            )
            expected_text = str(record.get("expected_text", ""))
            expected_normalized = normalize_words(
                str(record.get("expected_normalized", expected_text))
            )
            semantic_errors = critical_semantic_errors(cue_id, normalized_transcript)
            cue_wer = None
            if expected_normalized:
                cue_wer = float(wer(expected_normalized, normalized_transcript))
                if cue_wer > 0.45:
                    semantic_errors.append(f"word error rate {cue_wer:.3f} exceeds 0.45")
            else:
                semantic_errors.append("expected text missing from ASR record")
            asr_gate[cue_id] = {
                "raw_transcript": raw_transcript,
                "normalized_transcript": normalized_transcript,
                "expected_normalized": expected_normalized,
                "wer": cue_wer,
                "model": record.get("model"),
                "semantic_errors": semantic_errors,
                "result": "PASS" if not semantic_errors else "FAIL",
            }
            for detail in semantic_errors:
                errors.append(f"ASR {cue_id}: {detail}")
    else:
        errors.append("critical ASR report missing")

    page_path = output / "index.html"
    html = page_path.read_text(encoding="utf-8") if page_path.exists() else ""
    for required in [
        "TEST — NO COMPLETION CREDIT",
        "acceptance-ambient.mp3",
        "acceptance-binaural-low-a.mp3",
        "acceptance-minimal.mp3",
        "Bullard",
        "HeartMath",
        "Dispenza",
    ]:
        if required not in html:
            errors.append(f"acceptance page missing {required}")
    if "heygen" in html.lower() or "resource2" in html.lower():
        errors.append("acceptance page includes external TTS address")

    report = {
        "schema": "qctp-day1-a03-machine-verification-v2",
        "result": "FAIL" if errors else "PASS",
        "script_sha256": SCRIPT_SHA,
        "manifest_sha256": sha256_file(manifest_path),
        "duration_results": duration_results,
        "continuity_results": continuity_results,
        "binaural_result": binaural_result,
        "cue_onset_results": onset_results,
        "predictive_marker_results": marker_results,
        "critical_asr": asr_result,
        "critical_asr_gate": asr_gate,
        "acceptance_page_sha256": sha256_file(page_path) if page_path.exists() else None,
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
