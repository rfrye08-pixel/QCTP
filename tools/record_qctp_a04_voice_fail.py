#!/usr/bin/env python3
"""Persist the QCTP A04 physical voice-naturalness failure and activate A05 recovery."""
from __future__ import annotations

import argparse
import copy
import json
import pathlib
import statistics
from typing import Any

STATE_V18 = "qctp-current-state-v18"
STATE_V19 = "qctp-current-state-v19"
MANIFEST_V11 = "qctp-macro-deliverable-manifest-v11"
MANIFEST_V12 = "qctp-macro-deliverable-manifest-v12"
OBSERVATION_FILE = "QCTP_DAY1_AUDIO_A04_PHYSICAL_IPHONE_VOICE_OBSERVATION_REV0_2026-08-20.json"
CLOSEOUT_FILE = "QCTP_DAY1_AUDIO_A04_PHYSICAL_ACCEPTANCE_CLOSEOUT_REV0_2026-08-20.md"
LESSONS_FILE = "QCTP_AUDIO_FAILURE_AND_LESSONS_REGISTER_REV0.json"
REV12_FILE = "QCTP_MACRO_DELIVERABLE_MANIFEST_REV12.json"


def load_json(path: pathlib.Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: pathlib.Path, value: dict[str, Any]) -> None:
    path.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")


def require(condition: bool, message: str) -> None:
    if not condition:
        raise RuntimeError(message)


def replace_package(items: list[str], old_prefix: str, new_value: str) -> list[str]:
    result: list[str] = []
    replaced = False
    for item in items:
        if item.startswith(old_prefix):
            if not replaced:
                result.append(new_value)
                replaced = True
        else:
            result.append(item)
    if not replaced:
        result.insert(0, new_value)
    return result


def calculate_stretch_evidence(root: pathlib.Path) -> dict[str, Any]:
    manifest_path = root / "device-preview/a03/manifest.json"
    builder_path = root / "tools/build_qctp_a03_audio.py"
    manifest = load_json(manifest_path)
    renders = manifest.get("cue_renders", [])
    ratios: list[float] = []
    for render in renders:
        raw = float(render["raw_generated_duration_seconds"])
        target = float(render["target_duration_seconds"])
        require(raw > 0.0, f"Invalid raw duration for {render.get('cue_id')}")
        ratios.append(target / raw)
    require(len(ratios) == 35, f"Expected 35 cue stretch ratios, found {len(ratios)}")
    builder = builder_path.read_text(encoding="utf-8")
    require('nano=True' in builder, "A03 Nano engine call not found")
    require('stretch_to_duration(raw, target_duration)' in builder, "A03 time-stretch call not found")
    return {
        "evidence_class": "CALCULATED_FROM_PUBLISHED_MANIFEST_AND_IMPLEMENTATION",
        "cue_count": len(ratios),
        "minimum_target_to_raw_duration_ratio": min(ratios),
        "mean_target_to_raw_duration_ratio": statistics.mean(ratios),
        "median_target_to_raw_duration_ratio": statistics.median(ratios),
        "maximum_target_to_raw_duration_ratio": max(ratios),
        "implementation_observations": [
            "A03 used Chatterbox Nano, the resource-constrained model variant.",
            "Every generated cue was spectrally time-stretched to its estimated script duration.",
        ],
        "causal_disposition": "LIKELY_CONTRIBUTOR_NOT_YET_EXPERIMENTALLY_ISOLATED",
    }


def build_closeout(observation: dict[str, Any], evidence: dict[str, Any]) -> str:
    return f"""# QCTP-D1-AUDIO-A04 Physical Acceptance Closeout — Rev0

Controlled observation time: `{observation['observed_at']}`

## Result

**FAIL — VOICE NATURALNESS. STOPPED EARLY.**

Ryan reported that the A03R candidate voice sounded robotic during the physical iPhone acceptance test. This single release-critical failure is sufficient to reject the voice render; completion of the remaining A04 observations is not required against the rejected candidate.

## Evidence

- Evidence class: `{observation['evidence_class']}`.
- User wording: `{observation['observation_verbatim']}`
- Voice naturalness: `FAIL_ROBOTIC`.
- Test completion: `STOPPED_OR_CLOSEOUT_AUTHORIZED_AFTER_EARLY_FAIL`.
- No state-attainment or completion credit is granted.

## Calculated implementation evidence

- Rendered cue count: `{evidence['cue_count']}`.
- Minimum target/raw duration ratio: `{evidence['minimum_target_to_raw_duration_ratio']:.3f}x`.
- Mean target/raw duration ratio: `{evidence['mean_target_to_raw_duration_ratio']:.3f}x`.
- Median target/raw duration ratio: `{evidence['median_target_to_raw_duration_ratio']:.3f}x`.
- Maximum target/raw duration ratio: `{evidence['maximum_target_to_raw_duration_ratio']:.3f}x`.
- The A03 implementation used Chatterbox Nano and then time-stretched every generated cue to the scripted estimate.
- Disposition: `LIKELY CAUSAL CONTRIBUTOR`, not experimentally proven as the only cause.

## Corrective controls

1. Do not rebuild the full 25-minute session before voice naturalness passes a short physical audition.
2. Compare the current local engine without wide time-stretch against the higher-quality full Turbo engine.
3. Achieve meditative pacing by sentence/clause composition and real silence, not broad spectral time-stretch.
4. Prohibit time-stretch outside `0.95x–1.05x` without a separately accepted physical artifact.
5. Machine intelligibility and browser PASS may never be promoted to human voice-naturalness PASS.

## State change

A04 is closed `FAIL_VOICE_NATURALNESS`. A05 is active to render and deliver a blind, voice-only naturalness audition before any full-session rebuild.

## Release authority

- A03R technical package: preserved as machine evidence only.
- A03R physical voice acceptance: `FAIL`.
- A05 voice audition work: `AUTHORIZED`.
- Private-runtime installation, Rev2 merge, and release: `ZERO_RELEASE`.

## Next controlled action

`QCTP-D1-AUDIO-A05` — Render technically controlled, same-script voice samples that isolate Nano/no-stretch, Turbo/no-stretch, and Turbo/pause-composed delivery; publish a short iPhone audition; require Ryan to select or reject the least robotic sample before rebuilding Day 1.
"""


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", type=pathlib.Path, default=pathlib.Path("."))
    args = parser.parse_args()
    root = args.root.resolve()

    observation_path = root / OBSERVATION_FILE
    require(observation_path.exists(), f"Missing {OBSERVATION_FILE}")
    observation = load_json(observation_path)
    require(observation.get("action_id") == "QCTP-D1-AUDIO-A04", "Observation action mismatch")
    require(observation.get("voice_naturalness") == "FAIL_ROBOTIC", "Observation does not close voice naturalness")

    state_path = root / "QCTP_CURRENT_STATE.json"
    state = load_json(state_path)
    if state.get("schema") == STATE_V19:
        require(state.get("active_action", {}).get("action_id") == "QCTP-D1-AUDIO-A05", "Existing v19 state is inconsistent")
        print("A04 voice failure already persisted in state v19.")
        return
    require(state.get("schema") == STATE_V18, f"Expected {STATE_V18}, found {state.get('schema')}")
    require(state.get("active_action", {}).get("action_id") == "QCTP-D1-AUDIO-A04", "A04 is not active")

    evidence = calculate_stretch_evidence(root)

    manifest11_path = root / "QCTP_MACRO_DELIVERABLE_MANIFEST_REV11.json"
    manifest11 = load_json(manifest11_path)
    require(manifest11.get("schema") == MANIFEST_V11, "Rev11 manifest authority mismatch")
    manifest12 = copy.deepcopy(manifest11)
    manifest12["schema"] = MANIFEST_V12
    manifest12["manifest_id"] = "QCTP-PLATFORM-REV12-DAY1-A04-VOICE-NATURALNESS-FAIL"
    manifest12["updated_at"] = observation["observed_at"]
    manifest12["supersedes"] = "QCTP_MACRO_DELIVERABLE_MANIFEST_REV11.json"
    for deliverable in manifest12.get("deliverables", []):
        did = deliverable.get("id", "")
        if did.startswith("QCTP-R11-"):
            deliverable["id"] = did.replace("QCTP-R11-", "QCTP-R12-", 1)
        if deliverable.get("name") == "Day 1 source-grounded voice, support audio, continuous player, and five-minute acceptance":
            deliverable["status"] = "PHYSICAL_ACCEPTANCE_FAIL_VOICE_NATURALNESS"
            deliverable["physical_iphone_acceptance"] = "FAIL_VOICE_NATURALNESS"
            deliverable["physical_evidence_ref"] = OBSERVATION_FILE
            deliverable["a04_closeout_ref"] = CLOSEOUT_FILE
            deliverable["calculated_root_cause_evidence"] = evidence
    manifest12["current_macro_delta"] = (
        "QCTP-D1-AUDIO-A04 produced a release-critical physical voice-naturalness failure: Ryan reported that "
        "the A03R voice sounded robotic. The remaining A04 observations are not required against a rejected voice. "
        "Calculated evidence shows broad cue time-stretching (median approximately 1.71x; maximum approximately 2.32x) "
        "after Chatterbox Nano generation. This is controlled as a likely contributor, not a proven sole cause."
    )
    manifest12["release_authority"] = "ZERO_RELEASE"
    manifest12["next_controlled_action"] = (
        "Execute QCTP-D1-AUDIO-A05: render and publish a short blind voice-naturalness audition comparing "
        "Nano without time-stretch, full Turbo without time-stretch, and full Turbo with pause-composed pacing."
    )
    write_json(root / REV12_FILE, manifest12)

    state["schema"] = STATE_V19
    state["updated_at"] = observation["observed_at"]
    state["supersedes"] = STATE_V18
    state["authority_refs"]["macro_deliverable_manifest"] = REV12_FILE
    state["authority_refs"]["day1_audio_a04_voice_observation"] = OBSERVATION_FILE
    state["authority_refs"]["day1_audio_a04_closeout"] = CLOSEOUT_FILE
    state["authority_refs"]["audio_failure_lessons"] = LESSONS_FILE
    state["active_action"] = {
        "action_id": "QCTP-D1-AUDIO-A05",
        "status": "EXECUTION_AUTHORIZED",
        "objective": (
            "Recover human-sounding narration without altering the locked script by isolating model quality and "
            "time-stretch artifacts in a short physical iPhone voice audition."
        ),
        "candidate_url": "https://rfrye08-pixel.github.io/QCTP/device-preview/a05/",
        "predecessor": "QCTP-D1-AUDIO-A04",
        "user_action_required_now": False,
    }
    state["open_implementation_packages"] = replace_package(
        state.get("open_implementation_packages", []),
        "QCTP-D1-AUDIO-A04",
        "QCTP-D1-AUDIO-A05 voice-naturalness recovery and short physical audition",
    )
    holds = state.get("release_acceptance_holds", [])
    voice_hold = "Pass a short physical iPhone voice-naturalness audition before any full Day 1 rebuild"
    if voice_hold not in holds:
        holds.insert(0, voice_hold)
    state["release_acceptance_holds"] = holds
    state["release_authority"]["voice_and_support_audio"] = "MACHINE_VERIFIED_TECHNICAL_PACKAGE_PHYSICAL_VOICE_FAIL"
    state["release_authority"]["physical_content_acceptance"] = "FAIL_A04_VOICE_NATURALNESS"
    state["day1_audio_action_a04"] = {
        "action_id": "QCTP-D1-AUDIO-A04",
        "status": "CLOSED_FAIL_VOICE_NATURALNESS",
        "result": "PHYSICAL_IPHONE_VOICE_REJECTED_AS_ROBOTIC",
        "evidence_class": observation["evidence_class"],
        "observation_verbatim": observation["observation_verbatim"],
        "voice_naturalness": observation["voice_naturalness"],
        "remaining_observations": "NOT_REQUIRED_AFTER_RELEASE_CRITICAL_EARLY_FAIL",
        "calculated_implementation_evidence": evidence,
        "release_effect": "A03R_VOICE_REJECTED_NO_INSTALL_NO_FULL_RETEST",
        "evidence_ref": OBSERVATION_FILE,
        "closeout_ref": CLOSEOUT_FILE,
    }
    state["controlled_interpretation"] = (
        "QCTP-D1-AUDIO-A03R remains a valid machine-verified technical package, but A04 physical acceptance failed "
        "because Ryan reported that the narration sounded robotic. Human naturalness outranks ASR, acoustic, and "
        "browser PASS. Broad post-generation time-stretching after use of the resource-constrained Nano model is a "
        "calculated likely contributor and must be isolated experimentally. No private installation or full-session "
        "retest is authorized."
    )
    state["next_controlled_action"] = manifest12["next_controlled_action"]
    write_json(state_path, state)

    lessons_path = root / LESSONS_FILE
    if lessons_path.exists():
        lessons = load_json(lessons_path)
    else:
        lessons = {
            "schema": "qctp-audio-failure-lessons-v1",
            "status": "CONTROLLED",
            "entries": [],
        }
    if not any(entry.get("lesson_id") == "QCTP-AUDIO-LESSON-001" for entry in lessons.get("entries", [])):
        lessons.setdefault("entries", []).append({
            "lesson_id": "QCTP-AUDIO-LESSON-001",
            "date": observation["observed_at"],
            "trigger": "A03R passed machine and browser gates but A04 physical voice naturalness failed as robotic.",
            "evidence_classes": [
                observation["evidence_class"],
                evidence["evidence_class"],
            ],
            "root_cause_disposition": evidence["causal_disposition"],
            "durable_controls": [
                "A short physical voice audition is mandatory before full-session voice rendering.",
                "Machine intelligibility cannot satisfy human naturalness acceptance.",
                "Broad spectral time-stretch is prohibited; default limit is 0.95x to 1.05x.",
                "Use real pause composition to achieve meditative cadence.",
                "Retain the locked script while trading voice engine and delivery parameters.",
            ],
        })
    write_json(lessons_path, lessons)
    (root / CLOSEOUT_FILE).write_text(build_closeout(observation, evidence), encoding="utf-8")

    print(json.dumps({
        "result": "PASS",
        "state_schema": STATE_V19,
        "manifest_schema": MANIFEST_V12,
        "active_action": "QCTP-D1-AUDIO-A05",
        "voice_naturalness": "FAIL_ROBOTIC",
        "median_stretch_ratio": evidence["median_target_to_raw_duration_ratio"],
        "maximum_stretch_ratio": evidence["maximum_target_to_raw_duration_ratio"],
    }, indent=2))


if __name__ == "__main__":
    main()
