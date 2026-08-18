import { z } from "zod";

export const TranscriptionAccuracySchema = z.enum(["default", "high"]);
export type TranscriptionAccuracy = z.infer<typeof TranscriptionAccuracySchema>;

export const TranscriptionModelSchema = z.enum([
  "gpt-4o-mini-transcribe",
  "gpt-4o-transcribe",
]);
export type TranscriptionModel = z.infer<typeof TranscriptionModelSchema>;

export const TranscriptionRequestFieldsSchema = z
  .object({
    recordingId: z
      .string()
      .trim()
      .min(1)
      .max(128)
      .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/, "Invalid recording identifier"),
    accuracy: TranscriptionAccuracySchema.default("default"),
    language: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z]{2}$/, "Language must be an ISO-639-1 code")
      .optional(),
    prompt: z.string().trim().min(1).max(1_000).optional(),
  })
  .strict();
export type TranscriptionRequestFields = z.infer<
  typeof TranscriptionRequestFieldsSchema
>;

export const IdempotencyKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/);

export const TranscriptionResponseSchema = z
  .object({
    recordingId: z.string().min(1),
    transcriptId: z.string().uuid(),
    status: z.literal("TRANSCRIBED"),
    originalText: z.string(),
    provider: z.string().min(1),
    model: z.string().trim().min(1).max(128),
    language: z.string().optional(),
    durationMs: z.number().int().positive(),
    detectedMimeType: z.string().min(1),
    acceptedAt: z.string().datetime(),
  })
  .strict();
export type TranscriptionResponse = z.infer<typeof TranscriptionResponseSchema>;

export const ApiErrorCodeSchema = z.enum([
  "AUTH_REQUIRED",
  "AUTH_INVALID",
  "RATE_LIMITED",
  "IDEMPOTENCY_KEY_REQUIRED",
  "INVALID_REQUEST",
  "AUDIO_REQUIRED",
  "AUDIO_SIZE_LIMIT",
  "AUDIO_TYPE_UNSUPPORTED",
  "AUDIO_SIGNATURE_MISMATCH",
  "AUDIO_METADATA_INVALID",
  "AUDIO_DURATION_LIMIT",
  "PROVIDER_RATE_LIMITED",
  "PROVIDER_UNAVAILABLE",
  "PROVIDER_REJECTED",
  "PAID_CLOUD_BUDGET_EXCEEDED",
  "REMOTE_DELETE_FAILED",
  "INTERNAL_ERROR",
]);
export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;

export const ApiErrorResponseSchema = z
  .object({
    error: z
      .object({
        code: ApiErrorCodeSchema,
        message: z.string().min(1),
        retryable: z.boolean(),
        requestId: z.string().uuid(),
        details: z
          .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
          .optional(),
      })
      .strict(),
  })
  .strict();
export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;

export const DeleteRemoteObjectParamsSchema = z
  .object({
    recordingId: TranscriptionRequestFieldsSchema.shape.recordingId,
  })
  .strict();

export const RemoteObjectDeletionStatusSchema = z.enum([
  "deleted",
  "not_found",
  "not_configured",
]);
export type RemoteObjectDeletionStatus = z.infer<
  typeof RemoteObjectDeletionStatusSchema
>;

export const DeleteRemoteObjectResponseSchema = z
  .object({
    recordingId: z.string().min(1),
    remoteObject: RemoteObjectDeletionStatusSchema,
  })
  .strict();
export type DeleteRemoteObjectResponse = z.infer<
  typeof DeleteRemoteObjectResponseSchema
>;

export const TranscriptionServicePolicySchema = z
  .object({
    mode: z.enum(["free-local", "paid-cloud", "test-mock"]),
    provider: z.string().min(1),
    paidCloudEnabled: z.boolean(),
    hardSpendLimitUsd: z.number().nonnegative(),
    billingWarning: z.string().min(1).optional(),
    spend: z
      .object({
        hardLimitUsd: z.number().positive(),
        committedUsd: z.number().nonnegative(),
        reservedUsd: z.number().nonnegative(),
        remainingUsd: z.number().nonnegative(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type TranscriptionServicePolicy = z.infer<
  typeof TranscriptionServicePolicySchema
>;

export const openAIModelForAccuracy = (
  accuracy: TranscriptionAccuracy,
): TranscriptionModel =>
  accuracy === "high" ? "gpt-4o-transcribe" : "gpt-4o-mini-transcribe";
