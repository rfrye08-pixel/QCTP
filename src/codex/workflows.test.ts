import { describe, expect, it } from "vitest";

import { CodexRecordSchema, DerivedNoteSchema } from "../domain";
import {
  acceptSuggestedTag,
  buildDerivedNote,
  buildRecord,
  draftFromDerivedNote,
  draftFromRecord,
  parseTags,
} from "./workflows";

const now = "2026-08-17T12:00:00.000Z";
let nextId = 0;
const makeId = (prefix: string) => `${prefix}-${String(++nextId)}`;

describe("Codex record workflows", () => {
  it("normalizes case-insensitive duplicate tags", () => {
    expect(parseTags("Voice, insight\nvoice,   study")).toEqual([
      "Voice",
      "insight",
      "study",
    ]);
  });

  it("builds separate observation and interpretation layers", () => {
    const record = buildRecord(
      {
        ...draftFromRecord(),
        title: "Direct observation",
        kind: "synchronicity",
        destination: "foundation",
        observation: "Three lights appeared in sequence.",
        interpretation: "The sequence may be personally meaningful.",
        tags: "light, sequence",
        sourceLinks: [
          {
            id: null,
            label: "Field log",
            sourceType: "url",
            url: "https://example.test/field-log",
            citation: "Entry 12",
            accessedAt: null,
          },
        ],
      },
      null,
      now,
      makeId,
    );

    expect(CodexRecordSchema.parse(record)).toEqual(record);
    expect(record.pathId).toBe("foundation-path");
    expect(record.observation?.text).toContain("Three lights");
    expect(record.interpretation?.text).toContain("may be");
    expect(record.interpretation?.basedOnEvidenceIds).toEqual([
      record.observation?.id,
    ]);
    expect(record.sourceLinks[0]?.url).toBe("https://example.test/field-log");
  });

  it("refuses an interpretation without raw observation evidence", () => {
    expect(() =>
      buildRecord(
        {
          ...draftFromRecord(),
          title: "Unsupported interpretation",
          interpretation: "A claim without evidence",
        },
        null,
        now,
        makeId,
      ),
    ).toThrow(/raw observation/u);
  });

  it("edits a record without replacing its identity", () => {
    const initial = buildRecord(
      { ...draftFromRecord(), title: "First", observation: "Raw" },
      null,
      now,
      makeId,
    );
    const edited = buildRecord(
      { ...draftFromRecord(initial), title: "Renamed", kind: "dream" },
      initial,
      "2026-08-17T13:00:00.000Z",
      makeId,
    );
    expect(edited.id).toBe(initial.id);
    expect(edited.createdAt).toBe(initial.createdAt);
    expect(edited.title).toBe("Renamed");
    expect(edited.observation?.id).toBe(initial.observation?.id);
  });
});

describe("Codex clean-note workflows", () => {
  it("moves an accepted suggestion while retaining transcript linkage", () => {
    const accepted = acceptSuggestedTag(
      {
        ...draftFromDerivedNote(null, "Session"),
        suggestedTags: "geometry, insight",
      },
      "geometry",
    );
    const note = buildDerivedNote(
      { ...accepted, cleanText: "A clear account." },
      "transcript-1",
      null,
      now,
      makeId,
    );

    expect(DerivedNoteSchema.parse(note)).toEqual(note);
    expect(note.transcriptId).toBe("transcript-1");
    expect(note.acceptedTags).toEqual(["geometry"]);
    expect(note.suggestedTags).toEqual(["insight"]);
  });

  it("refuses to move an existing note to a different transcript", () => {
    const note = buildDerivedNote(
      {
        ...draftFromDerivedNote(null, "Session"),
        cleanText: "Clean",
      },
      "transcript-1",
      null,
      now,
      makeId,
    );
    expect(() =>
      buildDerivedNote(
        draftFromDerivedNote(note, "Session"),
        "transcript-2",
        note,
        now,
        makeId,
      ),
    ).toThrow(/cannot be moved/u);
  });
});
