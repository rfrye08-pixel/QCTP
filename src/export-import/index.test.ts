import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createReg01Session,
  type Attachment,
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
    expect(() =>
      validateExportRelations({
        ...valid,
        transcripts: [{ ...transcript, recordingId: "missing" }],
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
  });

  it("round-trips audio and attachment blobs through a checksummed ZIP manifest", async () => {
    await source.saveRecording(createRecording());
    await source.appendAudioChunk(
      "recording-archive",
      "segment-archive",
      await testBlob("raw-audio", "audio/webm"),
      { id: "archive-chunk-1" },
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
    expect(snapshot.attachments).toEqual([attachment]);
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
