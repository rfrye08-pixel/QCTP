import { z } from "zod";

import {
  AppSettingsSchema,
  CodexRecordSchema,
  FoundationStateSchema,
  QctpExportDataSchema,
  WorkbookStateSchema,
  createDefaultSettings,
  type CodexRecord,
  type DayCompletion,
  type RecordKind,
} from "../domain";

import type { QctpRepository } from "./repository";

export const REV1_LOCAL_STORAGE_KEY = "qctp-state";
export const REV1_MIGRATION_ID = "rev1-localstorage-qctp-state" as const;

interface StorageReader {
  getItem(key: string): string | null;
}

const UnknownObjectSchema = z.record(z.string(), z.unknown());

export interface ParsedRev1Payload {
  state: Record<string, unknown>;
  sourceSchema: string;
  wrapped: boolean;
}

export interface Rev1MigrationResult {
  status: "no_source" | "already_applied" | "migrated";
  fingerprint: string | null;
  ledgerId: string | null;
  importedEntityIds: string[];
  warnings: string[];
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function boundedNumber(
  value: unknown,
  minimum: number,
  maximum: number,
  fallback: number,
): number {
  return Math.max(minimum, Math.min(maximum, finiteNumber(value, fallback)));
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function normalizeTimestamp(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const timestamp = new Date(value);
  return Number.isNaN(timestamp.valueOf()) ? fallback : timestamp.toISOString();
}

export function fingerprintRev1Source(raw: string): string {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let index = 0; index < raw.length; index += 1) {
    hash ^= BigInt(raw.charCodeAt(index));
    hash = (hash * prime) & mask;
  }
  return hash.toString(16).padStart(16, "0");
}

export function parseRev1Payload(raw: unknown): ParsedRev1Payload {
  const value: unknown = typeof raw === "string" ? JSON.parse(raw) : raw;
  const root = UnknownObjectSchema.parse(value);
  if ("state" in root && isObject(root.state)) {
    return {
      state: UnknownObjectSchema.parse(root.state),
      sourceSchema: stringValue(root.schema, "qctp-training-state-v1-wrapper"),
      wrapped: true,
    };
  }
  return {
    state: root,
    sourceSchema: stringValue(root.schema, "qctp-state-rev1-unwrapped"),
    wrapped: false,
  };
}

function migrateCompletion(
  value: unknown,
  warnings: string[],
): Record<string, DayCompletion> {
  if (!isObject(value)) {
    if (value !== undefined)
      warnings.push(
        "Legacy done state was not an object; exact source remains in ledger.",
      );
    return {};
  }
  const completion: Record<string, DayCompletion> = {};
  for (const [day, raw] of Object.entries(value)) {
    if (!isObject(raw)) {
      warnings.push(`Legacy completion for day ${day} was not an object.`);
      continue;
    }
    completion[day] = {
      morning: booleanValue(raw.morning, false),
      midday: booleanValue(raw.midday, false),
      evening: booleanValue(raw.evening, false),
    };
  }
  return completion;
}

function migrateAnswers(
  value: unknown,
  warnings: string[],
): Record<string, Record<string, string>> {
  if (!isObject(value)) {
    if (value !== undefined)
      warnings.push(
        "Legacy answers were not an object; exact source remains in ledger.",
      );
    return {};
  }
  const answers: Record<string, Record<string, string>> = {};
  for (const [day, rawAnswers] of Object.entries(value)) {
    if (!isObject(rawAnswers)) {
      warnings.push(
        `Legacy workbook answers for day ${day} were not an object.`,
      );
      continue;
    }
    answers[day] = Object.fromEntries(
      Object.entries(rawAnswers).map(([prompt, answer]) => [
        prompt,
        typeof answer === "string" ? answer : JSON.stringify(answer),
      ]),
    );
  }
  return answers;
}

function legacyLogKind(type: string): RecordKind {
  const normalized = type.toLocaleLowerCase();
  if (normalized.includes("remote")) return "remote_viewing";
  if (normalized.includes("psionic")) return "psionics";
  if (normalized.includes("obe") || normalized.includes("focus 10"))
    return "obe";
  if (normalized.includes("dream")) return "dream";
  if (normalized.includes("synchronic")) return "synchronicity";
  if (normalized.includes("intuition") || normalized.includes("reception"))
    return "intuition";
  return "source_note";
}

function migrateLogs(
  value: unknown,
  fingerprint: string,
  now: string,
  warnings: string[],
): CodexRecord[] {
  if (!Array.isArray(value)) {
    if (value !== undefined)
      warnings.push(
        "Legacy logs were not an array; exact source remains in ledger.",
      );
    return [];
  }
  return value.flatMap((raw, index) => {
    if (!isObject(raw)) {
      warnings.push(`Legacy log ${index} was not an object.`);
      return [];
    }
    const text = stringValue(raw.text);
    if (!text) {
      warnings.push(`Legacy log ${index} did not contain text.`);
      return [];
    }
    const type = stringValue(raw.type, "Legacy Log");
    const timestamp = normalizeTimestamp(raw.timestamp, now);
    const id = `legacy-${fingerprint}-log-${String(index).padStart(4, "0")}`;
    return [
      CodexRecordSchema.parse({
        schemaVersion: 1,
        id,
        kind: legacyLogKind(type),
        title: type,
        createdAt: timestamp,
        updatedAt: timestamp,
        observation: {
          id: `${id}:observation`,
          text,
          capturedAt: timestamp,
          evidenceClass: "self_reported",
          provenance: {
            actor: "system",
            method: "rev1-localstorage-migration",
            provider: null,
            model: null,
          },
          sourceIds: [],
        },
        interpretation: null,
        tags: ["legacy-rev1"],
        backlinks: [],
        sourceLinks: [],
        attachmentIds: [],
        revisionIds: [],
        pathId: "foundation-path",
        sessionId: null,
        fields: {
          legacyType: type,
          legacyDay: raw.day ?? null,
          legacyIndex: index,
        },
        deletedAt: null,
      }),
    ];
  });
}

function migrateSettings(state: Record<string, unknown>, now: string) {
  const defaults = createDefaultSettings(now);
  const settings = isObject(state.settings) ? state.settings : {};
  return AppSettingsSchema.parse({
    ...defaults,
    guidanceMode: ["guided", "light", "minimal"].includes(
      stringValue(settings.mode),
    )
      ? settings.mode
      : defaults.guidanceMode,
    speechRate: boundedNumber(settings.rate, 0.5, 2, defaults.speechRate),
    voiceVolume: boundedNumber(settings.volume, 0, 1, defaults.voiceVolume),
    toneVolume: boundedNumber(settings.tone, 0, 1, defaults.toneVolume),
    speakPhaseTiming: booleanValue(settings.timing, defaults.speakPhaseTiming),
    selectedSystemVoice: stringValue(
      settings.voice,
      defaults.selectedSystemVoice,
    ),
    keepAwake: booleanValue(settings.keepAwake, defaults.keepAwake),
    testMode: booleanValue(state.test, defaults.testMode),
    neuralVoice: stringValue(settings.neuralVoice, defaults.neuralVoice),
    neuralEnabled: booleanValue(settings.neuralEnabled, defaults.neuralEnabled),
    transcriptionRoute: "local_only",
    updatedAt: now,
  });
}

export async function migrateRev1Payload(
  repository: QctpRepository,
  raw: string,
  sourceKey = REV1_LOCAL_STORAGE_KEY,
  now = new Date().toISOString(),
): Promise<Rev1MigrationResult> {
  const fingerprint = fingerprintRev1Source(raw);
  const existing = await repository.findMigrationByFingerprint(fingerprint);
  if (existing) {
    return {
      status: "already_applied",
      fingerprint,
      ledgerId: existing.id,
      importedEntityIds: existing.importedEntityIds,
      warnings: existing.warnings,
    };
  }
  const parsed = parseRev1Payload(raw);
  const warnings: string[] = [];
  const foundation = FoundationStateSchema.parse({
    schemaVersion: 1,
    id: "foundation",
    currentDay: Math.round(boundedNumber(parsed.state.currentDay, 1, 112, 1)),
    dayCount: 112,
    authoredDays: [1],
    completion: migrateCompletion(parsed.state.done, warnings),
    updatedAt: now,
  });
  const workbook = WorkbookStateSchema.parse({
    schemaVersion: 1,
    id: "workbook",
    answers: migrateAnswers(parsed.state.answers, warnings),
    updatedAt: now,
  });
  const settings = migrateSettings(parsed.state, now);
  const records = migrateLogs(parsed.state.logs, fingerprint, now, warnings);
  const importedEntityIds = [
    foundation.id,
    workbook.id,
    settings.id,
    ...records.map((record) => record.id),
  ];
  const ledger = {
    schemaVersion: 1 as const,
    id: `migration-rev1-${fingerprint}`,
    migrationId: REV1_MIGRATION_ID,
    sourceKey,
    sourceSchema: parsed.sourceSchema,
    sourceFingerprint: fingerprint,
    sourceSnapshotJson: raw,
    appliedAt: now,
    importedEntityIds,
    warnings,
  };
  const snapshot = QctpExportDataSchema.parse({
    schema: "qctp-export-v2",
    schemaVersion: 2,
    exportedAt: now,
    foundation,
    workbook,
    settings,
    records,
    recordings: [],
    transcripts: [],
    derivedNotes: [],
    attachments: [],
    revisions: [],
    paths: [],
    regSessions: [],
    transcriptionQueue: [],
    migrationLedger: [ledger],
  });
  await repository.importSnapshot(snapshot, { mode: "merge" });
  return {
    status: "migrated",
    fingerprint,
    ledgerId: ledger.id,
    importedEntityIds,
    warnings,
  };
}

export async function migrateRev1LocalStorage(
  repository: QctpRepository,
  storage: StorageReader = localStorage,
  key = REV1_LOCAL_STORAGE_KEY,
): Promise<Rev1MigrationResult> {
  const raw = storage.getItem(key);
  if (raw === null) {
    return {
      status: "no_source",
      fingerprint: null,
      ledgerId: null,
      importedEntityIds: [],
      warnings: [],
    };
  }
  return migrateRev1Payload(repository, raw, key);
}
