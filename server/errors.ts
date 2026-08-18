import type { ApiErrorCode, ApiErrorResponse } from "./contracts.js";

export type SafeErrorDetail = string | number | boolean;

export const safeProviderRequestId = (value: unknown): string | undefined =>
  typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)
    ? value
    : undefined;

export class AppError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly retryable: boolean;
  readonly details: Readonly<Record<string, SafeErrorDetail>> | undefined;

  constructor(options: {
    code: ApiErrorCode;
    message: string;
    status: number;
    retryable?: boolean;
    details?: Readonly<Record<string, SafeErrorDetail>>;
    cause?: unknown;
  }) {
    super(options.message, { cause: options.cause });
    this.name = "AppError";
    this.code = options.code;
    this.status = options.status;
    this.retryable = options.retryable ?? false;
    this.details = options.details;
  }
}

export class ProviderError extends Error {
  readonly kind:
    "rate_limited" | "unavailable" | "rejected" | "budget_exceeded";
  readonly retryable: boolean;
  readonly providerStatus: number | undefined;
  readonly providerRequestId: string | undefined;

  constructor(options: {
    kind: "rate_limited" | "unavailable" | "rejected" | "budget_exceeded";
    retryable: boolean;
    providerStatus?: number;
    providerRequestId?: string;
    cause?: unknown;
  }) {
    super("The transcription provider could not complete the request.", {
      cause: options.cause,
    });
    this.name = "ProviderError";
    this.kind = options.kind;
    this.retryable = options.retryable;
    this.providerStatus = options.providerStatus;
    this.providerRequestId = options.providerRequestId;
  }
}

export const providerErrorToAppError = (error: ProviderError): AppError => {
  const safeDetails: Record<string, SafeErrorDetail> = {};
  if (error.providerStatus !== undefined) {
    safeDetails.providerStatus = error.providerStatus;
  }
  if (error.providerRequestId !== undefined) {
    safeDetails.providerRequestId = error.providerRequestId;
  }

  if (error.kind === "rate_limited") {
    return new AppError({
      code: "PROVIDER_RATE_LIMITED",
      message: "The transcription service is temporarily rate limited.",
      status: 503,
      retryable: true,
      details: safeDetails,
      cause: error,
    });
  }

  if (error.kind === "unavailable") {
    return new AppError({
      code: "PROVIDER_UNAVAILABLE",
      message: "The transcription service is temporarily unavailable.",
      status: 503,
      retryable: true,
      details: safeDetails,
      cause: error,
    });
  }

  if (error.kind === "budget_exceeded") {
    return new AppError({
      code: "PAID_CLOUD_BUDGET_EXCEEDED",
      message: "The paid-cloud transcription limit has been reached.",
      status: 402,
      retryable: false,
      details: safeDetails,
      cause: error,
    });
  }

  return new AppError({
    code: "PROVIDER_REJECTED",
    message: "The transcription service rejected the audio request.",
    status: 502,
    retryable: false,
    details: safeDetails,
    cause: error,
  });
};

export const toErrorResponse = (
  error: AppError,
  requestId: string,
): ApiErrorResponse => ({
  error: {
    code: error.code,
    message: error.message,
    retryable: error.retryable,
    requestId,
    ...(error.details === undefined ? {} : { details: { ...error.details } }),
  },
});
