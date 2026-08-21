#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import pathlib


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--builder", type=pathlib.Path, required=True)
    parser.add_argument("--attestation", type=pathlib.Path, required=True)
    args = parser.parse_args()

    path = args.builder.resolve()
    before = path.read_bytes()
    text = before.decode("utf-8")
    exact_target = '        file_record(output / "index.html"),\n'
    changed = False
    if exact_target in text:
        text = text.replace(exact_target, "")
        path.write_text(text, encoding="utf-8")
        changed = True
    elif 'file_record(output / "index.html")' in text:
        raise SystemExit("Unexpected HTML manifest-record form; refusing an ambiguous patch.")

    after = path.read_bytes()
    record = {
        "schema": "qctp-a03-builder-correction-v1",
        "changed": changed,
        "before_sha256": sha256_bytes(before),
        "after_sha256": sha256_bytes(after),
        "correction": "HTML is verified and hashed separately; only audio assets are sent to ffprobe.",
    }
    args.attestation.parent.mkdir(parents=True, exist_ok=True)
    args.attestation.write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(record, indent=2))


if __name__ == "__main__":
    main()
