#!/usr/bin/env python3
"""Add deterministic, voice-free phase markers to the controlled Day 1 beds.

The source beds are reused technical support work from the rejected A03R package.
No narration, reference voice, provider model, or spectral time-stretch enters this
build.  The script always starts from the pinned Rev3 baseline blobs so a repeated
build cannot accidentally layer markers more than once.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import pathlib
import shutil
import subprocess
import tempfile
from typing import Any

import numpy as np


SOURCE_GIT_REF = "a2093caa714332313fa7196f3dc58a67a2d721d2"
SAMPLE_RATE = 24_000
DURATION_SECONDS = 1_500
MARKER_BOUNDARIES_SECONDS = (180, 480, 780, 1_380, 1_440)
MARKER_LEAD_SECONDS = 0.4
MARKER_DURATION_SECONDS = 0.26
SOURCE_ASSETS = {
    "support-ambient-1500.mp3": {
        "sha256": "3aeb72be1b4fae7dc9a8aa2543e3fdefb75c5a85c8f5142154b6149c43f34d20",
        "mode": "ambient",
    },
    "support-binaural-low-a-1500.mp3": {
        "sha256": "2e33b45490a9b64c8dea2843024b4d0ac4d8ef70560e28da35d5e5b6b1216eba",
        "mode": "binaural_low_a",
    },
    "support-minimal-1500.mp3": {
        "sha256": "d3ea4fbee34c8a4e1f15f2693a75d3fc682bee09956cfe170e554378b1549b50",
        "mode": "minimal_continuity",
    },
}


def sha256(path: pathlib.Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def run(command: list[str], *, cwd: pathlib.Path) -> subprocess.CompletedProcess[bytes]:
    return subprocess.run(command, cwd=cwd, check=True, capture_output=True)


def marker_wave() -> np.ndarray:
    count = int(MARKER_DURATION_SECONDS * SAMPLE_RATE)
    time = np.arange(count, dtype=np.float32) / SAMPLE_RATE
    envelope = np.sin(np.linspace(0, math.pi, count, endpoint=True)) ** 2
    tone = 0.018 * (
        np.sin(2 * math.pi * 330 * time)
        + 0.35 * np.sin(2 * math.pi * 495 * time)
    )
    return (tone * envelope).astype(np.float32)


def ffprobe(path: pathlib.Path, *, cwd: pathlib.Path) -> dict[str, Any]:
    result = run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "stream=codec_name,sample_rate,channels:format=duration,bit_rate",
            "-of",
            "json",
            str(path),
        ],
        cwd=cwd,
    )
    return json.loads(result.stdout.decode("utf-8"))


def extract_baseline_blob(
    repo: pathlib.Path, relative_path: pathlib.PurePosixPath, output: pathlib.Path
) -> None:
    result = run(
        ["git", "show", f"{SOURCE_GIT_REF}:{relative_path.as_posix()}"], cwd=repo
    )
    output.write_bytes(result.stdout)


def patch_markers(source_mp3: pathlib.Path, output_mp3: pathlib.Path, *, repo: pathlib.Path) -> None:
    with tempfile.TemporaryDirectory(prefix="qctp-voice-free-support-") as raw_temp:
        temp = pathlib.Path(raw_temp)
        pcm = temp / "source.f32le"
        staged = temp / "marked.mp3"
        run(
            [
                "ffmpeg",
                "-v",
                "error",
                "-y",
                "-i",
                str(source_mp3),
                "-ar",
                str(SAMPLE_RATE),
                "-ac",
                "2",
                "-f",
                "f32le",
                str(pcm),
            ],
            cwd=repo,
        )

        bytes_per_frame = np.dtype("<f4").itemsize * 2
        if pcm.stat().st_size % bytes_per_frame:
            raise RuntimeError(f"Malformed decoded PCM for {source_mp3.name}")
        frames = pcm.stat().st_size // bytes_per_frame
        if abs(frames / SAMPLE_RATE - DURATION_SECONDS) > 0.01:
            raise RuntimeError(
                f"Unexpected decoded duration for {source_mp3.name}: {frames / SAMPLE_RATE}"
            )

        marker = marker_wave()
        audio = np.memmap(pcm, dtype="<f4", mode="r+", shape=(frames, 2))
        for boundary in MARKER_BOUNDARIES_SECONDS:
            start = int(round((boundary - MARKER_LEAD_SECONDS) * SAMPLE_RATE))
            window = audio[start : start + len(marker)]
            if len(window) != len(marker):
                raise RuntimeError(f"Short marker window at {boundary}s in {source_mp3.name}")
            window += marker[:, None]
            if float(np.max(np.abs(window))) >= 0.98:
                raise RuntimeError(f"Phase marker clips at {boundary}s in {source_mp3.name}")
        audio.flush()
        mmap_handle = audio._mmap
        del window
        del audio
        mmap_handle.close()

        run(
            [
                "ffmpeg",
                "-v",
                "error",
                "-y",
                "-f",
                "f32le",
                "-ar",
                str(SAMPLE_RATE),
                "-ac",
                "2",
                "-i",
                str(pcm),
                "-map_metadata",
                "-1",
                "-ar",
                str(SAMPLE_RATE),
                "-ac",
                "2",
                "-c:a",
                "libmp3lame",
                "-b:a",
                "64k",
                "-id3v2_version",
                "0",
                str(staged),
            ],
            cwd=repo,
        )
        output_mp3.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(staged, output_mp3)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", type=pathlib.Path, default=pathlib.Path.cwd())
    parser.add_argument(
        "--output-root",
        type=pathlib.Path,
        default=pathlib.Path("public/audio/day1-source-rev0"),
    )
    parser.add_argument(
        "--record",
        type=pathlib.Path,
        default=pathlib.Path("tools/voice-free-day1/phase-marker-build-record.json"),
    )
    args = parser.parse_args()
    repo = args.repo.resolve()
    output_root = (repo / args.output_root).resolve()
    record_path = (repo / args.record).resolve()

    output_records: list[dict[str, Any]] = []
    with tempfile.TemporaryDirectory(prefix="qctp-voice-free-baseline-") as raw_temp:
        temp = pathlib.Path(raw_temp)
        for file_name, definition in SOURCE_ASSETS.items():
            relative = pathlib.PurePosixPath("public/audio/day1-source-rev0") / file_name
            source = temp / file_name
            extract_baseline_blob(repo, relative, source)
            actual_source_sha = sha256(source)
            if actual_source_sha != definition["sha256"]:
                raise RuntimeError(
                    f"Pinned source hash mismatch for {file_name}: {actual_source_sha}"
                )
            output = output_root / file_name
            patch_markers(source, output, repo=repo)
            probe = ffprobe(output, cwd=repo)
            output_records.append(
                {
                    "mode": definition["mode"],
                    "path": output.relative_to(repo).as_posix(),
                    "bytes": output.stat().st_size,
                    "sha256": sha256(output),
                    "probe": probe,
                }
            )

    record = {
        "schema": "qctp-rev3-voice-free-phase-marker-build-v1",
        "status": "BUILT_MACHINE_VERIFICATION_REQUIRED",
        "release_authority": "ZERO_RELEASE",
        "source_git_ref": SOURCE_GIT_REF,
        "source_assets": SOURCE_ASSETS,
        "operations": {
            "narration_used": False,
            "time_stretch_used": False,
            "source_bed_timing_changed": False,
            "marker_boundaries_seconds": list(MARKER_BOUNDARIES_SECONDS),
            "marker_lead_seconds": MARKER_LEAD_SECONDS,
            "marker_duration_seconds": MARKER_DURATION_SECONDS,
            "marker_frequencies_hz": [330, 495],
            "marker_peak_formula": "0.018 * (sin(330 Hz) + 0.35 * sin(495 Hz)) * sin^2 envelope",
            "encoding": "ffmpeg libmp3lame 64 kbps, 24 kHz, stereo",
        },
        "outputs": output_records,
    }
    record_path.parent.mkdir(parents=True, exist_ok=True)
    record_path.write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(record, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
