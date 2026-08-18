import { VoiceRecordingSchema } from "../domain";
import type { QctpRepository } from "../data";

import type { CapturePersistence } from "./browser-recorder";

interface ActiveSegment {
  id: string;
  startedAt: string;
  priorDurationMs: number;
}

/**
 * Persists every MediaRecorder chunk immediately. The in-memory map only
 * identifies the currently open segment; raw audio always lives in IndexedDB.
 */
export class RepositoryCapturePersistence implements CapturePersistence {
  private readonly activeSegments = new Map<string, ActiveSegment>();

  constructor(private readonly repository: QctpRepository) {}

  async begin(input: {
    recordingId: string;
    mimeType: string;
    createdAt: string;
    append: boolean;
  }): Promise<number> {
    const existing = await this.repository.getRecording(input.recordingId);
    if (input.append && !existing) {
      throw new Error(
        "The original local recording is no longer available to append.",
      );
    }
    if (!input.append && existing) {
      throw new Error("A recording with this identifier already exists.");
    }

    const segmentSequence = existing?.segments.length ?? 0;
    const segmentId = `${input.recordingId}:segment:${segmentSequence}`;
    const segment = {
      id: segmentId,
      sequence: segmentSequence,
      startedAt: input.createdAt,
      endedAt: input.createdAt,
      durationMs: 0,
      mimeType: input.mimeType,
      sizeBytes: 0,
      chunkIds: [],
    };
    const recording = VoiceRecordingSchema.parse(
      existing
        ? {
            ...existing,
            status: "CAPTURING",
            segments: [...existing.segments, segment],
            failureCode: null,
            failureMessage: null,
            updatedAt: input.createdAt,
          }
        : {
            schemaVersion: 1,
            id: input.recordingId,
            createdAt: input.createdAt,
            updatedAt: input.createdAt,
            acceptedAt: null,
            durationMs: 0,
            mimeType: input.mimeType,
            sizeBytes: 0,
            localBlobRef: input.recordingId,
            remoteObjectRef: null,
            destinationType: "unclassified",
            destinationId: null,
            status: "CAPTURING",
            segments: [segment],
            transcriptionRoute: "local_only",
            provider: null,
            model: null,
            checksumSha256: null,
            retentionPolicy: "keep",
            failureCode: null,
            failureMessage: null,
            deletedAt: null,
          },
    );
    await this.repository.saveRecording(recording);
    this.activeSegments.set(input.recordingId, {
      id: segmentId,
      startedAt: input.createdAt,
      priorDurationMs: existing?.durationMs ?? 0,
    });
    return (await this.repository.listAudioChunks(input.recordingId)).length;
  }

  async appendChunk(
    recordingId: string,
    index: number,
    chunk: Blob,
  ): Promise<void> {
    const active = this.activeSegments.get(recordingId);
    if (!active) throw new Error("The recording segment is not active.");
    await this.repository.appendAudioChunk(recordingId, active.id, chunk, {
      sequence: index,
    });
  }

  async finalize(
    recordingId: string,
    durationMs: number,
    mimeType: string,
  ): Promise<Blob> {
    const active = this.activeSegments.get(recordingId);
    const recording = await this.repository.getRecording(recordingId);
    if (!active || !recording)
      throw new Error("The local recording could not be finalized.");
    const endedAt = new Date().toISOString();
    // performance.now() is intentionally monotonic but may be fractional. The
    // durable schema uses integer milliseconds so every browser records the
    // same portable representation.
    const normalizedDurationMs = Math.max(
      active.priorDurationMs,
      Math.round(durationMs),
    );
    const segmentDurationMs = normalizedDurationMs - active.priorDurationMs;
    const finalized = VoiceRecordingSchema.parse({
      ...recording,
      durationMs: normalizedDurationMs,
      mimeType: recording.mimeType || mimeType,
      status: "LOCAL_ONLY",
      segments: recording.segments.map((segment) =>
        segment.id === active.id
          ? { ...segment, endedAt, durationMs: segmentDurationMs }
          : segment,
      ),
      updatedAt: endedAt,
    });
    await this.repository.saveRecording(finalized);
    this.activeSegments.delete(recordingId);
    return this.repository.assembleRecordingBlob(recordingId);
  }

  /**
   * Converts an interrupted CAPTURING row into a recoverable LOCAL_ONLY row.
   * A brand-new empty take is removed; an empty append segment is rolled back
   * without deleting the previously finalized audio.
   */
  async recoverInterrupted(
    recordingId: string,
    durationMs: number,
    mimeType: string,
  ): Promise<Blob | null> {
    const recording = await this.repository.getRecording(recordingId);
    if (!recording) {
      this.activeSegments.delete(recordingId);
      return null;
    }
    const active =
      this.activeSegments.get(recordingId) ??
      (recording.status === "CAPTURING"
        ? (() => {
            const segment = recording.segments.at(-1);
            return segment
              ? {
                  id: segment.id,
                  startedAt: segment.startedAt,
                  priorDurationMs: recording.durationMs,
                }
              : undefined;
          })()
        : undefined);
    if (!active) {
      const chunks = await this.repository.listAudioChunks(recordingId);
      return chunks.length > 0
        ? this.repository.assembleRecordingBlob(recordingId)
        : null;
    }

    const activeSegment = recording.segments.find(
      (segment) => segment.id === active.id,
    );
    if (!activeSegment) {
      this.activeSegments.delete(recordingId);
      throw new Error("The interrupted recording segment could not be found.");
    }
    if (activeSegment.chunkIds.length > 0) {
      this.activeSegments.set(recordingId, active);
      return this.finalize(recordingId, durationMs, mimeType);
    }

    this.activeSegments.delete(recordingId);
    const remainingSegments = recording.segments.filter(
      (segment) => segment.id !== active.id,
    );
    if (remainingSegments.length === 0) {
      await this.repository.deleteRecording(recordingId, { metadata: true });
      return null;
    }
    const recoveredAt = new Date().toISOString();
    await this.repository.saveRecording(
      VoiceRecordingSchema.parse({
        ...recording,
        status: "LOCAL_ONLY",
        durationMs: active.priorDurationMs,
        mimeType: recording.mimeType || mimeType,
        segments: remainingSegments,
        updatedAt: recoveredAt,
      }),
    );
    return this.repository.assembleRecordingBlob(recordingId);
  }

  async discard(recordingId: string): Promise<void> {
    this.activeSegments.delete(recordingId);
    const recording = await this.repository.getRecording(recordingId);
    if (!recording) return;
    await this.repository.deleteRecording(recordingId, { metadata: true });
  }
}
