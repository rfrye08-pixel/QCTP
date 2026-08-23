#!/usr/bin/env python3
"""Finalize machine/browser evidence while leaving human naturalness open."""
from __future__ import annotations

import argparse
import hashlib
import json
import pathlib


def sha256_file(path: pathlib.Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=pathlib.Path, required=True)
    args = parser.parse_args()
    output = args.output.resolve()
    machine_path = output / "machine-verification.json"
    browser_path = output / "browser-verification.json"
    grounding_path = output / "cue-grounding.json"
    manifest_path = output / "manifest.json"
    build_record_path = output / "build-record.json"
    machine = json.loads(machine_path.read_text(encoding="utf-8"))
    browser = json.loads(browser_path.read_text(encoding="utf-8"))
    grounding = json.loads(grounding_path.read_text(encoding="utf-8"))
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    build_record = json.loads(build_record_path.read_text(encoding="utf-8"))
    errors: list[str] = []
    if machine.get("result") != "PASS":
        errors.append("machine verification is not PASS")
    if browser.get("result") != "PASS":
        errors.append("browser verification is not PASS")
    if grounding.get("result") != "PASS":
        errors.append("Day 1 cue grounding is not PASS")
    if grounding.get("release_authority") != "ZERO_RELEASE":
        errors.append("Day 1 cue-grounding release authority changed")
    manifest_sha256 = sha256_file(manifest_path)
    build_record_sha256 = sha256_file(build_record_path)
    if build_record.get("result") != "PASS" or build_record.get("release_authority") != "ZERO_RELEASE":
        errors.append("build record is not a ZERO_RELEASE PASS")
    if build_record.get("manifest_sha256") != manifest_sha256:
        errors.append("build record does not bind the current manifest")
    if machine.get("manifest_sha256") != manifest_sha256:
        errors.append("machine evidence does not bind the current manifest")
    if browser.get("manifest_sha256") != manifest_sha256:
        errors.append("browser evidence does not bind the current manifest")
    if machine.get("build_record_sha256") != build_record_sha256:
        errors.append("machine evidence does not bind the current build record")
    if browser.get("build_record_sha256") != build_record_sha256:
        errors.append("browser evidence does not bind the current build record")
    if machine.get("private_route_assignment_sha256") != manifest.get("route_assignment", {}).get("commitment_sha256"):
        errors.append("machine/private mapping commitment differs from the manifest")
    if machine.get("public_route_assignment_absent") is not True or browser.get("public_route_assignment_absent") is not True:
        errors.append("public route-assignment absence was not verified")
    for case_name in ("chromium-desktop", "webkit-iphone"):
        case = browser.get("cases", {}).get(case_name, {})
        if case.get("blind_mapping_preserved_after_selection") is not True:
            errors.append(f"{case_name} did not preserve blindness after selection")
        if case.get("local_selection_persisted_after_reload") is not True:
            errors.append(f"{case_name} did not persist selection across reload")
    offline_case = browser.get("cases", {}).get("chromium-offline", {})
    if offline_case.get("normal_workbox_caches_preserved") is not True:
        errors.append("audition activation did not prove normal Workbox cache preservation")
    if manifest.get("physical_gate", {}).get("full_25_minute_render_authorized") is not False:
        errors.append("full render authority was not withheld")
    record = {
        "schema": "qctp-rev3-blind-natural-voice-gate-summary-v1",
        "result": "PASS" if not errors else "FAIL",
        "machine_verification": {"result": machine.get("result"), "sha256": sha256_file(machine_path)},
        "browser_verification": {"result": browser.get("result"), "sha256": sha256_file(browser_path)},
        "build_record": {"result": build_record.get("result"), "sha256": build_record_sha256},
        "cue_grounding": {
            "result": grounding.get("result"),
            "sha256": sha256_file(grounding_path),
            "day1_authority_commit_sha": grounding.get("authority", {}).get("resolved_commit_sha"),
        },
        "manifest_sha256": manifest_sha256,
        "integrity_chain": "PASS" if not errors else "FAIL",
        "physical_naturalness": "OPEN_RYAN_IPHONE_SELECTION",
        "valid_physical_choices": ["A", "B", "C", "NONE"],
        "five_minute_render_authority": "WITHHELD",
        "twenty_five_minute_render_authority": "WITHHELD",
        "release_authority": "ZERO_RELEASE",
        "errors": errors,
    }
    (output / "gate-summary.json").write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(record, indent=2))
    if errors:
        raise SystemExit("Rev3 voice-audition gate failed")


if __name__ == "__main__":
    main()
