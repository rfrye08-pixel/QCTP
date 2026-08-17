# QCTP Codex Rev2 Implementation Handoff Rev0

**Handoff ID:** QCTP-CODEX-REV2-HANDOFF-REV0  
**Date:** 2026-08-17  
**Status:** EXECUTION READY  
**Implementation agent:** Codex  
**Repository:** `rfrye08-pixel/QCTP`  
**Required work branch:** `qctp-platform-rev2-codex`  
**Release branch:** `main` — FROZEN except controlled authority/state documents

## 1. Mission

Build QCTP as a maintainable, mobile-first **Quantum Consciousness Training Platform**, not merely a meditation player.

The product loop is:

`LEARN -> PRACTICE -> CREATE -> EXPERIMENT -> RECORD -> REFLECT -> INTEGRATE -> REPEAT`

The released Rev1.1.4 Day 1 flow is a protected baseline. Codex shall replace the prototype/hotfix development style with a maintainable tested architecture without silently changing the released behavior.

## 2. Authority load order

Before coding, read these files in order:

1. `QCTP_CURRENT_STATE.json`
2. `QCTP_PRODUCT_ARCHITECTURE_REV2_2026-08-17.md`
3. `QCTP_MACRO_DELIVERABLE_MANIFEST_REV2.json`
4. `QCTP_ROBERT_EDWARD_GRANT_INTEGRATION_REV0_2026-08-17.md`
5. `QCTP_VOICE_CAPTURE_AND_TRANSCRIPTION_SPEC_REV0_2026-08-17.md`
6. `QCTP_REV2_BRANCH_STATE.json` from branch `qctp-platform-rev2`
7. Current production source on `main`
8. Prototype `platform-rev2.js` on `qctp-platform-rev2` as a functional reference only, not as required architecture

Controlled documents outrank chat, comments, and prototype implementation details.

## 3. Branch and release controls

1. Work only on `qctp-platform-rev2-codex`.
2. Do not push implementation changes directly to `main`.
3. Do not change GitHub Pages source during implementation.
4. Keep Rev1.1.4 recoverable.
5. Open a draft PR to `main` only after the acceptance suite passes locally and in a non-production preview.
6. Do not merge the PR.
7. Record every known hold in the PR and branch-state file.

## 4. Implementation strategy decision

Do not continue stacking global hotfix scripts.

Refactor the application into a maintainable typed project with clear modules and tests. Preferred baseline:

- TypeScript;
- React or an equivalently maintainable component architecture;
- Vite-compatible PWA build;
- IndexedDB for binary/local-first records;
- explicit domain schemas and migrations;
- provider interfaces for transcription, neural lesson audio, storage, and AI Mirror;
- Vitest or equivalent unit/integration tests;
- Playwright or equivalent browser end-to-end tests;
- linting, formatting, type checking, and production build verification.

A different stack is acceptable only if Codex documents why it produces a stronger verified result while meeting every requirement.

## 5. Required monorepo or modular boundaries

The implementation shall create clear boundaries equivalent to:

- `app`: routes, screens, navigation, installable PWA shell;
- `domain`: typed entities, schemas, migrations, evidence/source separation;
- `foundation`: 112-day path and released Day 1 content;
- `audio-player`: timed neural lesson/practice sequencer;
- `voice-capture`: microphone capture, IndexedDB queue, playback, segmentation;
- `transcription-client`: backend API contract and status handling;
- `studio`: Robert Edward Grant path, geometry session engine, auto-dictation;
- `lab`: experiment protocols and logs;
- `codex`: personal record store, search-ready schema, attachments;
- `mirror`: structured reflection and future AI-provider interface;
- `export-import`: versioned complete data portability;
- `backend`: authenticated transcription endpoint and provider adapter;
- `tests`: unit, integration, migration, PWA, and end-to-end verification.

## 6. Largest controlled work package

Implement the following as one coherent Rev2 MVP rather than isolated mock screens.

### 6.1 Foundation preservation and migration

- Import existing Rev1 local state without loss.
- Preserve current day, completed components, workbook answers, logs, settings, and test state.
- Preserve Chill Brian Day 1 lesson and cue references.
- Preserve the exact 1,500-second Day 1 practice timeline.
- Preserve completion-based progression.
- Do not author or fabricate Days 2–112.

### 6.2 Platform shell

Implement usable iPhone portrait navigation for:

- Today;
- Paths;
- Practice;
- Studio;
- Lab;
- Codex;
- Mirror / Insights;
- Settings / More.

The user must be able to understand which content is released, in progress, reserved, or experimental.

### 6.3 Robert Edward Grant MVP

Implement the controlled REG-01-A session:

- geometry reference;
- step sequence;
- raw observation;
- separate interpretation;
- five-minute auto-dictation;
- photo capture;
- precept integration;
- completion gate;
- Codex record;
- completion-based Grant path state.

Do not copy paid course content.

### 6.4 Voice capture MVP

Implement the complete requirements in `QCTP_VOICE_CAPTURE_AND_TRANSCRIPTION_SPEC_REV0_2026-08-17.md` with these minimum user-visible capabilities:

- global Quick Capture microphone;
- microphone beside text fields;
- five-, ten-, and twenty-minute Auto-Dictation recording;
- Start, Stop, Pause, Resume, Cancel, playback, re-record, and append segment;
- visible recording state, timer, and level/waveform indication;
- raw audio stored in IndexedDB immediately;
- offline transcription queue;
- explicit destination selection;
- immutable original transcript;
- editable corrected transcript;
- optional clean note;
- raw audio, transcript, and clean note linked but separate;
- complete delete and export routes.

### 6.5 Transcription backend

Implement a secure backend package and local development route.

Requirements:

- no API key in frontend source;
- environment-secret configuration;
- authenticated or single-user protected endpoint;
- file type, size, and duration validation;
- rate limiting interface;
- structured request and response schemas;
- OpenAI transcription provider adapter;
- default model configuration for `gpt-4o-mini-transcribe`;
- optional high-accuracy configuration for `gpt-4o-transcribe`;
- provider interface remains replaceable;
- transcription failure never deletes source audio;
- tests use a mock provider and do not require production secrets.

Do not deploy a production backend or require Ryan to expose a plaintext key during this task.

### 6.6 Codex, Mirror, and Lab data foundation

- Store geometry, voice notes, auto-dictation, dreams, OBE, RV, psionics, synchronicity, intuition, Mirror, and source-note records under versioned typed schemas.
- Keep raw observation distinct from interpretation.
- Support tags and source links at the schema level.
- Ensure JSON export/import round-trips all new entities.
- Add search-ready indexing even if full AI Mirror is not yet active.

## 7. Voice-note experience standard

The voice feature should feel like a first-class capture tool, not a browser demo.

Acceptance experience:

1. Ryan taps one microphone button.
2. The app clearly indicates recording.
3. He speaks without choosing a category first.
4. He stops and can immediately replay it.
5. The audio is already safe locally.
6. If online, transcription starts automatically.
7. If offline, the note is visibly queued.
8. He can continue using the app.
9. The transcript appears without destroying the audio.
10. He can preserve verbatim text, correct it, generate a cleaner note, choose tags, and route the note to the right QCTP section.

## 8. Storage and privacy rules

- Never store audio blobs in localStorage.
- Use IndexedDB or an equivalent binary local store.
- Do not silently upload before the user has accepted the recording and provider route.
- Record provider/model provenance.
- Provide deletion of local audio, transcript, derived note, and remote object.
- No continuous passive recording.
- No microphone access before explicit user action.
- No hidden background recording.

## 9. Testing requirements

### 9.1 Static quality

- type check passes;
- lint passes;
- unit tests pass;
- production build passes;
- no committed secrets;
- dependency audit reviewed;
- no console errors in tested flows.

### 9.2 Foundation regression

- existing Rev1 local data migrates;
- Day 1 Chill Brian lesson starts;
- lesson-to-practice transition works;
- exact practice duration is 1,500 seconds;
- fixed cue timestamps remain correct;
- morning completion state is saved only at true completion;
- Days 2–112 remain reserved rather than fabricated.

### 9.3 Voice capture

- record ten minutes on a supported desktop browser test environment;
- pause/resume;
- cancel;
- playback;
- append segment;
- persist across reload;
- simulate offline queue and reconnection;
- mock successful transcription;
- mock failed transcription;
- original transcript remains unchanged when corrected transcript changes;
- clean note generation cannot overwrite raw layers;
- deletion removes all selected local records;
- export includes metadata and accessible audio artifacts or a documented archive route.

### 9.4 REG-01 and platform

- complete REG-01;
- photo capture/storage path works;
- raw and interpretation fields remain separate;
- Codex entry is created;
- Mirror entry is created and traceable;
- path advances only after completion;
- JSON export/import preserves the records.

### 9.5 PWA and responsive behavior

- installable manifest and service worker pass;
- application shell works offline;
- queued recordings survive offline/reload;
- iPhone portrait dimensions are covered in automated responsive tests;
- minimum tap targets are appropriate;
- no horizontal overflow in primary flows.

## 10. Required deliverables

Codex must produce:

1. runnable source on `qctp-platform-rev2-codex`;
2. clear README with local setup;
3. `.env.example` without secrets;
4. architecture document;
5. migration specification and tests;
6. voice-capture and transcription implementation;
7. mock transcription provider;
8. OpenAI provider adapter;
9. full automated test suite;
10. build verification report;
11. known-holds report;
12. updated `QCTP_REV2_CODEX_BRANCH_STATE.json`;
13. draft PR to `main` with no merge;
14. one exact user-last-mile step only if preview deployment requires an account authorization that tools cannot complete.

## 11. Completion language

Do not claim `DONE`, `COMPLETE`, `PASS`, or `RELEASED` unless the relevant artifact exists and its tests were actually run.

Allowed final dispositions:

- `PASS — READY FOR DEVICE TEST`
- `PARTIAL`
- `BLOCKED`
- `FAILED`
- `REROUTE_REQUIRED`

No runtime receives release authority through this handoff.

## 12. Codex execution prompt

Use this exact task statement after opening the repository in Codex:

> Execute `QCTP-CODEX-REV2-HANDOFF-REV0` from `QCTP_CODEX_REV2_IMPLEMENTATION_HANDOFF_REV0_2026-08-17.md`. Load the controlled authority files in the specified order. Build the complete maintainable Rev2 MVP on branch `qctp-platform-rev2-codex`, including first-class voice capture, local-first audio persistence, secure server-side transcription architecture, the Foundation regression, the Robert Edward Grant REG-01 MVP, Codex/Mirror/Lab data foundations, migrations, automated tests, and a draft PR. Do not modify or deploy `main`, do not fabricate Days 2–112, do not embed secrets, and do not substitute planning for implementation. Continue until the largest safe verified package is delivered or an irreducible blocker is reached.
