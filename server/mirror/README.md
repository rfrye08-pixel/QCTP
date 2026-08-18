# QCTP Local AI Mirror server package

This package is the no-recurring-cost inference boundary for the QCTP iPhone/PWA Mirror. The phone submits and retrieves Mirror work through authenticated HTTP; inference remains on the PX13 through a loopback-only Ollama-compatible service. There is no cloud provider, API-key branch, paid fallback, redirect following, or automatic model download in this package.

The controlled product has three distinct layers. **Mirror Core** is deterministic and stays inside the PWA; it does not call this package. **Local AI Mirror** uses this package as its optional no-per-use-fee generative boundary while the iPhone remains the complete client. **Cloud AI Mirror** is optional future functionality and is neither implemented nor enabled here. This package must not be used to relabel deterministic Core output as model-generated or to put a cloud provider on the normal path.

## Mount and authentication contract

The parent Express application **must authenticate before this router** and mount it at `/api/mirror`. The router deliberately does not invent a second identity system.

```ts
const store = new JsonFileMirrorJobStore(mirrorJobFile);
const provider = new OllamaMirrorProvider({
  baseUrl: "http://127.0.0.1:11434",
  model: configuredLocalModel,
});
const service = new MirrorJobService({ store, model: provider.model });
const worker = new MirrorWorker({ store, provider });

app.use(
  "/api/mirror",
  createAuthenticationMiddleware(authenticate),
  createMirrorRouter({ service, worker }),
);
worker.start();
```

Call `worker.stop()` during graceful shutdown. The existing QCTP authentication middleware is expected to reject unauthenticated requests before they reach this router. The configured app pairs a 64-hex bearer into an expiring HttpOnly device session and applies rate limiting plus `no-store` response headers. The parent must also enforce the intended same-origin/private-HTTPS boundary. Do not put pairing credentials or session values in URLs.

The configured application mounts authentication and rate limiting before the complete router, including policy and deletion. Mounting only the job-creation route behind authentication is not conformant.

## HTTP contract

All timestamps are ISO-8601 UTC strings. Client `requestId` values are durable idempotency keys. Reusing a request ID with identical content returns the existing job; reusing it with different content returns `409 REQUEST_ID_CONFLICT`.

### Attest the Free Local policy

`GET /api/mirror/policy`

This authenticated route returns a strict policy document:

```json
{
  "mode": "free-local",
  "provider": "ollama-local",
  "model": "configured-local-model",
  "paidCloudEnabled": false,
  "recurringApiCostUsd": 0
}
```

The PWA must validate this attestation before synchronizing generative work. A missing, unauthenticated, invalid, or paid policy is not permission to fall back to a cloud key; requests remain on the phone.

### Create or replay a job

`POST /api/mirror/jobs`

```json
{
  "requestId": "phone-generated-stable-id",
  "prompt": "What pattern is present across these records?",
  "sources": [
    {
      "recordId": "codex-record-id",
      "title": "Morning observation",
      "kind": "observation",
      "excerpt": "The source excerpt selected on the phone.",
      "recordUpdatedAt": "2026-08-17T12:00:00.000Z"
    }
  ]
}
```

A new job returns `202`; an idempotent replay returns `200`. Both return the same normalized job shape:

```ts
type MirrorJob = {
  id: string;
  requestId: string;
  status: "queued" | "processing" | "retry_wait" | "complete" | "failed";
  createdAt: string;
  updatedAt: string;
  attempts: number;
  lastError: string | null;
  result: null | {
    text: string;
    model: string;
    citations: Array<{ recordId: string; title: string; excerpt: string }>;
    createdAt: string;
  };
};
```

### Retrieve and synchronize

- `GET /api/mirror/jobs/:jobId` returns one job.
- `GET /api/mirror/jobs?requestIds=id-1,id-2` returns `{ "jobs": MirrorJob[] }` in requested-ID order. Up to 50 IDs are accepted.
- `POST /api/mirror/jobs/:jobId/retry` returns `202` with a re-queued failed or retry-wait job.

### Delete a durable PX13 job

`DELETE /api/mirror/jobs/:jobId`

`DELETE /api/mirror/jobs/by-request/:requestId`

The authenticated job-ID route removes a known durable job. The stable request-ID route removes an uncertain submission when PX13 created the job but the create response never reached the PWA. Both return `204` after deletion or structured `404 JOB_NOT_FOUND` when no matching job remains. The iPhone accepts only a QCTP response proof: 204 needs a valid gateway request ID; 404 additionally needs exact JSON content type/shape and matching body/header request IDs. Generic proxy responses, authentication/connection failures, and server failures are not success; local data is preserved.

This server deletion is deliberately separate from the PWA's local lifecycle. Local deletion atomically tombstones the linked `mirrorRequests` and `mirrorResults` entities and appends a `deleted` revision; restoration appends a `restored` revision. A separately typed-confirmed permanent purge removes the retained derived lifecycle. Cited source records remain deletion-protected until every live or tombstoned provenance relation is purged.

Errors are safe and structured:

```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "The Mirror request is invalid.",
    "retryable": false,
    "requestId": "server-request-id",
    "field": "prompt"
  }
}
```

An unavailable PX13 or stopped local model is a normal deferred-processing condition. It produces `retry_wait` and eventually `failed`; it never produces an API-key prompt. The iPhone retains its local request and can synchronize later by `requestId`.

## Worker and durability

`MirrorWorker.trigger()` starts a non-overlapping drain of currently eligible jobs. `start(pollIntervalMs)` also polls for delayed retries and work recovered after restart. `runOnce()` and `waitForIdle()` support deterministic integration and shutdown tests.

`JsonFileMirrorJobStore` validates every read, serializes in-process mutations, writes a same-directory temporary file, flushes it, atomically renames it, and restricts the resulting file to the current OS user where supported. An expired processing lease is reclaimed on the next poll. Run only one server process against a job file; use an injected transactional store if multiple workers are ever required.

The job file contains the submitted prompt and source excerpts because processing must survive restarts. Keep it in the private QCTP application-data directory, include it in encrypted local backups, and never place it in the repository or a web-served directory. No request prompt, excerpt, or model response is logged by this package.

## Grounding behavior

The local prompt marks source text as untrusted and requests bounded structured JSON: one or more reflection claims plus exactly one proposed question and one proposed action, each carrying nonempty `sourceRecordIds`. The worker independently validates every identifier against the submitted records, then deterministically renders exact `[source:RECORD_ID]` markers for every claim and proposal. Invalid, oversized, missing, spoofed, or unsupplied provenance never reaches `complete`. Citation titles and excerpts in the API result are copied from submitted records, never authored by the model.

## Provider seam and release qualification

`MirrorInferenceProvider` is independent of the inference runtime and exposes `name`, `model`, and structured `generate({ prompt, sources })`. `OllamaMirrorProvider` is the current production-runtime adapter and accepts only unauthenticated exact-loopback HTTP. `MockMirrorProvider` is a deterministic no-network seam for contract tests and controlled offline demonstrations; it is never selected by the production runtime. Provider tests therefore prove orchestration and grounding contracts without proving the quality or performance of a real model.

The configured `qwen3:8b` alias is the verified PX13 release candidate. It passed QCTP's structured grounded-reflection contract in CPU-only mode with valid source IDs and useful proposed question/action output. Local AI Mirror remains under `ZERO_RELEASE` until physical-iPhone acceptance over the intended private HTTPS path.

## Generated-reflection lifecycle ownership

The PX13 job response carries generated text, model identity, timestamp, and grounded citations. On synchronization, the PWA persists a separate derived Mirror result with provider type (`local_model` here), provider/runtime identifier, submitted query, exact source-record IDs, extracted proposed question/action, initial `unreviewed` disposition, annotation, revision history, and deletion state.

User actions transition the local disposition through `accepted`, `revised`, or `rejected`; annotation does not silently change the current disposition. Every accept/revise/reject/annotate/delete/restore event appends a revision containing the then-current generated or user-revised text, proposals, annotation, disposition, and timestamp. Permanent purge is a separate typed-confirmed destructive action and removes the paired request/result/revision entities only after remote cleanup is verified. These derived artifacts never overwrite observations, recordings, transcript layers, Codex source records, or user conclusions.

QCTP JSON/ZIP export includes retained Mirror requests/results and deterministic feedback—including provider metadata, exact source IDs, citations, dispositions, annotations, revisions, and tombstones. Permanently purged entities are absent by definition. Import validates unique lifecycle revision IDs, request/result ownership, source existence, query/source preservation, citation membership, and paired deletion state before its IndexedDB transaction begins.

## Same-network and private remote access

Ollama stays bound to loopback on the PX13. The QCTP application server may listen on a private LAN or Tailscale address so the iPhone can operate the full Mirror client.

For same-network use:

1. Put the QCTP server behind an HTTPS reverse proxy with a device-trusted certificate; microphone capture, service workers, and installable PWA behavior require a secure context.
2. Bind only to the intended private interface and firewall the port to the private subnet.
3. Require QCTP authentication on every Mirror route and restrict CORS to the installed PWA origin.

For remote use, prefer a private WireGuard/Tailscale network with device ACLs and Tailscale HTTPS or an equivalent mutually authenticated private tunnel. The reverse proxy may forward to the QCTP server, but it must never forward directly to Ollama. Do not expose Ollama or an unauthenticated QCTP port to the public internet. Do not use a public wildcard tunnel.

The phone/PWA owns offline request persistence, foreground/background synchronization, job-status UI, local notifications where the platform permits them, later retrieval, generated-reflection review, and deletion/export controls. This server contract supports those behaviors without manual file export or PX13 UI operation. Physical target-iPhone validation remains an explicit release hold.

## Exports

`server/mirror/index.ts` exports the schemas and types, `MirrorJobService`, `MirrorWorker`, the `MirrorInferenceProvider` seam, `MockMirrorProvider`, `OllamaMirrorProvider`, `InMemoryMirrorJobStore`, `JsonFileMirrorJobStore`, `createGroundedMirrorResult`, and `createMirrorRouter`.