#!/usr/bin/env python3
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import os
import pathlib
import urllib.parse
import urllib.request
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

LOCKED_SCRIPT_SHA = "2649ce70e5ab824dbc6b797e07082567fda2443962016e8e6c7dbe454f5ee555"
PUBLIC_URL = "https://rfrye08-pixel.github.io/QCTP/device-preview/a03/"
A03_WORKFLOW = "qctp-a03-build-and-publish-rev1.yml"
CANDIDATE_BRANCH = "qctp-platform-rev2-codex"


def read_json(path: pathlib.Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: pathlib.Path, value: dict[str, Any]) -> None:
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


def sha256_file(path: pathlib.Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def api_get(repository: str, token: str, suffix: str, query: dict[str, str] | None = None) -> Any:
    url = f"https://api.github.com/repos/{repository}/{suffix.lstrip('/')}"
    if query:
        url += "?" + urllib.parse.urlencode(query)
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {token}",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "qctp-a03r-controlled-closeout",
        },
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


def require(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)


def find_evidence(repository: str, token: str, head_sha: str) -> dict[str, Any]:
    runs = api_get(
        repository,
        token,
        f"actions/workflows/{A03_WORKFLOW}/runs",
        {"event": "pull_request", "head_sha": head_sha, "per_page": "20"},
    )["workflow_runs"]
    matching = [run for run in runs if run.get("head_sha") == head_sha]
    require(bool(matching), f"No A03R workflow run found for head {head_sha}")
    run = max(matching, key=lambda record: int(record["id"]))
    run_id = int(run["id"])

    jobs = api_get(repository, token, f"actions/runs/{run_id}/jobs", {"filter": "latest", "per_page": "100"})[
        "jobs"
    ]
    matching_jobs = [job for job in jobs if job.get("name") == "build-verify-publish"]
    require(bool(matching_jobs), f"A03R build-verify-publish job missing for run {run_id}")
    job = max(matching_jobs, key=lambda record: int(record["id"]))

    artifacts = api_get(repository, token, f"actions/runs/{run_id}/artifacts", {"per_page": "100"})["artifacts"]
    diagnostics = next(
        (artifact for artifact in artifacts if artifact["name"].startswith("qctp-a03r-diagnostics-")), None
    )
    verified = next(
        (artifact for artifact in artifacts if artifact["name"].startswith("qctp-a03r-source-grounded-audio-")),
        None,
    )
    require(diagnostics is not None, f"Diagnostic artifact missing for run {run_id}")
    require(verified is not None, f"Verified package artifact missing for run {run_id}")

    candidate = api_get(repository, token, f"branches/{urllib.parse.quote(CANDIDATE_BRANCH, safe='')}")
    return {
        "workflow_run_id": run_id,
        "workflow_run_status_at_closeout": run.get("status"),
        "workflow_run_conclusion_at_closeout": run.get("conclusion"),
        "job_id": int(job["id"]),
        "job_status_at_closeout": job.get("status"),
        "job_conclusion_at_closeout": job.get("conclusion"),
        "diagnostic_artifact": {
            "id": int(diagnostics["id"]),
            "name": diagnostics["name"],
            "size_in_bytes": int(diagnostics["size_in_bytes"]),
            "digest": diagnostics.get("digest"),
            "expires_at": diagnostics.get("expires_at"),
        },
        "verified_package_artifact": {
            "id": int(verified["id"]),
            "name": verified["name"],
            "size_in_bytes": int(verified["size_in_bytes"]),
            "digest": verified.get("digest"),
            "expires_at": verified.get("expires_at"),
        },
        "candidate_branch_head_sha": candidate["commit"]["sha"],
    }


def validate_published_package(root: pathlib.Path) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any], dict[str, str]]:
    package = root / "device-preview" / "a03"
    gate = read_json(package / "gate-summary.json")
    machine = read_json(package / "machine-verification.json")
    manifest = read_json(package / "manifest.json")

    require(gate.get("result") == "PASS", "Published gate summary is not PASS")
    require(gate.get("publication_permitted") is True, "Published gate does not permit publication")
    require(all(value == "success" for value in gate.get("outcomes", {}).values()), "One or more integrated outcomes failed")
    require(machine.get("result") == "PASS", "Published machine verification is not PASS")
    require(machine.get("integrated_gate_result") == "PASS", "Integrated machine gate is not PASS")
    browser = machine.get("browser_gate", {})
    require(browser.get("chromium") == "PASS", "Chromium gate is not PASS")
    require(browser.get("webkit_iphone_profile") == "PASS", "WebKit iPhone-profile gate is not PASS")
    require(browser.get("candidate_page_http_assets") == "PASS", "Candidate asset HTTP gate is not PASS")
    require(manifest.get("script_sha256") == LOCKED_SCRIPT_SHA, "Locked script hash changed")
    require(len(manifest.get("cue_renders", [])) == 35, "Cue count changed")
    require(manifest.get("release_authority") == "ZERO_RELEASE", "Release authority changed")

    required = [
        "index.html",
        "acceptance-ambient.mp3",
        "acceptance-binaural-low-a.mp3",
        "acceptance-minimal.mp3",
        "manifest.json",
        "machine-verification.json",
        "critical-asr.json",
        "gate-summary.json",
    ]
    hashes: dict[str, str] = {}
    for name in required:
        path = package / name
        require(path.exists() and path.stat().st_size > 0, f"Published file missing or empty: {name}")
        hashes[name] = sha256_file(path)
    return gate, machine, manifest, hashes


def build_manifest_rev10(
    rev9: dict[str, Any], timestamp: str, evidence: dict[str, Any], hashes: dict[str, str]
) -> dict[str, Any]:
    manifest = copy.deepcopy(rev9)
    manifest["schema"] = "qctp-macro-deliverable-manifest-v10"
    manifest["manifest_id"] = "QCTP-PLATFORM-REV10-DAY1-A03R-MACHINE-PACKAGE"
    manifest["updated_at"] = timestamp
    manifest["supersedes"] = "QCTP_MACRO_DELIVERABLE_MANIFEST_REV9.json"

    d06 = next(item for item in manifest["deliverables"] if item["id"] == "QCTP-R9-D06")
    d06.update(
        {
            "id": "QCTP-R10-D06",
            "status": "MACHINE_PACKAGE_COMPLETE_PHYSICAL_ACCEPTANCE_OPEN",
            "action_id": "QCTP-D1-AUDIO-A03R",
            "authority_refs": [
                "QCTP_DAY1_AUDIO_A03R_MACHINE_PACKAGE_CLOSEOUT_REV0_2026-08-20.md",
                "device-preview/a03/gate-summary.json",
                "device-preview/a03/machine-verification.json",
                "device-preview/a03/manifest.json",
            ],
            "delivered": [
                "locked 35-cue Chill Brian-style voice stem",
                "Ambient, Binaural Low A, and Minimal Continuity support candidates",
                "HeartMath five-in/five-out breath coaching",
                "predictive pre-cue markers, bed ducking, and fades",
                "continuous 25-minute assets and five-minute acceptance composites",
                "fail-safe diagnostic retention before fail-closed termination",
                "public non-credit five-minute iPhone candidate",
            ],
            "verification": {
                "locked_script_sha256": LOCKED_SCRIPT_SHA,
                "critical_cue_asr": "PASS_4_OF_4_WER_0_0",
                "acoustic_timing_package_gate": "PASS",
                "anti_startle_predictive_marker_gate": "PASS",
                "continuous_support_gate": "PASS",
                "binaural_channel_frequency_gate": "PASS",
                "chromium_playback_gate": "PASS",
                "webkit_iphone_profile_playback_gate": "PASS",
                "workflow_run_id": evidence["workflow_run_id"],
                "job_id": evidence["job_id"],
                "diagnostic_artifact": evidence["diagnostic_artifact"],
                "verified_package_artifact": evidence["verified_package_artifact"],
                "public_candidate_url": PUBLIC_URL,
                "published_file_sha256": hashes,
            },
            "physical_iphone_acceptance": "OPEN",
            "authority": "MACHINE_VERIFIED_TEST_PACKAGE_DELIVERED_ZERO_RELEASE",
        }
    )
    for item in manifest["deliverables"]:
        if item["id"].startswith("QCTP-R9-"):
            item["id"] = item["id"].replace("QCTP-R9-", "QCTP-R10-", 1)

    manifest["current_macro_delta"] = (
        "QCTP-D1-AUDIO-A03R is machine-complete. The exact locked 35-cue script was rendered into a "
        "25-minute voice stem plus continuous Ambient, Binaural Low A, and Minimal support candidates; four "
        "critical cues achieved normalized ASR WER 0.0; acoustic, timing, continuity, predictive-marker, binaural, "
        "Chromium, and WebKit iPhone-profile gates passed; diagnostics are retained before fail-closed termination; "
        "and a public five-minute non-credit candidate is delivered. Physical iPhone content acceptance remains open."
    )
    manifest["next_controlled_action"] = (
        "Execute QCTP-D1-AUDIO-A04: perform one five-minute physical iPhone Safari acceptance test with stereo "
        "headphones, starting with Binaural Low A, and record startle, voice, breathing, support-bed, marker, and return observations."
    )
    manifest["release_authority"] = "ZERO_RELEASE"
    return manifest


def update_current_state(
    state: dict[str, Any], timestamp: str, evidence: dict[str, Any], hashes: dict[str, str]
) -> dict[str, Any]:
    require(state.get("schema") == "qctp-current-state-v16", "Unexpected current-state schema")
    state = copy.deepcopy(state)
    state["schema"] = "qctp-current-state-v17"
    state["updated_at"] = timestamp
    state["supersedes"] = "qctp-current-state-v16"
    state["authority_refs"]["macro_deliverable_manifest"] = "QCTP_MACRO_DELIVERABLE_MANIFEST_REV10.json"
    state["authority_refs"][
        "day1_audio_a03r_closeout"
    ] = "QCTP_DAY1_AUDIO_A03R_MACHINE_PACKAGE_CLOSEOUT_REV0_2026-08-20.md"
    state["rev2_candidate"]["observed_head_sha"] = evidence["candidate_branch_head_sha"]
    state["rev2_candidate"][
        "guidance_disposition"
    ] = "SOURCE_GROUNDED_MACHINE_PACKAGE_DELIVERED_PHYSICAL_ACCEPTANCE_OPEN"

    state["day1_audio_action_a03r"] = {
        "action_id": "QCTP-D1-AUDIO-A03R",
        "status": "MACHINE_PACKAGE_COMPLETE_PHYSICAL_ACCEPTANCE_OPEN",
        "result": "SOURCE_GROUNDED_AUDIO_AND_FIVE_MINUTE_DEVICE_CANDIDATE_DELIVERED",
        "script_sha256": LOCKED_SCRIPT_SHA,
        "duration_seconds": 1500,
        "cue_count": 35,
        "support_candidates": ["AMBIENT", "BINAURAL_LOW_A", "MINIMAL_CONTINUITY"],
        "public_candidate_url": PUBLIC_URL,
        "verification": {
            "critical_cue_asr": "PASS_4_OF_4_WER_0_0",
            "machine_gate": "PASS",
            "chromium": "PASS",
            "webkit_iphone_profile": "PASS",
            "diagnostic_retention_on_failure": "PASS",
            "workflow_run_id": evidence["workflow_run_id"],
            "job_id": evidence["job_id"],
            "diagnostic_artifact": evidence["diagnostic_artifact"],
            "verified_package_artifact": evidence["verified_package_artifact"],
            "published_file_sha256": hashes,
            "evidence_class": "CALCULATED_AND_MACHINE_VERIFIED",
        },
        "physical_iphone_acceptance": "OPEN",
        "release_authority": "ZERO_RELEASE",
    }
    state["active_action"] = {
        "action_id": "QCTP-D1-AUDIO-A04",
        "status": "USER_LAST_MILE_PHYSICAL_ACCEPTANCE_REQUIRED",
        "objective": (
            "Run one five-minute Safari acceptance test with stereo headphones, beginning with Binaural Low A, "
            "and capture startle, voice, five/five breathing, support, marker, and return observations."
        ),
        "candidate_url": PUBLIC_URL,
        "predecessor": "QCTP-D1-AUDIO-A03R",
        "user_action_required_now": True,
    }

    remaining = [
        item
        for item in state.get("open_implementation_packages", [])
        if not item.startswith("QCTP-D1-AUDIO-A03")
    ]
    remaining.insert(0, "QCTP-D1-AUDIO-A04 five-minute physical iPhone acceptance")
    state["open_implementation_packages"] = remaining

    completed_holds = {
        "Render exact locked script with transcript/audio verification",
        "Generate and measure continuous Ambient, Binaural Low A, and Minimal Continuity support candidates",
        "Integrate continuous dual-stem player and composite fallback",
        "Pass automated acoustic, timing, local/offline, WebKit, synchronization, and fail-closed gates",
    }
    state["release_acceptance_holds"] = [
        hold for hold in state.get("release_acceptance_holds", []) if hold not in completed_holds
    ]
    state["release_authority"]["voice_and_support_audio"] = "MACHINE_VERIFIED_TEST_PACKAGE_DELIVERED"
    state["release_authority"]["physical_content_acceptance"] = "OPEN_A04_REQUIRED"
    state["controlled_interpretation"] = (
        "QCTP-D1-AUDIO-A03R is machine-complete and delivered as a non-credit five-minute device candidate. The "
        "locked 35-cue script hash is unchanged; 25-minute voice/support assets and three five-minute composites exist; "
        "four critical cues passed normalized ASR at WER 0.0; acoustic, timing, continuous-support, anti-startle marker, "
        "binaural, Chromium, and WebKit iPhone-profile gates passed. This grants test-candidate authority only. Physical "
        "iPhone content acceptance, private-runtime installation, Rev2 merge, and public release remain unauthorized."
    )
    state["next_controlled_action"] = (
        "Execute QCTP-D1-AUDIO-A04: Ryan opens the delivered five-minute candidate in iPhone Safari with stereo "
        "headphones, selects Binaural Low A, completes only that five-minute test, and reports the six controlled observations."
    )
    return state


def build_closeout(
    timestamp: str,
    evidence: dict[str, Any],
    gate: dict[str, Any],
    machine: dict[str, Any],
    hashes: dict[str, str],
) -> str:
    lines = [
        "# QCTP-D1-AUDIO-A03R Machine Package Closeout — Rev0",
        "",
        f"Controlled closeout time: `{timestamp}`",
        "",
        "## Result",
        "",
        "**MACHINE PACKAGE COMPLETE / PHYSICAL IPHONE ACCEPTANCE OPEN.**",
        "",
        "The locked 35-cue Day 1 script was rendered, integrated with continuous anti-startle support, verified, retained, and published as a five-minute non-credit device candidate.",
        "",
        "## Delivered",
        "",
        f"- Public five-minute candidate: {PUBLIC_URL}",
        "- 25-minute voice stem and Ambient, Binaural Low A, and Minimal Continuity support stems.",
        "- Three five-minute acceptance composites.",
        "- Continuous support, predictive markers, bed ducking, fades, source map, and no-completion-credit guard.",
        "- Diagnostic artifact retained before the fail-closed publication gate.",
        "",
        "## Verified",
        "",
        f"- Locked script SHA-256: `{LOCKED_SCRIPT_SHA}`",
        "- Critical-cue ASR: `PASS`, four of four cues, normalized WER `0.0`.",
        "- Acoustic/timing/package gate: `PASS`.",
        "- Continuous-support and clipping gates: `PASS`.",
        "- Predictive pre-cue marker gate: `PASS`.",
        "- Binaural left/right frequency-separation gate: `PASS`.",
        "- Chromium playback/asset gate: `PASS`.",
        "- WebKit iPhone-profile playback/asset gate: `PASS`.",
        f"- Workflow run ID: `{evidence['workflow_run_id']}`; job ID: `{evidence['job_id']}`.",
        f"- Diagnostic artifact ID: `{evidence['diagnostic_artifact']['id']}`; digest: `{evidence['diagnostic_artifact'].get('digest')}`.",
        f"- Verified package artifact ID: `{evidence['verified_package_artifact']['id']}`; digest: `{evidence['verified_package_artifact'].get('digest')}`.",
        f"- Gate-summary schema/result: `{gate.get('schema')}` / `{gate.get('result')}`.",
        f"- Machine schema/result: `{machine.get('schema')}` / `{machine.get('result')}`.",
        "",
        "## Published file SHA-256",
        "",
    ]
    lines.extend(f"- `{name}`: `{digest}`" for name, digest in sorted(hashes.items()))
    lines.extend(
        [
            "",
            "## State change",
            "",
            "`QCTP_CURRENT_STATE.json` advanced from v16 to v17. `QCTP_MACRO_DELIVERABLE_MANIFEST_REV10.json` supersedes Rev9. A03R is closed at machine-package level; A04 is active.",
            "",
            "## Macro-deliverable delta",
            "",
            "QCTP-R10-D06 advanced from OPEN to MACHINE_PACKAGE_COMPLETE_PHYSICAL_ACCEPTANCE_OPEN. The remaining D06 blocker is the physical iPhone content-acceptance test.",
            "",
            "## Release authority",
            "",
            "- Test candidate: `AUTHORIZED`.",
            "- Physical iPhone content acceptance: `OPEN`.",
            "- Private-runtime installation: `NOT AUTHORIZED`.",
            "- Rev2 merge/public release: `ZERO_RELEASE`.",
            "",
            "## Next controlled action",
            "",
            "`QCTP-D1-AUDIO-A04` — Perform one five-minute physical iPhone Safari acceptance test with stereo headphones, starting with Binaural Low A, then report startle, voice, breathing, support-bed, marker, and return observations.",
            "",
        ]
    )
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=pathlib.Path, default=pathlib.Path("."))
    parser.add_argument("--repository", default=os.environ.get("GITHUB_REPOSITORY"))
    parser.add_argument("--token", default=os.environ.get("GITHUB_TOKEN"))
    args = parser.parse_args()

    root = args.root.resolve()
    require(bool(args.repository), "Repository is required")
    require(bool(args.token), "GitHub token is required")

    state_path = root / "QCTP_CURRENT_STATE.json"
    rev9_path = root / "QCTP_MACRO_DELIVERABLE_MANIFEST_REV9.json"
    rev10_path = root / "QCTP_MACRO_DELIVERABLE_MANIFEST_REV10.json"
    closeout_path = root / "QCTP_DAY1_AUDIO_A03R_MACHINE_PACKAGE_CLOSEOUT_REV0_2026-08-20.md"

    existing_state = read_json(state_path)
    if existing_state.get("schema") == "qctp-current-state-v17" and rev10_path.exists() and closeout_path.exists():
        print("A03R controlled closeout already exists; no mutation required.")
        return

    gate, machine, package_manifest, hashes = validate_published_package(root)
    head_sha = str(gate["pull_request_head_sha"])
    evidence = find_evidence(str(args.repository), str(args.token), head_sha)
    timestamp = datetime.now(ZoneInfo("America/Chicago")).replace(microsecond=0).isoformat()

    current = update_current_state(existing_state, timestamp, evidence, hashes)
    rev10 = build_manifest_rev10(read_json(rev9_path), timestamp, evidence, hashes)
    closeout = build_closeout(timestamp, evidence, gate, machine, hashes)

    write_json(state_path, current)
    write_json(rev10_path, rev10)
    closeout_path.write_text(closeout, encoding="utf-8")

    # Final local consistency checks before the workflow commits controlled state.
    require(read_json(state_path)["schema"] == "qctp-current-state-v17", "Current-state persistence failed")
    require(read_json(rev10_path)["schema"] == "qctp-macro-deliverable-manifest-v10", "Manifest persistence failed")
    require("QCTP-D1-AUDIO-A04" in closeout_path.read_text(encoding="utf-8"), "Closeout next action missing")
    print(json.dumps({"result": "PASS", "timestamp": timestamp, "evidence": evidence}, indent=2))


if __name__ == "__main__":
    main()
