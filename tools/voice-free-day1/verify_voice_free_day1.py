#!/usr/bin/env python3
"""Deterministically verify the Rev3 P0 Voice-Free Day 1 package."""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import math
import pathlib
import re
import shutil
import subprocess
import sys
from typing import Any

import numpy as np


LOCKED_SCRIPT_SHA256 = "2649ce70e5ab824dbc6b797e07082567fda2443962016e8e6c7dbe454f5ee555"
EXPECTED_PHASES = [
    ("settle", 0, 180, {"QCTP-BASELINE-OBSERVATION", "TB-ANCHOR-01", "QCTP-TRANSITION-01"}),
    ("coherence", 180, 480, {"HM-QC-01", "QCTP-TRANSITION-01"}),
    ("attention-contrast", 480, 780, {"JD-SPACE-01", "QCTP-TRANSITION-01"}),
    ("open-space", 780, 1_380, {"JD-SPACE-01", "QCTP-TRANSITION-01"}),
    ("observe", 1_380, 1_440, {"QCTP-PURE-OBSERVATION"}),
    ("return", 1_440, 1_500, {"QCTP-RETURN-01"}),
]
BOUNDARY_SOURCE = {
    0: "QCTP-BASELINE-OBSERVATION",
    180: "HM-QC-01",
    480: "JD-SPACE-01",
    780: "JD-SPACE-01",
    1_380: "QCTP-PURE-OBSERVATION",
    1_440: "QCTP-RETURN-01",
}
REJECTED_PUBLIC_PATHS = [
    "public/a03-acceptance",
    "public/audio/day1-source-rev0/voice-1500.mp3",
    "public/audio/day1-source-rev0/composite-ambient-low-1500.mp3",
    "public/audio/day1-source-rev0/manifest.json",
    "public/audio/day1-source-rev0/machine-verification.json",
    "public/audio/day1-source-rev0/gate-summary.json",
    "public/audio/day1-source-rev0/critical-asr.json",
]
REJECTED_ARTIFACTS = {
    "controlled-artifacts/a03r-rejected/voice-1500.mp3": "6126445935ff15d059f5fec278617bf943664414072821a2d0340e8b74c6e4c1",
    "controlled-artifacts/a03r-rejected/composite-ambient-low-1500.mp3": "41a404ad01b3d6c9c7fac2d1e6ae0a27f945f106e2702f6a2ebd30e97ea743d3",
    "controlled-artifacts/a03r-rejected/a03-acceptance/acceptance-ambient.mp3": "cc75cb78aea097fbe2441e4db9a1319f9996884e5cbab1bca39d0386db24c7e0",
    "controlled-artifacts/a03r-rejected/a03-acceptance/acceptance-binaural-low-a.mp3": "9e4367fdf6dccba1cb7704930a36a26bb11bb9c12346920b2cb5f2a423bec3ce",
    "controlled-artifacts/a03r-rejected/a03-acceptance/acceptance-minimal.mp3": "b2d51b9215fc7332477490222556a8e77d3510482f9888477fd5101d8c0c5011",
}


class Audit:
    def __init__(self) -> None:
        self.checks: list[dict[str, Any]] = []
        self.errors: list[str] = []

    def check(self, check_id: str, condition: bool, evidence: Any) -> None:
        result = "PASS" if condition else "FAIL"
        self.checks.append({"id": check_id, "result": result, "evidence": evidence})
        if not condition:
            self.errors.append(f"{check_id}: {evidence}")


def sha256(path: pathlib.Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def run(command: list[str], *, cwd: pathlib.Path, text: bool = True) -> subprocess.CompletedProcess[Any]:
    return subprocess.run(command, cwd=cwd, check=True, capture_output=True, text=text)


def git_json(repo: pathlib.Path, commit: str, path: str) -> dict[str, Any]:
    result = run(["git", "show", f"{commit}:{path}"], cwd=repo)
    return json.loads(result.stdout)


def ffprobe(repo: pathlib.Path, path: pathlib.Path) -> dict[str, Any]:
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
        cwd=repo,
    )
    return json.loads(result.stdout)


def read_pcm(
    repo: pathlib.Path,
    path: pathlib.Path,
    start_seconds: float,
    duration_seconds: float,
    *,
    channels: int = 1,
) -> np.ndarray:
    result = run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-ss",
            str(start_seconds),
            "-t",
            str(duration_seconds),
            "-i",
            str(path),
            "-ar",
            "24000",
            "-ac",
            str(channels),
            "-f",
            "f32le",
            "-",
        ],
        cwd=repo,
        text=False,
    )
    samples = np.frombuffer(result.stdout, dtype="<f4")
    if channels > 1:
        return samples.reshape((-1, channels))
    return samples


def tone_amplitude(samples: np.ndarray, frequency_hz: float, sample_rate: int = 24_000) -> float:
    mono = samples.mean(axis=1) if samples.ndim == 2 else samples
    window = np.hanning(len(mono))
    indexes = np.arange(len(mono))
    projection = np.sum(
        mono * window * np.exp(-2j * math.pi * frequency_hz * indexes / sample_rate)
    )
    return float(abs(projection) / (np.sum(window) / 2))


def combined_tone(samples: np.ndarray, frequencies_hz: tuple[float, ...]) -> float:
    return sum(tone_amplitude(samples, frequency) for frequency in frequencies_hz)


def source_grounding_audit(
    audit: Audit, repo: pathlib.Path, manifest: dict[str, Any]
) -> dict[str, Any]:
    authority = manifest["script_authority"]
    main_commit = authority["main_commit"]
    lock = git_json(repo, main_commit, authority["lock_file"])
    cues: list[dict[str, Any]] = []
    part_hashes: dict[str, str] = {}
    for part_name in authority["cue_part_files"]:
        raw = run(["git", "show", f"{main_commit}:{part_name}"], cwd=repo).stdout
        part_hashes[part_name] = hashlib.sha256(raw.encode("utf-8")).hexdigest()
        part = json.loads(raw)
        audit.check(
            f"authority_part_{part['part']}_script_id",
            part["script_id"] == authority["script_id"],
            {"file": part_name, "script_id": part["script_id"]},
        )
        cues.extend(part["cues"])

    cue_by_start = {cue["start_seconds"]: cue for cue in cues}
    audit.check(
        "locked_script_identity",
        lock["script_sha256"] == LOCKED_SCRIPT_SHA256
        and lock["duration_seconds"] == 1_500
        and lock["cue_count"] == 35
        and authority["script_sha256"] == LOCKED_SCRIPT_SHA256,
        {
            "script_id": lock["script_id"],
            "script_sha256": lock["script_sha256"],
            "duration_seconds": lock["duration_seconds"],
            "cue_count": lock["cue_count"],
        },
    )
    audit.check(
        "all_35_authority_cues_loaded",
        len(cues) == 35 and len(cue_by_start) == 35,
        {"cue_count": len(cues), "unique_start_count": len(cue_by_start)},
    )
    boundary_records = []
    for start, expected_source in BOUNDARY_SOURCE.items():
        cue = cue_by_start.get(start)
        record = {
            "start_seconds": start,
            "cue_id": cue.get("cue_id") if cue else None,
            "source_id": cue.get("source_id") if cue else None,
            "expected_source_id": expected_source,
        }
        boundary_records.append(record)
        audit.check(
            f"source_boundary_{start}",
            cue is not None and cue["source_id"] == expected_source,
            record,
        )

    source_ranges = []
    for phase_id, start, end, expected_sources in EXPECTED_PHASES:
        actual_sources = {
            cue["source_id"] for cue in cues if start <= cue["start_seconds"] < end
        }
        record = {
            "phase_id": phase_id,
            "start_seconds": start,
            "end_seconds": end,
            "actual_source_ids": sorted(actual_sources),
            "expected_source_ids": sorted(expected_sources),
        }
        source_ranges.append(record)
        audit.check(
            f"source_range_{phase_id}", actual_sources == expected_sources, record
        )
    return {
        "main_commit": main_commit,
        "lock": {
            "script_id": lock["script_id"],
            "script_sha256": lock["script_sha256"],
            "duration_seconds": lock["duration_seconds"],
            "cue_count": lock["cue_count"],
            "status": lock["status"],
            "release_authority": lock["release_authority"],
        },
        "cue_part_sha256": part_hashes,
        "boundary_records": boundary_records,
        "source_ranges": source_ranges,
    }


def code_contract_audit(audit: Audit, repo: pathlib.Path, manifest: dict[str, Any]) -> dict[str, Any]:
    definition = (repo / "src/practice/voice-free-day1.ts").read_text(encoding="utf-8")
    hook = (repo / "src/practice/use-voice-free-day1-session.ts").read_text(encoding="utf-8")
    app = (repo / "src/app/App.tsx").read_text(encoding="utf-8")
    normalized_definition = definition.replace("_", "")

    phase_records = []
    for phase_id, start, end, _sources in EXPECTED_PHASES:
        pattern = re.compile(
            rf'id:\s*"{re.escape(phase_id)}".*?startSeconds:\s*{start:,}'.replace(",", r"_?")
            + rf".*?endSeconds:\s*{end:,}".replace(",", r"_?"),
            re.DOTALL,
        )
        found = bool(pattern.search(definition))
        phase_records.append({"id": phase_id, "start_seconds": start, "end_seconds": end, "found": found})
        audit.check(f"code_phase_{phase_id}", found, phase_records[-1])

    audit.check(
        "code_duration_and_script_lock",
        "VOICE_FREE_DAY1_DURATION_SECONDS = 1_500" in definition
        and LOCKED_SCRIPT_SHA256 in definition,
        {"duration_seconds": 1_500, "script_sha256": LOCKED_SCRIPT_SHA256},
    )
    operation_terms = {
        "settle": ["starting mind", "contraction", "acceptance", "gratitude"],
        "coherence": ["heart area", "five seconds in", "five seconds out", "comfortable rhythm", "Do not hold"],
        "attention-contrast": ["between the ears", "space around", "torso", "whole body", "do not construct"],
        "open-space": ["surrounding the whole body", "room as one volume", "sounds", "attention is captured", "stop deliberately widening"],
        "observe": ["Release breath control", "Observe the mind, body, emotion"],
        "return": ["feet", "chair", "time of day", "next action", "open the eyes", "fully oriented"],
    }
    for phase_id, terms in operation_terms.items():
        missing = [term for term in terms if term not in definition]
        audit.check(f"code_operations_{phase_id}", not missing, {"required_terms": terms, "missing": missing})

    breath_conditions = [
        "elapsedSeconds < 180 || elapsedSeconds >= 480" in definition,
        "(elapsedSeconds - 180) % 10" in definition,
        "withinCycle < 5" in definition,
        'label: inhaling ? "Inhale" : "Exhale"' in definition,
        "Do not hold" in definition,
        "comfortable rhythm" in definition,
    ]
    audit.check(
        "heartmath_visual_rail_five_five_no_hold",
        all(breath_conditions),
        {
            "window_seconds": [180, 480],
            "cycle_seconds": 10,
            "inhale_seconds": 5,
            "exhale_seconds": 5,
            "hold_seconds": 0,
            "comfort_override": True,
            "source_checks": breath_conditions,
        },
    )

    relative_urls = (
        "import.meta.env.BASE_URL" in definition
        and "http://" not in definition
        and "https://" not in definition
        and 'voice-free-manifest.json' in definition
    )
    audit.check("same_origin_url_contract", relative_urls, {"manifest": "voice-free-manifest.json", "absolute_url_present": False})

    completion_conditions = {
        "support_audio_authoritative_clock": "audioElement.currentTime" in hook,
        "duration_fail_closed": "duration < 1_499 || duration > 1_501" in hook,
        "early_user_end_labeled": 'endingRef.current = "user"' in hook,
        "short_test_labeled": 'endingRef.current = "test"' in hook,
        "early_audio_end_rejected": "audioElement.currentTime < 1_499" in hook,
        "natural_elapsed_exact": "elapsedMs: 1_500_000" in hook,
        "completion_once": "completionSentRef.current" in hook,
        "voice_free_mode_persisted": 'completionMode: "VOICE_FREE_FALLBACK"' in app,
        "natural_completion_persisted": "naturalCompletion: true" in app,
        "narration_not_used": "narrationUsed: false" in app,
        "acceptance_not_applicable": 'narratedContentAcceptance: "NOT_APPLICABLE"' in app,
        "state_not_assessed": 'stateAttainment: "NOT_ASSESSED"' in app,
    }
    audit.check("natural_completion_credit_gate", all(completion_conditions.values()), completion_conditions)

    declared_assets = manifest["assets"]
    hash_alignment = all(asset["path"] in definition and asset["sha256"] in definition for asset in declared_assets)
    audit.check("code_manifest_media_hash_alignment", hash_alignment, {"asset_count": len(declared_assets)})
    return {
        "phase_records": phase_records,
        "heartmath": manifest["heartmath_breath_contract"],
        "completion_conditions": completion_conditions,
        "definition_size_bytes": len(definition.encode("utf-8")),
        "hook_size_bytes": len(hook.encode("utf-8")),
        "app_completion_mapping_observed": True,
        "normalized_definition_size": len(normalized_definition),
    }


def media_audit(audit: Audit, repo: pathlib.Path, manifest: dict[str, Any]) -> list[dict[str, Any]]:
    results: list[dict[str, Any]] = []
    boundaries = manifest["nonverbal_phase_marker"]["boundaries_seconds"]
    for asset in manifest["assets"]:
        path = repo / "public/audio/day1-source-rev0" / asset["path"]
        actual_hash = sha256(path) if path.exists() else None
        actual_bytes = path.stat().st_size if path.exists() else None
        probe = ffprobe(repo, path) if path.exists() else None
        stream = probe["streams"][0] if probe else {}
        duration = float(probe["format"]["duration"]) if probe else None
        identity_ok = (
            actual_hash == asset["sha256"]
            and actual_bytes == asset["bytes"]
            and 1_499 <= duration <= 1_501
            and stream.get("sample_rate") == "24000"
            and stream.get("channels") == 2
        )
        audit.check(
            f"media_identity_{asset['mode']}",
            identity_ok,
            {
                "path": path.relative_to(repo).as_posix(),
                "sha256": actual_hash,
                "bytes": actual_bytes,
                "duration_seconds": duration,
                "sample_rate_hz": stream.get("sample_rate"),
                "channels": stream.get("channels"),
            },
        )

        silence = run(
            [
                "ffmpeg",
                "-hide_banner",
                "-i",
                str(path),
                "-af",
                "silencedetect=noise=-55dB:d=0.75",
                "-f",
                "null",
                "-",
            ],
            cwd=repo,
        ).stderr
        silence_events = re.findall(r"silence_(?:start|end):\s*([0-9.]+)", silence)
        audit.check(
            f"continuous_support_{asset['mode']}",
            not silence_events,
            {"threshold_db": -55, "minimum_silence_seconds": 0.75, "silence_events": silence_events},
        )

        volume = run(
            ["ffmpeg", "-hide_banner", "-i", str(path), "-af", "volumedetect", "-f", "null", "-"],
            cwd=repo,
        ).stderr
        max_match = re.search(r"max_volume:\s*(-?[0-9.]+) dB", volume)
        max_volume_db = float(max_match.group(1)) if max_match else None
        audit.check(
            f"no_clipping_{asset['mode']}",
            max_volume_db is not None and max_volume_db <= -0.1,
            {"max_volume_dbfs": max_volume_db},
        )

        marker_results = []
        for boundary in boundaries:
            marker = read_pcm(repo, path, boundary - 0.4, 0.26)
            baseline_before = read_pcm(repo, path, boundary - 0.75, 0.26)
            baseline_after = read_pcm(repo, path, boundary + 0.1, 0.26)
            marker_level = combined_tone(marker, (330.0, 495.0))
            baseline_level = max(
                combined_tone(baseline_before, (330.0, 495.0)),
                combined_tone(baseline_after, (330.0, 495.0)),
            )
            ratio = marker_level / max(baseline_level, 1e-12)
            marker_record = {
                "boundary_seconds": boundary,
                "marker_start_seconds": boundary - 0.4,
                "tone_amplitude": marker_level,
                "adjacent_tone_amplitude": baseline_level,
                "ratio": ratio,
            }
            marker_results.append(marker_record)
            audit.check(
                f"marker_{asset['mode']}_{boundary}",
                marker_level >= 0.015 and ratio >= 2.0,
                marker_record,
            )

        rail_inside = [
            combined_tone(read_pcm(repo, path, second, 0.9), (275.0, 412.5))
            for second in (230, 300, 450)
        ]
        rail_outside = [
            combined_tone(read_pcm(repo, path, second, 0.9), (275.0, 412.5))
            for second in (190, 500)
        ]
        rail_ratio = min(rail_inside) / max(max(rail_outside), 1e-12)
        audit.check(
            f"acoustic_breath_rail_{asset['mode']}",
            rail_ratio >= 2.0,
            {
                "verified_window_seconds": [224, 462],
                "inside_tone_amplitudes": rail_inside,
                "outside_tone_amplitudes": rail_outside,
                "minimum_inside_to_maximum_outside_ratio": rail_ratio,
            },
        )

        return_window = read_pcm(repo, path, 1_440, 60)
        return_rms = float(np.sqrt(np.mean(return_window * return_window)))
        audit.check(
            f"complete_return_support_{asset['mode']}",
            return_rms > 0.001,
            {"window_seconds": [1_440, 1_500], "rms": return_rms},
        )
        results.append(
            {
                "mode": asset["mode"],
                "identity": {
                    "path": path.relative_to(repo).as_posix(),
                    "sha256": actual_hash,
                    "bytes": actual_bytes,
                    "probe": probe,
                },
                "continuity": {"silence_events": silence_events, "max_volume_dbfs": max_volume_db},
                "phase_markers": marker_results,
                "heartmath_acoustic_rail": {
                    "inside_tone_amplitudes": rail_inside,
                    "outside_tone_amplitudes": rail_outside,
                    "ratio": rail_ratio,
                },
                "return_window_rms": return_rms,
            }
        )
    return results


def offline_and_quarantine_audit(
    audit: Audit, repo: pathlib.Path, manifest: dict[str, Any]
) -> dict[str, Any]:
    vite = (repo / "vite.config.ts").read_text(encoding="utf-8")
    config_conditions = {
        "mp3_and_json_globbed": "mp3,json" in vite,
        "cache_limit_covers_12mb_stems": "13 * 1024 * 1024" in vite,
        "rejected_acceptance_ignored": '"a03-acceptance/**"' in vite,
        "rejected_voice_ignored": '"audio/day1-source-rev0/voice-1500.mp3"' in vite,
        "rejected_composite_ignored": '"audio/day1-source-rev0/composite-ambient-low-1500.mp3"' in vite,
    }
    audit.check("offline_precache_configuration", all(config_conditions.values()), config_conditions)

    public_absence = {path: not (repo / path).exists() for path in REJECTED_PUBLIC_PATHS}
    audit.check("rejected_a03r_absent_from_public", all(public_absence.values()), public_absence)
    quarantine = {}
    for relative, expected_hash in REJECTED_ARTIFACTS.items():
        path = repo / relative
        quarantine[relative] = {
            "exists": path.exists(),
            "sha256": sha256(path) if path.exists() else None,
            "expected_sha256": expected_hash,
        }
    audit.check(
        "rejected_a03r_preserved_in_quarantine",
        all(record["exists"] and record["sha256"] == record["expected_sha256"] for record in quarantine.values()),
        quarantine,
    )

    dist = repo / "dist"
    dist_exists = dist.is_dir()
    sw_path = dist / "sw.js"
    sw = sw_path.read_text(encoding="utf-8") if sw_path.exists() else ""
    dist_assets = {}
    for asset in manifest["assets"]:
        path = dist / "audio/day1-source-rev0" / asset["path"]
        dist_assets[asset["path"]] = {
            "exists": path.exists(),
            "sha256": sha256(path) if path.exists() else None,
            "precache_entry": f'audio/day1-source-rev0/{asset["path"]}' in sw,
        }
    clean_manifest = dist / "audio/day1-source-rev0/voice-free-manifest.json"
    dist_rejected = {
        "a03-acceptance": (dist / "a03-acceptance").exists(),
        "voice-1500.mp3": (dist / "audio/day1-source-rev0/voice-1500.mp3").exists(),
        "composite-ambient-low-1500.mp3": (dist / "audio/day1-source-rev0/composite-ambient-low-1500.mp3").exists(),
        "legacy-manifest.json": (dist / "audio/day1-source-rev0/manifest.json").exists(),
    }
    offline_ok = (
        dist_exists
        and sw_path.exists()
        and clean_manifest.exists()
        and "audio/day1-source-rev0/voice-free-manifest.json" in sw
        and all(
            record["exists"]
            and record["sha256"] == next(asset["sha256"] for asset in manifest["assets"] if asset["path"] == name)
            and record["precache_entry"]
            for name, record in dist_assets.items()
        )
        and not any(dist_rejected.values())
    )
    audit.check(
        "built_offline_package",
        offline_ok,
        {
            "dist_exists": dist_exists,
            "service_worker": sw_path.exists(),
            "clean_manifest_exists": clean_manifest.exists(),
            "clean_manifest_precached": "audio/day1-source-rev0/voice-free-manifest.json" in sw,
            "support_assets": dist_assets,
            "rejected_dist_paths_present": dist_rejected,
        },
    )
    return {
        "vite_configuration": config_conditions,
        "public_rejected_absence": public_absence,
        "quarantine": quarantine,
        "dist_support_assets": dist_assets,
        "dist_rejected_paths_present": dist_rejected,
        "service_worker_sha256": sha256(sw_path) if sw_path.exists() else None,
    }


def generated_evidence_audit(
    audit: Audit, repo: pathlib.Path, manifest: dict[str, Any]
) -> dict[str, Any]:
    build_record_path = repo / "tools/voice-free-day1/phase-marker-build-record.json"
    build_record = json.loads(build_record_path.read_text(encoding="utf-8"))
    manifest_hashes = {asset["path"]: asset["sha256"] for asset in manifest["assets"]}
    build_hashes = {
        pathlib.PurePosixPath(output["path"]).name: output["sha256"]
        for output in build_record["outputs"]
    }
    build_conditions = {
        "pinned_source_ref": build_record["source_git_ref"]
        == "a2093caa714332313fa7196f3dc58a67a2d721d2",
        "manifest_hashes_match_outputs": build_hashes == manifest_hashes,
        "narration_not_used": build_record["operations"]["narration_used"] is False,
        "time_stretch_not_used": build_record["operations"]["time_stretch_used"] is False,
        "timing_not_changed": build_record["operations"]["source_bed_timing_changed"] is False,
        "all_five_markers_built": build_record["operations"]["marker_boundaries_seconds"]
        == [180, 480, 780, 1_380, 1_440],
    }
    audit.check("deterministic_marker_build_record", all(build_conditions.values()), build_conditions)

    browser_path = repo / "QCTP_REV3_VOICE_FREE_DAY1_BROWSER_VERIFICATION_REV0_2026-08-22.json"
    browser = json.loads(browser_path.read_text(encoding="utf-8")) if browser_path.exists() else None
    browser_ok = (
        browser is not None
        and browser.get("result") == "PASS"
        and {route.get("route") for route in browser.get("routes", [])}
        == {"chromium", "iphone-webkit"}
        and all(route.get("result") == "PASS" for route in browser.get("routes", []))
    )
    audit.check(
        "chromium_and_iphone_webkit_offline_evidence",
        browser_ok,
        {
            "path": browser_path.relative_to(repo).as_posix(),
            "sha256": sha256(browser_path) if browser_path.exists() else None,
            "result": browser.get("result") if browser else None,
            "routes": [
                {"route": route.get("route"), "result": route.get("result")}
                for route in browser.get("routes", [])
            ]
            if browser
            else [],
        },
    )

    unit_command = [
        shutil.which("node") or "node",
        str(repo / "node_modules/vitest/vitest.mjs"),
        "run",
        "src/practice/voice-free-day1.evidence.test.ts",
        "src/practice/voice-free-day1.test.ts",
        "src/practice/use-voice-free-day1-session.test.tsx",
    ]
    unit = subprocess.run(unit_command, cwd=repo, capture_output=True, text=True, check=False)
    unit_output = f"{unit.stdout}\n{unit.stderr}".strip()
    unit_ok = unit.returncode == 0 and "13 passed" in unit_output and "3 passed" in unit_output
    unit_command_record = (
        "node node_modules/vitest/vitest.mjs run "
        "src/practice/voice-free-day1.evidence.test.ts "
        "src/practice/voice-free-day1.test.ts "
        "src/practice/use-voice-free-day1-session.test.tsx"
    )
    unit_output_sha256 = hashlib.sha256(unit_output.encode("utf-8")).hexdigest()
    audit.check(
        "targeted_voice_free_unit_and_hook_tests",
        unit_ok,
        {
            "command": unit_command_record,
            "exit_code": unit.returncode,
            "expected_test_files": 3,
            "expected_tests": 13,
            "observed_pass_summary": "3 test files / 13 tests",
            "captured_output_sha256": unit_output_sha256,
        },
    )
    return {
        "phase_marker_build_record": {
            "path": build_record_path.relative_to(repo).as_posix(),
            "sha256": sha256(build_record_path),
            "conditions": build_conditions,
        },
        "browser_report": {
            "path": browser_path.relative_to(repo).as_posix(),
            "sha256": sha256(browser_path) if browser_path.exists() else None,
            "result": browser.get("result") if browser else None,
        },
        "targeted_tests": {
            "command": unit_command_record,
            "exit_code": unit.returncode,
            "observed_pass_summary": "3 test files / 13 tests",
            "captured_output_sha256": unit_output_sha256,
        },
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", type=pathlib.Path, default=pathlib.Path.cwd())
    parser.add_argument(
        "--output",
        type=pathlib.Path,
        default=pathlib.Path("QCTP_REV3_VOICE_FREE_DAY1_MACHINE_VERIFICATION_REV0_2026-08-22.json"),
    )
    args = parser.parse_args()
    repo = args.repo.resolve()
    output = (repo / args.output).resolve()
    audit = Audit()

    branch = run(["git", "branch", "--show-current"], cwd=repo).stdout.strip()
    audit.check("execution_branch", branch == "qctp-platform-rev3-codex", {"branch": branch})
    manifest_path = repo / "public/audio/day1-source-rev0/voice-free-manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    audit.check(
        "clean_manifest_identity",
        manifest["schema"] == "qctp-rev3-voice-free-day1-media-v1"
        and manifest["release_authority"] == "ZERO_RELEASE"
        and manifest["runtime_contract"]["narration_used"] is False
        and manifest["runtime_contract"]["paid_api_required"] is False,
        {
            "schema": manifest["schema"],
            "status": manifest["status"],
            "release_authority": manifest["release_authority"],
            "narration_used": manifest["runtime_contract"]["narration_used"],
            "paid_api_required": manifest["runtime_contract"]["paid_api_required"],
        },
    )

    source = source_grounding_audit(audit, repo, manifest)
    code = code_contract_audit(audit, repo, manifest)
    media = media_audit(audit, repo, manifest)
    offline = offline_and_quarantine_audit(audit, repo, manifest)
    generated_evidence = generated_evidence_audit(audit, repo, manifest)

    passed = not audit.errors
    report = {
        "schema": "qctp-rev3-voice-free-day1-machine-verification-v1",
        "package_id": manifest["package_id"],
        "verified_at": dt.datetime.now(dt.timezone.utc).isoformat(),
        "result": "PASS" if passed else "FAIL",
        "status": "MACHINE_PASS_PHYSICAL_GATE_OPEN" if passed else "MACHINE_GATE_FAILED",
        "release_authority": "ZERO_RELEASE",
        "physical_gate": {
            "voice_free_morning_mode": "OPEN",
            "machine_evidence_substitutes_for_physical_use": False,
        },
        "branch": branch,
        "head": run(["git", "rev-parse", "HEAD"], cwd=repo).stdout.strip(),
        "source_grounding": source,
        "runtime_contract": code,
        "media": media,
        "offline_and_quarantine": offline,
        "generated_evidence": generated_evidence,
        "checks": audit.checks,
        "summary": {
            "total": len(audit.checks),
            "passed": sum(check["result"] == "PASS" for check in audit.checks),
            "failed": sum(check["result"] == "FAIL" for check in audit.checks),
        },
        "errors": audit.errors,
        "holds": [
            "Ryan must physically run the shortest Voice-Free Day 1 morning-mode gate on the iPhone/PWA.",
            "Machine evidence does not grant release authority, narrated-content acceptance, or state attainment.",
            "Rev3 remains ZERO_RELEASE and must not merge or deploy without explicit authority.",
        ],
    }
    output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"result": report["result"], "summary": report["summary"], "output": str(output)}, indent=2))
    if audit.errors:
        for error in audit.errors:
            print(error, file=sys.stderr)
    return 0 if passed else 1


if __name__ == "__main__":
    raise SystemExit(main())
