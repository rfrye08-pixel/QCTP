import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import type { Request, RequestHandler } from "express";

import { AppError } from "./errors.js";

export interface AuthPrincipal {
  readonly subject: string;
}

export type Authenticator = (
  request: Request,
) => AuthPrincipal | null | Promise<AuthPrincipal | null>;

export const QCTP_DEVICE_SESSION_COOKIE = "qctp_device_session";

export interface DeviceSessionAuthentication {
  /** Accepts either the operator pairing bearer or a valid HttpOnly session. */
  readonly authenticate: Authenticator;
  /** Accepts only the operator-provisioned pairing bearer. */
  readonly pairAuthenticator: Authenticator;
  issueCookie(request: Request): string;
  clearCookie(request: Request): string;
}

export interface DeviceSessionAuthenticationOptions {
  readonly lifetimeSeconds?: number;
  readonly now?: () => Date;
  readonly createNonce?: () => string;
}

interface RequestWithPrincipal extends Request {
  qctpPrincipal?: AuthPrincipal;
}

const digest = (value: string): Buffer =>
  createHash("sha256").update(value, "utf8").digest();

const authenticationError = (
  code: "AUTH_REQUIRED" | "AUTH_INVALID",
  message: string,
): AppError => new AppError({ code, message, status: 401 });

const cookieValue = (request: Request, name: string): string | null => {
  const serialized = request.header("cookie");
  if (!serialized) return null;
  for (const part of serialized.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 1) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
};

const usesSecureCookie = (request: Request): boolean => {
  const hostname = request.hostname.toLowerCase().replace(/\.$/u, "");
  return !(
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]"
  );
};

const serializeSessionCookie = (options: {
  readonly value: string;
  readonly maxAgeSeconds: number;
  readonly secure: boolean;
}): string =>
  [
    `${QCTP_DEVICE_SESSION_COOKIE}=${encodeURIComponent(options.value)}`,
    "Path=/api",
    "HttpOnly",
    "SameSite=Strict",
    `Max-Age=${String(options.maxAgeSeconds)}`,
    ...(options.secure ? ["Secure"] : []),
  ].join("; ");

export const createBearerTokenAuthenticator = (
  expectedToken: string,
  subject = "qctp-single-user",
): Authenticator => {
  if (expectedToken.length < 32) {
    throw new Error("Bearer token must contain at least 32 characters.");
  }
  const expectedDigest = digest(expectedToken);

  return (request) => {
    const authorization = request.header("authorization");
    if (authorization === undefined) {
      throw authenticationError(
        "AUTH_REQUIRED",
        "Bearer authentication is required.",
      );
    }

    const match = /^Bearer ([^\s]+)$/i.exec(authorization);
    if (
      match?.[1] === undefined ||
      !timingSafeEqual(digest(match[1]), expectedDigest)
    ) {
      throw authenticationError(
        "AUTH_INVALID",
        "Bearer authentication is invalid.",
      );
    }

    return { subject };
  };
};

/**
 * Exchanges the operator-provisioned bearer for an expiring, HttpOnly,
 * same-site device session. The bearer never needs to enter browser storage.
 * Rotating QCTP_API_TOKEN invalidates every outstanding session signature.
 */
export const createDeviceSessionAuthentication = (
  expectedToken: string,
  options: DeviceSessionAuthenticationOptions = {},
  subject = "qctp-single-user",
): DeviceSessionAuthentication => {
  const pairAuthenticator = createBearerTokenAuthenticator(
    expectedToken,
    subject,
  );
  const lifetimeSeconds = options.lifetimeSeconds ?? 7 * 24 * 60 * 60;
  if (
    !Number.isInteger(lifetimeSeconds) ||
    lifetimeSeconds < 60 ||
    lifetimeSeconds > 30 * 24 * 60 * 60
  ) {
    throw new Error(
      "Device session lifetime must be between one minute and 30 days.",
    );
  }
  const now = options.now ?? (() => new Date());
  const createNonce =
    options.createNonce ?? (() => randomBytes(18).toString("base64url"));
  const signingKey = createHmac("sha256", expectedToken)
    .update("qctp-device-session-signing-key-v1", "utf8")
    .digest();
  const signatureFor = (payload: string): Buffer =>
    createHmac("sha256", signingKey).update(payload, "utf8").digest();

  const sessionAuthenticator: Authenticator = (request) => {
    const serialized = cookieValue(request, QCTP_DEVICE_SESSION_COOKIE);
    if (!serialized) {
      throw authenticationError(
        "AUTH_REQUIRED",
        "A paired QCTP device session is required.",
      );
    }
    const parts = serialized.split(".");
    if (parts.length !== 4 || parts[0] !== "v1") {
      throw authenticationError(
        "AUTH_INVALID",
        "The QCTP device session is invalid.",
      );
    }
    const [version, expiresSerialized, nonce, signatureSerialized] = parts;
    const expiresAt = Number(expiresSerialized);
    if (
      version !== "v1" ||
      !Number.isSafeInteger(expiresAt) ||
      expiresAt <= Math.floor(now().getTime() / 1_000) ||
      !nonce ||
      !signatureSerialized
    ) {
      throw authenticationError(
        "AUTH_INVALID",
        "The QCTP device session is invalid or expired.",
      );
    }
    let receivedSignature: Buffer;
    try {
      receivedSignature = Buffer.from(signatureSerialized, "base64url");
    } catch {
      throw authenticationError(
        "AUTH_INVALID",
        "The QCTP device session is invalid.",
      );
    }
    const payload = `${version}.${expiresSerialized}.${nonce}`;
    const expectedSignature = signatureFor(payload);
    if (
      receivedSignature.length !== expectedSignature.length ||
      !timingSafeEqual(receivedSignature, expectedSignature)
    ) {
      throw authenticationError(
        "AUTH_INVALID",
        "The QCTP device session is invalid.",
      );
    }
    return { subject };
  };

  return {
    pairAuthenticator,
    authenticate(request) {
      return request.header("authorization")
        ? pairAuthenticator(request)
        : sessionAuthenticator(request);
    },
    issueCookie(request) {
      const expiresAt = Math.floor(now().getTime() / 1_000) + lifetimeSeconds;
      const payload = `v1.${String(expiresAt)}.${createNonce()}`;
      const value = `${payload}.${signatureFor(payload).toString("base64url")}`;
      return serializeSessionCookie({
        value,
        maxAgeSeconds: lifetimeSeconds,
        secure: usesSecureCookie(request),
      });
    },
    clearCookie(request) {
      return serializeSessionCookie({
        value: "",
        maxAgeSeconds: 0,
        secure: usesSecureCookie(request),
      });
    },
  };
};

export const createAuthenticationMiddleware =
  (authenticate: Authenticator): RequestHandler =>
  async (request, _response, next) => {
    try {
      const principal = await authenticate(request);
      if (principal === null) {
        throw new AppError({
          code: "AUTH_INVALID",
          message: "Bearer authentication is invalid.",
          status: 401,
        });
      }
      (request as RequestWithPrincipal).qctpPrincipal = principal;
      next();
    } catch (error: unknown) {
      next(error);
    }
  };

export const requirePrincipal = (request: Request): AuthPrincipal => {
  const principal = (request as RequestWithPrincipal).qctpPrincipal;
  if (principal === undefined) {
    throw new AppError({
      code: "AUTH_REQUIRED",
      message: "Bearer authentication is required.",
      status: 401,
    });
  }
  return principal;
};
