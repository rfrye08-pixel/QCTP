// @vitest-environment node

import { APIError } from "openai";
import { describe, expect, it, vi } from "vitest";

import { ProviderError } from "../errors.js";
import {
  MemoryPaidCloudSpendLimit,
  SpendLimitExceededError,
} from "../spend-limit.js";
import {
  LocalWhisperProvider,
  LoopbackWhisperHttpTransport,
  parseLoopbackHttpUrl,
  type LocalWhisperTransport,
} from "./local-whisper.js";
import {
  OpenAITranscriptionProvider,
  type CreateOpenAITranscription,
} from "./openai.js";
import type { TranscriptionInput } from "./types.js";

const input = (
  overrides: Partial<TranscriptionInput> = {},
): TranscriptionInput => ({
  audio: Buffer.from("RIFFfake-audio"),
  filename: "recording.wav",
  mimeType: "audio/wav",
  durationMs: 60_000,
  model: "gpt-4o-mini-transcribe",
  ...overrides,
});

describe("OpenAI transcription adapter", () => {
  it("maps only the allowlisted default and high-accuracy models", () => {
    const provider = new OpenAITranscriptionProvider({
      createTranscription: vi.fn(),
    });

    expect(provider.modelForAccuracy("default")).toBe("gpt-4o-mini-transcribe");
    expect(provider.modelForAccuracy("high")).toBe("gpt-4o-transcribe");
  });

  it("calls the official transcription shape with a server-created file", async () => {
    const createTranscription = vi
      .fn<CreateOpenAITranscription>()
      .mockResolvedValue({ text: "Verbatim provider result." });
    const provider = new OpenAITranscriptionProvider({ createTranscription });

    const result = await provider.transcribe(
      input({ language: "en", prompt: "QCTP vocabulary" }),
    );

    expect(result).toEqual({ text: "Verbatim provider result." });
    expect(createTranscription).toHaveBeenCalledTimes(1);
    const params = createTranscription.mock.calls[0]?.[0];
    expect(params).toMatchObject({
      model: "gpt-4o-mini-transcribe",
      response_format: "json",
      language: "en",
      prompt: "QCTP vocabulary",
    });
    expect(params?.file).toBeInstanceOf(File);
    expect((params?.file as File).name).toBe("recording.wav");
    expect((params?.file as File).type).toBe("audio/wav");
  });

  it("maps provider rate limits without leaking the provider message", async () => {
    const upstream = APIError.generate(
      429,
      { error: { message: "sensitive upstream content" } },
      "sensitive upstream content",
      new Headers({ "x-request-id": "provider-request-1" }),
    );
    const provider = new OpenAITranscriptionProvider({
      createTranscription: () => Promise.reject(upstream),
    });

    const thrown = await provider
      .transcribe(input())
      .catch((error: unknown) => error);

    expect(thrown).toBeInstanceOf(ProviderError);
    expect(thrown).toMatchObject({
      kind: "rate_limited",
      retryable: true,
      providerStatus: 429,
    });
    expect((thrown as Error).message).not.toContain("sensitive");
  });

  it("enforces the paid-cloud reservation before an API call", async () => {
    const createTranscription = vi.fn().mockResolvedValue({ text: "never" });
    const spendLimit = new MemoryPaidCloudSpendLimit(0.005);
    const provider = new OpenAITranscriptionProvider({
      createTranscription,
      spendLimit,
      maximumUsdPerAudioMinute: 0.1,
    });

    const thrown = await provider
      .transcribe(input())
      .catch((error: unknown) => error);

    expect(thrown).toMatchObject({
      kind: "budget_exceeded",
      retryable: false,
    });
    expect(createTranscription).not.toHaveBeenCalled();
  });

  it("requires a spend guard before constructing a live paid adapter", () => {
    expect(
      () =>
        new OpenAITranscriptionProvider({
          apiKey: "test-openai-key-that-is-not-real",
        }),
    ).toThrow(/spend limit/i);
  });
});

describe("free local Whisper provider", () => {
  it("accepts only loopback HTTP endpoints", () => {
    expect(
      parseLoopbackHttpUrl("http://127.0.0.1:8788/v1/audio/transcriptions")
        .hostname,
    ).toBe("127.0.0.1");
    expect(() =>
      parseLoopbackHttpUrl("https://127.0.0.1:8788/v1/audio/transcriptions"),
    ).toThrow(/loopback/i);
    expect(() =>
      parseLoopbackHttpUrl("http://192.168.1.20:8788/v1/audio/transcriptions"),
    ).toThrow(/loopback/i);
    expect(() =>
      parseLoopbackHttpUrl("http://user:pass@localhost:8788/transcribe"),
    ).toThrow(/loopback/i);
  });

  it("posts audio only to the validated local companion", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({ text: "Local transcript.", language: "en" }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
            "x-request-id": "local-request-1",
          },
        },
      ),
    );
    const transport = new LoopbackWhisperHttpTransport({
      endpoint: "http://127.0.0.1:8788/v1/audio/transcriptions",
      fetch: fetchMock,
      timeoutMs: 5_000,
    });

    const result = await transport.transcribe(
      input({ model: "base", language: "en" }),
    );

    expect(result).toEqual({
      text: "Local transcript.",
      language: "en",
      providerRequestId: "local-request-1",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBeInstanceOf(URL);
    expect((url as URL).href).toBe(
      "http://127.0.0.1:8788/v1/audio/transcriptions",
    );
    expect(init?.method).toBe("POST");
    expect(init?.redirect).toBe("error");
    const form = init?.body as FormData;
    expect(form.get("model")).toBe("base");
    expect(form.get("language")).toBe("en");
    expect(form.get("file")).toBeInstanceOf(File);
  });

  it("maps local companion outages as retryable provider errors", async () => {
    const transport = new LoopbackWhisperHttpTransport({
      endpoint: "http://127.0.0.1:8788/v1/audio/transcriptions",
      fetch: vi
        .fn<typeof fetch>()
        .mockResolvedValue(
          new Response("private local error", { status: 503 }),
        ),
    });

    const thrown = await transport
      .transcribe(input())
      .catch((error: unknown) => error);

    expect(thrown).toMatchObject({
      kind: "unavailable",
      retryable: true,
      providerStatus: 503,
    });
    expect((thrown as Error).message).not.toContain("private local error");
  });

  it("maps provider quality to configurable no-cost local models", async () => {
    const transport: LocalWhisperTransport = {
      transcribe: vi.fn().mockResolvedValue({ text: "Local result." }),
    };
    const provider = new LocalWhisperProvider({
      transport,
      defaultModel: "tiny.en",
      highAccuracyModel: "medium.en",
    });

    expect(provider.modelForAccuracy("default")).toBe("tiny.en");
    expect(provider.modelForAccuracy("high")).toBe("medium.en");
    await expect(
      provider.transcribe(input({ model: "tiny.en" })),
    ).resolves.toEqual({ text: "Local result." });
  });
});

describe("hard spend limit", () => {
  it("tracks reservations, commits, releases, and refuses excess", () => {
    const spendLimit = new MemoryPaidCloudSpendLimit(1);
    const first = spendLimit.reserve(0.6);
    expect(spendLimit.snapshot()).toMatchObject({
      committedUsd: 0,
      reservedUsd: 0.6,
      remainingUsd: 0.4,
    });
    expect(() => spendLimit.reserve(0.5)).toThrow(SpendLimitExceededError);
    first.release();
    const second = spendLimit.reserve(0.5);
    second.commit();
    second.commit();

    expect(spendLimit.snapshot()).toEqual({
      hardLimitUsd: 1,
      committedUsd: 0.5,
      reservedUsd: 0,
      remainingUsd: 0.5,
    });
  });
});
