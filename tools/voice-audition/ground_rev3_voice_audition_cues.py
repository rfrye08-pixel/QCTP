#!/usr/bin/env python3
"""Ground the Rev3 audition excerpts against an immutable Day 1 Git authority.

This verifier deliberately reads the authority with ``git show`` from a resolved
commit rather than trusting copied cue text or metadata in the audition package.
The resulting JSON is deterministic and can travel with the offline audition.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import re
import subprocess
from typing import Any


AUTHORITY_MANIFEST = "QCTP_DAY1_SOURCE_LABELED_SCRIPT_CANDIDATE_REV0.json"
AUTHORITY_LOCK = "QCTP_DAY1_SOURCE_SCRIPT_LOCK_REV0.json"
EXPECTED_CUE_IDS = (
    "D1-A02-000",
    "D1-A02-210",
    "D1-A02-245",
    "D1-A02-480",
    "D1-A02-1440",
    "D1-A02-1495",
)


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: pathlib.Path) -> str:
    return sha256_bytes(path.read_bytes())


def git(repo: pathlib.Path, *args: str) -> bytes:
    result = subprocess.run(
        ["git", "-C", str(repo), *args],
        check=True,
        capture_output=True,
    )
    return result.stdout


def git_text(repo: pathlib.Path, *args: str) -> str:
    return git(repo, *args).decode("utf-8").strip()


def authority_file(repo: pathlib.Path, commit: str, path: str) -> tuple[bytes, dict[str, Any], str]:
    raw = git(repo, "show", f"{commit}:{path}")
    parsed = json.loads(raw.decode("utf-8"))
    oid = git_text(repo, "rev-parse", f"{commit}:{path}")
    return raw, parsed, oid


def authority_record(path: str, raw: bytes, oid: str) -> dict[str, Any]:
    return {
        "path": path,
        "git_blob_oid": oid,
        "blob_sha256": sha256_bytes(raw),
    }


def require(condition: bool, message: str, errors: list[str]) -> None:
    if not condition:
        errors.append(message)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repository", type=pathlib.Path, default=pathlib.Path("."))
    parser.add_argument("--authority-ref", default="origin/main")
    parser.add_argument("--script", type=pathlib.Path, required=True)
    parser.add_argument("--output", type=pathlib.Path, action="append", required=True)
    args = parser.parse_args()

    repo = args.repository.resolve()
    script_path = args.script.resolve()
    commit = git_text(repo, "rev-parse", "--verify", f"{args.authority_ref}^{{commit}}")
    if not re.fullmatch(r"[0-9a-f]{40}", commit):
        raise RuntimeError(f"Authority ref did not resolve to a full commit SHA: {commit!r}")

    manifest_raw, manifest, manifest_oid = authority_file(repo, commit, AUTHORITY_MANIFEST)
    lock_raw, lock, lock_oid = authority_file(repo, commit, AUTHORITY_LOCK)
    audition = json.loads(script_path.read_text(encoding="utf-8"))
    errors: list[str] = []

    require(
        manifest.get("schema") == "qctp-day1-source-labeled-script-v1",
        "Day 1 authority manifest schema mismatch",
        errors,
    )
    require(
        lock.get("schema") == "qctp-day1-source-script-lock-v1",
        "Day 1 script-lock schema mismatch",
        errors,
    )
    require(lock.get("status") == "LOCKED_FOR_TEST_RENDERING", "Day 1 script is not locked for test rendering", errors)
    require(lock.get("render_authority") == "TEST_RENDER_AUTHORIZED", "Day 1 test-render authority is absent", errors)
    require(lock.get("release_authority") == "ZERO_RELEASE", "Day 1 release authority changed", errors)
    require(audition.get("release_authority") == "ZERO_RELEASE", "audition release authority changed", errors)

    part_records: list[dict[str, Any]] = []
    all_cues: list[dict[str, Any]] = []
    cue_locations: dict[str, tuple[str, int, int, dict[str, Any]]] = {}
    refs = manifest.get("cue_part_refs", [])
    require(len(refs) == 5, "controlled Day 1 manifest no longer names five cue parts", errors)
    for part_number, path in enumerate(refs, start=1):
        raw, part, oid = authority_file(repo, commit, path)
        require(part.get("schema") == "qctp-day1-source-script-cue-part-v1", f"{path}: schema mismatch", errors)
        require(part.get("script_id") == manifest.get("script_id"), f"{path}: script_id mismatch", errors)
        require(part.get("part") == part_number, f"{path}: part order mismatch", errors)
        cues = part.get("cues", [])
        for index, cue in enumerate(cues):
            cue_id = cue.get("cue_id")
            if cue_id in cue_locations:
                errors.append(f"duplicate controlled cue id: {cue_id}")
            cue_locations[cue_id] = (path, part_number, index, cue)
        all_cues.extend(cues)
        part_records.append(
            {
                **authority_record(path, raw, oid),
                "part": part.get("part"),
                "cue_count": len(cues),
            }
        )

    source_script_text = "\n".join(str(cue.get("spoken_text", "")) for cue in all_cues)
    computed_source_script_sha = sha256_bytes(source_script_text.encode("utf-8"))
    declared_source_script_sha = manifest.get("script_sha256")
    require(len(all_cues) == manifest.get("cue_count"), "controlled cue count differs from manifest", errors)
    require(
        computed_source_script_sha == declared_source_script_sha,
        "controlled semantic script SHA-256 does not recompute",
        errors,
    )
    require(lock.get("script_id") == manifest.get("script_id"), "script lock names a different script", errors)
    require(lock.get("script_sha256") == computed_source_script_sha, "script lock semantic hash mismatch", errors)
    require(audition.get("source_script_id") == manifest.get("script_id"), "audition source script id mismatch", errors)
    require(
        audition.get("source_script_sha256") == computed_source_script_sha,
        "audition source semantic script hash mismatch",
        errors,
    )

    segments = audition.get("segments", [])
    require(len(segments) == len(EXPECTED_CUE_IDS), "audition must contain exactly six locked excerpts", errors)
    require(
        tuple(segment.get("source_cue_id") for segment in segments) == EXPECTED_CUE_IDS,
        "audition source cue selection/order changed",
        errors,
    )
    cue_evidence: list[dict[str, Any]] = []
    for segment in segments:
        cue_id = segment.get("source_cue_id")
        location = cue_locations.get(cue_id)
        if location is None:
            errors.append(f"audition cue is absent from controlled authority: {cue_id}")
            continue
        path, part_number, index, cue = location
        authority_text = str(cue.get("spoken_text", ""))
        audition_text = str(segment.get("text", ""))
        authority_hash = sha256_bytes(authority_text.encode("utf-8"))
        audition_hash = sha256_bytes(audition_text.encode("utf-8"))
        exact_text_match = audition_text == authority_text
        declared_hashes_match = (
            cue.get("text_sha256") == authority_hash
            and segment.get("text_sha256") == authority_hash
            and audition_hash == authority_hash
        )
        require(exact_text_match, f"{cue_id}: audition wording differs from controlled authority", errors)
        require(declared_hashes_match, f"{cue_id}: one or more text hashes differ", errors)
        cue_evidence.append(
            {
                "audition_segment_id": segment.get("id"),
                "requirement": segment.get("requirement"),
                "source_cue_id": cue_id,
                "authority": {
                    "path": path,
                    "json_pointer": f"/cues/{index}",
                    "part": part_number,
                    "index": index,
                    "source_id": cue.get("source_id"),
                    "start_seconds": cue.get("start_seconds"),
                    "text_sha256": authority_hash,
                },
                "audition_text_sha256": audition_hash,
                "exact_text_match": exact_text_match,
                "declared_hashes_match": declared_hashes_match,
            }
        )

    if errors:
        raise SystemExit("Rev3 audition cue grounding failed:\n- " + "\n- ".join(errors))

    evidence = {
        "schema": "qctp-rev3-voice-audition-cue-grounding-v1",
        "action_id": "QCTP-REV3-NATURAL-VOICE-AUDITION-A01",
        "result": "PASS",
        "authority": {
            "requested_ref": args.authority_ref,
            "resolved_commit_sha": commit,
            "script_manifest": {
                **authority_record(AUTHORITY_MANIFEST, manifest_raw, manifest_oid),
                "script_id": manifest.get("script_id"),
                "status": manifest.get("status"),
                "semantic_script_sha256": computed_source_script_sha,
                "semantic_hash_algorithm": "SHA-256 of all 35 spoken_text values joined by LF in cue order",
            },
            "script_lock": {
                **authority_record(AUTHORITY_LOCK, lock_raw, lock_oid),
                "lock_id": lock.get("lock_id"),
                "status": lock.get("status"),
                "render_authority": lock.get("render_authority"),
                "release_authority": lock.get("release_authority"),
                "semantic_script_sha256": lock.get("script_sha256"),
            },
            "cue_parts": part_records,
        },
        "audition_script": {
            "path": script_path.relative_to(repo).as_posix(),
            "sha256": sha256_file(script_path),
            "script_id": audition.get("script_id"),
            "source_script_id": audition.get("source_script_id"),
            "source_semantic_script_sha256": audition.get("source_script_sha256"),
        },
        "cues": cue_evidence,
        "verification": {
            "controlled_cue_count": len(all_cues),
            "audition_cue_count": len(cue_evidence),
            "all_exact_text_matches": True,
            "all_declared_text_hashes_match": True,
            "semantic_source_script_hash_recomputed": True,
            "script_lock_matches": True,
        },
        "physical_naturalness": "NOT_EVALUATED_BY_CUE_GROUNDING",
        "release_authority": "ZERO_RELEASE",
    }
    serialized = json.dumps(evidence, indent=2, ensure_ascii=False) + "\n"
    for output in args.output:
        destination = output.resolve()
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(serialized, encoding="utf-8", newline="\n")
    print(
        json.dumps(
            {
                "result": "PASS",
                "authority_commit_sha": commit,
                "source_semantic_script_sha256": computed_source_script_sha,
                "audition_cue_count": len(cue_evidence),
                "outputs": [str(path.resolve()) for path in args.output],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
