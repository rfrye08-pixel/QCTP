#!/usr/bin/env python3
"""Build QCTP Day 1 A03 locked-script audio assets and the five-minute acceptance package."""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import pathlib
import random
import shutil
import subprocess
import time
from typing import Any, Iterable

import librosa
import numpy as np
import pyloudnorm as pyln
import soundfile as sf
import torch
from scipy import signal
from chatterbox.tts_turbo import ChatterboxTurboTTS

SCRIPT_SHA = "2649ce70e5ab824dbc6b797e07082567fda2443962016e8e6c7dbe454f5ee555"
SCRIPT_ID = "QCTP-D1-SOURCE-LABELED-SCRIPT-CANDIDATE-REV0"
DURATION_SECONDS = 1500
PREVIEW_SECONDS = 300
SAMPLE_RATE = 24000
VOICE_TARGET_LUFS = -18.0
SUPPORT_AMBIENT_LUFS = -32.0
SUPPORT_MINIMAL_LUFS = -38.0
MARKER_LEAD_SECONDS = 0.40
MARKER_DURATION_SECONDS = 0.26
BED_DUCK_LEAD_SECONDS = 0.90
BED_DUCK_DB = -3.0
BED_RESTORE_SECONDS = 0.80
SOURCE_ENGINE_COMMIT = "5de7a54aa4e5e2baadb0182dde554908b48b85c2"

PREVIEW_MAP = [
    (0.0, "D1-A02-000"),
    (22.0, "D1-A02-048"),
    (52.0, "D1-A02-108"),
    (80.0, "D1-A02-165"),
    (98.0, "D1-A02-180"),
    (124.0, "D1-A02-210"),
    (150.0, "D1-A02-245"),
    (176.0, "D1-A02-285"),
    (204.0, "D1-A02-462"),
    (225.0, "D1-A02-480"),
    (248.0, "D1-A02-750"),
    (267.0, "D1-A02-1135"),
    (282.0, "D1-A02-1440"),
    (296.0, "D1-A02-1495"),
]


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sha256_file(path: pathlib.Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def run(command: list[str], cwd: pathlib.Path | None = None) -> None:
    print("+", " ".join(command), flush=True)
    subprocess.run(command, cwd=cwd, check=True)


def ffprobe(path: pathlib.Path) -> dict[str, Any]:
    result = subprocess.run(
        [
            "ffprobe", "-v", "error", "-show_entries",
            "format=duration,format_name,bit_rate:stream=codec_name,sample_rate,channels",
            "-of", "json", str(path),
        ],
        check=True,
        capture_output=True,
        text=True,
    )
    return json.loads(result.stdout)


def load_cues(root: pathlib.Path) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    manifest = json.loads((root / "QCTP_DAY1_SOURCE_LABELED_SCRIPT_CANDIDATE_REV0.json").read_text(encoding="utf-8"))
    if manifest["script_id"] != SCRIPT_ID or manifest["script_sha256"] != SCRIPT_SHA:
        raise RuntimeError("Locked script identity mismatch.")
    cues: list[dict[str, Any]] = []
    for ref in manifest["cue_part_refs"]:
        part = json.loads((root / ref).read_text(encoding="utf-8"))
        if part["script_id"] != SCRIPT_ID:
            raise RuntimeError(f"Script ID mismatch in {ref}.")
        cues.extend(part["cues"])
    cues.sort(key=lambda item: item["start_seconds"])
    script_text = "\n".join(item["spoken_text"] for item in cues)
    if sha256_bytes(script_text.encode("utf-8")) != SCRIPT_SHA:
        raise RuntimeError("Reconstructed script hash mismatch.")
    if len(cues) != 35:
        raise RuntimeError(f"Expected 35 cues, found {len(cues)}.")
    return manifest, cues


def trim_audio(audio: np.ndarray, top_db: float = 45.0) -> np.ndarray:
    if audio.size == 0:
        raise RuntimeError("TTS returned empty audio.")
    trimmed, _ = librosa.effects.trim(audio.astype(np.float32), top_db=top_db)
    pad = np.zeros(int(0.05 * SAMPLE_RATE), dtype=np.float32)
    return np.concatenate([pad, trimmed.astype(np.float32), pad])


def resample(audio: np.ndarray, source_rate: int, target_rate: int = SAMPLE_RATE) -> np.ndarray:
    if source_rate == target_rate:
        return audio.astype(np.float32)
    return librosa.resample(audio.astype(np.float32), orig_sr=source_rate, target_sr=target_rate).astype(np.float32)


def stretch_to_duration(audio: np.ndarray, seconds: float) -> np.ndarray:
    target_samples = max(1, int(round(seconds * SAMPLE_RATE)))
    if len(audio) == target_samples:
        return audio.astype(np.float32)
    rate = len(audio) / target_samples
    stretched = librosa.effects.time_stretch(audio.astype(np.float32), rate=rate)
    if len(stretched) > target_samples:
        stretched = stretched[:target_samples]
    elif len(stretched) < target_samples:
        stretched = np.pad(stretched, (0, target_samples - len(stretched)))
    return stretched.astype(np.float32)


def normalize_lufs(audio: np.ndarray, target_lufs: float, rate: int = SAMPLE_RATE) -> tuple[np.ndarray, float]:
    meter = pyln.Meter(rate)
    safe = audio.astype(np.float64)
    if np.max(np.abs(safe)) < 1e-8:
        return audio.astype(np.float32), -math.inf
    measured = meter.integrated_loudness(safe)
    normalized = pyln.normalize.loudness(safe, measured, target_lufs)
    peak = np.max(np.abs(normalized))
    if peak > 0.70:
        normalized *= 0.70 / peak
    return normalized.astype(np.float32), float(measured)


def apply_fades(audio: np.ndarray, fade_in: float = 0.25, fade_out: float = 0.45) -> np.ndarray:
    result = audio.copy()
    fi = min(len(result), int(fade_in * SAMPLE_RATE))
    fo = min(len(result), int(fade_out * SAMPLE_RATE))
    if fi:
        result[:fi] *= np.sin(np.linspace(0, math.pi / 2, fi, endpoint=True)) ** 2
    if fo:
        result[-fo:] *= np.cos(np.linspace(0, math.pi / 2, fo, endpoint=True)) ** 2
    return result


def marker_wave() -> np.ndarray:
    n = int(MARKER_DURATION_SECONDS * SAMPLE_RATE)
    t = np.arange(n, dtype=np.float32) / SAMPLE_RATE
    envelope = np.sin(np.linspace(0, math.pi, n, endpoint=True)) ** 2
    tone = 0.018 * (np.sin(2 * math.pi * 330 * t) + 0.35 * np.sin(2 * math.pi * 495 * t))
    return (tone * envelope).astype(np.float32)


def overlay(destination: np.ndarray, source: np.ndarray, start_seconds: float) -> None:
    start = int(round(start_seconds * SAMPLE_RATE))
    if start < 0:
        source = source[-start:]
        start = 0
    end = min(len(destination), start + len(source))
    if end > start:
        destination[start:end] += source[: end - start]


def make_duck_envelope(total_seconds: float, cue_events: list[tuple[float, float]]) -> np.ndarray:
    n = int(round(total_seconds * SAMPLE_RATE))
    env = np.ones(n, dtype=np.float32)
    duck_gain = 10 ** (BED_DUCK_DB / 20)
    for start, duration in cue_events:
        duck_start = max(0.0, start - BED_DUCK_LEAD_SECONDS)
        voice_end = min(total_seconds, start + duration)
        restore_end = min(total_seconds, voice_end + BED_RESTORE_SECONDS)
        a = int(duck_start * SAMPLE_RATE)
        b = int(start * SAMPLE_RATE)
        c = int(voice_end * SAMPLE_RATE)
        d = int(restore_end * SAMPLE_RATE)
        if b > a:
            env[a:b] = np.minimum(env[a:b], np.linspace(1.0, duck_gain, b - a, endpoint=False))
        if c > b:
            env[b:c] = np.minimum(env[b:c], duck_gain)
        if d > c:
            env[c:d] = np.minimum(env[c:d], np.linspace(duck_gain, 1.0, d - c, endpoint=False))
    return env


def colored_noise(seconds: float, seed: int, brown_mix: float) -> np.ndarray:
    rng = np.random.default_rng(seed)
    n = int(round(seconds * SAMPLE_RATE))
    white = rng.standard_normal(n).astype(np.float32)
    pink = signal.lfilter([0.08], [1.0, -0.92], white).astype(np.float32)
    brown = np.cumsum(white, dtype=np.float64).astype(np.float32)
    brown -= np.mean(brown)
    brown /= max(np.std(brown), 1e-6)
    pink /= max(np.std(pink), 1e-6)
    return ((1.0 - brown_mix) * pink + brown_mix * brown).astype(np.float32)


def support_mono(seconds: float, mode: str) -> np.ndarray:
    n = int(round(seconds * SAMPLE_RATE))
    t = np.arange(n, dtype=np.float32) / SAMPLE_RATE
    if mode == "minimal":
        noise = colored_noise(seconds, 2026082103, 0.45) * 0.0022
        drone = 0.0012 * np.sin(2 * math.pi * 110 * t)
    else:
        noise = colored_noise(seconds, 2026082101, 0.25) * 0.0055
        slow = 0.65 + 0.35 * np.sin(2 * math.pi * 0.007 * t + 0.4)
        drone = slow * (
            0.0025 * np.sin(2 * math.pi * 110 * t)
            + 0.0014 * np.sin(2 * math.pi * 165 * t + 0.7)
        )
    base = (noise + drone).astype(np.float32)
    sos = signal.butter(3, [25, 4500], btype="bandpass", fs=SAMPLE_RATE, output="sos")
    return signal.sosfilt(sos, base).astype(np.float32)


def breath_rail(seconds: float, start: float, end: float) -> np.ndarray:
    n = int(round(seconds * SAMPLE_RATE))
    rail = np.zeros(n, dtype=np.float32)
    a = max(0, int(round(start * SAMPLE_RATE)))
    b = min(n, int(round(end * SAMPLE_RATE)))
    if b <= a:
        return rail
    tt = np.arange(b - a, dtype=np.float32) / SAMPLE_RATE
    phase = (tt % 10.0) / 10.0
    triangle = np.where(phase < 0.5, phase / 0.5, (1.0 - phase) / 0.5)
    smooth = 0.5 - 0.5 * np.cos(np.pi * triangle)
    tone = np.sin(2 * math.pi * 275 * tt) + 0.4 * np.sin(2 * math.pi * 412.5 * tt)
    fade = np.ones_like(tt)
    edge = min(len(tt) // 2, int(2.0 * SAMPLE_RATE))
    if edge:
        fade[:edge] *= np.linspace(0, 1, edge)
        fade[-edge:] *= np.linspace(1, 0, edge)
    rail[a:b] = (0.0018 * tone * (0.35 + 0.65 * smooth) * fade).astype(np.float32)
    return rail


def transition_texture(seconds: float, boundaries: Iterable[float]) -> np.ndarray:
    n = int(round(seconds * SAMPLE_RATE))
    result = np.zeros(n, dtype=np.float32)
    for index, boundary in enumerate(boundaries):
        duration = 3.0
        count = int(duration * SAMPLE_RATE)
        t = np.arange(count, dtype=np.float32) / SAMPLE_RATE
        env = np.sin(np.linspace(0, math.pi, count)) ** 2
        frequency = 185 + index * 18
        texture = 0.0018 * np.sin(2 * math.pi * frequency * t) * env
        overlay(result, texture.astype(np.float32), boundary - duration / 2)
    return result


def build_support(seconds: float, mode: str, duck: np.ndarray, rail_window: tuple[float, float], boundaries: list[float]) -> np.ndarray:
    mono = support_mono(seconds, "minimal" if mode == "minimal" else "ambient")
    mono += breath_rail(seconds, *rail_window)
    mono += transition_texture(seconds, boundaries)
    if mode == "minimal":
        mono, _ = normalize_lufs(mono, SUPPORT_MINIMAL_LUFS)
    else:
        mono, _ = normalize_lufs(mono, SUPPORT_AMBIENT_LUFS)
    stereo = np.column_stack([mono, mono]).astype(np.float32)
    if mode == "binaural":
        n = len(mono)
        t = np.arange(n, dtype=np.float32) / SAMPLE_RATE
        carrier_level = 0.0014
        stereo[:, 0] += carrier_level * np.sin(2 * math.pi * 216.0 * t)
        stereo[:, 1] += carrier_level * np.sin(2 * math.pi * 224.0 * t)
    stereo *= duck[:, None]
    return stereo.astype(np.float32)


def encode_mp3(wav_path: pathlib.Path, mp3_path: pathlib.Path, bitrate: str, channels: int) -> None:
    run([
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-i", str(wav_path),
        "-ar", str(SAMPLE_RATE), "-ac", str(channels), "-codec:a", "libmp3lame", "-b:a", bitrate,
        str(mp3_path),
    ])


def write_wav(path: pathlib.Path, audio: np.ndarray) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(path, audio, SAMPLE_RATE, subtype="PCM_16")


def ensure_safe_peak(audio: np.ndarray, label: str) -> np.ndarray:
    peak = float(np.max(np.abs(audio)))
    if peak > 0.95:
        print(f"{label}: limiting peak {peak:.4f} to 0.95")
        audio = audio * (0.95 / peak)
    return audio.astype(np.float32)


def file_record(path: pathlib.Path) -> dict[str, Any]:
    return {
        "path": path.name,
        "bytes": path.stat().st_size,
        "sha256": sha256_file(path),
        "probe": ffprobe(path),
    }


def build_html(output_dir: pathlib.Path) -> None:
    html = r'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>QCTP A03 Five-Minute Acceptance</title>
<style>
:root{color-scheme:dark;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#071017;color:#f4f7f8}body{margin:0;background:radial-gradient(circle at top,#122733,#071017 55%);min-height:100vh}.wrap{max-width:720px;margin:auto;padding:calc(22px + env(safe-area-inset-top)) 18px calc(32px + env(safe-area-inset-bottom))}.eyebrow{letter-spacing:.16em;text-transform:uppercase;color:#92c7cd;font-size:.75rem}.card{background:rgba(10,24,32,.88);border:1px solid #29434d;border-radius:18px;padding:18px;margin:14px 0;box-shadow:0 14px 40px rgba(0,0,0,.25)}h1{font-size:1.85rem;line-height:1.08;margin:.25rem 0 1rem}h2{font-size:1.1rem;margin:.2rem 0 1rem}.warning{background:#402d12;border:1px solid #8a6427;color:#ffe3a4;border-radius:12px;padding:12px;font-weight:700}.modes{display:grid;grid-template-columns:1fr;gap:10px}button{font:inherit;border-radius:14px;border:1px solid #45636d;padding:14px;background:#122b35;color:#fff;text-align:left}button.active{border-color:#93d7dc;background:#1b404b}.start{width:100%;text-align:center;background:#d8f4f2;color:#071017;border:none;font-weight:800;margin-top:12px}audio{width:100%;margin-top:14px}.phase{font-size:1.1rem;font-weight:700}.timer{font-variant-numeric:tabular-nums;font-size:2.4rem;margin:.25rem 0}.fine{color:#aabcc2;font-size:.9rem;line-height:1.45}ol{padding-left:1.25rem}li{margin:.5rem 0}.hidden{display:none}.pill{display:inline-block;border:1px solid #47656f;border-radius:999px;padding:5px 9px;color:#a9d4d7;font-size:.78rem;margin:3px}
</style></head><body><main class="wrap">
<p class="eyebrow">QCTP · A03 device acceptance</p><h1>Source-grounded Day 1<br>five-minute audio test</h1>
<div class="warning">TEST — NO COMPLETION CREDIT. This is not today’s full meditation.</div>
<section class="card"><h2>Source map</h2><span class="pill">Bullard</span><span class="pill">HeartMath</span><span class="pill">Dispenza</span><span class="pill">QCTP return</span><p class="fine">The spoken wording is locked. The background is a separately labeled QCTP support layer.</p></section>
<section class="card"><h2>Choose one support candidate</h2><div class="modes">
<button data-src="acceptance-ambient.mp3" class="active"><b>Ambient</b><br><span class="fine">Continuous texture, no binaural difference.</span></button>
<button data-src="acceptance-binaural-low-a.mp3"><b>Binaural Low A</b><br><span class="fine">QCTP support candidate. Stereo headphones required.</span></button>
<button data-src="acceptance-minimal.mp3"><b>Minimal continuity</b><br><span class="fine">Lowest practical background floor.</span></button>
</div><button class="start" id="start">Begin five-minute test</button><audio id="player" preload="metadata" playsinline></audio></section>
<section class="card"><p class="phase" id="phase">Ready</p><p class="timer" id="timer">5:00</p><p class="fine" id="status">You should hear a continuous background before and between every instruction. A soft marker predicts each non-opening voice cue.</p></section>
<section class="card hidden" id="review"><h2>Acceptance observations</h2><ol><li>Did any voice entry startle you?</li><li>Was the voice clear and conversational?</li><li>Could you follow the five-in/five-out coaching with eyes closed?</li><li>Was the background helpful, neutral, or distracting?</li><li>Was the marker noticeable without being alarming?</li><li>Did the return feel complete?</li></ol><p class="fine">Report the selected mode and your answers. No full-session test is required yet.</p></section>
<p class="fine">Candidate identity is recorded in <code>manifest.json</code>. Release authority: ZERO RELEASE.</p>
</main><script>
const player=document.getElementById('player'),start=document.getElementById('start'),timer=document.getElementById('timer'),phase=document.getElementById('phase'),review=document.getElementById('review'),status=document.getElementById('status');let src='acceptance-ambient.mp3';
document.querySelectorAll('[data-src]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-src]').forEach(x=>x.classList.remove('active'));b.classList.add('active');src=b.dataset.src;player.pause();player.removeAttribute('src');player.load();timer.textContent='5:00';phase.textContent='Ready';review.classList.add('hidden')});
start.onclick=async()=>{player.src=src+'?v=1';player.currentTime=0;try{await player.play();status.textContent='Playing '+src.replace('acceptance-','').replace('.mp3','')+' candidate.'}catch(e){status.textContent='Playback could not start. Tap the audio control once, or reload this page.'}};
function phaseAt(t){if(t<80)return 'Baseline and Bullard sample';if(t<204)return 'HeartMath coherence and five/five breath';if(t<282)return 'Dispenza spatial attention sample';return 'Return';}
player.ontimeupdate=()=>{const r=Math.max(0,300-player.currentTime);timer.textContent=Math.floor(r/60)+':'+String(Math.ceil(r%60)).padStart(2,'0');phase.textContent=phaseAt(player.currentTime)};player.onended=()=>{timer.textContent='0:00';phase.textContent='Test complete';review.classList.remove('hidden');status.textContent='No completion credit was written.'};
</script></body></html>'''
    (output_dir / "index.html").write_text(html, encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", type=pathlib.Path, default=pathlib.Path("."))
    parser.add_argument("--reference", type=pathlib.Path, required=True)
    parser.add_argument("--output", type=pathlib.Path, required=True)
    args = parser.parse_args()
    root = args.repo.resolve()
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    work = output / "_work"
    if work.exists():
        shutil.rmtree(work)
    work.mkdir(parents=True)

    _, cues = load_cues(root)
    cue_by_id = {cue["cue_id"]: cue for cue in cues}
    print(f"Locked script verified: {SCRIPT_SHA}; {len(cues)} cues")

    torch.manual_seed(20260820)
    np.random.seed(20260820)
    random.seed(20260820)
    load_started = time.time()
    model = ChatterboxTurboTTS.from_pretrained(device="cpu", nano=True)
    print(f"Loaded Chatterbox Nano in {time.time()-load_started:.2f}s")

    rendered: dict[str, dict[str, Any]] = {}
    cue_dir = work / "cues"
    cue_dir.mkdir()
    for index, cue in enumerate(cues, 1):
        expected = cue["text_sha256"]
        actual = sha256_bytes(cue["spoken_text"].encode("utf-8"))
        if expected != actual:
            raise RuntimeError(f"Text hash mismatch for {cue['cue_id']}")
        torch.manual_seed(int(expected[:8], 16))
        started = time.time()
        wav = model.generate(cue["spoken_text"], audio_prompt_path=str(args.reference))
        generated_seconds = time.time() - started
        raw = wav.squeeze().detach().cpu().numpy().astype(np.float32)
        raw = resample(raw, model.sr)
        raw = trim_audio(raw)
        target_duration = min(float(cue["estimated_duration_seconds"]), float(cue["max_duration_seconds"]) - 0.15)
        audio = stretch_to_duration(raw, target_duration)
        audio = apply_fades(audio)
        audio, raw_lufs = normalize_lufs(audio, VOICE_TARGET_LUFS)
        path = cue_dir / f"{cue['cue_id']}.wav"
        write_wav(path, audio)
        rendered[cue["cue_id"]] = {
            "cue_id": cue["cue_id"],
            "text_sha256": expected,
            "source_id": cue["source_id"],
            "start_seconds": cue["start_seconds"],
            "target_wpm": cue["target_wpm"],
            "target_duration_seconds": target_duration,
            "rendered_duration_seconds": len(audio) / SAMPLE_RATE,
            "raw_generated_duration_seconds": len(raw) / SAMPLE_RATE,
            "generation_seconds": generated_seconds,
            "real_time_factor_raw": generated_seconds / max(len(raw) / SAMPLE_RATE, 0.001),
            "pre_normalization_lufs": raw_lufs,
            "wav_sha256": sha256_file(path),
            "wav_bytes": path.stat().st_size,
        }
        print(f"[{index:02d}/{len(cues)}] {cue['cue_id']}: {len(raw)/SAMPLE_RATE:.2f}s -> {target_duration:.2f}s; generation {generated_seconds:.2f}s")

    voice = np.zeros(DURATION_SECONDS * SAMPLE_RATE, dtype=np.float32)
    marker = marker_wave()
    full_events: list[tuple[float, float]] = []
    for cue in cues:
        clip, sr = sf.read(cue_dir / f"{cue['cue_id']}.wav", dtype="float32")
        if sr != SAMPLE_RATE:
            raise RuntimeError("Cue sample rate mismatch.")
        if cue["pre_cue_marker"]:
            overlay(voice, marker, cue["start_seconds"] - MARKER_LEAD_SECONDS)
        overlay(voice, clip, cue["start_seconds"])
        full_events.append((float(cue["start_seconds"]), len(clip) / SAMPLE_RATE))
    voice = ensure_safe_peak(voice, "voice stem")
    voice_wav = work / "voice-1500.wav"
    write_wav(voice_wav, voice)
    voice_mp3 = output / "voice-1500.mp3"
    encode_mp3(voice_wav, voice_mp3, "48k", 1)

    full_duck = make_duck_envelope(DURATION_SECONDS, full_events)
    full_support_records: dict[str, dict[str, Any]] = {}
    for mode in ["ambient", "binaural", "minimal"]:
        support = build_support(DURATION_SECONDS, mode, full_duck, (224.0, 462.0), [180.0, 480.0, 1320.0, 1440.0])
        support = ensure_safe_peak(support, f"{mode} support")
        wav_path = work / f"support-{mode}-1500.wav"
        write_wav(wav_path, support)
        name = "support-binaural-low-a-1500.mp3" if mode == "binaural" else f"support-{mode}-1500.mp3"
        mp3_path = output / name
        encode_mp3(wav_path, mp3_path, "64k", 2)
        full_support_records[mode] = file_record(mp3_path)
        if mode == "ambient":
            composite = ensure_safe_peak(support + np.column_stack([voice, voice]), "full composite")
            composite_wav = work / "composite-ambient-low-1500.wav"
            write_wav(composite_wav, composite)
            composite_mp3 = output / "composite-ambient-low-1500.mp3"
            encode_mp3(composite_wav, composite_mp3, "96k", 2)

    preview_voice = np.zeros(PREVIEW_SECONDS * SAMPLE_RATE, dtype=np.float32)
    preview_events: list[tuple[float, float]] = []
    preview_map_records: list[dict[str, Any]] = []
    for start, cue_id in PREVIEW_MAP:
        cue = cue_by_id[cue_id]
        clip, sr = sf.read(cue_dir / f"{cue_id}.wav", dtype="float32")
        if cue["pre_cue_marker"]:
            overlay(preview_voice, marker, start - MARKER_LEAD_SECONDS)
        overlay(preview_voice, clip, start)
        duration = len(clip) / SAMPLE_RATE
        preview_events.append((start, duration))
        preview_map_records.append({
            "acceptance_start_seconds": start,
            "cue_id": cue_id,
            "full_session_start_seconds": cue["start_seconds"],
            "source_id": cue["source_id"],
            "text_sha256": cue["text_sha256"],
            "duration_seconds": duration,
        })
    preview_voice = ensure_safe_peak(preview_voice, "preview voice")
    preview_duck = make_duck_envelope(PREVIEW_SECONDS, preview_events)
    preview_records: dict[str, dict[str, Any]] = {}
    for mode in ["ambient", "binaural", "minimal"]:
        support = build_support(PREVIEW_SECONDS, mode, preview_duck, (136.0, 204.0), [80.0, 204.0, 225.0, 282.0])
        composite = ensure_safe_peak(support + np.column_stack([preview_voice, preview_voice]), f"preview {mode}")
        wav_path = work / f"acceptance-{mode}.wav"
        write_wav(wav_path, composite)
        name = "acceptance-binaural-low-a.mp3" if mode == "binaural" else f"acceptance-{mode}.mp3"
        mp3_path = output / name
        encode_mp3(wav_path, mp3_path, "96k", 2)
        preview_records[mode] = file_record(mp3_path)

    build_html(output)
    assets = [
        file_record(voice_mp3),
        full_support_records["ambient"],
        full_support_records["binaural"],
        full_support_records["minimal"],
        file_record(output / "composite-ambient-low-1500.mp3"),
        preview_records["ambient"],
        preview_records["binaural"],
        preview_records["minimal"],
        file_record(output / "index.html"),
    ]
    package = {
        "schema": "qctp-day1-a03-audio-package-v1",
        "action_id": "QCTP-D1-AUDIO-A03",
        "status": "MACHINE_CANDIDATE_PHYSICAL_ACCEPTANCE_OPEN",
        "release_authority": "ZERO_RELEASE",
        "script_id": SCRIPT_ID,
        "script_sha256": SCRIPT_SHA,
        "source_engine": {
            "engine": "resemble-ai/chatterbox Nano",
            "source_commit": SOURCE_ENGINE_COMMIT,
            "license": "MIT",
            "reference_audio_sha256": sha256_file(args.reference),
            "reference_audio_note": "Authorized Chill Brian A03 cue D1-A02-000; source object uses a .wav URL but contains MP3 data.",
        },
        "audio": {
            "sample_rate": SAMPLE_RATE,
            "full_duration_seconds": DURATION_SECONDS,
            "acceptance_duration_seconds": PREVIEW_SECONDS,
            "voice_target_lufs_per_cue": VOICE_TARGET_LUFS,
            "support_modes": {
                "ambient": {"source_attribution": "QCTP SUPPORT", "binaural": False},
                "binaural_low_a": {"source_attribution": "QCTP SUPPORT", "binaural": True, "left_hz": 216.0, "right_hz": 224.0, "difference_hz": 8.0, "carrier_center_hz": 220.0, "disposition": "A/B CANDIDATE — NOT FROZEN"},
                "minimal_continuity": {"source_attribution": "QCTP SUPPORT", "binaural": False},
            },
            "marker": {"lead_seconds": MARKER_LEAD_SECONDS, "duration_seconds": MARKER_DURATION_SECONDS, "bed_duck_lead_seconds": BED_DUCK_LEAD_SECONDS, "bed_duck_db": BED_DUCK_DB, "bed_restore_seconds": BED_RESTORE_SECONDS},
            "heartmath_breath_rail": {"full_window_seconds": [224.0, 462.0], "acceptance_window_seconds": [136.0, 204.0], "inhale_seconds": 5, "exhale_seconds": 5, "hold_seconds": 0, "comfort_override": True},
        },
        "cue_renders": [rendered[cue["cue_id"]] for cue in cues],
        "acceptance_sample_map": preview_map_records,
        "assets": assets,
        "runtime_contract": {"test_no_completion_credit": True, "continuous_composite_acceptance": True, "dual_stem_full_assets": True, "composite_fallback": "composite-ambient-low-1500.mp3", "no_runtime_tts_provider": True, "physical_iphone_acceptance": "OPEN"},
    }
    manifest_path = output / "manifest.json"
    manifest_path.write_text(json.dumps(package, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"result": "PASS", "script_sha256": SCRIPT_SHA, "cue_count": len(cues), "assets": len(assets), "output": str(output), "manifest_sha256": sha256_file(manifest_path)}, indent=2))


if __name__ == "__main__":
    main()
