import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createQctpRepository,
  deleteQctpDatabase,
  type QctpRepository,
} from "../data";

import { acceptVoiceCapture } from "./accept-capture";
import { RepositoryCapturePersistence } from "./repository-persistence";

describe("voice acceptance boundary", () => {
  let databaseName: string;
  let repository: QctpRepository;

  beforeEach(async () => {
    databaseName = `voice-acceptance-${crypto.randomUUID()}`;
    repository = await createQctpRepository({ name: databaseName });
    const persistence = new RepositoryCapturePersistence(repository);
    await persistence.begin({
      recordingId: "voice-one",
      mimeType: "audio/webm",
      createdAt: "2026-08-17T12:00:00.000Z",
      append: false,
    });
    const audio = await new Response("audio", {
      headers: { "content-type": "audio/webm" },
    }).blob();
    await persistence.appendChunk("voice-one", 0, audio);
    await persistence.finalize("voice-one", 1_200, "audio/webm");
  });

  afterEach(async () => {
    repository.close();
    await deleteQctpDatabase(databaseName);
  });

  it("creates no queue before acceptance and preserves the recording-to-record link after acceptance", async () => {
    expect(await repository.listTranscriptionQueue()).toEqual([]);
    const result = await acceptVoiceCapture(repository, {
      recordingId: "voice-one",
      title: "Field observation",
      destination: "codex",
      tags: ["Geometry"],
      durationMs: 1_200.4,
      mimeType: "audio/webm",
      manualText: "The overlap became visible while drawing.",
      fieldTargetId: null,
      queueLocalTranscription: true,
    });
    expect(result.record.fields).toMatchObject({
      voiceRecordingId: "voice-one",
    });
    expect(result.record.observation?.text).toBe(
      "The overlap became visible while drawing.",
    );
    const acceptedRecording = await repository.getRecording("voice-one");
    expect(acceptedRecording).toMatchObject({
      status: "TRANSCRIPTION_QUEUED",
      transcriptionRoute: "local_only",
      provider: null,
      model: null,
    });
    expect(typeof acceptedRecording?.acceptedAt).toBe("string");
    expect(await repository.listTranscriptionQueue()).toHaveLength(1);
  });
});
