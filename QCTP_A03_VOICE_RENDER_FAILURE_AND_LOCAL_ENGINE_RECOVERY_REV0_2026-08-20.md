# QCTP A03 Voice-Render Failure and Local-Engine Recovery — Rev0

**Record ID:** `QCTP-A03-VOICE-ROUTE-RECOVERY-REV0`  
**Date:** 2026-08-20  
**Action:** `QCTP-D1-AUDIO-A03`  
**Status:** `PAID/FREE-CREDIT ROUTE CLOSED / ZERO-COST LOCAL ROUTE PROVEN / FULL PACKAGE BUILD OPEN`  
**Release authority:** `ZERO_RELEASE`

## 1. Failure boundary

A03 began rendering the locked source-grounded Day 1 script through the already selected Chill Brian HeyGen voice. Four exact locked cues rendered successfully. The next request returned HTTP 402 `insufficient_credit` because the account had no remaining free TTS minutes.

No paid spend was authorized. QCTP's zero-recurring-cost requirement prohibits treating purchase of additional TTS minutes as the default route.

## 2. Preserved HeyGen renders

| Cue | Locked text status | Result |
| --- | --- | --- |
| `D1-A02-000` | SHA matched | rendered; approximately 13.61 s |
| `D1-A02-020` | SHA matched | rendered; approximately 15.57 s |
| `D1-A02-048` | SHA matched | rendered; approximately 17.42 s |
| `D1-A02-078` | SHA matched | rendered; approximately 13.17 s |
| `D1-A02-108` | SHA matched | blocked before render by insufficient credit |

The first rendered cue was preserved as the authorized Chill Brian voice reference for local testing.

## 3. Recovery attempts

### Attempt 1 — local proof wrapper

The reference downloaded successfully, but the workflow stopped before model execution because `ffprobe` was unavailable in that proof environment.

**Disposition:** `FAILED_TOOLING_ONLY / NO AUDIO CONCLUSION`

### Attempt 2 — PyPI Chatterbox package

PyPI package `chatterbox-tts==0.1.7` installed, but its exposed `from_pretrained` signature did not contain the required `nano` selector.

**Disposition:** `FAILED_CAPABILITY_MISMATCH`

### Attempt 3 — pinned official Chatterbox Nano source

The materially changed route installed the official `resemble-ai/chatterbox` source at commit:

`5de7a54aa4e5e2baadb0182dde554908b48b85c2`

The source exposed `from_pretrained(device, nano=False)` and successfully generated locked cue `D1-A02-108` from the authorized Chill Brian reference on CPU.

**Workflow run:** `32431511664`  
**Job:** `96623856934`  
**Result:** `PASS`  
**Artifact:** `9429294727`  
**Artifact ZIP SHA-256:** `0007de58ac5a915bd55cbefde376d36a981dc8f5b82fa9f9ca5c9f053586d214`

Generated proof:

- cue: `D1-A02-108`;
- locked text SHA-256: `006daa3eee2548de2bc01be0709ecd190da2fa47d83a79e2d2932f1729fee4c6`;
- output: 24 kHz mono PCM WAV;
- duration: 10.36 seconds;
- output bytes: 497,324;
- output SHA-256: `3a2c625efbcac05a73367d6a525151d36932af72948a31048ad9f669ebe48064`;
- model load: approximately 15.32 seconds;
- generation: approximately 30.87 seconds;
- real-time factor: approximately 2.98 on the hosted CPU runner.

This evidence proves a zero-cost local rendering route exists. It does not establish perceptual acceptance of the cloned voice; that remains a physical listening boundary.

## 4. Current full-build route

The full A03 package now uses:

- locked script SHA `2649ce70e5ab824dbc6b797e07082567fda2443962016e8e6c7dbe454f5ee555`;
- all 35 locked cues;
- pinned official Chatterbox Nano source;
- the authorized Chill Brian reference;
- deterministic cue seeding;
- post-render rate correction to the locked delivery targets;
- per-cue loudness normalization and fades;
- continuous voice and support stems;
- Ambient, Binaural Low A, and Minimal Continuity support candidates;
- five/five HeartMath breath rail;
- learned pre-cue marker and bed ducking;
- full 25-minute assets and a five-minute no-credit physical candidate;
- ASR proxy, acoustic verification, Chromium/WebKit tests, artifact export, candidate-branch packaging, and public diagnostic publication.

The corrected build workflow is `.github/workflows/qctp-a03-build-and-publish-rev1.yml`.

## 5. Controls added

1. Do not spend money when an approved zero-cost local route remains viable.
2. Proof a local voice engine on one locked cue before rendering the full package.
3. Pin the exact engine source commit and record its license.
4. Preserve locked text hashes across every rendering route.
5. Do not call generated voice quality accepted until Ryan hears the five-minute candidate.
6. Do not call A03 complete until the machine package and physical five-minute gate both pass.

## 6. Current disposition

- HeyGen free-credit route: `CLOSED_INSUFFICIENT_CREDIT`.
- Paid HeyGen route: `NOT_AUTHORIZED`.
- Local Chatterbox Nano proof: `PASS`.
- Full A03 package: `BUILD_AND_MACHINE_VERIFICATION_IN_PROGRESS`.
- Physical five-minute acceptance: `OPEN`.
- Public release: `ZERO_RELEASE`.
