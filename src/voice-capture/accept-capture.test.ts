import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { PracticeSessionSchema } from "../domain";
import {
  createQctpRepository,
  deleteQctpDatabase,
  type QctpRepository,
} from "../data";

import { acceptVoiceCapture } from "./accept-capture";
import type { AcceptedCapture } from "./capture-types";
import { RepositoryCapturePersistence } from "./repository-persistence";

function practiceSession(id: string, status: "pending" | "skipped") {
  return PracticeSessionSchema.parse({
    schemaVersion: 1,
    id,
    practiceId: "foundation-day1-source-rev0-voice-free",
    foundationDay: 1,
    scriptId: "QCTP-D1-SOURCE-LABELED-SCRIPT-CANDIDATE-REV0",
    scriptSha256:
      "2649ce70e5ab824dbc6b797e07082567fda2443962016e8e6c7dbe454f5ee555",
    startedAt: "2026-08-17T11:35:00.000Z",
    endedAt: "2026-08-17T12:00:00.000Z",
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
      status,
      recordId: null,
      updatedAt: "2026-08-17T12:00:00.000Z",
      remindAt: null,
      promptVersion: "RAW_OBSERVATION_REV0",
    },
    createdAt: "2026-08-17T12:00:00.000Z",
  });
}

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
    await repository.savePracticeSession(
      practiceSession("practice-one", "pending"),
    );
    const capture: AcceptedCapture = {
      recordingId: "voice-one",
      title: "Field observation",
      destination: "codex",
      tags: ["Geometry"],
      durationMs: 1_200.4,
      mimeType: "audio/webm",
      manualText: "The overlap became visible while drawing.",
      fieldTargetId: null,
      sessionId: "practice-one",
      queueLocalTranscription: true,
    };
    const result = await acceptVoiceCapture(repository, capture);
    expect(result.record.fields).toMatchObject({
      voiceRecordingId: "voice-one",
      practiceSessionId: "practice-one",
    });
    expect(result.record.sessionId).toBe("practice-one");
    expect(result.record.interpretation).toBeNull();
    expect(await repository.getPracticeSession("practice-one")).toMatchObject({
      debrief: {
        status: "completed",
        recordId: result.record.id,
      },
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

    const recordBeforeReplay = await repository.getRecord(result.record.id);
    const sessionBeforeReplay =
      await repository.getPracticeSession("practice-one");
    const repeated = await acceptVoiceCapture(repository, capture);
    expect(repeated.record.id).toBe(result.record.id);
    expect(await repository.getRecord(result.record.id)).toEqual(
      recordBeforeReplay,
    );
    expect(await repository.getPracticeSession("practice-one")).toEqual(
      sessionBeforeReplay,
    );
    expect(await repository.listRecords()).toHaveLength(1);
    expect(await repository.listTranscriptionQueue()).toHaveLength(1);

    await repository.saveTranscript({
      schemaVersion: 1,
      id: "transcript-voice-one",
      recordingId: "voice-one",
      provider: "px13-local",
      model: "whisper-base",
      language: "en",
      originalText: "The overlap became visible while drawing.",
      correctedText: null,
      corrections: [],
      timestamps: [],
      confidenceMetadata: {},
      createdAt: "2026-08-17T12:01:00.000Z",
      correctedAt: null,
    });
    const afterTranscript = await acceptVoiceCapture(repository, capture);
    expect(afterTranscript.queueItem).toBeNull();
    expect(await repository.listTranscriptionQueue()).toEqual([]);
    expect(await repository.getRecording("voice-one")).toMatchObject({
      status: "TRANSCRIBED",
      provider: "px13-local",
      model: "whisper-base",
    });
  });

  it("rolls the entire acceptance bundle back when its practice link is missing", async () => {
    await expect(
      acceptVoiceCapture(repository, {
        recordingId: "voice-one",
        title: "Uncommitted debrief",
        destination: "codex",
        tags: ["raw-observation"],
        durationMs: 1_200,
        mimeType: "audio/webm",
        manualText: "A direct observation.",
        fieldTargetId: null,
        sessionId: "missing-practice",
        queueLocalTranscription: true,
      }),
    ).rejects.toThrow("Practice session not found");
    expect(await repository.getRecording("voice-one")).toMatchObject({
      acceptedAt: null,
    });
    expect(await repository.listRecords()).toEqual([]);
    expect(await repository.listTranscriptionQueue()).toEqual([]);
  });

  it("does not override a terminal skipped debrief", async () => {
    await repository.savePracticeSession(
      practiceSession("practice-skipped", "skipped"),
    );
    await expect(
      acceptVoiceCapture(repository, {
        recordingId: "voice-one",
        title: "Skipped debrief collision",
        destination: "codex",
        tags: ["raw-observation"],
        durationMs: 1_200,
        mimeType: "audio/webm",
        manualText: "A direct observation.",
        fieldTargetId: null,
        sessionId: "practice-skipped",
        queueLocalTranscription: true,
      }),
    ).rejects.toThrow("cannot transition from skipped to completed");
    expect(await repository.getRecording("voice-one")).toMatchObject({
      acceptedAt: null,
    });
    expect(await repository.listRecords()).toEqual([]);
    expect(await repository.listTranscriptionQueue()).toEqual([]);
    expect(
      await repository.getPracticeSession("practice-skipped"),
    ).toMatchObject({ debrief: { status: "skipped", recordId: null } });
  });
});
