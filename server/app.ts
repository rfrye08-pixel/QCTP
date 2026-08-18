import { randomUUID } from "node:crypto";

import express from "express";
import type { ErrorRequestHandler, Express, Request, Response } from "express";
import multer, { MulterError } from "multer";

import {
  createAuthenticationMiddleware,
  requirePrincipal,
  type Authenticator,
  type DeviceSessionAuthentication,
} from "./auth.js";
import {
  DeleteRemoteObjectParamsSchema,
  DeleteRemoteObjectResponseSchema,
  TranscriptionRequestFieldsSchema,
  TranscriptionResponseSchema,
  type TranscriptionResponse,
  type TranscriptionServicePolicy,
} from "./contracts.js";
import {
  AppError,
  ProviderError,
  providerErrorToAppError,
  toErrorResponse,
} from "./errors.js";
import {
  MemoryIdempotencyStore,
  type CachedHttpResponse,
  type IdempotencyStore,
} from "./idempotency.js";
import {
  ValidatingMediaProbe,
  type MediaProbe,
  type UploadedAudio,
} from "./media.js";
import type { TranscriptionProvider } from "./providers/types.js";
import {
  allowAllRateLimiter,
  createPreAuthenticationRateLimitMiddleware,
  createRateLimitMiddleware,
  type RateLimiter,
} from "./rate-limit.js";
import {
  NoRemoteObjectStore,
  type RemoteObjectStore,
} from "./remote-objects.js";
import type { PaidCloudSpendLimit } from "./spend-limit.js";

interface RequestWithFile extends Request {
  file?: Express.Multer.File;
}

interface RequestWithId extends Request {
  qctpRequestId?: string;
}

export interface TranscriptionServerLimits {
  readonly maxAudioBytes: number;
  readonly maxAudioDurationMs: number;
}

export interface CreateTranscriptionAppOptions {
  readonly authenticate: Authenticator;
  readonly deviceSession?: DeviceSessionAuthentication;
  readonly pairingRateLimiters?: {
    readonly client: RateLimiter;
    readonly global: RateLimiter;
  };
  readonly provider: TranscriptionProvider;
  readonly rateLimiter?: RateLimiter;
  readonly idempotencyStore?: IdempotencyStore;
  readonly mediaProbe?: MediaProbe;
  readonly remoteObjectStore?: RemoteObjectStore;
  readonly limits?: Partial<TranscriptionServerLimits>;
  readonly now?: () => Date;
  readonly createId?: () => string;
  readonly policy?: TranscriptionServicePolicy;
  readonly paidCloudSpendLimit?: PaidCloudSpendLimit;
}

const defaultLimits: TranscriptionServerLimits = {
  maxAudioBytes: 25 * 1_024 * 1_024,
  maxAudioDurationMs: 20 * 60 * 1_000,
};

const requestIdFor = (request: Request): string =>
  (request as RequestWithId).qctpRequestId ?? randomUUID();

const parseMultipart = (
  upload: ReturnType<typeof multer>["single"] extends (
    fieldName: string,
  ) => infer Handler
    ? Handler
    : never,
  request: Request,
  response: Response,
): Promise<void> =>
  new Promise((resolve, reject) => {
    upload(request, response, (error: unknown) => {
      if (error === undefined) {
        resolve();
        return;
      }
      reject(
        error instanceof Error
          ? error
          : new Error("Multipart parsing failed.", { cause: error }),
      );
    });
  });

const parseRequestFields = (request: Request) => {
  const result = TranscriptionRequestFieldsSchema.safeParse(
    request.body as unknown,
  );
  if (!result.success) {
    const firstIssue = result.error.issues[0];
    throw new AppError({
      code: "INVALID_REQUEST",
      message: "The transcription request fields are invalid.",
      status: 400,
      details: {
        field:
          firstIssue?.path.length === 0
            ? "request"
            : String(firstIssue?.path[0] ?? "request"),
      },
    });
  }
  return result.data;
};

const requireIdempotencyKey = (request: Request): string => {
  const key = request.header("idempotency-key")?.trim();
  if (key === undefined || key.length === 0) {
    throw new AppError({
      code: "IDEMPOTENCY_KEY_REQUIRED",
      message: "An Idempotency-Key header is required.",
      status: 400,
    });
  }
  if (key.length > 200 || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(key)) {
    throw new AppError({
      code: "INVALID_REQUEST",
      message: "The Idempotency-Key header is invalid.",
      status: 400,
      details: { field: "Idempotency-Key" },
    });
  }
  return key;
};

const multerErrorToAppError = (error: MulterError): AppError => {
  if (error.code === "LIMIT_FILE_SIZE") {
    return new AppError({
      code: "AUDIO_SIZE_LIMIT",
      message: "The audio file exceeds the upload size limit.",
      status: 413,
      cause: error,
    });
  }

  return new AppError({
    code: "INVALID_REQUEST",
    message: "The multipart upload is invalid.",
    status: 400,
    details: { uploadCode: error.code },
    cause: error,
  });
};

export const createTranscriptionApp = (
  options: CreateTranscriptionAppOptions,
): Express => {
  const limits: TranscriptionServerLimits = {
    ...defaultLimits,
    ...options.limits,
  };
  const rateLimiter = options.rateLimiter ?? allowAllRateLimiter;
  const idempotencyStore =
    options.idempotencyStore ?? new MemoryIdempotencyStore();
  const mediaProbe =
    options.mediaProbe ??
    new ValidatingMediaProbe({
      maxBytes: limits.maxAudioBytes,
      maxDurationMs: limits.maxAudioDurationMs,
    });
  const remoteObjectStore =
    options.remoteObjectStore ?? new NoRemoteObjectStore();
  const now = options.now ?? (() => new Date());
  const createId = options.createId ?? randomUUID;
  const multipart = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: limits.maxAudioBytes,
      files: 1,
      fields: 4,
      parts: 5,
      fieldNameSize: 64,
      fieldSize: 4_096,
    },
  }).single("audio");

  const app = express();
  app.disable("x-powered-by");
  app.use((request, response, next) => {
    const requestId = createId();
    (request as RequestWithId).qctpRequestId = requestId;
    response.setHeader("X-Request-Id", requestId);
    if (request.path.startsWith("/api/")) {
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("Pragma", "no-cache");
    }
    next();
  });

  app.get("/health", (_request, response) => {
    response.status(200).json({
      status: "ok",
      transcriptionMode: options.policy?.mode ?? "test-mock",
    });
  });

  const deviceSession = options.deviceSession;
  if (deviceSession) {
    const pairingRateLimiters = options.pairingRateLimiters ?? {
      client: allowAllRateLimiter,
      global: allowAllRateLimiter,
    };
    app.post(
      "/api/device-session",
      createPreAuthenticationRateLimitMiddleware({
        clientLimiter: pairingRateLimiters.client,
        globalLimiter: pairingRateLimiters.global,
      }),
      createAuthenticationMiddleware(deviceSession.pairAuthenticator),
      (request, response) => {
        response.setHeader("Set-Cookie", deviceSession.issueCookie(request));
        response.status(204).end();
      },
    );
    app.delete("/api/device-session", (request, response) => {
      response.setHeader("Set-Cookie", deviceSession.clearCookie(request));
      response.status(204).end();
    });
  }

  const rateLimitMiddleware = createRateLimitMiddleware(rateLimiter);
  app.use(
    "/api/transcriptions",
    createAuthenticationMiddleware(options.authenticate),
  );

  app.get("/api/transcriptions/policy", (_request, response) => {
    const policy: TranscriptionServicePolicy = options.policy ?? {
      mode: "test-mock",
      provider: options.provider.name,
      paidCloudEnabled: false,
      hardSpendLimitUsd: 0,
    };
    const spend = options.paidCloudSpendLimit?.snapshot();
    response.status(200).json({
      ...policy,
      ...(spend === undefined ? {} : { spend }),
    });
  });

  app.post(
    "/api/transcriptions",
    rateLimitMiddleware,
    async (request, response, next) => {
      try {
        const principal = requirePrincipal(request);
        const idempotencyKey = requireIdempotencyKey(request);
        const execution = await idempotencyStore.execute(
          `${principal.subject}:transcription`,
          idempotencyKey,
          async (): Promise<CachedHttpResponse> => {
            await parseMultipart(multipart, request, response);
            const fields = parseRequestFields(request);
            const uploaded = (request as RequestWithFile).file;
            if (uploaded === undefined) {
              throw new AppError({
                code: "AUDIO_REQUIRED",
                message: "An audio file is required.",
                status: 400,
              });
            }

            const audio: UploadedAudio = {
              buffer: uploaded.buffer,
              mimetype: uploaded.mimetype,
              size: uploaded.size,
            };
            const media = await mediaProbe.probe(audio);
            const model = options.provider.modelForAccuracy(fields.accuracy);
            const providerResult = await options.provider.transcribe({
              audio: uploaded.buffer,
              filename: `${fields.recordingId}.${media.extension}`,
              mimeType: media.detectedMimeType,
              durationMs: media.durationMs,
              model,
              ...(fields.language === undefined
                ? {}
                : { language: fields.language }),
              ...(fields.prompt === undefined ? {} : { prompt: fields.prompt }),
            });

            if (providerResult.text.trim().length === 0) {
              throw new ProviderError({
                kind: "rejected",
                retryable: false,
              });
            }

            const body: TranscriptionResponse =
              TranscriptionResponseSchema.parse({
                recordingId: fields.recordingId,
                transcriptId: createId(),
                status: "TRANSCRIBED",
                originalText: providerResult.text,
                provider: options.provider.name,
                model,
                ...(providerResult.language === undefined
                  ? fields.language === undefined
                    ? {}
                    : { language: fields.language }
                  : { language: providerResult.language }),
                durationMs: media.durationMs,
                detectedMimeType: media.detectedMimeType,
                acceptedAt: now().toISOString(),
              });
            return { status: 201, body };
          },
        );

        response.setHeader(
          "Idempotency-Replayed",
          execution.replayed ? "true" : "false",
        );
        response
          .status(execution.response.status)
          .json(execution.response.body);
      } catch (error: unknown) {
        next(error);
      }
    },
  );

  app.delete(
    "/api/transcriptions/:recordingId",
    rateLimitMiddleware,
    async (request, response, next) => {
      try {
        const parsed = DeleteRemoteObjectParamsSchema.safeParse(request.params);
        if (!parsed.success) {
          throw new AppError({
            code: "INVALID_REQUEST",
            message: "The recording identifier is invalid.",
            status: 400,
            details: { field: "recordingId" },
          });
        }
        const principal = requirePrincipal(request);
        let status;
        try {
          status = await remoteObjectStore.deleteForRecording(
            parsed.data.recordingId,
            principal.subject,
          );
        } catch (error: unknown) {
          throw new AppError({
            code: "REMOTE_DELETE_FAILED",
            message: "The remote audio object could not be deleted.",
            status: 503,
            retryable: true,
            cause: error,
          });
        }
        const body = DeleteRemoteObjectResponseSchema.parse({
          recordingId: parsed.data.recordingId,
          remoteObject: status,
        });
        response.status(200).json(body);
      } catch (error: unknown) {
        next(error);
      }
    },
  );

  const errorHandler: ErrorRequestHandler = (
    error: unknown,
    request,
    response,
    next,
  ) => {
    if (response.headersSent) {
      next(error);
      return;
    }

    let appError: AppError;
    if (error instanceof AppError) {
      appError = error;
    } else if (error instanceof ProviderError) {
      appError = providerErrorToAppError(error);
    } else if (error instanceof MulterError) {
      appError = multerErrorToAppError(error);
    } else {
      appError = new AppError({
        code: "INTERNAL_ERROR",
        message: "The server could not complete the request.",
        status: 500,
        retryable: false,
        cause: error,
      });
    }

    if (appError.status === 401) {
      response.setHeader("WWW-Authenticate", "Bearer");
    }
    response
      .status(appError.status)
      .json(toErrorResponse(appError, requestIdFor(request)));
  };
  app.use(errorHandler);

  return app;
};
