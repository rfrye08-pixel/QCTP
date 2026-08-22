# QCTP Day 1 Audio Patch Verification Rev1B

**Record ID:** QCTP-D1-AUDIO-PATCH-VERIFY-REV1B  
**Date:** 2026-08-18  
**Candidate branch:** `qctp-platform-rev2-codex`  
**Original automated-test head:** `80801cdf34a4856c95a4d9349aa8a019fdf6fa38`  
**Focused mechanism source:** `ecb2aa6cbed879fbd6313a1ebc1c9adc417adf00`  
**Disposition:** `AUTOMATED RESULTS RECORDED / CORRECTED ENDPOINT LOADED / OPENING AND 45-SECOND CUES PHYSICALLY AUDIBLE / PRIVATE PX13 RUNTIME UPDATE OPEN / ZERO RELEASE`

## 1. Scope

This record covers the correction for the physical-iPhone failure in which the Day 1 timer advanced without audible opening narration.

The patch:

- reuses one persistent guide-audio element for every cue;
- primes the guide-audio path from an authorized user interaction;
- retries the same element after pause/resume;
- pauses the authoritative timer when cue playback rejects;
- removes Workbox interception of the external HeyGen WAV files;
- adds dedicated regression tests.

## 2. Recorded automated verification

A fresh checkout of the controlled candidate was recorded as passing:

| Gate                      | Recorded result                                  |
| ------------------------- | ------------------------------------------------ |
| `npm ci`                  | PASS                                             |
| `npm run check`           | PASS                                             |
| Formatting                | PASS                                             |
| ESLint                    | PASS                                             |
| TypeScript build          | PASS                                             |
| Vitest                    | PASS — 41 files / 231 tests                      |
| Production Vite/PWA build | PASS                                             |
| `npm run test:e2e`        | PASS — 14 passed / 6 controlled skips / 0 failed |

These are code/build results and are kept distinct from physical-device evidence.

## 3. Invalidated preview history

The earlier separate-repository URL `https://rfrye08-pixel.github.io/QCTP-Device-Preview/` returned GitHub Pages 404 on Ryan's iPhone, and the repository did not exist. Any earlier deployment or live-browser PASS claim for that URL is invalidated.

Controlling correction: `QCTP_DEVICE_PREVIEW_404_CORRECTION_AND_REDEPLOYMENT_REV0_2026-08-18.md` on `main`.

## 4. Corrected focused acceptance page

The corrected page exists inside the real QCTP Pages source:

- URL: `https://rfrye08-pixel.github.io/QCTP/device-preview/`;
- source: `main/device-preview/index.html`;
- identity: `main/device-preview/QCTP_DEVICE_PREVIEW_DEPLOYMENT.json`;
- mechanism source: `qctp-platform-rev2-codex@ecb2aa6cbed879fbd6313a1ebc1c9adc417adf00`;
- production release: false.

It uses one persistent `Audio` element, starts the controlled opening cue from the Begin tap, starts the controlled second cue automatically at 45 seconds, and stops the timer if playback rejects.

## 5. Physical-iPhone acceptance

At 2026-08-18T23:52:42-05:00 Ryan completed the corrected 50-second test on the target physical iPhone and reported:

> Both cues were audible

Accepted results:

- corrected endpoint loaded: **PASS**;
- opening Chill Brian cue audible: **PASS**;
- automatic 45-second cue audible without another tap: **PASS**;
- test reached completion: **PASS**.

Supporting screenshot:

- dimensions: 1125 × 2436;
- PNG size: 994,234 bytes;
- SHA-256: `bb8d517df0713522eb8bed732bd016c68a1c27dab621d3b8148888f64287f38b`;
- ChatGPT file ID: `file_00000000fdac81fda3b27450d8421a56`.

The screenshot establishes endpoint load and completed-test state. Audibility is established by Ryan's direct physical-device report.

Controlling evidence record: `QCTP_DAY1_AUDIO_PHYSICAL_IPHONE_ACCEPTANCE_REV0_2026-08-18.md` on `main`.

## 6. Acceptance closed

The focused target-iPhone opening/delayed-cue mechanism acceptance is **CLOSED — PASS**.

This materially validates the persistent-audio-element correction against the iPhone failure mode that blocked practice.

## 7. Remaining runtime boundary

The PX13 private QCTP origin still serves the older local `dist` until its checkout is updated, rebuilt, and its gateway restarted. The focused page is not the full Rev2 PWA and does not provide Local Whisper or Local AI Mirror APIs.

The original practice-blocking regression is not closed in the actual private runtime until:

1. the candidate is pulled and built on the PX13;
2. the private QCTP gateway is restarted;
3. the opening and 45-second cues pass once in the full private PWA.

Other release holds remain: remaining device lifecycle tests, actual-origin Rev1 migration comparison, full natural-duration Day 1 acceptance, and explicit release authority.

## 8. Release authority

`ZERO RELEASE`

Do not merge PR #2 or replace the released root runtime based on this focused acceptance alone.
