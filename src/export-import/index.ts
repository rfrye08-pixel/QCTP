import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";

import {
  ArchiveManifestSchema,
  QctpExportDataSchema,
  type ArchiveBinaryEntry,
  type ArchiveManifest,
  type QctpExportData,
} from "../domain";
import type {
  AttachmentBlob,
  AudioChunk,
  ImportSnapshotOptions,
  QctpRepository,
} from "../data";

const MAX_ARCHIVE_UNCOMPRESSED_BYTES = 1024 * 1024 * 1024;

export class QctpImportError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "QctpImportError";
  }
}

function isBlobLike(value: unknown): value is Blob {
  return (
    typeof value === "object" &&
    value !== null &&
    "arrayBuffer" in value &&
    typeof value.arrayBuffer === "function"
  );
}

function assertUnique(values: string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value))
      throw new QctpImportError(`Duplicate ${label} id: ${value}`);
    seen.add(value);
  }
}

export function validateExportRelations(snapshot: QctpExportData): void {
  assertUnique(
    snapshot.records.map((entity) => entity.id),
    "record",
  );
  assertUnique(
    snapshot.recordings.map((entity) => entity.id),
    "recording",
  );
  assertUnique(
    snapshot.transcripts.map((entity) => entity.id),
    "transcript",
  );
  assertUnique(
    snapshot.derivedNotes.map((entity) => entity.id),
    "derived note",
  );
  assertUnique(
    snapshot.attachments.map((entity) => entity.id),
    "attachment",
  );
  assertUnique(
    snapshot.revisions.map((entity) => entity.id),
    "revision",
  );
  assertUnique(
    snapshot.paths.map((entity) => entity.id),
    "path",
  );
  assertUnique(
    snapshot.regSessions.map((entity) => entity.id),
    "REG session",
  );
  assertUnique(
    snapshot.mirrorRequests.map((entity) => entity.id),
    "Mirror request",
  );
  assertUnique(
    snapshot.mirrorResults.map((entity) => entity.id),
    "Mirror result",
  );
  assertUnique(
    snapshot.mirrorResults.flatMap((entity) =>
      entity.revisionHistory.map((revision) => revision.id),
    ),
    "Mirror result revision",
  );
  assertUnique(
    snapshot.mirrorInsightFeedback.map((entity) => entity.id),
    "Mirror insight feedback",
  );
  assertUnique(
    snapshot.mirrorInsightFeedback.flatMap((entity) =>
      entity.revisionHistory.map((revision) => revision.id),
    ),
    "Mirror insight feedback revision",
  );

  const recordings = new Set(
    snapshot.recordings.map((recording) => recording.id),
  );
  const transcripts = new Set(
    snapshot.transcripts.map((transcript) => transcript.id),
  );
  const attachments = new Set(
    snapshot.attachments.map((attachment) => attachment.id),
  );
  const records = new Set(snapshot.records.map((record) => record.id));
  const mirrorRequests = new Map(
    snapshot.mirrorRequests.map((request) => [request.id, request]),
  );
  const chunkIds: string[] = [];
  for (const recording of snapshot.recordings) {
    for (const segment of recording.segments)
      chunkIds.push(...segment.chunkIds);
  }
  assertUnique(chunkIds, "audio chunk");

  for (const transcript of snapshot.transcripts) {
    if (!recordings.has(transcript.recordingId)) {
      throw new QctpImportError(
        `Transcript ${transcript.id} references missing recording ${transcript.recordingId}`,
      );
    }
  }
  for (const note of snapshot.derivedNotes) {
    if (!transcripts.has(note.transcriptId)) {
      throw new QctpImportError(
        `Derived note ${note.id} references missing transcript ${note.transcriptId}`,
      );
    }
  }
  for (const session of snapshot.regSessions) {
    for (const attachmentId of session.attachmentIds) {
      if (!attachments.has(attachmentId)) {
        throw new QctpImportError(
          `REG session ${session.id} references missing attachment ${attachmentId}`,
        );
      }
    }
    if (session.resultingRecordIds) {
      for (const recordId of Object.values(session.resultingRecordIds)) {
        if (!records.has(recordId)) {
          throw new QctpImportError(
            `REG session ${session.id} references missing result record ${recordId}`,
          );
        }
      }
    }
  }
  for (const request of snapshot.mirrorRequests) {
    for (const sourceId of request.sourceRecordIds) {
      if (!records.has(sourceId)) {
        throw new QctpImportError(
          `Mirror request ${request.id} references missing record ${sourceId}`,
        );
      }
    }
  }
  for (const result of snapshot.mirrorResults) {
    const request = mirrorRequests.get(result.requestId);
    if (!request) {
      throw new QctpImportError(
        `Mirror result ${result.id} references missing request ${result.requestId}`,
      );
    }
    if (
      (result.query && result.query !== request.prompt) ||
      (result.sourceRecordIds.length > 0 &&
        (result.sourceRecordIds.length !== request.sourceRecordIds.length ||
          result.sourceRecordIds.some(
            (sourceId) => !request.sourceRecordIds.includes(sourceId),
          )))
    ) {
      throw new QctpImportError(
        `Mirror result ${result.id} does not preserve its submitted query and source IDs`,
      );
    }
    if ((result.deletedAt === null) !== (request.deletedAt === null)) {
      throw new QctpImportError(
        `Mirror result ${result.id} deletion state does not match its request`,
      );
    }
    for (const citation of result.citations) {
      if (!request.sourceRecordIds.includes(citation.recordId)) {
        throw new QctpImportError(
          `Mirror result ${result.id} cites an unsubmitted record ${citation.recordId}`,
        );
      }
    }
  }
  for (const feedback of snapshot.mirrorInsightFeedback) {
    for (const sourceId of feedback.sourceRecordIds) {
      if (!records.has(sourceId)) {
        throw new QctpImportError(
          `Mirror insight feedback ${feedback.id} references missing record ${sourceId}`,
        );
      }
    }
    for (const revision of feedback.revisionHistory) {
      for (const sourceId of revision.sourceRecordIds) {
        if (!records.has(sourceId)) {
          throw new QctpImportError(
            `Mirror insight feedback revision ${revision.id} references missing record ${sourceId}`,
          );
        }
      }
    }
  }
}

export async function parseQctpJson(input: unknown): Promise<QctpExportData> {
  let value: unknown = input;
  try {
    if (isBlobLike(input)) value = JSON.parse(await input.text()) as unknown;
    else if (typeof input === "string") value = JSON.parse(input) as unknown;
    const parsed = QctpExportDataSchema.parse(value);
    validateExportRelations(parsed);
    return parsed;
  } catch (error) {
    if (error instanceof QctpImportError) throw error;
    throw new QctpImportError("The file is not valid QCTP Rev2 JSON.", {
      cause: error,
    });
  }
}

export async function exportJson(repository: QctpRepository): Promise<string> {
  const snapshot = await repository.readSnapshot();
  validateExportRelations(snapshot);
  return JSON.stringify(snapshot, null, 2);
}

export async function importJson(
  repository: QctpRepository,
  input: unknown,
  options: Pick<ImportSnapshotOptions, "mode"> = {},
): Promise<QctpExportData> {
  const snapshot = await parseQctpJson(input);
  await repository.importSnapshot(snapshot, options);
  return snapshot;
}

async function sha256(bytes: Uint8Array): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new QctpImportError("SHA-256 is unavailable in this browser.");
  }
  const copy = Uint8Array.from(bytes);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", copy.buffer);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function safeArchivePath(
  path: string,
  prefix: "audio/" | "attachments/",
): string {
  if (
    !path.startsWith(prefix) ||
    path.includes("..") ||
    path.includes("\\") ||
    path.startsWith("/")
  ) {
    throw new QctpImportError(`Unsafe archive path: ${path}`);
  }
  return path;
}

async function audioManifestEntries(
  chunks: AudioChunk[],
): Promise<Array<{ entry: ArchiveBinaryEntry; bytes: Uint8Array }>> {
  return Promise.all(
    chunks.map(async (chunk) => {
      const bytes = new Uint8Array(await chunk.blob.arrayBuffer());
      const path = `audio/${encodeURIComponent(chunk.recordingId)}/${String(chunk.sequence).padStart(6, "0")}-${encodeURIComponent(chunk.id)}.bin`;
      return {
        entry: {
          id: chunk.id,
          ownerId: chunk.recordingId,
          path,
          mimeType: chunk.mimeType,
          sizeBytes: bytes.byteLength,
          checksumSha256: await sha256(bytes),
        },
        bytes,
      };
    }),
  );
}

async function attachmentManifestEntries(
  blobs: AttachmentBlob[],
): Promise<Array<{ entry: ArchiveBinaryEntry; bytes: Uint8Array }>> {
  return Promise.all(
    blobs.map(async (binary) => {
      const bytes = new Uint8Array(await binary.blob.arrayBuffer());
      const path = `attachments/${encodeURIComponent(binary.attachmentId)}/${encodeURIComponent(binary.id)}.bin`;
      return {
        entry: {
          id: binary.id,
          ownerId: binary.attachmentId,
          path,
          mimeType: binary.blob.type || "application/octet-stream",
          sizeBytes: bytes.byteLength,
          checksumSha256: await sha256(bytes),
        },
        bytes,
      };
    }),
  );
}

export async function exportArchive(repository: QctpRepository): Promise<Blob> {
  const [snapshot, chunks, attachmentBlobs] = await Promise.all([
    repository.readSnapshot(),
    repository.listAudioChunks(),
    repository.listAttachmentBlobs(),
  ]);
  validateExportRelations(snapshot);
  const [audio, attachments] = await Promise.all([
    audioManifestEntries(chunks),
    attachmentManifestEntries(attachmentBlobs),
  ]);
  const manifest: ArchiveManifest = ArchiveManifestSchema.parse({
    schema: "qctp-archive-manifest-v1",
    archiveVersion: 1,
    createdAt: snapshot.exportedAt,
    dataPath: "qctp-data.json",
    audio: audio.map(({ entry }) => entry),
    attachments: attachments.map(({ entry }) => entry),
  });
  const files: Record<string, Uint8Array> = {
    "manifest.json": strToU8(JSON.stringify(manifest, null, 2)),
    "qctp-data.json": strToU8(JSON.stringify(snapshot, null, 2)),
  };
  for (const item of [...audio, ...attachments])
    files[item.entry.path] = item.bytes;
  return new Response(Uint8Array.from(zipSync(files, { level: 6 })).buffer, {
    headers: { "content-type": "application/zip" },
  }).blob();
}

async function inputToBytes(
  input: Blob | Uint8Array | ArrayBuffer,
): Promise<Uint8Array> {
  if (isBlobLike(input)) return new Uint8Array(await input.arrayBuffer());
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  return Uint8Array.from(input);
}

async function validateBinaryEntry(
  files: Record<string, Uint8Array>,
  entry: ArchiveBinaryEntry,
  prefix: "audio/" | "attachments/",
): Promise<Uint8Array> {
  const path = safeArchivePath(entry.path, prefix);
  const bytes = files[path];
  if (!bytes) throw new QctpImportError(`Archive binary is missing: ${path}`);
  if (bytes.byteLength !== entry.sizeBytes) {
    throw new QctpImportError(`Archive binary size mismatch: ${path}`);
  }
  if ((await sha256(bytes)) !== entry.checksumSha256.toLocaleLowerCase()) {
    throw new QctpImportError(`Archive binary checksum mismatch: ${path}`);
  }
  return bytes;
}

async function bytesToBlob(bytes: Uint8Array, mimeType: string): Promise<Blob> {
  return new Response(Uint8Array.from(bytes).buffer, {
    headers: { "content-type": mimeType },
  }).blob();
}

export async function importArchive(
  repository: QctpRepository,
  input: Blob | Uint8Array | ArrayBuffer,
  options: Pick<ImportSnapshotOptions, "mode"> = {},
): Promise<QctpExportData> {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(await inputToBytes(input));
  } catch (error) {
    throw new QctpImportError("The file is not a readable QCTP ZIP archive.", {
      cause: error,
    });
  }
  const totalBytes = Object.values(files).reduce(
    (total, file) => total + file.byteLength,
    0,
  );
  if (totalBytes > MAX_ARCHIVE_UNCOMPRESSED_BYTES) {
    throw new QctpImportError(
      "The QCTP archive exceeds the one-gigabyte safety limit.",
    );
  }
  const manifestBytes = files["manifest.json"];
  if (!manifestBytes)
    throw new QctpImportError("Archive manifest.json is missing.");
  let manifest: ArchiveManifest;
  try {
    manifest = ArchiveManifestSchema.parse(
      JSON.parse(strFromU8(manifestBytes)) as unknown,
    );
  } catch (error) {
    throw new QctpImportError("Archive manifest.json is invalid.", {
      cause: error,
    });
  }
  const dataBytes = files[manifest.dataPath];
  if (!dataBytes)
    throw new QctpImportError(`Archive ${manifest.dataPath} is missing.`);
  const snapshot = await parseQctpJson(strFromU8(dataBytes));

  assertUnique(
    manifest.audio.map((entry) => entry.id),
    "archive audio",
  );
  assertUnique(
    manifest.attachments.map((entry) => entry.id),
    "archive attachment",
  );
  const expectedChunkIds = new Set(
    snapshot.recordings.flatMap((recording) =>
      recording.segments.flatMap((segment) => segment.chunkIds),
    ),
  );
  const manifestChunkIds = new Set(manifest.audio.map((entry) => entry.id));
  if (
    expectedChunkIds.size !== manifestChunkIds.size ||
    [...expectedChunkIds].some((id) => !manifestChunkIds.has(id))
  ) {
    throw new QctpImportError(
      "Archive audio manifest does not match recording segment metadata.",
    );
  }
  const expectedAttachmentBlobIds = new Set(
    snapshot.attachments
      .filter((attachment) => attachment.deletedAt === null)
      .map((item) => item.localBlobRef),
  );
  const manifestAttachmentBlobIds = new Set(
    manifest.attachments.map((entry) => entry.id),
  );
  if (
    expectedAttachmentBlobIds.size !== manifestAttachmentBlobIds.size ||
    [...expectedAttachmentBlobIds].some(
      (id) => !manifestAttachmentBlobIds.has(id),
    )
  ) {
    throw new QctpImportError(
      "Archive attachment manifest does not match attachment metadata.",
    );
  }

  const segmentByChunk = new Map<
    string,
    {
      segmentId: string;
      sequence: number;
      recordingId: string;
      createdAt: string;
    }
  >();
  for (const recording of snapshot.recordings) {
    let sequence = 0;
    for (const segment of [...recording.segments].sort(
      (a, b) => a.sequence - b.sequence,
    )) {
      for (const chunkId of segment.chunkIds) {
        segmentByChunk.set(chunkId, {
          segmentId: segment.id,
          sequence,
          recordingId: recording.id,
          createdAt: segment.startedAt,
        });
        sequence += 1;
      }
    }
  }
  const audioChunks: AudioChunk[] = [];
  for (const entry of manifest.audio) {
    const relation = segmentByChunk.get(entry.id);
    if (!relation || relation.recordingId !== entry.ownerId) {
      throw new QctpImportError(`Archive audio owner mismatch: ${entry.id}`);
    }
    const bytes = await validateBinaryEntry(files, entry, "audio/");
    audioChunks.push({
      schemaVersion: 1,
      id: entry.id,
      recordingId: relation.recordingId,
      segmentId: relation.segmentId,
      sequence: relation.sequence,
      createdAt: relation.createdAt,
      mimeType: entry.mimeType,
      blob: await bytesToBlob(bytes, entry.mimeType),
    });
  }
  const attachmentsByBlobRef = new Map(
    snapshot.attachments.map((attachment) => [
      attachment.localBlobRef,
      attachment,
    ]),
  );
  const attachmentBlobs: AttachmentBlob[] = [];
  for (const entry of manifest.attachments) {
    const attachment = attachmentsByBlobRef.get(entry.id);
    if (!attachment || attachment.id !== entry.ownerId) {
      throw new QctpImportError(
        `Archive attachment owner mismatch: ${entry.id}`,
      );
    }
    const bytes = await validateBinaryEntry(files, entry, "attachments/");
    if (
      attachment.checksumSha256 &&
      attachment.checksumSha256 !== entry.checksumSha256
    ) {
      throw new QctpImportError(
        `Attachment metadata checksum mismatch: ${entry.id}`,
      );
    }
    attachmentBlobs.push({
      schemaVersion: 1,
      id: entry.id,
      attachmentId: attachment.id,
      createdAt: attachment.createdAt,
      blob: await bytesToBlob(bytes, entry.mimeType),
    });
  }

  // Validation and binary reconstruction finish before this single IndexedDB transaction begins.
  await repository.importSnapshot(snapshot, {
    ...options,
    binaries: { audioChunks, attachmentBlobs },
  });
  return snapshot;
}
