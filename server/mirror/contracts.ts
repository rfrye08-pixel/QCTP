import { z } from "zod";

const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/;

export const MirrorIdentifierSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(identifierPattern);

export const MirrorSourceSchema = z
  .object({
    recordId: MirrorIdentifierSchema,
    title: z.string().trim().min(1).max(240),
    kind: z.string().trim().min(1).max(80),
    excerpt: z.string().trim().min(1).max(4_000),
    recordUpdatedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const CreateMirrorJobRequestSchema = z
  .object({
    requestId: MirrorIdentifierSchema,
    prompt: z.string().trim().min(1).max(8_000),
    sources: z.array(MirrorSourceSchema).min(1).max(24),
  })
  .strict()
  .superRefine((value, context) => {
    const sourceIds = new Set<string>();
    let sourceCharacters = 0;
    for (const source of value.sources) {
      sourceCharacters += source.excerpt.length;
      if (sourceIds.has(source.recordId)) {
        context.addIssue({
          code: "custom",
          message: "Source record identifiers must be unique.",
          path: ["sources"],
        });
      }
      sourceIds.add(source.recordId);
    }
    if (sourceCharacters > 40_000) {
      context.addIssue({
        code: "custom",
        message: "The combined source excerpts are too large.",
        path: ["sources"],
      });
    }
  });

export const MirrorJobStatusSchema = z.enum([
  "queued",
  "processing",
  "retry_wait",
  "complete",
  "failed",
]);

export const MirrorPolicySchema = z
  .object({
    mode: z.literal("free-local"),
    provider: z.string().trim().min(1).max(200),
    model: z.string().trim().min(1).max(200),
    paidCloudEnabled: z.literal(false),
    recurringApiCostUsd: z.literal(0),
  })
  .strict();

export const MirrorCitationSchema = z
  .object({
    recordId: MirrorIdentifierSchema,
    title: z.string().min(1).max(240),
    excerpt: z.string().min(1).max(4_000),
  })
  .strict();

export const MirrorResultSchema = z
  .object({
    text: z.string().trim().min(1).max(50_000),
    model: z.string().trim().min(1).max(200),
    citations: z.array(MirrorCitationSchema).min(1).max(24),
    createdAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const PublicMirrorJobSchema = z
  .object({
    id: MirrorIdentifierSchema,
    requestId: MirrorIdentifierSchema,
    status: MirrorJobStatusSchema,
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
    attempts: z.number().int().nonnegative(),
    lastError: z.string().max(500).nullable(),
    result: MirrorResultSchema.nullable(),
  })
  .strict();

export const MirrorJobRecordSchema = PublicMirrorJobSchema.extend({
  prompt: z.string().min(1).max(8_000),
  sources: z.array(MirrorSourceSchema).min(1).max(24),
  requestFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  nextAttemptAt: z.string().datetime({ offset: true }).nullable(),
  leaseExpiresAt: z.string().datetime({ offset: true }).nullable(),
}).strict();

export const MirrorStoreDocumentSchema = z
  .object({
    version: z.literal(1),
    jobs: z.array(MirrorJobRecordSchema),
  })
  .strict();

export type MirrorSource = z.infer<typeof MirrorSourceSchema>;
export type CreateMirrorJobRequest = z.infer<
  typeof CreateMirrorJobRequestSchema
>;
export type MirrorJobStatus = z.infer<typeof MirrorJobStatusSchema>;
export type MirrorPolicy = z.infer<typeof MirrorPolicySchema>;
export type MirrorCitation = z.infer<typeof MirrorCitationSchema>;
export type MirrorResult = z.infer<typeof MirrorResultSchema>;
export type PublicMirrorJob = z.infer<typeof PublicMirrorJobSchema>;
export type MirrorJobRecord = z.infer<typeof MirrorJobRecordSchema>;
export type MirrorStoreDocument = z.infer<typeof MirrorStoreDocumentSchema>;

export type MirrorErrorCode =
  | "INVALID_REQUEST"
  | "REQUEST_ID_CONFLICT"
  | "JOB_NOT_FOUND"
  | "JOB_NOT_RETRYABLE"
  | "LOCAL_MODEL_UNAVAILABLE"
  | "LOCAL_MODEL_REJECTED"
  | "LOCAL_MODEL_INVALID_RESULT"
  | "STORE_UNAVAILABLE"
  | "INTERNAL_ERROR";

export interface MirrorErrorResponse {
  readonly error: {
    readonly code: MirrorErrorCode;
    readonly message: string;
    readonly retryable: boolean;
    readonly requestId: string;
    readonly field?: string;
  };
}
