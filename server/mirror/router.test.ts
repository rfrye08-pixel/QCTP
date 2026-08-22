// @vitest-environment node

import express from "express";
import type { RequestHandler } from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { readVerifiedMirrorDeletionResponse } from "../../src/mirror/delete-proof.js";

import {
  PublicMirrorJobSchema,
  type CreateMirrorJobRequest,
} from "./contracts.js";
import { MirrorProviderError } from "./errors.js";
import type {
  MirrorGenerateInput,
  MirrorGenerateOutput,
  MirrorInferenceProvider,
} from "./provider.js";
import { createMirrorRouter } from "./router.js";
import { MirrorJobService } from "./service.js";
import { InMemoryMirrorJobStore } from "./store.js";
import { MirrorWorker } from "./worker.js";

const mirrorRequest: CreateMirrorJobRequest = {
  requestId: "iphone-offline-request-1",
  prompt: "Reflect on the pattern.",
  sources: [
    {
      recordId: "record-1",
      title: "Morning observation",
      kind: "observation",
      excerpt: "The same shape appeared twice.",
      recordUpdatedAt: "2026-08-17T12:00:00.000Z",
    },
  ],
};

class SequenceProvider implements MirrorInferenceProvider {
  readonly name = "test-local";
  readonly model = "test-model";
  readonly #responses: Array<string | MirrorProviderError>;

  constructor(...responses: Array<string | MirrorProviderError>) {
    this.#responses = [...responses];
  }

  generate(input: MirrorGenerateInput): Promise<MirrorGenerateOutput> {
    void input;
    const next = this.#responses.shift();
    if (next instanceof MirrorProviderError) {
      return Promise.reject(next);
    }
    return Promise.resolve({
      claims: [
        {
          text: next ?? "Grounded.",
          sourceRecordIds: ["record-1"],
        },
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
  }
}

const bearerGuard: RequestHandler = (request_, response, next) => {
  if (request_.header("authorization") !== "Bearer local-test-session") {
    response.status(401).json({ error: { code: "AUTH_REQUIRED" } });
    return;
  }
  next();
};

const createTestRuntime = (provider: MirrorInferenceProvider) => {
  const store = new InMemoryMirrorJobStore();
  const service = new MirrorJobService({
    store,
    model: provider.model,
    now: () => new Date("2026-08-17T13:00:00.000Z"),
    createId: () => "job-1",
  });
  const worker = new MirrorWorker({
    store,
    provider,
    now: () => new Date("2026-08-17T13:01:00.000Z"),
  });
  const app = express();
  app.use(
    "/api/mirror",
    bearerGuard,
    createMirrorRouter({
      service,
      worker,
      providerName: provider.name,
      createRequestId: () => "http-request-1",
    }),
  );
  return { app, worker };
};

const parseBody = (serialized: string): unknown =>
  JSON.parse(serialized) as unknown;

describe("Mirror router", () => {
  it("is inaccessible when the parent authentication guard rejects", async () => {
    const { app } = createTestRuntime(new SequenceProvider());
    const response = await request(app)
      .post("/api/mirror/jobs")
      .send(mirrorRequest);
    expect(response.status).toBe(401);
  });

  it("reports a no-cost local runtime identity behind authentication", async () => {
    const { app } = createTestRuntime(new SequenceProvider());
    const response = await request(app)
      .get("/api/mirror/policy")
      .set("Authorization", "Bearer local-test-session");
    expect(response.status).toBe(200);
    expect(parseBody(response.text)).toEqual({
      mode: "free-local",
      provider: "test-local",
      model: "test-model",
      paidCloudEnabled: false,
      recurringApiCostUsd: 0,
    });
  });

  it("creates, processes, retrieves, syncs, and replays a request id", async () => {
    const { app, worker } = createTestRuntime(
      new SequenceProvider("The shape repeated."),
    );
    const createdResponse = await request(app)
      .post("/api/mirror/jobs")
      .set("Authorization", "Bearer local-test-session")
      .send(mirrorRequest);
    expect(createdResponse.status).toBe(202);
    const created = PublicMirrorJobSchema.parse(
      parseBody(createdResponse.text),
    );
    expect(created).toMatchObject({
      id: "job-1",
      requestId: mirrorRequest.requestId,
      status: "queued",
      attempts: 0,
      lastError: null,
      result: null,
    });

    await worker.waitForIdle();
    const fetchedResponse = await request(app)
      .get("/api/mirror/jobs/job-1")
      .set("Authorization", "Bearer local-test-session");
    expect(fetchedResponse.status).toBe(200);
    const fetched = PublicMirrorJobSchema.parse(
      parseBody(fetchedResponse.text),
    );
    expect(fetched).toMatchObject({
      status: "complete",
      attempts: 1,
      result: {
        text:
          "The shape repeated. [source:record-1]\n" +
          "Proposed question: What should be examined next? [source:record-1]\n" +
          "Proposed action: Review the cited record. [source:record-1]",
        citations: [{ recordId: "record-1" }],
      },
    });

    const syncedResponse = await request(app)
      .get(`/api/mirror/jobs?requestIds=${mirrorRequest.requestId}`)
      .set("Authorization", "Bearer local-test-session");
    const synced = z
      .object({ jobs: z.array(PublicMirrorJobSchema) })
      .parse(parseBody(syncedResponse.text));
    expect(synced.jobs).toEqual([fetched]);

    const replayResponse = await request(app)
      .post("/api/mirror/jobs")
      .set("Authorization", "Bearer local-test-session")
      .send(mirrorRequest);
    expect(replayResponse.status).toBe(200);
    expect(PublicMirrorJobSchema.parse(parseBody(replayResponse.text))).toEqual(
      fetched,
    );
  });

  it("returns a structured validation error without echoing submitted content", async () => {
    const { app } = createTestRuntime(new SequenceProvider());
    const response = await request(app)
      .post("/api/mirror/jobs")
      .set("Authorization", "Bearer local-test-session")
      .send({ ...mirrorRequest, prompt: "", privateValue: "do-not-echo" });
    expect(response.status).toBe(400);
    expect(parseBody(response.text)).toEqual({
      error: {
        code: "INVALID_REQUEST",
        message: "The Mirror request is invalid.",
        retryable: false,
        requestId: "http-request-1",
        field: "prompt",
      },
    });
    expect(response.text).not.toContain("do-not-echo");
  });

  it("supports an explicit retry after a local model rejection", async () => {
    const rejection = new MirrorProviderError({
      code: "LOCAL_MODEL_REJECTED",
      message: "The PX13 local model rejected the request.",
      retryable: false,
    });
    const { app, worker } = createTestRuntime(
      new SequenceProvider(rejection, "Recovered."),
    );
    await request(app)
      .post("/api/mirror/jobs")
      .set("Authorization", "Bearer local-test-session")
      .send(mirrorRequest);
    await worker.waitForIdle();

    const retryResponse = await request(app)
      .post("/api/mirror/jobs/job-1/retry")
      .set("Authorization", "Bearer local-test-session");
    expect(retryResponse.status).toBe(202);
    expect(
      PublicMirrorJobSchema.parse(parseBody(retryResponse.text)),
    ).toMatchObject({ status: "queued", attempts: 0, lastError: null });
    await worker.waitForIdle();

    const completeResponse = await request(app)
      .get("/api/mirror/jobs/job-1")
      .set("Authorization", "Bearer local-test-session");
    expect(
      PublicMirrorJobSchema.parse(parseBody(completeResponse.text)),
    ).toMatchObject({ status: "complete", attempts: 1 });
  });

  it("returns safe errors for missing, malformed, and conflicting requests", async () => {
    const { app, worker } = createTestRuntime(new SequenceProvider());
    const missing = await request(app)
      .get("/api/mirror/jobs/missing")
      .set("Authorization", "Bearer local-test-session");
    expect(missing.status).toBe(404);
    expect(parseBody(missing.text)).toMatchObject({
      error: { code: "JOB_NOT_FOUND", requestId: "http-request-1" },
    });

    const invalidId = await request(app)
      .get("/api/mirror/jobs/%20")
      .set("Authorization", "Bearer local-test-session");
    expect(invalidId.status).toBe(400);
    expect(parseBody(invalidId.text)).toMatchObject({
      error: { code: "INVALID_REQUEST", field: "jobId" },
    });

    const missingQuery = await request(app)
      .get("/api/mirror/jobs")
      .set("Authorization", "Bearer local-test-session");
    expect(missingQuery.status).toBe(400);
    const duplicateQuery = await request(app)
      .get("/api/mirror/jobs?requestIds=one,one")
      .set("Authorization", "Bearer local-test-session");
    expect(duplicateQuery.status).toBe(400);

    const malformedJson = await request(app)
      .post("/api/mirror/jobs")
      .set("Authorization", "Bearer local-test-session")
      .set("Content-Type", "application/json")
      .send('{"broken"');
    expect(malformedJson.status).toBe(400);
    expect(parseBody(malformedJson.text)).toMatchObject({
      error: { code: "INVALID_REQUEST", field: "body" },
    });

    await request(app)
      .post("/api/mirror/jobs")
      .set("Authorization", "Bearer local-test-session")
      .send(mirrorRequest);
    await worker.waitForIdle();
    const conflict = await request(app)
      .post("/api/mirror/jobs")
      .set("Authorization", "Bearer local-test-session")
      .send({ ...mirrorRequest, prompt: "Different content." });
    expect(conflict.status).toBe(409);
    expect(parseBody(conflict.text)).toMatchObject({
      error: { code: "REQUEST_ID_CONFLICT", field: "requestId" },
    });

    const completedRetry = await request(app)
      .post("/api/mirror/jobs/job-1/retry")
      .set("Authorization", "Bearer local-test-session");
    expect(completedRetry.status).toBe(409);
    expect(parseBody(completedRetry.text)).toMatchObject({
      error: { code: "JOB_NOT_RETRYABLE" },
    });
  });

  it("deletes the durable PX13 job and returns not found on replay", async () => {
    const { app } = createTestRuntime(new SequenceProvider());
    await request(app)
      .post("/api/mirror/jobs")
      .set("Authorization", "Bearer local-test-session")
      .send(mirrorRequest);

    const deleted = await request(app)
      .delete("/api/mirror/jobs/job-1")
      .set("Authorization", "Bearer local-test-session");
    expect(deleted.status).toBe(204);
    expect(deleted.headers["x-request-id"]).toBe("http-request-1");
    await expect(
      readVerifiedMirrorDeletionResponse(
        new Response(null, {
          status: deleted.status,
          headers: { "X-Request-Id": String(deleted.headers["x-request-id"]) },
        }),
      ),
    ).resolves.toBe("deleted");

    const missing = await request(app)
      .get("/api/mirror/jobs/job-1")
      .set("Authorization", "Bearer local-test-session");
    expect(missing.status).toBe(404);
    const secondDelete = await request(app)
      .delete("/api/mirror/jobs/job-1")
      .set("Authorization", "Bearer local-test-session");
    expect(secondDelete.status).toBe(404);
    expect(secondDelete.headers["x-request-id"]).toBe("http-request-1");
    expect(secondDelete.headers["content-type"]).toMatch(/application\/json/u);
    expect(parseBody(secondDelete.text)).toMatchObject({
      error: {
        code: "JOB_NOT_FOUND",
        message: "The Mirror job was not found.",
        retryable: false,
        requestId: "http-request-1",
      },
    });
    await expect(
      readVerifiedMirrorDeletionResponse(
        new Response(secondDelete.text, {
          status: secondDelete.status,
          headers: {
            "Content-Type": String(secondDelete.headers["content-type"]),
            "X-Request-Id": String(secondDelete.headers["x-request-id"]),
          },
        }),
      ),
    ).resolves.toBe("not_found");
  });

  it("deletes by client request id when the create response was lost", async () => {
    const { app } = createTestRuntime(new SequenceProvider());
    const created = await request(app)
      .post("/api/mirror/jobs")
      .set("Authorization", "Bearer local-test-session")
      .send(mirrorRequest);
    expect(created.status).toBe(202);

    const deleted = await request(app)
      .delete(`/api/mirror/jobs/by-request/${mirrorRequest.requestId}`)
      .set("Authorization", "Bearer local-test-session");
    expect(deleted.status).toBe(204);
    expect(deleted.headers["x-request-id"]).toBe("http-request-1");
    await expect(
      readVerifiedMirrorDeletionResponse(
        new Response(null, {
          status: deleted.status,
          headers: { "X-Request-Id": String(deleted.headers["x-request-id"]) },
        }),
      ),
    ).resolves.toBe("deleted");

    const synced = await request(app)
      .get(`/api/mirror/jobs?requestIds=${mirrorRequest.requestId}`)
      .set("Authorization", "Bearer local-test-session");
    expect(parseBody(synced.text)).toEqual({ jobs: [] });
    const repeated = await request(app)
      .delete(`/api/mirror/jobs/by-request/${mirrorRequest.requestId}`)
      .set("Authorization", "Bearer local-test-session");
    expect(repeated.status).toBe(404);
    expect(repeated.headers["x-request-id"]).toBe("http-request-1");
    expect(repeated.headers["content-type"]).toMatch(/application\/json/u);
    expect(parseBody(repeated.text)).toMatchObject({
      error: {
        code: "JOB_NOT_FOUND",
        message: "The Mirror job was not found.",
        retryable: false,
        requestId: "http-request-1",
      },
    });
    await expect(
      readVerifiedMirrorDeletionResponse(
        new Response(repeated.text, {
          status: repeated.status,
          headers: {
            "Content-Type": String(repeated.headers["content-type"]),
            "X-Request-Id": String(repeated.headers["x-request-id"]),
          },
        }),
      ),
    ).resolves.toBe("not_found");
  });

  it("validates and authenticates deletion by client request id", async () => {
    const { app } = createTestRuntime(new SequenceProvider());
    const unauthorized = await request(app).delete(
      `/api/mirror/jobs/by-request/${mirrorRequest.requestId}`,
    );
    expect(unauthorized.status).toBe(401);

    const malformed = await request(app)
      .delete("/api/mirror/jobs/by-request/%20")
      .set("Authorization", "Bearer local-test-session");
    expect(malformed.status).toBe(400);
    expect(parseBody(malformed.text)).toMatchObject({
      error: { code: "INVALID_REQUEST", field: "requestId" },
    });
  });
});
