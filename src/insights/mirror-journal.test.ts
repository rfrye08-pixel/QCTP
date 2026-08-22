import { buildMirrorJournalRecord } from "./mirror-journal";
import { CodexRecordSchema } from "../domain";
import { describe, expect, it } from "vitest";

const source = CodexRecordSchema.parse({
  schemaVersion: 1,
  id: "source-1",
  kind: "dream",
  title: "Source dream",
  createdAt: "2026-08-16T08:00:00.000Z",
  updatedAt: "2026-08-16T08:00:00.000Z",
  observation: null,
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
});

describe("structured Mirror Journal", () => {
  it("keeps the event evidence separate from reflective interpretation", () => {
    const record = buildMirrorJournalRecord({
      id: "mirror-journal-1",
      title: "A difficult exchange",
      createdAt: "2026-08-17T12:00:00.000Z",
      fields: {
        event: "The meeting ended before I answered.",
        emotion: "Frustrated",
        judgment: "I assumed there was no time for me.",
        qualityOrValue: "Patience",
        selfReflection: "I interrupted twice.",
        alternativeResponse: "Ask for one minute to finish.",
        action: "Sent a concise follow-up.",
        outcome: "A second meeting was scheduled.",
      },
      tags: ["work", "Patience", "work"],
      sourceRecords: [source, source],
    });

    expect(record.kind).toBe("mirror");
    expect(record.observation?.text).toBe(
      "The meeting ended before I answered.",
    );
    expect(record.observation?.provenance).toMatchObject({
      actor: "user",
      method: "mirror-journal-event-form",
    });
    expect(record.interpretation?.text).not.toContain(
      "The meeting ended before I answered.",
    );
    expect(record.interpretation?.text).toContain(
      "Judgment: I assumed there was no time for me.",
    );
    expect(record.interpretation?.basedOnEvidenceIds).toEqual([
      "mirror-journal-1:observation",
    ]);
    expect(record.fields).toMatchObject({
      journalSchema: "qctp-mirror-journal-v1",
      emotion: "Frustrated",
      qualityOrValue: "Patience",
      action: "Sent a concise follow-up.",
      outcome: "A second meeting was scheduled.",
    });
    expect(record.tags).toEqual(["mirror-journal", "work", "Patience"]);
    expect(record.backlinks).toEqual([
      { recordId: "source-1", relationship: "mirror_journal_source" },
    ]);
    expect(record.sourceLinks).toEqual([
      {
        id: "mirror-journal-1:source:1",
        label: "Source dream",
        sourceType: "qctp_record",
        url: null,
        citation: "source-1",
        accessedAt: "2026-08-17T12:00:00.000Z",
      },
    ]);
  });

  it("uses a dated title and permits observation-only journal evidence", () => {
    const record = buildMirrorJournalRecord({
      id: "mirror-journal-2",
      createdAt: "2026-08-17T12:00:00.000Z",
      fields: {
        event: "  A light changed.  ",
        emotion: "",
        judgment: "",
        qualityOrValue: "",
        selfReflection: "",
        alternativeResponse: "",
        action: "",
        outcome: "",
      },
    });

    expect(record.title).toBe("Mirror Journal — 2026-08-17");
    expect(record.observation?.text).toBe("A light changed.");
    expect(record.interpretation).toBeNull();
  });

  it("rejects a journal without raw event evidence", () => {
    expect(() =>
      buildMirrorJournalRecord({
        id: "mirror-journal-3",
        createdAt: "2026-08-17T12:00:00.000Z",
        fields: {
          event: "   ",
          emotion: "Calm",
          judgment: "",
          qualityOrValue: "",
          selfReflection: "",
          alternativeResponse: "",
          action: "",
          outcome: "",
        },
      }),
    ).toThrow("A raw event observation is required.");
  });
});
