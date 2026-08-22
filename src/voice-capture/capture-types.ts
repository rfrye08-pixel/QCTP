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
export type CaptureMode = "quick" | "field" | "auto-dictation" | "experiment";

export interface AcceptedCapture {
  recordingId: string;
  title: string;
  destination: CaptureDestination;
  tags: string[];
  durationMs: number;
  mimeType: string;
  manualText: string;
  fieldTargetId: string | null;
  queueLocalTranscription: boolean;
}
