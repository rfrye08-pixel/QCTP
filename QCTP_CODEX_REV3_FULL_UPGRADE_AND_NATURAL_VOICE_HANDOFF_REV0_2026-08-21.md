# QCTP Codex Rev3 Full Upgrade and Natural Voice Handoff — Rev0

**Handoff ID:** `QCTP-CODEX-REV3-HANDOFF-REV0`  
**Prepared:** `2026-08-21T21:37:46-05:00`  
**Repository:** `rfrye08-pixel/QCTP`  
**Execution branch:** `qctp-platform-rev3-codex`  
**Branch baseline:** `5eb60e1290ecaa5e6d06592eeba3992212ac31f3`  
**Main authority observed before handoff commits:** `71b0096a8631de5febdc88bd8b0a00130808642b`  
**Existing predecessor PR:** `#2` — frozen draft, do not merge  
**Release authority:** `ZERO_RELEASE`

## 1. Mission

Execute the complete next QCTP product revision. Do not reduce this to a voice patch or another planning report.

The result must be a substantially upgraded, source-grounded, mobile-first QCTP app that Ryan can use immediately upon waking. It must include a reliable voice-free fallback while narration is being repaired, a physically accepted natural meditation voice, the controlled Breath Director and Breath Foundations, State Atlas/progression controls, the planned user-experience upgrades, existing controlled source tracks, and full local-first reliability.

## 2. First actions — mandatory authority and branch preflight

1. Open or clone `rfrye08-pixel/QCTP`.
2. Fetch `main`, `qctp-platform-rev2-codex`, and `qctp-platform-rev3-codex`.
3. Check out **only** `qctp-platform-rev3-codex` for implementation.
4. Verify its starting ancestor is `5eb60e1290ecaa5e6d06592eeba3992212ac31f3`.
5. Read from `main`, in order:
   - `QCTP_CURRENT_STATE.json`;
   - `QCTP_MACRO_DELIVERABLE_MANIFEST_REV12.json`;
   - `QCTP_DAY1_AUDIO_A04_PHYSICAL_VOICE_NATURALNESS_FAILURE_REV0_2026-08-21.md`;
   - every exact authority file named by the current state.
6. Read `QCTP_REV2_CODEX_BRANCH_STATE.json` from `qctp-platform-rev2-codex`, then inspect the actual Rev3 code baseline.
7. Copy or reconcile main-only control artifacts into Rev3 as necessary. Do not merge `main` wholesale into the candidate.
8. Create `QCTP_REV3_CODEX_BRANCH_STATE.json` and record the actual starting SHAs, dirty-tree status, authority order, and release holds before feature edits.

If the state files or branch SHAs disagree, stop only long enough to record the exact conflict and resolve it conservatively. Do not silently choose an older design.

## 3. Immutable controls

- Source methods control meditation content. QCTP improvements remain separately labeled.
- Day 1 locked script SHA-256: `2649ce70e5ab824dbc6b797e07082567fda2443962016e8e6c7dbe454f5ee555`.
- Do not alter locked wording, source ownership, sequence, or state target without a new script hash and source-fidelity review.
- HeartMath Day 1 breathing is approximately five seconds in / five seconds out or comfortable, with no hold and no nasal-only requirement.
- Do not restore QCTP-B1 four/six breathing or one-to-ten breath counting to Day 1.
- The A03R narration is rejected because Ryan said it sounded robotic.
- Do not use broad spectral time-stretch to force cue duration.
- No required OpenAI, HeyGen, or other paid API key. Normal use and normal audio playback must cost $0.
- No live third-party media dependency during practice.
- Preserve IndexedDB data, migration lineage, recordings, exports, and user settings.
- Tests and timer completion never equal state attainment.
- Do not modify or merge `main`, `qctp-platform-rev2-codex`, or PR #2.
- Create a new draft PR from `qctp-platform-rev3-codex` to `main` only after a coherent, verified Rev3 checkpoint exists. Never merge it.

## 4. Execution packages

### P0 — Morning continuity, before voice work can block practice

Implement a normal-app **Voice-Free Day 1** mode as the first usable product checkpoint.

Requirements:

- one-tap launch from Today;
- source-grounded six-phase timeline;
- continuous Ambient/Binaural/Minimal support;
- HeartMath five/five breath rail during the coherence phase;
- nonverbal phase markers and a complete return;
- initial concise phase card that Ryan can read once, then use eyes closed;
- offline/same-origin package;
- completion stored as `VOICE_FREE_FALLBACK`, separate from narrated-content acceptance and state attainment;
- no rejected A03 voice anywhere in the flow.

This checkpoint must be installable on the private PX13 runtime and physically testable without waiting for voice selection.

### P1 — Natural Voice Recovery

Treat naturalness as a human-perception gate, not a machine metric.

1. Audit the A03 renderer and the partial A05 tools on `main`.
2. Build at least three materially different, license-compatible, zero-recurring-cost render candidates using identical locked text. Do not limit the study to three parameter settings of the same weak model if they sound alike.
3. Verify the legal right to use and redistribute the selected model voice/reference. Do not clone or redistribute a provider-owned voice when terms or consent are unclear.
4. Use model-native pacing, punctuation, clause/sentence rendering, and inserted real silence. Prohibit broad time-stretch. Any transparent adjustment outside `0.97x–1.03x` requires explicit justification and a physically accepted sample.
5. Create a blind iPhone Safari audition with randomized labels and matched loudness. Include representative opening, HeartMath coaching, spatial-attention, and return material—not only one opening paragraph.
6. Provide `A`, `B`, `C`, and `NONE`. Reveal engine identities only after selection.
7. Ryan’s physical verdict is the authority. ASR, MOS predictors, and browser gates cannot promote a voice.
8. Do not render the full 25-minute stem until a candidate receives explicit physical PASS.
9. If all candidates fail, change model/voice route. Do not rescue the same route with EQ or louder background audio.

Chill Brian is a preference reference, not a frozen identity. A different calm male voice is acceptable if Ryan judges it clearly more natural.

### P2 — Source-grounded Day 1 production implementation

After physical voice selection:

- render the exact 35-cue locked script at natural generated pace;
- preserve cue order and source transitions;
- solve timing through generation controls, segmentation, and authored silence—not broad stretching;
- integrate selected voice with continuous Ambient, Binaural, and Minimal modes;
- preserve predictive marker, bed ducking, fades, HeartMath rail, full return, fail-closed playback, and local checksums;
- use a continuous-player architecture with a composite fallback proven on iPhone;
- ship five-minute physical acceptance first, then one natural 25-minute acceptance;
- collect voice-first debrief: startle, naturalness, breath usability, support bed, marker, return, state markers, and disruptions.

### P3 — Breath Director and Breath Foundations

Implement the controlled breath specification, not a generic timer.

- seven-session Breath Foundations path;
- posture, route, cadence, volume, hold, release, corrections, stop conditions, and contraindication messaging from authority;
- visual and audio coaching that works eyes-closed;
- saved preferences and accessibility controls;
- separate source-specific breathing from optional QCTP regulation support;
- no breath completion/state-credit inflation;
- physical iPhone usability gate.

### P4 — Protocol hardening and State Atlas

Implement:

- `PREPARE -> INDUCE -> RECOGNIZE -> STABILIZE -> USE -> EXIT -> RECORD -> ADAPT`;
- Teach, Coach, Test, and Independent guidance tiers;
- Introduced, Accessed, Stabilized, Functional, and Transferable capability levels;
- state markers, readiness, troubleshooting, return, and evidence classification;
- raw observation before interpretation;
- source and enhancement labels visible in lesson/practice detail;
- progression gates that cannot be passed solely by elapsed time.

### P5 — User experience and morning cockpit

Make QCTP feel like a serious daily instrument rather than a collection of screens.

The Today screen must show, without setup friction:

- Morning Practice ready now;
- selected mode and expected duration;
- last session result and unresolved issue;
- quick Breath Director;
- one-tap voice note;
- current Foundation/source-track next step;
- local/offline and PX13 connection status;
- concise state-map progress;
- clear update/install status.

Keep navigation simple and mobile-first. Preserve `Today / Paths / Practice / Studio / More` unless verified usability testing supports a controlled change. No empty motivational gamification, false streak pressure, or advanced-state claims.

### P6 — Source tracks and controlled content

Implement only content with controlled source authority.

- Thomas Campbell controlled source-track MVP;
- Robert Edward Grant controlled source-track MVP;
- existing Bullard, HeartMath, Dispenza, Monroe/Buhlman, Mossbridge, remote-viewing, and psionics architecture where authority exists;
- clear separation among source-faithful, source-enhanced, QCTP synthesis, and QCTP original;
- no paid-script copying;
- do not fabricate Foundation Days 2–112 to fill the UI. Use explicit source/content holds where authoring is incomplete.

### P7 — Voice capture, local AI, and data reliability

Preserve and harden:

- global and field voice capture;
- timed auto-dictation;
- PX13 local Whisper and offline queue;
- deterministic Mirror Core;
- optional local generative Mirror on PX13;
- no required API key;
- IndexedDB migration and exact source snapshot;
- export/import including binary recordings;
- deletion confirmation and interruption-safe microphone cleanup;
- private Tailscale HTTPS.

### P8 — Verification, deployment, and controlled closeout

Required automated gates:

- format, lint, TypeScript, unit/integration/coverage;
- Chromium and WebKit/iPhone-profile acceptance;
- service-worker/offline/cache-update tests;
- actual-origin migration and existing-data preservation;
- microphone interruption, background/foreground, reconnect, export/import, and deletion tests;
- audio checksum, duration, clipping, marker, support continuity, and sync tests;
- Windows/PX13 isolated build, live-root discovery, exact served identity, and rollback;
- no-credit test modes;
- no external media or required paid API path.

Required physical gates, in order:

1. voice-free morning mode;
2. blind natural-voice audition;
3. five-minute selected-voice Day 1;
4. natural 25-minute Day 1;
5. Breath Director;
6. microphone and offline lifecycle.

Do not ask Ryan to repeat failed long tests. Each physical gate should be the shortest test capable of resolving the remaining uncertainty.

## 5. Required deliverables

- working code and committed artifacts on `qctp-platform-rev3-codex`;
- `QCTP_REV3_CODEX_BRANCH_STATE.json`;
- updated `QCTP_CURRENT_STATE.json` and macro manifest proposed in the Rev3 branch;
- natural-voice trade and licensing record;
- blind audition package and physical result record;
- voice-free morning package;
- updated Day 1 local media manifest;
- Breath Director implementation and tests;
- State Atlas/progression implementation and tests;
- UX acceptance report with mobile screenshots;
- migration and data-preservation evidence;
- private-runtime deployment package with rollback;
- draft Rev3 PR, explicitly `ZERO_RELEASE`;
- final `CODEX_EXECUTION_REPORT.md` listing exact SHAs, tests, artifacts, failures, holds, and one next action.

## 6. Execution behavior

Do the work. Do not return a plan as the primary result. Continue through every safely executable package. Stop for Ryan only at a genuinely irreducible physical decision, especially natural-voice selection. Preserve completed work and resume immediately after the decision.

One no-progress method gets one corrected retry. A repeated failure requires a materially different route. Do not spend Codex credits repeatedly rebuilding a 25-minute voice before a short sample passes.

## 7. Completion boundary

Do not report Rev3 COMPLETE until:

- the artifact exists;
- machine gates pass;
- required physical gates pass;
- data migration is verified;
- state and manifests are persisted;
- holds remain explicit;
- Ryan grants release authority.

Otherwise report `PARTIAL`, `BLOCKED`, `FAILED`, or `REROUTE_REQUIRED` accurately.
