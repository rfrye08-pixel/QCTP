import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createEvidenceLayer,
  createInterpretationLayer,
  createReg01Session,
  type Attachment,
  type CodexRecord,
  type Transcript,
  type VoiceRecording,
} from "../domain";

import { deleteQctpDatabase, openQctpDatabase } from "./db";
import { RegCompletionError, createQctpRepository } from "./repository";
import type { QctpRepository } from "./repository";

const now = "2026-08-17T12:00:00.000Z";
let databaseName: string;
let repository: QctpRepository;

async function testBlob(value: string, type: string): Promise<Blob> {
  return new Response(value, { headers: { "content-type": type } }).blob();
}

function recording(id = "recording-1", accepted = true): VoiceRecording {
  return {
    schemaVersion: 1,
    id,
    createdAt: now,
    updatedAt: now,
    acceptedAt: accepted ? now : null,
    durationMs: 1_000,
    mimeType: "audio/webm",
    sizeBytes: 0,
    localBlobRef: id,
    remoteObjectRef: null,
    destinationType: "unclassified",
    destinationId: null,
    status: "LOCAL_ONLY",
    segments: [
      {
        id: `${id}-segment-1`,
        sequence: 0,
        startedAt: now,
        endedAt: now,
        durationMs: 1_000,
        mimeType: "audio/webm",
        sizeBytes: 0,
        chunkIds: [],
      },
    ],
    captureMode: null,
    requestedDurationMs: null,
    captureContext: null,
    completedByDurationLimit: null,
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

function transcript(recordingId = "recording-1"): Transcript {
  return {
    schemaVersion: 1,
    id: `${recordingId}-transcript`,
    recordingId,
    provider: "mock-provider",
    model: "mock-model",
    language: "en",
    originalText: "The circle are equal.",
    correctedText: null,
    corrections: [],
    timestamps: [],
    confidenceMetadata: {},
    createdAt: now,
    correctedAt: null,
  };
}

beforeEach(async () => {
  databaseName = `qctp-repository-test-${crypto.randomUUID()}`;
  repository = await createQctpRepository({ name: databaseName });
});

afterEach(async () => {
  repository.close();
  await deleteQctpDatabase(databaseName);
});

describe("QctpRepository", () => {
  it("normalizes pre-Rev4 recording rows before emitting a strict Rev4 snapshot", async () => {
    const legacy = { ...recording("legacy-export-row") } as Record<
      string,
      unknown
    >;
    for (const field of [
      "captureMode",
      "requestedDurationMs",
      "captureContext",
      "completedByDurationLimit",
    ]) {
      delete legacy[field];
    }
    const raw = await openQctpDatabase({ name: databaseName });
    try {
      await raw.put("recordings", legacy as never);
    } finally {
      raw.close();
    }

    const snapshot = await repository.readSnapshot(now);
    expect(snapshot.recordings).toEqual([
      expect.objectContaining({
        id: "legacy-export-row",
        captureMode: null,
        requestedDurationMs: null,
        captureContext: null,
        completedByDurationLimit: null,
      }),
    ]);
  });

  it("writes 1,200 explicitly sequenced chunks without rescanning prior audio", async () => {
    const recordingId = "long-explicit-sequence";
    await repository.saveRecording(recording(recordingId, false));
    const getAll = vi.spyOn(IDBIndex.prototype, "getAll");
    const blob = await testBlob("x", "audio/webm");
    for (let sequence = 0; sequence < 1_200; sequence += 1) {
      await repository.appendAudioChunk(
        recordingId,
        `${recordingId}-segment-1`,
        blob,
        {
          id: `${recordingId}-chunk-${String(sequence).padStart(4, "0")}`,
          sequence,
          activeDurationMs: 1_001 + sequence,
        },
      );
    }
    expect(getAll).not.toHaveBeenCalled();
    getAll.mockRestore();

    const chunks = await repository.listAudioChunks(recordingId);
    expect(chunks).toHaveLength(1_200);
    expect(chunks[0]?.sequence).toBe(0);
    expect(chunks.at(-1)?.sequence).toBe(1_199);
    const saved = await repository.getRecording(recordingId);
    expect(saved).toMatchObject({
      durationMs: 2_200,
      sizeBytes: 1_200,
      segments: [{ durationMs: 2_200 }],
    });
    expect(saved?.segments[0]?.chunkIds[0]).toBe(`${recordingId}-chunk-0000`);
    expect(saved?.segments[0]?.chunkIds.at(-1)).toBe(
      `${recordingId}-chunk-1199`,
    );
  }, 15_000);

  it("provides typed CRUD APIs for every persisted foundation", async () => {
    await repository.initializeDefaults(now);
    await repository.initializeDefaults(now);
    const foundation = await repository.getFoundationState();
    const workbook = await repository.getWorkbookState();
    const settings = await repository.getSettings();
    if (!foundation || !workbook || !settings)
      throw new Error("Defaults were not initialized");
    expect(
      await repository.saveFoundationState({
        ...foundation,
        currentDay: 2,
        updatedAt: "2026-08-17T12:01:00.000Z",
      }),
    ).toMatchObject({ currentDay: 2, authoredDays: [1] });
    expect(
      await repository.saveWorkbookState({
        ...workbook,
        answers: { "1": { starting: "Calm" } },
        updatedAt: "2026-08-17T12:01:00.000Z",
      }),
    ).toMatchObject({ answers: { "1": { starting: "Calm" } } });
    expect(
      await repository.saveSettings({
        ...settings,
        transcriptionRoute: "server_openai",
        updatedAt: "2026-08-17T12:01:00.000Z",
      }),
    ).toMatchObject({ transcriptionRoute: "server_openai" });

    await repository.saveRecording(recording("crud-recording"));
    const chunk = await repository.appendAudioChunk(
      "crud-recording",
      "crud-recording-segment-1",
      await testBlob("chunk", "audio/webm"),
      { id: "crud-chunk" },
    );
    expect(await repository.getAudioChunk(chunk.id)).toMatchObject({
      recordingId: "crud-recording",
    });
    expect(await repository.listAudioChunks("crud-recording")).toHaveLength(1);
    expect(await repository.listRecordings()).toHaveLength(1);
    expect(await repository.listRecordings("LOCAL_ONLY")).toHaveLength(1);
    await repository.enqueueTranscription("crud-recording", now);
    await repository.enqueueTranscription(
      "crud-recording",
      "2026-08-17T12:02:00.000Z",
    );
    expect(await repository.listTranscriptionQueue()).toHaveLength(1);
    expect(await repository.listTranscriptionQueue("QUEUED")).toHaveLength(1);
    await repository.saveTranscript(transcript("crud-recording"));
    await repository.saveDerivedNote({
      schemaVersion: 1,
      id: "crud-note",
      transcriptId: "crud-recording-transcript",
      title: "Clean note",
      cleanText: "Clean",
      suggestedTags: [],
      acceptedTags: [],
      questions: [],
      actionItems: [],
      provenance: {
        actor: "user",
        method: "manual-cleanup",
        provider: null,
        model: null,
      },
      createdAt: now,
      updatedAt: now,
    });
    expect(
      await repository.getDerivedNotesForTranscript(
        "crud-recording-transcript",
      ),
    ).toHaveLength(1);

    const photo = await testBlob("photo", "image/jpeg");
    const attachment: Attachment = {
      schemaVersion: 1,
      id: "crud-photo",
      parentId: "crud-parent",
      kind: "image",
      filename: "photo.jpg",
      mimeType: "image/jpeg",
      sizeBytes: photo.size,
      localBlobRef: "crud-photo-blob",
      remoteObjectRef: null,
      checksumSha256: null,
      createdAt: now,
      deletedAt: null,
    };
    await repository.saveAttachment(attachment, photo);
    expect(await repository.getAttachment(attachment.id)).toEqual(attachment);
    expect(await repository.listAttachments()).toEqual([attachment]);
    expect(await repository.listAttachments("crud-parent")).toEqual([
      attachment,
    ]);
    await repository.saveRevision({
      schemaVersion: 1,
      id: "crud-revision",
      entityId: "crud-parent",
      entityType: "record",
      createdAt: now,
      provenance: {
        actor: "user",
        method: "manual-edit",
        provider: null,
        model: null,
      },
      changes: { title: "Changed" },
    });
    expect(await repository.listRevisions("crud-parent")).toHaveLength(1);
    const path = (await repository.listPaths())[0];
    if (!path) throw new Error("Default path is missing");
    await repository.savePath({ ...path, currentModule: 2 });
    expect(
      (await repository.listPaths()).find((item) => item.id === path.id),
    ).toMatchObject({ currentModule: 2 });
    const reg = createReg01Session("crud-reg", now);
    await repository.saveRegSession(reg);
    expect(await repository.getRegSession(reg.id)).toEqual(reg);
    const ledger = {
      schemaVersion: 1 as const,
      id: "crud-ledger",
      migrationId: "rev1-localstorage-qctp-state" as const,
      sourceKey: "test-source",
      sourceSchema: "test",
      sourceFingerprint: "0000000000000000",
      sourceSnapshotJson: "{}",
      appliedAt: now,
      importedEntityIds: [],
      warnings: [],
    };
    await repository.saveMigrationLedgerEntry(ledger);
    expect(
      await repository.findMigrationByFingerprint(ledger.sourceFingerprint),
    ).toEqual(ledger);
  });

  it("defaults the canonical content reference when reading a legacy REG session", async () => {
    const legacySession = createReg01Session("legacy-reg", now);
    Reflect.deleteProperty(legacySession, "contentRef");
    const rawDatabase = await openQctpDatabase({ name: databaseName });
    await rawDatabase.put("regSessions", legacySession);
    rawDatabase.close();

    expect(await repository.getRegSession(legacySession.id)).toMatchObject({
      contentRef: {
        authorityKey: "grant.exercise.REG-01-A",
        contentClass: "QCTP_ORIGINAL",
      },
    });
  });

  it("normalizes additive voice metadata when reading legacy recording rows", async () => {
    const legacyRecording = recording("legacy-recording");
    Reflect.deleteProperty(legacyRecording, "captureMode");
    Reflect.deleteProperty(legacyRecording, "requestedDurationMs");
    Reflect.deleteProperty(legacyRecording, "captureContext");
    Reflect.deleteProperty(legacyRecording, "completedByDurationLimit");
    const rawDatabase = await openQctpDatabase({ name: databaseName });
    await rawDatabase.put("recordings", legacyRecording);
    rawDatabase.close();

    const expectedMetadata = {
      captureMode: null,
      requestedDurationMs: null,
      captureContext: null,
      completedByDurationLimit: null,
    };
    expect(await repository.getRecording(legacyRecording.id)).toMatchObject(
      expectedMetadata,
    );
    expect(await repository.listRecordings()).toEqual([
      expect.objectContaining(expectedMetadata),
    ]);
  });

  it("rejects missing parents and mismatched binary metadata", async () => {
    await expect(
      repository.appendAudioChunk(
        "missing",
        "missing-segment",
        await testBlob("raw", "audio/webm"),
      ),
    ).rejects.toThrow("Recording not found");
    await repository.saveRecording(recording("errors"));
    await expect(
      repository.appendAudioChunk(
        "errors",
        "missing-segment",
        await testBlob("raw", "audio/webm"),
      ),
    ).rejects.toThrow("segment not found");
    await expect(repository.assembleRecordingBlob("missing")).rejects.toThrow(
      "Recording not found",
    );
    await expect(repository.assembleRecordingBlob("errors")).rejects.toThrow(
      "no local audio",
    );
    await expect(
      repository.updateRecordingStatus("missing", "LOCAL_ONLY"),
    ).rejects.toThrow("Recording not found");
    await expect(repository.enqueueTranscription("missing")).rejects.toThrow(
      "Recording not found",
    );
    await expect(
      repository.saveTranscript(transcript("missing")),
    ).rejects.toThrow("Recording not found");
    await expect(
      repository.correctTranscript("missing", "text"),
    ).rejects.toThrow("Transcript not found");
    await expect(
      repository.saveDerivedNote({
        schemaVersion: 1,
        id: "orphan-note",
        transcriptId: "missing",
        title: "Orphan",
        cleanText: "",
        suggestedTags: [],
        acceptedTags: [],
        questions: [],
        actionItems: [],
        provenance: {
          actor: "user",
          method: "manual",
          provider: null,
          model: null,
        },
        createdAt: now,
        updatedAt: now,
      }),
    ).rejects.toThrow("Transcript not found");
    const image = await testBlob("image", "image/jpeg");
    const metadata: Attachment = {
      schemaVersion: 1,
      id: "bad-attachment",
      parentId: "parent",
      kind: "image",
      filename: "photo.jpg",
      mimeType: "image/jpeg",
      sizeBytes: image.size + 1,
      localBlobRef: "bad-attachment-blob",
      remoteObjectRef: null,
      checksumSha256: null,
      createdAt: now,
      deletedAt: null,
    };
    await expect(repository.saveAttachment(metadata, image)).rejects.toThrow(
      "size does not match",
    );
    await expect(
      repository.saveAttachment(
        { ...metadata, sizeBytes: image.size, mimeType: "image/png" },
        image,
      ),
    ).rejects.toThrow("MIME type does not match");
    await expect(repository.completeReg01("missing")).rejects.toThrow(
      "REG session not found",
    );
    await expect(repository.deleteRecording("missing")).rejects.toThrow(
      "Recording not found",
    );
    await expect(repository.deleteRecord("missing")).resolves.toBeUndefined();
  });

  it("persists binary audio chunks and assembles them across a reload", async () => {
    await repository.saveRecording(recording());
    await repository.appendAudioChunk(
      "recording-1",
      "recording-1-segment-1",
      await testBlob("first-", "audio/webm"),
      { id: "chunk-1", sequence: 0 },
    );
    await repository.appendAudioChunk(
      "recording-1",
      "recording-1-segment-1",
      await testBlob("second", "audio/webm"),
      { id: "chunk-2", sequence: 1 },
    );
    repository.close();
    repository = await createQctpRepository({ name: databaseName });

    const audio = await repository.assembleRecordingBlob("recording-1");
    expect(await audio.text()).toBe("first-second");
    expect((await repository.getRecording("recording-1"))?.sizeBytes).toBe(12);
  });

  it("rejects stale audio chunks outside the recording segment graph", async () => {
    await repository.saveRecording(recording("graph-recording"));
    await repository.appendAudioChunk(
      "graph-recording",
      "graph-recording-segment-1",
      await testBlob("declared", "audio/webm"),
      { id: "declared-chunk", sequence: 0 },
    );
    const raw = await openQctpDatabase({ name: databaseName });
    try {
      await raw.put("audioChunks", {
        schemaVersion: 1,
        id: "stale-chunk",
        recordingId: "graph-recording",
        segmentId: "graph-recording-segment-1",
        sequence: 1,
        createdAt: now,
        mimeType: "audio/webm",
        blob: await testBlob("must-not-append", "audio/webm"),
      });
    } finally {
      raw.close();
    }

    await expect(
      repository.assembleRecordingBlob("graph-recording"),
    ).rejects.toThrow(/audio graph is inconsistent/u);
    expect(
      await (await repository.getAudioChunk("declared-chunk"))?.blob.text(),
    ).toBe("declared");
  });

  it("requires explicit acceptance before queueing and preserves audio on transcription failure", async () => {
    await repository.saveRecording(recording("unaccepted", false));
    await expect(repository.enqueueTranscription("unaccepted")).rejects.toThrow(
      "explicitly accepted",
    );
    await repository.saveRecording(recording("accepted"));
    const queued = await repository.enqueueTranscription("accepted");
    expect(queued.status).toBe("QUEUED");
    await repository.appendAudioChunk(
      "accepted",
      "accepted-segment-1",
      await testBlob("raw", "audio/webm"),
    );
    await repository.updateRecordingStatus("accepted", "TRANSCRIPTION_FAILED", {
      failureCode: "PROVIDER_UNAVAILABLE",
      failureMessage: "Try again later.",
    });
    expect(
      await (await repository.assembleRecordingBlob("accepted")).text(),
    ).toBe("raw");
  });

  it("never mutates original transcript text when a correction or clean note is saved", async () => {
    await repository.saveRecording(recording());
    await repository.saveTranscript(transcript());
    const corrected = await repository.correctTranscript(
      "recording-1-transcript",
      "The circles are equal.",
      {
        actor: "user",
        method: "manual-correction",
        provider: null,
        model: null,
      },
      "2026-08-17T12:05:00.000Z",
    );
    expect(corrected.originalText).toBe("The circle are equal.");
    expect(corrected.correctedText).toBe("The circles are equal.");
    await expect(
      repository.saveTranscript({
        ...corrected,
        originalText: "Overwritten source.",
      }),
    ).rejects.toThrow("immutable");
    await repository.saveDerivedNote({
      schemaVersion: 1,
      id: "note-1",
      transcriptId: corrected.id,
      title: "Clean geometry note",
      cleanText: "The circles are equal.",
      suggestedTags: ["geometry"],
      acceptedTags: [],
      questions: [],
      actionItems: [],
      provenance: {
        actor: "user",
        method: "manual-cleanup",
        provider: null,
        model: null,
      },
      createdAt: now,
      updatedAt: now,
    });
    expect((await repository.getTranscript(corrected.id))?.originalText).toBe(
      "The circle are equal.",
    );
  });

  it("maintains a search-ready index and cleans backlinks during cascade deletion", async () => {
    const base: CodexRecord = {
      schemaVersion: 1,
      id: "geometry-1",
      kind: "geometry",
      title: "Equal circle construction",
      createdAt: now,
      updatedAt: now,
      observation: createEvidenceLayer(
        "evidence-1",
        "A shared vertical chord.",
        now,
        "observed",
      ),
      interpretation: null,
      tags: ["geometry", "reg-01"],
      backlinks: [],
      sourceLinks: [],
      attachmentIds: [],
      revisionIds: [],
      pathId: "reg-path",
      sessionId: "session-1",
      fields: {},
      deletedAt: null,
    };
    await repository.saveRecord(base);
    await repository.saveRecord({
      ...base,
      id: "mirror-1",
      kind: "mirror",
      title: "Reflection",
      observation: null,
      backlinks: [{ recordId: base.id, relationship: "reflects" }],
    });
    expect(
      (await repository.searchRecords("vertical chord")).map((item) => item.id),
    ).toEqual(["geometry-1"]);
    await repository.deleteRecord("geometry-1");
    expect((await repository.getRecord("mirror-1"))?.backlinks).toEqual([]);
    expect(await repository.searchRecords("vertical chord")).toEqual([]);
  });

  it("atomically completes REG-01 into Studio, Codex, Mirror, and path state", async () => {
    const incomplete = createReg01Session("reg-session-1", now);
    await repository.saveRegSession(incomplete);
    await expect(
      repository.completeReg01(incomplete.id, now),
    ).rejects.toBeInstanceOf(RegCompletionError);
    expect(await repository.getPath("reg-path")).toBeUndefined();

    const photo = await testBlob("photo-bytes", "image/jpeg");
    const attachment: Attachment = {
      schemaVersion: 1,
      id: "reg-photo-1",
      parentId: incomplete.id,
      kind: "image",
      filename: "geometry.jpg",
      mimeType: photo.type,
      sizeBytes: photo.size,
      localBlobRef: "reg-photo-blob-1",
      remoteObjectRef: null,
      checksumSha256: null,
      createdAt: now,
      deletedAt: null,
    };
    await repository.saveAttachment(attachment, photo);
    await repository.saveRecording({
      ...recording("reg-auto-recording"),
      durationMs: 5 * 60 * 1_000,
      destinationType: "studio_geometry",
      destinationId: incomplete.id,
    });
    await repository.appendAudioChunk(
      "reg-auto-recording",
      "reg-auto-recording-segment-1",
      await testBlob("five-minute-raw-audio", "audio/webm"),
    );
    const complete = {
      ...incomplete,
      status: "in_progress" as const,
      startedAt: now,
      steps: incomplete.steps.map((step) => ({
        ...step,
        complete: true,
        completedAt: now,
      })),
      rawObservation: createEvidenceLayer(
        "reg-observation-1",
        "Both circles cross at two visible points.",
        now,
        "observed",
      ),
      autoDictation: createEvidenceLayer(
        "reg-auto-1",
        "Construction made small errors visible.",
        now,
      ),
      autoDictationRecordingId: "reg-auto-recording",
      autoDictationDurationMs: 5 * 60 * 1_000,
      interpretation: createInterpretationLayer(
        "reg-interpretation-1",
        "Precision changes perception.",
        ["reg-observation-1"],
        now,
      ),
      integrationAction: "Pause to observe before concluding.",
      precept: {
        ...incomplete.precept,
        complete: true,
        review: "Applied during a meeting.",
      },
      attachmentIds: [attachment.id],
      updatedAt: now,
    };
    await repository.saveRegSession(complete);
    const result = await repository.completeReg01(complete.id, now);
    expect(result.session.status).toBe("complete");
    expect(result.path.completedModuleIds).toContain("REG-01-A");
    expect(result.path.currentModule).toBe(2);
    expect(
      (await repository.listRecords({ tags: ["reg-01"] })).map(
        (item) => item.kind,
      ),
    ).toEqual(expect.arrayContaining(["geometry", "auto_dictation", "mirror"]));
    expect(result.studioRecord.observation?.text).toBe(
      "Both circles cross at two visible points.",
    );
    expect(result.studioRecord.interpretation?.text).toBe(
      "Precision changes perception.",
    );
    expect(result.session.contentRef).toEqual({
      authorityKey: "grant.exercise.REG-01-A",
      contentClass: "QCTP_ORIGINAL",
    });
    for (const record of [
      result.studioRecord,
      result.codexRecord,
      result.mirrorRecord,
    ]) {
      expect(record.contentRef).toEqual(result.session.contentRef);
      expect(record.fields).not.toHaveProperty("contentClass");
      expect(record.observation?.provenance.actor).toBe("user");
      expect(record.tags).toContain("source-track:robert-edward-grant");
      expect(record.fields.sourceTrackId).toBe("robert-edward-grant");
      expect(record.fields.sourceTrackRef).toMatchObject({
        trackId: "robert-edward-grant",
        accessId: "REG-01-A",
        contentRefs: [
          {
            authorityKey: "grant.exercise.REG-01-A",
            contentClass: "QCTP_ORIGINAL",
          },
        ],
      });
    }
  });

  it("supports selective and complete voice-layer deletion", async () => {
    await repository.saveRecording(recording());
    await repository.appendAudioChunk(
      "recording-1",
      "recording-1-segment-1",
      await testBlob("raw", "audio/webm"),
    );
    await repository.saveTranscript(transcript());
    const selective = await repository.deleteRecording("recording-1", {
      audio: true,
      transcript: false,
      derivedNotes: false,
      metadata: false,
    });
    expect(selective.deletedChunkIds).toHaveLength(1);
    expect(
      await repository.getTranscriptForRecording("recording-1"),
    ).toBeDefined();
    expect((await repository.getRecording("recording-1"))?.status).toBe(
      "DELETED",
    );
    await repository.deleteRecording("recording-1");
    expect(await repository.getRecording("recording-1")).toBeUndefined();
    expect(
      await repository.getTranscriptForRecording("recording-1"),
    ).toBeUndefined();
  });
});
