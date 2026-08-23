import type { VoiceCaptureContext, VoiceCaptureMode } from "../domain";

export const captureDestinations = [
  ["unclassified", "Unclassified / route later"],
  ["workbook", "Today / workbook"],
  ["codex", "Codex free note"],
  ["dream", "Dream"],
  ["synchronicity", "Synchronicity"],
  ["intuition", "Intuition"],
  ["obe", "OBE"],
  ["remote_viewing", "Remote Viewing"],
  ["psionics", "Psionics"],
  ["studio", "Studio / geometry"],
  ["mirror", "Mirror"],
  ["source_note", "Source note"],
  ["integration", "Integration action"],
  ["question", "Question queue"],
] as const;

export type CaptureDestination = (typeof captureDestinations)[number][0];
export type CaptureMode = VoiceCaptureMode;

export const timedCaptureMinutes = [5, 10, 20] as const;
export type TimedCaptureMinutes = (typeof timedCaptureMinutes)[number];

/**
 * A capture's owning workflow is explicit so a generic destination ID is never
 * mistaken for a practice-debrief session. The context is stored with the
 * accepted record and survives export without requiring a database migration.
 */
export type CaptureContext = VoiceCaptureContext;

export const GLOBAL_CAPTURE_CONTEXT: CaptureContext = { type: "global" };

export function captureContextTargetId(context: CaptureContext): string | null {
  switch (context.type) {
    case "global":
      return null;
    case "field":
      return context.fieldTargetId;
    case "practice-debrief":
      return context.practiceSessionId;
    case "reg-session":
      return context.regSessionId;
    case "experiment":
      return context.experimentId;
  }
}

export interface AcceptedCapture {
  recordingId: string;
  title: string;
  destination: CaptureDestination;
  tags: string[];
  durationMs: number;
  mimeType: string;
  manualText: string;
  captureMode: CaptureMode;
  requestedDurationMinutes: TimedCaptureMinutes | null;
  completedByDurationLimit: boolean;
  context: CaptureContext;
  queueLocalTranscription: boolean;
}
