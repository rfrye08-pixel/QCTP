import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createQctpRepository,
  deleteQctpDatabase,
  openQctpDatabase,
  type QctpRepository,
} from "../data";

import {
  recoverInterruptedCaptures,
  RepositoryCapturePersistence,
} from "./repository-persistence";

async function testBlob(value: string): Promise<Blob> {
  return new Response(value, {
    headers: { "content-type": "audio/webm" },
  }).blob();
}

async function recoverAfterCurrentLeases(
  target: QctpRepository,
): ReturnType<typeof recoverInterruptedCaptures> {
  const candidates = await target.listRecordingRecoveryCandidates();
  const latestLease = candidates.recordings.reduce((latest, recording) => {
    const parsed = Date.parse(recording.captureLeaseExpiresAt ?? "");
    return Number.isFinite(parsed) ? Math.max(latest, parsed) : latest;
  }, Date.now());
  return recoverInterruptedCaptures(target, {
    now: () => new Date(latestLease + 1),
  });
}

const quickCaptureMetadata = {
  captureMode: "quick" as const,
  requestedDurationMs: null,
  captureContext: { type: "global" as const },
};

const fiveMinuteAutoCaptureMetadata = {
  captureMode: "auto-dictation" as const,
  requestedDurationMs: 300_000 as const,
  captureContext: { type: "global" as const },
};

describe("RepositoryCapturePersistence", () => {
  let databaseName: string;
  let repository: QctpRepository;
  let persistence: RepositoryCapturePersistence;

  beforeEach(async () => {
    databaseName = `voice-persistence-${crypto.randomUUID()}`;
    repository = await createQctpRepository({ name: databaseName });
    persistence = new RepositoryCapturePersistence(repository);
  });

  afterEach(async () => {
    repository.close();
    await deleteQctpDatabase(databaseName);
  });

  it("persists typed Auto-Dictation metadata before the first audio chunk", async () => {
    await persistence.begin({
      recordingId: "typed-auto-begin",
      mimeType: "audio/webm",
      createdAt: "2026-08-17T12:00:00.000Z",
      append: false,
      captureMode: "auto-dictation",
      requestedDurationMs: 600_000,
      captureContext: { type: "experiment", experimentId: "experiment-7" },
    });

    expect(await repository.getRecording("typed-auto-begin")).toMatchObject({
      status: "CAPTURING",
      captureMode: "auto-dictation",
      requestedDurationMs: 600_000,
      captureContext: { type: "experiment", experimentId: "experiment-7" },
      completedByDurationLimit: null,
    });
  });

  it("rejects an append that changes the original capture metadata", async () => {
    await persistence.begin({
      recordingId: "metadata-mismatch",
      mimeType: "audio/webm",
      createdAt: "2026-08-17T12:00:00.000Z",
      append: false,
      ...fiveMinuteAutoCaptureMetadata,
    });
    await persistence.appendChunk(
      "metadata-mismatch",
      0,
      await testBlob("original"),
    );
    await persistence.finalize("metadata-mismatch", 1_000, "audio/webm", false);

    await expect(
      persistence.begin({
        recordingId: "metadata-mismatch",
        mimeType: "audio/webm",
        createdAt: "2026-08-17T12:01:00.000Z",
        append: true,
        ...fiveMinuteAutoCaptureMetadata,
        captureContext: { type: "field", fieldTargetId: "different-field" },
      }),
    ).rejects.toThrow(
      /must keep the original capture mode, duration, and context/i,
    );
    expect(await repository.getRecording("metadata-mismatch")).toMatchObject({
      status: "LOCAL_ONLY",
      captureMode: "auto-dictation",
      requestedDurationMs: 300_000,
      captureContext: { type: "global" },
      completedByDurationLimit: false,
      segments: [{ sequence: 0 }],
    });
  });

  it.each([
    ["at its controlled limit", true],
    ["after an explicit early stop", false],
  ] as const)(
    "records whether Auto-Dictation finalized %s",
    async (_label, completedByDurationLimit) => {
      const recordingId = completedByDurationLimit
        ? "auto-limit-stop"
        : "auto-user-stop";
      await persistence.begin({
        recordingId,
        mimeType: "audio/webm",
        createdAt: "2026-08-17T12:00:00.000Z",
        append: false,
        ...fiveMinuteAutoCaptureMetadata,
      });
      await persistence.appendChunk(
        recordingId,
        0,
        await testBlob("auto-audio"),
      );

      await persistence.finalize(
        recordingId,
        completedByDurationLimit ? 300_000 : 42_000,
        "audio/webm",
        completedByDurationLimit,
      );

      expect(await repository.getRecording(recordingId)).toMatchObject({
        status: "LOCAL_ONLY",
        captureMode: "auto-dictation",
        requestedDurationMs: 300_000,
        captureContext: { type: "global" },
        completedByDurationLimit,
      });
    },
  );

  it("persists chunks immediately and preserves appended segments in sequence", async () => {
    const recordingId = "recording-one";
    await expect(
      persistence.begin({
        recordingId,
        mimeType: "audio/webm",
        createdAt: "2026-08-17T12:00:00.000Z",
        append: false,
        ...quickCaptureMetadata,
      }),
    ).resolves.toBe(0);
    await persistence.appendChunk(recordingId, 0, await testBlob("first"));
    await persistence.appendChunk(recordingId, 1, await testBlob("second"));
    const first = await persistence.finalize(recordingId, 2_000, "audio/webm");
    expect(await first.text()).toBe("firstsecond");

    await expect(
      persistence.begin({
        recordingId,
        mimeType: "audio/webm",
        createdAt: "2026-08-17T12:01:00.000Z",
        append: true,
        ...quickCaptureMetadata,
      }),
    ).resolves.toBe(2);
    await persistence.appendChunk(recordingId, 2, await testBlob("third"));
    const combined = await persistence.finalize(
      recordingId,
      3_500.4,
      "audio/webm",
    );
    expect(await combined.text()).toBe("firstsecondthird");
    const saved = await repository.getRecording(recordingId);
    expect(saved).toMatchObject({
      durationMs: 3_500,
      sizeBytes: 16,
      status: "LOCAL_ONLY",
      segments: [
        { sequence: 0, durationMs: 2_000 },
        { sequence: 1, durationMs: 1_500 },
      ],
    });
    expect(saved?.segments[0]?.chunkIds).toHaveLength(2);
    expect(saved?.segments[1]?.chunkIds).toHaveLength(1);
  });

  it("discards metadata and every local chunk together", async () => {
    await persistence.begin({
      recordingId: "discard-me",
      mimeType: "audio/webm",
      createdAt: "2026-08-17T12:00:00.000Z",
      append: false,
      ...quickCaptureMetadata,
    });
    await persistence.appendChunk("discard-me", 0, await testBlob("audio"));
    await persistence.discard("discard-me");
    expect(await repository.getRecording("discard-me")).toBeUndefined();
    expect(await repository.listAudioChunks("discard-me")).toEqual([]);
  });

  it("finalizes already-persisted chunks after an interruption", async () => {
    await persistence.begin({
      recordingId: "interrupted",
      mimeType: "audio/webm",
      createdAt: "2026-08-17T12:00:00.000Z",
      append: false,
      ...quickCaptureMetadata,
    });
    await persistence.appendChunk(
      "interrupted",
      0,
      await testBlob("recoverable"),
    );

    const recovered = await persistence.recoverInterrupted(
      "interrupted",
      1_750.4,
      "audio/webm",
    );

    expect(await recovered?.text()).toBe("recoverable");
    expect(await repository.getRecording("interrupted")).toMatchObject({
      status: "LOCAL_ONLY",
      durationMs: 1_750,
      sizeBytes: 11,
      segments: [{ durationMs: 1_750 }],
    });
  });

  it("removes an interrupted empty take instead of stranding CAPTURING metadata", async () => {
    await persistence.begin({
      recordingId: "empty-interruption",
      mimeType: "audio/webm",
      createdAt: "2026-08-17T12:00:00.000Z",
      append: false,
      ...quickCaptureMetadata,
    });

    await expect(
      persistence.recoverInterrupted("empty-interruption", 20, "audio/webm"),
    ).resolves.toBeNull();
    expect(await repository.getRecording("empty-interruption")).toBeUndefined();
  });

  it("rolls back an empty interrupted append without deleting the earlier take", async () => {
    await persistence.begin({
      recordingId: "empty-append",
      mimeType: "audio/webm",
      createdAt: "2026-08-17T12:00:00.000Z",
      append: false,
      ...quickCaptureMetadata,
    });
    await persistence.appendChunk(
      "empty-append",
      0,
      await testBlob("original"),
    );
    await persistence.finalize("empty-append", 1_000, "audio/webm");
    await persistence.begin({
      recordingId: "empty-append",
      mimeType: "audio/webm",
      createdAt: "2026-08-17T12:01:00.000Z",
      append: true,
      ...quickCaptureMetadata,
    });

    const recovered = await persistence.recoverInterrupted(
      "empty-append",
      1_400,
      "audio/webm",
    );

    expect(await recovered?.text()).toBe("original");
    expect(await repository.getRecording("empty-append")).toMatchObject({
      status: "LOCAL_ONLY",
      durationMs: 1_000,
      segments: [{ sequence: 0, durationMs: 1_000 }],
    });
  });

  it("preserves prior duration-limit completion when an empty append is rolled back", async () => {
    const recordingId = "empty-auto-append";
    await persistence.begin({
      recordingId,
      mimeType: "audio/webm",
      createdAt: "2026-08-17T12:00:00.000Z",
      append: false,
      ...fiveMinuteAutoCaptureMetadata,
    });
    await persistence.appendChunk(
      recordingId,
      0,
      await testBlob("complete-auto"),
    );
    await persistence.finalize(recordingId, 300_000, "audio/webm", true);
    await persistence.begin({
      recordingId,
      mimeType: "audio/webm",
      createdAt: "2026-08-17T12:06:00.000Z",
      append: true,
      ...fiveMinuteAutoCaptureMetadata,
    });

    const recovered = await persistence.recoverInterrupted(
      recordingId,
      300_500,
      "audio/webm",
      false,
    );

    expect(await recovered?.text()).toBe("complete-auto");
    expect(await repository.getRecording(recordingId)).toMatchObject({
      status: "LOCAL_ONLY",
      durationMs: 300_000,
      completedByDurationLimit: true,
      segments: [{ sequence: 0, durationMs: 300_000 }],
    });
  });

  it("recovers durable chunks left CAPTURING by a hard browser exit", async () => {
    await persistence.begin({
      recordingId: "hard-exit",
      mimeType: "audio/webm",
      createdAt: "2026-08-17T12:00:00.000Z",
      append: false,
      ...quickCaptureMetadata,
    });
    await persistence.appendChunk(
      "hard-exit",
      0,
      await testBlob("survived-process-exit"),
      1_250,
    );
    const stranded = await repository.getRecording("hard-exit");
    if (!stranded) throw new Error("Stranded capture was not created.");
    await repository.saveRecording({
      ...stranded,
      updatedAt: "2026-08-17T12:00:01.250Z",
    });

    // A new persistence instance models a new PWA process with no in-memory
    // active-segment map from the interrupted recorder.
    const recovery = await recoverAfterCurrentLeases(repository);

    expect(recovery).toEqual({
      recoveredRecordingIds: ["hard-exit"],
      discardedEmptyRecordingIds: [],
      failedRecordingIds: [],
      activeRecordingIds: [],
    });
    expect(await repository.getRecording("hard-exit")).toMatchObject({
      status: "LOCAL_ONLY",
      durationMs: 1_250,
      sizeBytes: 21,
      segments: [{ durationMs: 1_250, chunkIds: [expect.any(String)] }],
    });
    await expect(
      repository.assembleRecordingBlob("hard-exit"),
    ).resolves.toBeInstanceOf(Blob);
    expect(
      await (await repository.assembleRecordingBlob("hard-exit")).text(),
    ).toBe("survived-process-exit");
  });

  it("recovers only checkpointed active time after a long paused hard exit", async () => {
    await persistence.begin({
      recordingId: "paused-hard-exit",
      mimeType: "audio/webm",
      createdAt: "2026-08-17T12:00:00.000Z",
      append: false,
      ...fiveMinuteAutoCaptureMetadata,
    });
    await persistence.appendChunk(
      "paused-hard-exit",
      0,
      await testBlob("first-active-second"),
      1_000,
    );
    await persistence.appendChunk(
      "paused-hard-exit",
      1,
      await testBlob("second-active-second"),
      2_000,
    );
    const stranded = await repository.getRecording("paused-hard-exit");
    if (!stranded) throw new Error("Paused capture was not created.");
    await repository.saveRecording({
      ...stranded,
      updatedAt: "2026-08-17T12:20:00.000Z",
    });

    const recovery = await recoverAfterCurrentLeases(repository);

    expect(recovery).toEqual({
      recoveredRecordingIds: ["paused-hard-exit"],
      discardedEmptyRecordingIds: [],
      failedRecordingIds: [],
      activeRecordingIds: [],
    });
    expect(await repository.getRecording("paused-hard-exit")).toMatchObject({
      status: "LOCAL_ONLY",
      durationMs: 2_000,
      completedByDurationLimit: false,
      segments: [{ durationMs: 2_000 }],
    });
  });

  it("marks an exact-limit Auto-Dictation hard exit as timer-complete", async () => {
    await persistence.begin({
      recordingId: "limit-hard-exit",
      mimeType: "audio/webm",
      createdAt: "2026-08-17T12:00:00.000Z",
      append: false,
      ...fiveMinuteAutoCaptureMetadata,
    });
    await persistence.appendChunk(
      "limit-hard-exit",
      0,
      await testBlob("complete-at-limit"),
      300_000,
    );

    const recovery = await recoverAfterCurrentLeases(repository);

    expect(recovery.recoveredRecordingIds).toEqual(["limit-hard-exit"]);
    expect(await repository.getRecording("limit-hard-exit")).toMatchObject({
      status: "LOCAL_ONLY",
      durationMs: 300_000,
      completedByDurationLimit: true,
      segments: [{ durationMs: 300_000 }],
    });
  });

  it("cleans an empty hard-exit take without sacrificing other recoveries", async () => {
    await persistence.begin({
      recordingId: "empty-hard-exit",
      mimeType: "audio/webm",
      createdAt: "2026-08-17T12:00:00.000Z",
      append: false,
      ...quickCaptureMetadata,
    });

    const recovery = await recoverAfterCurrentLeases(repository);

    expect(recovery).toEqual({
      recoveredRecordingIds: [],
      discardedEmptyRecordingIds: ["empty-hard-exit"],
      failedRecordingIds: [],
      activeRecordingIds: [],
    });
    expect(await repository.getRecording("empty-hard-exit")).toBeUndefined();
  });

  it("leaves another tab's live capture untouched, then recovers it only after lease expiry", async () => {
    const leaseStart = new Date("2026-08-17T12:00:00.000Z");
    const owner = new RepositoryCapturePersistence(repository, {
      ownerId: "capture-owner-tab-a",
      now: () => leaseStart,
    });
    await owner.begin({
      recordingId: "cross-tab-live",
      mimeType: "audio/webm",
      createdAt: leaseStart.toISOString(),
      append: false,
      ...quickCaptureMetadata,
    });
    await owner.appendChunk(
      "cross-tab-live",
      0,
      await testBlob("tab-a-audio"),
      1_000,
    );
    const secondConnection = await createQctpRepository({ name: databaseName });
    try {
      const whileLive = await recoverInterruptedCaptures(secondConnection, {
        now: () => new Date("2026-08-17T12:00:30.000Z"),
      });
      expect(whileLive).toEqual({
        recoveredRecordingIds: [],
        discardedEmptyRecordingIds: [],
        failedRecordingIds: [],
        activeRecordingIds: ["cross-tab-live"],
      });
      expect(await repository.getRecording("cross-tab-live")).toMatchObject({
        status: "CAPTURING",
        captureOwnerId: "capture-owner-tab-a",
      });

      const afterExpiry = await recoverInterruptedCaptures(secondConnection, {
        now: () => new Date("2026-08-17T12:01:01.000Z"),
      });
      expect(afterExpiry).toEqual({
        recoveredRecordingIds: ["cross-tab-live"],
        discardedEmptyRecordingIds: [],
        failedRecordingIds: [],
        activeRecordingIds: [],
      });
      expect(await repository.getRecording("cross-tab-live")).toMatchObject({
        status: "LOCAL_ONLY",
        durationMs: 1_000,
        captureOwnerId: null,
        captureLeaseExpiresAt: null,
      });
    } finally {
      secondConnection.close();
    }
  });

  it("isolates a malformed CAPTURING row while recovering another durable take", async () => {
    await persistence.begin({
      recordingId: "valid-beside-malformed",
      mimeType: "audio/webm",
      createdAt: "2026-08-17T12:00:00.000Z",
      append: false,
      ...quickCaptureMetadata,
    });
    await persistence.appendChunk(
      "valid-beside-malformed",
      0,
      await testBlob("valid-audio"),
      900,
    );
    const raw = await openQctpDatabase({ name: databaseName });
    try {
      await raw.put("recordings", {
        id: "malformed-capturing",
        status: "CAPTURING",
      } as never);
    } finally {
      raw.close();
    }

    const recovery = await recoverAfterCurrentLeases(repository);

    expect(recovery.recoveredRecordingIds).toEqual(["valid-beside-malformed"]);
    expect(recovery.failedRecordingIds).toEqual(["malformed-capturing"]);
    expect(
      await repository.getRecording("valid-beside-malformed"),
    ).toMatchObject({ status: "LOCAL_ONLY", durationMs: 900 });
  });
});
