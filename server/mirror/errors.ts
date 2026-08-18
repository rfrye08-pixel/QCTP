import type { MirrorErrorCode, MirrorErrorResponse } from "./contracts.js";

export class MirrorError extends Error {
  readonly code: MirrorErrorCode;
  readonly status: number;
  readonly retryable: boolean;
  readonly field: string | undefined;

  constructor(options: {
    code: MirrorErrorCode;
    message: string;
    status: number;
    retryable?: boolean;
    field?: string;
    cause?: unknown;
  }) {
    super(options.message, { cause: options.cause });
    this.name = "MirrorError";
    this.code = options.code;
    this.status = options.status;
    this.retryable = options.retryable ?? false;
    this.field = options.field;
  }
}

export class MirrorProviderError extends Error {
  readonly code:
    | "LOCAL_MODEL_UNAVAILABLE"
    | "LOCAL_MODEL_REJECTED"
    | "LOCAL_MODEL_INVALID_RESULT";
  readonly retryable: boolean;

  constructor(options: {
    code:
      | "LOCAL_MODEL_UNAVAILABLE"
      | "LOCAL_MODEL_REJECTED"
      | "LOCAL_MODEL_INVALID_RESULT";
    message: string;
    retryable: boolean;
    cause?: unknown;
  }) {
    super(options.message, { cause: options.cause });
    this.name = "MirrorProviderError";
    this.code = options.code;
    this.retryable = options.retryable;
  }
}

export class MirrorStoreError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "MirrorStoreError";
  }
}

export const publicError = (
  error: MirrorError,
  requestId: string,
): MirrorErrorResponse => ({
  error: {
    code: error.code,
    message: error.message,
    retryable: error.retryable,
    requestId,
    ...(error.field === undefined ? {} : { field: error.field }),
  },
});

export const normalizeMirrorError = (error: unknown): MirrorError => {
  if (error instanceof MirrorError) {
    return error;
  }
  if (error instanceof MirrorStoreError) {
    return new MirrorError({
      code: "STORE_UNAVAILABLE",
      message: "The local Mirror job store is unavailable.",
      status: 503,
      retryable: true,
      cause: error,
    });
  }
  return new MirrorError({
    code: "INTERNAL_ERROR",
    message: "The local Mirror service could not complete the request.",
    status: 500,
    cause: error,
  });
};
