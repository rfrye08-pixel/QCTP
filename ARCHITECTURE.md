# QCTP Rev2 Architecture

**Status:** implementation-candidate architecture

**Branch:** `qctp-platform-rev2-codex`

**Release authority:** `ZERO_RELEASE`

## Design constraints

1. Free Local Mode is the default and complete baseline. A provider credential is neither required nor an error-recovery step.
2. The iPhone/PWA owns the complete user experience. PX13 services supply local compute; normal use never requires manual file transfer or model interaction on the PX13.
3. Browser-originated evidence is persisted before network processing. Raw audio and source records survive a stopped gateway, unavailable model, rejected request, or application restart.
4. Source layers are append-only or explicitly revised. Raw audio, verbatim transcript, correction, clean note, observation, interpretation, tags, and generated Mirror results are separate linked entities.
5. Day 1 is a protected content/timing fixture. Days 2–112 are reserved metadata only.
6. All iPhone-facing remote traffic uses a private authenticated HTTPS origin. Local inference endpoints remain loopback-only.

## Controlled three-layer Mirror model

| Layer               | Runtime and availability                                             | Controlled role                                                                                                                                                                                                              |
| ------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Mirror Core**     | PWA/IndexedDB; always available, including iPhone-only and offline   | Deterministic search, explicit counts and filters, trends, intention/action/outcome comparisons, record links, dismissal/correction/annotation foundations, and structured journaling. It makes no generative-model claim.   |
| **Local AI Mirror** | Optional PX13 local companion + replaceable local inference provider | Generates grounded reflections from user-selected source snapshots, with no per-request cloud fee. The iPhone/PWA owns composition, queueing, status, synchronization, review, citations, notification, and later retrieval. |
| **Cloud AI Mirror** | Optional future adapter; absent/disabled in the controlled candidate | May exist only behind explicit opt-in and metering controls. It cannot activate from an environment variable alone or replace either free layer.                                                                             |

Free Local Mode comprises Mirror Core plus the Local AI Mirror path when the user-owned PX13 is available. PX13 unavailability removes no iPhone capture, playback, search, Mirror Core, prior-result, export, or queue capability. The provider interface is deliberately runtime-independent: `MockMirrorProvider` supplies a deterministic no-network test seam, while `OllamaMirrorProvider` is the current loopback implementation. The mock is never selected by the production runtime, and the Ollama model alias is not release-validated until representative PX13 benchmarking is complete.

## Runtime topology

```text
┌──────────────────────── iPhone / installed PWA ────────────────────────┐
│ React UI                                                               │
│ MediaRecorder + playback                                               │
│ IndexedDB qctp-rev2                                                    │
│ transcription queue + Mirror request/result queue                      │
│ source selection, job status, citations, notifications, later retrieval│
└──────────────────────────────┬─────────────────────────────────────────┘
                               │ private HTTPS + signed device session
                               ▼
┌──────────────────────────── PX13 gateway ──────────────────────────────┐
│ same-origin PWA/API boundary on 127.0.0.1:8787                         │
│ authentication, validation, idempotency, rate controls                 │
│ transcription routes + durable Mirror job API/worker                   │
└───────────────────────┬───────────────────────────┬────────────────────┘
                        │ loopback HTTP             │ loopback HTTP
                        ▼                           ▼
              local Whisper companion     Ollama-compatible runtime
                   127.0.0.1:8788              127.0.0.1:11434
```

The gateway stays bound to loopback. For iPhone access, a private HTTPS reverse proxy such as Tailscale Serve forwards the single QCTP origin to the gateway. The proxy must not expose the Whisper or Ollama endpoints. A same-network TLS proxy with a device-trusted certificate is also valid when bound and firewalled to the private subnet. A private WireGuard/Tailscale path plus device ACLs is the remote-access architecture; public router forwarding and unauthenticated public tunnels are excluded.

## Code boundaries

| Boundary                  | Responsibility                                                               | Persistence/network rule                         |
| ------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------ |
| `src/app`                 | PWA shell, routes, mobile screens, runtime coordination                      | UI never contains provider secrets               |
| `src/domain`              | Zod schemas, provenance, evidence/interpretation separation                  | Every stored/imported entity is validated        |
| `src/data`                | IndexedDB schema, repository, atomic operations, search documents, migration | Blobs never enter localStorage                   |
| `src/foundation`          | controlled Day 1 content and 112-day reserved catalog                        | only Day 1 may be authored                       |
| `src/audio-player`        | deterministic elapsed-time sequencer                                         | natural completion alone earns morning credit    |
| `src/voice-capture`       | recorder state machine, MediaRecorder, chunk persistence, acceptance         | microphone starts only after explicit action     |
| `src/transcription`       | authenticated Free Local policy probe and retry queue                        | upload begins only after recording acceptance    |
| `src/reg`                 | REG-01-A workflow and completion gate                                        | one transaction creates completion outputs       |
| `src/mirror`              | iPhone-side request persistence, sync, retry, results, citations             | queued work is useful without PX13 availability  |
| `src/insights`            | deterministic offline analysis and structured Mirror Journal                 | local evidence-bound results need no inference   |
| `src/export-import`       | schema-validated JSON and integrity-checked ZIP                              | validation completes before import transaction   |
| `server`                  | single-user authentication, upload validation, provider abstraction          | Free Local route is default; paid route is gated |
| `server/mirror`           | durable jobs, worker leases/retries, grounded local generation               | Ollama URL must be exact loopback HTTP           |
| `local-whisper-companion` | local audio decode/inference adapter                                         | loopback-only and no model downloader            |

## Browser persistence

The IndexedDB database is `qctp-rev2`, database version 3. Its stores are:

- application state: `foundation`, `workbook`, `settings`, `paths`;
- Codex: `records`, `searchDocuments`, `revisions`;
- voice: `recordings`, `audioChunks`, `transcripts`, `derivedNotes`, `transcriptionQueue`;
- Studio: `regSessions`, `attachments`, `attachmentBlobs`;
- migration: `migrationLedger`;
- Mirror: `mirrorRequests`, `mirrorResults`, `mirrorInsightFeedback`.

Indexes support record kind/tag/time search, recording destination/status, recording-to-chunk and recording-to-transcript relations, attachment ownership, migration fingerprint idempotency, Mirror job status, and request/result synchronization.

Each generated Mirror result records provider type (`deterministic`, `local_model`, or `cloud_model`), provider and model/runtime identifiers, the submitted query, exact source-record IDs, claim-level citations, generated text, proposed question/action, disposition, annotation, append-only lifecycle revisions, and `deletedAt`. Requests and results are tombstoned/restored together in one IndexedDB transaction. Deleted reflections are hidden from normal reads, retained for audit/export, and cannot be reviewed until restored. A separately typed-confirmed purge permanently removes a request or paired request/result/revision lifecycle; deterministic feedback has parallel tombstone/restore/purge controls. Source deletion remains blocked while any live or tombstoned provenance relation exists and unlocks only after those relations are purged. None of these actions mutates a cited source.

Binary chunks are persisted as `Blob` values. JSON exports contain structured metadata; complete ZIP archives add audio and attachment binaries, paths constrained to dedicated archive directories, byte sizes, and SHA-256 checksums.

## Voice evidence flow

```text
explicit Start
  -> MediaRecorder chunks written to IndexedDB
  -> Stop / review / local playback / append / re-record / discard
  -> explicit Accept + destination
  -> VoiceRecording marked accepted
  -> Codex/source record created
  -> local transcription queue item created when selected
  -> authenticated gateway attests mode=free-local and paidCloudEnabled=false
  -> PX13 Whisper companion
  -> immutable original transcript
  -> optional correction history
  -> optional clean note / interpretation / accepted tags
```

Pausing because the document is hidden and user pause are explicit recorder states. Cancel/discard removes the unaccepted capture. A transcription error updates queue/status metadata but never deletes the recording. The browser client rejects a gateway that does not attest Free Local Mode.

The server authentication and rate limiter run before multipart audio parsing. It validates the idempotency key, request fields, declared MIME type, detected file signature, bytes, and probed duration before invoking a provider. Provider errors are converted to redacted structured responses.

## Mirror flow

1. The PWA selects one or more existing Codex records and snapshots their IDs, titles, kinds, excerpts, and update timestamps.
2. It writes the request to `mirrorRequests` before trying the network. If PX13 is offline, status remains `QUEUED_LOCAL`.
3. Before submission, the authenticated client probes `GET /api/mirror/policy` and accepts only the strict Free Local attestation: `mode=free-local`, `paidCloudEnabled=false`, and `recurringApiCostUsd=0`. Authentication and rate limiting run before every Mirror route.
4. When the private gateway is available, a stable request ID provides idempotent submission. The durable PX13 job store moves work through `queued`, `processing`, `retry_wait`, `complete`, or `failed`.
5. The worker invokes the `MirrorInferenceProvider` seam. The production runtime uses loopback-only `OllamaMirrorProvider`; deterministic tests use `MockMirrorProvider` without network or paid calls. Only the prompt and user-selected source snapshots reach the provider.
6. The provider returns bounded structured claims plus one structured proposed question and action, each with nonempty source IDs. The worker independently rejects missing or unknown IDs, then deterministically renders exact `[source:RECORD_ID]` markers for every claim and proposal. Citation titles/excerpts are copied from submitted snapshots rather than model-authored.
7. The PWA polls while paired, synchronizes after reconnect and when visible, stores the generated result in `mirrorResults`, extracts one proposed question and action, displays linked source-record citations, and may issue a local completion notification when permission is granted.
8. User review moves the disposition among `unreviewed`, `accepted`, `revised`, and `rejected`; annotation and each transition append a revision containing the then-current text/proposals/annotation. Raw sources remain unchanged.
9. Deletion is two-boundary: authenticated `DELETE /api/mirror/jobs/:jobId` removes a known durable PX13 payload, and `DELETE /api/mirror/jobs/by-request/:requestId` cleans an uncertain submission whose create response was lost. Only a definitely never-submitted local request bypasses remote verification. Local deletion atomically tombstones the request/result and appends a deletion revision; restore appends a restoration revision; a separate exact typed confirmation permanently purges the derived lifecycle. Failed, generic-proxy, or otherwise unverifiable remote deletion preserves local data.
10. If PX13 or the model is unavailable, Mirror Core and prior results remain usable. Pending generation stays queued and later retrieval requires no manual export.

The PX13 JSON job file contains prompts and source excerpts so jobs survive a restart. Its default location is the private OS application-data QCTP directory, not the repository or PWA-served files. Writes use a same-directory temporary file and atomic rename. One gateway process owns the file; a transactional shared store would be required before multiple workers are allowed. JSON and ZIP export/import include Mirror requests, generated results, dispositions, annotations, revisions, and tombstones, and validate request/result/source/citation/deletion relationships before import begins.

## Foundation regression boundary

The independent Day 1 regression fixture records controlled source blob IDs and canonical hashes for the lesson, cue array, and audio references. The implementation fixes:

- duration at exactly 1,500 seconds;
- the 21 controlled cue timestamps;
- the Chill Brian lesson and cue URLs;
- guided, light, and minimal cue selection;
- true elapsed-time sequencing with pause/resume and no duration extension for spoken cues;
- a 90-second test mode that cannot write natural completion credit;
- completion-based progression.

The Foundation catalog generates 112 metadata entries across 16 controlled module labels, but only Day 1 has content. Code must not add titles, lessons, prompts, practices, or cues to reserved days without new curriculum authority.

## REG-01 atomic completion

REG-01 is complete only when all nine steps are checked, raw observation exists, an accepted auto-dictation recording and raw text exist, recording duration reaches five minutes, at least one local audio chunk belongs to that session, a geometry drawing/photo attachment exists, an integration action exists, and the precept is complete. Interpretation is optional and remains separate.

The repository validates all relationships, then one IndexedDB transaction marks the session complete, writes the Studio/Codex/Mirror records, and advances the source path. A failed gate or transaction does not partially advance the path.

## Migration and schema evolution

Startup initializes missing defaults and then attempts the idempotent Rev1 `qctp-state` migration. A 64-bit FNV-1a fingerprint identifies the exact source. The ledger preserves the original JSON, imported entity IDs, warnings, timestamp, and source schema. The source localStorage entry is never deleted. Details and recovery rules are in `MIGRATION.md`.

IndexedDB version 2 adds `mirrorRequests` and `mirrorResults` without rebuilding version-1 stores. Version 3 adds `mirrorInsightFeedback` for deterministic insight acceptance, correction, dismissal, annotation, and revision history without mutating source records. Domain/export schema versions are independent from the IndexedDB version so future migrations can be explicit.

## Configuration and secret boundary

`QCTP_API_TOKEN` is a random single-user pairing credential: exactly 32 random bytes encoded as 64 hexadecimal characters with a server-side diversity check. It is not an OpenAI key. Pairing is client/global rate-limited before authentication and exchanges the bearer for a signed, seven-day `HttpOnly; SameSite=Strict; Path=/api` cookie (`Secure` on non-loopback hosts). The PWA does not retain the bearer; same-origin relaunch reattests through the cookie. Disconnect clears it when reachable and records a non-secret local auto-restore opt-out. Rotating `QCTP_API_TOKEN` invalidates all outstanding signatures. API responses use `Cache-Control: no-store`. A remote gateway base URL must be HTTPS; exact loopback HTTP is accepted only for local development.

Free Local defaults:

- `QCTP_TRANSCRIPTION_PROVIDER=local`
- `QCTP_LOCAL_WHISPER_URL=http://127.0.0.1:8788/v1/audio/transcriptions`
- `QCTP_MIRROR_OLLAMA_URL=http://127.0.0.1:11434`
- `QCTP_MIRROR_MODEL=qwen2.5:7b`
- `QCTP_MIRROR_JOB_STORE_PATH=<private OS application-data>/QCTP/mirror-jobs.json`

The optional OpenAI adapter is constructed only when all of these server-side gates are satisfied: provider `openai`, explicit paid-cloud flag, positive hard spend limit, and server-only `OPENAI_API_KEY`. The application-side reservation limit does not replace a provider billing cap. This adapter is not selected in the controlled baseline.

That OpenAI adapter is transcription-only; it is not a Cloud AI Mirror implementation. The controlled Mirror gateway always reports zero recurring API cost through its authenticated `/api/mirror/policy` route. Durable PX13 Mirror payloads are removed only through the authenticated job-ID or stable request-ID deletion routes.

## Failure semantics

- No network: browser recording, records, Foundation, Studio/Lab/Codex, existing Mirror results, export, and queue creation continue.
- Whisper/model absent: work stays local or retryable; the UI does not request API credits.
- Device session valid after relaunch: the PWA reattests Free Local Mode and resumes transcription/Mirror synchronization without retaining or re-entering the pairing bearer.
- Authentication lost or explicitly disconnected: queued work remains intact and pairing is required again; no API-key error is shown.
- Duplicate submission: stable request/idempotency keys return the prior job or transcription result.
- Invalid import: no import transaction begins.
- Model citation failure: Mirror job retries or fails safely; an ungrounded result is not stored as complete.
- Browser notification unavailable: job status and later retrieval remain the authoritative completion route.

## Explicitly outside this release

- production deployment or GitHub Pages source changes;
- release or merge authority;
- authored Foundation content for Days 2–112;
- automatic model downloads;
- public exposure of local inference;
- paid cloud on the normal path;
- multi-user identity, shared-worker scaling, or cloud object storage;
- claims of physical iPhone, ten-minute microphone, full natural-duration Day 1, or real-model inference acceptance until those tests are performed.

Local AI Mirror therefore remains specifically held for: local PX13 model/runtime provisioning, a representative grounded workload benchmark on Ryan's actual PX13 (including usable latency/resource behavior and citation validity), and physical-iPhone acceptance over the intended private HTTPS same-network/remote path. Mock-provider tests are contract evidence, not a substitute for these holds.
