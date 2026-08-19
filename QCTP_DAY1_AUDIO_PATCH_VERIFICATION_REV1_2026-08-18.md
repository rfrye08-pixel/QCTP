# QCTP Day 1 Audio Patch Verification Rev1

**Record ID:** QCTP-D1-AUDIO-PATCH-VERIFY-REV1  
**Date:** 2026-08-18  
**Candidate branch:** `qctp-platform-rev2-codex`  
**Candidate head under test:** `80801cdf34a4856c95a4d9349aa8a019fdf6fa38`  
**Disposition:** `AUTOMATED AND LIVE-BROWSER PASS / PHYSICAL-IPHONE AUDIBLE CONFIRMATION OPEN / ZERO RELEASE`

## 1. Scope

This verification covers the correction for the physical-iPhone failure in which the Day 1 timer advanced without audible opening narration.

The patch under test:

- reuses one persistent guide-audio element for every cue;
- primes the guide-audio path from an authorized user interaction;
- retries the same element after pause/resume;
- pauses the authoritative timer when cue playback rejects;
- removes Workbox cross-origin interception of the HeyGen WAV files;
- adds dedicated regression tests.

## 2. Independent clean-checkout verification

A fresh clone of `rfrye08-pixel/QCTP` at the controlled candidate branch was installed and executed outside the PX13 runtime.

| Gate | Result |
| --- | --- |
| `npm ci` | PASS |
| `npm run check` | PASS |
| Formatting | PASS |
| ESLint | PASS |
| TypeScript build | PASS |
| Vitest | PASS — 41 files / 231 tests |
| Production Vite/PWA build | PASS |
| `npm run test:e2e` | PASS — 14 passed / 6 controlled skips / 0 failed |

The test count increased by one test file and two tests relative to the pre-patch candidate.

## 3. Neural-audio asset reachability

The controlled opening cue and 45-second cue URLs were downloaded directly and validated as nonempty WAV assets. No paid or metered service call was used.

## 4. Built-runtime live-browser verification

The exact post-check `dist` package was published to a temporary non-production GitHub Pages diagnostic origin:

`https://rfrye08-pixel.github.io/QCTP-Device-Preview/`

The preview contains no production secrets and does not authorize release.

Two live-browser checks were performed against that deployed artifact:

### 4.1 Accelerated sequence

- Opened the deployed PWA.
- Enabled the controlled 90-second verification timing.
- Began practice through a user click.
- Verified one persistent `Audio` instance was reused.
- Verified the opening asset loaded without media error.
- Verified the next scaled delayed cue loaded on the same element.
- Verified no QCTP audio-failure notice appeared.
- Verified all observed HeyGen media responses were successful.

**Result:** PASS.

### 4.2 Normal 25-minute timing — opening plus delayed cue

- Disabled accelerated timing.
- Began the real 1,500-second Day 1 sequence.
- Observed the opening cue request and playback state.
- Allowed the actual timer to run past 45 seconds.
- Verified the controlled 45-second cue loaded automatically on the same persistent element without another click.
- Verified no media error or QCTP audio-failure notice appeared.
- Verified the timer continued on the normal timeline.

**Result:** PASS.

This proves the built web runtime can load and transition between the opening and delayed cues. Headless browser media-state evidence does not replace human confirmation that sound is audible through Ryan's actual iPhone output route.

## 5. Physical-device boundary

The remaining acceptance is one short physical-iPhone observation against the diagnostic preview:

1. open the preview;
2. begin Day 1;
3. confirm the opening narration is audible;
4. remain until the automatic cue at 24:15;
5. report PASS or the exact failure.

No PX13 rebuild is required for this diagnostic acceptance because the verified candidate build is already hosted at the separate preview origin.

## 6. Production/runtime boundary

The PX13 private QCTP origin still serves the older `dist` package until its local checkout is updated and its gateway restarted. The diagnostic preview does not replace that private runtime and does not provide the local Whisper or Local AI Mirror APIs.

After physical audio acceptance, the candidate remains subject to:

- PX13 pull/build/restart;
- remaining device lifecycle checks;
- actual-origin migration acceptance;
- full natural-duration Day 1 acceptance;
- explicit release authority.

## 7. Release authority

`ZERO RELEASE`

Do not merge PR #2 or replace the released GitHub Pages runtime based on this record alone.
