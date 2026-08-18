import OpenAI, { APIError, toFile } from "openai";
import type { Uploadable } from "openai";

import {
  openAIModelForAccuracy,
  TranscriptionModelSchema,
  type TranscriptionAccuracy,
  type TranscriptionModel,
} from "../contracts.js";
import { ProviderError, safeProviderRequestId } from "../errors.js";
import {
  SpendLimitExceededError,
  type PaidCloudSpendLimit,
  type SpendReservation,
} from "../spend-limit.js";
import type {
  TranscriptionInput,
  TranscriptionProvider,
  TranscriptionProviderResult,
} from "./types.js";

interface OpenAITranscriptionParams {
  readonly file: Uploadable;
  readonly model: TranscriptionModel;
  readonly response_format: "json";
  readonly language?: string;
  readonly prompt?: string;
}

interface OpenAITranscriptionResult {
  readonly text: string;
}

export type CreateOpenAITranscription = (
  params: OpenAITranscriptionParams,
) => Promise<OpenAITranscriptionResult>;

export interface OpenAITranscriptionProviderOptions {
  /** Server-only credential. Never serialize this options object. */
  readonly apiKey?: string;
  readonly createTranscription?: CreateOpenAITranscription;
  readonly spendLimit?: PaidCloudSpendLimit;
  readonly maximumUsdPerAudioMinute?: number;
}

export class OpenAITranscriptionProvider implements TranscriptionProvider {
  readonly name = "openai";
  readonly #createTranscription: CreateOpenAITranscription;
  readonly #spendLimit: PaidCloudSpendLimit | undefined;
  readonly #maximumUsdPerAudioMinute: number | undefined;

  constructor(options: OpenAITranscriptionProviderOptions) {
    this.#spendLimit = options.spendLimit;
    this.#maximumUsdPerAudioMinute = options.maximumUsdPerAudioMinute;
    if (options.createTranscription !== undefined) {
      this.#createTranscription = options.createTranscription;
      return;
    }

    if (options.apiKey === undefined || options.apiKey.trim().length === 0) {
      throw new Error("OPENAI_API_KEY is required for the OpenAI provider.");
    }
    if (
      this.#spendLimit === undefined ||
      this.#maximumUsdPerAudioMinute === undefined ||
      !Number.isFinite(this.#maximumUsdPerAudioMinute) ||
      this.#maximumUsdPerAudioMinute <= 0
    ) {
      throw new Error(
        "A paid-cloud spend limit and positive maximum cost estimate are required.",
      );
    }

    const client = new OpenAI({ apiKey: options.apiKey });
    this.#createTranscription = async (params) =>
      client.audio.transcriptions.create(params);
  }

  modelForAccuracy(accuracy: TranscriptionAccuracy): TranscriptionModel {
    return openAIModelForAccuracy(accuracy);
  }

  async transcribe(
    input: TranscriptionInput,
  ): Promise<TranscriptionProviderResult> {
    let reservation: SpendReservation | undefined;
    try {
      if (
        this.#spendLimit !== undefined &&
        this.#maximumUsdPerAudioMinute !== undefined
      ) {
        const maximumChargeUsd = Math.max(
          0.01,
          (input.durationMs / 60_000) * this.#maximumUsdPerAudioMinute,
        );
        reservation = this.#spendLimit.reserve(maximumChargeUsd);
      }
      const model = TranscriptionModelSchema.parse(input.model);
      const file = await toFile(input.audio, input.filename, {
        type: input.mimeType,
      });
      const result = await this.#createTranscription({
        file,
        model,
        response_format: "json",
        ...(input.language === undefined ? {} : { language: input.language }),
        ...(input.prompt === undefined ? {} : { prompt: input.prompt }),
      });

      reservation?.commit();
      return { text: result.text };
    } catch (error: unknown) {
      reservation?.release();
      if (error instanceof SpendLimitExceededError) {
        throw new ProviderError({
          kind: "budget_exceeded",
          retryable: false,
          cause: error,
        });
      }
      if (error instanceof ProviderError) {
        throw error;
      }

      if (error instanceof APIError) {
        const safeProviderError = error as {
          readonly status: unknown;
          readonly requestID: unknown;
        };
        const status =
          typeof safeProviderError.status === "number"
            ? safeProviderError.status
            : undefined;
        const requestId = safeProviderRequestId(safeProviderError.requestID);
        if (status === 429) {
          throw new ProviderError({
            kind: "rate_limited",
            retryable: true,
            providerStatus: status,
            ...(requestId === undefined
              ? {}
              : { providerRequestId: requestId }),
            cause: error,
          });
        }

        if (status === undefined || status === 408 || status >= 500) {
          throw new ProviderError({
            kind: "unavailable",
            retryable: true,
            ...(status === undefined ? {} : { providerStatus: status }),
            ...(requestId === undefined
              ? {}
              : { providerRequestId: requestId }),
            cause: error,
          });
        }

        throw new ProviderError({
          kind: "rejected",
          retryable: false,
          providerStatus: status,
          ...(requestId === undefined ? {} : { providerRequestId: requestId }),
          cause: error,
        });
      }

      throw new ProviderError({
        kind: "unavailable",
        retryable: true,
        cause: error,
      });
    }
  }
}
