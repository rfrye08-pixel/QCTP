# QCTP Rev2 Verification Record

**Date:** 2026-08-17

**Branch:** `qctp-platform-rev2-codex`

**Base commit:** `cec7f3dad3fb761c6883fbe2051fe76c9b45eb83`

**Disposition:** `AUTOMATED REV2 CANDIDATE GATES PASS; DEVICE/MODEL/BENCHMARK HOLDS REMAIN`

**Release authority:** `ZERO_RELEASE`

This file distinguishes automated implementation evidence from tests that require real hardware, installed local models, or controlled release authority. A passing build does not authorize merge or deployment. The counts below are from the final post-authority consolidation on this branch; they are implementation evidence only and do not satisfy the explicit physical-device, real-model, migration-origin, or natural-duration holds.

## Controlled invariants under test

- Foundation Day 1 duration is exactly 1,500 seconds.
- Controlled cue timestamps are exactly `0, 45, 105, 180, 240, 330, 420, 480, 600, 720, 780, 840, 930, 1020, 1110, 1200, 1290, 1360, 1380, 1440, 1490`.
- Chill Brian lesson/cue references and controlled text match the independent Rev1.1.4 regression fixture.
- Test mode never writes natural morning completion.
- Days 2–112 remain metadata-only and reserved.
- Rev1 data migration is idempotent and preserves its exact source snapshot.
- Recording is local-first; microphone access begins only after explicit action; upload follows explicit acceptance.
- Raw audio, transcript layers, clean note, interpretation, tags, and generated Mirror results remain separate.
- Free Local Mode runs without provider environment variables and does not call a paid provider.
- REG-01 completion is relationship-validated and atomic.
- Mirror generation queues on the iPhone, executes only through PX13 loopback inference, and returns only grounded source-record citations.
- Mirror terminology remains exact: Mirror Core is deterministic and always local; Local AI Mirror is optional no-per-use-fee generation on user-owned compute; Cloud AI Mirror is optional future functionality and off the critical path.
- The authenticated Mirror policy route must attest `free-local`, paid cloud disabled, and recurring API cost zero before generation synchronization.
- Every generated claim, proposed question, and proposed action carries validated supplied source IDs before the worker renders exact citations.
- Generated reflections preserve provider/runtime identity, query, exact source IDs, citations, proposed question/action, user disposition, annotation, revision history, and deletion state without changing source records.
- Local tombstone/restore/permanent-purge controls and authenticated PX13 job/request deletion are separate boundaries; uncertain responses preserve local data, and retained Mirror lifecycle data survives export/import validation.
- The 64-hex pairing bearer is never browser-persisted; an expiring HttpOnly device session supports same-origin app close/relaunch and all authenticated API responses are non-cacheable.

## Component evidence collected during implementation

These scoped results were run against the component changes before final repository consolidation. They do not replace the final commands in the next section.

| Scope                                              | Result                                                                                          | Evidence boundary                                                                      |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Foundation/audio regression                        | PASS — 16 targeted tests                                                                        | exact content hashes/timing/progression; not natural-duration device playback          |
| Domain, IndexedDB, migration, export/import        | PASS — targeted suites                                                                          | fake IndexedDB and deterministic binaries; not migrated production-origin browser data |
| Voice recorder/persistence/acceptance/local client | PASS — targeted suites                                                                          | mocked MediaRecorder/network; not a physical ten-minute iPhone capture                 |
| REG-01 engine/repository/UI                        | PASS — targeted suites                                                                          | relationship and transaction behavior with test blobs                                  |
| Transcription gateway                              | PASS — 31 tests                                                                                 | mock/local transport; no real Whisper model inference                                  |
| Local Whisper companion                            | PASS — 44 tests, 99.17% statements; official `base` package hash/size, load, and real inference | exact offline spoken sentence transcribed through the QCTP companion; `small` held     |
| PX13 Mirror backend                                | PASS — 55 focused tests; 97.40% statements / 94.21% branches / 96.26% functions / 98.12% lines  | structured mock/Ollama contracts; no real local model inference                        |
| Offline Mirror Core and structured Journal         | PASS — 8 targeted tests, 97.67% statements / 87.87% branches / 98.11% functions / 99.34% lines  | deterministic local analysis and traceable journal records; not generative inference   |
| Codex authoring, evidence layers, and deletion     | PASS — 8 targeted tests                                                                         | user-operable workflows and selective deletion; no live remote artifact existed        |
| Local AI provider seam and generated lifecycle     | PASS — restore/purge/client/UI suites plus full consolidated coverage                           | claim provenance, policy/delete proofs, dispositions, revisions, purge, export         |
| Private device session and privacy boundary        | PASS — 119 focused security/lifecycle tests; dependency and secret scans clean                  | signed cookie/relaunch and deletion contracts; physical private-HTTPS path still held  |

## Final consolidated repository gates

| Gate                              | Command                                                                   | Result                                                                                          |
| --------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Correct branch / clean scope      | `git branch --show-current`; `git status --short`; `git diff --check`     | PASS — Rev2 branch only; diff check clean; final publication scope reviewed                     |
| Formatting                        | `npm run format:check`                                                    | PASS                                                                                            |
| Lint                              | `npm run lint`                                                            | PASS — zero warnings                                                                            |
| TypeScript                        | `npm run typecheck`                                                       | PASS                                                                                            |
| Node unit/integration             | `npm test`                                                                | PASS — 40 files / 227 tests                                                                     |
| Node coverage                     | `npm run test:coverage`                                                   | PASS — 88.68% statements / 79.23% branches / 93.42% functions / 90.32% lines                    |
| Production PWA build              | `npm run build`                                                           | PASS — installable `dist` artifact and generated service worker                                 |
| Browser tests                     | `npm run test:e2e`                                                        | PASS — 20 scheduled / 14 passed / 6 intentional project-gating skips / 0 failed                 |
| Dependency audit                  | `npm audit --audit-level=low`                                             | PASS — 0 vulnerabilities                                                                        |
| Local Whisper Python suite        | commands in `local-whisper-companion/README.md`                           | PASS — 44 tests / 99.17% coverage; Ruff, basedpyright, and ty pass                              |
| Secret/static scan                | controlled `rg` scan for credential patterns and paid-provider references | PASS — no committed credential; no frontend paid-provider endpoint or token persistence         |
| Non-production preview smoke test | integrated loopback server at `http://127.0.0.1:18787`                    | PASS — shell/manifest/service worker/CSP; 401 boundary; HttpOnly pair; both Free Local policies |

The preview was stopped after the smoke test. It was not deployed and did not contact Whisper, Ollama, OpenAI, or any paid provider.

## Local AI Mirror authority acceptance ledger

| Controlled criterion                                    | Current evidence                                                                                          | Release disposition                                                   |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Useful, traceable Mirror Core with no key/provider call | Deterministic analyzer, journal, source drawers, feedback, and browser tests                              | PASS automated; physical workflow still held                          |
| iPhone remains useful without PX13                      | Offline queues, local search/Core, prior results, playback, export, and PWA navigation are implemented    | PASS browser contract; physical iPhone held                           |
| Provider-independent seam and no-network mock           | `MirrorInferenceProvider`, `MockMirrorProvider`, and loopback Ollama adapter are implemented              | Contract evidence only; mock is never production-selected             |
| Real no-cost local model                                | Loopback path is implemented; no model auto-download occurs                                               | **HOLD — provision model/runtime and benchmark on Ryan's PX13**       |
| Exact source citations                                  | Structured claim/proposal source IDs are validated server-side; client revalidates markers/citations      | PASS contract; real representative workload held                      |
| Accept/revise/reject/annotate without source mutation   | UI/repository lifecycle and immutable-source assertions cover every disposition/revision action           | PASS automated; physical UI acceptance held                           |
| Queue survives closure/reconnect                        | IndexedDB snapshots, stable IDs, lost-response cleanup, and HttpOnly-session relaunch test exist          | PASS automated; physical reconnect held                               |
| No metered request in Free Local                        | Strict policy schema, loopback provider, no-network mock, paid-cloud-disabled baseline, and request audit | PASS automated                                                        |
| Cloud AI off by default                                 | No Cloud AI Mirror production adapter is enabled                                                          | PASS by architecture; any future adapter needs new controls/authority |
| Export/import and deletion                              | Retained lifecycle/feedback exports; remote-proof tombstone/restore and typed purge unlock sources safely | PASS automated; end-to-end physical deletion held                     |

## Browser coverage expected

Automated Playwright coverage targets:

- app bootstrap and navigation at iPhone portrait dimensions;
- no horizontal overflow and minimum primary tap-target sizing;
- installable PWA manifest/service-worker shell;
- Day 1 lesson/practice transition and exact sequencer regression without waiting 25 real minutes;
- completion prohibition in shortened test mode;
- voice capture persistence, pause/resume, append, cancel, reload, playback, offline queue, success/failure mocks, and layer separation;
- Mirror composition with source selection, offline queue persistence, visible job states, reconnect synchronization, citation links, retry, and no API-key error;
- generated-reflection accept/revise/reject/annotate controls, append-only revision display, tombstone/restore behavior, authenticated remote-job deletion failure safety, and lifecycle export/import;
- no network request to OpenAI or another metered provider in Free Local Mode.

The Windows Playwright WebKit harness aborts offline navigations before its service worker can
handle them. The iPhone-profile test therefore verifies service-worker activation/controller and
continued offline in-app navigation, while Chromium verifies an offline cold reload. Physical iOS
offline cold launch remains an explicit device hold rather than a fabricated pass.

## Manual/device holds

The following are intentionally not claimed by mocked or desktop automation:

1. Install and launch the private HTTPS PWA on the target iPhone.
2. Record, pause/resume, stop, reload, and replay at least one real ten-minute iPhone recording without truncation.
3. Exercise Quick Capture, field dictation, and a five-minute REG auto-dictation on the physical device.
4. Verify foreground/background, screen state, notification behavior, and later retrieval within iOS limitations.
5. The official `base` CTranslate2 directory is provisioned, hash-verified, load-verified, and passed an exact real offline transcription. Provision the `small` high-accuracy directory.
6. `qwen3:8b` is provisioned and passed QCTP's structured grounded-reflection contract on the PX13 in CPU-only mode: 107.1 seconds wall time, three grounded claims, six valid source references, and valid proposed-question/action output. `qwen3.5:9b` was rejected after no response within five minutes; `qwen3:14b` remains excluded after unsafe system behavior during the earlier benchmark attempt.
7. From the physical target iPhone over the intended private HTTPS path, pair once, close/reopen the installed PWA, exercise Mirror Core while PX13 is absent, queue and reconnect Local AI work, and inspect status, notification/later retrieval, citations, disposition/revision controls, deletion/restore/permanent purge, and export without manual PX13 UI or file transfer.
8. Run the first genuine Day 1 session for the full natural 1,500 seconds; confirm lesson-to-practice transition, final cue, completion at 0:00, and persistence.
9. Confirm continuity under the intended iPhone screen-up/background conditions; the existing Rev1 authority only records approximately three minutes of normal-mode iPhone playback.
10. Test Rev1 migration using preserved data on its actual browser origin, then compare current day, all completion flags, workbook answers, logs, settings, and test state.

## Security review points

- The PWA bundle contains no provider credential.
- `QCTP_API_TOKEN` must be a diverse 64-hex server pairing credential. Pairing is rate-limited before auth, the PWA never persists/retains the bearer, and the gateway issues a signed expiring `HttpOnly; SameSite=Strict; Path=/api` session (`Secure` remotely).
- The transcription client requires the server policy to attest `mode=free-local`, `paidCloudEnabled=false`, and hard spend limit zero.
- The local Whisper and Ollama endpoints reject non-loopback configuration and redirects.
- Mirror durable storage belongs under private OS application data, outside the repository and static assets.
- `GET /api/mirror/policy` and both job/request deletion routes, like every Mirror route, run behind authenticated device-session middleware and rate limiting; direct unauthenticated mounting is prohibited.
- The no-network `MockMirrorProvider` is a test seam and is never selected by the production runtime.
- Local generated-reflection deletion supports paired tombstone/restore and separately typed-confirmed permanent purge. Known and uncertain remote PX13 jobs are separately deleted and strict response proof is required before local state is discarded.
- All authenticated API responses use `Cache-Control: no-store`; remote gateway origins require HTTPS and model/transcription providers remain exact loopback.
- The iPhone-facing origin must be private HTTPS with gateway authentication; direct public exposure is prohibited.
- Optional OpenAI code is dormant unless every explicit paid-cloud server gate is configured. It is not part of the controlled baseline.

## Preview and release statement

Only a non-production preview is authorized. No test in this document changes `ZERO_RELEASE`, authorizes a merge to `main`, or authorizes deployment. The draft PR must carry all unresolved device, model-provisioning, migration-origin, and natural-duration holds.

Draft review location: https://github.com/rfrye08-pixel/QCTP/pull/2