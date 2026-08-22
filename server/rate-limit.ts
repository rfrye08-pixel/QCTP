import type { RequestHandler } from "express";

import { requirePrincipal } from "./auth.js";
import { AppError } from "./errors.js";

export interface RateLimitDecision {
  readonly allowed: boolean;
  readonly limit: number;
  readonly remaining: number;
  readonly retryAfterSeconds: number;
}

export interface RateLimiter {
  consume(key: string): RateLimitDecision | Promise<RateLimitDecision>;
}

interface RateWindow {
  count: number;
  resetAt: number;
}

export class MemoryFixedWindowRateLimiter implements RateLimiter {
  readonly #limit: number;
  readonly #windowMs: number;
  readonly #now: () => number;
  readonly #windows = new Map<string, RateWindow>();

  constructor(options: {
    limit: number;
    windowMs: number;
    now?: () => number;
  }) {
    if (!Number.isInteger(options.limit) || options.limit < 1) {
      throw new Error("Rate limit must be a positive integer.");
    }
    if (!Number.isInteger(options.windowMs) || options.windowMs < 1) {
      throw new Error("Rate window must be a positive integer.");
    }
    this.#limit = options.limit;
    this.#windowMs = options.windowMs;
    this.#now = options.now ?? Date.now;
  }

  consume(key: string): RateLimitDecision {
    const now = this.#now();
    const current = this.#windows.get(key);
    const window =
      current === undefined || current.resetAt <= now
        ? { count: 0, resetAt: now + this.#windowMs }
        : current;

    if (window.count >= this.#limit) {
      return {
        allowed: false,
        limit: this.#limit,
        remaining: 0,
        retryAfterSeconds: Math.max(
          1,
          Math.ceil((window.resetAt - now) / 1_000),
        ),
      };
    }

    window.count += 1;
    this.#windows.set(key, window);
    return {
      allowed: true,
      limit: this.#limit,
      remaining: Math.max(0, this.#limit - window.count),
      retryAfterSeconds: Math.max(1, Math.ceil((window.resetAt - now) / 1_000)),
    };
  }
}

export const createRateLimitMiddleware =
  (limiter: RateLimiter): RequestHandler =>
  async (request, response, next) => {
    try {
      const principal = requirePrincipal(request);
      const decision = await limiter.consume(principal.subject);
      response.setHeader("RateLimit-Limit", String(decision.limit));
      response.setHeader("RateLimit-Remaining", String(decision.remaining));

      if (!decision.allowed) {
        response.setHeader("Retry-After", String(decision.retryAfterSeconds));
        throw new AppError({
          code: "RATE_LIMITED",
          message: "Too many requests.",
          status: 429,
          retryable: true,
          details: { retryAfterSeconds: decision.retryAfterSeconds },
        });
      }

      next();
    } catch (error: unknown) {
      next(error);
    }
  };

export const createPreAuthenticationRateLimitMiddleware =
  (options: {
    readonly clientLimiter: RateLimiter;
    readonly globalLimiter: RateLimiter;
  }): RequestHandler =>
  async (request, response, next) => {
    try {
      const clientKey =
        request.ip || request.socket.remoteAddress || "unknown-client";
      const [client, global] = await Promise.all([
        options.clientLimiter.consume(`pairing-client:${clientKey}`),
        options.globalLimiter.consume("pairing-global"),
      ]);
      response.setHeader(
        "RateLimit-Limit",
        String(Math.min(client.limit, global.limit)),
      );
      response.setHeader(
        "RateLimit-Remaining",
        String(Math.min(client.remaining, global.remaining)),
      );
      if (!client.allowed || !global.allowed) {
        const retryAfterSeconds = Math.max(
          client.retryAfterSeconds,
          global.retryAfterSeconds,
        );
        response.setHeader("Retry-After", String(retryAfterSeconds));
        throw new AppError({
          code: "RATE_LIMITED",
          message: "Too many device-pairing attempts.",
          status: 429,
          retryable: true,
          details: { retryAfterSeconds },
        });
      }
      next();
    } catch (error: unknown) {
      next(error);
    }
  };

export const allowAllRateLimiter: RateLimiter = {
  consume: () => ({
    allowed: true,
    limit: Number.MAX_SAFE_INTEGER,
    remaining: Number.MAX_SAFE_INTEGER,
    retryAfterSeconds: 0,
  }),
};
