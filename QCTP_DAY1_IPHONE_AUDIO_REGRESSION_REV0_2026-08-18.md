# QCTP Day 1 iPhone Audio Regression Rev0

**Record ID:** QCTP-D1-AUDIO-REGRESSION-REV0  
**Date:** 2026-08-18  
**Observed runtime:** Rev2 candidate served from the PX13 private HTTPS origin  
**Candidate branch:** `qctp-platform-rev2-codex`  
**Release authority:** `ZERO_RELEASE`

## 1. User-observed failure

Ryan reported that the physical-iPhone Rev2 guided-practice timer advanced while no audible guide narration was heard.

The supplied screenshot showed `24:21` remaining. That timestamp is within the intended silent interval between the cue at `25:00` and the cue at `24:15`; however, Ryan's report indicates that the opening cue itself was not audible. The event is therefore controlled as a device audio regression rather than dismissed as intentional silence.

## 2. Repository inspection

Inspection of `src/app/screens/PracticeScreen.tsx` at candidate head `ada1dad03f73072297fae366a77b7937c4e0ce44` identified two iPhone-risk mechanisms:

1. Each timed cue created a brand-new `Audio` object. iOS may authorize the user-started media element but block later programmatic playback on newly created elements.
2. The generated service worker used cross-origin `CacheFirst` runtime caching for HeyGen WAV files. Cached/range-request handling can interfere with media playback and was not physically accepted on iPhone.

The original automated acceptance suite verified timing and visible cue behavior but did not prove actual physical-iPhone audio playback.

## 3. Candidate branch correction

The following changes were committed directly to `qctp-platform-rev2-codex`:

- reuse one persistent guide-audio element for every meditation cue;
- prime that guide-audio element during the user interaction that starts lesson playback;
- preserve direct `Begin practice` authorization behavior;
- resume the same element after pause;
- pause the authoritative timer when guide audio cannot start rather than silently consuming practice time;
- display an actionable audio error;
- remove service-worker interception/caching of external neural WAV requests;
- add regression tests asserting one audio element is reused and playback rejection pauses the timer.

Relevant branch commits include:

- `9f1d817c7b7c5c15bb0fcf9361c797ec7a3daf13`
- `1c7549127ed6ccb5c7774afebf41fb56a43d0422`
- `da4b1705988a8a59efb4b67d78bfd8b70aa9b1bf`
- `80801cdf34a4856c95a4d9349aa8a019fdf6fa38`

## 4. Evidence classification

- Physical-iPhone failure: **USER OBSERVED / SCREENSHOT SUPPORTED**.
- Root-cause identification: **CODE INSPECTION / ENGINEERING DIAGNOSIS**.
- Source correction: **IMPLEMENTED ON CANDIDATE BRANCH**.
- New regression tests: **WRITTEN, NOT YET EXECUTED AFTER PATCH**.
- Updated physical-iPhone playback: **NOT YET VERIFIED**.

## 5. Runtime limitation

The PX13 is still serving the previously built local `dist` package. A GitHub branch commit does not update that running package automatically. The local checkout must pull the candidate branch, rerun the complete checks/build, and restart the QCTP gateway before the iPhone can test this correction.

## 6. Acceptance required

The audio correction passes only when:

1. the full repository checks pass after the patch;
2. the PX13 rebuild is served through the same private HTTPS origin;
3. the opening cue plays on iPhone;
4. the cue at 45 seconds plays without another tap;
5. pause/resume continues the same cue correctly;
6. a forced audio failure pauses the timer and shows the error;
7. the lesson-to-practice automatic transition retains audible cue playback;
8. the natural 1,500-second Day 1 session remains held until completed separately.

## 7. Immediate user disposition

The silent run shall not count as a valid practice. Use `End without completion` when guide audio is absent. Rev1.1.4 remains available as the current limited-use fallback until the corrected Rev2 package is rebuilt and device-tested.

## 8. Next controlled action

Pull and verify the audio-fix commits on the PX13 candidate checkout, rebuild/restart the private QCTP runtime, and run the opening-plus-45-second physical-iPhone audio acceptance test.
