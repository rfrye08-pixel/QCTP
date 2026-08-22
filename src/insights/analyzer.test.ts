import { CodexRecordSchema, type CodexRecord } from "../domain";
import { describe, expect, it } from "vitest";

import { analyzeLocalMirror, filterLocalInsightRecords } from "./analyzer";

function makeRecord(
  id: string,
  overrides: Partial<CodexRecord> = {},
): CodexRecord {
  const createdAt = overrides.createdAt ?? "2026-08-01T12:00:00.000Z";
  return CodexRecordSchema.parse({
    schemaVersion: 1,
    id,
    kind: "mirror",
    title: `Record ${id}`,
    createdAt,
    updatedAt: createdAt,
    observation: {
      id: `${id}:observation`,
      text: "Observation",
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
    ...overrides,
  });
}

describe("local deterministic Mirror analysis", () => {
  const records = [
    makeRecord("record-1", {
      title: "Oak practice",
      createdAt: "2026-08-01T08:00:00.000Z",
      updatedAt: "2026-08-01T08:00:00.000Z",
      observation: {
        id: "record-1:observation",
        text: "Met Alice at the oak on 2026-08-01. Oak.",
        capturedAt: "2026-08-01T08:00:00.000Z",
        evidenceClass: "self_reported",
        provenance: {
          actor: "user",
          method: "test",
          provider: null,
          model: null,
        },
        sourceIds: [],
      },
      interpretation: {
        id: "record-1:interpretation",
        text: "I value patient practice.",
        authoredAt: "2026-08-01T08:01:00.000Z",
        provenance: {
          actor: "user",
          method: "test",
          provider: null,
          model: null,
        },
        basedOnEvidenceIds: ["record-1:observation"],
      },
      tags: [
        "theme:Patience",
        "symbol:Oak",
        "practice:coherence",
        "source-track:foundation",
      ],
      backlinks: [{ recordId: "record-2", relationship: "continues" }],
      sourceLinks: [
        {
          id: "person-source",
          label: "Robert Edward Grant",
          sourceType: "person",
          url: null,
          citation: null,
          accessedAt: null,
        },
      ],
      fields: {
        themes: ["Practice"],
        symbol: "Oak",
        person: "Alice",
        intention: "Practice slowly",
        action: "I practiced slowly",
        outcome: "Practice became calm",
        actions: ["Log evidence"],
        trigger: "meeting",
        state: "focused",
        sleepHours: 7,
      },
    }),
    makeRecord("record-2", {
      kind: "dream",
      title: "Circle return",
      createdAt: "2026-08-02T10:00:00.000Z",
      updatedAt: "2026-08-02T10:00:00.000Z",
      observation: {
        id: "record-2:observation",
        text: "Alice returned on 2026-08-02.",
        capturedAt: "2026-08-02T10:00:00.000Z",
        evidenceClass: "self_reported",
        provenance: {
          actor: "user",
          method: "test",
          provider: null,
          model: null,
        },
        sourceIds: [],
      },
      tags: [
        "theme:patience",
        "symbol:circle",
        "symbol:oak",
        "person:Alice",
        "practice:coherence",
        "source-track:foundation",
      ],
      backlinks: [{ recordId: "missing-record", relationship: "references" }],
      sourceLinks: [
        {
          id: "book-source",
          label: "Notebook",
          sourceType: "book",
          url: null,
          citation: "p. 2",
          accessedAt: null,
        },
      ],
      fields: {
        action: "Returned to practice",
        actions: ["Log evidence"],
        outcome: "Not recorded",
        trigger: "meeting",
        emotion: "calm",
        sleepQuality: "rested",
      },
    }),
    makeRecord("record-deleted", {
      deletedAt: "2026-08-03T00:00:00.000Z",
      tags: ["theme:must-not-count"],
    }),
  ];

  it("counts only explicit evidence and exposes its deterministic mode", () => {
    const result = analyzeLocalMirror(records);

    expect(result.mode).toBe("deterministic-local");
    expect(result.recordCount).toBe(2);
    expect(result.matchedRecordIds).toEqual(["record-2", "record-1"]);
    expect(result.observationWordCount).toBe(10);
    expect(result.interpretationWordCount).toBe(4);
    expect(result.totalWordCount).toBe(14);
    expect(result.topWords.find((item) => item.value === "alice")).toEqual({
      value: "alice",
      count: 2,
      recordIds: ["record-1", "record-2"],
    });
    expect(result.recurringTerms.map((item) => item.value)).toEqual([
      "alice",
      "oak",
    ]);
    expect(
      result.tags.find((item) => item.value === "theme:patience")?.count,
    ).toBe(2);
    expect(result.themes.map((item) => [item.value, item.count])).toEqual([
      ["patience", 2],
      ["practice", 1],
    ]);
    expect(result.symbols.map((item) => [item.value, item.count])).toEqual([
      ["oak", 2],
      ["circle", 1],
    ]);
    expect(result.recurringSymbols.map((item) => item.value)).toEqual(["oak"]);
    expect(result.people).toEqual([
      { value: "alice", count: 2, recordIds: ["record-1", "record-2"] },
      {
        value: "robert edward grant",
        count: 1,
        recordIds: ["record-1"],
      },
    ]);
    expect(result.dateReferences.map((item) => item.value)).toEqual([
      "2026-08-01",
      "2026-08-02",
    ]);
    expect(result.practices[0]).toMatchObject({
      value: "coherence",
      count: 2,
    });
    expect(result.sourceTracks[0]).toMatchObject({
      value: "foundation",
      count: 2,
    });
    expect(result.repeatedTriggers[0]).toMatchObject({
      value: "meeting",
      count: 2,
    });
    expect(result.repeatedActions[0]).toMatchObject({
      value: "log evidence",
      count: 2,
    });
  });

  it("builds chronological time series and exact lexical comparisons", () => {
    const result = analyzeLocalMirror(records);

    expect(result.timeSeries).toEqual([
      {
        date: "2026-08-01",
        recordIds: ["record-1"],
        recordCount: 1,
        observationWordCount: 7,
        interpretationWordCount: 4,
      },
      {
        date: "2026-08-02",
        recordIds: ["record-2"],
        recordCount: 1,
        observationWordCount: 3,
        interpretationWordCount: 0,
      },
    ]);
    expect(result.intentionActionOutcomes[0]).toMatchObject({
      recordId: "record-2",
      intention: null,
      action: "Returned to practice",
      outcome: "Not recorded",
    });
    expect(result.intentionActionOutcomes[1]).toMatchObject({
      recordId: "record-1",
      sharedIntentionActionTerms: ["slowly"],
      sharedActionOutcomeTerms: [],
      sharedIntentionOutcomeTerms: ["practice"],
    });
    expect(result.trends.state).toEqual([
      {
        date: "2026-08-01",
        values: [{ value: "focused", count: 1, recordIds: ["record-1"] }],
      },
      {
        date: "2026-08-02",
        values: [{ value: "calm", count: 1, recordIds: ["record-2"] }],
      },
    ]);
    expect(result.trends.sleep.map((point) => point.values[0]?.value)).toEqual([
      "7",
      "rested",
    ]);
  });

  it("measures source/backlink topology against the complete local record set", () => {
    const result = analyzeLocalMirror(records, { kinds: ["dream"] });

    expect(result.links).toMatchObject({
      backlinkCount: 1,
      sourceLinkCount: 1,
      recordsWithBacklinks: 1,
      recordsWithSourceLinks: 1,
      unresolvedBacklinkCount: 1,
      selfBacklinkCount: 0,
    });
    expect(result.links.backlinksByRelationship[0]).toEqual({
      value: "references",
      count: 1,
      recordIds: ["record-2"],
    });
    expect(result.links.sourceLinksByType[0]?.value).toBe("book");
  });

  it("applies conjunctive text, inclusive date, and kind filters", () => {
    expect(
      filterLocalInsightRecords(records, {
        query: "alice oak",
        fromDate: "2026-08-01",
        toDate: "2026-08-01",
        kinds: ["mirror"],
        themes: ["patience"],
        symbols: ["oak"],
        people: ["alice"],
        practices: ["coherence"],
        sourceTracks: ["foundation"],
      }).map((record) => record.id),
    ).toEqual(["record-1"]);
    expect(
      filterLocalInsightRecords(records, {
        query: "not-present",
        fromDate: "invalid",
      }),
    ).toEqual([]);
  });

  it("does not invent entities from free text or accept impossible dates", () => {
    const result = analyzeLocalMirror([
      makeRecord("literal-only", {
        observation: {
          id: "literal-only:observation",
          text: "I spoke to Morgan beside a spiral on 2026-02-30.",
          capturedAt: "2026-08-01T12:00:00.000Z",
          evidenceClass: "self_reported",
          provenance: {
            actor: "user",
            method: "test",
            provider: null,
            model: null,
          },
          sourceIds: [],
        },
      }),
    ]);

    expect(result.people).toEqual([]);
    expect(result.symbols).toEqual([]);
    expect(result.dateReferences).toEqual([]);
  });
});
