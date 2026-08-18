// @vitest-environment node

import { describe, expect, it } from "vitest";

import type { CreateMirrorJobRequest, MirrorJobRecord } from "./contracts.js";
import { MirrorProviderError } from "./errors.js";
import type {
  MirrorGenerateInput,
  MirrorGenerateOutput,
  MirrorInferenceProvider,
} from "./provider.js";
import { MirrorJobService } from "./service.js";
import { InMemoryMirrorJobStore } from "./store.js";
import { createGroundedMirrorResult, MirrorWorker } from "./worker.js";

const request: CreateMirrorJobRequest = {
  requestId: "phone-request-1",
  prompt: "What pattern is present?",
  sources: [
    {
      recordId: "observation-1",
      title: "Day 1 observation",
      kind: "observation",
      excerpt: "A spiral appeared after the practice.",
      recordUpdatedAt: "2026-08-17T12:00:00.000Z",
    },
  ],
};

const completeReflection = (text: string): string =>
  `${text} [source:observation-1]\n` +
  "Proposed question: What should be examined next? [source:observation-1]\n" +
  "Proposed action: Review the cited observation. [source:observation-1]";

const generatedReflection = (
  text: string,
  recordId = "observation-1",
): MirrorGenerateOutput => ({
  claims: [{ text, sourceRecordIds: [recordId] }],
  proposedQuestion: {
    text: "What should be examined next?",
    sourceRecordIds: [recordId],
  },
  proposedAction: {
    text: "Review the cited observation.",
    sourceRecordIds: [recordId],
  },
});

class StubProvider implements MirrorInferenceProvider {
  readonly name = "test-local";
  readonly model = "test-local-model";
  #responses: Array<MirrorGenerateOutput | MirrorProviderError>;

  constructor(...responses: Array<MirrorGenerateOutput | MirrorProviderError>) {
    this.#responses = [...responses];
  }

  generate(input: MirrorGenerateInput): Promise<MirrorGenerateOutput> {
    void input;
    const response = this.#responses.shift();
    if (response instanceof MirrorProviderError) {
      return Promise.reject(response);
    }
    return Promise.resolve(response ?? generatedReflection("Grounded."));
  }
}

const createService = (store: InMemoryMirrorJobStore) =>
  new MirrorJobService({
    store,
    model: "test-local-model",
    now: () => new Date("2026-08-17T13:00:00.000Z"),
    createId: () => "mirror-job-1",
  });

describe("MirrorJobService and MirrorWorker", () => {
  it("validates service and worker configuration", () => {
    const store = new InMemoryMirrorJobStore();
    expect(() => new MirrorJobService({ store, model: " " })).toThrow(/model/);
    expect(
      () =>
        new MirrorWorker({
          store,
          provider: new StubProvider(),
          maxAttempts: 0,
        }),
    ).toThrow(/maxAttempts/);
    expect(
      () =>
        new MirrorWorker({
          store,
          provider: new StubProvider(),
          leaseMs: 999,
        }),
    ).toThrow(/leaseMs/);
  });

  it("submits idempotently and rejects request-id payload conflicts", async () => {
    const store = new InMemoryMirrorJobStore();
    const service = createService(store);

    const first = await service.submit(request);
    const replay = await service.submit(request);
    expect(first).toMatchObject({ created: true, job: { id: "mirror-job-1" } });
    expect(replay).toEqual({ created: false, job: first.job });

    await expect(
      service.submit({ ...request, prompt: "A different request." }),
    ).rejects.toMatchObject({
      code: "REQUEST_ID_CONFLICT",
      status: 409,
    });
  });

  it("completes a job and maps citations only from submitted records", async () => {
    const store = new InMemoryMirrorJobStore();
    const service = createService(store);
    await service.submit(request);
    const worker = new MirrorWorker({
      store,
      provider: new StubProvider(generatedReflection("A spiral was observed.")),
      now: () => new Date("2026-08-17T13:01:00.000Z"),
    });

    await expect(worker.runOnce()).resolves.toBe(true);
    const completed = await service.get("mirror-job-1");
    expect(completed).toEqual({
      id: "mirror-job-1",
      requestId: "phone-request-1",
      status: "complete",
      createdAt: "2026-08-17T13:00:00.000Z",
      updatedAt: "2026-08-17T13:01:00.000Z",
      attempts: 1,
      lastError: null,
      result: {
        text: completeReflection("A spiral was observed."),
        model: "test-local-model",
        citations: [
          {
            recordId: "observation-1",
            title: "Day 1 observation",
            excerpt: "A spiral appeared after the practice.",
          },
        ],
        createdAt: "2026-08-17T13:01:00.000Z",
      },
    });
  });

  it("never publishes an invented source identifier", () => {
    expect(() =>
      createGroundedMirrorResult({
        generated: generatedReflection("Unsupported.", "not-supplied"),
        model: "test-local-model",
        sources: request.sources,
        createdAt: "2026-08-17T13:01:00.000Z",
      }),
    ).toThrow(/ungrounded source reference/);
    expect(() =>
      createGroundedMirrorResult({
        generated: {
          ...generatedReflection("No citation was returned."),
          claims: [{ text: "No citation was returned.", sourceRecordIds: [] }],
        },
        model: "test-local-model",
        sources: request.sources,
        createdAt: "2026-08-17T13:01:00.000Z",
      }),
    ).toThrow(/invalid structured reflection/);
  });

  it("renders exact markers and deduplicates citations in first-seen order", () => {
    const secondSource = {
      recordId: "observation-2",
      title: "Day 2 observation",
      kind: "observation",
      excerpt: "A second record supported the comparison.",
      recordUpdatedAt: "2026-08-17T12:30:00.000Z",
    };
    const result = createGroundedMirrorResult({
      generated: {
        claims: [
          {
            text: "Both records support the comparison.",
            sourceRecordIds: ["observation-2", "observation-1"],
          },
          {
            text: "The first record also supports the pattern.",
            sourceRecordIds: ["observation-1"],
          },
        ],
        proposedQuestion: {
          text: "What should be examined next?",
          sourceRecordIds: ["observation-2"],
        },
        proposedAction: {
          text: "Review both cited records.",
          sourceRecordIds: ["observation-1", "observation-2"],
        },
      },
      model: "test-local-model",
      sources: [...request.sources, secondSource],
      createdAt: "2026-08-17T13:01:00.000Z",
    });
    expect(result.text).toBe(
      "Both records support the comparison. [source:observation-2] [source:observation-1]\n" +
        "The first record also supports the pattern. [source:observation-1]\n" +
        "Proposed question: What should be examined next? [source:observation-2]\n" +
        "Proposed action: Review both cited records. [source:observation-1] [source:observation-2]",
    );
    expect(result.citations.map(({ recordId }) => recordId)).toEqual([
      "observation-2",
      "observation-1",
    ]);
  });

  it("requires claim-level provenance and one structured grounded proposal of each kind", () => {
    const invalidOutputs: unknown[] = [
      {
        claims: [],
        proposedQuestion: generatedReflection("x").proposedQuestion,
        proposedAction: generatedReflection("x").proposedAction,
      },
      {
        ...generatedReflection("A claim."),
        proposedQuestion: null,
      },
      {
        ...generatedReflection("A claim."),
        proposedAction: {
          text: "Review it.",
          sourceRecordIds: ["not-supplied"],
        },
      },
      {
        ...generatedReflection("A claim."),
        claims: [
          {
            text: "Injected [source:observation-1].",
            sourceRecordIds: ["observation-1"],
          },
        ],
      },
    ];
    for (const generated of invalidOutputs) {
      expect(() =>
        createGroundedMirrorResult({
          generated: generated as MirrorGenerateOutput,
          model: "test-local-model",
          sources: request.sources,
          createdAt: "2026-08-17T13:01:00.000Z",
        }),
      ).toThrow(/invalid structured reflection|ungrounded source reference/);
    }
  });

  it("fails closed without publishing a result when a provider violates the structured contract", async () => {
    const store = new InMemoryMirrorJobStore();
    const service = createService(store);
    await service.submit(request);
    const invalid = {
      ...generatedReflection("An invalid claim."),
      proposedQuestion: {
        text: "What should be examined?",
        sourceRecordIds: ["not-supplied"],
      },
    };
    const worker = new MirrorWorker({
      store,
      provider: new StubProvider(invalid),
      now: () => new Date("2026-08-17T13:01:00.000Z"),
    });

    await expect(worker.runOnce()).resolves.toBe(true);
    await expect(service.get("mirror-job-1")).resolves.toMatchObject({
      status: "failed",
      attempts: 1,
      result: null,
      lastError: "The local model returned an ungrounded source reference.",
    });
  });

  it("uses retry_wait without exposing an API-key failure when PX13 is offline", async () => {
    const store = new InMemoryMirrorJobStore();
    const service = createService(store);
    await service.submit(request);
    const providerError = new MirrorProviderError({
      code: "LOCAL_MODEL_UNAVAILABLE",
      message: "The PX13 local model is not currently reachable.",
      retryable: true,
    });
    const worker = new MirrorWorker({
      store,
      provider: new StubProvider(providerError),
      now: () => new Date("2026-08-17T13:01:00.000Z"),
    });

    await worker.runOnce();
    const waiting = await service.get("mirror-job-1");
    expect(waiting.status).toBe("retry_wait");
    expect(waiting.lastError).toBe(
      "The PX13 local model is not currently reachable.",
    );
    expect(waiting.lastError).not.toMatch(/api.?key/i);
  });

  it("recovers an expired processing lease after a restart", async () => {
    const processing: MirrorJobRecord = {
      id: "stale-job",
      requestId: "stale-request",
      status: "processing",
      createdAt: "2026-08-17T12:00:00.000Z",
      updatedAt: "2026-08-17T12:01:00.000Z",
      attempts: 1,
      lastError: null,
      result: null,
      prompt: request.prompt,
      sources: request.sources,
      requestFingerprint: "a".repeat(64),
      nextAttemptAt: null,
      leaseExpiresAt: "2026-08-17T12:05:00.000Z",
    };
    const store = new InMemoryMirrorJobStore([processing]);
    const worker = new MirrorWorker({
      store,
      provider: new StubProvider(generatedReflection("Recovered.")),
      now: () => new Date("2026-08-17T13:00:00.000Z"),
    });

    await worker.runOnce();
    const recovered = await store.get("stale-job");
    expect(recovered).toMatchObject({ status: "complete", attempts: 2 });
  });

  it("stops automatic retries at the configured attempt limit", async () => {
    const store = new InMemoryMirrorJobStore();
    const service = createService(store);
    await service.submit(request);
    const failures = Array.from(
      { length: 3 },
      () =>
        new MirrorProviderError({
          code: "LOCAL_MODEL_UNAVAILABLE",
          message: "The PX13 local model is not currently reachable.",
          retryable: true,
        }),
    );
    const worker = new MirrorWorker({
      store,
      provider: new StubProvider(...failures),
      now: () => new Date("2026-08-17T13:01:00.000Z"),
      retryDelayMs: () => 0,
    });

    worker.trigger();
    await worker.waitForIdle();
    await expect(service.get("mirror-job-1")).resolves.toMatchObject({
      status: "failed",
      attempts: 3,
    });
  });

  it("uses a safe generic failure for unexpected provider errors", async () => {
    const store = new InMemoryMirrorJobStore();
    const service = createService(store);
    await service.submit(request);
    const provider: MirrorInferenceProvider = {
      name: "broken-local",
      model: "broken-local",
      generate: () =>
        Promise.reject(new Error("sensitive implementation detail")),
    };
    const worker = new MirrorWorker({ store, provider });

    await worker.runOnce();
    await expect(service.get("mirror-job-1")).resolves.toMatchObject({
      status: "failed",
      lastError: "The local Mirror worker could not process this job.",
    });
  });

  it("starts and stops polling idempotently", async () => {
    const worker = new MirrorWorker({
      store: new InMemoryMirrorJobStore(),
      provider: new StubProvider(),
    });
    expect(() => worker.start(249)).toThrow(/poll interval/);
    expect(() => worker.start(60_001)).toThrow(/poll interval/);
    worker.start(250);
    worker.start(250);
    worker.stop();
    worker.stop();
    await worker.waitForIdle();
  });

  it("reports store-loop failures through the safe worker hook", async () => {
    class FailingStore extends InMemoryMirrorJobStore {
      override claimNext(): Promise<MirrorJobRecord | null> {
        return Promise.reject(new Error("store unavailable"));
      }
    }
    const failures: unknown[] = [];
    const worker = new MirrorWorker({
      store: new FailingStore(),
      provider: new StubProvider(),
      onWorkerError: (error) => failures.push(error),
    });
    worker.trigger();
    await worker.waitForIdle();
    expect(failures).toHaveLength(1);
  });

  it("returns safe missing and non-retryable service errors", async () => {
    const store = new InMemoryMirrorJobStore();
    const service = createService(store);
    await expect(service.get("missing")).rejects.toMatchObject({
      code: "JOB_NOT_FOUND",
      status: 404,
    });
    await expect(service.retry("missing")).rejects.toMatchObject({
      code: "JOB_NOT_FOUND",
      status: 404,
    });
    await service.submit(request);
    await expect(service.retry("mirror-job-1")).rejects.toMatchObject({
      code: "JOB_NOT_RETRYABLE",
      status: 409,
    });
    await expect(
      service.sync(["missing", request.requestId]),
    ).resolves.toMatchObject([{ requestId: request.requestId }]);
  });
});
