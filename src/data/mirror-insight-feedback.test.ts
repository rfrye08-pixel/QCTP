import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CodexRecordSchema } from "../domain";
import { exportJson, importJson } from "../export-import";

import { deleteQctpDatabase } from "./db";
import { createQctpRepository, type QctpRepository } from "./repository";

const now = "2026-08-17T12:00:00.000Z";

describe("deterministic Mirror insight feedback", () => {
  const databaseNames: string[] = [];
  let repository: QctpRepository;

  beforeEach(async () => {
    const name = `mirror-insight-feedback-${crypto.randomUUID()}`;
    databaseNames.push(name);
    repository = await createQctpRepository({ name });
    await repository.saveRecord(
      CodexRecordSchema.parse({
        schemaVersion: 1,
        id: "source-1",
        kind: "mirror",
        title: "Unchanged source",
        createdAt: now,
        updatedAt: now,
        observation: null,
        interpretation: null,
        tags: ["symbol:circle"],
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
  });

  afterEach(async () => {
    repository.close();
    await Promise.all(
      databaseNames.splice(0).map((name) => deleteQctpDatabase(name)),
    );
  });

  it("accepts, annotates, corrects, and dismisses an insight without mutating its source", async () => {
    const sourceBefore = await repository.getRecord("source-1");
    const base = {
      insightKey: "symbol:circle",
      kind: "symbol" as const,
      label: "circle appears in one record",
      sourceRecordIds: ["source-1"],
    };
    const accepted = await repository.reviewMirrorInsight(
      { ...base, action: "accepted" },
      now,
    );
    expect(accepted.disposition).toBe("accepted");

    const annotated = await repository.reviewMirrorInsight(
      {
        ...base,
        action: "annotated",
        annotation: "This was a geometry exercise, not a dream symbol.",
      },
      "2026-08-17T12:01:00.000Z",
    );
    expect(annotated.disposition).toBe("accepted");
    expect(annotated.annotation).toContain("geometry exercise");

    const corrected = await repository.reviewMirrorInsight(
      {
        ...base,
        action: "corrected",
        correction: "Classify this occurrence as constructed geometry.",
      },
      "2026-08-17T12:02:00.000Z",
    );
    expect(corrected.disposition).toBe("corrected");
    expect(corrected.revisionHistory).toHaveLength(3);

    const dismissed = await repository.reviewMirrorInsight(
      { ...base, action: "dismissed" },
      "2026-08-17T12:03:00.000Z",
    );
    expect(dismissed.disposition).toBe("dismissed");
    expect(await repository.getRecord("source-1")).toEqual(sourceBefore);
  });

  it("rejects unsupported feedback and preserves the exact source links in export/import", async () => {
    await expect(
      repository.reviewMirrorInsight({
        insightKey: "term:missing",
        kind: "term",
        label: "missing",
        sourceRecordIds: ["not-present"],
        action: "accepted",
      }),
    ).rejects.toThrow("missing or deleted");
    await expect(
      repository.reviewMirrorInsight({
        insightKey: "symbol:circle",
        kind: "symbol",
        label: "circle",
        sourceRecordIds: ["source-1"],
        action: "corrected",
        correction: "",
      }),
    ).rejects.toThrow("needs correction text");

    await repository.reviewMirrorInsight({
      insightKey: "symbol:circle",
      kind: "symbol",
      label: "circle",
      sourceRecordIds: ["source-1"],
      action: "accepted",
    });
    const targetName = `mirror-insight-target-${crypto.randomUUID()}`;
    databaseNames.push(targetName);
    const target = await createQctpRepository({ name: targetName });
    try {
      await importJson(target, await exportJson(repository), {
        mode: "replace",
      });
      expect(
        await target.getMirrorInsightFeedback("symbol:circle"),
      ).toMatchObject({
        disposition: "accepted",
        sourceRecordIds: ["source-1"],
        revisionHistory: [{ sourceRecordIds: ["source-1"] }],
      });
    } finally {
      target.close();
    }
  });

  it("tombstones, restores, and permanently purges feedback without mutating its exact source", async () => {
    const feedback = await repository.reviewMirrorInsight(
      {
        insightKey: "symbol:circle",
        kind: "symbol",
        label: "circle",
        sourceRecordIds: ["source-1"],
        action: "corrected",
        correction: "This is constructed geometry.",
      },
      now,
    );
    const sourceBefore = await repository.getRecord("source-1");

    const deleted = await repository.deleteMirrorInsightFeedback(
      feedback.id,
      "2026-08-17T12:01:00.000Z",
    );
    expect(deleted).toMatchObject({
      deletedAt: "2026-08-17T12:01:00.000Z",
      correction: "This is constructed geometry.",
      sourceRecordIds: ["source-1"],
    });
    expect(deleted.revisionHistory.at(-1)?.action).toBe("deleted");
    expect(await repository.listMirrorInsightFeedback()).toEqual([]);
    expect(
      await repository.listMirrorInsightFeedback({ includeDeleted: true }),
    ).toHaveLength(1);
    await expect(
      repository.reviewMirrorInsight({
        insightKey: "symbol:circle",
        kind: "symbol",
        label: "circle",
        sourceRecordIds: ["source-1"],
        action: "accepted",
      }),
    ).rejects.toThrow("must be restored");

    const restored = await repository.restoreMirrorInsightFeedback(
      feedback.id,
      "2026-08-17T12:02:00.000Z",
    );
    expect(restored.deletedAt).toBeNull();
    expect(restored.revisionHistory.at(-1)?.action).toBe("restored");
    expect(await repository.getRecord("source-1")).toEqual(sourceBefore);

    await expect(
      repository.purgeMirrorInsightFeedback(feedback.id),
    ).rejects.toThrow("must be tombstoned");
    expect(
      await repository.getMirrorInsightFeedback("symbol:circle"),
    ).toBeDefined();

    await repository.deleteMirrorInsightFeedback(
      feedback.id,
      "2026-08-17T12:03:00.000Z",
    );
    await expect(
      repository.purgeMirrorInsightFeedback(feedback.id),
    ).resolves.toBe(feedback.id);
    expect(
      await repository.getMirrorInsightFeedback("symbol:circle", {
        includeDeleted: true,
      }),
    ).toBeUndefined();
    await expect(repository.deleteRecord("source-1")).resolves.toBeUndefined();

    const exported = await exportJson(repository);
    expect(JSON.parse(exported)).toMatchObject({
      records: [],
      mirrorInsightFeedback: [],
    });
    const targetName = `mirror-insight-purge-target-${crypto.randomUUID()}`;
    databaseNames.push(targetName);
    const target = await createQctpRepository({ name: targetName });
    try {
      await importJson(target, exported, { mode: "replace" });
      expect(
        await target.listMirrorInsightFeedback({ includeDeleted: true }),
      ).toEqual([]);
      expect(await target.getRecord("source-1")).toBeUndefined();
    } finally {
      target.close();
    }
  });
});
