import {
  CodexRecordSchema,
  VoiceRecordingSchema,
  type CodexRecord,
  type RecordKind,
  type TranscriptionQueueItem,
  type VoiceDestination,
} from "../domain";
import type { QctpRepository } from "../data";

import {
  captureContextTargetId,
  timedCaptureMinutes,
  type AcceptedCapture,
  type CaptureDestination,
} from "./capture-types";

const destinationMap: Record<CaptureDestination, VoiceDestination> = {
  unclassified: "unclassified",
  workbook: "today_workbook",
  codex: "codex",
  dream: "dream",
  synchronicity: "synchronicity",
  intuition: "intuition",
  obe: "obe",
  remote_viewing: "remote_viewing",
  psionics: "psionics",
  studio: "studio_geometry",
  mirror: "mirror",
  source_note: "source_note",
  integration: "integration",
  question: "question",
};

const kindMap: Record<CaptureDestination, RecordKind> = {
  unclassified: "voice_note",
  workbook: "integration",
  codex: "voice_note",
  dream: "dream",
  synchronicity: "synchronicity",
  intuition: "intuition",
  obe: "obe",
  remote_viewing: "remote_viewing",
  psionics: "psionics",
  studio: "geometry",
  mirror: "mirror",
  source_note: "source_note",
  integration: "integration",
  question: "source_note",
};

export interface AcceptVoiceCaptureResult {
  recordingId: string;
  record: CodexRecord;
  queueItem: TranscriptionQueueItem | null;
}

const controlledTimedCaptureMinutes = new Set<number>(timedCaptureMinutes);

function validateRequestedDuration(
  capture: AcceptedCapture,
): (typeof timedCaptureMinutes)[number] | null {
  if (capture.captureMode === "auto-dictation") {
    if (
      capture.requestedDurationMinutes === null ||
      !controlledTimedCaptureMinutes.has(capture.requestedDurationMinutes)
    ) {
      throw new Error(
        "Auto-Dictation requires a controlled 5-, 10-, or 20-minute limit.",
      );
    }
    return capture.requestedDurationMinutes;
  }
  if (capture.requestedDurationMinutes !== null) {
    throw new Error(
      "Only Auto-Dictation may carry a requested duration limit.",
    );
  }
  return null;
}

function recordSessionId(capture: AcceptedCapture): string | null {
  switch (capture.context.type) {
    case "practice-debrief":
      return capture.context.practiceSessionId;
    case "reg-session":
      return capture.context.regSessionId;
    case "experiment":
      return capture.context.experimentId;
    case "field":
      return null;
    case "global":
      return null;
  }
}

/**
 * The explicit acceptance boundary. Capture chunks may exist before this call,
 * but no transcription job or destination record may be created before it.
 */
export async function acceptVoiceCapture(
  repository: QctpRepository,
  capture: AcceptedCapture,
): Promise<AcceptVoiceCaptureResult> {
  const recording = await repository.getRecording(capture.recordingId);
  if (!recording) throw new Error("The local recording metadata is missing.");
  const acceptedAt = new Date().toISOString();
  const recordId = `voice-record:${capture.recordingId}`;
  const requestedDurationMinutes = validateRequestedDuration(capture);
  const requestedDurationMs =
    requestedDurationMinutes === null
      ? null
      : requestedDurationMinutes * 60_000;
  const contextTargetId = captureContextTargetId(capture.context);
  const practiceDebriefSessionId =
    capture.context.type === "practice-debrief"
      ? capture.context.practiceSessionId
      : null;
  const submittedDurationMs = Math.round(capture.durationMs);
  if (submittedDurationMs !== recording.durationMs) {
    throw new Error(
      "The submitted duration does not match the finalized local recording.",
    );
  }
  if (capture.mimeType !== recording.mimeType) {
    throw new Error(
      "The submitted media type does not match the finalized local recording.",
    );
  }
  const normalizedDurationMs = recording.durationMs;
  if (
    recording.captureMode !== null &&
    recording.captureMode !== capture.captureMode
  ) {
    throw new Error("The saved recording mode does not match this capture.");
  }
  if (
    recording.requestedDurationMs !== null &&
    recording.requestedDurationMs !== requestedDurationMs
  ) {
    throw new Error(
      "The saved recording duration limit does not match this capture.",
    );
  }
  if (
    recording.captureContext !== null &&
    JSON.stringify(recording.captureContext) !== JSON.stringify(capture.context)
  ) {
    throw new Error("The saved recording context does not match this capture.");
  }
  if (
    recording.completedByDurationLimit !== null &&
    recording.completedByDurationLimit !== capture.completedByDurationLimit
  ) {
    throw new Error(
      "The saved recording completion reason does not match this capture.",
    );
  }
  const acceptedRecording = VoiceRecordingSchema.parse({
    ...recording,
    acceptedAt,
    durationMs: normalizedDurationMs,
    mimeType: capture.mimeType,
    destinationType: destinationMap[capture.destination],
    destinationId: contextTargetId ?? recordId,
    status: "LOCAL_ONLY",
    captureMode: capture.captureMode,
    requestedDurationMs,
    captureContext: capture.context,
    completedByDurationLimit:
      capture.captureMode === "auto-dictation"
        ? capture.completedByDurationLimit
        : null,
    transcriptionRoute: "local_only",
    provider: null,
    model: null,
    updatedAt: acceptedAt,
  });
  const observationId = `${recordId}:observation`;
  const record = CodexRecordSchema.parse({
    schemaVersion: 1,
    id: recordId,
    kind:
      capture.context.type === "global" &&
      capture.captureMode === "auto-dictation"
        ? "auto_dictation"
        : kindMap[capture.destination],
    title: capture.title,
    createdAt: recording.createdAt,
    updatedAt: acceptedAt,
    observation: capture.manualText
      ? {
          id: observationId,
          text: capture.manualText,
          capturedAt: acceptedAt,
          evidenceClass: "self_reported",
          provenance: {
            actor: "user",
            method: "voice-capture-manual-text",
            provider: null,
            model: null,
          },
          sourceIds: [],
        }
      : null,
    interpretation: null,
    tags: [
      ...new Set([
        "voice",
        ...(capture.captureMode === "auto-dictation" ? ["auto-dictation"] : []),
        ...capture.tags,
      ]),
    ],
    backlinks: [],
    sourceLinks: [],
    attachmentIds: [],
    revisionIds: [],
    pathId: capture.context.type === "reg-session" ? "reg-path" : null,
    sessionId: recordSessionId(capture),
    fields: {
      captureModality: "voice",
      captureMode: capture.captureMode,
      captureContext: capture.context,
      requestedDurationMinutes,
      actualDurationMs: normalizedDurationMs,
      completedByDurationLimit: capture.completedByDurationLimit,
      voiceRecordingId: capture.recordingId,
      destination: capture.destination,
      fieldTargetId:
        capture.context.type === "field" ? capture.context.fieldTargetId : null,
      practiceSessionId: practiceDebriefSessionId,
      layerStatus: {
        rawAudio: "preserved",
        verbatimTranscript: "pending_or_not_requested",
        correctedTranscript: "not_created",
        cleanNote: "not_created",
        interpretation: "not_created",
      },
    },
    deletedAt: null,
  });
  const accepted = await repository.acceptVoiceCaptureBundle({
    recording: acceptedRecording,
    record,
    queueLocalTranscription: capture.queueLocalTranscription,
    practiceDebriefSessionId,
    acceptedAt,
  });
  return {
    recordingId: capture.recordingId,
    record: accepted.record,
    queueItem: accepted.queueItem,
  };
}
