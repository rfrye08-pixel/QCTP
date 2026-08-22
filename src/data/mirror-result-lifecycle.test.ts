import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  CodexRecordSchema,
  MirrorRequestSchema,
  MirrorResultSchema,
} from "../domain";
import { exportJson, importJson } from "../export-import";

import { deleteQctpDatabase } from "./db";
import { createQctpRepository, type QctpRepository } from "./repository";

const createdAt = "2026-08-17T12:00:00.000Z";
const reviewedAt = "2026-08-17T12:05:00.000Z";

describe("generated Mirror reflection lifecycle", () => {
  let repository: QctpRepository;
  let databaseName: string;

  beforeEach(async () => {
    databaseName = `mirror-result-lifecycle-${crypto.randomUUID()}`;
    repository = await createQctpRepository({ name: databaseName });
    await repository.saveRecord(
      CodexRecordSchema.parse({
        schemaVersion: 1,
        id: "source-1",
        kind: "mirror",
        title: "Source evidence",
        createdAt,
        updatedAt: createdAt,
        observation: {
          id: "source-1:observation",
          text: "I recorded the direct event.",
          capturedAt: createdAt,
          evidenceClass: "self_reported",
          provenance: {
            actor: "user",
            method: "test",
            provider: null,
            model: null,
          },
          sourceIds: [],
        },
        interpretation: null,
        tags: [],
        backlinks: [],
        sourceLinks: [],
        attachmentIds: [],
        revisionIds: [],
        pathId: null,
        sessionId: null,
        fields: {},
        deletedAt: null,
      }),
    );
    await repository.saveMirrorRequest(
      MirrorRequestSchema.parse({
        schemaVersion: 1,
        id: "request-1",
        prompt: "Compare the selected evidence.",
        sourceRecordIds: ["source-1"],
        sourceSnapshots: [
          {
            recordId: "source-1",
            title: "Source evidence",
            kind: "mirror",
            excerpt: "I recorded the direct event.",
            recordUpdatedAt: createdAt,
          },
        ],
        status: "PROCESSING",
        remoteJobId: "remote-job-1",
        attempts: 1,
        nextAttemptAt: null,
        lastError: null,
        createdAt,
        updatedAt: createdAt,
        deletedAt: null,
      }),
    );
    await repository.saveMirrorResult(
      MirrorResultSchema.parse({
        schemaVersion: 1,
        id: "result-1",
        requestId: "request-1",
        remoteJobId: "remote-job-1",
        text: "Generated draft.",
        citations: [
          {
            recordId: "source-1",
            title: "Source evidence",
            excerpt: "direct event",
          },
        ],
        providerType: "local_model",
        provider: "px13-local",
        model: "mock-local",
        query: "Compare the selected evidence.",
        sourceRecordIds: ["source-1"],
        proposedQuestion: "What changed?",
        proposedAction: "Record one observation.",
        disposition: "unreviewed",
        revisionHistory: [],
        annotation: null,
        createdAt,
        deletedAt: null,
      }),
    );
  });

  afterEach(async () => {
    repository.close();
    await deleteQctpDatabase(databaseName);
  });

  it("records acceptance, annotation, correction, and rejection without touching sources", async () => {
    const sourceBefore = await repository.getRecord("source-1");
    const accepted = await repository.reviewMirrorResult(
      "result-1",
      { action: "accepted", annotation: "Supported by my notes." },
      reviewedAt,
    );
    expect(accepted).toMatchObject({
      disposition: "accepted",
      annotation: "Supported by my notes.",
    });
    expect(accepted.revisionHistory.map((revision) => revision.action)).toEqual(
      ["generated", "accepted"],
    );
    expect(accepted.revisionHistory[0]?.text).toBe("Generated draft.");

    const annotated = await repository.reviewMirrorResult(
      "result-1",
      { action: "annotated", annotation: "Keep this uncertainty visible." },
      "2026-08-17T12:06:00.000Z",
    );
    expect(annotated.disposition).toBe("accepted");
    expect(annotated.revisionHistory.at(-1)?.action).toBe("annotated");

    const revised = await repository.reviewMirrorResult(
      "result-1",
      {
        action: "revised",
        text: "My revised reflection.",
        proposedQuestion: "What evidence is missing?",
        proposedAction: "Record the missing evidence.",
      },
      "2026-08-17T12:07:00.000Z",
    );
    expect(revised).toMatchObject({
      disposition: "revised",
      text: "My revised reflection.",
      proposedQuestion: "What evidence is missing?",
      proposedAction: "Record the missing evidence.",
    });
    expect(revised.revisionHistory).toHaveLength(4);

    const rejected = await repository.reviewMirrorResult(
      "result-1",
      { action: "rejected" },
      "2026-08-17T12:08:00.000Z",
    );
    expect(rejected.disposition).toBe("rejected");
    expect(rejected.revisionHistory.at(-1)?.action).toBe("rejected");
    expect(await repository.getRecord("source-1")).toEqual(sourceBefore);
  });

  it("atomically tombstones and restores the request/result while retaining audit history", async () => {
    const deleted = await repository.deleteMirrorReflection(
      "request-1",
      "result-1",
      reviewedAt,
    );
    expect(deleted.request.deletedAt).toBe(reviewedAt);
    expect(deleted.result.deletedAt).toBe(reviewedAt);
    expect(
      deleted.result.revisionHistory.map((revision) => revision.action),
    ).toEqual(["generated", "deleted"]);
    expect(await repository.listMirrorRequests()).toEqual([]);
    expect(await repository.listMirrorResults()).toEqual([]);
    expect(
      await repository.listMirrorResults({ includeDeleted: true }),
    ).toHaveLength(1);
    await expect(
      repository.reviewMirrorResult("result-1", { action: "accepted" }),
    ).rejects.toThrow("deleted");

    const idempotent = await repository.deleteMirrorReflection(
      "request-1",
      "result-1",
      "2026-08-17T12:06:00.000Z",
    );
    expect(idempotent.result.revisionHistory).toHaveLength(2);

    const restored = await repository.restoreMirrorReflection(
      "request-1",
      "result-1",
      "2026-08-17T12:07:00.000Z",
    );
    expect(restored.request.deletedAt).toBeNull();
    expect(restored.result.deletedAt).toBeNull();
    expect(restored.result.revisionHistory.at(-1)?.action).toBe("restored");
    expect(await repository.listMirrorResults()).toHaveLength(1);
  });

  it("tombstones a result-less request but requires paired deletion once a result exists", async () => {
    await repository.saveMirrorRequest(
      MirrorRequestSchema.parse({
        schemaVersion: 1,
        id: "request-only",
        prompt: "A queued local request.",
        sourceRecordIds: ["source-1"],
        sourceSnapshots: [
          {
            recordId: "source-1",
            title: "Source evidence",
            kind: "mirror",
            excerpt: "I recorded the direct event.",
            recordUpdatedAt: createdAt,
          },
        ],
        status: "QUEUED_LOCAL",
        remoteJobId: null,
        attempts: 0,
        nextAttemptAt: null,
        lastError: null,
        createdAt,
        updatedAt: createdAt,
        deletedAt: null,
      }),
    );

    const deleted = await repository.deleteMirrorRequest(
      "request-only",
      reviewedAt,
    );
    expect(deleted.deletedAt).toBe(reviewedAt);
    expect(await repository.getMirrorRequest("request-only")).toBeUndefined();
    expect(
      await repository.getMirrorRequest("request-only", {
        includeDeleted: true,
      }),
    ).toEqual(deleted);
    expect(await repository.deleteMirrorRequest("request-only")).toEqual(
      deleted,
    );
    const restored = await repository.restoreMirrorRequest(
      "request-only",
      "2026-08-17T12:06:00.000Z",
    );
    expect(restored).toMatchObject({
      status: "QUEUED_LOCAL",
      remoteJobId: null,
      deletedAt: null,
      sourceSnapshots: deleted.sourceSnapshots,
    });
    await repository.deleteMirrorRequest(
      "request-only",
      "2026-08-17T12:07:00.000Z",
    );
    await expect(
      repository.purgeMirrorRequest("request-only"),
    ).resolves.toEqual({ requestId: "request-only", resultId: null });
    expect(
      await repository.getMirrorRequest("request-only", {
        includeDeleted: true,
      }),
    ).toBeUndefined();
    await expect(repository.deleteMirrorRequest("request-1")).rejects.toThrow(
      "paired reflection deletion",
    );
  });

  it("requires a tombstone before permanent purge and preserves live data on failure", async () => {
    await expect(
      repository.purgeMirrorReflection("request-1", "result-1"),
    ).rejects.toThrow("must be tombstoned");
    expect(await repository.getMirrorRequest("request-1")).toBeDefined();
    expect(await repository.getMirrorResult("result-1")).toBeDefined();

    await repository.deleteMirrorReflection(
      "request-1",
      "result-1",
      reviewedAt,
    );
    await expect(
      repository.purgeMirrorReflection("request-1", "not-result-1"),
    ).rejects.toThrow("no longer exists");
    expect(
      await repository.getMirrorRequest("request-1", { includeDeleted: true }),
    ).toBeDefined();
    expect(
      await repository.getMirrorResult("result-1", { includeDeleted: true }),
    ).toBeDefined();
  });

  it("purges the paired request, generated result, and revision history so its source can be deleted", async () => {
    await repository.reviewMirrorResult(
      "result-1",
      { action: "accepted" },
      reviewedAt,
    );
    await repository.deleteMirrorReflection(
      "request-1",
      "result-1",
      "2026-08-17T12:06:00.000Z",
    );
    await expect(
      repository.purgeMirrorReflection("request-1", "result-1"),
    ).resolves.toEqual({ requestId: "request-1", resultId: "result-1" });
    expect(
      await repository.getMirrorRequest("request-1", { includeDeleted: true }),
    ).toBeUndefined();
    expect(
      await repository.getMirrorResult("result-1", { includeDeleted: true }),
    ).toBeUndefined();

    await expect(repository.deleteRecord("source-1")).resolves.toBeUndefined();
    expect(await repository.getRecord("source-1")).toBeUndefined();

    const exported = await exportJson(repository);
    expect(JSON.parse(exported)).toMatchObject({
      records: [],
      mirrorRequests: [],
      mirrorResults: [],
    });
    const targetName = `mirror-purge-target-${crypto.randomUUID()}`;
    const target = await createQctpRepository({ name: targetName });
    try {
      await importJson(target, exported, { mode: "replace" });
      expect(
        await target.listMirrorRequests(undefined, { includeDeleted: true }),
      ).toEqual([]);
      expect(await target.listMirrorResults({ includeDeleted: true })).toEqual(
        [],
      );
      expect(await target.getRecord("source-1")).toBeUndefined();
    } finally {
      target.close();
      await deleteQctpDatabase(targetName);
    }
  });

  it("rejects revised blank text and result/request provenance mismatches", async () => {
    await expect(
      repository.reviewMirrorResult("result-1", {
        action: "revised",
        text: "   ",
      }),
    ).rejects.toThrow("needs text");
    await expect(
      repository.reviewMirrorResult("result-1", {
        action: "revised",
        text: "A revision with an invalid proposal.",
        proposedQuestion: "What changed?",
        proposedAction: "   ",
      }),
    ).rejects.toThrow("one proposed question and one proposed action");
    await expect(
      repository.saveMirrorResult(
        MirrorResultSchema.parse({
          ...(await repository.getMirrorResult("result-1")),
          id: "bad-result",
          query: "A different query.",
        }),
      ),
    ).rejects.toThrow("must match");
  });

  it("blocks hard deletion of a record while Mirror provenance references it", async () => {
    await expect(repository.deleteRecord("source-1")).rejects.toThrow(
      "Mirror provenance still references it",
    );
    expect(await repository.getRecord("source-1")).toBeDefined();
    expect(await repository.getMirrorRequest("request-1")).toBeDefined();
    expect(await repository.getMirrorResult("result-1")).toBeDefined();
  });

  it("round-trips disposition, revisions, proposals, provenance, and deletion state", async () => {
    await repository.reviewMirrorResult(
      "result-1",
      {
        action: "revised",
        text: "User revised local reflection.",
        annotation: "Keep the cited uncertainty.",
      },
      reviewedAt,
    );
    await repository.deleteMirrorReflection(
      "request-1",
      "result-1",
      "2026-08-17T12:06:00.000Z",
    );

    const targetName = `mirror-result-target-${crypto.randomUUID()}`;
    const target = await createQctpRepository({ name: targetName });
    try {
      await importJson(target, await exportJson(repository), {
        mode: "replace",
      });
      expect(
        await target.getMirrorResult("result-1", { includeDeleted: true }),
      ).toMatchObject({
        providerType: "local_model",
        query: "Compare the selected evidence.",
        sourceRecordIds: ["source-1"],
        proposedQuestion: "What changed?",
        proposedAction: "Record one observation.",
        disposition: "revised",
        annotation: "Keep the cited uncertainty.",
        deletedAt: "2026-08-17T12:06:00.000Z",
        revisionHistory: [
          { action: "generated" },
          { action: "revised" },
          { action: "deleted" },
        ],
      });
    } finally {
      target.close();
      await deleteQctpDatabase(targetName);
    }
  });
});
