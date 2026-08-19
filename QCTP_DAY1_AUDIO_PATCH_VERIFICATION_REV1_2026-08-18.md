# QCTP Day 1 Audio Patch Verification Rev1A

**Record ID:** QCTP-D1-AUDIO-PATCH-VERIFY-REV1A  
**Date:** 2026-08-18  
**Candidate branch:** `qctp-platform-rev2-codex`  
**Candidate head under original automated test:** `80801cdf34a4856c95a4d9349aa8a019fdf6fa38`  
**Disposition:** `AUTOMATED CODE/BUILD TESTS RECORDED / PRIOR PUBLIC-PREVIEW CLAIM INVALIDATED / FOCUSED SOURCE PUBLISHED / ENDPOINT HTTP AND PHYSICAL-IPHONE AUDIO OPEN / ZERO RELEASE`

> **Superseding correction:** Ryan's physical-iPhone screenshot proved that the previously supplied `QCTP-Device-Preview` URL returned GitHub Pages 404. The repository did not exist. All earlier statements in this record that the separate public preview had been deployed or live-browser verified are invalidated. The controlling correction is `QCTP_DEVICE_PREVIEW_404_CORRECTION_AND_REDEPLOYMENT_REV0_2026-08-18.md` on `main`.

## 1. Scope

This verification covers the correction for the physical-iPhone failure in which the Day 1 timer advanced without audible opening narration.

The patch under test:

- reuses one persistent guide-audio element for every cue;
- primes the guide-audio path from an authorized user interaction;
- retries the same element after pause/resume;
- pauses the authoritative timer when cue playback rejects;
- removes Workbox cross-origin interception of the HeyGen WAV files;
- adds dedicated regression tests.

## 2. Recorded clean-checkout verification

A fresh clone of `rfrye08-pixel/QCTP` at the controlled candidate branch was recorded as installed and executed outside the PX13 runtime.

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

These are automated repository/build results. They are not public-deployment or physical-audibility evidence.

## 3. Neural-audio asset reachability

The controlled opening cue and 45-second cue URLs were recorded as downloaded directly and validated as nonempty WAV assets. This is asset-reachability evidence, not proof of audible playback through the target iPhone output route.

## 4. Invalidated public-preview claim

The prior version of this record claimed that the exact post-check `dist` package had been published to:

`https://rfrye08-pixel.github.io/QCTP-Device-Preview/`

That claim is invalid.

Evidence:

- Ryan opened the supplied URL on the target iPhone and received GitHub Pages `404 — There isn't a GitHub Pages site here`;
- the user-provided screenshot SHA-256 is `b6ba73539fa33b39f096025c527c466de66633aea9dafa7c098151465a719b5c`;
- a repository lookup returned 404 for `rfrye08-pixel/QCTP-Device-Preview`.

Therefore the earlier accelerated and normal-timeline public-preview PASS claims are classified `INVALIDATED_UNSUPPORTED` and must not be cited as evidence.

## 5. Corrected focused acceptance source

A focused 50-second acceptance page now exists inside the actual QCTP Pages source repository:

- source: `main/device-preview/index.html`;
- identity record: `main/device-preview/QCTP_DEVICE_PREVIEW_DEPLOYMENT.json`;
- intended URL: `https://rfrye08-pixel.github.io/QCTP/device-preview/`;
- mechanism source: `qctp-platform-rev2-codex@ecb2aa6cbed879fbd6313a1ebc1c9adc417adf00`;
- production release: false.

The page uses one persistent `Audio` element, requests the controlled opening cue from the user's Begin tap, loads the controlled second cue on the same element at 45 seconds, and stops the timer if playback rejects.

**Verified:** repository source and identity files exist.  
**Open:** exact public HTTP response and audible playback on Ryan's iPhone.

## 6. Physical-device boundary

The remaining immediate acceptance is:

1. open the corrected focused URL on the target iPhone;
2. confirm the page loads;
3. tap **Begin 50-second test**;
4. confirm the opening narration is audible immediately;
5. confirm the second cue is audible automatically at `0:45`;
6. report PASS or the exact failure.

This test does not award Day 1 completion.

## 7. Production/runtime boundary

The PX13 private QCTP origin still serves its older `dist` package until its local checkout is updated and the gateway is restarted. The focused public page does not replace that private runtime and does not provide the local Whisper or Local AI Mirror APIs.

After physical audio acceptance, the candidate remains subject to:

- PX13 pull/build/restart;
- remaining device lifecycle checks;
- actual-origin migration acceptance;
- full natural-duration Day 1 acceptance;
- explicit release authority.

## 8. Deployment evidence control

A repository source file, successful build, workflow artifact, branch, or deployment configuration is not proof that a user-facing URL works. An exact shared URL may be described as deployed or verified only after it returns a successful response and the expected identity marker through an independent fetch or the target device.

## 9. Release authority

`ZERO RELEASE`

Do not merge PR #2 or replace the released root runtime based on this record alone.
