// @vitest-environment node

import type { Express } from "express";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createTranscriptionApp } from "./app.js";
import {
  createBearerTokenAuthenticator,
  createDeviceSessionAuthentication,
} from "./auth.js";
import {
  ApiErrorResponseSchema,
  DeleteRemoteObjectResponseSchema,
  TranscriptionResponseSchema,
} from "./contracts.js";
import { ProviderError } from "./errors.js";
import { MockTranscriptionProvider } from "./providers/mock.js";
import type { TranscriptionProvider } from "./providers/types.js";
import { MemoryFixedWindowRateLimiter } from "./rate-limit.js";
import type { RemoteObjectStore } from "./remote-objects.js";

const token = "qctp-test-token-with-at-least-32-characters";
const fixedId = "00000000-0000-4000-8000-000000000001";

const apiErrorBody = (body: unknown) => ApiErrorResponseSchema.parse(body);
const transcriptionBody = (body: unknown) =>
  TranscriptionResponseSchema.parse(body);
const deletionBody = (body: unknown) =>
  DeleteRemoteObjectResponseSchema.parse(body);

const wav = (durationMs = 100): Buffer => {
  const sampleRate = 8_000;
  const channels = 1;
  const bitsPerSample = 16;
  const bytesPerSample = bitsPerSample / 8;
  const sampleCount = Math.max(
    1,
    Math.round((durationMs / 1_000) * sampleRate),
  );
  const dataSize = sampleCount * channels * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channels * bytesPerSample, 28);
  buffer.writeUInt16LE(channels * bytesPerSample, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataSize, 40);
  return buffer;
};

const makeApp = (
  provider: TranscriptionProvider = new MockTranscriptionProvider({
    text: "Preserved verbatim text.",
    language: "en",
  }),
  overrides: Partial<Parameters<typeof createTranscriptionApp>[0]> = {},
): Express =>
  createTranscriptionApp({
    authenticate: createBearerTokenAuthenticator(token),
    provider,
    now: () => new Date("2026-08-17T12:00:00.000Z"),
    createId: () => fixedId,
    ...overrides,
  });

const postAudio = (
  app: Express,
  options: {
    authorization?: string;
    idempotencyKey?: string;
    recordingId?: string;
    accuracy?: "default" | "high";
    mimeType?: string;
    audio?: Buffer;
  } = {},
) => {
  let test = request(app).post("/api/transcriptions");
  if (options.authorization !== undefined) {
    test = test.set("Authorization", options.authorization);
  }
  if (options.idempotencyKey !== undefined) {
    test = test.set("Idempotency-Key", options.idempotencyKey);
  }
  test = test.field("recordingId", options.recordingId ?? "recording-1");
  if (options.accuracy !== undefined) {
    test = test.field("accuracy", options.accuracy);
  }
  return test.attach("audio", options.audio ?? wav(), {
    filename: "capture.wav",
    contentType: options.mimeType ?? "audio/wav",
  });
};

describe("transcription HTTP boundary", () => {
  it("authenticates before parsing a multipart body", async () => {
    const provider = new MockTranscriptionProvider();
    const app = makeApp(provider, {
      limits: { maxAudioBytes: 1_024 },
    });

    const response = await postAudio(app, {
      idempotencyKey: "unauthorized-large-upload",
      audio: Buffer.alloc(8_192),
    });

    expect(response.status).toBe(401);
    expect(apiErrorBody(response.body as unknown).error.code).toBe(
      "AUTH_REQUIRED",
    );
    expect(response.headers["www-authenticate"]).toBe("Bearer");
    expect(provider.calls).toHaveLength(0);
  });

  it("rejects an invalid bearer token with a structured redacted error", async () => {
    const response = await postAudio(makeApp(), {
      authorization: "Bearer definitely-wrong",
      idempotencyKey: "bad-auth",
    });

    expect(response.status).toBe(401);
    const body = apiErrorBody(response.body as unknown);
    expect(body.error).toMatchObject({
      code: "AUTH_INVALID",
      retryable: false,
      requestId: fixedId,
    });
    expect(JSON.stringify(body)).not.toContain(token);
  });

  it("requires an idempotency key before multipart parsing", async () => {
    const provider = new MockTranscriptionProvider();
    const response = await postAudio(makeApp(provider), {
      authorization: `Bearer ${token}`,
    });

    expect(response.status).toBe(400);
    expect(apiErrorBody(response.body as unknown).error.code).toBe(
      "IDEMPOTENCY_KEY_REQUIRED",
    );
    expect(provider.calls).toHaveLength(0);
  });

  it("returns an immutable source transcript and maps default accuracy", async () => {
    const provider = new MockTranscriptionProvider({
      text: "Exact words from the recording.",
      language: "en",
      defaultModel: "local-base",
    });
    const response = await postAudio(makeApp(provider), {
      authorization: `Bearer ${token}`,
      idempotencyKey: "success-default",
    });

    expect(response.status).toBe(201);
    const body = transcriptionBody(response.body as unknown);
    expect(body).toEqual({
      recordingId: "recording-1",
      transcriptId: fixedId,
      status: "TRANSCRIBED",
      originalText: "Exact words from the recording.",
      provider: "mock",
      model: "local-base",
      language: "en",
      durationMs: 100,
      detectedMimeType: "audio/wav",
      acceptedAt: "2026-08-17T12:00:00.000Z",
    });
    expect(provider.calls[0]).toMatchObject({
      model: "local-base",
      filename: "recording-1.wav",
      mimeType: "audio/wav",
      durationMs: 100,
    });
    expect(response.headers["idempotency-replayed"]).toBe("false");
  });

  it("maps high accuracy through the selected provider", async () => {
    const provider = new MockTranscriptionProvider({
      highModel: "local-small",
    });
    const response = await postAudio(makeApp(provider), {
      authorization: `Bearer ${token}`,
      idempotencyKey: "success-high",
      accuracy: "high",
    });

    expect(response.status).toBe(201);
    expect(transcriptionBody(response.body as unknown).model).toBe(
      "local-small",
    );
    expect(provider.calls[0]?.model).toBe("local-small");
  });

  it("replays a successful idempotent request without calling the provider twice", async () => {
    const provider = new MockTranscriptionProvider();
    const app = makeApp(provider);
    const options = {
      authorization: `Bearer ${token}`,
      idempotencyKey: "repeat-safe",
    } as const;

    const first = await postAudio(app, options);
    const second = await postAudio(app, options);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.body).toEqual(first.body);
    expect(second.headers["idempotency-replayed"]).toBe("true");
    expect(provider.calls).toHaveLength(1);
  });

  it("does not cache failed attempts under an idempotency key", async () => {
    let calls = 0;
    const provider: TranscriptionProvider = {
      name: "flaky-test",
      modelForAccuracy: () => "test-model",
      transcribe: () => {
        calls += 1;
        if (calls === 1) {
          throw new ProviderError({ kind: "unavailable", retryable: true });
        }
        return Promise.resolve({ text: "Recovered transcript." });
      },
    };
    const app = makeApp(provider);
    const options = {
      authorization: `Bearer ${token}`,
      idempotencyKey: "retry-after-failure",
    } as const;

    const first = await postAudio(app, options);
    const second = await postAudio(app, options);

    expect(first.status).toBe(503);
    expect(apiErrorBody(first.body as unknown).error.retryable).toBe(true);
    expect(second.status).toBe(201);
    expect(calls).toBe(2);
  });

  it("rejects unsupported declared MIME types and signature mismatches", async () => {
    const app = makeApp();
    const unsupported = await postAudio(app, {
      authorization: `Bearer ${token}`,
      idempotencyKey: "unsupported-mime",
      mimeType: "text/plain",
    });
    const mismatch = await postAudio(app, {
      authorization: `Bearer ${token}`,
      idempotencyKey: "mismatch-mime",
      mimeType: "audio/mpeg",
    });

    expect(unsupported.status).toBe(415);
    expect(apiErrorBody(unsupported.body as unknown).error.code).toBe(
      "AUDIO_TYPE_UNSUPPORTED",
    );
    expect(mismatch.status).toBe(415);
    expect(apiErrorBody(mismatch.body as unknown).error.code).toBe(
      "AUDIO_SIGNATURE_MISMATCH",
    );
  });

  it("enforces byte limits before media probing", async () => {
    const response = await postAudio(
      makeApp(undefined, { limits: { maxAudioBytes: 1_024 } }),
      {
        authorization: `Bearer ${token}`,
        idempotencyKey: "oversize",
        audio: wav(1_000),
      },
    );

    expect(response.status).toBe(413);
    expect(apiErrorBody(response.body as unknown).error.code).toBe(
      "AUDIO_SIZE_LIMIT",
    );
  });

  it("enforces probed duration limits", async () => {
    const response = await postAudio(
      makeApp(undefined, { limits: { maxAudioDurationMs: 500 } }),
      {
        authorization: `Bearer ${token}`,
        idempotencyKey: "too-long",
        audio: wav(1_000),
      },
    );

    expect(response.status).toBe(413);
    const body = apiErrorBody(response.body as unknown);
    expect(body.error.code).toBe("AUDIO_DURATION_LIMIT");
    expect(body.error.details?.maxDurationMs).toBe(500);
  });

  it("rate limits by authenticated subject before parsing another upload", async () => {
    const app = makeApp(undefined, {
      rateLimiter: new MemoryFixedWindowRateLimiter({
        limit: 1,
        windowMs: 60_000,
        now: () => 0,
      }),
    });
    const first = await postAudio(app, {
      authorization: `Bearer ${token}`,
      idempotencyKey: "rate-first",
    });
    const second = await postAudio(app, {
      authorization: `Bearer ${token}`,
      idempotencyKey: "rate-second",
      audio: Buffer.alloc(1),
    });

    expect(first.status).toBe(201);
    expect(second.status).toBe(429);
    expect(second.headers["retry-after"]).toBe("60");
    expect(apiErrorBody(second.body as unknown).error).toMatchObject({
      code: "RATE_LIMITED",
      retryable: true,
    });
  });

  it("rate limits device pairing before bearer authentication", async () => {
    const deviceSession = createDeviceSessionAuthentication(token);
    const app = makeApp(undefined, {
      authenticate: deviceSession.authenticate,
      deviceSession,
      pairingRateLimiters: {
        client: new MemoryFixedWindowRateLimiter({
          limit: 1,
          windowMs: 60_000,
          now: () => 0,
        }),
        global: new MemoryFixedWindowRateLimiter({
          limit: 10,
          windowMs: 60_000,
          now: () => 0,
        }),
      },
    });

    await request(app)
      .post("/api/device-session")
      .set("Authorization", "Bearer definitely-wrong")
      .expect(401);
    const limited = await request(app)
      .post("/api/device-session")
      .set("Authorization", `Bearer ${token}`)
      .expect(429);

    expect(limited.headers["retry-after"]).toBe("60");
    expect(apiErrorBody(limited.body as unknown).error.code).toBe(
      "RATE_LIMITED",
    );
  });

  it("redacts provider causes and never invokes deletion after failure", async () => {
    const deleteForRecording = vi.fn<RemoteObjectStore["deleteForRecording"]>();
    const remoteObjectStore: RemoteObjectStore = { deleteForRecording };
    const provider: TranscriptionProvider = {
      name: "unsafe-upstream",
      modelForAccuracy: () => "test-model",
      transcribe: () =>
        Promise.reject(
          new ProviderError({
            kind: "unavailable",
            retryable: true,
            cause: new Error("OPENAI_API_KEY=should-never-appear"),
          }),
        ),
    };
    const response = await postAudio(makeApp(provider, { remoteObjectStore }), {
      authorization: `Bearer ${token}`,
      idempotencyKey: "provider-failure",
    });

    expect(response.status).toBe(503);
    const body = apiErrorBody(response.body as unknown);
    expect(body.error.code).toBe("PROVIDER_UNAVAILABLE");
    expect(body.error.retryable).toBe(true);
    expect(JSON.stringify(body)).not.toContain("should-never-appear");
    expect(deleteForRecording).not.toHaveBeenCalled();
  });
});

describe("remote object deletion and policy", () => {
  it("uses the injected remote object store and is idempotent when none exists", async () => {
    const deleteForRecording = vi
      .fn<RemoteObjectStore["deleteForRecording"]>()
      .mockResolvedValue("deleted");
    const configured = makeApp(undefined, {
      remoteObjectStore: { deleteForRecording },
    });

    const deleted = await request(configured)
      .delete("/api/transcriptions/recording-1")
      .set("Authorization", `Bearer ${token}`);
    const notConfigured = await request(makeApp())
      .delete("/api/transcriptions/recording-1")
      .set("Authorization", `Bearer ${token}`);

    expect(deleted.status).toBe(200);
    expect(deletionBody(deleted.body as unknown)).toEqual({
      recordingId: "recording-1",
      remoteObject: "deleted",
    });
    expect(deleteForRecording).toHaveBeenCalledWith(
      "recording-1",
      "qctp-single-user",
    );
    expect(deletionBody(notConfigured.body as unknown).remoteObject).toBe(
      "not_configured",
    );
  });

  it("returns a retryable redacted error when remote deletion fails", async () => {
    const app = makeApp(undefined, {
      remoteObjectStore: {
        deleteForRecording: () =>
          Promise.reject(new Error("private storage detail")),
      },
    });
    const response = await request(app)
      .delete("/api/transcriptions/recording-1")
      .set("Authorization", `Bearer ${token}`);

    expect(response.status).toBe(503);
    const body = apiErrorBody(response.body as unknown);
    expect(body.error).toMatchObject({
      code: "REMOTE_DELETE_FAILED",
      retryable: true,
    });
    expect(JSON.stringify(body)).not.toContain("private storage detail");
  });

  it("protects and exposes the configured transcription policy", async () => {
    const app = makeApp(undefined, {
      policy: {
        mode: "free-local",
        provider: "local-whisper",
        paidCloudEnabled: false,
        hardSpendLimitUsd: 0,
      },
    });

    const unauthorized = await request(app).get("/api/transcriptions/policy");
    const response = await request(app)
      .get("/api/transcriptions/policy")
      .set("Authorization", `Bearer ${token}`);

    expect(unauthorized.status).toBe(401);
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
    expect(response.headers.pragma).toBe("no-cache");
    expect(response.body).toEqual({
      mode: "free-local",
      provider: "local-whisper",
      paidCloudEnabled: false,
      hardSpendLimitUsd: 0,
    });
  });
});
