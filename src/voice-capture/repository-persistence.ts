import { VoiceRecordingSchema, type VoiceRecording } from "../domain";
import type { CaptureDiscardProof, QctpRepository } from "../data";

import type { CapturePersistence } from "./browser-recorder";

interface ActiveSegment {
  id: string;
  startedAt: string;
}

export interface InterruptedCaptureRecoveryResult {
  recoveredRecordingIds: string[];
  discardedEmptyRecordingIds: string[];
  failedRecordingIds: string[];
  activeRecordingIds: string[];
}

export const CAPTURE_LEASE_DURATION_MS = 60_000;
export const CAPTURE_RECOVERY_RETRY_MS = 15_000;
export const LEGACY_CAPTURE_ORPHAN_GRACE_MS = 60_000;

interface RepositoryCapturePersistenceOptions {
  ownerId?: string;
  now?: () => Date;
  leaseDurationMs?: number;
}

interface InterruptedCaptureRecoveryOptions {
  now?: () => Date;
}

function inferredInterruptedDurationMs(
  recording: VoiceRecording,
  activeSegment: VoiceRecording["segments"][number],
): number {
  if (recording.captureMode !== null || activeSegment.durationMs > 0) {
    return recording.requestedDurationMs === null
      ? recording.durationMs
      : Math.min(recording.durationMs, recording.requestedDurationMs);
  }
  const priorDurationMs = recording.durationMs;
  const startedAt = activeSegment.startedAt;
  const lastPersistedAt = recording.updatedAt;
  const started = Date.parse(startedAt);
  const persisted = Date.parse(lastPersistedAt);
  const activeDurationMs =
    Number.isFinite(started) && Number.isFinite(persisted)
      ? Math.max(0, persisted - started)
      : 0;
  return priorDurationMs + activeDurationMs;
}

/**
 * Repairs CAPTURING rows left behind by a browser/process interruption.
 *
 * MediaRecorder chunks are committed to IndexedDB as they arrive, while the
 * recording is finalized only after the browser's stop event. A hard process
 * exit can therefore leave durable audio behind a CAPTURING row. This boot-safe
 * pass converts every such row into LOCAL_ONLY, rolls back an empty append, or
 * removes an empty first take. Failures are isolated per recording so one bad
 * legacy row cannot hide other recoverable captures.
 */
export async function recoverInterruptedCaptures(
  repository: QctpRepository,
  options: InterruptedCaptureRecoveryOptions = {},
): Promise<InterruptedCaptureRecoveryResult> {
  const now = options.now?.() ?? new Date();
  const result: InterruptedCaptureRecoveryResult = {
    recoveredRecordingIds: [],
    discardedEmptyRecordingIds: [],
    failedRecordingIds: [],
    activeRecordingIds: [],
  };
  const persistence = new RepositoryCapturePersistence(repository, {
    now: () => now,
  });
  const candidates = await repository.listRecordingRecoveryCandidates();
  result.failedRecordingIds.push(...candidates.invalidRecordingIds);

  for (const recording of candidates.recordings) {
    const activeSegment = recording.segments.at(-1);
    if (!activeSegment) {
      result.failedRecordingIds.push(recording.id);
      continue;
    }
    const durationMs = inferredInterruptedDurationMs(recording, activeSegment);
    try {
      const ownerId = recording.captureOwnerId ?? null;
      const leaseExpiresAt = recording.captureLeaseExpiresAt ?? null;
      const leaseExpiry =
        leaseExpiresAt === null ? Number.NaN : Date.parse(leaseExpiresAt);
      const legacyLastWrite = Date.parse(recording.updatedAt);
      const leaseActive =
        Number.isFinite(leaseExpiry) && leaseExpiry > now.getTime();
      const legacyStillFresh =
        ownerId === null &&
        leaseExpiresAt === null &&
        Number.isFinite(legacyLastWrite) &&
        now.getTime() - legacyLastWrite < LEGACY_CAPTURE_ORPHAN_GRACE_MS;
      if (leaseActive || legacyStillFresh) {
        result.activeRecordingIds.push(recording.id);
        continue;
      }
      const claimed = await persistence.claimInterrupted(recording, now);
      if (!claimed) {
        result.activeRecordingIds.push(recording.id);
        continue;
      }
      const completedByDurationLimit =
        recording.captureMode === "auto-dictation" &&
        recording.requestedDurationMs !== null &&
        durationMs === recording.requestedDurationMs;
      const recovered = await persistence.recoverInterrupted(
        recording.id,
        durationMs,
        activeSegment.mimeType || recording.mimeType,
        completedByDurationLimit,
      );
      if (recovered) result.recoveredRecordingIds.push(recording.id);
      else result.discardedEmptyRecordingIds.push(recording.id);
    } catch {
      result.failedRecordingIds.push(recording.id);
    }
  }

  return result;
}

/**
 * Persists every MediaRecorder chunk immediately. The in-memory map only
 * identifies the currently open segment; raw audio always lives in IndexedDB.
 */
export class RepositoryCapturePersistence implements CapturePersistence {
  private readonly activeSegments = new Map<string, ActiveSegment>();
  private readonly discardProofs = new Map<string, CaptureDiscardProof>();
  private readonly ownerId: string;
  private readonly now: () => Date;
  private readonly leaseDurationMs: number;

  constructor(
    private readonly repository: QctpRepository,
    options: RepositoryCapturePersistenceOptions = {},
  ) {
    this.ownerId = options.ownerId ?? `capture-owner-${crypto.randomUUID()}`;
    this.now = options.now ?? (() => new Date());
    this.leaseDurationMs = options.leaseDurationMs ?? CAPTURE_LEASE_DURATION_MS;
  }

  private leaseExpiresAt(): string {
    return new Date(this.now().getTime() + this.leaseDurationMs).toISOString();
  }

  async claimInterrupted(
    recording: VoiceRecording,
    claimAt: Date,
  ): Promise<boolean> {
    return this.repository.claimInterruptedRecording({
      recordingId: recording.id,
      expectedOwnerId: recording.captureOwnerId ?? null,
      expectedLeaseExpiresAt: recording.captureLeaseExpiresAt ?? null,
      expectedUpdatedAt: recording.updatedAt,
      claimantOwnerId: this.ownerId,
      claimantLeaseExpiresAt: new Date(
        claimAt.getTime() + this.leaseDurationMs,
      ).toISOString(),
      claimAt: claimAt.toISOString(),
    });
  }

  async begin(input: {
    recordingId: string;
    mimeType: string;
    createdAt: string;
    append: boolean;
    captureMode: Parameters<CapturePersistence["begin"]>[0]["captureMode"];
    requestedDurationMs: Parameters<
      CapturePersistence["begin"]
    >[0]["requestedDurationMs"];
    captureContext: Parameters<
      CapturePersistence["begin"]
    >[0]["captureContext"];
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
    if (
      existing &&
      (existing.captureMode !== input.captureMode ||
        existing.requestedDurationMs !== input.requestedDurationMs ||
        JSON.stringify(existing.captureContext) !==
          JSON.stringify(input.captureContext))
    ) {
      throw new Error(
        "An appended segment must keep the original capture mode, duration, and context.",
      );
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
            captureOwnerId: this.ownerId,
            captureLeaseExpiresAt: this.leaseExpiresAt(),
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
            captureMode: input.captureMode,
            requestedDurationMs: input.requestedDurationMs,
            captureContext: input.captureContext,
            completedByDurationLimit: null,
            captureOwnerId: this.ownerId,
            captureLeaseExpiresAt: this.leaseExpiresAt(),
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
    });
    return (await this.repository.listAudioChunks(input.recordingId)).length;
  }

  async appendChunk(
    recordingId: string,
    index: number,
    chunk: Blob,
    activeDurationMs = 0,
  ): Promise<void> {
    const active = this.activeSegments.get(recordingId);
    if (!active) throw new Error("The recording segment is not active.");
    await this.repository.appendAudioChunk(recordingId, active.id, chunk, {
      sequence: index,
      activeDurationMs,
      captureOwnerId: this.ownerId,
      captureLeaseExpiresAt: this.leaseExpiresAt(),
    });
  }

  async renewLease(recordingId: string): Promise<void> {
    await this.repository.renewRecordingCaptureLease(
      recordingId,
      this.ownerId,
      this.leaseExpiresAt(),
    );
  }

  async finalize(
    recordingId: string,
    durationMs: number,
    mimeType: string,
    completedByDurationLimit = false,
  ): Promise<Blob> {
    const active = this.activeSegments.get(recordingId);
    if (!active) throw new Error("The local recording could not be finalized.");
    const endedAt = new Date().toISOString();
    const finalized = await this.repository.finalizeOwnedCapture({
      recordingId,
      segmentId: active.id,
      captureOwnerId: this.ownerId,
      durationMs,
      mimeType,
      completedByDurationLimit,
      endedAt,
    });
    this.activeSegments.delete(recordingId);
    this.discardProofs.set(recordingId, {
      updatedAt: finalized.updatedAt,
      segmentIds: finalized.segments.map((segment) => segment.id),
    });
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
    completedByDurationLimit = false,
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
      return this.finalize(
        recordingId,
        durationMs,
        mimeType,
        completedByDurationLimit,
      );
    }

    const recoveredAt = new Date().toISOString();
    const rolledBack = await this.repository.rollbackOwnedEmptyCapture({
      recordingId,
      segmentId: active.id,
      captureOwnerId: this.ownerId,
      recoveredAt,
    });
    this.activeSegments.delete(recordingId);
    if (!rolledBack) return null;
    this.discardProofs.set(recordingId, {
      updatedAt: rolledBack.updatedAt,
      segmentIds: rolledBack.segments.map((segment) => segment.id),
    });
    return this.repository.assembleRecordingBlob(recordingId);
  }

  async discard(recordingId: string): Promise<void> {
    this.activeSegments.delete(recordingId);
    const proof = this.discardProofs.get(recordingId);
    await this.repository.discardCaptureWithProof({
      recordingId,
      captureOwnerId: this.ownerId,
      ...(proof ? { finalizedProof: proof } : {}),
    });
    this.discardProofs.delete(recordingId);
  }
}
