import { z } from "zod";

import type { TranscriptionAccuracy } from "../contracts.js";
import { ProviderError, safeProviderRequestId } from "../errors.js";
import type {
  TranscriptionInput,
  TranscriptionProvider,
  TranscriptionProviderResult,
} from "./types.js";

const LocalWhisperResponseSchema = z
  .object({
    text: z.string(),
    language: z.string().optional(),
  })
  .passthrough();

const loopbackHosts = new Set(["127.0.0.1", "[::1]", "::1"]);

export const parseLoopbackHttpUrl = (value: string): URL => {
  let url: URL;
  try {
    url = new URL(value);
  } catch (error: unknown) {
    throw new Error("Local Whisper URL must be a valid URL.", { cause: error });
  }

  if (
    url.protocol !== "http:" ||
    !loopbackHosts.has(url.hostname.toLowerCase()) ||
    url.username.length > 0 ||
    url.password.length > 0
  ) {
    throw new Error(
      "Local Whisper URL must use unauthenticated HTTP on a loopback host.",
    );
  }
  return url;
};

export interface LocalWhisperTransport {
  transcribe(input: TranscriptionInput): Promise<TranscriptionProviderResult>;
}

export interface LoopbackWhisperHttpTransportOptions {
  readonly endpoint: string;
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
}

/**
 * Adapter for an OpenAI-compatible Whisper companion that runs only on this PC.
 * Endpoint validation deliberately rejects LAN and internet hosts to prevent audio
 * from leaving the PX13 in Free Local Mode.
 */
export class LoopbackWhisperHttpTransport implements LocalWhisperTransport {
  readonly #endpoint: URL;
  readonly #fetch: typeof fetch;
  readonly #timeoutMs: number;

  constructor(options: LoopbackWhisperHttpTransportOptions) {
    this.#endpoint = parseLoopbackHttpUrl(options.endpoint);
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#timeoutMs = options.timeoutMs ?? 5 * 60 * 1_000;
    if (!Number.isInteger(this.#timeoutMs) || this.#timeoutMs < 1_000) {
      throw new Error("Local Whisper timeout must be at least one second.");
    }
  }

  async transcribe(
    input: TranscriptionInput,
  ): Promise<TranscriptionProviderResult> {
    const form = new FormData();
    form.append(
      "file",
      new Blob([new Uint8Array(input.audio)], { type: input.mimeType }),
      input.filename,
    );
    form.append("model", input.model);
    form.append("response_format", "json");
    if (input.language !== undefined) {
      form.append("language", input.language);
    }
    if (input.prompt !== undefined) {
      form.append("prompt", input.prompt);
    }

    const controller = new AbortController();
    const abortFromCaller = () => controller.abort(input.signal?.reason);
    input.signal?.addEventListener("abort", abortFromCaller, { once: true });
    const timeout = setTimeout(() => controller.abort(), this.#timeoutMs);
    timeout.unref();

    try {
      const response = await this.#fetch(this.#endpoint, {
        method: "POST",
        body: form,
        signal: controller.signal,
        redirect: "error",
      });

      if (!response.ok) {
        const requestId = safeProviderRequestId(
          response.headers.get("x-request-id"),
        );
        if (response.status === 429) {
          throw new ProviderError({
            kind: "rate_limited",
            retryable: true,
            providerStatus: response.status,
            ...(requestId === undefined
              ? {}
              : { providerRequestId: requestId }),
          });
        }
        if (response.status >= 500) {
          throw new ProviderError({
            kind: "unavailable",
            retryable: true,
            providerStatus: response.status,
            ...(requestId === undefined
              ? {}
              : { providerRequestId: requestId }),
          });
        }
        throw new ProviderError({
          kind: "rejected",
          retryable: false,
          providerStatus: response.status,
          ...(requestId === undefined ? {} : { providerRequestId: requestId }),
        });
      }

      const parsed = LocalWhisperResponseSchema.safeParse(
        await response.json(),
      );
      if (!parsed.success || parsed.data.text.trim().length === 0) {
        throw new ProviderError({
          kind: "rejected",
          retryable: false,
          providerStatus: response.status,
        });
      }

      const providerRequestId = safeProviderRequestId(
        response.headers.get("x-request-id"),
      );
      return {
        text: parsed.data.text,
        ...(parsed.data.language === undefined
          ? {}
          : { language: parsed.data.language }),
        ...(providerRequestId === undefined ? {} : { providerRequestId }),
      };
    } catch (error: unknown) {
      if (error instanceof ProviderError) {
        throw error;
      }
      throw new ProviderError({
        kind: "unavailable",
        retryable: true,
        cause: error,
      });
    } finally {
      clearTimeout(timeout);
      input.signal?.removeEventListener("abort", abortFromCaller);
    }
  }
}

export interface LocalWhisperProviderOptions {
  readonly transport: LocalWhisperTransport;
  readonly defaultModel?: string;
  readonly highAccuracyModel?: string;
}

export class LocalWhisperProvider implements TranscriptionProvider {
  readonly name = "local-whisper";
  readonly #transport: LocalWhisperTransport;
  readonly #defaultModel: string;
  readonly #highAccuracyModel: string;

  constructor(options: LocalWhisperProviderOptions) {
    this.#transport = options.transport;
    this.#defaultModel = options.defaultModel ?? "base";
    this.#highAccuracyModel = options.highAccuracyModel ?? "small";
  }

  modelForAccuracy(accuracy: TranscriptionAccuracy): string {
    return accuracy === "high" ? this.#highAccuracyModel : this.#defaultModel;
  }

  transcribe(input: TranscriptionInput): Promise<TranscriptionProviderResult> {
    return this.#transport.transcribe(input);
  }
}
