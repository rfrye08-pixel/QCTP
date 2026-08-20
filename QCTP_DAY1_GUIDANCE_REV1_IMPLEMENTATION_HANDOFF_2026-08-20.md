# QCTP Day 1 Guidance Rev1 Implementation Handoff

**Handoff ID:** `QCTP-D1-G1-IMPLEMENTATION-HANDOFF-REV0`  
**Date:** 2026-08-20  
**Target repository:** `rfrye08-pixel/QCTP`  
**Target branch:** `qctp-platform-rev2-codex`  
**Base release authority:** `ZERO_RELEASE`  
**Action ID:** `QCTP-D1-G1-A01`  
**Macro items:** Day 1 guidance recovery; hardened Day 1; meditation/audio QA; user-friendly practice experience

## 1. Objective

Implement the complete Day 1 Guidance Rev1 candidate defined by:

1. `QCTP_DAY1_GUIDANCE_BREATH_AND_SOUND_PROTOCOL_REV1_2026-08-20.md`;
2. `QCTP_DAY1_FIRST_NATURAL_SESSION_GUIDANCE_AUDIT_REV0_2026-08-20.md`;
3. `QCTP_MEDITATION_AUTHORING_AUDIO_ASSET_AND_QA_STANDARD_REV0_2026-08-18.md`;
4. `QCTP_BREATHWORK_AND_RESPIRATORY_CONTROL_SPEC_REV0_2026-08-17.md`;
5. `QCTP_TRAINING_PROTOCOL_HARDENING_AND_INSTRUCTION_STANDARD_REV0_2026-08-18.md`.

The result must replace the perceptual experience of isolated voice clips emerging from silence with exact breath coaching, predictable cue entry, continuous support audio, and a complete local/offline candidate package.

## 2. Authority and anti-regression

- Preserve the existing Rev1.1.4 `src/foundation/day1.ts` content as historical regression authority.
- Do not silently edit the protected Rev1.1.4 script in place.
- Create a new versioned Day 1 Guidance Rev1 definition and explicit selection path.
- Preserve the exact 1,500-second phase allocation.
- Preserve all valid Rev2 platform, storage, voice-capture, Mirror, Studio, and local-audio work.
- Do not restore runtime dependence on HeyGen, OpenAI, or another media host.
- Do not revert to independently scheduled voice clips after long digital silence.
- Do not use the previous sparse `guided` tier as the default first-session experience.
- Do not call a timer completion state attainment.
- Do not merge or deploy publicly without explicit authority.

## 3. Required implementation package

### 3.1 Versioned session definition

Create a typed session module, suggested path:

`src/foundation/day1-guidance-rev1.ts`

It shall contain:

- session ID and revision;
- exact 1,500-second phase boundaries;
- every Teach cue from the Rev1 protocol;
- Coach, Test, and Independent tier membership;
- breath protocol ID `QCTP-B1`;
- state-marker set;
- troubleshooting set;
- return protocol;
- completion rule;
- capability-credit rule;
- support-bed profile IDs;
- source lineage to the protected Rev1.1.4 Day 1 and the controlled Rev1 protocol.

### 3.2 Locked spoken script

Freeze the exact Chill Brian copy before rendering.

For every cue record:

- cue ID;
- absolute timestamp;
- function;
- tier membership;
- exact text;
- word count;
- target WPM range;
- maximum permitted duration;
- marker requirement;
- transcript hash;
- rendered-file hash.

No rendered cue may exceed 125 WPM. The coherence and return cues must fall inside their tighter phase-specific limits.

### 3.3 Voice rendering

Controlled voice:

- name: `Chill Brian`;
- HeyGen Starfish-compatible voice ID: `d2f4f24783d04e22ab49ee8fdc3715e0`;
- initial render-speed candidate: approximately 0.90–0.94, adjusted only after measured duration and naturalness review;
- use SSML pauses when supported rather than slowing every phoneme unnaturally.

Render individual archival cue masters first. Then produce a continuous 25:00 Teach voice stem with:

- every cue at its absolute timestamp;
- the approved soft pre-cue marker;
- 200–300 ms voice fade-in;
- 350–500 ms voice fade-out;
- no clip collision;
- no abrupt onset;
- no missing return.

Also produce Coach and Test voice stems from the same locked source set. Independent may use marker/return only.

### 3.4 Deterministic support-bed generator

Create a deterministic generator, suggested path:

`tools/generate-day1-guidance-bed.py` or an equivalent reviewed Node implementation.

Outputs:

- `bed-ambient.mp3` — no binaural difference;
- `bed-binaural.mp3` — controlled phase trajectory;
- breath rail embedded from approximately 03:00–07:15;
- phase-transition texture changes;
- exact 25:00 duration;
- sample-accurate phase continuity;
- no click, exposed pure test tone, melody, voice, or identifiable environmental event.

Binaural profile:

- 10 Hz, 8 Hz, 10 Hz, 8→7 Hz, 7 Hz, 7→10 Hz according to the Rev1 protocol;
- carrier center approximately 220 Hz with symmetrical offsets;
- frequency transitions slew or crossfade over at least 15–20 seconds;
- carrier remains embedded beneath the ambient texture.

### 3.5 Continuous-player architecture

Preferred:

- one continuous voice stem;
- one continuous support-bed stem;
- both start on the same user gesture;
- one shared session clock;
- voice time is authoritative;
- separate bounded voice and support levels;
- drift monitor and fail-closed behavior;
- no per-cue `play()` operation.

Fallback:

- pre-rendered `mix-binaural-low.mp3` and `mix-ambient-low.mp3` composite files;
- selected automatically if the target browser cannot prove stable two-stem operation.

The timer shall derive from media time rather than accumulating independent JavaScript intervals.

### 3.6 Audio pack

Suggested runtime path:

`public/audio/day1-guidance-rev1/`

Required minimum:

- Teach voice stem;
- Coach voice stem;
- Test voice stem;
- Ambient bed;
- Binaural bed;
- Low Support fallback composite mix;
- marker preview;
- voice preview;
- text equivalents;
- manifest;
- exact decoded durations;
- MIME types;
- file byte sizes;
- SHA-256 checksums;
- script hashes;
- voice ID;
- source revision;
- compatibility version.

Archive PCM WAV masters as a build artifact if repository size makes committing them inappropriate. Runtime delivery shall use iPhone-safe AAC/M4A or MP3.

### 3.7 Readiness interface

Before Start, implement:

- guidance tier;
- sound support mode;
- voice level;
- support level;
- breath pacing mode;
- headphone confirmation;
- marker/voice preview;
- audio-pack verification;
- compact readiness result;
- one dominant Begin button.

The pre-session preview must teach the marker before the timed meditation.

### 3.8 Debrief and adaptation

Implement the post-session fields from the Rev1 protocol, including:

- startle rating;
- breath comfort and air hunger;
- voice density and speed;
- bed helpfulness/distraction;
- binaural response;
- drowsiness;
- state markers.

Persist raw voice capture before interpretation. Apply only bounded adaptation rules.

## 4. Required verification

### 4.1 Static/content tests

- exact 1,500-second timeline;
- preserved phase allocation;
- strictly increasing cue timestamps;
- all required Teach cues present;
- each cue's word rate within limits;
- exact breath mechanics and release instruction present;
- return begins by 24:20;
- source lineage preserved;
- no live third-party runtime URL;
- support-bed and marker settings explicit;
- completion and state credit separate.

### 4.2 Audio tests

- all stems exactly 25:00 within encoded tolerance;
- cue onset occurs at absolute time;
- marker precedes every non-opening voice cue;
- voice fade and bed duck match the protocol;
- no cue collision;
- voice loudness and true peak pass;
- cue-to-cue perceived level passes;
- no abrupt click;
- bed contains no digital dropout;
- binaural channel difference matches the phase profile;
- speaker fallback contains no falsely labeled binaural mode;
- breath rail is 4/6 and ends before focused attention;
- every file hash passes.

### 4.3 Player tests

- single Start action authorizes the session;
- no delayed per-cue play calls;
- dual-stem start synchronization;
- drift within tolerance;
- fallback composite route;
- pause/resume alignment;
- output-route change fail closed;
- offline run;
- service-worker precache;
- early exit earns nothing;
- failed required audio earns nothing;
- full completion persists;
- voice-first debrief persists.

### 4.4 Physical-iPhone acceptance

Ryan's last-mile acceptance shall be reduced to two controlled stages:

1. **Five-minute quality acceptance**
   - marker preview;
   - opening through breath phase;
   - no startle above 1/5;
   - 4/6 pacing executable;
   - voice/bed balance accepted.

2. **Natural 25-minute acceptance**
   - all phase transitions;
   - at least one late cue;
   - full return;
   - full debrief persistence;
   - completion/state-credit separation.

Do not make Ryan listen to multiple full-duration candidate tracks. Machine and reviewer gates must close obvious defects first.

## 5. Required evidence artifacts

- locked-script manifest;
- audio-pack manifest;
- loudness/duration report;
- cue-timeline report;
- binaural-profile verification report;
- automated test result;
- Windows/private-runtime deployment result;
- five-minute physical acceptance record;
- natural-duration physical acceptance record;
- updated branch state;
- updated `QCTP_CURRENT_STATE.json` and macro manifest.

## 6. Stop conditions

Stop and report `BLOCKED` or `REROUTE_REQUIRED` if:

- Chill Brian cannot produce natural speech within the rate limits;
- exact cue timing cannot fit the locked phase boundaries;
- dual-stem synchronization fails on target iPhone and fallback mix is unavailable;
- the support bed masks speech;
- any cue still creates startle above the acceptance limit;
- breath coaching produces unresolved discomfort;
- the pack requires live third-party audio;
- user feedback is overwritten or downgraded to an optional preference.

## 7. Release boundary

The complete implementation remains a device-test candidate until all machine, audio, private-runtime, and physical-iPhone gates pass. Public merge and release remain `ZERO_RELEASE`.

## 8. Next controlled action

Execute `QCTP-D1-G1-A01`: lock the spoken Rev1 script, render the Chill Brian cues, generate the Ambient/Binaural support beds, and produce the continuous five-minute acceptance build plus full automated regression before involving Ryan again.
