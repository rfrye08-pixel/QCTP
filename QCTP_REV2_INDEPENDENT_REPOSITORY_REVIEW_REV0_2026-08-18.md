# QCTP Rev2 Independent Repository Review Rev0

**Review ID:** QCTP-R2-INDEPENDENT-REVIEW-REV0  
**Date:** 2026-08-18  
**Reviewed repository:** `rfrye08-pixel/QCTP`  
**Reviewed branch:** `qctp-platform-rev2-codex`  
**Reviewed head:** `ada1dad03f73072297fae366a77b7937c4e0ce44`  
**Draft PR:** `#2 — Build local-first QCTP Platform Rev2 MVP`  
**Disposition:** `NON-BREATH IMPLEMENTATION COMPLETE CANDIDATE / BREATH IMPLEMENTATION PENDING / ZERO RELEASE`

## 1. Purpose

Verify Ryan's correction that Codex has already built the Rev2 platform and that the Breath Director / Breath Foundations subsystem is the remaining unimplemented product capability.

This review distinguishes:

- **implementation status** — whether the feature exists in the candidate source;
- **automated verification evidence** — tests and checks recorded by Codex;
- **physical/release acceptance** — remaining device, migration, and natural-duration checks;
- **release authority** — whether the candidate may merge or deploy.

## 2. Sources inspected

- Draft pull request #2 metadata and complete changed-file inventory.
- `QCTP_REV2_CODEX_BRANCH_STATE.json` on the Codex branch.
- `REV2_VERIFICATION.md` on the Codex branch.
- Representative source modules for Foundation Day 1, voice capture, IndexedDB/domain architecture, Local AI Mirror, REG-01, server gateway, and local Whisper.
- Current controlled authority files on `main`, including the Breathwork specification.
- Branch tree and head commit.

The connector environment permitted repository and source inspection but did not provide a full local runner. Therefore, recorded test results are treated as **Codex-recorded verification evidence**, not as independently re-executed tests in this review.

## 3. Repository finding

Ryan's correction is valid.

The Codex branch contains a maintainable React/TypeScript Rev2 platform implementation rather than the earlier global-hotfix prototype. The changed-file inventory includes the PWA shell, typed domain schemas, IndexedDB repository, migrations, export/import, Foundation player, voice capture, local transcription client and PX13 Whisper companion, authenticated server gateway, Local AI Mirror client/backend, REG-01 Studio, Codex, Mirror Core, Insights, Lab surfaces, unit/integration tests, Playwright tests, and security/configuration documents.

The candidate is represented by draft PR #2 and remains unmerged.

## 4. Implemented product capabilities

### 4.1 Platform architecture

**Status:** `IMPLEMENTED_CANDIDATE`

Evidence includes:

- React 19 / TypeScript / Vite PWA architecture;
- versioned Zod domain schemas;
- IndexedDB v3 persistence;
- migration from Rev1 `localStorage:qctp-state`;
- JSON and binary ZIP export/import;
- mobile surfaces for Paths, Practice, Studio, Lab, Codex, Mirror, Insights, and Settings.

### 4.2 Foundation Day 1

**Status:** `IMPLEMENTED_CANDIDATE / REGRESSION PROTECTED`

The candidate preserves:

- exact 1,500-second duration;
- all 21 controlled cue timestamps;
- Chill Brian lesson and cue references;
- test-mode prohibition on natural completion credit;
- Days 2–112 as reserved, unauthored metadata.

### 4.3 Voice capture and transcription

**Status:** `IMPLEMENTED_CANDIDATE`

The source implements:

- global Quick Capture;
- field dictation;
- five-, ten-, and twenty-minute auto-dictation;
- experiment voice logs;
- pause, resume, stop, cancel, append, re-record, playback, and accepted-save flow;
- local-first binary persistence in IndexedDB;
- recording usability without transcription;
- offline transcription queue;
- separate raw audio, transcript, correction, clean note, interpretation, and tags;
- no-cost PX13 Whisper route;
- dormant optional paid-cloud adapter behind explicit server gates.

### 4.4 Zero-recurring-cost runtime

**Status:** `IMPLEMENTED_CANDIDATE`

The candidate records Free Local Mode as the default, requires no API key for core use, keeps paid cloud disabled, and includes tests asserting that normal operation does not contact a metered provider.

### 4.5 Local AI Mirror

**Status:** `IMPLEMENTED_CANDIDATE`

The candidate includes:

- deterministic on-device Mirror Core;
- iPhone/PWA Local AI Mirror client;
- offline request persistence and retry;
- PX13 loopback inference provider;
- source-record selection and claim-level citations;
- accept, revise, reject, annotate, tombstone, restore, and purge lifecycle;
- private signed device session;
- later retrieval and synchronization;
- `qwen3:8b` as the recorded PX13 candidate model.

### 4.6 Robert Edward Grant / REG-01

**Status:** `IMPLEMENTED_CANDIDATE`

The branch includes the controlled nine-step REG-01 Studio flow, five-minute accepted-audio gate, observation/interpretation separation, photo-or-drawing gate, and atomic Studio/Codex/Mirror/path outputs.

### 4.7 Codex, Lab, Insights, migration, and export

**Status:** `IMPLEMENTED_CANDIDATE`

The candidate contains typed records, search/index foundations, revision/provenance structures, structured experiment surfaces, deterministic insights, migration ledger, and full-state export/import code and tests.

## 5. Recorded verification evidence

The branch records:

- formatting: PASS;
- lint: PASS with zero warnings;
- TypeScript: PASS;
- 40 Node test files / 229 tests: PASS;
- coverage: 88.68% statements, 79.23% branches, 93.42% functions, 90.32% lines;
- production PWA build: PASS;
- Playwright: 20 scheduled, 14 passed, 6 intentional gating skips, 0 failed;
- local Whisper: 44 tests, 99.17% coverage, real `base` model transcription demonstrated;
- dependency audit: zero vulnerabilities;
- secret/static scan: no committed credential;
- private HTTPS and authenticated policy boundary: recorded PASS;
- PX13 startup restoration and local-model benchmark: recorded PASS;
- physical iPhone Mirror round trip: recorded partial/targeted PASS.

No GitHub Actions workflow run is attached to the reviewed head. These results were produced and recorded by Codex in the branch verification artifacts.

## 6. Breathwork finding

**Status:** `ONLY KNOWN UNIMPLEMENTED PRODUCT SUBSYSTEM`

The controlled file `QCTP_BREATHWORK_AND_RESPIRATORY_CONTROL_SPEC_REV0_2026-08-17.md` exists on `main` but is absent from `qctp-platform-rev2-codex` at reviewed head `ada1dad03f73072297fae366a77b7937c4e0ce44`.

The branch contains no Breath Director or seven-session Breath Foundations implementation in the PR changed-file inventory.

Therefore, the remaining implementation package is:

- deterministic Breath Director;
- Breath Foundations track;
- method-specific pacing and instructions;
- personal calibration;
- safety/hazard blocking;
- persistence/export;
- integration into relevant QCTP domains;
- tests and iPhone acceptance.

## 7. Remaining non-breath holds

The candidate still has release-acceptance holds that are not missing feature implementations:

1. optional CTranslate2 `small` high-accuracy model provisioning;
2. remaining physical-iPhone microphone/background/offline/reconnect/notification/lifecycle/export checks;
3. actual preserved-origin Rev1 migration comparison;
4. genuine natural-duration 1,500-second Day 1 acceptance.

These must remain explicit. They do not contradict the finding that Breathwork is the only identified unimplemented product subsystem.

## 8. Corrected controlled interpretation

The prior project description `Codex implementation active / broad production implementation pending` is superseded.

The correct state is:

- Rev2 non-breath feature implementation: **COMPLETE CANDIDATE**;
- Breathwork feature implementation: **PENDING**;
- automated gates: **RECORDED PASS**;
- selected hardware/device validations: **PARTIAL PASS**;
- merge/deployment: **NOT AUTHORIZED**;
- PR state: **DRAFT / OPEN / MERGEABLE / UNMERGED**.

## 9. Release authority

`ZERO RELEASE`

This review does not authorize merging PR #2, changing GitHub Pages source, or deploying Rev2.

## 10. Next controlled action

When QCTP Codex usage is available, update `qctp-platform-rev2-codex` from the current controlled `main` authority files, implement `QCTP-BREATH-REV0`, rerun the complete automated suite, update branch state and PR #2, and preserve the remaining release-acceptance holds until individually closed.
