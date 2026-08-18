# QCTP transcription server

This package is the authenticated boundary between the local-first QCTP client
and a replaceable transcription provider. Free Local Mode is the default. It
sends accepted audio only to a Whisper-compatible companion bound to an exact
loopback IP. The browser never receives a provider credential.

## HTTP contract

`POST /api/device-session` exchanges a pre-auth rate-limited 64-hex pairing bearer for a signed, expiring `HttpOnly; SameSite=Strict` cookie. `Secure` is added for non-loopback hosts. The same authenticated session then protects transcription and Mirror routes; the browser does not need to retain the bearer.

`POST /api/transcriptions` requires:

- an authenticated QCTP device session (or the bearer for non-browser tooling);
- a unique `Idempotency-Key` header;
- multipart `audio` and `recordingId` fields;
- optional `accuracy=default|high`, ISO-639-1 `language`, and bounded `prompt`.

The `201` response preserves the provider's verbatim text in `originalText` and
records provider/model provenance. Errors use the redacted shape
`{ error: { code, message, retryable, requestId, details? } }`.

`DELETE /api/transcriptions/:recordingId` calls the injected remote-object
store. With no remote store configured it returns `not_configured`; it never
claims to delete the client's IndexedDB source audio.

`GET /api/transcriptions/policy` is authenticated and reports whether the
active route is free-local, paid-cloud, or test-mock.

Authentication and rate limiting execute before Multer reads multipart bytes. Pairing attempts are client/global rate-limited before bearer verification, and every `/api/` response uses `Cache-Control: no-store`.
MIME declaration, file signature, byte size, and probed duration must all pass
before a provider receives audio.

## Local companion contract

The default companion endpoint is
`http://127.0.0.1:8788/v1/audio/transcriptions`. The server sends multipart
`file`, `model`, and `response_format=json`, plus optional `language` and
`prompt`. A successful companion returns `{ "text": "...", "language":
"en" }`; additional fields are ignored. Redirects and non-loopback endpoint
configuration are rejected so Free Local Mode cannot silently send audio to a
LAN or cloud host.

## Environment

`QCTP_API_TOKEN` is required and must be exactly 32 random bytes encoded as 64 hexadecimal characters; low-diversity values are rejected. Generate it with the PowerShell command in the root README. Do not commit its value. Rotating it invalidates every signed browser session.

Free Local Mode defaults:

- `QCTP_TRANSCRIPTION_PROVIDER=local`
- `QCTP_LOCAL_WHISPER_URL=http://127.0.0.1:8788/v1/audio/transcriptions`
- `QCTP_LOCAL_WHISPER_MODEL=base`
- `QCTP_LOCAL_WHISPER_HIGH_ACCURACY_MODEL=small`

The optional OpenAI route is disabled unless every gate is present:

- `QCTP_TRANSCRIPTION_PROVIDER=openai`
- `QCTP_ENABLE_PAID_CLOUD=true`
- positive `QCTP_PAID_CLOUD_HARD_SPEND_LIMIT_USD`
- server-only `OPENAI_API_KEY`

`QCTP_PAID_CLOUD_MAX_USD_PER_AUDIO_MINUTE` defaults to a conservative local
reservation estimate of `0.1`. Successful requests commit their full reserved
amount. This is an application-side stop, not a substitute for a provider
account billing cap; the authenticated policy response makes that warning
visible together with committed, reserved, and remaining application budget.

Optional upload controls are `QCTP_TRANSCRIPTION_MAX_BYTES`,
`QCTP_TRANSCRIPTION_MAX_DURATION_MS`, `QCTP_TRANSCRIPTION_RATE_LIMIT`, and
`QCTP_TRANSCRIPTION_RATE_WINDOW_MS`.

Run locally with `npm run server`. Tests never need a provider key or a live
transcription service.
