#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import pathlib
import re

from faster_whisper import WhisperModel
from jiwer import wer

CRITICAL_CUES = ["D1-A02-108", "D1-A02-210", "D1-A02-480", "D1-A02-1440"]
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


def normalize(text: str) -> str:
    tokens = re.findall(r"[a-z]+|\d+", text.lower())
    output: list[str] = []
    for token in tokens:
        if token in DIGIT_WORDS:
            output.append(DIGIT_WORDS[token])
        elif token.isdigit():
            output.extend(DIGIT_WORDS.get(character, character) for character in token)
        else:
            output.append(token)
    return " ".join(output)


def load_expected(repo: pathlib.Path) -> dict[str, str]:
    manifest = json.loads(
        (repo / "QCTP_DAY1_SOURCE_LABELED_SCRIPT_CANDIDATE_REV0.json").read_text(encoding="utf-8")
    )
    expected: dict[str, str] = {}
    for part_ref in manifest["cue_part_refs"]:
        part = json.loads((repo / part_ref).read_text(encoding="utf-8"))
        for cue in part["cues"]:
            expected[cue["cue_id"]] = cue["spoken_text"]
    missing = sorted(set(CRITICAL_CUES) - expected.keys())
    if missing:
        raise RuntimeError(f"Critical cues missing from locked script: {missing}")
    return expected


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", type=pathlib.Path, default=pathlib.Path("."))
    parser.add_argument("--output", type=pathlib.Path, required=True)
    parser.add_argument("--model", default="small.en")
    args = parser.parse_args()

    repo = args.repo.resolve()
    output = args.output.resolve()
    cue_root = output / "_work" / "cues"
    expected = load_expected(repo)
    model = WhisperModel(args.model, device="cpu", compute_type="int8")
    records: dict[str, object] = {}

    for cue_id in CRITICAL_CUES:
        cue_path = cue_root / f"{cue_id}.wav"
        if not cue_path.exists():
            raise RuntimeError(f"Missing critical rendered cue: {cue_path}")
        segments, info = model.transcribe(
            str(cue_path),
            beam_size=5,
            vad_filter=False,
            language="en",
            condition_on_previous_text=False,
            word_timestamps=True,
        )
        segment_list = list(segments)
        raw = " ".join(segment.text.strip() for segment in segment_list).strip()
        normalized = normalize(raw)
        expected_text = expected[cue_id]
        expected_normalized = normalize(expected_text)
        record = {
            "transcript": normalized,
            "raw_transcript": raw,
            "normalized_transcript": normalized,
            "expected_text": expected_text,
            "expected_normalized": expected_normalized,
            "wer": float(wer(expected_normalized, normalized)),
            "model": args.model,
            "language": info.language,
            "language_probability": info.language_probability,
            "segments": [
                {"start": segment.start, "end": segment.end, "text": segment.text.strip()}
                for segment in segment_list
            ],
        }
        records[cue_id] = record
        print(f"{cue_id} RAW: {raw}")
        print(f"{cue_id} NORMALIZED: {normalized}")
        print(f"{cue_id} WER: {record['wer']}")

    (output / "critical-asr.json").write_text(
        json.dumps(records, indent=2) + "\n", encoding="utf-8"
    )


if __name__ == "__main__":
    main()
