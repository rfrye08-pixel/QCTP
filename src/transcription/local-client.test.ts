import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createQctpRepository,
  deleteQctpDatabase,
  type QctpRepository,
} from "../data";
import {
  acceptVoiceCapture,
  RepositoryCapturePersistence,
} from "../voice-capture";

import {
  clearLocalGatewaySession,
  LocalTranscriptionClient,
  pairLocalGatewaySession,
} from "./local-client";

const accessToken = "local-device-session-token-1234567890";
const pairingToken = "0123456789abcdef".repeat(4);

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  return input instanceof URL ? input.href : input.url;
}

describe("Free Local Mode transcription client", () => {
  let databaseName: string;
  let repository: QctpRepository;

  beforeEach(async () => {
    databaseName = `local-transcription-${crypto.randomUUID()}`;
    repository = await createQctpRepository({ name: databaseName });
    const persistence = new RepositoryCapturePersistence(repository);
    await persistence.begin({
      recordingId: "local-recording",
      mimeType: "audio/webm",
      createdAt: "2026-08-17T12:00:00.000Z",
      append: false,
    });
    const audio = await new Response("audio", {
      headers: { "content-type": "audio/webm" },
    }).blob();
    await persistence.appendChunk("local-recording", 0, audio);
    await persistence.finalize("local-recording", 1_200, "audio/webm");
    await acceptVoiceCapture(repository, {
      recordingId: "local-recording",
      title: "No-cost transcript",
      destination: "codex",
      tags: [],
      durationMs: 1_200,
      mimeType: "audio/webm",
      manualText: "",
      fieldTargetId: null,
      queueLocalTranscription: true,
    });
  });

  afterEach(async () => {
    vi.useRealTimers();
    repository.close();
    await deleteQctpDatabase(databaseName);
  });

  it("rejects insecure or credential-bearing gateway URLs", () => {
    expect(
      () =>
        new LocalTranscriptionClient({
          accessToken,
          baseUrl: "http://192.168.1.20:8787",
        }),
    ).toThrow(/require HTTPS/);
    expect(
      () =>
        new LocalTranscriptionClient({
          accessToken,
          baseUrl: "https://user:password@private.example",
        }),
    ).toThrow(/require HTTPS/);
  });

  it("pairs once with a bearer, then restores and clears through an HttpOnly cookie session", async () => {
    const request = vi.fn(() =>
      Promise.resolve(new Response(null, { status: 204 })),
    );
    await pairLocalGatewaySession(pairingToken, "", request);
    await clearLocalGatewaySession("", request);

    expect(request.mock.calls[0]).toEqual([
      "/api/device-session",
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        redirect: "error",
        headers: { Authorization: `Bearer ${pairingToken}` },
      }),
    ]);
    expect(request.mock.calls[1]).toEqual([
      "/api/device-session",
      expect.objectContaining({
        method: "DELETE",
        credentials: "include",
        redirect: "error",
      }),
    ]);
  });

  it("uses a restored cookie session without retaining the pairing bearer", async () => {
    const request = vi.fn(() =>
      Promise.resolve(
        jsonResponse({
          mode: "free-local",
          provider: "local-whisper",
          paidCloudEnabled: false,
          hardSpendLimitUsd: 0,
        }),
      ),
    );
    const client = new LocalTranscriptionClient({ fetch: request });

    await expect(client.getPolicy()).resolves.toMatchObject({
      mode: "free-local",
    });
    expect(request).toHaveBeenCalledWith(
      "/api/transcriptions/policy",
      expect.objectContaining({
        credentials: "include",
        headers: {},
        redirect: "error",
      }),
    );
  });

  it("sends accepted local audio only after confirming a free-local policy", async () => {
    const request = vi.fn(
      (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        void init;
        const url = requestUrl(input);
        if (url.endsWith("/policy")) {
          return Promise.resolve(
            jsonResponse({
              mode: "free-local",
              provider: "local-whisper",
              paidCloudEnabled: false,
              hardSpendLimitUsd: 0,
            }),
          );
        }
        return Promise.resolve(
          jsonResponse(
            {
              recordingId: "local-recording",
              transcriptId: "15d564c2-0fa8-48a1-b96f-bf800a2be2db",
              status: "TRANSCRIBED",
              originalText: "A local transcript.",
              provider: "local-whisper",
              model: "base",
              language: "en",
              durationMs: 1_200,
              detectedMimeType: "audio/webm",
              acceptedAt: "2026-08-17T12:05:00.000Z",
            },
            201,
          ),
        );
      },
    );
    const client = new LocalTranscriptionClient({
      accessToken,
      fetch: request,
    });
    await expect(client.processQueue(repository)).resolves.toEqual({
      completed: ["local-recording"],
      failed: [],
    });
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[0]?.[1]).toMatchObject({ redirect: "error" });
    expect(request.mock.calls[1]?.[1]).toMatchObject({
      method: "POST",
      redirect: "error",
    });
    expect(
      await repository.getTranscriptForRecording("local-recording"),
    ).toMatchObject({
      originalText: "A local transcript.",
      correctedText: null,
      provider: "local-whisper",
    });
    expect(await repository.listTranscriptionQueue()).toEqual([]);
  });

  it("refuses a paid-cloud policy before uploading any audio", async () => {
    const request = vi.fn((): Promise<Response> =>
      Promise.resolve(
        jsonResponse({
          mode: "paid-cloud",
          provider: "openai",
          paidCloudEnabled: true,
          hardSpendLimitUsd: 1,
        }),
      ),
    );
    const client = new LocalTranscriptionClient({
      accessToken,
      fetch: request,
    });
    await expect(
      client.transcribeRecording(repository, "local-recording"),
    ).rejects.toMatchObject({
      code: "NON_LOCAL_POLICY",
      retryable: false,
    });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("reclaims a processing item left behind by an interrupted PWA session", async () => {
    const staleTimestamp = new Date(Date.now() - 31 * 60_000).toISOString();
    await repository.updateTranscriptionQueueItem(
      "local-recording",
      { status: "PROCESSING", attempts: 1 },
      staleTimestamp,
    );
    await repository.updateRecordingStatus(
      "local-recording",
      "TRANSCRIBING",
      {},
      staleTimestamp,
    );
    const request = vi.fn((input: RequestInfo | URL): Promise<Response> => {
      if (requestUrl(input).endsWith("/policy")) {
        return Promise.resolve(
          jsonResponse({
            mode: "free-local",
            provider: "local-whisper",
            paidCloudEnabled: false,
            hardSpendLimitUsd: 0,
          }),
        );
      }
      return Promise.resolve(
        jsonResponse(
          {
            recordingId: "local-recording",
            transcriptId: "15d564c2-0fa8-48a1-b96f-bf800a2be2db",
            status: "TRANSCRIBED",
            originalText: "Recovered after interruption.",
            provider: "local-whisper",
            model: "base",
            language: "en",
            durationMs: 1_200,
            detectedMimeType: "audio/webm",
            acceptedAt: "2026-08-17T12:00:00.000Z",
          },
          201,
        ),
      );
    });
    const client = new LocalTranscriptionClient({
      accessToken,
      fetch: request,
    });

    await expect(client.processQueue(repository)).resolves.toEqual({
      completed: ["local-recording"],
      failed: [],
    });
    expect(
      await repository.getTranscriptForRecording("local-recording"),
    ).toMatchObject({
      originalText: "Recovered after interruption.",
    });
  });

  it("deletes remote artifacts without following redirects", async () => {
    const request = vi.fn((): Promise<Response> =>
      Promise.resolve(
        jsonResponse({
          recordingId: "local-recording",
          remoteObject: "deleted",
        }),
      ),
    );
    const client = new LocalTranscriptionClient({
      accessToken,
      fetch: request,
    });

    await expect(client.deleteRemoteRecording("local-recording")).resolves.toBe(
      "deleted",
    );
    expect(request).toHaveBeenCalledWith(
      "/api/transcriptions/local-recording",
      expect.objectContaining({ method: "DELETE", redirect: "error" }),
    );
  });
});
