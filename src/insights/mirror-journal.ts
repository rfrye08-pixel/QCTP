import { CodexRecordSchema, type CodexRecord } from "../domain";

export interface MirrorJournalFields {
  event: string;
  emotion: string;
  judgment: string;
  qualityOrValue: string;
  selfReflection: string;
  alternativeResponse: string;
  action: string;
  outcome: string;
}

export interface BuildMirrorJournalInput {
  id: string;
  title?: string;
  createdAt: string;
  fields: MirrorJournalFields;
  tags?: readonly string[];
  sourceRecords?: readonly CodexRecord[];
}

function trimmed(value: string): string {
  return value.trim();
}

function interpretationText(fields: MirrorJournalFields): string {
  const entries: Array<readonly [string, string]> = [
    ["Judgment", fields.judgment],
    ["Quality / value", fields.qualityOrValue],
    ["Self-reflection", fields.selfReflection],
    ["Alternative response", fields.alternativeResponse],
  ];
  return entries
    .filter(([, value]) => trimmed(value).length > 0)
    .map(([label, value]) => `${label}: ${trimmed(value)}`)
    .join("\n\n");
}

function normalizedTags(tags: readonly string[]): string[] {
  const result = new Map<string, string>();
  for (const tag of ["mirror-journal", ...tags]) {
    const value = trimmed(tag).slice(0, 80);
    if (value) result.set(value.toLocaleLowerCase(), value);
  }
  return [...result.values()];
}

export function buildMirrorJournalRecord(
  input: BuildMirrorJournalInput,
): CodexRecord {
  const event = trimmed(input.fields.event);
  if (!event) throw new Error("A raw event observation is required.");

  const sourceRecords = [...(input.sourceRecords ?? [])].filter(
    (record, index, records) =>
      records.findIndex((candidate) => candidate.id === record.id) === index,
  );
  const interpretation = interpretationText(input.fields);
  const observationId = `${input.id}:observation`;
  return CodexRecordSchema.parse({
    schemaVersion: 1,
    id: input.id,
    kind: "mirror",
    title:
      trimmed(input.title ?? "") ||
      `Mirror Journal — ${input.createdAt.slice(0, 10)}`,
    createdAt: input.createdAt,
    updatedAt: input.createdAt,
    observation: {
      id: observationId,
      text: event,
      capturedAt: input.createdAt,
      evidenceClass: "self_reported",
      provenance: {
        actor: "user",
        method: "mirror-journal-event-form",
        provider: null,
        model: null,
      },
      sourceIds: sourceRecords.map((record) => record.id),
    },
    interpretation: interpretation
      ? {
          id: `${input.id}:interpretation`,
          text: interpretation,
          authoredAt: input.createdAt,
          provenance: {
            actor: "user",
            method: "mirror-journal-reflection-form",
            provider: null,
            model: null,
          },
          basedOnEvidenceIds: [observationId],
        }
      : null,
    tags: normalizedTags(input.tags ?? []),
    backlinks: sourceRecords.map((record) => ({
      recordId: record.id,
      relationship: "mirror_journal_source",
    })),
    sourceLinks: sourceRecords.map((record, index) => ({
      id: `${input.id}:source:${index + 1}`,
      label: record.title,
      sourceType: "qctp_record",
      url: null,
      citation: record.id,
      accessedAt: input.createdAt,
    })),
    attachmentIds: [],
    revisionIds: [],
    pathId: null,
    sessionId: null,
    fields: {
      journalSchema: "qctp-mirror-journal-v1",
      emotion: trimmed(input.fields.emotion),
      judgment: trimmed(input.fields.judgment),
      qualityOrValue: trimmed(input.fields.qualityOrValue),
      selfReflection: trimmed(input.fields.selfReflection),
      alternativeResponse: trimmed(input.fields.alternativeResponse),
      action: trimmed(input.fields.action),
      outcome: trimmed(input.fields.outcome),
    },
    deletedAt: null,
  });
}
