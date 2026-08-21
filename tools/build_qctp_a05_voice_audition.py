#!/usr/bin/env python3
"""Build QCTP A05 blind voice-naturalness audition samples without broad time-stretch."""
from __future__ import annotations

import argparse
import gc
import hashlib
import json
import math
import pathlib
import subprocess
import time
from typing import Any

import librosa
import numpy as np
import pyloudnorm as pyln
import soundfile as sf
import torch
from chatterbox.tts_turbo import ChatterboxTurboTTS

SAMPLE_RATE = 24000
TARGET_LUFS = -18.0
PEAK_LIMIT = 0.80
SOURCE_ENGINE_COMMIT = "5de7a54aa4e5e2baadb0182dde554908b48b85c2"
LOCKED_SCRIPT_SHA = "2649ce70e5ab824dbc6b797e07082567fda2443962016e8e6c7dbe454f5ee555"
AUDITION_TEXT_SEGMENTS = [
    "Sit with both feet supported and let your hands rest.",
    "Close your eyes.",
    "Before changing anything, notice the state you brought into the session.",
    "Notice the tone of the mind, the strongest emotion, the natural breath, and the effort in the jaw, shoulders, chest, and abdomen.",
    "Do not correct them yet.",
]
AUDITION_TEXT = " ".join(AUDITION_TEXT_SEGMENTS)
PAUSE_SECONDS = [0.65, 0.90, 1.75, 0.80]


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: pathlib.Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def run(command: list[str]) -> None:
    print("+", " ".join(command), flush=True)
    subprocess.run(command, check=True)


def ffprobe(path: pathlib.Path) -> dict[str, Any]:
    completed = subprocess.run(
        [
            "ffprobe", "-v", "error", "-show_entries",
            "format=duration,format_name,bit_rate:stream=codec_name,sample_rate,channels",
            "-of", "json", str(path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(completed.stdout)


def resample(audio: np.ndarray, source_rate: int) -> np.ndarray:
    if source_rate == SAMPLE_RATE:
        return audio.astype(np.float32)
    return librosa.resample(audio.astype(np.float32), orig_sr=source_rate, target_sr=SAMPLE_RATE).astype(np.float32)


def trim(audio: np.ndarray, top_db: float = 45.0) -> np.ndarray:
    if audio.size == 0:
        raise RuntimeError("TTS returned empty audio")
    trimmed, _ = librosa.effects.trim(audio.astype(np.float32), top_db=top_db)
    pad = np.zeros(int(0.045 * SAMPLE_RATE), dtype=np.float32)
    return np.concatenate([pad, trimmed.astype(np.float32), pad])


def fade(audio: np.ndarray, fade_in_seconds: float = 0.04, fade_out_seconds: float = 0.08) -> np.ndarray:
    result = audio.astype(np.float32).copy()
    fade_in = min(len(result), int(fade_in_seconds * SAMPLE_RATE))
    fade_out = min(len(result), int(fade_out_seconds * SAMPLE_RATE))
    if fade_in:
        result[:fade_in] *= np.linspace(0.0, 1.0, fade_in, dtype=np.float32)
    if fade_out:
        result[-fade_out:] *= np.linspace(1.0, 0.0, fade_out, dtype=np.float32)
    return result


def normalize(audio: np.ndarray) -> tuple[np.ndarray, float, float]:
    meter = pyln.Meter(SAMPLE_RATE)
    measured = float(meter.integrated_loudness(audio.astype(np.float64)))
    normalized = pyln.normalize.loudness(audio.astype(np.float64), measured, TARGET_LUFS)
    peak = float(np.max(np.abs(normalized)))
    if peak > PEAK_LIMIT:
        normalized *= PEAK_LIMIT / peak
    final_peak = float(np.max(np.abs(normalized)))
    return normalized.astype(np.float32), measured, final_peak


def silence(seconds: float) -> np.ndarray:
    return np.zeros(max(1, int(round(seconds * SAMPLE_RATE))), dtype=np.float32)


def render_one(
    model: ChatterboxTurboTTS,
    text: str,
    seed: int,
    *,
    temperature: float = 0.8,
    top_p: float = 0.95,
    top_k: int = 1000,
    repetition_penalty: float = 1.2,
) -> tuple[np.ndarray, float]:
    torch.manual_seed(seed)
    started = time.time()
    wav = model.generate(
        text,
        temperature=temperature,
        top_p=top_p,
        top_k=top_k,
        repetition_penalty=repetition_penalty,
    )
    generation_seconds = time.time() - started
    audio = wav.squeeze().detach().cpu().numpy().astype(np.float32)
    audio = fade(trim(resample(audio, model.sr)))
    return audio, generation_seconds


def render_single_pass(
    *,
    nano: bool,
    reference: pathlib.Path,
    seed: int,
    label: str,
) -> tuple[np.ndarray, dict[str, Any]]:
    load_started = time.time()
    model = ChatterboxTurboTTS.from_pretrained(device="cpu", nano=nano)
    load_seconds = time.time() - load_started
    model.prepare_conditionals(str(reference))
    audio, generation_seconds = render_one(model, AUDITION_TEXT, seed)
    record = {
        "engine": "CHATTERBOX_NANO" if nano else "CHATTERBOX_TURBO",
        "delivery": "SINGLE_PASS_NATURAL_DURATION",
        "time_stretch_factor": 1.0,
        "spectral_time_stretch_used": False,
        "load_seconds": load_seconds,
        "generation_seconds": generation_seconds,
        "raw_duration_seconds": len(audio) / SAMPLE_RATE,
        "segment_count": 1,
        "label": label,
    }
    del model
    gc.collect()
    return audio, record


def render_pause_composed(reference: pathlib.Path, seed: int, label: str) -> tuple[np.ndarray, dict[str, Any]]:
    load_started = time.time()
    model = ChatterboxTurboTTS.from_pretrained(device="cpu", nano=False)
    load_seconds = time.time() - load_started
    model.prepare_conditionals(str(reference))
    pieces: list[np.ndarray] = []
    segment_records: list[dict[str, Any]] = []
    total_generation = 0.0
    for index, text in enumerate(AUDITION_TEXT_SEGMENTS):
        audio, generation_seconds = render_one(model, text, seed + index * 101)
        total_generation += generation_seconds
        pieces.append(audio)
        segment_records.append({
            "index": index,
            "text": text,
            "text_sha256": sha256_bytes(text.encode("utf-8")),
            "generated_duration_seconds": len(audio) / SAMPLE_RATE,
            "generation_seconds": generation_seconds,
            "pause_after_seconds": PAUSE_SECONDS[index] if index < len(PAUSE_SECONDS) else 0.0,
        })
        if index < len(PAUSE_SECONDS):
            pieces.append(silence(PAUSE_SECONDS[index]))
    combined = np.concatenate(pieces).astype(np.float32)
    record = {
        "engine": "CHATTERBOX_TURBO",
        "delivery": "CLAUSE_AND_SENTENCE_PAUSE_COMPOSED",
        "time_stretch_factor": 1.0,
        "spectral_time_stretch_used": False,
        "load_seconds": load_seconds,
        "generation_seconds": total_generation,
        "raw_duration_seconds": len(combined) / SAMPLE_RATE,
        "segment_count": len(AUDITION_TEXT_SEGMENTS),
        "inserted_silence_seconds": sum(PAUSE_SECONDS),
        "segments": segment_records,
        "label": label,
    }
    del model
    gc.collect()
    return combined, record


def encode_mp3(wav_path: pathlib.Path, mp3_path: pathlib.Path) -> None:
    run([
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error",
        "-i", str(wav_path), "-ar", str(SAMPLE_RATE), "-ac", "1",
        "-codec:a", "libmp3lame", "-b:a", "128k", str(mp3_path),
    ])


def write_sample(output: pathlib.Path, code: str, audio: np.ndarray, record: dict[str, Any]) -> dict[str, Any]:
    normalized, measured_lufs, peak = normalize(audio)
    wav_path = output / f"sample-{code}.wav"
    mp3_path = output / f"sample-{code}.mp3"
    sf.write(wav_path, normalized, SAMPLE_RATE, subtype="PCM_24")
    encode_mp3(wav_path, mp3_path)
    record.update({
        "sample_code": code.upper(),
        "file": mp3_path.name,
        "wav_file": wav_path.name,
        "duration_seconds": len(normalized) / SAMPLE_RATE,
        "pre_normalization_lufs": measured_lufs,
        "target_lufs": TARGET_LUFS,
        "peak_linear": peak,
        "mp3_bytes": mp3_path.stat().st_size,
        "mp3_sha256": sha256_file(mp3_path),
        "wav_bytes": wav_path.stat().st_size,
        "wav_sha256": sha256_file(wav_path),
        "probe": ffprobe(mp3_path),
    })
    return record


def build_html(output: pathlib.Path) -> None:
    html = r'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>QCTP A05 Voice Naturalness Audition</title>
<style>
:root{color-scheme:dark;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#071017;color:#f4f7f8}body{margin:0;background:radial-gradient(circle at top,#17313b,#071017 58%);min-height:100vh}.wrap{max-width:720px;margin:auto;padding:calc(22px + env(safe-area-inset-top)) 18px calc(34px + env(safe-area-inset-bottom))}.eyebrow{letter-spacing:.16em;text-transform:uppercase;color:#92c7cd;font-size:.75rem}.card{background:rgba(10,24,32,.9);border:1px solid #29434d;border-radius:18px;padding:18px;margin:14px 0;box-shadow:0 14px 40px rgba(0,0,0,.25)}h1{font-size:1.85rem;line-height:1.08;margin:.25rem 0 1rem}h2{font-size:1.1rem;margin:.2rem 0 1rem}.warning{background:#402d12;border:1px solid #8a6427;color:#ffe3a4;border-radius:12px;padding:12px;font-weight:700}.samples{display:grid;grid-template-columns:1fr;gap:10px}button{font:inherit;border-radius:14px;border:1px solid #45636d;padding:14px;background:#122b35;color:#fff;text-align:left}button.active{border-color:#93d7dc;background:#1b404b}.play{width:100%;text-align:center;background:#d8f4f2;color:#071017;border:none;font-weight:800;margin-top:12px}audio{width:100%;margin-top:14px}.fine{color:#aabcc2;font-size:.92rem;line-height:1.5}.result{font-size:1.05rem;font-weight:700;color:#d9f4f1}code{word-break:break-all}
</style></head><body><main class="wrap">
<p class="eyebrow">QCTP · A05 voice recovery</p><h1>Blind voice-naturalness audition</h1>
<div class="warning">VOICE TEST ONLY — NO MEDITATION AND NO COMPLETION CREDIT.</div>
<section class="card"><h2>What changed</h2><p class="fine">All three samples use the same locked opening wording and the same authorized voice reference. None uses the broad time-stretch that distorted the rejected A03 voice. Listen only long enough to decide which sounds most human.</p></section>
<section class="card"><h2>Choose a sample</h2><div class="samples">
<button data-src="sample-a.mp3" class="active"><b>Sample A</b><br><span class="fine">Exact same script. Voice-only.</span></button>
<button data-src="sample-b.mp3"><b>Sample B</b><br><span class="fine">Exact same script. Voice-only.</span></button>
<button data-src="sample-c.mp3"><b>Sample C</b><br><span class="fine">Exact same script. Voice-only.</span></button>
</div><button class="play" id="play">Play selected sample</button><audio id="player" controls preload="metadata" playsinline></audio><p class="fine" id="status">Sample A selected.</p></section>
<section class="card"><h2>Report one result</h2><p class="result">Best: A, B, C, or NONE</p><p class="fine">Add a few words about what still sounds artificial: voice tone, rhythm, stretched syllables, pauses, pronunciation, emotion, or something else. You do not need to listen to every sample all the way through once there is a clear answer.</p></section>
<p class="fine">Naturalness remains a physical acceptance gate. Machine verification confirms wording, files, and playback only. Release authority: ZERO RELEASE.</p>
</main><script>
const player=document.getElementById('player'),play=document.getElementById('play'),status=document.getElementById('status');let src='sample-a.mp3',label='A';
document.querySelectorAll('[data-src]').forEach(button=>button.onclick=()=>{document.querySelectorAll('[data-src]').forEach(x=>x.classList.remove('active'));button.classList.add('active');src=button.dataset.src;label=button.textContent.trim().split(/\s+/)[1];player.pause();player.removeAttribute('src');player.load();status.textContent='Sample '+label+' selected.'});
play.onclick=async()=>{player.src=src+'?v=1';player.currentTime=0;try{await player.play();status.textContent='Playing Sample '+label+'.'}catch(error){status.textContent='Playback did not start. Tap the audio control once or reload Safari.'}};
</script></body></html>'''
    (output / "index.html").write_text(html, encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--reference", type=pathlib.Path, required=True)
    parser.add_argument("--output", type=pathlib.Path, required=True)
    args = parser.parse_args()
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    reference = args.reference.resolve()
    if not reference.exists():
        raise FileNotFoundError(reference)

    reference_info = sf.info(reference)
    if reference_info.duration < 5.0:
        raise RuntimeError("Voice reference must exceed five seconds")

    torch.set_num_threads(max(1, min(8, torch.get_num_threads())))
    np.random.seed(20260820)
    torch.manual_seed(20260820)

    samples: list[dict[str, Any]] = []
    sample_a, record_a = render_single_pass(
        nano=True,
        reference=reference,
        seed=2026082001,
        label="BLIND_A",
    )
    samples.append(write_sample(output, "a", sample_a, record_a))

    sample_b, record_b = render_single_pass(
        nano=False,
        reference=reference,
        seed=2026082002,
        label="BLIND_B",
    )
    samples.append(write_sample(output, "b", sample_b, record_b))

    sample_c, record_c = render_pause_composed(
        reference=reference,
        seed=2026082100,
        label="BLIND_C",
    )
    samples.append(write_sample(output, "c", sample_c, record_c))

    build_html(output)
    manifest = {
        "schema": "qctp-a05-voice-naturalness-audition-v1",
        "action_id": "QCTP-D1-AUDIO-A05",
        "status": "MACHINE_BUILD_COMPLETE_PHYSICAL_NATURALNESS_OPEN",
        "release_authority": "ZERO_RELEASE",
        "purpose": "Isolate broad time-stretch and model-capacity effects before any full Day 1 rebuild.",
        "locked_script_sha256": LOCKED_SCRIPT_SHA,
        "audition_text": AUDITION_TEXT,
        "audition_text_sha256": sha256_bytes(AUDITION_TEXT.encode("utf-8")),
        "audition_segment_sha256": [sha256_bytes(text.encode("utf-8")) for text in AUDITION_TEXT_SEGMENTS],
        "reference": {
            "path": reference.name,
            "bytes": reference.stat().st_size,
            "sha256": sha256_file(reference),
            "duration_seconds": reference_info.duration,
            "sample_rate": reference_info.samplerate,
            "channels": reference_info.channels,
        },
        "source_engine_commit": SOURCE_ENGINE_COMMIT,
        "experimental_matrix": {
            "A": "Chatterbox Nano, single-pass, natural generated duration, no spectral time-stretch",
            "B": "Chatterbox Turbo, single-pass, natural generated duration, no spectral time-stretch",
            "C": "Chatterbox Turbo, sentence/clause generated and pause-composed, no spectral time-stretch",
        },
        "samples": samples,
        "physical_acceptance": {
            "naturalness": "OPEN",
            "required_response": "Best: A, B, C, or NONE; identify remaining artificial quality.",
            "full_session_rebuild_authorized": False,
        },
    }
    (output / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "result": "PASS",
        "samples": [{"code": s["sample_code"], "duration_seconds": s["duration_seconds"], "engine": s["engine"]} for s in samples],
        "manifest_sha256": sha256_file(output / "manifest.json"),
        "naturalness": "OPEN_PHYSICAL",
    }, indent=2))


if __name__ == "__main__":
    main()
