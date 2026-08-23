import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createReg01Session,
  PracticeSessionSchema,
  type Attachment,
  type CodexRecord,
  type QctpExportData,
  type VoiceRecording,
} from "../domain";
import { createQctpRepository, deleteQctpDatabase } from "../data";
import type { QctpRepository } from "../data";

import {
  QctpImportError,
  exportArchive,
  exportJson,
  importArchive,
  importJson,
  parseQctpJson,
  validateExportRelations,
} from "./index";

const now = "2026-08-17T12:00:00.000Z";
let sourceName: string;
let targetName: string;
let source: QctpRepository;
let target: QctpRepository;

async function testBlob(value: string, type: string): Promise<Blob> {
  return new Response(value, { headers: { "content-type": type } }).blob();
}

function createRecording(): VoiceRecording {
  return {
    schemaVersion: 1,
    id: "recording-archive",
    createdAt: now,
    updatedAt: now,
    acceptedAt: now,
    durationMs: 1_000,
    mimeType: "audio/webm",
    sizeBytes: 0,
    localBlobRef: "recording-archive",
    remoteObjectRef: null,
    destinationType: "codex",
    destinationId: null,
    status: "LOCAL_ONLY",
    segments: [
      {
        id: "segment-archive",
        sequence: 0,
        startedAt: now,
        endedAt: now,
        durationMs: 1_000,
        mimeType: "audio/webm",
        sizeBytes: 0,
        chunkIds: [],
      },
    ],
    captureMode: "auto-dictation",
    requestedDurationMs: 300_000,
    captureContext: { type: "global" },
    completedByDurationLimit: false,
    transcriptionRoute: "local_only",
    provider: null,
    model: null,
    checksumSha256: null,
    retentionPolicy: "keep",
    failureCode: null,
    failureMessage: null,
    deletedAt: null,
  };
}

function createDebriefPracticeSession(id: string, recordId: string) {
  return PracticeSessionSchema.parse({
    schemaVersion: 1,
    id,
    practiceId: "foundation-day1-source-rev0-voice-free",
    foundationDay: 1,
    scriptId: "QCTP-D1-SOURCE-LABELED-SCRIPT-CANDIDATE-REV0",
    scriptSha256:
      "2649ce70e5ab824dbc6b797e07082567fda2443962016e8e6c7dbe454f5ee555",
    startedAt: now,
    endedAt: now,
    elapsedMs: 1_500_000,
    completionMode: "VOICE_FREE_FALLBACK",
    supportMode: "ambient",
    sourceSequence: ["Bullard", "HeartMath", "Dispenza", "QCTP return"],
    heartMathBreath:
      "approximately five seconds in / five seconds out or comfortable; no hold",
    naturalCompletion: true,
    narrationUsed: false,
    narratedContentAcceptance: "NOT_APPLICABLE",
    stateAttainment: "NOT_ASSESSED",
    debrief: {
      status: "completed",
      recordId,
      updatedAt: now,
      remindAt: null,
      promptVersion: "RAW_OBSERVATION_REV0",
    },
    createdAt: now,
  });
}

interface MutableArchiveEntry {
  id: string;
  ownerId: string;
  path: string;
  mimeType: string;
  sizeBytes: number;
  checksumSha256: string;
}

interface MutableArchiveManifest {
  audio: MutableArchiveEntry[];
  attachments: MutableArchiveEntry[];
}

function mutateArchive(
  files: Record<string, Uint8Array>,
  mutateManifest?: (manifest: MutableArchiveManifest) => void,
  mutateData?: (data: QctpExportData) => void,
): Uint8Array {
  const next = { ...files };
  const manifestBytes = next["manifest.json"];
  const dataBytes = next["qctp-data.json"];
  if (!manifestBytes || !dataBytes)
    throw new Error("Fixture archive is incomplete");
  const manifest = JSON.parse(
    strFromU8(manifestBytes),
  ) as MutableArchiveManifest;
  const data = JSON.parse(strFromU8(dataBytes)) as QctpExportData;
  mutateManifest?.(manifest);
  mutateData?.(data);
  next["manifest.json"] = strToU8(JSON.stringify(manifest));
  next["qctp-data.json"] = strToU8(JSON.stringify(data));
  return Uint8Array.from(zipSync(next));
}

beforeEach(async () => {
  sourceName = `qctp-export-source-${crypto.randomUUID()}`;
  targetName = `qctp-export-target-${crypto.randomUUID()}`;
  source = await createQctpRepository({ name: sourceName });
  target = await createQctpRepository({ name: targetName });
  await source.initializeDefaults(now);
});

afterEach(async () => {
  source.close();
  target.close();
  await Promise.all([
    deleteQctpDatabase(sourceName),
    deleteQctpDatabase(targetName),
  ]);
});

describe("versioned export/import", () => {
  it("emits Rev4 and safely upgrades Rev3 and Rev2 recordings", async () => {
    await source.saveRecording(createRecording());
    const current = await source.readSnapshot(now);
    expect(current).toMatchObject({
      schema: "qctp-export-v4",
      schemaVersion: 4,
      recordings: [
        expect.objectContaining({
          captureMode: "auto-dictation",
          requestedDurationMs: 300_000,
          captureContext: { type: "global" },
          completedByDurationLimit: false,
        }),
      ],
    });

    const legacyV3 = JSON.parse(JSON.stringify(current)) as Record<
      string,
      unknown
    >;
    legacyV3.schema = "qctp-export-v3";
    legacyV3.schemaVersion = 3;
    const legacyRecording = (
      legacyV3.recordings as Array<Record<string, unknown>>
    )[0];
    if (!legacyRecording)
      throw new Error("Legacy recording fixture is missing");
    for (const field of [
      "captureMode",
      "requestedDurationMs",
      "captureContext",
      "completedByDurationLimit",
    ]) {
      delete legacyRecording[field];
    }
    const migratedV3 = await parseQctpJson(JSON.stringify(legacyV3));
    expect(migratedV3).toMatchObject({
      schema: "qctp-export-v4",
      schemaVersion: 4,
      recordings: [
        expect.objectContaining({
          durationMs: 1_000,
          captureMode: null,
          requestedDurationMs: null,
          captureContext: null,
          completedByDurationLimit: null,
        }),
      ],
    });
    await importJson(target, JSON.stringify(legacyV3), { mode: "replace" });
    expect(await target.getRecording("recording-archive")).toMatchObject({
      durationMs: 1_000,
      captureMode: null,
      requestedDurationMs: null,
      captureContext: null,
      completedByDurationLimit: null,
    });

    const legacyV2 = JSON.parse(JSON.stringify(legacyV3)) as Record<
      string,
      unknown
    >;
    legacyV2.schema = "qctp-export-v2";
    legacyV2.schemaVersion = 2;
    for (const field of [
      "practiceSessions",
      "breathProfiles",
      "breathSessions",
      "stateSessions",
      "stateCapabilities",
    ]) {
      delete legacyV2[field];
    }
    const migratedV2 = await parseQctpJson(JSON.stringify(legacyV2));
    expect(migratedV2).toMatchObject({
      schema: "qctp-export-v4",
      schemaVersion: 4,
      practiceSessions: [],
      breathProfiles: [],
      breathSessions: [],
      stateSessions: [],
      stateCapabilities: [],
      recordings: [
        expect.objectContaining({
          captureMode: null,
          requestedDurationMs: null,
          captureContext: null,
          completedByDurationLimit: null,
        }),
      ],
    });
  });

  it.each([
    "captureMode",
    "requestedDurationMs",
    "captureContext",
    "completedByDurationLimit",
  ] as const)("rejects a Rev4 recording missing required %s", async (field) => {
    await source.saveRecording(createRecording());
    const current = JSON.parse(await exportJson(source)) as Record<
      string,
      unknown
    >;
    const currentRecording = (
      current.recordings as Array<Record<string, unknown>>
    )[0];
    if (!currentRecording)
      throw new Error("Current recording fixture is missing");
    delete currentRecording[field];

    await expect(parseQctpJson(current)).rejects.toBeInstanceOf(
      QctpImportError,
    );
  });

  it("normalizes trusted legacy content classes losslessly and atomically holds unknown values", async () => {
    const base = await source.readSnapshot(now);
    const legacyRecord: CodexRecord = {
      schemaVersion: 1,
      id: "legacy-campbell-export",
      kind: "source_note",
      title: "Legacy Campbell export",
      createdAt: now,
      updatedAt: now,
      observation: null,
      interpretation: null,
      tags: ["thomas-campbell"],
      backlinks: [],
      sourceLinks: [],
      attachmentIds: [],
      revisionIds: [],
      pathId: "thomas-campbell",
      sessionId: null,
      fields: {
        sourceTrack: "thomas-campbell",
        exerciseId: "TC-01-POSSIBILITY-LEDGER",
        contentClass: "qctp_original",
      },
      deletedAt: null,
    };
    const parsed = await parseQctpJson({
      ...base,
      records: [...base.records, legacyRecord],
    });
    const normalized = parsed.records.find(
      (record) => record.id === legacyRecord.id,
    );
    expect(normalized?.contentRef).toEqual({
      authorityKey: "campbell.exercise.TC-01-POSSIBILITY-LEDGER",
      contentClass: "QCTP_ORIGINAL",
    });
    expect(normalized?.fields.contentClass).toBe("qctp_original");

    await expect(
      importJson(target, {
        ...base,
        records: [
          {
            ...legacyRecord,
            fields: { ...legacyRecord.fields, contentClass: "mystery_class" },
          },
        ],
      }),
    ).rejects.toThrow(/UNMAPPED_LEGACY_CONTENT_CLASS.*No data changed/u);
    expect(await target.listRecords()).toEqual([]);
  });

  it("surfaces direct controlled-content holds and performs no partial import", async () => {
    const base = await source.readSnapshot(now);
    const practice = {
      ...createDebriefPracticeSession(
        "practice-controlled-hold",
        "record-not-needed-before-schema-hold",
      ),
      debrief: null,
    };
    const cases = [
      {
        contentRef: {
          authorityKey: "missing.controlled-content",
          contentClass: "QCTP_ORIGINAL",
        },
        expected: /UNREGISTERED_CONTROLLED_CONTENT.*No data changed/u,
      },
      {
        contentRef: {
          authorityKey: "foundation.day1.practice",
          contentClass: "QCTP_ORIGINAL",
        },
        expected: /CONTROLLED_CONTENT_CLASS_MISMATCH.*No data changed/u,
      },
      {
        contentRef: {
          authorityKey: "grant.exercise.REG-01-A",
          contentClass: "QCTP_ORIGINAL",
        },
        expected: /CONTROLLED_CONTENT_PARENT_MISMATCH.*No data changed/u,
      },
    ] as const;

    for (const item of cases) {
      await expect(
        importJson(target, {
          ...base,
          practiceSessions: [{ ...practice, contentRef: item.contentRef }],
        }),
      ).rejects.toThrow(item.expected);
      expect((await target.readSnapshot()).practiceSessions).toEqual([]);
    }

    await expect(
      importJson(target, {
        ...base,
        records: [
          {
            schemaVersion: 1,
            id: "reg-controlled-shadow-hold",
            kind: "geometry",
            title: "Recoverable REG record",
            createdAt: now,
            updatedAt: now,
            observation: null,
            interpretation: null,
            tags: [],
            backlinks: [],
            sourceLinks: [],
            attachmentIds: [],
            revisionIds: [],
            pathId: "reg-path",
            sessionId: null,
            contentRef: {
              authorityKey: "grant.exercise.REG-01-A",
              contentClass: "QCTP_ORIGINAL",
            },
            fields: {
              controlledContentAuthorityKey: "grant.exercise.REG-01-A",
              contentClass: "mystery_class",
            },
            deletedAt: null,
          },
        ],
      }),
    ).rejects.toThrow(/UNMAPPED_LEGACY_CONTENT_CLASS.*No data changed/u);
    expect((await target.readSnapshot()).records).toEqual([]);
  });

  it("validates cross-entity references before any JSON write", async () => {
    const base = await source.readSnapshot(now);
    const record = {
      schemaVersion: 1 as const,
      id: "relation-record",
      kind: "lab_result" as const,
      title: "Relation result",
      createdAt: now,
      updatedAt: now,
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
    };
    const relationRecording = createRecording();
    const transcript = {
      schemaVersion: 1 as const,
      id: "relation-transcript",
      recordingId: relationRecording.id,
      provider: "local-manual",
      model: "manual",
      language: "en",
      originalText: "raw",
      correctedText: null,
      corrections: [],
      timestamps: [],
      confidenceMetadata: {},
      createdAt: now,
      correctedAt: null,
    };
    const derivedNote = {
      schemaVersion: 1 as const,
      id: "relation-note",
      transcriptId: transcript.id,
      title: "Note",
      cleanText: "clean",
      suggestedTags: [],
      acceptedTags: [],
      questions: [],
      actionItems: [],
      provenance: {
        actor: "user" as const,
        method: "manual",
        provider: null,
        model: null,
      },
      createdAt: now,
      updatedAt: now,
    };
    const attachment: Attachment = {
      schemaVersion: 1,
      id: "relation-attachment",
      parentId: "relation-session",
      kind: "drawing",
      filename: "drawing.svg",
      mimeType: "image/svg+xml",
      sizeBytes: 0,
      localBlobRef: "relation-attachment-blob",
      remoteObjectRef: null,
      checksumSha256: null,
      createdAt: now,
      deletedAt: null,
    };
    const revision = {
      schemaVersion: 1 as const,
      id: "relation-revision",
      entityId: record.id,
      entityType: "record" as const,
      createdAt: now,
      provenance: derivedNote.provenance,
      changes: {},
    };
    const session = {
      ...createReg01Session("relation-session", now),
      attachmentIds: [attachment.id],
      resultingRecordIds: {
        studio: record.id,
        codex: record.id,
        mirror: record.id,
      },
    };
    const valid: QctpExportData = {
      ...base,
      records: [record],
      recordings: [relationRecording],
      transcripts: [transcript],
      derivedNotes: [derivedNote],
      attachments: [attachment],
      revisions: [revision],
      regSessions: [session],
    };
    expect(() => validateExportRelations(valid)).not.toThrow();
    expect(() =>
      validateExportRelations({ ...valid, records: [record, record] }),
    ).toThrow("Duplicate record id");
    const practice = PracticeSessionSchema.parse({
      schemaVersion: 1,
      id: "duplicate-practice",
      practiceId: "foundation-day1-source-rev0-voice-free",
      foundationDay: 1,
      scriptId: "QCTP-D1-SOURCE-LABELED-SCRIPT-CANDIDATE-REV0",
      scriptSha256:
        "2649ce70e5ab824dbc6b797e07082567fda2443962016e8e6c7dbe454f5ee555",
      startedAt: now,
      endedAt: now,
      elapsedMs: 1_500_000,
      completionMode: "VOICE_FREE_FALLBACK",
      supportMode: "ambient",
      sourceSequence: ["Bullard", "HeartMath", "Dispenza", "QCTP return"],
      heartMathBreath:
        "approximately five seconds in / five seconds out or comfortable; no hold",
      naturalCompletion: true,
      narrationUsed: false,
      narratedContentAcceptance: "NOT_APPLICABLE",
      stateAttainment: "NOT_ASSESSED",
      createdAt: now,
    });
    expect(() =>
      validateExportRelations({
        ...valid,
        practiceSessions: [practice, practice],
      }),
    ).toThrow("Duplicate practice session id");
    const debriefRecord = {
      ...record,
      id: "voice-record:debrief-recording",
      kind: "voice_note" as const,
      sessionId: practice.id,
      fields: {
        captureModality: "voice",
        voiceRecordingId: relationRecording.id,
      },
    };
    const debriefPractice = PracticeSessionSchema.parse({
      ...practice,
      debrief: {
        status: "completed",
        recordId: debriefRecord.id,
        updatedAt: now,
        remindAt: null,
        promptVersion: "RAW_OBSERVATION_REV0",
      },
    });
    expect(() =>
      validateExportRelations({
        ...valid,
        records: [record, debriefRecord],
        practiceSessions: [debriefPractice],
      }),
    ).not.toThrow();
    expect(() =>
      validateExportRelations({
        ...valid,
        records: [record, { ...debriefRecord, sessionId: "wrong-session" }],
        practiceSessions: [debriefPractice],
      }),
    ).toThrow("mismatched session link");
    expect(() =>
      validateExportRelations({
        ...valid,
        records: [
          record,
          {
            ...debriefRecord,
            fields: { voiceRecordingId: "missing-recording" },
          },
        ],
        practiceSessions: [debriefPractice],
      }),
    ).toThrow("references missing recording");
    expect(() =>
      validateExportRelations({
        ...valid,
        transcripts: [{ ...transcript, recordingId: "missing" }],
      }),
    ).toThrow("references missing recording");
    const queueItem = {
      schemaVersion: 1 as const,
      id: "queue-relation-one",
      recordingId: relationRecording.id,
      status: "QUEUED" as const,
      attempts: 0,
      nextAttemptAt: null,
      lastError: null,
      createdAt: now,
      updatedAt: now,
    };
    expect(() =>
      validateExportRelations({
        ...valid,
        transcriptionQueue: [
          queueItem,
          { ...queueItem, id: "queue-relation-two" },
        ],
      }),
    ).toThrow("Duplicate transcription queue recording");
    expect(() =>
      validateExportRelations({
        ...valid,
        transcriptionQueue: [
          { ...queueItem, recordingId: "missing-recording" },
        ],
      }),
    ).toThrow("references missing recording");
    expect(() =>
      validateExportRelations({
        ...valid,
        derivedNotes: [{ ...derivedNote, transcriptId: "missing" }],
      }),
    ).toThrow("references missing transcript");
    expect(() =>
      validateExportRelations({
        ...valid,
        regSessions: [{ ...session, attachmentIds: ["missing"] }],
      }),
    ).toThrow("references missing attachment");
    expect(() =>
      validateExportRelations({
        ...valid,
        regSessions: [
          {
            ...session,
            resultingRecordIds: {
              studio: "missing",
              codex: record.id,
              mirror: record.id,
            },
          },
        ],
      }),
    ).toThrow("references missing result record");
    expect(() =>
      validateExportRelations({
        ...valid,
        recordings: [
          {
            ...relationRecording,
            segments: [
              { ...relationRecording.segments[0]!, chunkIds: ["same", "same"] },
            ],
          },
        ],
      }),
    ).toThrow("Duplicate audio chunk id");
  });

  it("rejects invalid JSON uniformly for strings, blobs, and objects", async () => {
    await expect(importJson(target, "not-json")).rejects.toBeInstanceOf(
      QctpImportError,
    );
    await expect(
      importJson(target, await testBlob("not-json", "application/json")),
    ).rejects.toBeInstanceOf(QctpImportError);
    await expect(
      importJson(target, { schema: "unknown" }),
    ).rejects.toBeInstanceOf(QctpImportError);
    expect((await target.readSnapshot()).records).toEqual([]);
  });

  it("round-trips a complete JSON entity snapshot", async () => {
    await source.saveRecording(createRecording());
    await source.saveRecord({
      schemaVersion: 1,
      id: "record-json",
      kind: "dream",
      title: "Blue room",
      createdAt: now,
      updatedAt: now,
      observation: {
        id: "record-json:observation",
        text: "A blue room with one window.",
        capturedAt: now,
        evidenceClass: "self_reported",
        provenance: {
          actor: "user",
          method: "direct-entry",
          provider: null,
          model: null,
        },
        sourceIds: [],
      },
      interpretation: null,
      tags: ["dream"],
      backlinks: [],
      sourceLinks: [],
      attachmentIds: [],
      revisionIds: [],
      pathId: null,
      sessionId: null,
      fields: {},
      deletedAt: null,
    });
    const json = await exportJson(source);
    await importJson(target, json, { mode: "replace" });
    expect(await target.getRecord("record-json")).toEqual(
      await source.getRecord("record-json"),
    );
    expect(await target.getFoundationState()).toEqual(
      await source.getFoundationState(),
    );
    expect(await target.getSettings()).toEqual(await source.getSettings());
    expect(await target.getRecording("recording-archive")).toMatchObject({
      durationMs: 1_000,
      captureMode: "auto-dictation",
      requestedDurationMs: 300_000,
      captureContext: { type: "global" },
      completedByDurationLimit: false,
    });
  });

  it("rejects a merge JSON recording-ID collision without changing local audio", async () => {
    await source.saveRecording(createRecording());
    await target.saveRecording(createRecording());
    await target.appendAudioChunk(
      "recording-archive",
      "segment-archive",
      await testBlob("local-before-merge", "audio/webm"),
      { id: "target-json-chunk" },
    );
    const before = await target.getRecording("recording-archive");

    await expect(importJson(target, await exportJson(source))).rejects.toThrow(
      /would overwrite existing recording recording-archive.*No data changed/u,
    );
    expect(await target.getRecording("recording-archive")).toEqual(before);
    expect(
      await (await target.assembleRecordingBlob("recording-archive")).text(),
    ).toBe("local-before-merge");
  });

  it("round-trips audio and attachment blobs through a checksummed ZIP manifest", async () => {
    await source.saveRecording(createRecording());
    await source.appendAudioChunk(
      "recording-archive",
      "segment-archive",
      await testBlob("raw-audio", "audio/webm"),
      { id: "archive-chunk-1" },
    );
    const debriefRecordId = "voice-record:recording-archive";
    await source.saveRecord({
      schemaVersion: 1,
      id: debriefRecordId,
      kind: "voice_note",
      title: "Day 1 raw observation",
      createdAt: now,
      updatedAt: now,
      observation: null,
      interpretation: null,
      tags: ["raw-observation"],
      backlinks: [],
      sourceLinks: [],
      attachmentIds: [],
      revisionIds: [],
      pathId: null,
      sessionId: "practice-archive",
      fields: {
        captureModality: "voice",
        voiceRecordingId: "recording-archive",
        practiceSessionId: "practice-archive",
      },
      deletedAt: null,
    });
    await source.savePracticeSession(
      createDebriefPracticeSession("practice-archive", debriefRecordId),
    );
    const image = await testBlob("image-bytes", "image/jpeg");
    const attachment: Attachment = {
      schemaVersion: 1,
      id: "archive-photo",
      parentId: "record-json-parent",
      kind: "image",
      filename: "drawing.jpg",
      mimeType: image.type,
      sizeBytes: image.size,
      localBlobRef: "archive-photo-blob",
      remoteObjectRef: null,
      checksumSha256: null,
      createdAt: now,
      deletedAt: null,
    };
    await source.saveAttachment(attachment, image);
    const archive = await exportArchive(source);
    await importArchive(target, archive, { mode: "replace" });
    expect(
      await (await target.assembleRecordingBlob("recording-archive")).text(),
    ).toBe("raw-audio");
    expect(
      await (await target.getAttachmentBlob("archive-photo"))?.text(),
    ).toBe("image-bytes");
    const snapshot = await target.readSnapshot();
    expect(snapshot.recordings[0]).toMatchObject({
      durationMs: 1_000,
      captureMode: "auto-dictation",
      requestedDurationMs: 300_000,
      captureContext: { type: "global" },
      completedByDurationLimit: false,
    });
    expect(snapshot.attachments).toEqual([attachment]);
    expect(snapshot.practiceSessions[0]?.debrief).toMatchObject({
      status: "completed",
      recordId: debriefRecordId,
    });
    expect(
      snapshot.records.find((record) => record.id === debriefRecordId),
    ).toMatchObject({
      sessionId: "practice-archive",
      fields: { voiceRecordingId: "recording-archive" },
    });
  });

  it("rejects a merge ZIP recording-ID collision without mixing old and incoming chunks", async () => {
    await source.saveRecording(createRecording());
    await source.appendAudioChunk(
      "recording-archive",
      "segment-archive",
      await testBlob("incoming-audio", "audio/webm"),
      { id: "incoming-recording-chunk" },
    );
    await target.saveRecording(createRecording());
    await target.appendAudioChunk(
      "recording-archive",
      "segment-archive",
      await testBlob("preserved-local-audio", "audio/webm"),
      { id: "preserved-recording-chunk" },
    );
    const before = await target.getRecording("recording-archive");

    await expect(
      importArchive(target, await exportArchive(source)),
    ).rejects.toThrow(
      /would overwrite existing recording recording-archive.*No data changed/u,
    );
    expect(await target.getRecording("recording-archive")).toEqual(before);
    expect(
      await (await target.assembleRecordingBlob("recording-archive")).text(),
    ).toBe("preserved-local-audio");
    expect(
      await target.getAudioChunk("incoming-recording-chunk"),
    ).toBeUndefined();
  });

  it("rejects a cross-recording audio-chunk key collision before any merge writes", async () => {
    const incomingRecording: VoiceRecording = {
      ...createRecording(),
      id: "incoming-recording",
      localBlobRef: "incoming-recording",
      segments: [
        {
          ...createRecording().segments[0]!,
          id: "incoming-segment",
          chunkIds: [],
        },
      ],
    };
    const localRecording: VoiceRecording = {
      ...createRecording(),
      id: "local-recording",
      localBlobRef: "local-recording",
      segments: [
        {
          ...createRecording().segments[0]!,
          id: "local-segment",
          chunkIds: [],
        },
      ],
    };
    await source.saveRecording(incomingRecording);
    await source.appendAudioChunk(
      "incoming-recording",
      "incoming-segment",
      await testBlob("incoming-bytes", "audio/webm"),
      { id: "shared-binary-key" },
    );
    await target.saveRecording(localRecording);
    await target.appendAudioChunk(
      "local-recording",
      "local-segment",
      await testBlob("local-bytes", "audio/webm"),
      { id: "shared-binary-key" },
    );
    const before = await target.getRecording("local-recording");

    await expect(
      importArchive(target, await exportArchive(source)),
    ).rejects.toThrow(
      /would overwrite existing audio chunk shared-binary-key.*No data changed/u,
    );
    expect(await target.getRecording("local-recording")).toEqual(before);
    expect(await target.getRecording("incoming-recording")).toBeUndefined();
    expect(
      await (await target.assembleRecordingBlob("local-recording")).text(),
    ).toBe("local-bytes");
  });

  it("rejects an attachment binary key collision before any merge writes", async () => {
    const incoming = await testBlob("incoming-image", "image/jpeg");
    const local = await testBlob("local-image", "image/jpeg");
    await source.saveAttachment(
      {
        schemaVersion: 1,
        id: "incoming-attachment",
        parentId: "incoming-parent",
        kind: "image",
        filename: "incoming.jpg",
        mimeType: incoming.type,
        sizeBytes: incoming.size,
        localBlobRef: "shared-attachment-key",
        remoteObjectRef: null,
        checksumSha256: null,
        createdAt: now,
        deletedAt: null,
      },
      incoming,
    );
    await target.saveAttachment(
      {
        schemaVersion: 1,
        id: "local-attachment",
        parentId: "local-parent",
        kind: "image",
        filename: "local.jpg",
        mimeType: local.type,
        sizeBytes: local.size,
        localBlobRef: "shared-attachment-key",
        remoteObjectRef: null,
        checksumSha256: null,
        createdAt: now,
        deletedAt: null,
      },
      local,
    );

    await expect(
      importArchive(target, await exportArchive(source)),
    ).rejects.toThrow(
      /would overwrite existing attachment binary shared-attachment-key.*No data changed/u,
    );
    expect(await target.getAttachment("incoming-attachment")).toBeUndefined();
    expect(
      await (await target.getAttachmentBlob("local-attachment"))?.text(),
    ).toBe("local-image");
  });

  it("validates every archive artifact before the atomic database import starts", async () => {
    await source.saveRecording(createRecording());
    await source.appendAudioChunk(
      "recording-archive",
      "segment-archive",
      await testBlob("raw-audio", "audio/webm"),
      { id: "archive-chunk-1" },
    );
    const archive = await exportArchive(source);
    const files = unzipSync(new Uint8Array(await archive.arrayBuffer()));
    const manifestBytes = files["manifest.json"];
    if (!manifestBytes)
      throw new Error("Test archive did not contain a manifest");
    const manifest = JSON.parse(strFromU8(manifestBytes)) as {
      audio: Array<{ path: string }>;
    };
    const firstAudio = manifest.audio[0];
    if (!firstAudio) throw new Error("Test archive did not contain audio");
    const corrupted = { ...files };
    delete corrupted[firstAudio.path];
    corrupted["unrelated.txt"] = strToU8("still a ZIP");

    await expect(
      importArchive(target, Uint8Array.from(zipSync(corrupted)), {
        mode: "replace",
      }),
    ).rejects.toBeInstanceOf(QctpImportError);
    expect((await target.readSnapshot()).recordings).toEqual([]);
  });

  it("rejects malformed envelopes, path traversal, tampering, and ownership mismatches", async () => {
    await source.saveRecording(createRecording());
    await source.appendAudioChunk(
      "recording-archive",
      "segment-archive",
      await testBlob("raw-audio", "audio/webm"),
      { id: "archive-chunk-1" },
    );
    const image = await testBlob("image-bytes", "image/jpeg");
    await source.saveAttachment(
      {
        schemaVersion: 1,
        id: "archive-photo",
        parentId: "parent",
        kind: "image",
        filename: "drawing.jpg",
        mimeType: image.type,
        sizeBytes: image.size,
        localBlobRef: "archive-photo-blob",
        remoteObjectRef: null,
        checksumSha256: null,
        createdAt: now,
        deletedAt: null,
      },
      image,
    );
    const archive = await exportArchive(source);
    const files = unzipSync(new Uint8Array(await archive.arrayBuffer()));

    await expect(importArchive(target, strToU8("not a zip"))).rejects.toThrow(
      "not a readable",
    );
    const noManifest = { ...files };
    delete noManifest["manifest.json"];
    await expect(importArchive(target, zipSync(noManifest))).rejects.toThrow(
      "manifest.json is missing",
    );
    await expect(
      importArchive(
        target,
        zipSync({ ...files, "manifest.json": strToU8("{}") }),
      ),
    ).rejects.toThrow("manifest.json is invalid");
    const noData = { ...files };
    delete noData["qctp-data.json"];
    await expect(importArchive(target, zipSync(noData))).rejects.toThrow(
      "qctp-data.json is missing",
    );
    await expect(
      importArchive(
        target,
        mutateArchive(files, (manifest) => {
          manifest.audio[0]!.path = "../escape.bin";
        }),
      ),
    ).rejects.toThrow("Unsafe archive path");
    await expect(
      importArchive(
        target,
        mutateArchive(files, (manifest) => {
          manifest.audio[0]!.sizeBytes += 1;
        }),
      ),
    ).rejects.toThrow("size mismatch");
    await expect(
      importArchive(
        target,
        mutateArchive(files, (manifest) => {
          manifest.audio[0]!.checksumSha256 = "0".repeat(64);
        }),
      ),
    ).rejects.toThrow("checksum mismatch");
    await expect(
      importArchive(
        target,
        mutateArchive(files, (manifest) => {
          manifest.audio[0]!.id = "wrong-chunk";
        }),
      ),
    ).rejects.toThrow("audio manifest does not match");
    await expect(
      importArchive(
        target,
        mutateArchive(files, (manifest) => {
          manifest.attachments[0]!.id = "wrong-attachment";
        }),
      ),
    ).rejects.toThrow("attachment manifest does not match");
    await expect(
      importArchive(
        target,
        mutateArchive(files, (manifest) => {
          manifest.audio[0]!.ownerId = "wrong-owner";
        }),
      ),
    ).rejects.toThrow("audio owner mismatch");
    await expect(
      importArchive(
        target,
        mutateArchive(files, (manifest) => {
          manifest.attachments[0]!.ownerId = "wrong-owner";
        }),
      ),
    ).rejects.toThrow("attachment owner mismatch");
    await expect(
      importArchive(
        target,
        mutateArchive(files, undefined, (data) => {
          data.attachments[0]!.checksumSha256 = "f".repeat(64);
        }),
      ),
    ).rejects.toThrow("metadata checksum mismatch");
    expect((await target.readSnapshot()).recordings).toEqual([]);
  });
});
