import type { TranscriptionAccuracy } from "../contracts.js";

export interface TranscriptionInput {
  readonly audio: Buffer;
  readonly filename: string;
  readonly mimeType: string;
  readonly durationMs: number;
  readonly model: string;
  readonly language?: string;
  readonly prompt?: string;
  readonly signal?: AbortSignal;
}

export interface TranscriptionProviderResult {
  readonly text: string;
  readonly language?: string;
  readonly providerRequestId?: string;
}

export interface TranscriptionProvider {
  readonly name: string;
  modelForAccuracy(accuracy: TranscriptionAccuracy): string;
  transcribe(input: TranscriptionInput): Promise<TranscriptionProviderResult>;
}
