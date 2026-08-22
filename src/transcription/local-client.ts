import { z } from "zod";

import type { QctpRepository } from "../data";
import { TranscriptSchema, type Transcript } from "../domain";

const PolicySchema = z.object({
  mode: z.enum(["free-local", "paid-cloud", "test-mock"]),
  provider: z.string().min(1),
  paidCloudEnabled: z.boolean(),
  hardSpendLimitUsd: z.number().nonnegative(),
});

const ResponseSchema = z.object({
  recordingId: z.string().min(1),
  transcriptId: z.string().uuid(),
  status: z.literal("TRANSCRIBED"),
  originalText: z.string(),
  provider: z.string().min(1),
  model: z.string().min(1),
  language: z.string().optional(),
  durationMs: z.number().int().positive(),
  detectedMimeType: z.string().min(1),
  acceptedAt: z.string().datetime(),
});

const ErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    retryable: z.boolean(),
    requestId: z.string(),
  }),
});

const DeleteResponseSchema = z.object({
  recordingId: z.string().min(1),
  remoteObject: z.enum(["deleted", "not_found", "not_configured"]),
});

const PROCESSING_LEASE_MS = 30 * 60_000;

export type LocalTranscriptionPolicy = z.infer<typeof PolicySchema>;

export class LocalTranscriptionError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "LocalTranscriptionError";
  }
}

export interface LocalTranscriptionClientOptions {
  accessToken?: string;
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
}

function endpoint(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, "")}${path}`;
}

function validateGatewayBaseUrl(value: string): string {
  if (!value) return "";
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("The PX13 gateway URL is invalid.");
  }
  const loopback = ["127.0.0.1", "localhost", "[::1]", "::1"].includes(
    parsed.hostname.toLocaleLowerCase(),
  );
  if (
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    (parsed.pathname !== "/" && parsed.pathname !== "") ||
    (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && loopback))
  ) {
    throw new Error(
      "Remote PX13 connections require HTTPS on an origin; only exact loopback may use HTTP.",
    );
  }
  return parsed.origin;
}

export async function pairLocalGatewaySession(
  accessToken: string,
  baseUrl = "",
  fetchImplementation: typeof globalThis.fetch = globalThis.fetch.bind(
    globalThis,
  ),
): Promise<void> {
  if (!/^[A-Fa-f0-9]{64}$/u.test(accessToken.trim())) {
    throw new Error(
      "The local gateway pairing token must be exactly 64 hexadecimal characters.",
    );
  }
  const response = await fetchImplementation(
    endpoint(validateGatewayBaseUrl(baseUrl), "/api/device-session"),
    {
      method: "POST",
      redirect: "error",
      credentials: "include",
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
  if (!response.ok) {
    throw new LocalTranscriptionError(
      "The PX13 rejected device pairing. Check the private origin and local pairing token.",
      "DEVICE_PAIRING_FAILED",
      response.status === 408 ||
        response.status === 429 ||
        response.status >= 500,
    );
  }
}

export async function clearLocalGatewaySession(
  baseUrl = "",
  fetchImplementation: typeof globalThis.fetch = globalThis.fetch.bind(
    globalThis,
  ),
): Promise<void> {
  const response = await fetchImplementation(
    endpoint(validateGatewayBaseUrl(baseUrl), "/api/device-session"),
    {
      method: "DELETE",
      redirect: "error",
      credentials: "include",
    },
  );
  if (!response.ok) {
    throw new LocalTranscriptionError(
      "The local device session could not be cleared.",
      "DEVICE_DISCONNECT_FAILED",
      response.status === 408 ||
        response.status === 429 ||
        response.status >= 500,
    );
  }
}

function filenameForMimeType(mimeType: string): string {
  if (mimeType.includes("mp4")) return "qctp-recording.m4a";
  if (mimeType.includes("ogg")) return "qctp-recording.ogg";
  if (mimeType.includes("wav")) return "qctp-recording.wav";
  return "qctp-recording.webm";
}

async function responseJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export class LocalTranscriptionClient {
  private readonly baseUrl: string;
  private readonly request: typeof globalThis.fetch;

  constructor(private readonly options: LocalTranscriptionClientOptions) {
    if (
      options.accessToken !== undefined &&
      options.accessToken.trim().length < 32
    ) {
      throw new Error(
        "The local transcription service token must contain at least 32 characters.",
      );
    }
    this.baseUrl = validateGatewayBaseUrl(options.baseUrl ?? "");
    this.request = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async getPolicy(): Promise<LocalTranscriptionPolicy> {
    const response = await this.request(
      endpoint(this.baseUrl, "/api/transcriptions/policy"),
      {
        redirect: "error",
        credentials: "include",
        headers: this.headers(),
      },
    );
    const json = await responseJson(response);
    if (!response.ok) throw this.toError(json, response.status);
    return PolicySchema.parse(json);
  }

  async transcribeRecording(
    repository: QctpRepository,
    recordingId: string,
    accuracy: "default" | "high" = "default",
  ): Promise<Transcript> {
    const policy = await this.getPolicy();
    if (policy.mode !== "free-local" || policy.paidCloudEnabled) {
      throw new LocalTranscriptionError(
        "Free Local Mode refused a transcription service that is not confirmed local-only.",
        "NON_LOCAL_POLICY",
        false,
      );
    }
    const recording = await repository.getRecording(recordingId);
    if (!recording?.acceptedAt) {
      throw new LocalTranscriptionError(
        "The recording must be explicitly accepted before transcription.",
        "NOT_ACCEPTED",
        false,
      );
    }
    const audio = await repository.assembleRecordingBlob(recordingId);
    const uploadAudio = new File(
      [await audio.arrayBuffer()],
      filenameForMimeType(recording.mimeType),
      { type: recording.mimeType },
    );
    const form = new FormData();
    form.set("audio", uploadAudio);
    form.set("recordingId", recording.id);
    form.set("accuracy", accuracy);
    const response = await this.request(
      endpoint(this.baseUrl, "/api/transcriptions"),
      {
        method: "POST",
        redirect: "error",
        credentials: "include",
        headers: this.headers({
          "Idempotency-Key": `qctp-${recording.id}-${String(recording.sizeBytes)}-${String(recording.durationMs)}`,
        }),
        body: form,
      },
    );
    const json = await responseJson(response);
    if (!response.ok) throw this.toError(json, response.status);
    const result = ResponseSchema.parse(json);
    if (result.recordingId !== recording.id) {
      throw new LocalTranscriptionError(
        "The service returned a mismatched recording identifier.",
        "RESPONSE_MISMATCH",
        false,
      );
    }
    const transcript = TranscriptSchema.parse({
      schemaVersion: 1,
      id: result.transcriptId,
      recordingId: result.recordingId,
      provider: result.provider,
      model: result.model,
      language: result.language ?? "und",
      originalText: result.originalText,
      correctedText: null,
      corrections: [],
      timestamps: [],
      confidenceMetadata: {
        durationMs: result.durationMs,
        detectedMimeType: result.detectedMimeType,
      },
      createdAt: result.acceptedAt,
      correctedAt: null,
    });
    return repository.saveTranscript(transcript);
  }

  async deleteRemoteRecording(
    recordingId: string,
  ): Promise<"deleted" | "not_found" | "not_configured"> {
    const response = await this.request(
      endpoint(
        this.baseUrl,
        `/api/transcriptions/${encodeURIComponent(recordingId)}`,
      ),
      {
        method: "DELETE",
        redirect: "error",
        credentials: "include",
        headers: this.headers(),
      },
    );
    const json = await responseJson(response);
    if (!response.ok) throw this.toError(json, response.status);
    const result = DeleteResponseSchema.parse(json);
    if (result.recordingId !== recordingId) {
      throw new LocalTranscriptionError(
        "The service returned a mismatched recording identifier.",
        "RESPONSE_MISMATCH",
        false,
      );
    }
    return result.remoteObject;
  }

  async processQueue(
    repository: QctpRepository,
  ): Promise<{ completed: string[]; failed: string[] }> {
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      return { completed: [], failed: [] };
    }
    const now = new Date();
    const queued = (await repository.listTranscriptionQueue()).filter(
      (item) =>
        item.status === "QUEUED" ||
        (item.status === "RETRY_WAIT" &&
          (!item.nextAttemptAt || new Date(item.nextAttemptAt) <= now)) ||
        (item.status === "PROCESSING" &&
          Date.parse(item.updatedAt) <= now.getTime() - PROCESSING_LEASE_MS),
    );
    const completed: string[] = [];
    const failed: string[] = [];
    for (const item of queued) {
      const attempts = item.attempts + 1;
      await repository.updateTranscriptionQueueItem(item.recordingId, {
        status: "PROCESSING",
        attempts,
        nextAttemptAt: null,
        lastError: null,
      });
      await repository.updateRecordingStatus(item.recordingId, "TRANSCRIBING");
      try {
        await this.transcribeRecording(repository, item.recordingId);
        completed.push(item.recordingId);
      } catch (error) {
        const retryable =
          error instanceof LocalTranscriptionError ? error.retryable : true;
        const message =
          error instanceof Error
            ? error.message
            : "Local transcription failed.";
        const shouldRetry = retryable && attempts < 5;
        const nextAttemptAt = shouldRetry
          ? new Date(Date.now() + 30_000 * 2 ** (attempts - 1)).toISOString()
          : null;
        await repository.updateTranscriptionQueueItem(item.recordingId, {
          status: shouldRetry ? "RETRY_WAIT" : "FAILED",
          attempts,
          nextAttemptAt,
          lastError: message,
        });
        await repository.updateRecordingStatus(
          item.recordingId,
          "TRANSCRIPTION_FAILED",
          {
            failureCode:
              error instanceof LocalTranscriptionError
                ? error.code
                : "LOCAL_SERVICE_UNAVAILABLE",
            failureMessage: message,
          },
        );
        failed.push(item.recordingId);
      }
    }
    return { completed, failed };
  }

  private toError(value: unknown, status: number): LocalTranscriptionError {
    const parsed = ErrorSchema.safeParse(value);
    if (parsed.success) {
      return new LocalTranscriptionError(
        parsed.data.error.message,
        parsed.data.error.code,
        parsed.data.error.retryable,
      );
    }
    return new LocalTranscriptionError(
      `The local transcription service returned HTTP ${String(status)}.`,
      "LOCAL_SERVICE_ERROR",
      status === 429 || status >= 500,
    );
  }

  private headers(
    additional: Record<string, string> = {},
  ): Record<string, string> {
    return {
      ...(this.options.accessToken
        ? { Authorization: `Bearer ${this.options.accessToken}` }
        : {}),
      ...additional,
    };
  }
}
