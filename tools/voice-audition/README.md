# QCTP Rev3 blind natural-voice audition

This package builds a short, source-locked physical audition. It deliberately does not build a five-minute or full 25-minute narration.

## Controls

- Three independent local engines: Piper, Kokoro, and KittenTTS.
- No paid API, provider key, cloned reference, Chatterbox/A03R voice, or recurring inference fee.
- The six identical source cues cover the opening, five-in/five-out coaching, comfort override, spatial attention, and complete return.
- Each source cue is generated independently. Kokoro and KittenTTS use their explicit `speed=1.0`; Piper uses its pinned model/config defaults. The rendered cue segments are joined with authored digital silence.
- Sample-rate conversion and matched-loudness gain are allowed; spectral time-stretch is prohibited.
- The public app never contains or fetches the label-to-route mapping. It saves
  A/B/C/NONE locally, and Codex opens the controlled mapping only after Ryan
  reports that physical choice.
- Machine and browser results cannot select a voice. Ryan's physical result is the gate.

## Isolated runtime

Use Python 3.11 and keep model/runtime files outside the repository:

```powershell
uv venv --python 3.11 "$env:LOCALAPPDATA\QCTP\voice-audition-env"
uv pip install --python "$env:LOCALAPPDATA\QCTP\voice-audition-env\Scripts\python.exe" -r tools/voice-audition/requirements.lock.txt
```

Provision the exact models documented in `QCTP_REV3_NATURAL_VOICE_TRADE_AND_LICENSING_REV0_2026-08-22.json`. The builder requires explicit file paths, records every model SHA-256, disables Hugging Face network access before KittenTTS inference, and rejects a cache snapshot that differs from the pinned attestation files.

The controlled package can be rebuilt without publishing or changing its blind
assignment. Replay the existing private mapping; the builder reads it before
replacing the integrity-bound reveal artifact. Never serve
`controlled-artifacts/` from the preview origin.

```powershell
$voicePython = "$env:LOCALAPPDATA\QCTP\voice-audition-env\Scripts\python.exe"
$voiceModels = "$env:LOCALAPPDATA\QCTP\voice-audition-models"
$privateMapping = "controlled-artifacts\voice-audition-private\route-reveal.json"

& $voicePython tools/voice-audition/build_rev3_voice_audition.py `
  --script tools/voice-audition/audition-script.rev0.json `
  --cue-grounding tools/voice-audition/cue-grounding.rev0.json `
  --static-dir tools/voice-audition/static `
  --output public/voice-audition `
  --private-output controlled-artifacts/voice-audition-private `
  --private-mapping-input $privateMapping `
  --piper-model "$voiceModels\piper-ljspeech\en_US-ljspeech-high.onnx" `
  --piper-config "$voiceModels\piper-ljspeech\en_US-ljspeech-high.onnx.json" `
  --kokoro-model "$voiceModels\kokoro-v1.0.onnx" `
  --kokoro-voices "$voiceModels\voices-v1.0.bin" `
  --kitten-cache "$voiceModels\kitten-cache" `
  --kitten-attestation-model "$voiceModels\kitten-mini\kitten_tts_mini_v0_8.onnx" `
  --kitten-attestation-voices "$voiceModels\kitten-mini\voices.npz"
```

For a genuinely new audition assignment, a controlled operator may replace
`--private-mapping-input` with a privately generated `--blind-seed`; the seed
must not enter public artifacts, logs, commits, or reports.

## Build and verify

First ground the six excerpts against the immutable commit currently named by `origin/main`:

```powershell
python tools/voice-audition/ground_rev3_voice_audition_cues.py `
  --repository . `
  --authority-ref origin/main `
  --script tools/voice-audition/audition-script.rev0.json `
  --output tools/voice-audition/cue-grounding.rev0.json `
  --output public/voice-audition/cue-grounding.json
```

The builder requires that PASS artifact and copies it into the offline package.
`public/voice-audition/build-record.json` records runtime/package versions plus
hashes that bind the script, cue grounding, manifest, and the controlled
non-public route assignment. The pinned-model hashes live inside that
integrity-bound private artifact. The build record is **not** an exact command
transcript: it deliberately omits the seed value that would disclose the blind
route assignment. The builder stages only short MP3s under
`public/voice-audition/`; pass
`--private-output controlled-artifacts/voice-audition-private` when building.

The grounding regression fails closed if a controlled cue changes or `origin/main` moves without regenerating evidence:

```powershell
python tools/voice-audition/test_ground_rev3_voice_audition_cues.py
& "$env:LOCALAPPDATA\QCTP\voice-audition-env\Scripts\python.exe" tools/voice-audition/test_blind_assignment.py
```

Run machine verification with the installed no-cost Whisper model:

```powershell
& "$env:LOCALAPPDATA\QCTP\voice-audition-env\Scripts\python.exe" tools/voice-audition/verify_rev3_voice_audition.py `
  --output public/voice-audition `
  --private-reveal controlled-artifacts/voice-audition-private/route-reveal.json `
  --licensing QCTP_REV3_NATURAL_VOICE_TRADE_AND_LICENSING_REV0_2026-08-22.json `
  --whisper-model "$env:LOCALAPPDATA\QCTP\whisper-models\base"
```

Serve only `public/` (or the built app) from localhost or the same private QCTP
origin, then run Playwright Chromium plus WebKit with an iPhone device profile.
The verifier proves choice persistence across a reload, confirms that neither
engine identities nor the private mapping become fetchable after selection, and
checks that audition cache cleanup leaves normal QCTP Workbox caches intact.
This checks browser compatibility; it does not replace Ryan's physical iPhone
naturalness decision:

```powershell
$env:QCTP_VOICE_AUDITION_URL = "http://127.0.0.1:4182/"
node tools/voice-audition/verify_rev3_voice_audition.mjs
& "$env:LOCALAPPDATA\QCTP\voice-audition-env\Scripts\python.exe" tools/voice-audition/finalize_rev3_voice_audition.py --output public/voice-audition
```

The only valid next gate is an iPhone physical report: `Best: A`, `B`, `C`, or `NONE`, plus the shortest observation about what sounded natural or artificial.
