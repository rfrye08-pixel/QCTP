# QCTP Platform Rev2

QCTP is a mobile-first, local-first Quantum Consciousness Training Platform. This branch replaces the Rev1 global-script prototype with typed React/TypeScript modules, IndexedDB persistence, explicit migrations, authenticated local processing boundaries, and automated tests.

**Release status:** non-production Rev2 implementation candidate on `qctp-platform-rev2-codex`. Release authority is `ZERO_RELEASE`. Do not merge, deploy, or change the GitHub Pages source without a separate controlled release decision.

## Controlled scope

- The released Foundation Day 1 content remains the protected baseline: Chill Brian narration, a 1,500-second practice, and cue timestamps `0, 45, 105, 180, 240, 330, 420, 480, 600, 720, 780, 840, 930, 1020, 1110, 1200, 1290, 1360, 1380, 1440, 1490`.
- Days 2–112 contain only reserved metadata. They are not authored or inferred.
- REG-01-A implements the original QCTP “Learn to See” Studio session with nine controlled steps, observation/interpretation separation, accepted five-minute voice auto-dictation, a drawing/photo attachment, integration action, precept review, and atomic path/Codex/Mirror record creation.
- Quick Capture, field dictation, experiment capture, and 5/10/20-minute auto-dictation preserve raw audio locally before any processing route is used.
- Raw audio, verbatim transcript, corrected transcript, clean note, interpretation, and tags remain distinct linked layers.
- Lab, Codex, Paths, Mirror, Insights, Studio, Today, Practice, and Settings use one versioned local data foundation.

The controlling requirements are in the dated `QCTP_*.md` and manifest files in this repository. `QCTP_ZERO_RECURRING_COST_RUNTIME_REQUIREMENT_REV0_2026-08-17.md` supersedes the earlier preferred paid transcription route, and `QCTP_LOCAL_AI_MIRROR_REQUIREMENT_REV0_2026-08-17.md` controls the Mirror layers and generated-reflection lifecycle: **Free Local Mode is the default release baseline**.

`QCTP_CURRENT_STATE.json` remains an unmodified upstream controlled snapshot and therefore still describes the pre-implementation handoff. For this branch, `QCTP_REV2_CODEX_BRANCH_STATE.json` is the implementation/verification ledger and explicitly supersedes that stale snapshot without rewriting historical authority.

## Free Local Mode

Normal QCTP use requires no OpenAI API key, cloud-AI account, paid transcription service, token charge, or subscription. Recording, playback, local persistence, manual text, Foundation practice, REG-01, Lab/Codex records, deterministic search, Mirror request composition, export, and import remain available when the PX13 processing services are stopped.

Accepted audio and generative Mirror requests queue in IndexedDB when the PX13 is unavailable. They synchronize later after the PWA can reach the authenticated PX13 gateway. An unavailable model is reported as local/queued/unavailable—not as a missing API-key failure.

The optional OpenAI transcription adapter is disabled by default and is outside the Free Local critical path. Enabling it requires an explicit server-side provider selection, explicit paid-cloud opt-in, a positive application spend limit, and a server-only credential. Do not enable it for the controlled baseline.

## The three Mirror layers

QCTP uses three controlled terms. They are not interchangeable:

1. **Mirror Core** is deterministic, runs in the PWA against local records, and is always available without PX13 or a model. It supplies local search, explicit tag/theme/symbol/person/date counts, structured intention/action/outcome comparisons, time trends, links to underlying records, and the structured Mirror Journal. It is not described as model-generated AI.
2. **Local AI Mirror** is optional generative inference on the user-owned PX13. The iPhone/PWA remains the complete client: it selects sources, queues requests offline, displays status, synchronizes grounded results, manages review, and retrieves them later. It creates no per-use API bill.
3. **Cloud AI Mirror** is an optional future adapter only. No Cloud AI Mirror adapter is enabled or required in this candidate. Any later adapter must remain off by default, explicitly opt-in and potentially metered, and unable to replace Mirror Core or Local AI Mirror.

Every generated Local AI Mirror reflection preserves its query, claim-level source-record IDs and citations, provider type, provider/runtime/model identity, text, proposed question, proposed action, disposition (`unreviewed`, `accepted`, `revised`, or `rejected`), annotation, revision history, and deletion state. Accepting, revising, rejecting, annotating, deleting, restoring, or permanently purging a reflection never mutates its source records. Local deletion first tombstones the linked request and result and appends a deletion/restoration revision. A separate exact typed confirmation permanently purges the derived lifecycle; export/import includes every entity still retained and validates its relationships.

## Requirements

- Node.js 22.12 or newer and npm
- A Chromium/WebKit browser with MediaRecorder for voice-capture testing
- Python 3.11, 3.12, or 3.13 plus `uv` only when running local Whisper transcription
- A locally installed Ollama-compatible runtime only when running generative Mirror inference
- HTTPS on the iPhone-facing private origin; microphone capture, service workers, and PWA installation require a secure browser context

No model is downloaded by QCTP. Model acquisition and verification are deliberate one-time PX13 provisioning steps.

## Install and verify

```powershell
npm ci
npm run check
npm run test:e2e
```

`npm run check` runs format checking, lint, TypeScript, coverage, and the production build. Browser binaries may need a one-time controlled Playwright installation before `npm run test:e2e` can run:

```powershell
npx playwright install chromium
```

See `REV2_VERIFICATION.md` for the evidence actually collected for this branch. Automated browser coverage is not a substitute for an iPhone microphone, installation, backgrounding, and full natural-duration Day 1 acceptance pass.

## Run the local development stack

Generate a fresh single-user gateway pairing token in the current PowerShell session. It must be exactly 32 random bytes encoded as 64 hexadecimal characters. It is not a cloud-provider key:

```powershell
$env:QCTP_API_TOKEN = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32)).ToLowerInvariant()
$env:QCTP_TRANSCRIPTION_PROVIDER = "local"
npm run server
```

In another terminal:

```powershell
npm run dev
```

Open the Vite URL on the PX13. In Settings, leave the gateway URL blank for the development proxy, enter the same pairing token, and connect. The gateway exchanges it for a signed, expiring `HttpOnly; SameSite=Strict` device session. The PWA does not retain the pairing token in React state, IndexedDB, or localStorage; reopening the same-origin PWA reattests and resumes through the cookie session. Disconnect clears the cookie when the gateway is reachable and always disables automatic reuse in that browser. Rotating `QCTP_API_TOKEN` invalidates all signed sessions.

For the integrated non-production preview, build first and then run the same gateway command:

```powershell
npm run build
npm run server
```

The gateway serves `dist` and `/api` from one loopback origin at `http://127.0.0.1:8787`. A private HTTPS proxy should forward this single origin for iPhone testing.

The backend defaults to loopback-only dependencies:

- Whisper companion: `http://127.0.0.1:8788`
- Ollama-compatible Mirror runtime: `http://127.0.0.1:11434`
- QCTP gateway: `http://127.0.0.1:8787`

The PWA does not need either inference service to launch or preserve work.

## Provision no-cost PX13 transcription

From `local-whisper-companion`:

```powershell
uv sync --extra dev
uv run qctp-local-whisper
```

The companion refuses non-loopback binding and never downloads a model. Provision verified CTranslate2 model directories once at:

```text
%LOCALAPPDATA%\QCTP\whisper-models\base
%LOCALAPPDATA%\QCTP\whisper-models\small
```

`base` is the normal route; `small` is the local high-accuracy route. Until those directories exist, transcription returns `model_unavailable`; raw recording, playback, manual text, export, and retry queueing continue to work. See `local-whisper-companion/README.md` for its isolated quality gates.

## Provision no-cost PX13 Mirror inference

Install and provision an Ollama-compatible model once on the PX13, then keep its HTTP service on exact loopback. `qwen3:8b` is the verified PX13 release candidate: it passed QCTP's structured grounded-reflection contract in CPU-only mode with valid claim citations and proposed question/action output. QCTP does not pull it automatically. Start the QCTP gateway after the local model runtime is ready. Mirror prompts and selected source snapshots are processed by the PX13 worker and durable results synchronize back to the iPhone. Physical-iPhone acceptance remains required before release.

The iPhone/PWA is the complete Mirror client: it composes grounded requests, selects source records, persists offline jobs, displays queued/processing/retry/complete state, retries, synchronizes results and citations, and requests local completion notifications where the browser permits them. Normal use requires no file export and no model operation from the PX13 UI.

All Mirror gateway routes are behind the same authenticated device-session boundary and rate limiter. Pairing itself is rate-limited before bearer verification. The client first requires `GET /api/mirror/policy` to attest `mode=free-local`, `paidCloudEnabled=false`, and `recurringApiCostUsd=0`. `DELETE /api/mirror/jobs/:jobId` removes a known private PX13 job; `DELETE /api/mirror/jobs/by-request/:requestId` closes the lost-create-response race. The PWA preserves local state unless remote deletion or exact QCTP absence is cryptographically authenticated and structurally verified. Local deletion supports tombstone, restore, and a separate typed-confirmed permanent purge. Never expose these routes without the authenticated gateway boundary.

## Use the full PWA from iPhone

Keep Whisper and Ollama on PX13 loopback. Expose only the same-origin QCTP PWA/API through a private HTTPS reverse proxy:

```text
iPhone PWA
   -> private HTTPS origin + device access control
      -> QCTP PWA/API on PX13 loopback
         -> Whisper companion on 127.0.0.1:8788
         -> Ollama-compatible runtime on 127.0.0.1:11434
```

For same-network use, the HTTPS proxy must bind only to the intended private interface, use a certificate trusted by the iPhone, firewall access to the private subnet, and forward `/api` only to the authenticated QCTP gateway. For private remote use, prefer Tailscale/WireGuard device networking plus private HTTPS and device ACLs. Tailscale Serve or an equivalent private reverse proxy may terminate HTTPS and forward to the loopback QCTP service.

Do not:

- expose the Whisper or Ollama ports to the LAN or internet;
- forward an unauthenticated QCTP port from the router;
- put the pairing token or signed session value in a URL, source file, PWA bundle, or proxy log;
- use a public wildcard tunnel for private records;
- weaken HTTPS for iPhone microphone access.

On the iPhone, open the private HTTPS PWA origin, install it, leave the gateway origin blank for the controlled same-origin topology, enter the 64-hex QCTP pairing token, and connect once. The signed HttpOnly session survives an app close without browser-storing that token. When the PX13 is offline, Mirror Core structured records remain usable and generative requests stay queued for automatic later synchronization.

## Data, migration, and recovery

Rev2 stores structured state and binary blobs in IndexedDB database `qctp-rev2` (current database version 3). On first startup it reads the Rev1 `localStorage` key `qctp-state`, validates and maps supported fields, writes a fingerprinted migration ledger entry with the exact source snapshot, and leaves the Rev1 source untouched. Re-running the same migration is idempotent. Version 2 adds durable Mirror requests/results; version 3 adds separately reviewable deterministic-insight feedback.

Use Settings to create:

- JSON: validated structured metadata;
- ZIP: validated metadata plus raw audio chunks and attachment blobs with SHA-256 integrity data.

Imports validate schemas, relationships, archive paths, sizes, checksums, and binary ownership before the IndexedDB transaction begins. The default UI import mode merges rather than resets local data. See `MIGRATION.md` before any destructive recovery work.

## Development map

- `src/app` — mobile PWA shell, routes, screens, and runtime context
- `src/domain` — versioned Zod entities and evidence/source separation
- `src/data` — IndexedDB schema, repository, atomic operations, and Rev1 migration
- `src/foundation` and `src/audio-player` — protected Day 1 content and deterministic sequencer
- `src/voice-capture` and `src/transcription` — browser recording, local persistence, explicit acceptance, and queue client
- `src/reg` — REG-01 session engine and completion gates
- `src/mirror` — iPhone-side offline queue, PX13 client, status/result synchronization, and citations
- `src/insights` — deterministic offline Mirror Core analysis and structured Mirror Journal workflows
- `server` — authenticated QCTP gateway and replaceable transcription adapters
- `server/mirror` — durable PX13 Mirror jobs, local worker, and loopback-only model adapter
- `local-whisper-companion` — isolated Python local transcription service
- `src/export-import` — JSON and integrity-checked ZIP portability
- `tests/e2e` — responsive/offline/browser acceptance coverage

Read `ARCHITECTURE.md` for boundaries and trust flows.

## Preview and release control

`npm run build` creates a non-production artifact in `dist`; `npm run server` serves the integrated PWA/API preview from loopback. `npm run preview` is a UI-only Vite helper and does not supply the authenticated APIs. None of these commands authorize deployment. The Rev1.1.4 `main` runtime remains recoverable and unchanged. This branch must stay in a draft PR until its documented holds are resolved and an independent authority explicitly changes `ZERO_RELEASE`.

The local model/runtime, representative grounded PX13 benchmark, private Tailscale HTTPS origin, and first physical-iPhone cited request/result round trip are verified. Release authority remains held until the rest of the physical-iPhone protocol covers real microphone duration/background behavior, offline/reconnect, notifications, review, deletion/restore/purge, and export. Mock-provider and desktop-browser results do not satisfy those remaining hardware checks.