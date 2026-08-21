#!/usr/bin/env python3
"""Verify QCTP A05 voice audition wording, package integrity, and no-stretch controls."""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import pathlib
import re
import subprocess
from typing import Any

import librosa
import numpy as np
import pyloudnorm as pyln
from faster_whisper import WhisperModel
from jiwer import wer

SAMPLE_RATE = 24000
LOCKED_SCRIPT_SHA = "2649ce70e5ab824dbc6b797e07082567fda2443962016e8e6c7dbe454f5ee555"


def sha256_file(path: pathlib.Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9\s]", " ", text.lower())).strip()


def ffprobe(path: pathlib.Path) -> dict[str, Any]:
    completed = subprocess.run(
        [
            "ffprobe", "-v", "error", "-show_entries",
            "format=duration,format_name,bit_rate:stream=codec_name,sample_rate,channels",
            "-of", "json", str(path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(completed.stdout)


def require(condition: bool, message: str, errors: list[str]) -> None:
    if not condition:
        errors.append(message)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=pathlib.Path, required=True)
    parser.add_argument("--model", default="small.en")
    args = parser.parse_args()
    output = args.output.resolve()
    manifest_path = output / "manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    errors: list[str] = []

    require(manifest.get("schema") == "qctp-a05-voice-naturalness-audition-v1", "Manifest schema mismatch", errors)
    require(manifest.get("action_id") == "QCTP-D1-AUDIO-A05", "Action ID mismatch", errors)
    require(manifest.get("locked_script_sha256") == LOCKED_SCRIPT_SHA, "Locked script hash changed", errors)
    require(manifest.get("release_authority") == "ZERO_RELEASE", "Release authority changed", errors)
    samples = manifest.get("samples", [])
    require(len(samples) == 3, f"Expected three samples, found {len(samples)}", errors)
    require({sample.get("sample_code") for sample in samples} == {"A", "B", "C"}, "Blind sample codes changed", errors)

    page = (output / "index.html").read_text(encoding="utf-8")
    for marker in ["VOICE TEST ONLY", "NO MEDITATION", "NO COMPLETION CREDIT", "Sample A", "Sample B", "Sample C", "Best: A, B, C, or NONE"]:
        require(marker in page, f"Page marker missing: {marker}", errors)

    model = WhisperModel(args.model, device="cpu", compute_type="int8")
    expected = normalize_text(manifest["audition_text"])
    asr_records: dict[str, Any] = {}
    acoustic_records: dict[str, Any] = {}
    meter = pyln.Meter(SAMPLE_RATE)

    for sample in samples:
        code = sample["sample_code"]
        path = output / sample["file"]
        require(path.exists(), f"Sample {code} file missing", errors)
        if not path.exists():
            continue
        require(sha256_file(path) == sample["mp3_sha256"], f"Sample {code} SHA-256 mismatch", errors)
        require(sample.get("spectral_time_stretch_used") is False, f"Sample {code} used spectral time-stretch", errors)
        require(math.isclose(float(sample.get("time_stretch_factor", 0.0)), 1.0, abs_tol=1e-9), f"Sample {code} stretch factor is not 1.0", errors)

        probe = ffprobe(path)
        stream = probe["streams"][0]
        duration = float(probe["format"]["duration"])
        require(stream.get("codec_name") == "mp3", f"Sample {code} codec is not MP3", errors)
        require(int(stream.get("sample_rate", 0)) == SAMPLE_RATE, f"Sample {code} sample rate mismatch", errors)
        require(int(stream.get("channels", 0)) == 1, f"Sample {code} is not mono", errors)
        require(8.0 <= duration <= 75.0, f"Sample {code} duration {duration:.2f}s outside audition bounds", errors)

        audio, sr = librosa.load(path, sr=None, mono=True)
        require(sr == SAMPLE_RATE, f"Sample {code} decoded sample rate mismatch", errors)
        require(np.isfinite(audio).all(), f"Sample {code} contains non-finite samples", errors)
        peak = float(np.max(np.abs(audio)))
        rms = float(np.sqrt(np.mean(np.square(audio.astype(np.float64)))))
        loudness = float(meter.integrated_loudness(audio.astype(np.float64)))
        require(peak <= 0.83, f"Sample {code} peak {peak:.4f} exceeds limit", errors)
        require(rms >= 0.008, f"Sample {code} RMS {rms:.5f} is too low", errors)
        require(-22.0 <= loudness <= -15.0, f"Sample {code} loudness {loudness:.2f} LUFS outside bounds", errors)
        acoustic_records[code] = {
            "duration_seconds": duration,
            "sample_rate": sr,
            "channels": 1,
            "peak_linear": peak,
            "rms": rms,
            "integrated_lufs": loudness,
            "sha256": sha256_file(path),
        }

        segments, info = model.transcribe(str(path), beam_size=5, vad_filter=False, language="en")
        raw = " ".join(segment.text.strip() for segment in segments).strip()
        normalized = normalize_text(raw)
        value = float(wer(expected, normalized))
        require(value <= 0.12, f"Sample {code} ASR WER {value:.3f} exceeds 0.12", errors)
        asr_records[code] = {
            "raw_transcript": raw,
            "normalized_transcript": normalized,
            "expected_normalized": expected,
            "wer": value,
            "model": args.model,
            "language": info.language,
            "language_probability": info.language_probability,
        }
        print(f"Sample {code} WER: {value:.3f}")

    sample_c = next((sample for sample in samples if sample.get("sample_code") == "C"), {})
    require(sample_c.get("delivery") == "CLAUSE_AND_SENTENCE_PAUSE_COMPOSED", "Sample C pause-composed contract changed", errors)
    require(float(sample_c.get("inserted_silence_seconds", 0.0)) >= 3.0, "Sample C has insufficient real pause composition", errors)

    asr_path = output / "critical-asr.json"
    asr_path.write_text(json.dumps({
        "schema": "qctp-a05-critical-asr-v1",
        "result": "PASS" if not errors else "FAIL",
        "expected_text": manifest["audition_text"],
        "expected_normalized": expected,
        "samples": asr_records,
    }, indent=2) + "\n", encoding="utf-8")

    verification = {
        "schema": "qctp-a05-voice-audition-machine-verification-v1",
        "action_id": "QCTP-D1-AUDIO-A05",
        "result": "PASS" if not errors else "FAIL",
        "locked_script_sha256": LOCKED_SCRIPT_SHA,
        "manifest_sha256": sha256_file(manifest_path),
        "page_sha256": sha256_file(output / "index.html"),
        "sample_count": len(samples),
        "no_spectral_time_stretch": "PASS" if all(sample.get("spectral_time_stretch_used") is False for sample in samples) else "FAIL",
        "time_stretch_factor": "PASS_1_0_ALL" if all(math.isclose(float(sample.get("time_stretch_factor", 0.0)), 1.0, abs_tol=1e-9) for sample in samples) else "FAIL",
        "acoustic_results": acoustic_records,
        "critical_asr": asr_records,
        "naturalness_gate": "OPEN_PHYSICAL_USER_SELECTION",
        "full_session_rebuild_authority": "WITHHELD",
        "release_authority": "ZERO_RELEASE",
        "errors": errors,
    }
    (output / "machine-verification.json").write_text(json.dumps(verification, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(verification, indent=2))
    if errors:
        raise SystemExit("A05 machine verification failed")


if __name__ == "__main__":
    main()
