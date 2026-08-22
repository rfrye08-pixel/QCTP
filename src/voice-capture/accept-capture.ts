import {
  CodexRecordSchema,
  VoiceRecordingSchema,
  type CodexRecord,
  type RecordKind,
  type TranscriptionQueueItem,
  type VoiceDestination,
} from "../domain";
import type { QctpRepository } from "../data";

import type { AcceptedCapture, CaptureDestination } from "./capture-types";

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
  const normalizedDurationMs = Math.max(
    recording.durationMs,
    Math.round(capture.durationMs),
  );
  const acceptedRecording = VoiceRecordingSchema.parse({
    ...recording,
    acceptedAt,
    durationMs: normalizedDurationMs,
    mimeType: capture.mimeType,
    destinationType: destinationMap[capture.destination],
    destinationId: capture.fieldTargetId ?? recordId,
    status: "LOCAL_ONLY",
    transcriptionRoute: "local_only",
    provider: null,
    model: null,
    updatedAt: acceptedAt,
  });
  const observationId = `${recordId}:observation`;
  const record = CodexRecordSchema.parse({
    schemaVersion: 1,
    id: recordId,
    kind: kindMap[capture.destination],
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
    tags: [...new Set(["voice", ...capture.tags])],
    backlinks: [],
    sourceLinks: [],
    attachmentIds: [],
    revisionIds: [],
    pathId: capture.destination === "studio" ? "reg-path" : null,
    sessionId: capture.destination === "studio" ? capture.fieldTargetId : null,
    fields: {
      voiceRecordingId: capture.recordingId,
      destination: capture.destination,
      fieldTargetId: capture.fieldTargetId,
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
  await repository.saveRecording(acceptedRecording);
  await repository.saveRecord(record);
  const queueItem = capture.queueLocalTranscription
    ? await repository.enqueueTranscription(capture.recordingId, acceptedAt)
    : null;
  return { recordingId: capture.recordingId, record, queueItem };
}
