import { ProviderError } from "../errors.js";
import type { TranscriptionAccuracy } from "../contracts.js";
import type {
  TranscriptionInput,
  TranscriptionProvider,
  TranscriptionProviderResult,
} from "./types.js";

export interface MockTranscriptionProviderOptions {
  readonly text?: string;
  readonly language?: string;
  readonly failure?: "rate_limited" | "unavailable" | "rejected";
  readonly defaultModel?: string;
  readonly highModel?: string;
}

export class MockTranscriptionProvider implements TranscriptionProvider {
  readonly name = "mock";
  readonly calls: TranscriptionInput[] = [];
  readonly options: MockTranscriptionProviderOptions;

  constructor(options: MockTranscriptionProviderOptions = {}) {
    this.options = options;
  }

  modelForAccuracy(accuracy: TranscriptionAccuracy): string {
    return accuracy === "high"
      ? (this.options.highModel ?? "mock-high")
      : (this.options.defaultModel ?? "mock-default");
  }

  async transcribe(
    input: TranscriptionInput,
  ): Promise<TranscriptionProviderResult> {
    this.calls.push(input);

    if (this.options.failure !== undefined) {
      throw new ProviderError({
        kind: this.options.failure,
        retryable: this.options.failure !== "rejected",
        providerStatus: this.options.failure === "rate_limited" ? 429 : 503,
      });
    }

    return Promise.resolve({
      text: this.options.text ?? "Mock verbatim transcript.",
      ...(this.options.language === undefined
        ? {}
        : { language: this.options.language }),
      providerRequestId: "mock-request",
    });
  }
}
