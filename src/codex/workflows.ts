import {
  CodexRecordSchema,
  DerivedNoteSchema,
  userProvenance,
  type CodexRecord,
  type DerivedNote,
  type RecordKind,
  type SourceLink,
} from "../domain";

export const codexDestinations = [
  { value: "unclassified", label: "Unclassified inbox", pathId: null },
  { value: "codex", label: "Codex library", pathId: null },
  { value: "workbook", label: "Today workbook", pathId: "foundation-path" },
  { value: "dream", label: "Dream journal", pathId: null },
  { value: "synchronicity", label: "Synchronicity log", pathId: null },
  { value: "intuition", label: "Intuition log", pathId: null },
  { value: "obe", label: "OBE log", pathId: null },
  { value: "remote_viewing", label: "Remote viewing log", pathId: null },
  { value: "psionics", label: "Psionics log", pathId: null },
  { value: "mirror", label: "Mirror journal", pathId: null },
  { value: "source_note", label: "Source notes", pathId: null },
  { value: "integration", label: "Integration log", pathId: null },
  { value: "question", label: "Question inbox", pathId: null },
  { value: "studio", label: "Studio / REG path", pathId: "reg-path" },
  {
    value: "foundation",
    label: "112-Day Foundation",
    pathId: "foundation-path",
  },
  {
    value: "reg",
    label: "Robert Edward Grant path",
    pathId: "reg-path",
  },
  { value: "lab", label: "Lab", pathId: null },
] as const;

export type CodexDestination = (typeof codexDestinations)[number]["value"];

export interface SourceLinkDraft {
  id: string | null;
  label: string;
  sourceType: SourceLink["sourceType"];
  url: string;
  citation: string;
  accessedAt: string | null;
}

export interface CodexRecordDraft {
  title: string;
  kind: RecordKind;
  destination: CodexDestination;
  observation: string;
  interpretation: string;
  tags: string;
  sourceLinks: SourceLinkDraft[];
}

export interface DerivedNoteDraft {
  id: string | null;
  title: string;
  cleanText: string;
  suggestedTags: string;
  acceptedTags: string;
}

export function parseTags(value: string): string[] {
  const seen = new Set<string>();
  return value
    .split(/[\n,]/u)
    .map((tag) => tag.trim())
    .filter((tag) => {
      const key = tag.toLocaleLowerCase();
      if (!tag || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export function tagsToText(tags: readonly string[]): string {
  return tags.join(", ");
}

function recordDestination(record: CodexRecord): CodexDestination {
  const stored = record.fields.destination;
  if (
    typeof stored === "string" &&
    codexDestinations.some((destination) => destination.value === stored)
  ) {
    return stored as CodexDestination;
  }
  if (record.pathId === "foundation-path") return "foundation";
  if (record.pathId === "reg-path") return "reg";
  if (record.kind === "lab_protocol" || record.kind === "lab_result") {
    return "lab";
  }
  const kindDestination = codexDestinations.find(
    (destination) => destination.value === record.kind,
  );
  return kindDestination?.value ?? "codex";
}

export function draftFromRecord(record?: CodexRecord): CodexRecordDraft {
  return {
    title: record?.title ?? "",
    kind: record?.kind ?? "integration",
    destination: record ? recordDestination(record) : "codex",
    observation: record?.observation?.text ?? "",
    interpretation: record?.interpretation?.text ?? "",
    tags: tagsToText(record?.tags ?? []),
    sourceLinks:
      record?.sourceLinks.map((source) => ({
        id: source.id,
        label: source.label,
        sourceType: source.sourceType,
        url: source.url ?? "",
        citation: source.citation ?? "",
        accessedAt: source.accessedAt,
      })) ?? [],
  };
}

export function buildRecord(
  draft: CodexRecordDraft,
  existing: CodexRecord | null,
  now: string,
  makeId: (prefix: string) => string,
): CodexRecord {
  const title = draft.title.trim();
  const observationText = draft.observation.trim();
  const interpretationText = draft.interpretation.trim();
  if (!title) throw new Error("A record title is required.");
  if (interpretationText && !observationText) {
    throw new Error(
      "Add a raw observation before attaching an interpretation to it.",
    );
  }

  const id = existing?.id ?? makeId("codex-record");
  const observationId =
    existing?.observation?.id ?? `${id}:observation:${makeId("layer")}`;
  const destination = codexDestinations.find(
    (candidate) => candidate.value === draft.destination,
  );
  if (!destination) throw new Error("Select a valid Codex destination.");

  const sourceLinks = draft.sourceLinks
    .filter(
      (source) =>
        source.label.trim() || source.url.trim() || source.citation.trim(),
    )
    .map((source) => ({
      id: source.id ?? makeId("source"),
      label: source.label.trim(),
      sourceType: source.sourceType,
      url: source.url.trim() || null,
      citation: source.citation.trim() || null,
      accessedAt: source.accessedAt ?? now,
    }));

  return CodexRecordSchema.parse({
    schemaVersion: 1,
    id,
    kind: draft.kind,
    title,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    observation: observationText
      ? {
          id: observationId,
          text: observationText,
          capturedAt: existing?.observation?.capturedAt ?? now,
          evidenceClass:
            existing?.observation?.evidenceClass ?? "self_reported",
          provenance: {
            ...userProvenance,
            method: existing?.observation
              ? "direct-observation-edit"
              : "direct-observation-entry",
          },
          sourceIds: sourceLinks.map((source) => source.id),
        }
      : null,
    interpretation: interpretationText
      ? {
          id: existing?.interpretation?.id ?? makeId("interpretation"),
          text: interpretationText,
          authoredAt: now,
          provenance: {
            ...userProvenance,
            method: existing?.interpretation
              ? "direct-interpretation-edit"
              : "direct-interpretation-entry",
          },
          basedOnEvidenceIds: [observationId],
        }
      : null,
    tags: parseTags(draft.tags),
    backlinks: existing?.backlinks ?? [],
    sourceLinks,
    attachmentIds: existing?.attachmentIds ?? [],
    revisionIds: existing?.revisionIds ?? [],
    pathId: destination.pathId,
    sessionId: existing?.sessionId ?? null,
    fields: {
      ...(existing?.fields ?? {}),
      destination: draft.destination,
    },
    deletedAt: null,
  });
}

export function draftFromDerivedNote(
  note: DerivedNote | null,
  fallbackTitle: string,
): DerivedNoteDraft {
  return {
    id: note?.id ?? null,
    title: note?.title ?? `${fallbackTitle} — clean note`,
    cleanText: note?.cleanText ?? "",
    suggestedTags: tagsToText(note?.suggestedTags ?? []),
    acceptedTags: tagsToText(note?.acceptedTags ?? []),
  };
}

export function buildDerivedNote(
  draft: DerivedNoteDraft,
  transcriptId: string,
  existing: DerivedNote | null,
  now: string,
  makeId: (prefix: string) => string,
): DerivedNote {
  if (!draft.title.trim()) throw new Error("A clean-note title is required.");
  if (existing && existing.transcriptId !== transcriptId) {
    throw new Error("A clean note cannot be moved to another transcript.");
  }
  const acceptedTags = parseTags(draft.acceptedTags);
  const acceptedKeys = new Set(
    acceptedTags.map((tag) => tag.toLocaleLowerCase()),
  );
  const suggestedTags = parseTags(draft.suggestedTags).filter(
    (tag) => !acceptedKeys.has(tag.toLocaleLowerCase()),
  );
  return DerivedNoteSchema.parse({
    schemaVersion: 1,
    id: existing?.id ?? makeId("derived-note"),
    transcriptId,
    title: draft.title.trim(),
    cleanText: draft.cleanText,
    suggestedTags,
    acceptedTags,
    questions: existing?.questions ?? [],
    actionItems: existing?.actionItems ?? [],
    provenance: {
      ...userProvenance,
      method: existing ? "user-edited-clean-note" : "direct-clean-note",
    },
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  });
}

export function acceptSuggestedTag(
  draft: DerivedNoteDraft,
  tag: string,
): DerivedNoteDraft {
  const acceptedTags = parseTags(`${draft.acceptedTags},${tag}`);
  const acceptedKeys = new Set(
    acceptedTags.map((value) => value.toLocaleLowerCase()),
  );
  const suggestedTags = parseTags(draft.suggestedTags).filter(
    (value) => !acceptedKeys.has(value.toLocaleLowerCase()),
  );
  return {
    ...draft,
    suggestedTags: tagsToText(suggestedTags),
    acceptedTags: tagsToText(acceptedTags),
  };
}
