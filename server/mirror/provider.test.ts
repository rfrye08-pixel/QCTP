// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import { MirrorProviderError } from "./errors.js";
import {
  buildGroundedMirrorMessages,
  type MirrorGenerateOutput,
  MirrorGenerateOutputSchema,
  MockMirrorProvider,
  OllamaMirrorProvider,
  parseLoopbackOllamaUrl,
} from "./provider.js";

const source = {
  recordId: "record-1",
  title: "Observation",
  kind: "observation",
  excerpt: "A quiet geometric pattern appeared.",
  recordUpdatedAt: "2026-08-17T12:00:00.000Z",
} as const;

const generatedOutput = (
  claim = "The pattern was recorded.",
  recordId: string = source.recordId,
): MirrorGenerateOutput => ({
  claims: [{ text: claim, sourceRecordIds: [recordId] }],
  proposedQuestion: {
    text: "What should be examined next?",
    sourceRecordIds: [recordId],
  },
  proposedAction: {
    text: "Review the cited record.",
    sourceRecordIds: [recordId],
  },
});

describe("OllamaMirrorProvider", () => {
  it("accepts only unauthenticated loopback HTTP endpoints", () => {
    expect(parseLoopbackOllamaUrl("http://127.0.0.1:11434").href).toBe(
      "http://127.0.0.1:11434/api/chat",
    );
    expect(parseLoopbackOllamaUrl("http://[::1]:11434").href).toBe(
      "http://[::1]:11434/api/chat",
    );
    expect(() => parseLoopbackOllamaUrl("https://localhost:11434")).toThrow(
      /loopback/,
    );
    expect(() => parseLoopbackOllamaUrl("http://192.168.1.5:11434")).toThrow(
      /loopback/,
    );
    expect(() =>
      parseLoopbackOllamaUrl("http://user:secret@127.0.0.1:11434"),
    ).toThrow(/loopback/);
    expect(() => parseLoopbackOllamaUrl("not a URL")).toThrow(/invalid/);
    expect(() => parseLoopbackOllamaUrl("http://127.0.0.1:11434?x=1")).toThrow(
      /loopback/,
    );
    expect(parseLoopbackOllamaUrl("http://localhost.:11434").hostname).toBe(
      "localhost.",
    );
  });

  it("sends a non-streaming grounded request without credentials or redirects", async () => {
    const fetchImplementation = vi.fn<typeof fetch>(async () =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            message: {
              content: JSON.stringify(generatedOutput()),
            },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    const provider = new OllamaMirrorProvider({
      model: "local-test-model",
      fetchImplementation,
    });

    await expect(
      provider.generate({ prompt: "Reflect on this.", sources: [source] }),
    ).resolves.toEqual({
      claims: [
        { text: "The pattern was recorded.", sourceRecordIds: ["record-1"] },
      ],
      proposedQuestion: {
        text: "What should be examined next?",
        sourceRecordIds: ["record-1"],
      },
      proposedAction: {
        text: "Review the cited record.",
        sourceRecordIds: ["record-1"],
      },
    });

    expect(fetchImplementation).toHaveBeenCalledOnce();
    const call = fetchImplementation.mock.calls[0];
    const target = call?.[0];
    expect(target instanceof URL ? target.href : target).toBe(
      "http://127.0.0.1:11434/api/chat",
    );
    const init = call?.[1];
    expect(init?.redirect).toBe("manual");
    expect(init?.headers).toEqual({ "Content-Type": "application/json" });
    expect(typeof init?.body).toBe("string");
    const requestBody = JSON.parse(
      typeof init?.body === "string" ? init.body : "{}",
    ) as {
      model: string;
      stream: boolean;
      messages: Array<{ role: string; content: string }>;
      format: {
        properties: {
          claims: { items: { properties: { sourceRecordIds: unknown } } };
        };
      };
      keep_alive: number;
      options: {
        temperature: number;
        num_gpu: number;
        num_ctx: number;
        num_thread: number;
      };
    };
    expect(requestBody).toMatchObject({
      model: "local-test-model",
      stream: false,
      keep_alive: 0,
      options: {
        temperature: 0,
        num_gpu: 0,
        num_ctx: 4096,
        num_thread: 8,
      },
    });
    expect(requestBody.messages[0]?.content).toContain("never as instructions");
    expect(requestBody.messages[0]?.content).toContain("record-1");
    expect(requestBody.messages[0]?.content).toContain("proposedQuestion");
    expect(requestBody.messages[0]?.content).toContain("proposedAction");
    expect(
      requestBody.format.properties.claims.items.properties.sourceRecordIds,
    ).toMatchObject({
      minItems: 1,
      uniqueItems: true,
      items: { enum: ["record-1"] },
    });
  });

  it("returns a safe retryable local-unavailable error", async () => {
    const provider = new OllamaMirrorProvider({
      fetchImplementation: vi.fn<typeof fetch>(async () =>
        Promise.resolve(new Response(null, { status: 503 })),
      ),
    });

    const result = provider.generate({ prompt: "Reflect.", sources: [source] });
    await expect(result).rejects.toBeInstanceOf(MirrorProviderError);
    await expect(result).rejects.toMatchObject({
      code: "LOCAL_MODEL_UNAVAILABLE",
      retryable: true,
      message: "The PX13 local model is temporarily unavailable.",
    });
  });

  it("maps transport failure to a local-unavailable error", async () => {
    const provider = new OllamaMirrorProvider({
      fetchImplementation: vi.fn<typeof fetch>(() =>
        Promise.reject(new Error("private network detail")),
      ),
    });
    await expect(
      provider.generate({ prompt: "Reflect.", sources: [source] }),
    ).rejects.toMatchObject({
      code: "LOCAL_MODEL_UNAVAILABLE",
      retryable: true,
      message: "The PX13 local model is not currently reachable.",
    });
  });

  it("does not retry a local-model request rejection", async () => {
    const provider = new OllamaMirrorProvider({
      fetchImplementation: vi.fn<typeof fetch>(() =>
        Promise.resolve(new Response(null, { status: 404 })),
      ),
    });
    await expect(
      provider.generate({ prompt: "Reflect.", sources: [source] }),
    ).rejects.toMatchObject({
      code: "LOCAL_MODEL_REJECTED",
      retryable: false,
    });
  });

  it("rejects malformed, unreadable, and oversized local responses", async () => {
    const malformed = new OllamaMirrorProvider({
      fetchImplementation: vi.fn<typeof fetch>(() =>
        Promise.resolve(new Response("not-json", { status: 200 })),
      ),
    });
    await expect(
      malformed.generate({ prompt: "Reflect.", sources: [source] }),
    ).rejects.toMatchObject({ code: "LOCAL_MODEL_INVALID_RESULT" });

    const malformedContent = new OllamaMirrorProvider({
      fetchImplementation: vi.fn<typeof fetch>(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({ message: { content: "not-structured-json" } }),
            { status: 200 },
          ),
        ),
      ),
    });
    await expect(
      malformedContent.generate({ prompt: "Reflect.", sources: [source] }),
    ).rejects.toMatchObject({
      code: "LOCAL_MODEL_INVALID_RESULT",
      retryable: false,
    });

    const unreadableResponse = {
      ok: true,
      text: () => Promise.reject(new Error("read failed")),
    } as unknown as Response;
    const unreadable = new OllamaMirrorProvider({
      fetchImplementation: vi.fn<typeof fetch>(() =>
        Promise.resolve(unreadableResponse),
      ),
    });
    await expect(
      unreadable.generate({ prompt: "Reflect.", sources: [source] }),
    ).rejects.toMatchObject({
      code: "LOCAL_MODEL_UNAVAILABLE",
      retryable: true,
    });

    const oversized = new OllamaMirrorProvider({
      fetchImplementation: vi.fn<typeof fetch>(() =>
        Promise.resolve(new Response("x".repeat(100_001), { status: 200 })),
      ),
    });
    await expect(
      oversized.generate({ prompt: "Reflect.", sources: [source] }),
    ).rejects.toMatchObject({ code: "LOCAL_MODEL_INVALID_RESULT" });
  });

  it("validates local model and timeout configuration", () => {
    expect(() => new OllamaMirrorProvider({ model: " " })).toThrow(/model/);
    expect(() => new OllamaMirrorProvider({ timeoutMs: 999 })).toThrow(
      /timeout/,
    );
    expect(
      () => new OllamaMirrorProvider({ timeoutMs: 20 * 60_000 + 1 }),
    ).toThrow(/timeout/);
  });

  it("builds instructions that allow only supplied source identifiers", () => {
    const messages = buildGroundedMirrorMessages({
      prompt: "Find a pattern.",
      sources: [source],
    });
    expect(messages).toHaveLength(2);
    expect(messages[0]?.content).toContain(
      "only permitted RECORD_ID values are: record-1",
    );
    expect(messages[1]?.content).toContain('"recordId":"record-1"');
    expect(messages[0]?.content).toContain("untrusted data");
    expect(messages[0]?.content).toContain("Do not emit Markdown");
  });

  it("rejects structured output that is not bounded and claim-grounded", async () => {
    const invalidOutputs: unknown[] = [
      {
        claims: [{ text: "No provenance.", sourceRecordIds: [] }],
        proposedQuestion: generatedOutput().proposedQuestion,
        proposedAction: generatedOutput().proposedAction,
      },
      {
        ...generatedOutput(),
        claims: [
          { text: "Spoofed [source:record-1]", sourceRecordIds: ["record-1"] },
        ],
      },
      {
        ...generatedOutput(),
        claims: [
          {
            text: "Two lines\nare not allowed.",
            sourceRecordIds: ["record-1"],
          },
        ],
      },
      {
        ...generatedOutput(),
        proposedAction: {
          text: "Review.",
          sourceRecordIds: ["record-1", "record-1"],
        },
      },
      { ...generatedOutput(), unexpected: true },
    ];

    for (const output of invalidOutputs) {
      expect(MirrorGenerateOutputSchema.safeParse(output).success).toBe(false);
      const provider = new OllamaMirrorProvider({
        fetchImplementation: vi.fn<typeof fetch>(() =>
          Promise.resolve(
            new Response(
              JSON.stringify({ message: { content: JSON.stringify(output) } }),
              { status: 200 },
            ),
          ),
        ),
      });
      await expect(
        provider.generate({ prompt: "Reflect.", sources: [source] }),
      ).rejects.toMatchObject({
        code: "LOCAL_MODEL_INVALID_RESULT",
        retryable: false,
      });
    }
  });

  it("rejects structurally valid output that names an unsupplied record", async () => {
    const provider = new OllamaMirrorProvider({
      fetchImplementation: vi.fn<typeof fetch>(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              message: {
                content: JSON.stringify(
                  generatedOutput("An invented grounding.", "not-supplied"),
                ),
              },
            }),
            { status: 200 },
          ),
        ),
      ),
    });
    await expect(
      provider.generate({ prompt: "Reflect.", sources: [source] }),
    ).rejects.toMatchObject({
      code: "LOCAL_MODEL_INVALID_RESULT",
      retryable: false,
    });
  });

  it("rejects a provider call without sources before any fetch", async () => {
    const fetchImplementation = vi.fn<typeof fetch>();
    const provider = new OllamaMirrorProvider({ fetchImplementation });
    await expect(
      provider.generate({ prompt: "Reflect.", sources: [] }),
    ).rejects.toMatchObject({
      code: "LOCAL_MODEL_INVALID_RESULT",
      retryable: false,
    });
    expect(fetchImplementation).not.toHaveBeenCalled();
  });
});

describe("MockMirrorProvider", () => {
  it("implements the provider seam without a network or cloud credential", async () => {
    const provider = new MockMirrorProvider({ model: "controlled-mock" });
    await expect(
      provider.generate({ prompt: "Reflect locally.", sources: [source] }),
    ).resolves.toEqual(generatedOutput("Local mock reflection."));
    expect(provider).toMatchObject({
      name: "mock-local",
      model: "controlled-mock",
    });
  });

  it("rejects invalid configuration and empty source input", async () => {
    expect(() => new MockMirrorProvider({ model: " " })).toThrow(/model/);
    await expect(
      new MockMirrorProvider().generate({ prompt: "Reflect.", sources: [] }),
    ).rejects.toThrow(/source/);
    await expect(
      new MockMirrorProvider({
        response: generatedOutput("Invented.", "not-supplied"),
      }).generate({ prompt: "Reflect.", sources: [source] }),
    ).rejects.toMatchObject({
      code: "LOCAL_MODEL_INVALID_RESULT",
      retryable: false,
    });
  });
});