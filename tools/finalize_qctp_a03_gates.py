#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import pathlib


def sha256_file(path: pathlib.Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=pathlib.Path, required=True)
    parser.add_argument("--diagnostics", type=pathlib.Path, required=True)
    parser.add_argument("--github-sha", required=True)
    parser.add_argument("--head-sha", required=True)
    parser.add_argument("--build", required=True)
    parser.add_argument("--asr", required=True)
    parser.add_argument("--machine", required=True)
    parser.add_argument("--browser-setup", required=True)
    parser.add_argument("--browser", required=True)
    args = parser.parse_args()

    output = args.output.resolve()
    diagnostics = args.diagnostics.resolve()
    diagnostics.mkdir(parents=True, exist_ok=True)
    outcomes = {
        "build": args.build,
        "critical_asr": args.asr,
        "machine_verification": args.machine,
        "browser_setup": args.browser_setup,
        "chromium_and_webkit": args.browser,
    }
    passed = all(value == "success" for value in outcomes.values())
    inventory = []
    if output.exists():
        for path in sorted(output.glob("*")):
            if path.is_file():
                inventory.append(
                    {
                        "path": path.name,
                        "bytes": path.stat().st_size,
                        "sha256": sha256_file(path),
                    }
                )

    record = {
        "schema": "qctp-a03r-gate-summary-v1",
        "result": "PASS" if passed else "FAIL",
        "github_sha": args.github_sha,
        "pull_request_head_sha": args.head_sha,
        "outcomes": outcomes,
        "top_level_output_inventory": inventory,
        "diagnostics_retained_on_failure": True,
        "publication_permitted": passed,
        "release_authority": "ZERO_RELEASE",
        "physical_iphone_acceptance": "OPEN",
    }
    summary_path = diagnostics / "gate-summary.json"
    summary_path.write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")

    machine_path = output / "machine-verification.json"
    if machine_path.exists():
        machine = json.loads(machine_path.read_text(encoding="utf-8"))
        browser_result = "PASS" if args.browser == "success" else args.browser.upper()
        machine["browser_gate"] = {
            "chromium": browser_result,
            "webkit_iphone_profile": browser_result,
            "candidate_page_http_assets": browser_result,
        }
        machine["integrated_gate_result"] = record["result"]
        machine_path.write_text(json.dumps(machine, indent=2) + "\n", encoding="utf-8")

    print(json.dumps(record, indent=2))


if __name__ == "__main__":
    main()
