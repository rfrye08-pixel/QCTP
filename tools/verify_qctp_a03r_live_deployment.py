#!/usr/bin/env python3
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import pathlib
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

BASE_URL = "https://rfrye08-pixel.github.io/QCTP/device-preview/a03/"
EVIDENCE_FILE = "QCTP_DAY1_AUDIO_A03R_LIVE_DEPLOYMENT_VERIFICATION_REV0_2026-08-20.json"
FILES = [
    "index.html",
    "acceptance-ambient.mp3",
    "acceptance-binaural-low-a.mp3",
    "acceptance-minimal.mp3",
    "manifest.json",
    "machine-verification.json",
    "critical-asr.json",
    "gate-summary.json",
]


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def read_json(path: pathlib.Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: pathlib.Path, value: dict[str, Any]) -> None:
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


def require(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)


def fetch(url: str, attempts: int, delay_seconds: float) -> tuple[bytes, dict[str, Any]]:
    last_error: Exception | None = None
    for attempt in range(1, attempts + 1):
        try:
            request = urllib.request.Request(
                url,
                headers={
                    "User-Agent": "QCTP-A03R-live-deployment-verifier/1.0",
                    "Cache-Control": "no-cache",
                    "Pragma": "no-cache",
                },
            )
            with urllib.request.urlopen(request, timeout=45) as response:
                data = response.read()
                metadata = {
                    "status": int(response.status),
                    "url": response.geturl(),
                    "content_type": response.headers.get("Content-Type"),
                    "content_length_header": response.headers.get("Content-Length"),
                    "etag": response.headers.get("ETag"),
                    "last_modified": response.headers.get("Last-Modified"),
                    "attempt": attempt,
                }
                if response.status == 200 and data:
                    return data, metadata
                last_error = RuntimeError(f"HTTP {response.status} or empty response")
        except Exception as exc:  # network and propagation errors are retried together
            last_error = exc
        if attempt < attempts:
            time.sleep(delay_seconds)
    raise RuntimeError(f"Unable to fetch {url} after {attempts} attempts: {last_error}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=pathlib.Path, default=pathlib.Path("."))
    parser.add_argument("--attempts", type=int, default=60)
    parser.add_argument("--delay-seconds", type=float, default=5.0)
    args = parser.parse_args()

    root = args.root.resolve()
    state_path = root / "QCTP_CURRENT_STATE.json"
    rev10_path = root / "QCTP_MACRO_DELIVERABLE_MANIFEST_REV10.json"
    rev11_path = root / "QCTP_MACRO_DELIVERABLE_MANIFEST_REV11.json"
    evidence_path = root / EVIDENCE_FILE

    state = read_json(state_path)
    if state.get("schema") == "qctp-current-state-v18" and rev11_path.exists() and evidence_path.exists():
        print("A03R live deployment already verified and persisted.")
        return

    require(state.get("schema") == "qctp-current-state-v17", "Unexpected current-state schema")
    a03 = state.get("day1_audio_action_a03r", {})
    expected_hashes = a03.get("verification", {}).get("published_file_sha256", {})
    require(set(FILES) <= set(expected_hashes), "Controlled state lacks expected published hashes")

    fetched: dict[str, Any] = {}
    payloads: dict[str, bytes] = {}
    for name in FILES:
        url = BASE_URL if name == "index.html" else urllib.parse.urljoin(BASE_URL, name)
        data, metadata = fetch(url, args.attempts, args.delay_seconds)
        digest = sha256_bytes(data)
        expected = expected_hashes[name]
        require(digest == expected, f"Live hash mismatch for {name}: {digest} != {expected}")
        payloads[name] = data
        fetched[name] = {
            **metadata,
            "bytes": len(data),
            "sha256": digest,
            "expected_sha256": expected,
            "exact_hash_match": True,
        }
        print(f"{name}: HTTP {metadata['status']} exact hash PASS")

    html = payloads["index.html"].decode("utf-8")
    for marker in [
        "TEST — NO COMPLETION CREDIT",
        "Bullard",
        "HeartMath",
        "Dispenza",
        "Binaural Low A",
        "Begin five-minute test",
    ]:
        require(marker in html, f"Live page marker missing: {marker}")

    gate = json.loads(payloads["gate-summary.json"])
    machine = json.loads(payloads["machine-verification.json"])
    manifest = json.loads(payloads["manifest.json"])
    critical_asr = json.loads(payloads["critical-asr.json"])
    require(gate.get("result") == "PASS" and gate.get("publication_permitted") is True, "Live gate summary failed")
    require(machine.get("result") == "PASS", "Live machine verification failed")
    require(machine.get("integrated_gate_result") == "PASS", "Live integrated gate failed")
    require(machine.get("browser_gate", {}).get("chromium") == "PASS", "Live Chromium record failed")
    require(
        machine.get("browser_gate", {}).get("webkit_iphone_profile") == "PASS",
        "Live WebKit iPhone-profile record failed",
    )
    require(manifest.get("script_sha256") == a03.get("script_sha256"), "Live locked script hash changed")
    require(len(critical_asr) == 4, "Live critical ASR record count changed")

    timestamp = datetime.now(ZoneInfo("America/Chicago")).replace(microsecond=0).isoformat()
    evidence = {
        "schema": "qctp-day1-a03r-live-deployment-verification-v1",
        "action_id": "QCTP-D1-AUDIO-A03R",
        "result": "PASS",
        "verified_at": timestamp,
        "base_url": BASE_URL,
        "transport": "PUBLIC_HTTPS_GITHUB_PAGES",
        "exact_hash_match_to_machine_verified_publication": "PASS_8_OF_8",
        "page_markers": "PASS",
        "gate_summary": {"schema": gate.get("schema"), "result": gate.get("result")},
        "machine_verification": {
            "schema": machine.get("schema"),
            "result": machine.get("result"),
            "integrated_gate_result": machine.get("integrated_gate_result"),
            "browser_gate": machine.get("browser_gate"),
        },
        "fetched_files": fetched,
        "physical_iphone_acceptance": "OPEN",
        "release_authority": "ZERO_RELEASE",
    }
    write_json(evidence_path, evidence)

    updated_state = copy.deepcopy(state)
    updated_state["schema"] = "qctp-current-state-v18"
    updated_state["updated_at"] = timestamp
    updated_state["supersedes"] = "qctp-current-state-v17"
    updated_state["authority_refs"]["macro_deliverable_manifest"] = "QCTP_MACRO_DELIVERABLE_MANIFEST_REV11.json"
    updated_state["authority_refs"]["day1_audio_a03r_live_deployment"] = EVIDENCE_FILE
    updated_state["day1_audio_action_a03r"]["verification"]["live_https_deployment"] = {
        "result": "PASS",
        "verified_at": timestamp,
        "evidence_ref": EVIDENCE_FILE,
        "exact_hash_match": "PASS_8_OF_8",
        "base_url": BASE_URL,
    }
    updated_state["controlled_interpretation"] = (
        state["controlled_interpretation"]
        + " The public HTTPS deployment was then fetched independently and matched all eight machine-verified published-file hashes exactly."
    )
    write_json(state_path, updated_state)

    rev11 = copy.deepcopy(read_json(rev10_path))
    rev11["schema"] = "qctp-macro-deliverable-manifest-v11"
    rev11["manifest_id"] = "QCTP-PLATFORM-REV11-DAY1-A03R-LIVE-DEPLOYMENT-VERIFIED"
    rev11["updated_at"] = timestamp
    rev11["supersedes"] = "QCTP_MACRO_DELIVERABLE_MANIFEST_REV10.json"
    for item in rev11["deliverables"]:
        if item["id"].startswith("QCTP-R10-"):
            item["id"] = item["id"].replace("QCTP-R10-", "QCTP-R11-", 1)
    d06 = next(item for item in rev11["deliverables"] if item["id"] == "QCTP-R11-D06")
    if EVIDENCE_FILE not in d06["authority_refs"]:
        d06["authority_refs"].append(EVIDENCE_FILE)
    d06["verification"]["live_https_exact_hash_deployment_gate"] = "PASS_8_OF_8"
    d06["verification"]["live_deployment_verified_at"] = timestamp
    rev11["current_macro_delta"] = (
        rev11["current_macro_delta"]
        + " The public GitHub Pages deployment was independently fetched over HTTPS and all eight files matched their controlled SHA-256 values exactly."
    )
    write_json(rev11_path, rev11)

    require(read_json(state_path)["schema"] == "qctp-current-state-v18", "Current-state live persistence failed")
    require(read_json(rev11_path)["schema"] == "qctp-macro-deliverable-manifest-v11", "Manifest live persistence failed")
    print(json.dumps(evidence, indent=2))


if __name__ == "__main__":
    main()
