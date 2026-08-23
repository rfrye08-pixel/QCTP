import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  PracticeSessionSchema,
  type RequestedAutoDictationDurationMs,
  type VoiceCaptureContext,
  type VoiceCaptureMode,
} from "../domain";
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

async function createFinalizedRecording(
  repository: QctpRepository,
  input: {
    recordingId: string;
    captureMode: VoiceCaptureMode;
    requestedDurationMs: RequestedAutoDictationDurationMs | null;
    captureContext: VoiceCaptureContext;
    durationMs?: number;
    completedByDurationLimit?: boolean;
  },
): Promise<void> {
  const persistence = new RepositoryCapturePersistence(repository);
  await persistence.begin({
    recordingId: input.recordingId,
    mimeType: "audio/webm",
    createdAt: "2026-08-17T12:00:00.000Z",
    append: false,
    captureMode: input.captureMode,
    requestedDurationMs: input.requestedDurationMs,
    captureContext: input.captureContext,
  });
  const audio = await new Response("audio", {
    headers: { "content-type": "audio/webm" },
  }).blob();
  await persistence.appendChunk(input.recordingId, 0, audio);
  await persistence.finalize(
    input.recordingId,
    input.durationMs ?? 1_200,
    "audio/webm",
    input.completedByDurationLimit ?? false,
  );
}

describe("voice acceptance boundary", () => {
  let databaseName: string;
  let repository: QctpRepository;

  beforeEach(async () => {
    databaseName = `voice-acceptance-${crypto.randomUUID()}`;
    repository = await createQctpRepository({ name: databaseName });
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
    await createFinalizedRecording(repository, {
      recordingId: "voice-one",
      captureMode: "debrief",
      requestedDurationMs: null,
      captureContext: {
        type: "practice-debrief",
        practiceSessionId: "practice-one",
      },
    });
    const capture: AcceptedCapture = {
      recordingId: "voice-one",
      title: "Field observation",
      destination: "codex",
      tags: ["Geometry"],
      durationMs: 1_200.4,
      mimeType: "audio/webm",
      manualText: "The overlap became visible while drawing.",
      captureMode: "debrief",
      requestedDurationMinutes: null,
      completedByDurationLimit: false,
      context: {
        type: "practice-debrief",
        practiceSessionId: "practice-one",
      },
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
    await createFinalizedRecording(repository, {
      recordingId: "voice-one",
      captureMode: "debrief",
      requestedDurationMs: null,
      captureContext: {
        type: "practice-debrief",
        practiceSessionId: "missing-practice",
      },
    });
    await expect(
      acceptVoiceCapture(repository, {
        recordingId: "voice-one",
        title: "Uncommitted debrief",
        destination: "codex",
        tags: ["raw-observation"],
        durationMs: 1_200,
        mimeType: "audio/webm",
        manualText: "A direct observation.",
        captureMode: "debrief",
        requestedDurationMinutes: null,
        completedByDurationLimit: false,
        context: {
          type: "practice-debrief",
          practiceSessionId: "missing-practice",
        },
        queueLocalTranscription: true,
      }),
    ).rejects.toThrow("Practice session not found");
    expect(await repository.getRecording("voice-one")).toMatchObject({
      acceptedAt: null,
    });
    expect(await repository.listRecords()).toEqual([]);
    expect(await repository.listTranscriptionQueue()).toEqual([]);
  });

  it("rejects caller-inflated duration before mutating the finalized recording", async () => {
    await createFinalizedRecording(repository, {
      recordingId: "duration-integrity",
      captureMode: "quick",
      requestedDurationMs: null,
      captureContext: { type: "global" },
      durationMs: 1_200,
    });
    const before = await repository.getRecording("duration-integrity");

    await expect(
      acceptVoiceCapture(repository, {
        recordingId: "duration-integrity",
        title: "Inflated duration",
        destination: "codex",
        tags: [],
        durationMs: 1_200_000,
        mimeType: "audio/webm",
        manualText: "Must not be saved.",
        captureMode: "quick",
        requestedDurationMinutes: null,
        completedByDurationLimit: false,
        context: { type: "global" },
        queueLocalTranscription: true,
      }),
    ).rejects.toThrow(/does not match the finalized local recording/u);

    expect(await repository.getRecording("duration-integrity")).toEqual(before);
    expect(await repository.listRecords()).toEqual([]);
    expect(await repository.listTranscriptionQueue()).toEqual([]);
  });

  it("does not override a terminal skipped debrief", async () => {
    await repository.savePracticeSession(
      practiceSession("practice-skipped", "skipped"),
    );
    await createFinalizedRecording(repository, {
      recordingId: "voice-one",
      captureMode: "debrief",
      requestedDurationMs: null,
      captureContext: {
        type: "practice-debrief",
        practiceSessionId: "practice-skipped",
      },
    });
    await expect(
      acceptVoiceCapture(repository, {
        recordingId: "voice-one",
        title: "Skipped debrief collision",
        destination: "codex",
        tags: ["raw-observation"],
        durationMs: 1_200,
        mimeType: "audio/webm",
        manualText: "A direct observation.",
        captureMode: "debrief",
        requestedDurationMinutes: null,
        completedByDurationLimit: false,
        context: {
          type: "practice-debrief",
          practiceSessionId: "practice-skipped",
        },
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

  it("preserves global timed metadata as a separate raw Auto-Dictation record", async () => {
    await createFinalizedRecording(repository, {
      recordingId: "global-timed-ten",
      captureMode: "auto-dictation",
      requestedDurationMs: 600_000,
      captureContext: { type: "global" },
      durationMs: 600_000,
      completedByDurationLimit: true,
    });

    const accepted = await acceptVoiceCapture(repository, {
      recordingId: "global-timed-ten",
      title: "Ten-minute raw observation",
      destination: "codex",
      tags: ["Morning"],
      durationMs: 600_000,
      mimeType: "audio/webm",
      manualText: "A direct raw observation without later analysis.",
      captureMode: "auto-dictation",
      requestedDurationMinutes: 10,
      completedByDurationLimit: true,
      context: { type: "global" },
      queueLocalTranscription: true,
    });

    expect(await repository.getRecording("global-timed-ten")).toMatchObject({
      durationMs: 600_000,
      captureMode: "auto-dictation",
      requestedDurationMs: 600_000,
      captureContext: { type: "global" },
      completedByDurationLimit: true,
      status: "TRANSCRIPTION_QUEUED",
      provider: null,
      model: null,
    });
    expect(accepted.record).toMatchObject({
      kind: "auto_dictation",
      interpretation: null,
      sessionId: null,
      tags: ["voice", "auto-dictation", "Morning"],
      fields: {
        captureModality: "voice",
        captureMode: "auto-dictation",
        captureContext: { type: "global" },
        requestedDurationMinutes: 10,
        actualDurationMs: 600_000,
        completedByDurationLimit: true,
        voiceRecordingId: "global-timed-ten",
        destination: "codex",
        fieldTargetId: null,
        practiceSessionId: null,
        layerStatus: {
          rawAudio: "preserved",
          verbatimTranscript: "pending_or_not_requested",
          correctedTranscript: "not_created",
          cleanNote: "not_created",
          interpretation: "not_created",
        },
      },
    });
    expect(await repository.listTranscriptionQueue()).toEqual([
      expect.objectContaining({ recordingId: "global-timed-ten" }),
    ]);
  });

  it.each([
    {
      label: "mode",
      recordingMode: "quick" as const,
      recordingDurationMs: null,
      recordingContext: { type: "global" } as const,
      captureMode: "auto-dictation" as const,
      captureDurationMinutes: 5 as const,
      captureContext: { type: "global" } as const,
      expectedError: "saved recording mode does not match",
    },
    {
      label: "duration",
      recordingMode: "auto-dictation" as const,
      recordingDurationMs: 300_000 as const,
      recordingContext: { type: "global" } as const,
      captureMode: "auto-dictation" as const,
      captureDurationMinutes: 10 as const,
      captureContext: { type: "global" } as const,
      expectedError: "saved recording duration limit does not match",
    },
    {
      label: "context",
      recordingMode: "auto-dictation" as const,
      recordingDurationMs: 300_000 as const,
      recordingContext: {
        type: "field",
        fieldTargetId: "workbook-answer-one",
      } as const,
      captureMode: "auto-dictation" as const,
      captureDurationMinutes: 5 as const,
      captureContext: { type: "global" } as const,
      expectedError: "saved recording context does not match",
    },
  ])(
    "atomically rejects a persisted $label mismatch before record or queue mutation",
    async ({
      label,
      recordingMode,
      recordingDurationMs,
      recordingContext,
      captureMode,
      captureDurationMinutes,
      captureContext,
      expectedError,
    }) => {
      const recordingId = `mismatched-${label}`;
      await createFinalizedRecording(repository, {
        recordingId,
        captureMode: recordingMode,
        requestedDurationMs: recordingDurationMs,
        captureContext: recordingContext,
        durationMs: recordingDurationMs ?? 1_200,
        completedByDurationLimit: recordingMode === "auto-dictation",
      });
      const before = await repository.getRecording(recordingId);

      await expect(
        acceptVoiceCapture(repository, {
          recordingId,
          title: "Must not be accepted",
          destination: "codex",
          tags: [],
          durationMs: recordingDurationMs ?? 1_200,
          mimeType: "audio/webm",
          manualText: "This record must never be written.",
          captureMode,
          requestedDurationMinutes: captureDurationMinutes,
          completedByDurationLimit: true,
          context: captureContext,
          queueLocalTranscription: true,
        }),
      ).rejects.toThrow(expectedError);

      expect(await repository.getRecording(recordingId)).toEqual(before);
      expect(await repository.listRecords()).toEqual([]);
      expect(await repository.listTranscriptionQueue()).toEqual([]);
    },
  );
});
