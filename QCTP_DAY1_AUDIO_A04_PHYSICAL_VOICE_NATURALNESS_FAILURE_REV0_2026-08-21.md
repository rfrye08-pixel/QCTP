# QCTP Day 1 A04 Physical Voice-Naturalness Failure and Rev3 Recovery Authority — Rev0

**Record ID:** `QCTP-D1-A04-VOICE-NATURALNESS-FAIL-REV0`  
**Observed:** `2026-08-21T21:37:46-05:00`  
**Evidence class:** `USER_REPORTED / DIRECT PHYSICAL IPHONE AUDIO PERCEPTION`  
**Disposition:** `A04 FAIL / A03R VOICE REJECTED / REV3 CODEX RECOVERY AUTHORIZED`  
**Release authority:** `ZERO_RELEASE`

## Result

Ryan evaluated the machine-verified A03R five-minute iPhone candidate and reported: **“The voice sounds robotic.”**

This is a release-critical failure. The test did not need to continue. Machine intelligibility, timing, acoustic, Chromium, and WebKit passes do not establish human voice naturalness.

## Preserved work

The following remain controlled and usable:

- source-first authority and the locked 35-cue Day 1 script;
- script SHA-256 `2649ce70e5ab824dbc6b797e07082567fda2443962016e8e6c7dbe454f5ee555`;
- Bullard, HeartMath, Dispenza, and QCTP source mapping;
- HeartMath five-in/five-out-or-comfortable breathing, with no hold;
- continuous Ambient, Binaural, and Minimal support-layer architecture;
- predictive pre-cue marker, bed ducking, fades, and full return;
- local/offline media packaging, fail-closed playback, and no-credit test mode;
- React/TypeScript PWA, IndexedDB, voice capture, local Whisper, Mirror Core, and private Tailscale runtime.

## Rejected work

The complete A03R rendered narration stem is rejected for content acceptance. It must not be installed, promoted, hidden under a louder bed, or reused as the production voice.

The A03 renderer used the resource-constrained Chatterbox Nano model and spectrally time-stretched every cue to a predetermined duration. This is a calculated likely contributor, not experimentally proven as the only cause.

## A05 status at handoff

Main contains incomplete A05 voice-recovery tooling at commits:

- `4be60afc256e97bd54a7867fc41517bbe9235f78` — A04 failure recorder;
- `a96fa7503829eb2be0c49224bb74298571655c14` — no-stretch blind audition builder;
- `d41d2d1f1005dbd231eeadbb9162d1156fd83a3e` — audition machine verifier;
- `544c85a98e65888ed164cbb6277650dfb63cc098` — Chromium/WebKit audition verifier;
- `71b0096a8631de5febdc88bd8b0a00130808642b` — live-deployment verifier.

At package creation, `device-preview/a05/` did not exist on `main`, no A05 sample package had been delivered, and no natural voice had physical acceptance. Codex shall treat those files as reusable engineering inputs, not a completed action.

## New execution branch

`qctp-platform-rev3-codex` was created from candidate baseline `5eb60e1290ecaa5e6d06592eeba3992212ac31f3`. It preserves Rev2 and PR #2 as a frozen predecessor while Codex performs the integrated Rev3 upgrade.

## Durable controls

1. Human naturalness PASS is mandatory before any full 25-minute voice render.
2. No broad spectral time-stretch. Default allowed factor is `0.97x–1.03x`; anything beyond that requires a separately accepted physical artifact and documented rationale.
3. Prefer model-native pacing, punctuation, sentence/clause composition, and real silence.
4. Blind audition samples must use identical text, matched loudness, randomized labels, and no identifying engine names.
5. Machine ASR is an intelligibility check only.
6. No paid cloud service, required API key, or recurring per-use cost without Ryan’s explicit approval.
7. No provider voice cloning or redistribution unless license and consent are explicitly verified.
8. The normal app must include a usable voice-free morning fallback while narration remains under test.

## Next controlled action

`QCTP-REV3-CODEX-A01` — execute the complete Rev3 app upgrade on `qctp-platform-rev3-codex`, beginning with morning-practice continuity and a high-quality natural-voice audition, then continue through the controlled breath, State Atlas, UX, source-track, reliability, and release packages.
