#!/usr/bin/env python3
"""Verify QCTP A05 GitHub Pages files against the committed machine-verified package."""
from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import time
import urllib.error
import urllib.request
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

OUTPUT_FILE = "QCTP_DAY1_AUDIO_A05_LIVE_DEPLOYMENT_VERIFICATION_REV0_2026-08-20.json"
EXPECTED_FILES = [
    "index.html",
    "sample-a.mp3",
    "sample-b.mp3",
    "sample-c.mp3",
    "manifest.json",
    "machine-verification.json",
    "critical-asr.json",
    "browser-verification.json",
    "gate-summary.json",
    "build-record.json",
]


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: pathlib.Path) -> str:
    return sha256_bytes(path.read_bytes())


def fetch(url: str, timeout: float = 30.0) -> tuple[bytes, dict[str, str], int]:
    request = urllib.request.Request(
        url,
        headers={
            "User-Agent": "QCTP-A05-Live-Verification/1.0",
            "Cache-Control": "no-cache",
            "Pragma": "no-cache",
        },
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read(), dict(response.headers.items()), int(response.status)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=pathlib.Path, default=pathlib.Path("."))
    parser.add_argument("--base-url", default="https://rfrye08-pixel.github.io/QCTP/device-preview/a05/")
    parser.add_argument("--attempts", type=int, default=72)
    parser.add_argument("--delay", type=float, default=5.0)
    args = parser.parse_args()
    root = args.root.resolve()
    local_dir = root / "device-preview/a05"
    expected = {name: sha256_file(local_dir / name) for name in EXPECTED_FILES}

    final_records: dict[str, Any] = {}
    last_errors: list[str] = []
    for attempt in range(1, args.attempts + 1):
        records: dict[str, Any] = {}
        errors: list[str] = []
        for name in EXPECTED_FILES:
            url = args.base_url if name == "index.html" else args.base_url + name
            cache_busted = url + ("?" if "?" not in url else "&") + f"qctp_a05_verify={attempt}"
            try:
                data, headers, status = fetch(cache_busted)
                digest = sha256_bytes(data)
                match = digest == expected[name]
                records[name] = {
                    "status": status,
                    "url": url,
                    "content_type": headers.get("Content-Type"),
                    "content_length_header": headers.get("Content-Length"),
                    "etag": headers.get("ETag"),
                    "last_modified": headers.get("Last-Modified"),
                    "attempt": attempt,
                    "bytes": len(data),
                    "sha256": digest,
                    "expected_sha256": expected[name],
                    "exact_hash_match": match,
                }
                if status != 200:
                    errors.append(f"{name}: HTTP {status}")
                if not match:
                    errors.append(f"{name}: hash mismatch")
                if name == "index.html":
                    page = data.decode("utf-8", errors="replace")
                    for marker in ["VOICE TEST ONLY", "NO MEDITATION", "NO COMPLETION CREDIT", "Sample A", "Sample B", "Sample C"]:
                        if marker not in page:
                            errors.append(f"index.html: missing marker {marker}")
            except (urllib.error.URLError, TimeoutError, OSError) as exc:
                errors.append(f"{name}: fetch error {exc}")
        if not errors:
            final_records = records
            last_errors = []
            break
        last_errors = errors
        print(f"Attempt {attempt}/{args.attempts} not current yet: {'; '.join(errors[:4])}")
        if attempt < args.attempts:
            time.sleep(args.delay)
    if last_errors:
        raise SystemExit("A05 live deployment did not converge: " + "; ".join(last_errors))

    manifest = json.loads((local_dir / "manifest.json").read_text(encoding="utf-8"))
    machine = json.loads((local_dir / "machine-verification.json").read_text(encoding="utf-8"))
    browser = json.loads((local_dir / "browser-verification.json").read_text(encoding="utf-8"))
    gate = json.loads((local_dir / "gate-summary.json").read_text(encoding="utf-8"))
    if machine.get("result") != "PASS" or machine.get("integrated_gate_result") != "PASS":
        raise SystemExit("Local machine record is not PASS")
    if browser.get("result") != "PASS" or gate.get("result") != "PASS":
        raise SystemExit("Local browser or gate record is not PASS")

    verified_at = datetime.now(ZoneInfo("America/Chicago")).isoformat(timespec="seconds")
    record = {
        "schema": "qctp-day1-a05-live-deployment-verification-v1",
        "action_id": "QCTP-D1-AUDIO-A05",
        "result": "PASS",
        "verified_at": verified_at,
        "base_url": args.base_url,
        "transport": "PUBLIC_HTTPS_GITHUB_PAGES",
        "exact_hash_match": "PASS_ALL",
        "exact_hash_file_count": len(EXPECTED_FILES),
        "page_markers": "PASS",
        "manifest": {
            "schema": manifest.get("schema"),
            "status": manifest.get("status"),
            "naturalness": manifest.get("physical_acceptance", {}).get("naturalness"),
        },
        "machine_verification": {
            "schema": machine.get("schema"),
            "result": machine.get("result"),
            "integrated_gate_result": machine.get("integrated_gate_result"),
        },
        "browser_verification": {
            "schema": browser.get("schema"),
            "result": browser.get("result"),
            "cases": browser.get("cases"),
        },
        "gate_summary": {
            "schema": gate.get("schema"),
            "result": gate.get("result"),
        },
        "fetched_files": final_records,
        "physical_voice_naturalness": "OPEN_USER_SELECTION",
        "full_session_rebuild_authority": "WITHHELD",
        "release_authority": "ZERO_RELEASE",
    }
    (root / OUTPUT_FILE).write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "result": "PASS",
        "verified_at": verified_at,
        "exact_hash_match": "PASS_ALL",
        "files": len(EXPECTED_FILES),
        "base_url": args.base_url,
    }, indent=2))


if __name__ == "__main__":
    main()
