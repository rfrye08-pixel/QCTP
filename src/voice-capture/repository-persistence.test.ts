import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createQctpRepository,
  deleteQctpDatabase,
  type QctpRepository,
} from "../data";

import { RepositoryCapturePersistence } from "./repository-persistence";

async function testBlob(value: string): Promise<Blob> {
  return new Response(value, {
    headers: { "content-type": "audio/webm" },
  }).blob();
}

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

  it("persists chunks immediately and preserves appended segments in sequence", async () => {
    const recordingId = "recording-one";
    await expect(
      persistence.begin({
        recordingId,
        mimeType: "audio/webm",
        createdAt: "2026-08-17T12:00:00.000Z",
        append: false,
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
});
