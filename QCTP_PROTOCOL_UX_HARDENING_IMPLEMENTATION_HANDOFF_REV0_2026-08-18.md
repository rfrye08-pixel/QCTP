# QCTP Protocol and UX Hardening Implementation Handoff Rev0

**Handoff ID:** QCTP-HARDENING-HANDOFF-REV0  
**Date:** 2026-08-18  
**Status:** EXECUTION READY WHEN QCTP IMPLEMENTATION CAPACITY IS AUTHORIZED  
**Repository:** `rfrye08-pixel/QCTP`  
**Controlled work branch:** `qctp-platform-rev2-codex`  
**Draft PR:** `#2`  
**Release authority:** `ZERO RELEASE`

## 1. Mission

Harden QCTP’s training protocol, meditation accuracy, state verification, audio reliability, Thomas Campbell integration, and user experience without rebuilding or regressing the completed Rev2 candidate subsystems.

The target loop is:

`LEARN -> PREPARE -> INDUCE -> RECOGNIZE -> STABILIZE -> USE -> RECORD -> REFLECT -> INTEGRATE`

## 2. Authority load order

Read in this order before editing:

1. `QCTP_CURRENT_STATE.json`
2. `QCTP_MACRO_DELIVERABLE_MANIFEST_REV3.json`
3. `QCTP_TRAINING_PROTOCOL_HARDENING_AND_INSTRUCTION_STANDARD_REV0_2026-08-18.md`
4. `QCTP_STATE_ATLAS_AND_CORE_MEDITATION_RECIPES_REV0_2026-08-18.md`
5. `QCTP_MEDITATION_AUTHORING_AUDIO_ASSET_AND_QA_STANDARD_REV0_2026-08-18.md`
6. `QCTP_USER_EXPERIENCE_EXPLORATION_AND_ENGAGEMENT_SPEC_REV0_2026-08-18.md`
7. `QCTP_THOMAS_CAMPBELL_INTEGRATION_REV0_2026-08-18.md`
8. `QCTP_DAY1_HARDENING_DELTA_AND_CANDIDATE_SCRIPT_REV0_2026-08-18.md`
9. `QCTP_BREATHWORK_AND_RESPIRATORY_CONTROL_SPEC_REV0_2026-08-17.md`
10. `QCTP_DAY1_IPHONE_AUDIO_REGRESSION_REV0_2026-08-18.md`
11. current branch state and `REV2_VERIFICATION.md`
12. current candidate source and tests

Controlled documents outrank chat summaries and earlier prototype files.

## 3. Anti-regression controls

Do not:

- modify or deploy `main` runtime code;
- merge PR #2;
- replace IndexedDB/domain architecture;
- remove Free Local Mode;
- require an API key;
- regress voice capture, local Whisper, Local AI Mirror, REG-01, export/import, or private Tailscale topology;
- change the current 1,500-second Day 1 until the hardened candidate passes all release gates;
- fabricate Days 2–112;
- copy proprietary source-course scripts;
- conflate Campbell, Monroe, Gap, coherence, or other state terminology;
- continue a silent timer when required audio fails.

Preserve valid Rev2 work and add modular capabilities.

## 4. Execution order

### Work Package A — Restore reliable practice audio

This is first because it blocks actual use.

1. pull current candidate head containing the persistent-audio patch;
2. rerun formatting, lint, typecheck, unit/integration, coverage, build, and relevant Playwright tests;
3. fix any regression caused by the patch;
4. rebuild `dist`;
5. restart the private PX13 QCTP runtime;
6. verify physical-iPhone opening cue and delayed 45-second cue;
7. verify pause/resume and failure-to-pause;
8. update branch state and PR.

Do not wait for Breathwork or UX work to close this blocker.

### Work Package B — Hardened domain model

Add typed, versioned entities for:

- state definitions;
- state markers;
- look-alike states;
- correction rules;
- reliability levels;
- prerequisite gates;
- meditation phases;
- cue definitions;
- guidance tiers;
- audio-pack manifests;
- session outcomes;
- capability records;
- remediation recommendations;
- source-lineage relationships.

Add migrations and export/import coverage.

### Work Package C — Breath Director

Implement the complete existing Breathwork specification:

- methods;
- selector;
- local pacing;
- calibration;
- hazardous-context block;
- state transition instructions;
- persistence;
- export;
- tests;
- physical-iPhone acceptance.

### Work Package D — State Map and capability engine

Implement:

- State Map nodes;
- prerequisites;
- Introduced/Accessed/Stabilized/Functional/Transferable levels;
- state-specific marker scoring;
- remediation routes;
- guidance-tier recommendations;
- source-term cross-reference labels;
- capability milestones.

Timer completion and capability credit remain separate.

### Work Package E — Meditation and local audio-pack system

Implement:

- machine-readable session schema;
- phase/cue validation;
- local binary audio-pack storage;
- SHA-256 manifests;
- offline retrieval;
- audio readiness preflight;
- one persistent media pipeline;
- fail-closed timer;
- captions/text equivalents;
- pause/interruption recovery;
- physical-device QA tools.

No released meditation may require a live third-party audio request.

### Work Package F — User-experience upgrade

Implement the UX specification without hiding advanced functionality:

- simplified Today mission;
- State Map;
- compact Practice cockpit;
- audio-only/phase/full-visual modes;
- voice-first debrief;
- Explore source/skill tracks;
- Expeditions;
- capability milestones;
- evidence-based Discovery cards;
- consistent visual language;
- Reduced Motion and accessibility;
- human-readable recovery messages.

Run iPhone portrait and one-handed-use acceptance.

### Work Package G — Thomas Campbell MVP

Implement:

- ten-module track metadata;
- TC-01 Possibility Ledger;
- TC-02 Point Consciousness practice;
- TC-03 First/Second/Story calibration;
- TC-04 Intent Stack;
- TC-05 Trigger Reconstruction;
- TC-06 Stable Imaginality Environment;
- links into Lab, Codex, Mirror, State Map, and source tracks.

Later experimental modules may remain reserved until prerequisites and protocols are complete.

### Work Package H — Hardened Day 1 candidate

Only after the new state/session/audio systems exist:

- encode the candidate script;
- review every cue;
- render Chill Brian masters;
- produce local AAC/M4A pack and archived WAV masters;
- verify checksums/durations;
- add voice-first debrief and capability scoring;
- run full automated suite;
- run full natural-duration physical-iPhone acceptance;
- preserve Rev1.1.4 until separate release authority.

### Work Package I — Days 2–14 foundation package

Author and implement only after Day 1 hardening passes:

- mechanics;
- focused attention;
- open monitoring;
- coherence transfer;
- Gap introduction;
- point-consciousness introduction;
- gate and remediation sessions.

Do not author the remaining 98 days as filler.

## 5. Required automated tests

- schema validation;
- migration idempotency;
- state prerequisites;
- reliability transitions;
- remediation selection;
- exact cadence math;
- exact cue timestamps;
- audio pack checksums;
- decoded duration tolerance;
- local/offline retrieval;
- persistent media reuse;
- playback rejection pauses timer;
- early exit/no credit;
- test mode/no credit;
- capability credit independent of completion;
- source relationship labels;
- no paid-provider call;
- export/import round trip;
- accessibility labels and reduced motion;
- iPhone portrait no-overflow/tap targets.

## 6. Required physical acceptance

- opening and delayed cues;
- lesson-to-practice transition;
- local audio pack offline;
- pause/resume;
- screen state;
- Bluetooth route change;
- failure recovery;
- Breath Director haptic/audio/visual modes;
- post-session voice debrief;
- State Map and Today usability;
- REG-01 and Campbell record capture;
- full Day 1 natural-duration run.

## 7. Documentation and controlled-state closeout

At each material package:

- update branch state;
- update verification record;
- update PR #2 body and holds;
- record test commands and results;
- identify exact candidate head;
- do not claim release;
- preserve one next controlled action.

## 8. Completion report

Report:

- Result
- Delivered
- Verification
- State/migration impact
- UX changes
- Curriculum/state changes
- Audio-pack status
- Physical-device status
- Remaining holds
- Release authority
- Exactly one next controlled action

## 9. Release status

Execution may produce an updated draft candidate only. Merge and deployment remain prohibited without separate explicit authority.
