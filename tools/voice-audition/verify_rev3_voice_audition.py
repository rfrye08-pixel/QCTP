#!/usr/bin/env python3
"""Verify Rev3 blind-audition integrity, acoustics, wording, and legal controls."""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import pathlib
import re
import subprocess
from typing import Any

import numpy as np
import pyloudnorm as pyln
import soundfile as sf
from faster_whisper import WhisperModel
from jiwer import wer

SAMPLE_RATE = 24_000
REJECTED_MARKERS = ("chatterbox", "chill brian", "heygen", "a03r")
ROUTE_IDENTITY_MARKERS = ("piper", "kokoro", "kittentts", "kitten_tts")
PRIVATE_SAMPLE_FIELDS = {
    "route_id",
    "engine_family",
    "engine_version",
    "model_id",
    "model_revision",
    "voice",
    "engine_license",
    "model_license",
    "dataset_or_voice_rights",
    "model_files",
    "render_seconds",
    "segments",
}


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: pathlib.Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def canonical_json(value: Any) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode("utf-8")


def normalize_text(text: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9\s]", " ", text.lower())).strip()


def ffprobe(path: pathlib.Path) -> dict[str, Any]:
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration,format_name,bit_rate:format_tags:stream=codec_name,sample_rate,channels:stream_tags",
            "-of",
            "json",
            str(path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout)


def require(condition: bool, message: str, errors: list[str]) -> None:
    if not condition:
        errors.append(message)


def is_lower_hex(value: Any, length: int) -> bool:
    return isinstance(value, str) and len(value) == length and all(character in "0123456789abcdef" for character in value)


def silence_runs(audio: np.ndarray, threshold: float = 0.00035, minimum_seconds: float = 0.55) -> list[float]:
    quiet = np.abs(audio) <= threshold
    transitions = np.diff(np.pad(quiet.astype(np.int8), (1, 1)))
    starts = np.flatnonzero(transitions == 1)
    ends = np.flatnonzero(transitions == -1)
    return [
        (end - start) / SAMPLE_RATE
        for start, end in zip(starts, ends, strict=True)
        if (end - start) / SAMPLE_RATE >= minimum_seconds
    ]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=pathlib.Path, required=True)
    parser.add_argument("--private-reveal", type=pathlib.Path, required=True)
    parser.add_argument("--licensing", type=pathlib.Path, required=True)
    parser.add_argument("--whisper-model", required=True)
    parser.add_argument("--max-wer", type=float, default=0.20)
    args = parser.parse_args()
    output = args.output.resolve()
    whisper_model_path = pathlib.Path(args.whisper_model).resolve()
    manifest_path = output / "manifest.json"
    reveal_path = args.private_reveal.resolve()
    script_path = output / "audition-script.json"
    grounding_path = output / "cue-grounding.json"
    build_record_path = output / "build-record.json"
    licensing_path = args.licensing.resolve()
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    reveal = json.loads(reveal_path.read_text(encoding="utf-8"))
    script = json.loads(script_path.read_text(encoding="utf-8"))
    grounding = json.loads(grounding_path.read_text(encoding="utf-8"))
    build_record = json.loads(build_record_path.read_text(encoding="utf-8"))
    licensing = json.loads(licensing_path.read_text(encoding="utf-8"))
    errors: list[str] = []

    require(manifest.get("schema") == "qctp-rev3-blind-natural-voice-audition-v1", "manifest schema mismatch", errors)
    require(reveal.get("schema") == "qctp-rev3-blind-natural-voice-route-reveal-v1", "reveal schema mismatch", errors)
    require(script.get("schema") == "qctp-rev3-natural-voice-audition-script-v1", "script schema mismatch", errors)
    require(grounding.get("schema") == "qctp-rev3-voice-audition-cue-grounding-v1", "cue-grounding schema mismatch", errors)
    require(grounding.get("result") == "PASS", "cue grounding is not PASS", errors)
    require(licensing.get("schema") == "qctp-rev3-natural-voice-trade-and-licensing-v1", "licensing schema mismatch", errors)
    require(build_record.get("schema") == "qctp-rev3-voice-audition-build-record-v1", "build-record schema mismatch", errors)
    require(build_record.get("result") == "PASS", "build record is not PASS", errors)
    require(build_record.get("release_authority") == "ZERO_RELEASE", "build-record release authority changed", errors)
    require(manifest.get("release_authority") == "ZERO_RELEASE", "manifest release authority changed", errors)
    require(manifest.get("none_option_required") is True, "NONE option contract missing", errors)
    require(manifest.get("blind_labels") == ["A", "B", "C"], "blind labels mismatch", errors)
    require(
        not any("seed" in key.lower() for key in manifest.get("randomization", {})),
        "public manifest exposes seed material that could weaken the blind",
        errors,
    )
    require(
        manifest.get("audio_contract", {}).get("generation_pacing")
        == {
            "piper": "PINNED_MODEL_AND_CONFIG_DEFAULTS",
            "kokoro": "EXPLICIT_SPEED_1_0",
            "kitten_tts": "EXPLICIT_SPEED_1_0",
            "post_render_spectral_time_stretch": "NONE",
        },
        "generation-pacing provenance is missing or inaccurate",
        errors,
    )
    require(sha256_file(script_path) == manifest.get("audition_script", {}).get("sha256"), "audition script hash mismatch", errors)
    require(
        sha256_file(reveal_path) == manifest.get("route_assignment", {}).get("commitment_sha256"),
        "private route-assignment commitment mismatch",
        errors,
    )
    require(
        manifest.get("route_assignment", {}).get("availability")
        == "CONTROLLED_ARTIFACT_ONLY_NOT_PUBLIC_OR_FETCHABLE",
        "route assignment is not explicitly non-public",
        errors,
    )
    require(not (output / "route-reveal.json").exists(), "route assignment leaked into public output", errors)
    require(
        build_record.get("manifest_sha256") == sha256_file(manifest_path),
        "build record does not bind the current public manifest",
        errors,
    )
    require(
        build_record.get("private_route_assignment_sha256") == sha256_file(reveal_path),
        "build record does not bind the current controlled private mapping",
        errors,
    )
    require(
        build_record.get("script_sha256") == sha256_file(script_path),
        "build record does not bind the current audition script",
        errors,
    )
    require(
        build_record.get("cue_grounding_sha256") == sha256_file(grounding_path),
        "build record does not bind the current cue grounding",
        errors,
    )
    require(build_record.get("public_route_assignment_present") is False, "build record permits a public route assignment", errors)
    require(build_record.get("blind_seed_disclosed") is False, "build record discloses the blind seed", errors)
    require(grounding.get("release_authority") == "ZERO_RELEASE", "cue-grounding release authority changed", errors)

    authority = grounding.get("authority", {})
    authority_manifest = authority.get("script_manifest", {})
    authority_lock = authority.get("script_lock", {})
    authority_commit = authority.get("resolved_commit_sha")
    require(is_lower_hex(authority_commit, 40), "cue grounding lacks a full immutable authority commit SHA", errors)
    require(
        authority_manifest.get("path") == "QCTP_DAY1_SOURCE_LABELED_SCRIPT_CANDIDATE_REV0.json",
        "cue grounding names the wrong Day 1 script manifest",
        errors,
    )
    require(
        authority_lock.get("path") == "QCTP_DAY1_SOURCE_SCRIPT_LOCK_REV0.json",
        "cue grounding names the wrong Day 1 script lock",
        errors,
    )
    for record_name, record in (("script manifest", authority_manifest), ("script lock", authority_lock)):
        require(is_lower_hex(record.get("git_blob_oid"), 40), f"{record_name} Git blob OID is invalid", errors)
        require(is_lower_hex(record.get("blob_sha256"), 64), f"{record_name} blob SHA-256 is invalid", errors)
    cue_parts = authority.get("cue_parts", [])
    require(len(cue_parts) == 5, "cue grounding does not attest all five controlled cue parts", errors)
    require(
        all(is_lower_hex(part.get("git_blob_oid"), 40) and is_lower_hex(part.get("blob_sha256"), 64) for part in cue_parts),
        "one or more grounded cue-part hashes are invalid",
        errors,
    )
    require(authority_manifest.get("script_id") == script.get("source_script_id"), "grounded source script id mismatch", errors)
    require(
        authority_manifest.get("semantic_script_sha256") == script.get("source_script_sha256"),
        "grounded source semantic script hash mismatch",
        errors,
    )
    require(authority_lock.get("semantic_script_sha256") == script.get("source_script_sha256"), "grounded script-lock hash mismatch", errors)
    require(authority_lock.get("status") == "LOCKED_FOR_TEST_RENDERING", "grounded Day 1 script is not test-render locked", errors)
    require(authority_lock.get("render_authority") == "TEST_RENDER_AUTHORIZED", "grounded Day 1 script lacks test-render authority", errors)
    require(authority_lock.get("release_authority") == "ZERO_RELEASE", "grounded Day 1 release authority changed", errors)
    require(grounding.get("audition_script", {}).get("sha256") == sha256_file(script_path), "grounding covers a different audition script", errors)

    segments = script.get("segments", [])
    for segment in segments:
        require(
            sha256_bytes(segment.get("text", "").encode("utf-8")) == segment.get("text_sha256"),
            f"locked segment hash mismatch: {segment.get('id')}",
            errors,
        )
    expected_text = " ".join(segment["text"] for segment in segments)
    expected_normalized = normalize_text(expected_text)
    require(
        sha256_bytes(expected_text.encode("utf-8")) == manifest.get("audition_script", {}).get("locked_text_sha256"),
        "locked combined text hash mismatch",
        errors,
    )
    requirements = {segment.get("requirement") for segment in segments}
    require("opening" in requirements, "opening excerpt missing", errors)
    require("HeartMath five-in/five-out coaching" in requirements, "HeartMath counted coaching missing", errors)
    require("HeartMath comfort override" in requirements, "HeartMath comfort override missing", errors)
    require("spatial attention" in requirements, "spatial-attention excerpt missing", errors)
    require("complete return" in requirements, "complete-return excerpt missing", errors)
    grounded_cues = {cue.get("audition_segment_id"): cue for cue in grounding.get("cues", [])}
    require(len(grounded_cues) == 6, "cue grounding must cover exactly six audition excerpts", errors)
    for segment in segments:
        cue = grounded_cues.get(segment.get("id"), {})
        require(cue.get("source_cue_id") == segment.get("source_cue_id"), f"grounded source cue mismatch: {segment.get('id')}", errors)
        require(cue.get("audition_text_sha256") == segment.get("text_sha256"), f"grounded text hash mismatch: {segment.get('id')}", errors)
        require(cue.get("authority", {}).get("text_sha256") == segment.get("text_sha256"), f"authority cue hash mismatch: {segment.get('id')}", errors)
        require(cue.get("exact_text_match") is True, f"authority exact-text PASS absent: {segment.get('id')}", errors)
        require(cue.get("declared_hashes_match") is True, f"authority declared-hash PASS absent: {segment.get('id')}", errors)

    blind_samples = manifest.get("samples", [])
    revealed_samples = reveal.get("samples", [])
    require(len(blind_samples) == 3 and len(revealed_samples) == 3, "expected exactly three routes", errors)
    require({sample.get("sample_code") for sample in blind_samples} == {"A", "B", "C"}, "sample labels changed", errors)
    for sample in blind_samples:
        exposed = sorted(PRIVATE_SAMPLE_FIELDS.intersection(sample))
        require(not exposed, f"public sample {sample.get('sample_code')} exposes private route fields: {exposed}", errors)
    require(len({sample.get("engine_family") for sample in revealed_samples}) == 3, "engine families are not materially distinct", errors)
    require(
        {route.get("route_id") for route in licensing.get("routes", [])}
        == {sample.get("route_id") for sample in revealed_samples},
        "licensing record does not cover every rendered route",
        errors,
    )
    require(
        all(route.get("audition_generated_audio_redistribution") == "PASS" for route in licensing.get("routes", [])),
        "a route lacks generated-audio redistribution clearance",
        errors,
    )
    license_by_route = {route.get("route_id"): route for route in licensing.get("routes", [])}
    for sample in revealed_samples:
        licensed = license_by_route.get(sample.get("route_id"), {})
        rendered_files = {(entry.get("name"), entry.get("sha256"), entry.get("bytes")) for entry in sample.get("model_files", [])}
        licensed_files = {(entry.get("name"), entry.get("sha256"), entry.get("bytes")) for entry in licensed.get("model_files", [])}
        require(rendered_files == licensed_files, f"rendered model hashes differ from licensing record: {sample.get('route_id')}", errors)
    route_identity_text = json.dumps(revealed_samples).lower()
    for marker in REJECTED_MARKERS:
        require(marker not in route_identity_text, f"rejected route marker entered candidate set: {marker}", errors)

    revealed_by_code = {sample["sample_code"]: sample for sample in revealed_samples}
    for blind in blind_samples:
        revealed = dict(revealed_by_code.get(blind.get("sample_code"), {}))
        commitment = revealed.pop("route_commitment_sha256", None)
        require(commitment == blind.get("route_commitment_sha256"), f"route commitment field mismatch: {blind.get('sample_code')}", errors)
        require(
            sha256_bytes(canonical_json(revealed)) == blind.get("route_commitment_sha256"),
            f"route commitment content mismatch: {blind.get('sample_code')}",
            errors,
        )

    meter = pyln.Meter(SAMPLE_RATE)
    acoustic: dict[str, Any] = {}
    decoded_audio: dict[str, np.ndarray] = {}
    for sample in blind_samples:
        code = sample.get("sample_code")
        path = output / str(sample.get("file"))
        require(path.exists(), f"sample {code} missing", errors)
        if not path.exists():
            continue
        require(sha256_file(path) == sample.get("sha256"), f"sample {code} hash mismatch", errors)
        require(sample.get("spectral_time_stretch_used") is False, f"sample {code} used spectral time-stretch", errors)
        require(math.isclose(float(sample.get("time_stretch_factor", 0)), 1.0, abs_tol=1e-9), f"sample {code} time-stretch factor changed", errors)
        require(math.isclose(float(sample.get("model_native_speed", 0)), 1.0, abs_tol=1e-9), f"sample {code} did not use native speed", errors)
        require(float(sample.get("inserted_real_silence_seconds", 0)) >= 7.5, f"sample {code} lacks authored silence", errors)
        probe = ffprobe(path)
        probe_text = json.dumps(probe).lower()
        require(
            not any(marker in probe_text for marker in (*REJECTED_MARKERS, *ROUTE_IDENTITY_MARKERS)),
            f"sample {code} media metadata exposes a route identity",
            errors,
        )
        stream = probe.get("streams", [{}])[0]
        require(stream.get("codec_name") == "mp3", f"sample {code} codec is not MP3", errors)
        require(int(stream.get("sample_rate", 0)) == SAMPLE_RATE, f"sample {code} sample rate mismatch", errors)
        require(int(stream.get("channels", 0)) == 1, f"sample {code} is not mono", errors)
        duration = float(probe.get("format", {}).get("duration", 0))
        require(30 <= duration <= 150, f"sample {code} duration outside short-audition bounds", errors)
        audio, rate = sf.read(path, dtype="float32", always_2d=False)
        audio = np.asarray(audio, dtype=np.float32).reshape(-1)
        decoded_audio[code] = audio
        require(rate == SAMPLE_RATE, f"sample {code} decoded rate mismatch", errors)
        require(np.isfinite(audio).all(), f"sample {code} contains non-finite samples", errors)
        peak = float(np.max(np.abs(audio)))
        loudness = float(meter.integrated_loudness(audio.astype(np.float64)))
        runs = silence_runs(audio)
        require(peak <= 0.86, f"sample {code} peak exceeds limit: {peak:.4f}", errors)
        require(-21.6 <= loudness <= -20.4, f"sample {code} loudness outside matched bound: {loudness:.2f}", errors)
        require(len(runs) >= 5, f"sample {code} lacks five decodable real-silence intervals", errors)
        acoustic[code] = {
            "duration_seconds": duration,
            "integrated_lufs": round(loudness, 4),
            "peak_linear": round(peak, 6),
            "real_silence_runs_seconds": [round(value, 4) for value in runs],
            "sha256": sha256_file(path),
        }
    if acoustic:
        levels = [record["integrated_lufs"] for record in acoustic.values()]
        require(max(levels) - min(levels) <= 0.35, f"loudness spread exceeds 0.35 LU: {max(levels) - min(levels):.3f}", errors)

    model = WhisperModel(
        str(whisper_model_path),
        device="cpu",
        compute_type="int8",
        local_files_only=True,
    )
    asr: dict[str, Any] = {}
    for sample in blind_samples:
        code = sample.get("sample_code")
        path = output / str(sample.get("file"))
        if not path.exists():
            continue
        transcription, info = model.transcribe(str(path), language="en", beam_size=5, vad_filter=False)
        raw = " ".join(segment.text.strip() for segment in transcription).strip()
        normalized = normalize_text(raw)
        score = float(wer(expected_normalized, normalized))
        require(score <= args.max_wer, f"sample {code} ASR WER {score:.3f} exceeds {args.max_wer:.3f}", errors)
        asr[code] = {
            "raw_transcript": raw,
            "normalized_transcript": normalized,
            "expected_normalized": expected_normalized,
            "wer": score,
            "model": f"local-whisper/{whisper_model_path.name}",
            "language": info.language,
            "language_probability": info.language_probability,
            "scope": "INTELLIGIBILITY_ONLY_NOT_NATURALNESS",
        }
        print(f"Sample {code} WER: {score:.3f}")

    page = (output / "index.html").read_text(encoding="utf-8")
    for marker in (
        "VOICE TEST ONLY",
        "NOT A MEDITATION",
        "NO COMPLETION CREDIT",
        "Five in / five out",
        "Spatial attention",
        "Complete return",
        "A, B, C, or NONE",
        "Return to QCTP",
    ):
        require(marker in page, f"audition page marker missing: {marker}", errors)
    require(not any(marker in page.lower() for marker in REJECTED_MARKERS), "page exposes a rejected route before selection", errors)
    require("route-reveal.json" not in page, "public UI references the private route assignment", errors)
    require("identities revealed" not in page.lower(), "public UI promises a client-side identity reveal", errors)
    require('class="return-link" href="../"' in page, "return-to-QCTP link is not a same-origin relative parent link", errors)
    service_worker = (output / "sw.js").read_text(encoding="utf-8")
    for asset in ("sample-a.mp3", "sample-b.mp3", "sample-c.mp3", "manifest.json", "cue-grounding.json"):
        require(asset in service_worker, f"offline cache missing asset: {asset}", errors)
    require(
        'key.startsWith("qctp-rev3-voice-audition-")' in service_worker,
        "service-worker cleanup is not scoped to audition-owned caches",
        errors,
    )

    verification = {
        "schema": "qctp-rev3-blind-natural-voice-machine-verification-v1",
        "action_id": manifest.get("action_id"),
        "result": "PASS" if not errors else "FAIL",
        "manifest_sha256": sha256_file(manifest_path),
        "build_record_sha256": sha256_file(build_record_path),
        "private_route_assignment_sha256": sha256_file(reveal_path),
        "public_route_assignment_absent": not (output / "route-reveal.json").exists(),
        "licensing_record_sha256": sha256_file(licensing_path),
        "script_sha256": sha256_file(script_path),
        "cue_grounding_sha256": sha256_file(grounding_path),
        "day1_authority_commit_sha": authority_commit,
        "source_cue_grounding": "PASS_EXACT_TEXT_AND_DECLARED_HASHES_ALL_SIX",
        "route_count": len(revealed_samples),
        "distinct_engine_families": sorted({sample.get("engine_family") for sample in revealed_samples}),
        "identical_locked_text_all_routes": "PASS",
        "generation_pacing": "PASS_PINNED_PIPER_DEFAULT_AND_EXPLICIT_1_0_FOR_KOKORO_KITTEN_NO_POSTHOC_STRETCH",
        "real_silence": "PASS" if all(len(record.get("real_silence_runs_seconds", [])) >= 5 for record in acoustic.values()) else "FAIL",
        "broad_spectral_time_stretch": "PROHIBITED_NOT_USED",
        "matched_loudness": acoustic,
        "critical_asr": asr,
        "naturalness_gate": "OPEN_PHYSICAL_RYAN_SELECTION",
        "machine_metrics_can_promote_voice": False,
        "full_five_minute_render_authority": "WITHHELD",
        "full_twenty_five_minute_render_authority": "WITHHELD",
        "release_authority": "ZERO_RELEASE",
        "errors": errors,
    }
    (output / "machine-verification.json").write_text(json.dumps(verification, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(verification, indent=2))
    if errors:
        raise SystemExit("Rev3 voice-audition verification failed")


if __name__ == "__main__":
    main()
