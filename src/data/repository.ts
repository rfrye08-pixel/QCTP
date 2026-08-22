import {
  AppSettingsSchema,
  AttachmentSchema,
  CodexRecordSchema,
  DerivedNoteSchema,
  FoundationStateSchema,
  MigrationLedgerEntrySchema,
  MirrorInsightFeedbackSchema,
  MirrorRequestSchema,
  MirrorResultSchema,
  PathStateSchema,
  QctpExportDataSchema,
  RegSessionSchema,
  RevisionSchema,
  SearchDocumentSchema,
  TranscriptSchema,
  TranscriptionQueueItemSchema,
  VoiceRecordingSchema,
  WorkbookStateSchema,
  createDefaultFoundationState,
  createDefaultPathStates,
  createDefaultSettings,
  createDefaultWorkbookState,
  systemProvenance,
  type AppSettings,
  type Attachment,
  type CodexRecord,
  type DerivedNote,
  type FoundationState,
  type MigrationLedgerEntry,
  type MirrorInsightFeedback,
  type MirrorInsightKind,
  type MirrorInsightReviewAction,
  type MirrorJobStatus,
  type MirrorRequest,
  type MirrorResult,
  type MirrorResultRevisionAction,
  type PathState,
  type Provenance,
  type QctpExportData,
  type RecordKind,
  type RegSession,
  type Revision,
  type SearchDocument,
  type Transcript,
  type TranscriptionQueueItem,
  type VoiceRecording,
  type WorkbookState,
} from "../domain";

import {
  openQctpDatabase,
  type AttachmentBlob,
  type AudioChunk,
  type OpenQctpDatabaseOptions,
  type QctpDatabase,
  type QctpStoreName,
} from "./db";

const SNAPSHOT_STORES = [
  "foundation",
  "workbook",
  "settings",
  "records",
  "recordings",
  "transcripts",
  "derivedNotes",
  "attachments",
  "revisions",
  "paths",
  "regSessions",
  "transcriptionQueue",
  "migrationLedger",
  "mirrorRequests",
  "mirrorResults",
  "mirrorInsightFeedback",
  "searchDocuments",
] as const satisfies readonly QctpStoreName[];

const ALL_STORES = [
  ...SNAPSHOT_STORES,
  "audioChunks",
  "attachmentBlobs",
] as const satisfies readonly QctpStoreName[];

export interface SearchRecordsOptions {
  kinds?: RecordKind[];
  tags?: string[];
  limit?: number;
  includeDeleted?: boolean;
}

export interface AppendAudioChunkOptions {
  id?: string;
  sequence?: number;
  createdAt?: string;
}

export interface DeleteRecordingSelection {
  audio?: boolean;
  transcript?: boolean;
  derivedNotes?: boolean;
  metadata?: boolean;
}

export interface DeleteRecordingResult {
  deletedChunkIds: string[];
  deletedTranscriptIds: string[];
  deletedDerivedNoteIds: string[];
  remoteObjectsToDelete: string[];
}

export interface DeleteRecordOptions {
  attachments?: boolean;
  revisions?: boolean;
  backlinks?: boolean;
}

export interface ListMirrorOptions {
  includeDeleted?: boolean;
}

export interface ReviewMirrorResultInput {
  action: Extract<
    MirrorResultRevisionAction,
    "accepted" | "revised" | "rejected" | "annotated"
  >;
  text?: string;
  proposedQuestion?: string | null;
  proposedAction?: string | null;
  annotation?: string | null;
}

export interface MirrorReflectionDeletionResult {
  request: MirrorRequest;
  result: MirrorResult;
}

export interface MirrorPurgeResult {
  requestId: string;
  resultId: string | null;
}

export interface ReviewMirrorInsightInput {
  insightKey: string;
  kind: MirrorInsightKind;
  label: string;
  sourceRecordIds: string[];
  action: MirrorInsightReviewAction;
  correction?: string | null;
  annotation?: string | null;
}

export interface SnapshotBinaryBundle {
  audioChunks?: AudioChunk[];
  attachmentBlobs?: AttachmentBlob[];
}

export interface ImportSnapshotOptions {
  mode?: "merge" | "replace";
  binaries?: SnapshotBinaryBundle;
}

export interface CompleteReg01Result {
  session: RegSession;
  studioRecord: CodexRecord;
  codexRecord: CodexRecord;
  mirrorRecord: CodexRecord;
  path: PathState;
}

export class RegCompletionError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`REG-01 completion held: ${issues.join("; ")}`);
    this.name = "RegCompletionError";
    this.issues = issues;
  }
}

function makeId(prefix: string): string {
  const random =
    globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  return `${prefix}-${random}`;
}

function normalizedOptionalText(value: string | null): string | null {
  if (value === null) return null;
  const normalized = value.trim();
  return normalized || null;
}

function sameIds(left: readonly string[], right: readonly string[]): boolean {
  return (
    left.length === right.length &&
    left.every((value) => right.includes(value)) &&
    right.every((value) => left.includes(value))
  );
}

function initialMirrorResultRevision(result: MirrorResult) {
  return {
    id: makeId("mirror-revision"),
    createdAt: result.createdAt,
    action: "generated" as const,
    disposition: "unreviewed" as const,
    text: result.text,
    proposedQuestion: result.proposedQuestion,
    proposedAction: result.proposedAction,
    annotation: result.annotation,
  };
}

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKD")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function recordToSearchDocument(record: CodexRecord): SearchDocument {
  let fields: string;
  try {
    fields = JSON.stringify(record.fields);
  } catch {
    fields = "";
  }
  const text = [
    record.title,
    record.observation?.text ?? "",
    record.interpretation?.text ?? "",
    record.tags.join(" "),
    record.sourceLinks
      .map((source) => `${source.label} ${source.citation ?? ""}`)
      .join(" "),
    fields,
  ].join("\n");
  return SearchDocumentSchema.parse({
    recordId: record.id,
    kind: record.kind,
    title: record.title,
    text,
    normalizedText: normalizeSearchText(text),
    tags: record.tags,
    updatedAt: record.updatedAt,
  });
}

export function getReg01CompletionIssues(session: RegSession): string[] {
  const issues: string[] = [];
  if (session.steps.some((step) => !step.complete))
    issues.push("all nine controlled steps are required");
  if (!session.rawObservation?.text.trim())
    issues.push("raw observation is required");
  if (!session.autoDictation?.text.trim())
    issues.push("raw auto-dictation is required");
  if (!session.autoDictationRecordingId)
    issues.push("an accepted auto-dictation recording is required");
  if (session.autoDictationDurationMs < 5 * 60 * 1_000)
    issues.push("the auto-dictation recording must reach five minutes");
  if (!session.integrationAction.trim())
    issues.push("integration action is required");
  if (!session.precept.complete) issues.push("precept integration is required");
  if (session.attachmentIds.length === 0)
    issues.push("a geometry photograph or drawing is required");
  return issues;
}

export class QctpRepository {
  readonly database: QctpDatabase;

  constructor(database: QctpDatabase) {
    this.database = database;
  }

  close(): void {
    this.database.close();
  }

  async initializeDefaults(now = new Date().toISOString()): Promise<void> {
    const transaction = this.database.transaction(
      ["foundation", "workbook", "settings", "paths"],
      "readwrite",
    );
    const foundation = await transaction
      .objectStore("foundation")
      .get("foundation");
    if (!foundation)
      await transaction
        .objectStore("foundation")
        .put(createDefaultFoundationState(now));
    const workbook = await transaction.objectStore("workbook").get("workbook");
    if (!workbook)
      await transaction
        .objectStore("workbook")
        .put(createDefaultWorkbookState(now));
    const settings = await transaction.objectStore("settings").get("settings");
    if (!settings)
      await transaction.objectStore("settings").put(createDefaultSettings(now));
    for (const path of createDefaultPathStates(now)) {
      const current = await transaction.objectStore("paths").get(path.id);
      if (!current) await transaction.objectStore("paths").put(path);
    }
    await transaction.done;
  }

  async getFoundationState(): Promise<FoundationState | undefined> {
    return this.database.get("foundation", "foundation");
  }

  async saveFoundationState(value: FoundationState): Promise<FoundationState> {
    const parsed = FoundationStateSchema.parse(value);
    await this.database.put("foundation", parsed);
    return parsed;
  }

  async getWorkbookState(): Promise<WorkbookState | undefined> {
    return this.database.get("workbook", "workbook");
  }

  async saveWorkbookState(value: WorkbookState): Promise<WorkbookState> {
    const parsed = WorkbookStateSchema.parse(value);
    await this.database.put("workbook", parsed);
    return parsed;
  }

  async getSettings(): Promise<AppSettings | undefined> {
    return this.database.get("settings", "settings");
  }

  async saveSettings(value: AppSettings): Promise<AppSettings> {
    const parsed = AppSettingsSchema.parse(value);
    await this.database.put("settings", parsed);
    return parsed;
  }

  async saveRecord(value: CodexRecord): Promise<CodexRecord> {
    const parsed = CodexRecordSchema.parse(value);
    const transaction = this.database.transaction(
      ["records", "searchDocuments"],
      "readwrite",
    );
    await Promise.all([
      transaction.objectStore("records").put(parsed),
      transaction
        .objectStore("searchDocuments")
        .put(recordToSearchDocument(parsed)),
    ]);
    await transaction.done;
    return parsed;
  }

  async getRecord(id: string): Promise<CodexRecord | undefined> {
    return this.database.get("records", id);
  }

  async listRecords(
    options: SearchRecordsOptions = {},
  ): Promise<CodexRecord[]> {
    const records = await this.database.getAll("records");
    const tags = new Set(options.tags?.map(normalizeSearchText));
    const kinds = new Set(options.kinds);
    return records
      .filter(
        (record) =>
          options.includeDeleted === true || record.deletedAt === null,
      )
      .filter((record) => kinds.size === 0 || kinds.has(record.kind))
      .filter(
        (record) =>
          tags.size === 0 ||
          [...tags].every((tag) =>
            record.tags.some(
              (candidate) => normalizeSearchText(candidate) === tag,
            ),
          ),
      )
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, options.limit ?? Number.POSITIVE_INFINITY);
  }

  async searchRecords(
    query: string,
    options: SearchRecordsOptions = {},
  ): Promise<CodexRecord[]> {
    const terms = normalizeSearchText(query).split(" ").filter(Boolean);
    if (terms.length === 0) return this.listRecords(options);
    const documents = await this.database.getAll("searchDocuments");
    const matchingIds = new Set(
      documents
        .filter((document) =>
          terms.every((term) => document.normalizedText.includes(term)),
        )
        .map((document) => document.recordId),
    );
    return (await this.listRecords(options)).filter((record) =>
      matchingIds.has(record.id),
    );
  }

  async saveRecording(value: VoiceRecording): Promise<VoiceRecording> {
    const parsed = VoiceRecordingSchema.parse(value);
    await this.database.put("recordings", parsed);
    return parsed;
  }

  async getRecording(id: string): Promise<VoiceRecording | undefined> {
    return this.database.get("recordings", id);
  }

  async listRecordings(
    status?: VoiceRecording["status"],
  ): Promise<VoiceRecording[]> {
    const values = status
      ? await this.database.getAllFromIndex("recordings", "status", status)
      : await this.database.getAll("recordings");
    return values.sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt),
    );
  }

  async appendAudioChunk(
    recordingId: string,
    segmentId: string,
    blob: Blob,
    options: AppendAudioChunkOptions = {},
  ): Promise<AudioChunk> {
    const transaction = this.database.transaction(
      ["recordings", "audioChunks"],
      "readwrite",
    );
    const recordings = transaction.objectStore("recordings");
    const recording = await recordings.get(recordingId);
    if (!recording) throw new Error(`Recording not found: ${recordingId}`);
    const segmentIndex = recording.segments.findIndex(
      (segment) => segment.id === segmentId,
    );
    if (segmentIndex < 0)
      throw new Error(`Recording segment not found: ${segmentId}`);
    const existingChunks = await transaction
      .objectStore("audioChunks")
      .index("recordingId")
      .getAll(recordingId);
    const chunk: AudioChunk = {
      schemaVersion: 1,
      id: options.id ?? makeId("audio-chunk"),
      recordingId,
      segmentId,
      sequence:
        options.sequence ??
        existingChunks.reduce(
          (maximum, candidate) => Math.max(maximum, candidate.sequence),
          -1,
        ) + 1,
      createdAt: options.createdAt ?? new Date().toISOString(),
      mimeType: blob.type || recording.mimeType,
      blob,
    };
    const segment = recording.segments[segmentIndex];
    if (!segment) throw new Error(`Recording segment not found: ${segmentId}`);
    const nextSegment = {
      ...segment,
      sizeBytes: segment.sizeBytes + blob.size,
      chunkIds: [...segment.chunkIds, chunk.id],
    };
    const nextRecording = VoiceRecordingSchema.parse({
      ...recording,
      sizeBytes: recording.sizeBytes + blob.size,
      segments: recording.segments.map((value, index) =>
        index === segmentIndex ? nextSegment : value,
      ),
      updatedAt: chunk.createdAt,
    });
    await Promise.all([
      transaction.objectStore("audioChunks").put(chunk),
      recordings.put(nextRecording),
    ]);
    await transaction.done;
    return chunk;
  }

  async getAudioChunk(id: string): Promise<AudioChunk | undefined> {
    return this.database.get("audioChunks", id);
  }

  async listAudioChunks(recordingId?: string): Promise<AudioChunk[]> {
    const chunks = recordingId
      ? await this.database.getAllFromIndex(
          "audioChunks",
          "recordingId",
          recordingId,
        )
      : await this.database.getAll("audioChunks");
    return chunks.sort((left, right) => left.sequence - right.sequence);
  }

  async assembleRecordingBlob(recordingId: string): Promise<Blob> {
    const recording = await this.getRecording(recordingId);
    if (!recording) throw new Error(`Recording not found: ${recordingId}`);
    const chunks = await this.listAudioChunks(recordingId);
    if (chunks.length === 0)
      throw new Error(`Recording has no local audio: ${recordingId}`);
    const byteArrays = await Promise.all(
      chunks.map(
        async (chunk) => new Uint8Array(await chunk.blob.arrayBuffer()),
      ),
    );
    const totalBytes = byteArrays.reduce(
      (total, bytes) => total + bytes.byteLength,
      0,
    );
    const combined = new Uint8Array(totalBytes);
    let offset = 0;
    for (const bytes of byteArrays) {
      combined.set(bytes, offset);
      offset += bytes.byteLength;
    }
    return new Response(combined.buffer, {
      headers: { "content-type": recording.mimeType },
    }).blob();
  }

  async updateRecordingStatus(
    recordingId: string,
    status: VoiceRecording["status"],
    changes: Partial<
      Pick<
        VoiceRecording,
        | "acceptedAt"
        | "provider"
        | "model"
        | "remoteObjectRef"
        | "failureCode"
        | "failureMessage"
      >
    > = {},
    now = new Date().toISOString(),
  ): Promise<VoiceRecording> {
    const recording = await this.getRecording(recordingId);
    if (!recording) throw new Error(`Recording not found: ${recordingId}`);
    return this.saveRecording({
      ...recording,
      ...changes,
      status,
      updatedAt: now,
    });
  }

  async enqueueTranscription(
    recordingId: string,
    now = new Date().toISOString(),
  ): Promise<TranscriptionQueueItem> {
    const transaction = this.database.transaction(
      ["recordings", "transcriptionQueue"],
      "readwrite",
    );
    const recordings = transaction.objectStore("recordings");
    const recording = await recordings.get(recordingId);
    if (!recording) throw new Error(`Recording not found: ${recordingId}`);
    if (!recording.acceptedAt)
      throw new Error(
        "Recording must be explicitly accepted before transcription",
      );
    const queueStore = transaction.objectStore("transcriptionQueue");
    const current = await queueStore.index("recordingId").get(recordingId);
    const queueItem = TranscriptionQueueItemSchema.parse({
      schemaVersion: 1,
      id: current?.id ?? `transcription-${recordingId}`,
      recordingId,
      status: "QUEUED",
      attempts: current?.attempts ?? 0,
      nextAttemptAt: null,
      lastError: null,
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
    });
    const nextRecording = VoiceRecordingSchema.parse({
      ...recording,
      status: "TRANSCRIPTION_QUEUED",
      failureCode: null,
      failureMessage: null,
      updatedAt: now,
    });
    await Promise.all([
      queueStore.put(queueItem),
      recordings.put(nextRecording),
    ]);
    await transaction.done;
    return queueItem;
  }

  async listTranscriptionQueue(
    status?: TranscriptionQueueItem["status"],
  ): Promise<TranscriptionQueueItem[]> {
    return status
      ? this.database.getAllFromIndex("transcriptionQueue", "status", status)
      : this.database.getAll("transcriptionQueue");
  }

  async updateTranscriptionQueueItem(
    recordingId: string,
    changes: Partial<
      Pick<
        TranscriptionQueueItem,
        "status" | "attempts" | "nextAttemptAt" | "lastError"
      >
    >,
    now = new Date().toISOString(),
  ): Promise<TranscriptionQueueItem> {
    const current = await this.database.getFromIndex(
      "transcriptionQueue",
      "recordingId",
      recordingId,
    );
    if (!current) {
      throw new Error(`Transcription queue item not found: ${recordingId}`);
    }
    const next = TranscriptionQueueItemSchema.parse({
      ...current,
      ...changes,
      updatedAt: now,
    });
    await this.database.put("transcriptionQueue", next);
    return next;
  }

  async saveTranscript(value: Transcript): Promise<Transcript> {
    const parsed = TranscriptSchema.parse(value);
    const transaction = this.database.transaction(
      ["transcripts", "recordings", "transcriptionQueue"],
      "readwrite",
    );
    const transcripts = transaction.objectStore("transcripts");
    const existing = await transcripts
      .index("recordingId")
      .get(parsed.recordingId);
    if (existing && existing.originalText !== parsed.originalText) {
      throw new Error("The original transcript is immutable");
    }
    const recording = await transaction
      .objectStore("recordings")
      .get(parsed.recordingId);
    if (!recording)
      throw new Error(`Recording not found: ${parsed.recordingId}`);
    const nextRecording = VoiceRecordingSchema.parse({
      ...recording,
      status: "TRANSCRIBED",
      provider: parsed.provider,
      model: parsed.model,
      failureCode: null,
      failureMessage: null,
      updatedAt: new Date().toISOString(),
    });
    const queueItem = await transaction
      .objectStore("transcriptionQueue")
      .index("recordingId")
      .get(parsed.recordingId);
    await Promise.all([
      transcripts.put(parsed),
      transaction.objectStore("recordings").put(nextRecording),
      queueItem
        ? transaction.objectStore("transcriptionQueue").delete(queueItem.id)
        : Promise.resolve(undefined),
    ]);
    await transaction.done;
    return parsed;
  }

  async getTranscript(id: string): Promise<Transcript | undefined> {
    return this.database.get("transcripts", id);
  }

  async getTranscriptForRecording(
    recordingId: string,
  ): Promise<Transcript | undefined> {
    return this.database.getFromIndex(
      "transcripts",
      "recordingId",
      recordingId,
    );
  }

  async correctTranscript(
    transcriptId: string,
    correctedText: string,
    provenance: Provenance = systemProvenance,
    now = new Date().toISOString(),
  ): Promise<Transcript> {
    const transcript = await this.getTranscript(transcriptId);
    if (!transcript) throw new Error(`Transcript not found: ${transcriptId}`);
    const corrected = TranscriptSchema.parse({
      ...transcript,
      correctedText,
      correctedAt: now,
      corrections: [
        ...transcript.corrections,
        {
          id: makeId("transcript-correction"),
          text: correctedText,
          correctedAt: now,
          provenance,
        },
      ],
    });
    await this.database.put("transcripts", corrected);
    return corrected;
  }

  async saveDerivedNote(value: DerivedNote): Promise<DerivedNote> {
    const parsed = DerivedNoteSchema.parse(value);
    const transcript = await this.getTranscript(parsed.transcriptId);
    if (!transcript)
      throw new Error(`Transcript not found: ${parsed.transcriptId}`);
    await this.database.put("derivedNotes", parsed);
    return parsed;
  }

  async getDerivedNotesForTranscript(
    transcriptId: string,
  ): Promise<DerivedNote[]> {
    return this.database.getAllFromIndex(
      "derivedNotes",
      "transcriptId",
      transcriptId,
    );
  }

  async saveAttachment(value: Attachment, blob: Blob): Promise<Attachment> {
    const parsed = AttachmentSchema.parse(value);
    if (parsed.sizeBytes !== blob.size)
      throw new Error("Attachment metadata size does not match the blob");
    if (parsed.mimeType !== blob.type && blob.type !== "") {
      throw new Error("Attachment metadata MIME type does not match the blob");
    }
    const attachmentBlob: AttachmentBlob = {
      schemaVersion: 1,
      id: parsed.localBlobRef,
      attachmentId: parsed.id,
      createdAt: parsed.createdAt,
      blob,
    };
    const transaction = this.database.transaction(
      ["attachments", "attachmentBlobs"],
      "readwrite",
    );
    await Promise.all([
      transaction.objectStore("attachments").put(parsed),
      transaction.objectStore("attachmentBlobs").put(attachmentBlob),
    ]);
    await transaction.done;
    return parsed;
  }

  async getAttachment(id: string): Promise<Attachment | undefined> {
    return this.database.get("attachments", id);
  }

  async listAttachments(parentId?: string): Promise<Attachment[]> {
    return parentId
      ? this.database.getAllFromIndex("attachments", "parentId", parentId)
      : this.database.getAll("attachments");
  }

  async getAttachmentBlob(attachmentId: string): Promise<Blob | undefined> {
    const stored = await this.database.getFromIndex(
      "attachmentBlobs",
      "attachmentId",
      attachmentId,
    );
    return stored?.blob;
  }

  async listAttachmentBlobs(): Promise<AttachmentBlob[]> {
    return this.database.getAll("attachmentBlobs");
  }

  async saveRevision(value: Revision): Promise<Revision> {
    const parsed = RevisionSchema.parse(value);
    await this.database.put("revisions", parsed);
    return parsed;
  }

  async listRevisions(entityId: string): Promise<Revision[]> {
    return this.database.getAllFromIndex("revisions", "entityId", entityId);
  }

  async savePath(value: PathState): Promise<PathState> {
    const parsed = PathStateSchema.parse(value);
    await this.database.put("paths", parsed);
    return parsed;
  }

  async getPath(id: string): Promise<PathState | undefined> {
    return this.database.get("paths", id);
  }

  async listPaths(): Promise<PathState[]> {
    return this.database.getAll("paths");
  }

  async saveMirrorRequest(value: MirrorRequest): Promise<MirrorRequest> {
    const parsed = MirrorRequestSchema.parse(value);
    if (
      parsed.sourceSnapshots.length !== parsed.sourceRecordIds.length ||
      parsed.sourceSnapshots.some(
        (source) => !parsed.sourceRecordIds.includes(source.recordId),
      )
    ) {
      throw new Error(
        "Mirror request source snapshots must match the selected records",
      );
    }
    await this.database.put("mirrorRequests", parsed);
    return parsed;
  }

  async getMirrorRequest(
    id: string,
    options: ListMirrorOptions = {},
  ): Promise<MirrorRequest | undefined> {
    const value = await this.database.get("mirrorRequests", id);
    if (!value) return undefined;
    const parsed = MirrorRequestSchema.parse(value);
    return options.includeDeleted === true || parsed.deletedAt === null
      ? parsed
      : undefined;
  }

  async listMirrorRequests(
    status?: MirrorJobStatus,
    options: ListMirrorOptions = {},
  ): Promise<MirrorRequest[]> {
    const stored = status
      ? await this.database.getAllFromIndex("mirrorRequests", "status", status)
      : await this.database.getAll("mirrorRequests");
    return stored
      .map((request) => MirrorRequestSchema.parse(request))
      .filter(
        (request) =>
          options.includeDeleted === true || request.deletedAt === null,
      )
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async deleteMirrorRequest(
    requestId: string,
    now = new Date().toISOString(),
  ): Promise<MirrorRequest> {
    const transaction = this.database.transaction(
      ["mirrorRequests", "mirrorResults"],
      "readwrite",
    );
    const [storedRequest, storedResult] = await Promise.all([
      transaction.objectStore("mirrorRequests").get(requestId),
      transaction
        .objectStore("mirrorResults")
        .index("requestId")
        .get(requestId),
    ]);
    if (!storedRequest) {
      await transaction.done;
      throw new Error(`Mirror request not found: ${requestId}`);
    }
    if (storedResult) {
      await transaction.done;
      throw new Error(
        "A Mirror request with a result must use paired reflection deletion.",
      );
    }
    const current = MirrorRequestSchema.parse(storedRequest);
    if (current.deletedAt !== null) {
      await transaction.done;
      return current;
    }
    const deleted = MirrorRequestSchema.parse({
      ...current,
      deletedAt: now,
      updatedAt: now,
    });
    await transaction.objectStore("mirrorRequests").put(deleted);
    await transaction.done;
    return deleted;
  }

  async restoreMirrorRequest(
    requestId: string,
    now = new Date().toISOString(),
  ): Promise<MirrorRequest> {
    const transaction = this.database.transaction(
      ["mirrorRequests", "mirrorResults"],
      "readwrite",
    );
    const [storedRequest, storedResult] = await Promise.all([
      transaction.objectStore("mirrorRequests").get(requestId),
      transaction
        .objectStore("mirrorResults")
        .index("requestId")
        .get(requestId),
    ]);
    if (!storedRequest) {
      await transaction.done;
      throw new Error(`Mirror request not found: ${requestId}`);
    }
    if (storedResult) {
      await transaction.done;
      throw new Error(
        "A Mirror request with a result must use paired reflection restoration.",
      );
    }
    const current = MirrorRequestSchema.parse(storedRequest);
    if (current.deletedAt === null) {
      await transaction.done;
      return current;
    }
    const restored = MirrorRequestSchema.parse({
      ...current,
      // A remote job was verified absent before the tombstone was written.
      // Explicit restoration therefore creates a new local queue attempt while
      // retaining the original prompt, source IDs, and immutable snapshots.
      status: "QUEUED_LOCAL",
      remoteJobId: null,
      nextAttemptAt: null,
      lastError: null,
      deletedAt: null,
      updatedAt: now,
    });
    await transaction.objectStore("mirrorRequests").put(restored);
    await transaction.done;
    return restored;
  }

  async purgeMirrorRequest(requestId: string): Promise<MirrorPurgeResult> {
    const transaction = this.database.transaction(
      ["mirrorRequests", "mirrorResults"],
      "readwrite",
    );
    const [storedRequest, storedResult] = await Promise.all([
      transaction.objectStore("mirrorRequests").get(requestId),
      transaction
        .objectStore("mirrorResults")
        .index("requestId")
        .get(requestId),
    ]);
    if (!storedRequest) {
      await transaction.done;
      throw new Error(`Mirror request not found: ${requestId}`);
    }
    if (storedResult) {
      await transaction.done;
      throw new Error(
        "A Mirror request with a result must use paired reflection purge.",
      );
    }
    const request = MirrorRequestSchema.parse(storedRequest);
    if (request.deletedAt === null) {
      await transaction.done;
      throw new Error("A live Mirror request must be tombstoned before purge.");
    }
    await transaction.objectStore("mirrorRequests").delete(request.id);
    await transaction.done;
    return { requestId: request.id, resultId: null };
  }

  async saveMirrorResult(value: MirrorResult): Promise<MirrorResult> {
    const candidate = MirrorResultSchema.parse(value);
    const request = await this.getMirrorRequest(candidate.requestId);
    if (!request)
      throw new Error(`Mirror request not found: ${candidate.requestId}`);
    const parsed = MirrorResultSchema.parse({
      ...candidate,
      query: candidate.query || request.prompt,
      sourceRecordIds:
        candidate.sourceRecordIds.length > 0
          ? candidate.sourceRecordIds
          : request.sourceRecordIds,
    });
    if (
      parsed.query !== request.prompt ||
      !sameIds(parsed.sourceRecordIds, request.sourceRecordIds)
    ) {
      throw new Error(
        "Mirror result query and source IDs must match the submitted request",
      );
    }
    if (
      parsed.citations.some(
        (citation) => !request.sourceRecordIds.includes(citation.recordId),
      )
    ) {
      throw new Error(
        "Mirror result cited a record outside the submitted source set",
      );
    }
    const transaction = this.database.transaction(
      ["mirrorResults", "mirrorRequests"],
      "readwrite",
    );
    const completedRequest = MirrorRequestSchema.parse({
      ...request,
      status: "COMPLETE",
      remoteJobId: parsed.remoteJobId,
      nextAttemptAt: null,
      lastError: null,
      updatedAt: parsed.createdAt,
    });
    await Promise.all([
      transaction.objectStore("mirrorResults").put(parsed),
      transaction.objectStore("mirrorRequests").put(completedRequest),
    ]);
    await transaction.done;
    return parsed;
  }

  async getMirrorResultForRequest(
    requestId: string,
    options: ListMirrorOptions = {},
  ): Promise<MirrorResult | undefined> {
    const value = await this.database.getFromIndex(
      "mirrorResults",
      "requestId",
      requestId,
    );
    if (!value) return undefined;
    const parsed = MirrorResultSchema.parse(value);
    return options.includeDeleted === true || parsed.deletedAt === null
      ? parsed
      : undefined;
  }

  async getMirrorResult(
    id: string,
    options: ListMirrorOptions = {},
  ): Promise<MirrorResult | undefined> {
    const value = await this.database.get("mirrorResults", id);
    if (!value) return undefined;
    const parsed = MirrorResultSchema.parse(value);
    return options.includeDeleted === true || parsed.deletedAt === null
      ? parsed
      : undefined;
  }

  async listMirrorResults(
    options: ListMirrorOptions = {},
  ): Promise<MirrorResult[]> {
    const results = await this.database.getAll("mirrorResults");
    return results
      .map((result) => MirrorResultSchema.parse(result))
      .filter(
        (result) =>
          options.includeDeleted === true || result.deletedAt === null,
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async reviewMirrorResult(
    resultId: string,
    input: ReviewMirrorResultInput,
    now = new Date().toISOString(),
  ): Promise<MirrorResult> {
    const stored = await this.database.get("mirrorResults", resultId);
    if (!stored) throw new Error(`Mirror result not found: ${resultId}`);
    const current = MirrorResultSchema.parse(stored);
    if (current.deletedAt) {
      throw new Error("A deleted Mirror reflection cannot be reviewed.");
    }

    const text =
      input.action === "revised" ? (input.text ?? "").trim() : current.text;
    if (!text) throw new Error("A revised Mirror reflection needs text.");
    const proposedQuestion =
      input.proposedQuestion === undefined
        ? current.proposedQuestion
        : normalizedOptionalText(input.proposedQuestion);
    const proposedAction =
      input.proposedAction === undefined
        ? current.proposedAction
        : normalizedOptionalText(input.proposedAction);
    if (input.action === "revised" && (!proposedQuestion || !proposedAction)) {
      throw new Error(
        "A revised Mirror reflection needs one proposed question and one proposed action.",
      );
    }
    const annotation =
      input.annotation === undefined
        ? current.annotation
        : normalizedOptionalText(input.annotation);
    if (input.action === "annotated" && !annotation) {
      throw new Error("An annotation cannot be empty.");
    }
    const disposition =
      input.action === "annotated" ? current.disposition : input.action;
    const revision = {
      id: makeId("mirror-revision"),
      createdAt: now,
      action: input.action,
      disposition,
      text,
      proposedQuestion,
      proposedAction,
      annotation,
    };
    const baseline =
      current.revisionHistory.length === 0
        ? [initialMirrorResultRevision(current)]
        : [];
    const next = MirrorResultSchema.parse({
      ...current,
      text,
      proposedQuestion,
      proposedAction,
      annotation,
      disposition,
      revisionHistory: [...current.revisionHistory, ...baseline, revision],
    });
    await this.database.put("mirrorResults", next);
    return next;
  }

  async deleteMirrorReflection(
    requestId: string,
    resultId: string,
    now = new Date().toISOString(),
  ): Promise<MirrorReflectionDeletionResult> {
    return this.setMirrorReflectionDeletion(requestId, resultId, now, true);
  }

  async restoreMirrorReflection(
    requestId: string,
    resultId: string,
    now = new Date().toISOString(),
  ): Promise<MirrorReflectionDeletionResult> {
    return this.setMirrorReflectionDeletion(requestId, resultId, now, false);
  }

  async purgeMirrorReflection(
    requestId: string,
    resultId: string,
  ): Promise<MirrorPurgeResult> {
    const transaction = this.database.transaction(
      ["mirrorRequests", "mirrorResults"],
      "readwrite",
    );
    const [storedRequest, storedResult] = await Promise.all([
      transaction.objectStore("mirrorRequests").get(requestId),
      transaction.objectStore("mirrorResults").get(resultId),
    ]);
    if (!storedRequest || !storedResult) {
      await transaction.done;
      throw new Error("The Mirror request or result no longer exists.");
    }
    const request = MirrorRequestSchema.parse(storedRequest);
    const result = MirrorResultSchema.parse(storedResult);
    if (result.requestId !== request.id) {
      await transaction.done;
      throw new Error("The Mirror result does not belong to this request.");
    }
    if (request.deletedAt === null || result.deletedAt === null) {
      await transaction.done;
      throw new Error(
        "A live Mirror reflection must be tombstoned before purge.",
      );
    }
    await Promise.all([
      transaction.objectStore("mirrorResults").delete(result.id),
      transaction.objectStore("mirrorRequests").delete(request.id),
    ]);
    await transaction.done;
    return { requestId: request.id, resultId: result.id };
  }

  private async setMirrorReflectionDeletion(
    requestId: string,
    resultId: string,
    now: string,
    deleted: boolean,
  ): Promise<MirrorReflectionDeletionResult> {
    const transaction = this.database.transaction(
      ["mirrorRequests", "mirrorResults"],
      "readwrite",
    );
    const [storedRequest, storedResult] = await Promise.all([
      transaction.objectStore("mirrorRequests").get(requestId),
      transaction.objectStore("mirrorResults").get(resultId),
    ]);
    if (!storedRequest || !storedResult) {
      await transaction.done;
      throw new Error("The Mirror request or result no longer exists.");
    }
    const currentRequest = MirrorRequestSchema.parse(storedRequest);
    const currentResult = MirrorResultSchema.parse(storedResult);
    if (currentResult.requestId !== currentRequest.id) {
      await transaction.done;
      throw new Error("The Mirror result does not belong to this request.");
    }
    const deletedAt = deleted ? now : null;
    if (
      (currentResult.deletedAt !== null) === deleted &&
      (currentRequest.deletedAt !== null) === deleted
    ) {
      await transaction.done;
      return { request: currentRequest, result: currentResult };
    }
    const result = MirrorResultSchema.parse({
      ...currentResult,
      deletedAt,
      revisionHistory: [
        ...currentResult.revisionHistory,
        ...(currentResult.revisionHistory.length === 0
          ? [initialMirrorResultRevision(currentResult)]
          : []),
        {
          id: makeId("mirror-revision"),
          createdAt: now,
          action: deleted ? "deleted" : "restored",
          disposition: currentResult.disposition,
          text: currentResult.text,
          proposedQuestion: currentResult.proposedQuestion,
          proposedAction: currentResult.proposedAction,
          annotation: currentResult.annotation,
        },
      ],
    });
    const request = MirrorRequestSchema.parse({
      ...currentRequest,
      deletedAt,
      updatedAt: now,
    });
    await Promise.all([
      transaction.objectStore("mirrorRequests").put(request),
      transaction.objectStore("mirrorResults").put(result),
    ]);
    await transaction.done;
    return { request, result };
  }

  async getMirrorInsightFeedback(
    insightKey: string,
    options: ListMirrorOptions = {},
  ): Promise<MirrorInsightFeedback | undefined> {
    const value = await this.database.getFromIndex(
      "mirrorInsightFeedback",
      "insightKey",
      insightKey,
    );
    if (!value) return undefined;
    const parsed = MirrorInsightFeedbackSchema.parse(value);
    return options.includeDeleted === true || parsed.deletedAt === null
      ? parsed
      : undefined;
  }

  async listMirrorInsightFeedback(
    options: ListMirrorOptions = {},
  ): Promise<MirrorInsightFeedback[]> {
    const feedback = await this.database.getAll("mirrorInsightFeedback");
    return feedback
      .map((item) => MirrorInsightFeedbackSchema.parse(item))
      .filter(
        (item) => options.includeDeleted === true || item.deletedAt === null,
      )
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async reviewMirrorInsight(
    input: ReviewMirrorInsightInput,
    now = new Date().toISOString(),
  ): Promise<MirrorInsightFeedback> {
    const sourceRecordIds = [...new Set(input.sourceRecordIds)];
    if (sourceRecordIds.length === 0) {
      throw new Error("A deterministic insight needs exact source records.");
    }
    const transaction = this.database.transaction(
      ["records", "mirrorInsightFeedback"],
      "readwrite",
    );
    const sources = await Promise.all(
      sourceRecordIds.map((recordId) =>
        transaction.objectStore("records").get(recordId),
      ),
    );
    if (sources.some((record) => !record || record.deletedAt !== null)) {
      await transaction.done;
      throw new Error("A deterministic insight source is missing or deleted.");
    }
    const existingValue = await transaction
      .objectStore("mirrorInsightFeedback")
      .index("insightKey")
      .get(input.insightKey);
    const existing = existingValue
      ? MirrorInsightFeedbackSchema.parse(existingValue)
      : null;
    if (existing?.deletedAt) {
      await transaction.done;
      throw new Error(
        "A deleted deterministic insight review must be restored before editing.",
      );
    }
    const correction =
      input.action === "corrected"
        ? normalizedOptionalText(input.correction ?? null)
        : (existing?.correction ?? null);
    if (input.action === "corrected" && !correction) {
      await transaction.done;
      throw new Error("A corrected insight needs correction text.");
    }
    const annotation =
      input.annotation === undefined
        ? (existing?.annotation ?? null)
        : normalizedOptionalText(input.annotation);
    if (input.action === "annotated" && !annotation) {
      await transaction.done;
      throw new Error("An insight annotation cannot be empty.");
    }
    const disposition =
      input.action === "annotated"
        ? (existing?.disposition ?? "unreviewed")
        : input.action;
    const revision = {
      id: makeId("mirror-insight-review"),
      createdAt: now,
      action: input.action,
      disposition,
      correction,
      annotation,
      sourceRecordIds,
    };
    const feedback = MirrorInsightFeedbackSchema.parse({
      schemaVersion: 1,
      id: existing?.id ?? makeId("mirror-insight-feedback"),
      insightKey: input.insightKey,
      kind: input.kind,
      label: input.label,
      sourceRecordIds,
      disposition,
      correction,
      annotation,
      revisionHistory: [...(existing?.revisionHistory ?? []), revision],
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      deletedAt: null,
    });
    await transaction.objectStore("mirrorInsightFeedback").put(feedback);
    await transaction.done;
    return feedback;
  }

  async deleteMirrorInsightFeedback(
    feedbackId: string,
    now = new Date().toISOString(),
  ): Promise<MirrorInsightFeedback> {
    return this.setMirrorInsightFeedbackDeletion(feedbackId, now, true);
  }

  async restoreMirrorInsightFeedback(
    feedbackId: string,
    now = new Date().toISOString(),
  ): Promise<MirrorInsightFeedback> {
    return this.setMirrorInsightFeedbackDeletion(feedbackId, now, false);
  }

  private async setMirrorInsightFeedbackDeletion(
    feedbackId: string,
    now: string,
    deleted: boolean,
  ): Promise<MirrorInsightFeedback> {
    const stored = await this.database.get("mirrorInsightFeedback", feedbackId);
    if (!stored) {
      throw new Error(`Mirror insight feedback not found: ${feedbackId}`);
    }
    const current = MirrorInsightFeedbackSchema.parse(stored);
    if ((current.deletedAt !== null) === deleted) return current;
    const next = MirrorInsightFeedbackSchema.parse({
      ...current,
      deletedAt: deleted ? now : null,
      updatedAt: now,
      revisionHistory: [
        ...current.revisionHistory,
        {
          id: makeId("mirror-insight-review"),
          createdAt: now,
          action: deleted ? "deleted" : "restored",
          disposition: current.disposition,
          correction: current.correction,
          annotation: current.annotation,
          sourceRecordIds: current.sourceRecordIds,
        },
      ],
    });
    await this.database.put("mirrorInsightFeedback", next);
    return next;
  }

  async purgeMirrorInsightFeedback(feedbackId: string): Promise<string> {
    const stored = await this.database.get("mirrorInsightFeedback", feedbackId);
    if (!stored) {
      throw new Error(`Mirror insight feedback not found: ${feedbackId}`);
    }
    const feedback = MirrorInsightFeedbackSchema.parse(stored);
    if (feedback.deletedAt === null) {
      throw new Error(
        "A live deterministic insight review must be tombstoned before purge.",
      );
    }
    await this.database.delete("mirrorInsightFeedback", feedback.id);
    return feedback.id;
  }

  async saveRegSession(value: RegSession): Promise<RegSession> {
    const parsed = RegSessionSchema.parse(value);
    await this.database.put("regSessions", parsed);
    return parsed;
  }

  async getRegSession(id: string): Promise<RegSession | undefined> {
    return this.database.get("regSessions", id);
  }

  async completeReg01(
    sessionId: string,
    now = new Date().toISOString(),
  ): Promise<CompleteReg01Result> {
    const transaction = this.database.transaction(
      [
        "regSessions",
        "records",
        "searchDocuments",
        "paths",
        "attachments",
        "recordings",
        "audioChunks",
      ],
      "readwrite",
    );
    const sessions = transaction.objectStore("regSessions");
    const session = await sessions.get(sessionId);
    if (!session) throw new Error(`REG session not found: ${sessionId}`);

    if (session.status !== "complete") {
      const issues = getReg01CompletionIssues(session);
      if (issues.length > 0) throw new RegCompletionError(issues);
      const attachments = await Promise.all(
        session.attachmentIds.map((id) =>
          transaction.objectStore("attachments").get(id),
        ),
      );
      if (
        attachments.some(
          (attachment) => !attachment || attachment.parentId !== session.id,
        )
      ) {
        throw new RegCompletionError([
          "every session attachment must exist and belong to the session",
        ]);
      }
      if (
        !attachments.some(
          (attachment) =>
            attachment?.kind === "image" || attachment?.kind === "drawing",
        )
      ) {
        throw new RegCompletionError([
          "a geometry photograph or drawing is required",
        ]);
      }
      const recording = session.autoDictationRecordingId
        ? await transaction
            .objectStore("recordings")
            .get(session.autoDictationRecordingId)
        : undefined;
      const recordingChunks = recording
        ? await transaction
            .objectStore("audioChunks")
            .index("recordingId")
            .getAll(recording.id)
        : [];
      if (
        !recording?.acceptedAt ||
        recording.durationMs < 5 * 60 * 1_000 ||
        recording.destinationId !== session.id ||
        recordingChunks.length === 0
      ) {
        throw new RegCompletionError([
          "an accepted five-minute auto-dictation recording linked to this session is required",
        ]);
      }
    }

    const rawObservation = session.rawObservation;
    const autoDictation = session.autoDictation;
    if (!rawObservation || !autoDictation) {
      throw new RegCompletionError([
        "raw observation and auto-dictation are required",
      ]);
    }

    const resultingIds = session.resultingRecordIds ?? {
      studio: `${session.id}:studio`,
      codex: `${session.id}:codex`,
      mirror: `${session.id}:mirror`,
    };
    const shared = {
      schemaVersion: 1 as const,
      createdAt: session.completedAt ?? now,
      updatedAt: now,
      tags: ["reg-01", "geometry", "learn-to-see"],
      backlinks: [],
      sourceLinks: [
        {
          id: "source-reg-philosophical-geometry",
          label: "Robert Edward Grant — Philosophical Geometry",
          sourceType: "url" as const,
          url: "https://robertedwardgrant.com/courses/Philosophical-Geometry/",
          citation: "Public source framework; QCTP exercise is original.",
          accessedAt: null,
        },
      ],
      attachmentIds: session.attachmentIds,
      revisionIds: [],
      pathId: "reg-path",
      sessionId: session.id,
      deletedAt: null,
    };
    const studioRecord = CodexRecordSchema.parse({
      ...shared,
      id: resultingIds.studio,
      kind: "geometry",
      title: "REG-01-A — Learn to See: Two Equal Circles",
      observation: rawObservation,
      interpretation: session.interpretation,
      fields: {
        surface: "studio",
        moduleId: session.moduleId,
        precept: session.precept,
      },
    });
    const codexRecord = CodexRecordSchema.parse({
      ...shared,
      id: resultingIds.codex,
      kind: "auto_dictation",
      title: "REG-01-A Auto-Dictation",
      observation: autoDictation,
      interpretation: null,
      fields: {
        surface: "codex",
        prompt:
          "What did the act of constructing reveal that looking at a finished image would not have revealed?",
      },
    });
    const mirrorRecord = CodexRecordSchema.parse({
      ...shared,
      id: resultingIds.mirror,
      kind: "mirror",
      title: "REG-01-A Mirror — Observe Before Interpreting",
      observation: rawObservation,
      interpretation: session.interpretation,
      fields: {
        surface: "mirror",
        integrationAction: session.integrationAction,
        preceptReview: session.precept.review,
        evidenceRecordIds: [resultingIds.studio, resultingIds.codex],
      },
    });
    const currentPath = await transaction.objectStore("paths").get("reg-path");
    const defaultPath = createDefaultPathStates(now).find(
      (path) => path.id === "reg-path",
    );
    if (!defaultPath) throw new Error("REG path default is unavailable");
    const basePath = currentPath ?? defaultPath;
    const path = PathStateSchema.parse({
      ...basePath,
      currentModule: Math.max(2, basePath.currentModule),
      completedModuleIds: [
        ...new Set([...basePath.completedModuleIds, "REG-01-A"]),
      ],
      updatedAt: now,
    });
    const completedSession = RegSessionSchema.parse({
      ...session,
      status: "complete",
      startedAt: session.startedAt ?? now,
      completedAt: session.completedAt ?? now,
      resultingRecordIds: resultingIds,
      updatedAt: now,
    });
    await Promise.all([
      sessions.put(completedSession),
      transaction.objectStore("paths").put(path),
      ...[studioRecord, codexRecord, mirrorRecord].flatMap((record) => [
        transaction.objectStore("records").put(record),
        transaction
          .objectStore("searchDocuments")
          .put(recordToSearchDocument(record)),
      ]),
    ]);
    await transaction.done;
    return {
      session: completedSession,
      studioRecord,
      codexRecord,
      mirrorRecord,
      path,
    };
  }

  async saveMigrationLedgerEntry(
    value: MigrationLedgerEntry,
  ): Promise<MigrationLedgerEntry> {
    const parsed = MigrationLedgerEntrySchema.parse(value);
    await this.database.put("migrationLedger", parsed);
    return parsed;
  }

  async findMigrationByFingerprint(
    fingerprint: string,
  ): Promise<MigrationLedgerEntry | undefined> {
    return this.database.getFromIndex(
      "migrationLedger",
      "sourceFingerprint",
      fingerprint,
    );
  }

  async deleteRecording(
    recordingId: string,
    selection: DeleteRecordingSelection = {},
  ): Promise<DeleteRecordingResult> {
    const removeAudio = selection.audio ?? true;
    const removeTranscript = selection.transcript ?? true;
    const removeDerived = selection.derivedNotes ?? true;
    const removeMetadata = selection.metadata ?? true;
    const transaction = this.database.transaction(
      [
        "recordings",
        "audioChunks",
        "transcripts",
        "derivedNotes",
        "transcriptionQueue",
      ],
      "readwrite",
    );
    const recording = await transaction
      .objectStore("recordings")
      .get(recordingId);
    if (!recording) throw new Error(`Recording not found: ${recordingId}`);
    const result: DeleteRecordingResult = {
      deletedChunkIds: [],
      deletedTranscriptIds: [],
      deletedDerivedNoteIds: [],
      remoteObjectsToDelete: recording.remoteObjectRef
        ? [recording.remoteObjectRef]
        : [],
    };
    if (removeAudio || removeMetadata) {
      const chunks = await transaction
        .objectStore("audioChunks")
        .index("recordingId")
        .getAll(recordingId);
      result.deletedChunkIds.push(...chunks.map((chunk) => chunk.id));
      await Promise.all(
        chunks.map((chunk) =>
          transaction.objectStore("audioChunks").delete(chunk.id),
        ),
      );
    }
    const transcript = await transaction
      .objectStore("transcripts")
      .index("recordingId")
      .get(recordingId);
    if (transcript && (removeTranscript || removeMetadata)) {
      result.deletedTranscriptIds.push(transcript.id);
      await transaction.objectStore("transcripts").delete(transcript.id);
    }
    if (transcript && (removeDerived || removeTranscript || removeMetadata)) {
      const notes = await transaction
        .objectStore("derivedNotes")
        .index("transcriptId")
        .getAll(transcript.id);
      result.deletedDerivedNoteIds.push(...notes.map((note) => note.id));
      await Promise.all(
        notes.map((note) =>
          transaction.objectStore("derivedNotes").delete(note.id),
        ),
      );
    }
    const queue = await transaction
      .objectStore("transcriptionQueue")
      .index("recordingId")
      .get(recordingId);
    if (queue)
      await transaction.objectStore("transcriptionQueue").delete(queue.id);
    if (removeMetadata) {
      await transaction.objectStore("recordings").delete(recordingId);
    } else if (removeAudio) {
      const now = new Date().toISOString();
      const tombstone = VoiceRecordingSchema.parse({
        ...recording,
        sizeBytes: 0,
        segments: recording.segments.map((segment) => ({
          ...segment,
          sizeBytes: 0,
          chunkIds: [],
        })),
        status: "DELETED",
        deletedAt: now,
        updatedAt: now,
      });
      await transaction.objectStore("recordings").put(tombstone);
    }
    await transaction.done;
    return result;
  }

  async deleteRecord(
    id: string,
    options: DeleteRecordOptions = {},
  ): Promise<void> {
    const removeAttachments = options.attachments ?? true;
    const removeRevisions = options.revisions ?? true;
    const removeBacklinks = options.backlinks ?? true;
    const transaction = this.database.transaction(
      [
        "records",
        "searchDocuments",
        "attachments",
        "attachmentBlobs",
        "revisions",
        "mirrorRequests",
        "mirrorResults",
        "mirrorInsightFeedback",
      ],
      "readwrite",
    );
    const record = await transaction.objectStore("records").get(id);
    if (!record) return;
    const [mirrorRequests, mirrorResults, mirrorInsightFeedback] =
      await Promise.all([
        transaction.objectStore("mirrorRequests").getAll(),
        transaction.objectStore("mirrorResults").getAll(),
        transaction.objectStore("mirrorInsightFeedback").getAll(),
      ]);
    if (
      mirrorRequests.some((request) => request.sourceRecordIds.includes(id)) ||
      mirrorResults.some((result) =>
        MirrorResultSchema.parse(result).sourceRecordIds.includes(id),
      ) ||
      mirrorInsightFeedback.some((feedback) =>
        feedback.sourceRecordIds.includes(id),
      )
    ) {
      await transaction.done;
      throw new Error(
        "This record is preserved because Mirror provenance still references it.",
      );
    }
    if (removeAttachments) {
      const attachments = await transaction
        .objectStore("attachments")
        .index("parentId")
        .getAll(id);
      for (const attachment of attachments) {
        const binary = await transaction
          .objectStore("attachmentBlobs")
          .index("attachmentId")
          .get(attachment.id);
        if (binary)
          await transaction.objectStore("attachmentBlobs").delete(binary.id);
        await transaction.objectStore("attachments").delete(attachment.id);
      }
    }
    if (removeRevisions) {
      const revisions = await transaction
        .objectStore("revisions")
        .index("entityId")
        .getAll(id);
      await Promise.all(
        revisions.map((revision) =>
          transaction.objectStore("revisions").delete(revision.id),
        ),
      );
    }
    if (removeBacklinks) {
      const allRecords = await transaction.objectStore("records").getAll();
      for (const candidate of allRecords) {
        const backlinks = candidate.backlinks.filter(
          (backlink) => backlink.recordId !== id,
        );
        if (backlinks.length !== candidate.backlinks.length) {
          const next = CodexRecordSchema.parse({ ...candidate, backlinks });
          await transaction.objectStore("records").put(next);
          await transaction
            .objectStore("searchDocuments")
            .put(recordToSearchDocument(next));
        }
      }
    }
    await Promise.all([
      transaction.objectStore("records").delete(id),
      transaction.objectStore("searchDocuments").delete(id),
    ]);
    await transaction.done;
  }

  async readSnapshot(
    exportedAt = new Date().toISOString(),
  ): Promise<QctpExportData> {
    const transaction = this.database.transaction(SNAPSHOT_STORES, "readonly");
    const [
      foundation,
      workbook,
      settings,
      records,
      recordings,
      transcripts,
      derivedNotes,
      attachments,
      revisions,
      paths,
      regSessions,
      transcriptionQueue,
      migrationLedger,
      mirrorRequests,
      mirrorResults,
      mirrorInsightFeedback,
    ] = await Promise.all([
      transaction.objectStore("foundation").get("foundation"),
      transaction.objectStore("workbook").get("workbook"),
      transaction.objectStore("settings").get("settings"),
      transaction.objectStore("records").getAll(),
      transaction.objectStore("recordings").getAll(),
      transaction.objectStore("transcripts").getAll(),
      transaction.objectStore("derivedNotes").getAll(),
      transaction.objectStore("attachments").getAll(),
      transaction.objectStore("revisions").getAll(),
      transaction.objectStore("paths").getAll(),
      transaction.objectStore("regSessions").getAll(),
      transaction.objectStore("transcriptionQueue").getAll(),
      transaction.objectStore("migrationLedger").getAll(),
      transaction.objectStore("mirrorRequests").getAll(),
      transaction.objectStore("mirrorResults").getAll(),
      transaction.objectStore("mirrorInsightFeedback").getAll(),
    ]);
    await transaction.done;
    return QctpExportDataSchema.parse({
      schema: "qctp-export-v2",
      schemaVersion: 2,
      exportedAt,
      foundation: foundation ?? null,
      workbook: workbook ?? null,
      settings: settings ?? null,
      records,
      recordings,
      transcripts,
      derivedNotes,
      attachments,
      revisions,
      paths,
      regSessions,
      transcriptionQueue,
      migrationLedger,
      mirrorRequests,
      mirrorResults,
      mirrorInsightFeedback,
    });
  }

  async importSnapshot(
    value: QctpExportData,
    options: ImportSnapshotOptions = {},
  ): Promise<void> {
    const snapshot = QctpExportDataSchema.parse(value);
    const mode = options.mode ?? "merge";
    const transaction = this.database.transaction(ALL_STORES, "readwrite");
    if (mode === "replace") {
      await Promise.all(
        ALL_STORES.map((storeName) =>
          transaction.objectStore(storeName).clear(),
        ),
      );
    }
    if (snapshot.foundation)
      await transaction.objectStore("foundation").put(snapshot.foundation);
    if (snapshot.workbook)
      await transaction.objectStore("workbook").put(snapshot.workbook);
    if (snapshot.settings)
      await transaction.objectStore("settings").put(snapshot.settings);
    for (const record of snapshot.records) {
      await transaction.objectStore("records").put(record);
      await transaction
        .objectStore("searchDocuments")
        .put(recordToSearchDocument(record));
    }
    for (const recording of snapshot.recordings) {
      await transaction.objectStore("recordings").put(recording);
    }
    for (const transcript of snapshot.transcripts) {
      await transaction.objectStore("transcripts").put(transcript);
    }
    for (const note of snapshot.derivedNotes) {
      await transaction.objectStore("derivedNotes").put(note);
    }
    for (const attachment of snapshot.attachments) {
      await transaction.objectStore("attachments").put(attachment);
    }
    for (const revision of snapshot.revisions) {
      await transaction.objectStore("revisions").put(revision);
    }
    for (const path of snapshot.paths)
      await transaction.objectStore("paths").put(path);
    for (const session of snapshot.regSessions) {
      await transaction.objectStore("regSessions").put(session);
    }
    for (const item of snapshot.transcriptionQueue) {
      await transaction.objectStore("transcriptionQueue").put(item);
    }
    for (const entry of snapshot.migrationLedger) {
      await transaction.objectStore("migrationLedger").put(entry);
    }
    for (const request of snapshot.mirrorRequests) {
      await transaction.objectStore("mirrorRequests").put(request);
    }
    const mirrorRequestById = new Map(
      snapshot.mirrorRequests.map((request) => [request.id, request]),
    );
    for (const result of snapshot.mirrorResults) {
      const request = mirrorRequestById.get(result.requestId);
      const normalized = MirrorResultSchema.parse({
        ...result,
        query: result.query || request?.prompt || "",
        sourceRecordIds:
          result.sourceRecordIds.length > 0
            ? result.sourceRecordIds
            : (request?.sourceRecordIds ?? []),
      });
      await transaction.objectStore("mirrorResults").put(normalized);
    }
    for (const feedback of snapshot.mirrorInsightFeedback) {
      await transaction.objectStore("mirrorInsightFeedback").put(feedback);
    }
    for (const chunk of options.binaries?.audioChunks ?? []) {
      await transaction.objectStore("audioChunks").put(chunk);
    }
    for (const attachmentBlob of options.binaries?.attachmentBlobs ?? []) {
      await transaction.objectStore("attachmentBlobs").put(attachmentBlob);
    }
    await transaction.done;
  }
}

export async function createQctpRepository(
  options: OpenQctpDatabaseOptions = {},
): Promise<QctpRepository> {
  return new QctpRepository(await openQctpDatabase(options));
}
