# QCTP Day 1 Source-Grounded Audio Implementation Handoff — Rev0

**Handoff ID:** `QCTP-D1-SOURCE-AUDIO-HANDOFF-REV0`  
**Date:** 2026-08-20  
**Next action ID:** `QCTP-D1-AUDIO-A03`  
**Target repository:** `rfrye08-pixel/QCTP`  
**Target branch:** `qctp-platform-rev2-codex`  
**Status:** `EXECUTION AUTHORIZED / TEST RENDER AUTHORIZED / ZERO RELEASE`  
**Release authority:** `ZERO_RELEASE`

## 1. Objective

Render and integrate the locked, source-grounded Day 1 Teach script as a predictable, continuous, local/offline iPhone meditation experience. Close the automated build gate and a short five-minute physical-device acceptance gate before Ryan is asked to repeat the full 25-minute practice.

This action implements the already reviewed content. It is not authorized to rewrite the meditation.

## 2. Controlling inputs

1. `QCTP_DAY1_SOURCE_SCRIPT_LOCK_REV0.json`
2. `QCTP_DAY1_SOURCE_LABELED_SCRIPT_CANDIDATE_REV0.json`
3. all five `QCTP_DAY1_SOURCE_LABELED_SCRIPT_CANDIDATE_REV0_PART*.json` files
4. `QCTP_DAY1_SOURCE_FAITHFUL_BASELINE_REV0.md`
5. `QCTP_DAY1_QCTP_ENHANCEMENT_DELTA_REV0.md`
6. `QCTP_DAY1_PRIMARY_SOURCE_EVIDENCE_PACKET_REV0.md`
7. `QCTP_DAY1_SOURCE_PRACTICE_CROSSWALK_REV0.csv`
8. `QCTP_DAY1_INDEPENDENT_SOURCE_FIDELITY_REVIEW_REV0.md`
9. `QCTP_DAY1_SOURCE_SCRIPT_MACHINE_VERIFICATION_REV0.json`
10. `QCTP_MEDITATION_AUTHORING_AUDIO_ASSET_AND_QA_STANDARD_REV0_2026-08-18.md`
11. `QCTP_DAY1_FIRST_NATURAL_SESSION_GUIDANCE_AUDIT_REV0_2026-08-20.md`

The locked script SHA-256 is:

`2649ce70e5ab824dbc6b797e07082567fda2443962016e8e6c7dbe454f5ee555`

## 3. Immutable content contract

A03 shall preserve:

- exactly 1,500 seconds;
- 35 cue IDs and locked spoken text;
- Bullard-derived operation from 00:48 to 02:45;
- HeartMath source operation from 03:00 to 07:42;
- Dispenza source operation from 08:00 to 22:00;
- explicit source transitions;
- QCTP pure observation and return;
- HeartMath five-in/five-out-or-comfortable breath;
- no hold and no nasal-only requirement;
- no Day 1 one-to-ten breath counting;
- no advanced-state claims;
- completion separate from state attainment.

Any wording, source, order, or phase-boundary change invalidates the script hash and requires a new A02 review.

## 4. Required audio deliverables

### 4.1 Chill Brian voice stem

Create one continuous 25:00 voice stem from the locked cue text.

Requirements:

- Chill Brian remains the guide identity;
- each cue begins at its locked absolute start time;
- delivery follows each cue's target WPM and maximum duration;
- natural internal pauses are allowed without changing wording;
- non-opening cues receive a 200–300 ms soft marker beginning about 400 ms before speech;
- voice fade-in: 200–300 ms;
- voice fade-out: 350–500 ms;
- digital silence between voice cues is allowed inside the voice stem because the separate support stem remains continuous;
- transcript-to-audio alignment and audible wording are verified;
- voice loudness target: approximately −19 to −17 LUFS integrated;
- true peak: no higher than −3 dBTP;
- cue-to-cue perceived-level spread: approximately ±0.5 LU after mastering.

### 4.2 Continuous support stems

Generate at least three exactly 25:00 support candidates:

1. `AMBIENT` — low-information filtered pink/brown texture plus a stable non-melodic drone;
2. `BINAURAL LOW A` — the same ambient bed with a low-level, conservative binaural candidate;
3. `MINIMAL CONTINUITY` — the lowest practical continuity floor that still prevents entry from digital silence.

Requirements:

- no melody, lyrics, recognizable environmental events, sudden panning, sharp transients, or dramatic rises;
- no click at loop, phase, or section boundaries;
- no support event may masquerade as teacher content;
- the app and metadata label binaural audio as `QCTP SUPPORT`;
- no final binaural difference-frequency trajectory is frozen by A03 machine testing alone;
- the A/B candidate metadata records carrier center, left/right frequencies, difference frequency, phase transition method, LUFS, and SHA-256;
- headphone requirement is enforced only for binaural candidates.

### 4.3 HeartMath breath rail

From the completion of the first counted cycle until the source transition near 07:42, include a quiet ten-second rail:

- five-second inhale phase;
- five-second exhale phase;
- no hold;
- no abrupt edge;
- no implication that exact timing overrides comfort;
- rail level independently bounded so it cannot mask speech.

### 4.4 Ducking and transitions

For every non-opening voice cue:

- begin a 2.5–4 dB support-bed duck about 0.9 seconds before speech;
- play the learned marker about 0.4 seconds before speech;
- end the marker before voice onset;
- restore the bed over roughly 0.7–1.0 seconds after speech.

Use subtle support-layer transitions before source boundaries at 03:00, 08:00, 22:00, and 24:00. Do not use bells or startle-prone chimes.

### 4.5 Composite fallback

Create a pre-rendered 25:00 composite at the approved Low support balance. The iPhone player uses it automatically when synchronized dual-stem playback is not proven.

## 5. Player implementation

Replace independently scheduled cue files with a continuous-session player:

- one user gesture authorizes voice and support;
- the voice-stem media clock is authoritative;
- support starts from the same session clock;
- drift is measured continuously;
- bounded drift correction is inaudible;
- excessive drift pauses the session and fails closed;
- pause/resume preserves synchronization;
- background/foreground restoration is tested;
- screen-wake behavior remains;
- all media is local and checksum-manifested;
- no required runtime request reaches HeyGen or another speech provider;
- offline playback after one complete cache/install cycle is required;
- no diagnostic mode can earn completion.

## 6. Readiness interface

Before the timed session, display:

- `Source-grounded Day 1: Bullard → HeartMath → Dispenza → QCTP return`;
- selected support mode;
- voice level and support level;
- headphone status when binaural is selected;
- three seconds of support;
- the exact marker;
- one short Chill Brian sample;
- confirmation that the level is comfortable;
- one dominant `Begin` control.

The source map remains visible in lesson/details metadata. Teacher names do not need to interrupt the spoken meditation.

## 7. Five-minute acceptance build

Before full physical testing, build a non-credit five-minute acceptance sequence containing exact locked samples from:

- opening over continuous support;
- a Bullard-derived instruction after a real quiet interval;
- the HeartMath counted five/five breath entry and breath rail;
- a representative source transition;
- a Dispenza spatial-attention cue after a longer interval;
- the full return behavior.

The sequence may compress waiting intervals, but it shall use the exact locked cue audio and the same marker, ducking, support bed, player, and synchronization logic. It is labeled `TEST — NO COMPLETION CREDIT`.

## 8. Automated verification

### 8.1 Content integrity

- script SHA matches the lock;
- all 35 cue transcript hashes match;
- audible transcript matches locked wording;
- no external speech URL remains;
- source metadata and QCTP-support labels are present.

### 8.2 Duration and alignment

- voice, support, and composite duration: 1,500.000 seconds within the controlled codec tolerance;
- five-minute diagnostic duration and sample map are recorded;
- cue onset error is measured for all 35 cues;
- no cue exceeds its next available window;
- breath rail is ten seconds per cycle within tolerance;
- source transitions occur at controlled boundaries.

### 8.3 Acoustic QA

- no clipping;
- loudness and true peak within limits;
- no unintended support-bed dropout;
- no click or sharp transient at markers, cue boundaries, source transitions, pause/resume, or track end;
- marker is audible but below voice;
- bed does not mask speech;
- ducking and fades match the controlled grammar;
- candidate binaural frequencies match their metadata.

### 8.4 Runtime QA

- Chromium and WebKit/iPhone-profile tests;
- local/offline playback;
- service-worker update and stale-cache replacement;
- pause/resume;
- lock-screen/background boundary where supported;
- reconnect behavior;
- dual-stem drift and fallback selection;
- fail-closed timer;
- no test-mode completion credit;
- export records exact script, stem, support-candidate, and manifest hashes.

## 9. Physical five-minute acceptance

Ryan is not asked to test until all machine gates pass.

Physical pass requires:

- correct private origin and candidate identity;
- opening voice audible;
- continuous support audible but unobtrusive;
- no voice entrance feels sudden or startling;
- marker is noticeable but not alarming;
- five/five breath coaching is followable with eyes closed;
- comfort override is clear;
- spatial instruction is understandable without reading;
- voice/support balance is acceptable;
- no dropout or synchronization error;
- return is complete;
- no completion credit is awarded.

Collect Ryan's ratings for startle, voice clarity, bed distraction, breath usability, alertness/drowsiness, and overall instructional quality before choosing Ambient versus binaural support for the full-session candidate.

## 10. Stop conditions

Stop and report `BLOCKED` or `REROUTE_REQUIRED` if:

- the available voice renderer cannot preserve locked wording and timing;
- a paid recurring service becomes required;
- the generated voice cannot be legally/local-offline packaged;
- dual-stem synchronization cannot pass on iPhone and the composite fallback also fails;
- source wording is changed to fit audio;
- a support sound startles or masks speech;
- binaural metadata cannot be measured;
- five-minute physical acceptance fails twice without a materially changed candidate.

## 11. Required artifacts

1. voice-render manifest and 35 transcript/audio hashes;
2. 25:00 voice stem;
3. Ambient, Binaural Low A, and Minimal Continuity support stems plus metadata;
4. 25:00 composite fallback;
5. five-minute acceptance mix and sample map;
6. player implementation and tests;
7. acoustic QA report;
8. automated runtime verification record;
9. physical five-minute acceptance record;
10. updated QCTP current state and macro manifest.

## 12. Release authority

`TEST_RENDER_AUTHORIZED / ZERO_RELEASE`

Do not merge, publicly deploy, or call Day 1 guidance accepted until physical five-minute and later natural-duration acceptance pass.

## 13. Next controlled action

Execute `QCTP-D1-AUDIO-A03` as one coherent render, integration, automated-verification, and five-minute physical-acceptance package. Do not ask Ryan to retest the old guide or perform manual audio-production work.
