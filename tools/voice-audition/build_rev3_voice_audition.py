#!/usr/bin/env python3
"""Build a three-engine, blind Rev3 voice audition without time-stretching."""
from __future__ import annotations

import argparse
import contextlib
import hashlib
import importlib.metadata
import json
import math
import os
import pathlib
import random
import subprocess
import tempfile
import time
import wave
from dataclasses import dataclass
from typing import Any, Callable

import numpy as np
import pyloudnorm as pyln
import soundfile as sf
from scipy.signal import resample_poly

SAMPLE_RATE = 24_000
TARGET_LUFS = -21.0
PEAK_LIMIT = 10 ** (-1.5 / 20)
LABELS = ("A", "B", "C")
REJECTED_ROUTE_MARKERS = ("chatterbox", "a03r", "chill brian", "heygen")


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


def run(command: list[str]) -> None:
    print("+", " ".join(command), flush=True)
    subprocess.run(command, check=True)


def ffprobe(path: pathlib.Path) -> dict[str, Any]:
    result = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "format=duration,format_name,bit_rate:stream=codec_name,sample_rate,channels",
            "-of",
            "json",
            str(path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout)


def resample(audio: np.ndarray, source_rate: int) -> np.ndarray:
    audio = np.asarray(audio, dtype=np.float32).reshape(-1)
    if source_rate == SAMPLE_RATE:
        return audio
    common = math.gcd(source_rate, SAMPLE_RATE)
    return resample_poly(audio, SAMPLE_RATE // common, source_rate // common).astype(np.float32)


def trim_and_fade(audio: np.ndarray) -> np.ndarray:
    audio = np.asarray(audio, dtype=np.float32).reshape(-1)
    if not len(audio) or not np.isfinite(audio).all():
        raise RuntimeError("TTS engine returned empty or non-finite audio")
    peak = float(np.max(np.abs(audio)))
    threshold = max(peak * 0.008, 1e-5)
    active = np.flatnonzero(np.abs(audio) >= threshold)
    if active.size:
        pad = int(0.075 * SAMPLE_RATE)
        start = max(0, int(active[0]) - pad)
        end = min(len(audio), int(active[-1]) + pad + 1)
        audio = audio[start:end]
    fade_in = min(len(audio), int(0.035 * SAMPLE_RATE))
    fade_out = min(len(audio), int(0.075 * SAMPLE_RATE))
    if fade_in:
        audio[:fade_in] *= np.linspace(0.0, 1.0, fade_in, dtype=np.float32)
    if fade_out:
        audio[-fade_out:] *= np.linspace(1.0, 0.0, fade_out, dtype=np.float32)
    return audio


def silence(seconds: float) -> np.ndarray:
    return np.zeros(int(round(seconds * SAMPLE_RATE)), dtype=np.float32)


def loudness_normalize(audio: np.ndarray) -> tuple[np.ndarray, float, float, float]:
    meter = pyln.Meter(SAMPLE_RATE)
    before = float(meter.integrated_loudness(audio.astype(np.float64)))
    normalized = pyln.normalize.loudness(audio.astype(np.float64), before, TARGET_LUFS)
    peak = float(np.max(np.abs(normalized)))
    if peak > PEAK_LIMIT:
        normalized *= PEAK_LIMIT / peak
    after = float(meter.integrated_loudness(normalized))
    return normalized.astype(np.float32), before, after, float(np.max(np.abs(normalized)))


@dataclass(frozen=True)
class Route:
    route_id: str
    engine_family: str
    engine_version: str
    model_id: str
    model_revision: str
    voice: str
    engine_license: str
    model_license: str
    dataset_or_voice_rights: str
    render: Callable[[str], tuple[np.ndarray, int]]
    model_files: tuple[pathlib.Path, ...]


def package_version(name: str) -> str:
    return importlib.metadata.version(name)


def create_routes(args: argparse.Namespace) -> list[Route]:
    # Engines are loaded sequentially and retained only for their own route.
    from piper import PiperVoice

    piper_model = args.piper_model.resolve()
    piper_config = args.piper_config.resolve()
    piper = PiperVoice.load(piper_model, config_path=piper_config, use_cuda=False)

    def render_piper(text: str) -> tuple[np.ndarray, int]:
        with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as temp:
            temp_path = pathlib.Path(temp.name)
        try:
            with contextlib.closing(wave.open(str(temp_path), "wb")) as wav_file:
                piper.synthesize_wav(text, wav_file)
            audio, rate = sf.read(temp_path, dtype="float32", always_2d=False)
            return np.asarray(audio, dtype=np.float32), int(rate)
        finally:
            temp_path.unlink(missing_ok=True)

    from kokoro_onnx import Kokoro

    kokoro_model = args.kokoro_model.resolve()
    kokoro_voices = args.kokoro_voices.resolve()
    kokoro = Kokoro(str(kokoro_model), str(kokoro_voices))

    def render_kokoro(text: str) -> tuple[np.ndarray, int]:
        audio, rate = kokoro.create(text, voice="af_heart", speed=1.0, lang="en-us")
        return np.asarray(audio, dtype=np.float32), int(rate)

    # KittenTTS resolves its pinned snapshot from the supplied local cache. Network
    # access is disabled here so a successful build proves the route is local.
    os.environ["HF_HUB_OFFLINE"] = "1"
    from kittentts import KittenTTS

    kitten = KittenTTS("kitten-tts-mini-0.8", cache_dir=str(args.kitten_cache.resolve()))
    kitten_runtime_model = pathlib.Path(kitten.model.model_path).resolve()
    kitten_runtime_voices = pathlib.Path(kitten.model.voices.fid.name).resolve()
    kitten_attestation_model = args.kitten_attestation_model.resolve()
    kitten_attestation_voices = args.kitten_attestation_voices.resolve()
    if sha256_file(kitten_runtime_model) != sha256_file(kitten_attestation_model):
        raise RuntimeError("KittenTTS runtime model does not match the pinned attestation model")
    if sha256_file(kitten_runtime_voices) != sha256_file(kitten_attestation_voices):
        raise RuntimeError("KittenTTS runtime voices do not match the pinned attestation voices")

    def render_kitten(text: str) -> tuple[np.ndarray, int]:
        audio = kitten.generate(text, voice="Jasper", speed=1.0, clean_text=False)
        return np.asarray(audio, dtype=np.float32), SAMPLE_RATE

    return [
        Route(
            route_id="PIPER_LJSPEECH_HIGH_V1",
            engine_family="Piper VITS ONNX",
            engine_version=package_version("piper-tts"),
            model_id="rhasspy/piper-voices/en_US-ljspeech-high",
            model_revision="v1.0.0",
            voice="LJSpeech single-speaker stock voice",
            engine_license="GPL-3.0-or-later (generator not redistributed in this package)",
            model_license="MIT repository metadata",
            dataset_or_voice_rights="LJ Speech dataset: public domain; no cloned reference",
            render=render_piper,
            model_files=(piper_model, piper_config),
        ),
        Route(
            route_id="KOKORO_82M_V1_AF_HEART",
            engine_family="Kokoro 82M ONNX",
            engine_version=package_version("kokoro-onnx"),
            model_id="hexgrad/Kokoro-82M",
            model_revision="v1.0 / model-files-v1.0",
            voice="af_heart stock model voice",
            engine_license="MIT",
            model_license="Apache-2.0",
            dataset_or_voice_rights="Stock model voice; publisher records permissive/non-copyrighted training data and required CC attribution; no cloned reference",
            render=render_kokoro,
            model_files=(kokoro_model, kokoro_voices),
        ),
        Route(
            route_id="KITTEN_TTS_MINI_0_8_JASPER",
            engine_family="KittenTTS Mini ONNX",
            engine_version=package_version("kittentts"),
            model_id="KittenML/kitten-tts-mini-0.8",
            model_revision="c02725660cea441db4c383af69f1f26f5cd00947",
            voice="Jasper stock model voice",
            engine_license="Apache-2.0",
            model_license="Apache-2.0",
            dataset_or_voice_rights="Publisher-supplied stock model voice; no cloned reference",
            render=render_kitten,
            model_files=(kitten_runtime_model, kitten_runtime_voices),
        ),
    ]


def render_route(route: Route, segments: list[dict[str, Any]]) -> tuple[np.ndarray, list[dict[str, Any]], float]:
    pieces: list[np.ndarray] = []
    records: list[dict[str, Any]] = []
    started = time.perf_counter()
    for segment in segments:
        segment_started = time.perf_counter()
        raw, rate = route.render(segment["text"])
        generated = trim_and_fade(resample(raw, rate))
        pause = float(segment["silence_after_seconds"])
        pieces.append(generated)
        if pause:
            pieces.append(silence(pause))
        records.append(
            {
                "id": segment["id"],
                "source_cue_id": segment["source_cue_id"],
                "text_sha256": segment["text_sha256"],
                "generated_duration_seconds": round(len(generated) / SAMPLE_RATE, 6),
                "source_sample_rate": rate,
                "real_silence_after_seconds": pause,
                "generation_seconds": round(time.perf_counter() - segment_started, 3),
            }
        )
    combined = np.concatenate(pieces).astype(np.float32)
    return combined, records, time.perf_counter() - started


def encode_mp3(wav_path: pathlib.Path, mp3_path: pathlib.Path) -> None:
    run(
        [
            "ffmpeg",
            "-y",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            str(wav_path),
            "-codec:a",
            "libmp3lame",
            "-b:a",
            "160k",
            "-ar",
            str(SAMPLE_RATE),
            "-ac",
            "1",
            str(mp3_path),
        ]
    )


def write_route_audio(
    output: pathlib.Path,
    label: str,
    route: Route,
    segments: list[dict[str, Any]],
) -> tuple[dict[str, Any], dict[str, Any]]:
    audio, segment_records, elapsed = render_route(route, segments)
    audio, before_lufs, after_lufs, peak = loudness_normalize(audio)
    mp3_path = output / f"sample-{label.lower()}.mp3"
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as temp:
        wav_path = pathlib.Path(temp.name)
    try:
        sf.write(wav_path, audio, SAMPLE_RATE, subtype="PCM_24")
        encode_mp3(wav_path, mp3_path)
    finally:
        wav_path.unlink(missing_ok=True)
    blind = {
        "sample_code": label,
        "file": mp3_path.name,
        "bytes": mp3_path.stat().st_size,
        "sha256": sha256_file(mp3_path),
        "duration_seconds": round(len(audio) / SAMPLE_RATE, 6),
        "target_lufs": TARGET_LUFS,
        "measured_lufs_before_normalization": round(before_lufs, 4),
        "measured_lufs_after_normalization": round(after_lufs, 4),
        "peak_linear": round(peak, 6),
        "delivery": "SOURCE_CUE_SEGMENTS_PLUS_INSERTED_REAL_SILENCE",
        "model_native_speed": 1.0,
        "spectral_time_stretch_used": False,
        "time_stretch_factor": 1.0,
        "inserted_real_silence_seconds": round(sum(float(s["silence_after_seconds"]) for s in segments), 3),
        "segment_count": len(segments),
        "probe": ffprobe(mp3_path),
    }
    revealed = {
        **blind,
        "route_id": route.route_id,
        "engine_family": route.engine_family,
        "engine_version": route.engine_version,
        "model_id": route.model_id,
        "model_revision": route.model_revision,
        "voice": route.voice,
        "engine_license": route.engine_license,
        "model_license": route.model_license,
        "dataset_or_voice_rights": route.dataset_or_voice_rights,
        "model_files": [
            {"name": path.name, "bytes": path.stat().st_size, "sha256": sha256_file(path)}
            for path in route.model_files
        ],
        "render_seconds": round(elapsed, 3),
        "segments": segment_records,
    }
    blind["route_commitment_sha256"] = sha256_bytes(canonical_json(revealed))
    revealed["route_commitment_sha256"] = blind["route_commitment_sha256"]
    return blind, revealed


def copy_static_files(static_dir: pathlib.Path, output: pathlib.Path) -> None:
    for name in ("index.html", "sw.js", "manifest.webmanifest"):
        source = static_dir / name
        if not source.exists():
            raise FileNotFoundError(source)
        (output / name).write_bytes(source.read_bytes())


def require_files(paths: list[pathlib.Path]) -> None:
    for path in paths:
        if not path.exists() or path.stat().st_size == 0:
            raise FileNotFoundError(path)


def resolve_route_assignment(
    routes: list[Route],
    *,
    blind_seed: int | None,
    private_mapping_input: pathlib.Path | None,
) -> tuple[list[Route], dict[str, Any]]:
    """Resolve A/B/C without ever copying the assignment into public output."""
    if private_mapping_input is not None:
        mapping_path = private_mapping_input.resolve()
        require_files([mapping_path])
        mapping = json.loads(mapping_path.read_text(encoding="utf-8"))
        if mapping.get("schema") != "qctp-rev3-blind-natural-voice-route-reveal-v1":
            raise RuntimeError("Private mapping replay schema mismatch")
        if mapping.get("release_authority") != "ZERO_RELEASE":
            raise RuntimeError("Private mapping replay release authority changed")
        samples = mapping.get("samples", [])
        route_by_id = {route.route_id: route for route in routes}
        route_id_by_label = {
            sample.get("sample_code"): sample.get("route_id") for sample in samples
        }
        if set(route_id_by_label) != set(LABELS):
            raise RuntimeError("Private mapping replay must contain exactly A, B, and C")
        if set(route_id_by_label.values()) != set(route_by_id):
            raise RuntimeError("Private mapping replay does not match the current route set")
        assigned = [route_by_id[route_id_by_label[label]] for label in LABELS]
        return assigned, {
            "algorithm": "CONTROLLED_PRIVATE_MAPPING_REPLAY",
            "input_commitment_sha256": sha256_file(mapping_path),
        }

    if blind_seed is None:
        raise RuntimeError("A blind seed or controlled private mapping is required")
    assigned = list(routes)
    random.Random(blind_seed).shuffle(assigned)
    return assigned, {
        "algorithm": "CONTROLLED_PRIVATE_RANDOM_ASSIGNMENT",
    }


def validate_cue_grounding(grounding: dict[str, Any], script: dict[str, Any], script_path: pathlib.Path) -> None:
    if grounding.get("schema") != "qctp-rev3-voice-audition-cue-grounding-v1":
        raise RuntimeError("Cue-grounding schema mismatch")
    if grounding.get("result") != "PASS" or grounding.get("release_authority") != "ZERO_RELEASE":
        raise RuntimeError("Cue grounding is not a ZERO_RELEASE PASS")
    if grounding.get("audition_script", {}).get("sha256") != sha256_file(script_path):
        raise RuntimeError("Cue grounding does not cover the selected audition script")
    authority = grounding.get("authority", {})
    resolved_commit = authority.get("resolved_commit_sha", "")
    if len(resolved_commit) != 40 or any(character not in "0123456789abcdef" for character in resolved_commit):
        raise RuntimeError("Cue grounding lacks an immutable authority commit SHA")
    source_hash = authority.get("script_manifest", {}).get("semantic_script_sha256")
    if source_hash != script.get("source_script_sha256"):
        raise RuntimeError("Cue grounding source semantic hash differs from the audition script")
    grounded = {cue.get("audition_segment_id"): cue for cue in grounding.get("cues", [])}
    if len(grounded) != len(script.get("segments", [])):
        raise RuntimeError("Cue grounding does not cover every audition segment")
    for segment in script.get("segments", []):
        evidence = grounded.get(segment.get("id"), {})
        if (
            evidence.get("source_cue_id") != segment.get("source_cue_id")
            or evidence.get("audition_text_sha256") != segment.get("text_sha256")
            or evidence.get("exact_text_match") is not True
            or evidence.get("declared_hashes_match") is not True
        ):
            raise RuntimeError(f"Cue grounding mismatch: {segment.get('id')}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--script", type=pathlib.Path, required=True)
    parser.add_argument(
        "--cue-grounding",
        type=pathlib.Path,
        help="Grounding evidence generated from origin/main (defaults beside --script)",
    )
    parser.add_argument("--static-dir", type=pathlib.Path, required=True)
    parser.add_argument("--output", type=pathlib.Path, required=True)
    parser.add_argument(
        "--private-output",
        type=pathlib.Path,
        required=True,
        help="Controlled non-public directory for the blind label-to-route mapping",
    )
    parser.add_argument("--piper-model", type=pathlib.Path, required=True)
    parser.add_argument("--piper-config", type=pathlib.Path, required=True)
    parser.add_argument("--kokoro-model", type=pathlib.Path, required=True)
    parser.add_argument("--kokoro-voices", type=pathlib.Path, required=True)
    parser.add_argument("--kitten-cache", type=pathlib.Path, required=True)
    parser.add_argument("--kitten-attestation-model", type=pathlib.Path, required=True)
    parser.add_argument("--kitten-attestation-voices", type=pathlib.Path, required=True)
    assignment = parser.add_mutually_exclusive_group(required=True)
    assignment.add_argument(
        "--blind-seed",
        type=int,
        help="One-time private seed for a new assignment; never publish the value",
    )
    assignment.add_argument(
        "--private-mapping-input",
        type=pathlib.Path,
        help="Controlled route-reveal artifact used to replay the existing A/B/C assignment",
    )
    args = parser.parse_args()

    os.environ.setdefault("OMP_NUM_THREADS", "4")
    os.environ.setdefault("ORT_NUM_THREADS", "4")
    os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")

    script_path = args.script.resolve()
    script = json.loads(script_path.read_text(encoding="utf-8"))
    if script.get("schema") != "qctp-rev3-natural-voice-audition-script-v1":
        raise RuntimeError("Audition script schema mismatch")
    segments = script.get("segments", [])
    if {segment.get("requirement") for segment in segments} != {
        "opening",
        "HeartMath five-in/five-out coaching",
        "HeartMath comfort override",
        "spatial attention",
        "complete return",
    }:
        raise RuntimeError("Audition text does not cover all controlled representative requirements")
    for segment in segments:
        actual = sha256_bytes(segment["text"].encode("utf-8"))
        if actual != segment["text_sha256"]:
            raise RuntimeError(f"Locked text hash mismatch: {segment['id']} {actual}")
    cue_grounding_path = (
        args.cue_grounding.resolve()
        if args.cue_grounding
        else script_path.with_name("cue-grounding.rev0.json")
    )
    require_files([cue_grounding_path])
    cue_grounding = json.loads(cue_grounding_path.read_text(encoding="utf-8"))
    validate_cue_grounding(cue_grounding, script, script_path)

    required = [
        args.piper_model,
        args.piper_config,
        args.kokoro_model,
        args.kokoro_voices,
        args.kitten_attestation_model,
        args.kitten_attestation_voices,
    ]
    require_files([path.resolve() for path in required])
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    private_output = args.private_output.resolve()
    private_output.mkdir(parents=True, exist_ok=True)
    copy_static_files(args.static_dir.resolve(), output)
    (output / "cue-grounding.json").write_bytes(cue_grounding_path.read_bytes())

    routes = create_routes(args)
    route_text = " ".join(route.route_id.lower() for route in routes)
    if any(marker in route_text for marker in REJECTED_ROUTE_MARKERS):
        raise RuntimeError("Rejected A03R/provider-clone route entered the Rev3 audition")
    if len({route.engine_family for route in routes}) != 3:
        raise RuntimeError("The audition requires three materially different engine families")

    assigned_routes, assignment_provenance = resolve_route_assignment(
        routes,
        blind_seed=args.blind_seed,
        private_mapping_input=args.private_mapping_input,
    )
    blind_samples: list[dict[str, Any]] = []
    revealed_samples: list[dict[str, Any]] = []
    build_started = time.perf_counter()
    for label, route in zip(LABELS, assigned_routes, strict=True):
        print(f"Rendering blind sample {label}", flush=True)
        blind, revealed = write_route_audio(output, label, route, segments)
        blind_samples.append(blind)
        revealed_samples.append(revealed)

    locked_text = " ".join(segment["text"] for segment in segments)
    script_sha = sha256_file(script_path)
    manifest = {
        "schema": "qctp-rev3-blind-natural-voice-audition-v1",
        "action_id": "QCTP-REV3-NATURAL-VOICE-AUDITION-A01",
        "status": "MACHINE_BUILD_COMPLETE_PHYSICAL_SELECTION_OPEN",
        "release_authority": "ZERO_RELEASE",
        "purpose": "Short physical naturalness selection before any five- or twenty-five-minute narration render.",
        "blind_labels": list(LABELS),
        "none_option_required": True,
        "label_assignment": "CONTROLLED_NON_PUBLIC_MAPPING_REVEALED_ONLY_AFTER_REPORTED_SELECTION",
        "randomization": {
            **assignment_provenance,
            "route_order_commitment_sha256": sha256_bytes(canonical_json([sample["route_commitment_sha256"] for sample in blind_samples])),
        },
        "audition_script": {
            "file": "audition-script.json",
            "sha256": script_sha,
            "locked_text_sha256": sha256_bytes(locked_text.encode("utf-8")),
            "source_script_id": script["source_script_id"],
            "source_script_sha256": script["source_script_sha256"],
            "requirements": [
                "opening",
                "HeartMath five-in/five-out coaching and comfort override",
                "spatial attention",
                "complete return",
            ],
        },
        "audio_contract": {
            "same_identical_text_all_routes": True,
            "generation_pacing": {
                "piper": "PINNED_MODEL_AND_CONFIG_DEFAULTS",
                "kokoro": "EXPLICIT_SPEED_1_0",
                "kitten_tts": "EXPLICIT_SPEED_1_0",
                "post_render_spectral_time_stretch": "NONE",
            },
            "real_silence_inserted_between_source_cues": True,
            "broad_spectral_time_stretch": "PROHIBITED_AND_NOT_USED",
            "target_integrated_lufs": TARGET_LUFS,
            "sample_rate": SAMPLE_RATE,
            "channels": 1,
            "same_origin_relative_media": True,
        },
        "samples": blind_samples,
        "route_assignment": {
            "availability": "CONTROLLED_ARTIFACT_ONLY_NOT_PUBLIC_OR_FETCHABLE",
            "reveal_condition": "AFTER_RYAN_REPORTS_PHYSICAL_SELECTION",
        },
        "physical_gate": {
            "status": "OPEN_RYAN_IPHONE_SELECTION",
            "valid_choices": ["A", "B", "C", "NONE"],
            "human_naturalness_is_governing": True,
            "machine_or_browser_pass_cannot_select_a_voice": True,
            "full_25_minute_render_authorized": False,
        },
    }
    reveal = {
        "schema": "qctp-rev3-blind-natural-voice-route-reveal-v1",
        "action_id": manifest["action_id"],
        "release_authority": "ZERO_RELEASE",
        "reveal_condition": "Controlled operator opens this artifact only after Ryan reports a physical A/B/C/NONE selection.",
        "samples": revealed_samples,
        "rejected_route_excluded": "A03R Chatterbox Nano / Chill Brian clone route",
    }
    (output / "audition-script.json").write_bytes(script_path.read_bytes())
    reveal_path = private_output / "route-reveal.json"
    reveal_path.write_text(json.dumps(reveal, indent=2) + "\n", encoding="utf-8")
    manifest["route_assignment"]["commitment_sha256"] = sha256_file(reveal_path)
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    build_record = {
        "schema": "qctp-rev3-voice-audition-build-record-v1",
        "result": "PASS",
        "elapsed_seconds": round(time.perf_counter() - build_started, 3),
        "python": os.sys.version,
        "packages": {
            name: package_version(name)
            for name in ("piper-tts", "kokoro-onnx", "kittentts", "numpy", "soundfile", "pyloudnorm")
        },
        "manifest_sha256": sha256_file(output / "manifest.json"),
        "private_route_assignment_sha256": sha256_file(reveal_path),
        "script_sha256": script_sha,
        "cue_grounding_sha256": sha256_file(output / "cue-grounding.json"),
        "public_cli_invocation_recorded": False,
        "blind_seed_disclosed": False,
        "reproduction_evidence_scope": "Runtime/package plus source-grounding and output hashes; pinned-model hashes are committed inside the hashed controlled non-public route assignment; not a public command transcript.",
        "public_route_assignment_present": False,
        "full_25_minute_rendered": False,
        "release_authority": "ZERO_RELEASE",
    }
    (output / "build-record.json").write_text(json.dumps(build_record, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"result": "PASS", "labels": list(LABELS), "elapsed_seconds": build_record["elapsed_seconds"]}, indent=2))


if __name__ == "__main__":
    main()
