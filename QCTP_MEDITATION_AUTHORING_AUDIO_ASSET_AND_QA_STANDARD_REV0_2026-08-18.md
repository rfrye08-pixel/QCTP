# QCTP Meditation Authoring, Audio Asset, and QA Standard Rev0

**Document ID:** QCTP-MEDITATION-AUDIO-QA-REV0  
**Date:** 2026-08-18  
**Status:** CONTROLLED CONTENT-PRODUCTION AND RELEASE AUTHORITY  
**Parent authorities:** `QCTP_TRAINING_PROTOCOL_HARDENING_AND_INSTRUCTION_STANDARD_REV0_2026-08-18.md`, `QCTP_STATE_ATLAS_AND_CORE_MEDITATION_RECIPES_REV0_2026-08-18.md`  
**Applies to:** lesson narration, guided meditations, breath pacing, transition tones, haptics, silent intervals, practice timers, local audio packs, accessibility text, testing, and release

## 1. Purpose

A QCTP meditation must work as a timed state-training instrument, not merely as spoken prose over a countdown.

The system must guarantee that:

- the correct instruction occurs at the correct point;
- silence is real and intentional;
- required narration is audible before the timer consumes the phase;
- the released session is usable offline;
- audio does not depend on a third-party request during practice;
- pause/resume preserves phase and narration;
- failure is visible and recoverable;
- the user can complete the practice without watching the screen;
- the state target and progression gate remain traceable to controlled content.

## 2. Content-production lifecycle

Every released meditation passes through these controlled stages:

1. `CONCEPT` — target state, prerequisite, source type, and session purpose defined.
2. `PROTOCOL DRAFT` — phase structure, timings, state markers, troubleshooting, and return sequence authored.
3. `INSTRUCTION REVIEW` — vague language removed; every action operationalized.
4. `SOURCE REVIEW` — source-specific terminology and public-source attribution checked; proprietary scripts not copied.
5. `TIMELINE LOCK` — exact duration, phase boundaries, cue timestamps, silence blocks, and guidance tiers frozen.
6. `VOICE SCRIPT LOCK` — exact spoken copy frozen and versioned.
7. `AUDIO RENDER` — narration rendered from the locked script.
8. `AUDIO TECHNICAL QA` — durations, loudness, clipping, leading/trailing silence, codec, and checksums validated.
9. `APP INTEGRATION` — local pack, persistent audio pipeline, timer, pause/resume, captions, and error handling wired.
10. `AUTOMATED REGRESSION` — content hashes, cue timestamps, audio manifests, timer behavior, and persistence tested.
11. `PHYSICAL DEVICE ACCEPTANCE` — target iPhone, headphones, screen state, network/offline, interruption, and complete natural-duration test.
12. `RELEASE` — explicit authority changes the session from candidate to released.

No stage may be skipped because the script “sounds right.”

## 3. Session definition schema

Every meditation definition must contain:

```text
sessionId
revision
contentStatus
sourceType
sourceLineage
targetStateId
prerequisiteStateIds
requiredReliabilityLevel
totalDurationMs
minimumValidCompletionMs
posture
eyeState
breathProtocolId
safetyProfileId
guidanceTiers
phaseDefinitions
cueDefinitions
audioPackId
textEquivalentId
stateMarkerSetId
troubleshootingSetId
returnProtocolId
journalTemplateId
completionRule
capabilityCreditRule
```

## 4. Phase definition

Each phase must define:

- phase ID;
- title;
- start and end timestamp;
- state function;
- required prior condition;
- user action;
- expected markers;
- prohibited action;
- correction cue;
- whether narration is required;
- whether silence is required;
- whether haptic or tone transition is permitted.

Example:

```text
Phase: M-F10-BODY-RELEASE
Start: 05:00
End: 15:00
Function: reduce voluntary muscular and sensory engagement
Action: one pass through named body regions, then stop rechecking
Required audio: opening cue plus two sparse reminders
Prohibited: repeated posture adjustment, forced numbness, breath retention
Exit condition: automatic breathing + lower movement + retained alertness
```

## 5. Cue definition

Every spoken cue must contain:

- cue ID;
- absolute timestamp;
- guidance tier membership;
- text hash;
- audio file ID;
- exact audio duration;
- required or optional status;
- associated phase;
- state function: `orient`, `induce`, `correct`, `transition`, `stabilize`, `task`, `return`, or `safety`;
- permitted tone/haptic;
- fallback text.

Absolute timestamps are authoritative. Spoken-cue duration may not shift later phase boundaries.

## 6. Script language standard

### 6.1 One action per sentence where practical

Prefer:

> “Stop counting now. Let the next breath occur by itself.”

Avoid:

> “Stop counting, relax, release your body, open to the field, and allow yourself to drift into expanded awareness.”

### 6.2 Specify perspective

Imagery and movement instructions must state:

- first-person kinesthetic;
- first-person visual;
- third-person visual;
- spatial awareness;
- symbolic contemplation;
- deliberately constructed imagery;
- receptive observation.

Example:

> “Imagine rolling from inside the felt body. Do not watch yourself from across the room.”

### 6.3 Do not presuppose a sensation

Prefer:

> “Notice warmth, pressure, tingling, pulsing, imagery, emotion, or no distinct sensation.”

Avoid:

> “Feel the energy rising.”

### 6.4 Do not demand sleep-like depth

Prefer:

> “Allow the body to become heavy or remote while you retain the ability to follow the next cue.”

Avoid:

> “Your body is completely asleep now.”

### 6.5 Correct without breaking state

Correction cues must be brief:

- “If thought has carried you away, return to one breath, then widen again.”
- “If you are drifting into sleep, open the eyes slightly.”
- “If you are forcing, reduce effort by half.”

Long teaching belongs before the meditation or after the session.

## 7. Guidance-tier production

Each meditation supports at least three released tiers after the state has been introduced.

### Teach

- frequent guidance;
- exact mechanics;
- correction cues;
- state-marker introduction;
- longer spoken transitions.

### Coach

- phase openings;
- one correction reminder per major phase;
- sparse state checks;
- longer silence.

### Test

- target statement;
- phase tones or brief labels;
- one return cue;
- no teaching.

### Independent

- optional timer;
- optional tones/haptics;
- no narration unless safety or return is requested.

The app may recommend a tier but may not silently reduce guidance without informing the user.

## 8. Narration style

The controlled narration style is:

- calm;
- conversational;
- direct;
- grounded;
- non-theatrical;
- non-sleepy unless sleep is the target;
- no mystical performance voice;
- no sales tone;
- no unnecessary repetition.

Recommended speaking-rate ranges:

- teaching: 120–145 words per minute;
- active induction: 95–120 words per minute;
- deep-state sparse cues: 80–105 words per minute;
- return/safety cues: 105–130 words per minute.

These are production targets, not hard biological claims. Natural phrasing and intelligibility outrank a numeric rate.

## 9. Audio master and delivery formats

### 9.1 Master

Archive master:

- PCM WAV;
- 48 kHz;
- 24-bit where provider/export supports it;
- mono unless a controlled stereo spatial design is required;
- no lossy transcoding before the master archive.

### 9.2 Delivery

At least one iPhone-safe delivery file shall be included:

- AAC-LC in M4A, mono, 96–128 kbps; or
- MP3, mono, 96–128 kbps.

Opus may be included as an optional secondary format but shall not be the only released format.

### 9.3 Loudness

Target for narration segments:

- integrated loudness approximately -18 to -16 LUFS;
- true peak no higher than -1 dBTP;
- consistent segment-to-segment perceived level;
- no clipping;
- no abrupt noise-floor changes.

Transition tones must remain clearly below the narration’s startling level and must be adjustable separately.

## 10. Silence and pacing rules

- Silence is represented as timeline duration, not as spoken “wait here.”
- A required cue must finish before the next required cue begins.
- Deep-state silence blocks should not be filled with unnecessary ambient loops.
- Background audio, when used, must have a defined purpose and separate volume control.
- No cue should begin less than 500 ms after a sharp transition tone.
- Return cues must allow enough time for orientation before the session ends.
- The user must be able to inspect the complete timing map before release, but the active screen should remain simple.

## 11. Local audio-pack requirement

A released session must not call HeyGen, OpenAI, or another third-party host during the meditation.

Each audio pack must contain:

- pack ID;
- revision;
- session IDs;
- audio files;
- text hashes;
- file byte sizes;
- MIME types;
- exact durations;
- SHA-256 checksums;
- total pack size;
- created date;
- voice identity;
- source-script revision;
- compatibility version.

The pack is either:

- bundled with the installed build; or
- downloaded before practice and stored in IndexedDB or another approved binary store.

The app verifies every required file before marking the session `AUDIO READY`.

## 12. Audio preflight

Before a released guided session begins, QCTP automatically checks:

- all required segments present;
- checksum pass;
- supported codec;
- media element can play;
- selected output route is active;
- user media volume is not effectively muted where detection is possible;
- persistent audio pipeline is authorized by a user action;
- timer ready;
- wake-lock state known;
- storage write test passed;
- battery is not critically low where the platform permits detection.

The user sees one compact readiness result:

- `READY`
- `READY — KEEP SCREEN AWAKE`
- `AUDIO PACK REQUIRED`
- `OUTPUT MUTED OR BLOCKED`
- `STORAGE NOT READY`
- `SESSION BLOCKED FOR SAFETY`

A three-second voice-and-tone preview is available but should not be required every morning after a stable device configuration is established.

## 13. Persistent media pipeline

QCTP must use one persistent, user-authorized media pipeline for a session.

Requirements:

- do not create a new unauthorized media element for each delayed cue;
- preauthorize the pipeline from the user’s Start action;
- reuse it for every cue;
- preserve it through silence;
- pause and resume the same cue when possible;
- preserve output volume and route;
- avoid service-worker interception of external range requests in candidate legacy paths;
- prefer local blob/object URLs or same-origin local assets;
- release resources at session end.

## 14. Fail-closed timer behavior

The timer may begin only when:

- the opening cue is playing; or
- the session is an explicitly silent/test tier and the user confirms that mode.

If a required cue fails:

1. pause the timer immediately;
2. preserve elapsed time and phase;
3. show the failed cue text;
4. provide `Retry audio`, `Continue as silent test`, or `End without completion` according to session authority;
5. do not grant natural completion if required audio was skipped in a guided-release session;
6. log the failure without recording private session content.

A user must never discover after 25 minutes that the app silently failed at the beginning.

## 15. Pause, interruption, and resume

QCTP shall support:

- user pause;
- incoming call or audio interruption;
- app backgrounding;
- screen state change;
- Bluetooth output change;
- route loss;
- temporary network loss during candidate legacy audio;
- wake-lock release.

On interruption:

- timer pauses unless the session is validated for background continuation;
- current cue position is preserved;
- the user receives a clear resume state;
- audio does not restart from an unrelated cue;
- session validity remains explicit.

## 16. Accessibility

No essential instruction may exist only in one channel.

Required alternatives:

- spoken cue plus synchronized text;
- visual transition plus optional haptic/tone;
- color plus icon/label;
- motion plus static reduced-motion representation;
- microphone control plus accessible label and large tap target;
- text-size scaling;
- VoiceOver order;
- captions/transcript for lesson audio;
- no flashing or abrupt high-intensity effects.

## 17. Audio QA automation

Automated checks must verify:

- session duration;
- phase boundaries;
- strictly increasing cue timestamps;
- cue membership by guidance tier;
- no duplicate required cue;
- audio file existence;
- checksum;
- decoded duration within tolerance;
- cue audio duration does not collide with next required cue;
- text hash matches locked script;
- pack version compatibility;
- offline retrieval;
- persistent media-element reuse;
- timer pauses on rejected playback;
- pause/resume state;
- early exit earns no completion;
- test mode earns no completion;
- natural completion requires the full controlled duration;
- no metered provider request occurs.

## 18. Browser and physical-device acceptance

### 18.1 Browser automation

- iPhone portrait layout;
- audio pipeline stub success and rejection;
- accelerated timeline;
- visibility interruption;
- service-worker/offline pack;
- captions and accessibility labels;
- local persistence;
- failure recovery.

### 18.2 Physical iPhone

At minimum:

1. installed PWA launch;
2. headphones and speaker output;
3. voice preview;
4. opening cue;
5. automatic second cue after real silence without another tap;
6. at least one five-minute uninterrupted run;
7. pause/resume mid-cue;
8. screen-up low-brightness run;
9. intended face-down/background behavior;
10. Bluetooth route change;
11. forced offline run with local pack;
12. forced audio failure and timer pause;
13. lesson-to-practice automatic transition;
14. full natural-duration run for release-critical sessions.

## 19. Content QA review checklist

A reviewer must answer yes to all:

- Is the target state defined?
- Are prerequisites stated?
- Are instructions physically executable?
- Is breath route/volume/cadence explicit when used?
- Are deliberate imagery and receptive observation distinguished?
- Are state markers and look-alikes defined?
- Does the script stop teaching before the deep silent phase?
- Are corrections concise?
- Is the return sequence adequate?
- Are source terms preserved?
- Is raw experience separated from interpretation?
- Does the session avoid claiming guaranteed attainment?
- Does the app block unsafe context?
- Can the user finish without looking at the screen?

## 20. Day 1 hardening delta

The current candidate Day 1 shall remain protected until a controlled revision is authorized. Before its next content revision, it must gain:

- local audio-pack packaging rather than runtime third-party URLs;
- fail-closed opening-cue behavior;
- explicit audio readiness;
- exact breath instruction during the coherence phase or an explicit natural-breath instruction;
- brief state-marker explanation before practice;
- drowsiness/over-effort correction;
- voice-first debrief;
- capability credit separate from timer completion;
- physical-iPhone full-duration acceptance.

## 21. Acceptance criteria

This standard is closed only when:

1. a machine-readable session and audio-pack schema exists;
2. at least one hardened session passes every content and technical check;
3. no released session requires a live third-party audio fetch;
4. persistent media reuse is verified on iPhone;
5. fail-closed timer behavior is verified;
6. offline audio-pack use is verified;
7. full-duration device acceptance is complete;
8. reduced guidance and accessibility channels are tested;
9. release authority identifies the exact pack and script revision.

## 22. Release status

This specification authorizes content-production and implementation work. It does not release a new Day 1 script, audio pack, or runtime.
