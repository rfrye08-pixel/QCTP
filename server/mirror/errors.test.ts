// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  MirrorError,
  MirrorStoreError,
  normalizeMirrorError,
  publicError,
} from "./errors.js";

describe("Mirror errors", () => {
  it("preserves an already-safe Mirror error", () => {
    const safe = new MirrorError({
      code: "INVALID_REQUEST",
      message: "Safe message.",
      status: 400,
      field: "prompt",
    });
    expect(normalizeMirrorError(safe)).toBe(safe);
    expect(publicError(safe, "request-1")).toEqual({
      error: {
        code: "INVALID_REQUEST",
        message: "Safe message.",
        retryable: false,
        requestId: "request-1",
        field: "prompt",
      },
    });
  });

  it("normalizes store failures without exposing their cause", () => {
    const normalized = normalizeMirrorError(
      new MirrorStoreError("sensitive filesystem detail"),
    );
    expect(normalized).toMatchObject({
      code: "STORE_UNAVAILABLE",
      status: 503,
      retryable: true,
      message: "The local Mirror job store is unavailable.",
    });
    expect(publicError(normalized, "request-2").error).not.toHaveProperty(
      "field",
    );
  });

  it("normalizes unknown failures as a non-retryable internal error", () => {
    expect(normalizeMirrorError(new Error("private detail"))).toMatchObject({
      code: "INTERNAL_ERROR",
      status: 500,
      retryable: false,
      message: "The local Mirror service could not complete the request.",
    });
  });
});
