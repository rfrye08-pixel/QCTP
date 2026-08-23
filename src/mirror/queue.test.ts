import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createQctpRepository,
  deleteQctpDatabase,
  type QctpRepository,
} from "../data";
import { CodexRecordSchema } from "../domain";

import { MirrorServiceClient } from "./client";
import {
  enqueueMirrorRequest,
  extractExplicitMirrorProposals,
  synchronizeMirrorRequests,
} from "./queue";

const timestamp = "2026-08-17T12:00:00.000Z";
const token = "px13-private-device-token-1234567890";

function response(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function sourceRecord(id: string) {
  return CodexRecordSchema.parse({
    schemaVersion: 1,
    id,
    kind: "geometry",
    title: "Two circles observation",
    createdAt: timestamp,
    updatedAt: timestamp,
    observation: {
      id: `${id}:observation`,
      text: "The overlap changed as the compass returned to the first center.",
      capturedAt: timestamp,
      evidenceClass: "observed",
      provenance: {
        actor: "user",
        method: "direct-entry",
        provider: null,
        model: null,
      },
      sourceIds: [],
    },
    interpretation: {
      id: `${id}:interpretation`,
      text: "I interpreted the return as a practice pattern.",
      authoredAt: timestamp,
      provenance: {
        actor: "user",
        method: "direct-entry",
        provider: null,
        model: null,
      },
      basedOnEvidenceIds: [`${id}:observation`],
    },
    tags: ["geometry"],
    backlinks: [],
    sourceLinks: [],
    attachmentIds: [],
    revisionIds: [],
    pathId: "reg-path",
    sessionId: null,
    fields: { state: "focused" },
    deletedAt: null,
  });
}

describe("iPhone Mirror offline queue and PX13 synchronization", () => {
  let databaseName: string;
  let repository: QctpRepository;

  beforeEach(async () => {
    databaseName = `mirror-queue-${crypto.randomUUID()}`;
    repository = await createQctpRepository({ name: databaseName });
    await repository.saveRecord(sourceRecord("source-one"));
  });

  afterEach(async () => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
    repository.close();
    await deleteQctpDatabase(databaseName);
  });

  it("queues locally, submits idempotently, polls, and synchronizes a source-verified result", async () => {
    const local = await enqueueMirrorRequest(
      repository,
      {
        prompt: "What pattern is supported by this observation?",
        sourceRecordIds: ["source-one"],
      },
      timestamp,
    );
    expect(local.status).toBe("QUEUED_LOCAL");
    const source = local.sourceSnapshots[0];
    if (!source) throw new Error("Source snapshot missing.");
    expect(source.excerpt).toContain("[Observation]\nThe overlap changed");
    expect(source.excerpt).toContain(
      "[Interpretation]\nI interpreted the return",
    );
    expect(source.excerpt).toContain(
      '[Structured fields]\n{"state":"focused"}',
    );
    let postSeen = false;
    const request = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        if (init?.method === "POST") {
          postSeen = true;
          return Promise.resolve(
            response(
              {
                id: "px13-job-one",
                requestId: local.id,
                status: "queued",
                createdAt: timestamp,
                updatedAt: timestamp,
                attempts: 0,
                lastError: null,
                result: null,
              },
              202,
            ),
          );
        }
        return Promise.resolve(
          response({
            id: "px13-job-one",
            requestId: local.id,
            status: "complete",
            createdAt: timestamp,
            updatedAt: "2026-08-17T12:01:00.000Z",
            attempts: 1,
            lastError: null,
            result: {
              text:
                "The repeated return is supported [source:source-one].\n" +
                "Proposed question: What changes on the next return? [source:source-one]\n" +
                "Proposed action: Record the next return. [source:source-one]",
              model: "qwen2.5:7b-instruct",
              citations: [
                {
                  recordId: source.recordId,
                  title: source.title,
                  excerpt: source.excerpt,
                },
              ],
              createdAt: "2026-08-17T12:01:00.000Z",
            },
          }),
        );
      },
    );
    const client = new MirrorServiceClient({
      accessToken: token,
      fetch: request,
    });
    await synchronizeMirrorRequests(repository, client);
    expect(postSeen).toBe(true);
    expect(await repository.getMirrorRequest(local.id)).toMatchObject({
      status: "QUEUED_PX13",
      remoteJobId: "px13-job-one",
    });
    await synchronizeMirrorRequests(repository, client);
    expect(await repository.getMirrorRequest(local.id)).toMatchObject({
      status: "COMPLETE",
    });
    expect(await repository.getMirrorResultForRequest(local.id)).toMatchObject({
      provider: "px13-local",
      providerType: "local_model",
      query: "What pattern is supported by this observation?",
      sourceRecordIds: ["source-one"],
      proposedQuestion: "What changes on the next return? [source:source-one]",
      proposedAction: "Record the next return. [source:source-one]",
      disposition: "unreviewed",
      citations: [{ recordId: "source-one" }],
    });
  });

  it("retains a local request with a non-key connectivity message when PX13 is unavailable", async () => {
    const local = await enqueueMirrorRequest(repository, {
      prompt: "Hold this question until PX13 returns.",
      sourceRecordIds: ["source-one"],
    });
    const client = new MirrorServiceClient({
      accessToken: token,
      fetch: vi.fn((): Promise<Response> =>
        Promise.reject(new TypeError("offline")),
      ),
    });
    await synchronizeMirrorRequests(repository, client);
    const queued = await repository.getMirrorRequest(local.id);
    expect(queued).toMatchObject({ status: "RETRY_WAIT", remoteJobId: null });
    expect(queued?.lastError).toContain("remains queued");
    expect(queued?.lastError?.toLowerCase()).not.toContain("api key");
  });

  it("survives an explicit offline cycle and submits unchanged after reconnect", async () => {
    const local = await enqueueMirrorRequest(
      repository,
      {
        prompt: "Submit this exact question after connectivity returns.",
        sourceRecordIds: ["source-one"],
      },
      timestamp,
    );
    const request = vi.fn(() =>
      Promise.resolve(
        response(
          {
            id: "px13-reconnected-job",
            requestId: local.id,
            status: "queued",
            createdAt: timestamp,
            updatedAt: timestamp,
            attempts: 0,
            lastError: null,
            result: null,
          },
          202,
        ),
      ),
    );
    const client = new MirrorServiceClient({
      accessToken: token,
      fetch: request,
    });
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });

    await expect(
      synchronizeMirrorRequests(repository, client),
    ).resolves.toEqual({ completedRequestIds: [], queuedRequestIds: [] });
    expect(request).not.toHaveBeenCalled();
    expect(await repository.getMirrorRequest(local.id)).toEqual(local);

    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
    await expect(
      synchronizeMirrorRequests(repository, client),
    ).resolves.toEqual({
      completedRequestIds: [],
      queuedRequestIds: [local.id],
    });
    expect(request).toHaveBeenCalledOnce();
    expect(await repository.getMirrorRequest(local.id)).toMatchObject({
      prompt: local.prompt,
      sourceRecordIds: local.sourceRecordIds,
      sourceSnapshots: local.sourceSnapshots,
      status: "QUEUED_PX13",
      remoteJobId: "px13-reconnected-job",
    });
  });

  it("reuses the stable idempotency key when a submit response is lost", async () => {
    const local = await enqueueMirrorRequest(repository, {
      prompt: "Do not duplicate this request after a lost response.",
      sourceRecordIds: ["source-one"],
    });
    const submissions: Array<{ key: string | null; body: string | null }> = [];
    let attempt = 0;
    const request = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        attempt += 1;
        submissions.push({
          key: new Headers(init?.headers).get("Idempotency-Key"),
          body: typeof init?.body === "string" ? init.body : null,
        });
        if (attempt === 1) {
          return Promise.reject(new TypeError("response lost after submit"));
        }
        return Promise.resolve(
          response(
            {
              id: "px13-idempotent-job",
              requestId: local.id,
              status: "queued",
              createdAt: timestamp,
              updatedAt: timestamp,
              attempts: 0,
              lastError: null,
              result: null,
            },
            202,
          ),
        );
      },
    );
    const client = new MirrorServiceClient({
      accessToken: token,
      fetch: request,
    });

    await synchronizeMirrorRequests(repository, client);
    const retryWait = await repository.getMirrorRequest(local.id);
    if (!retryWait) throw new Error("Retry request was not retained.");
    expect(retryWait).toMatchObject({
      status: "RETRY_WAIT",
      remoteJobId: null,
      attempts: 1,
    });
    await repository.saveMirrorRequest({
      ...retryWait,
      nextAttemptAt: null,
    });
    await synchronizeMirrorRequests(repository, client);

    expect(submissions).toHaveLength(2);
    expect(submissions[0]?.key).toBe(`mirror-${local.id}`);
    expect(submissions[1]).toEqual(submissions[0]);
    expect(await repository.getMirrorRequest(local.id)).toMatchObject({
      status: "QUEUED_PX13",
      remoteJobId: "px13-idempotent-job",
      attempts: 2,
    });
  });

  it("rejects non-TLS remote endpoints before any source can leave the device", () => {
    expect(
      () =>
        new MirrorServiceClient({
          accessToken: token,
          baseUrl: "http://192.168.1.20:8787",
        }),
    ).toThrow(/require HTTPS/);
    expect(
      () =>
        new MirrorServiceClient({
          accessToken: token,
          baseUrl: "https://embedded:credential@private.example",
        }),
    ).toThrow(/require HTTPS/);
  });

  it("reconciles a remote-backed manual retry before asking the PX13 to retry it", async () => {
    const local = await enqueueMirrorRequest(
      repository,
      {
        prompt: "Recover the already completed result.",
        sourceRecordIds: ["source-one"],
      },
      timestamp,
    );
    const source = local.sourceSnapshots[0];
    if (!source) throw new Error("Source snapshot missing.");
    await repository.saveMirrorRequest({
      ...local,
      status: "SUBMITTING",
      remoteJobId: "px13-existing-job",
      lastError: null,
    });
    const request = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        expect(init?.method).not.toBe("POST");
        return Promise.resolve(
          response({
            id: "px13-existing-job",
            requestId: local.id,
            status: "complete",
            createdAt: timestamp,
            updatedAt: "2026-08-17T12:01:00.000Z",
            attempts: 1,
            lastError: null,
            result: {
              text:
                "The source supports a recovered result [source:source-one].\n" +
                "Proposed question: What should be checked? [source:source-one]\n" +
                "Proposed action: Check the record. [source:source-one]",
              model: "qwen2.5:7b-instruct",
              citations: [
                {
                  recordId: source.recordId,
                  title: source.title,
                  excerpt: source.excerpt,
                },
              ],
              createdAt: "2026-08-17T12:01:00.000Z",
            },
          }),
        );
      },
    );
    const client = new MirrorServiceClient({
      accessToken: token,
      fetch: request,
    });

    await synchronizeMirrorRequests(repository, client);
    expect(request).toHaveBeenCalledTimes(1);
    expect(await repository.getMirrorRequest(local.id)).toMatchObject({
      status: "COMPLETE",
    });
  });

  it.each([
    [
      "Grounded text [source:source-one].",
      "without exactly one proposed question and action",
    ],
    [
      "Grounded text without a marker.\nProposed question: What changed?\nProposed action: Record it.",
      "source markers did not match",
    ],
  ])(
    "holds an incomplete or ungrounded completed result",
    async (text, expectedError) => {
      const local = await enqueueMirrorRequest(repository, {
        prompt: "Return a complete grounded reflection.",
        sourceRecordIds: ["source-one"],
      });
      const source = local.sourceSnapshots[0];
      if (!source) throw new Error("Source snapshot missing.");
      const client = new MirrorServiceClient({
        accessToken: token,
        fetch: vi.fn(() =>
          Promise.resolve(
            response({
              id: "invalid-complete-job",
              requestId: local.id,
              status: "complete",
              createdAt: timestamp,
              updatedAt: timestamp,
              attempts: 1,
              lastError: null,
              result: {
                text,
                model: "mock-local",
                citations: [
                  {
                    recordId: source.recordId,
                    title: source.title,
                    excerpt: source.excerpt,
                  },
                ],
                createdAt: timestamp,
              },
            }),
          ),
        ),
      });

      await synchronizeMirrorRequests(repository, client);
      const failedRequest = await repository.getMirrorRequest(local.id);
      expect(failedRequest?.status).toBe("FAILED");
      expect(failedRequest?.lastError).toContain(expectedError);
      expect(
        await repository.getMirrorResultForRequest(local.id),
      ).toBeUndefined();
    },
  );

  it.each([
    {
      label: "a completed status without a result",
      result: null,
    },
    {
      label: "an empty source excerpt",
      result: {
        text:
          "Grounded claim [source:source-one].\n" +
          "Proposed question: What changed? [source:source-one]\n" +
          "Proposed action: Record it. [source:source-one]",
        model: "mock-local",
        citations: [
          {
            recordId: "source-one",
            title: "Two circles observation",
            excerpt: "",
          },
        ],
        createdAt: timestamp,
      },
    },
  ])("never marks a request complete for $label", async ({ result }) => {
    const local = await enqueueMirrorRequest(repository, {
      prompt: "Keep invalid completion out of the local result ledger.",
      sourceRecordIds: ["source-one"],
    });
    const client = new MirrorServiceClient({
      accessToken: token,
      fetch: vi.fn(() =>
        Promise.resolve(
          response({
            id: "invalid-completion-job",
            requestId: local.id,
            status: "complete",
            createdAt: timestamp,
            updatedAt: timestamp,
            attempts: 1,
            lastError: null,
            result,
          }),
        ),
      ),
    });

    await synchronizeMirrorRequests(repository, client);

    expect(await repository.getMirrorRequest(local.id)).toMatchObject({
      status: "FAILED",
    });
    expect(
      await repository.getMirrorResultForRequest(local.id),
    ).toBeUndefined();
  });
});

describe("explicit Local AI Mirror proposal extraction", () => {
  it("extracts only clearly labeled generated fields", () => {
    expect(
      extractExplicitMirrorProposals(
        "Reflection text.\nProposed question: What changed?\nProposed action: Record one observation.",
      ),
    ).toEqual({
      proposedQuestion: "What changed?",
      proposedAction: "Record one observation.",
    });
    expect(
      extractExplicitMirrorProposals(
        "Perhaps ask what changed and then record an observation.",
      ),
    ).toEqual({ proposedQuestion: null, proposedAction: null });
    expect(
      extractExplicitMirrorProposals(
        "Proposed question: First?\nProposed question: Second?\nProposed action: Act.",
      ),
    ).toEqual({ proposedQuestion: null, proposedAction: "Act." });
  });
});
