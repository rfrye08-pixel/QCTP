import { homedir } from "node:os";
import { join } from "node:path";

import { z } from "zod";

import { parseLoopbackOllamaUrl } from "./mirror/provider.js";
import { parseLoopbackHttpUrl } from "./providers/local-whisper.js";

const BooleanEnvironmentValueSchema = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

const GatewayTokenSchema = z
  .string()
  .trim()
  .regex(
    /^[A-Fa-f0-9]{64}$/u,
    "Generate QCTP_API_TOKEN from exactly 32 random bytes encoded as hex",
  )
  .refine(
    (value) => new Set(value.toLowerCase()).size >= 8,
    "QCTP_API_TOKEN does not have enough character diversity",
  );

const EnvironmentSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    PORT: z.coerce.number().int().min(1).max(65_535).default(8787),
    QCTP_API_TOKEN: GatewayTokenSchema,
    QCTP_TRANSCRIPTION_PROVIDER: z
      .enum(["local", "mock", "openai"])
      .default("local"),
    QCTP_LOCAL_WHISPER_URL: z
      .string()
      .default("http://127.0.0.1:8788/v1/audio/transcriptions"),
    QCTP_LOCAL_WHISPER_MODEL: z.string().trim().min(1).max(128).default("base"),
    QCTP_LOCAL_WHISPER_HIGH_ACCURACY_MODEL: z
      .string()
      .trim()
      .min(1)
      .max(128)
      .default("small"),
    QCTP_MIRROR_OLLAMA_URL: z.string().default("http://127.0.0.1:11434"),
    QCTP_MIRROR_MODEL: z.string().trim().min(1).max(200).default("qwen2.5:7b"),
    QCTP_MIRROR_JOB_STORE_PATH: z.string().trim().min(1).max(4_096).optional(),
    QCTP_MIRROR_POLL_INTERVAL_MS: z.coerce
      .number()
      .int()
      .min(250)
      .max(60_000)
      .default(2_000),
    QCTP_ENABLE_PAID_CLOUD: BooleanEnvironmentValueSchema,
    QCTP_PAID_CLOUD_HARD_SPEND_LIMIT_USD: z.coerce
      .number()
      .finite()
      .min(0)
      .default(0),
    QCTP_PAID_CLOUD_MAX_USD_PER_AUDIO_MINUTE: z.coerce
      .number()
      .finite()
      .positive()
      .default(0.1),
    OPENAI_API_KEY: z.string().trim().min(20).optional(),
    QCTP_TRANSCRIPTION_MAX_BYTES: z.coerce
      .number()
      .int()
      .min(1_024)
      .max(100 * 1_024 * 1_024)
      .default(25 * 1_024 * 1_024),
    QCTP_TRANSCRIPTION_MAX_DURATION_MS: z.coerce
      .number()
      .int()
      .min(1_000)
      .max(60 * 60 * 1_000)
      .default(20 * 60 * 1_000),
    QCTP_TRANSCRIPTION_RATE_LIMIT: z.coerce
      .number()
      .int()
      .min(1)
      .max(1_000)
      .default(30),
    QCTP_TRANSCRIPTION_RATE_WINDOW_MS: z.coerce
      .number()
      .int()
      .min(1_000)
      .max(24 * 60 * 60 * 1_000)
      .default(60 * 60 * 1_000),
  })
  .passthrough()
  .superRefine((value, context) => {
    if (
      value.QCTP_TRANSCRIPTION_PROVIDER === "openai" &&
      value.OPENAI_API_KEY === undefined
    ) {
      context.addIssue({
        code: "custom",
        path: ["OPENAI_API_KEY"],
        message: "Required when QCTP_TRANSCRIPTION_PROVIDER is openai",
      });
    }

    if (
      value.QCTP_TRANSCRIPTION_PROVIDER === "openai" &&
      !value.QCTP_ENABLE_PAID_CLOUD
    ) {
      context.addIssue({
        code: "custom",
        path: ["QCTP_ENABLE_PAID_CLOUD"],
        message: "Explicit paid-cloud opt-in is required for OpenAI",
      });
    }

    if (
      value.QCTP_TRANSCRIPTION_PROVIDER === "openai" &&
      value.QCTP_PAID_CLOUD_HARD_SPEND_LIMIT_USD <= 0
    ) {
      context.addIssue({
        code: "custom",
        path: ["QCTP_PAID_CLOUD_HARD_SPEND_LIMIT_USD"],
        message: "A positive hard spend limit is required for OpenAI",
      });
    }

    if (
      value.NODE_ENV === "production" &&
      value.QCTP_TRANSCRIPTION_PROVIDER === "mock"
    ) {
      context.addIssue({
        code: "custom",
        path: ["QCTP_TRANSCRIPTION_PROVIDER"],
        message: "Mock provider is disabled in production",
      });
    }
  });

export interface ServerConfig {
  readonly environment: "development" | "test" | "production";
  readonly port: number;
  readonly apiToken: string;
  readonly transcriptionProvider: "local" | "mock" | "openai";
  readonly localWhisperUrl: string;
  readonly localWhisperModel: string;
  readonly localWhisperHighAccuracyModel: string;
  readonly mirrorOllamaUrl: string;
  readonly mirrorModel: string;
  readonly mirrorJobStorePath: string;
  readonly mirrorPollIntervalMs: number;
  readonly paidCloudEnabled: boolean;
  readonly paidCloudHardSpendLimitUsd: number;
  readonly paidCloudMaximumUsdPerAudioMinute: number;
  readonly openAIApiKey?: string;
  readonly maxAudioBytes: number;
  readonly maxAudioDurationMs: number;
  readonly rateLimit: number;
  readonly rateWindowMs: number;
}

export class ServerConfigError extends Error {
  readonly fields: readonly string[];

  constructor(fields: readonly string[]) {
    super(`Invalid server configuration: ${fields.join(", ")}`);
    this.name = "ServerConfigError";
    this.fields = fields;
  }
}

export const loadServerConfig = (
  environment: NodeJS.ProcessEnv = process.env,
): ServerConfig => {
  const result = EnvironmentSchema.safeParse(environment);
  if (!result.success) {
    const fields = [
      ...new Set(
        result.error.issues.map((issue) =>
          issue.path.length === 0 ? "environment" : String(issue.path[0]),
        ),
      ),
    ].sort();
    throw new ServerConfigError(fields);
  }

  if (result.data.QCTP_TRANSCRIPTION_PROVIDER === "local") {
    try {
      parseLoopbackHttpUrl(result.data.QCTP_LOCAL_WHISPER_URL);
    } catch {
      throw new ServerConfigError(["QCTP_LOCAL_WHISPER_URL"]);
    }
  }

  try {
    parseLoopbackOllamaUrl(result.data.QCTP_MIRROR_OLLAMA_URL);
  } catch {
    throw new ServerConfigError(["QCTP_MIRROR_OLLAMA_URL"]);
  }

  const applicationDataDirectory =
    environment.LOCALAPPDATA?.trim() ||
    environment.XDG_DATA_HOME?.trim() ||
    join(homedir(), ".local", "share");

  return {
    environment: result.data.NODE_ENV,
    port: result.data.PORT,
    apiToken: result.data.QCTP_API_TOKEN,
    transcriptionProvider: result.data.QCTP_TRANSCRIPTION_PROVIDER,
    localWhisperUrl: result.data.QCTP_LOCAL_WHISPER_URL,
    localWhisperModel: result.data.QCTP_LOCAL_WHISPER_MODEL,
    localWhisperHighAccuracyModel:
      result.data.QCTP_LOCAL_WHISPER_HIGH_ACCURACY_MODEL,
    mirrorOllamaUrl: result.data.QCTP_MIRROR_OLLAMA_URL,
    mirrorModel: result.data.QCTP_MIRROR_MODEL,
    mirrorJobStorePath:
      result.data.QCTP_MIRROR_JOB_STORE_PATH ??
      join(applicationDataDirectory, "QCTP", "mirror-jobs.json"),
    mirrorPollIntervalMs: result.data.QCTP_MIRROR_POLL_INTERVAL_MS,
    paidCloudEnabled:
      result.data.QCTP_TRANSCRIPTION_PROVIDER === "openai" &&
      result.data.QCTP_ENABLE_PAID_CLOUD,
    paidCloudHardSpendLimitUsd:
      result.data.QCTP_PAID_CLOUD_HARD_SPEND_LIMIT_USD,
    paidCloudMaximumUsdPerAudioMinute:
      result.data.QCTP_PAID_CLOUD_MAX_USD_PER_AUDIO_MINUTE,
    ...(result.data.QCTP_TRANSCRIPTION_PROVIDER !== "openai" ||
    result.data.OPENAI_API_KEY === undefined
      ? {}
      : { openAIApiKey: result.data.OPENAI_API_KEY }),
    maxAudioBytes: result.data.QCTP_TRANSCRIPTION_MAX_BYTES,
    maxAudioDurationMs: result.data.QCTP_TRANSCRIPTION_MAX_DURATION_MS,
    rateLimit: result.data.QCTP_TRANSCRIPTION_RATE_LIMIT,
    rateWindowMs: result.data.QCTP_TRANSCRIPTION_RATE_WINDOW_MS,
  };
};
