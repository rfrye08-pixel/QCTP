import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import express from "express";
import type { ErrorRequestHandler, Express } from "express";

import { createTranscriptionApp } from "./app.js";
import {
  createAuthenticationMiddleware,
  createDeviceSessionAuthentication,
} from "./auth.js";
import { loadServerConfig, type ServerConfig } from "./config.js";
import { AppError, toErrorResponse } from "./errors.js";
import {
  createMirrorRouter,
  JsonFileMirrorJobStore,
  MirrorJobService,
  MirrorWorker,
  OllamaMirrorProvider,
} from "./mirror/index.js";
import { MockTranscriptionProvider } from "./providers/mock.js";
import {
  LocalWhisperProvider,
  LoopbackWhisperHttpTransport,
} from "./providers/local-whisper.js";
import { OpenAITranscriptionProvider } from "./providers/openai.js";
import type { TranscriptionProvider } from "./providers/types.js";
import {
  createRateLimitMiddleware,
  MemoryFixedWindowRateLimiter,
} from "./rate-limit.js";
import { MemoryPaidCloudSpendLimit } from "./spend-limit.js";
import type { PaidCloudSpendLimit } from "./spend-limit.js";

export interface ConfiguredRuntime {
  readonly app: Express;
  readonly mirrorWorker: MirrorWorker;
}

const mirrorGatewayErrorHandler: ErrorRequestHandler = (
  error: unknown,
  _request,
  response,
  next,
) => {
  if (response.headersSent) {
    next(error);
    return;
  }
  const normalized =
    error instanceof AppError
      ? error
      : new AppError({
          code: "INTERNAL_ERROR",
          message: "The server could not complete the request.",
          status: 500,
          cause: error,
        });
  if (normalized.status === 401) {
    response.setHeader("WWW-Authenticate", "Bearer");
  }
  const existingRequestId = response.getHeader("X-Request-Id");
  const requestId =
    typeof existingRequestId === "string" ? existingRequestId : randomUUID();
  response
    .status(normalized.status)
    .json(toErrorResponse(normalized, requestId));
};

export const createConfiguredRuntime = (
  config: ServerConfig,
): ConfiguredRuntime => {
  let provider: TranscriptionProvider;
  let paidCloudSpendLimit: PaidCloudSpendLimit | undefined;
  if (config.transcriptionProvider === "openai") {
    if (config.openAIApiKey === undefined) {
      throw new Error("OpenAI provider configuration is incomplete.");
    }
    paidCloudSpendLimit = new MemoryPaidCloudSpendLimit(
      config.paidCloudHardSpendLimitUsd,
    );
    provider = new OpenAITranscriptionProvider({
      apiKey: config.openAIApiKey,
      spendLimit: paidCloudSpendLimit,
      maximumUsdPerAudioMinute: config.paidCloudMaximumUsdPerAudioMinute,
    });
  } else if (config.transcriptionProvider === "mock") {
    provider = new MockTranscriptionProvider();
  } else {
    provider = new LocalWhisperProvider({
      transport: new LoopbackWhisperHttpTransport({
        endpoint: config.localWhisperUrl,
      }),
      defaultModel: config.localWhisperModel,
      highAccuracyModel: config.localWhisperHighAccuracyModel,
    });
  }

  const deviceSession = createDeviceSessionAuthentication(config.apiToken);
  const authenticate = deviceSession.authenticate;
  const app = createTranscriptionApp({
    authenticate,
    deviceSession,
    pairingRateLimiters: {
      client: new MemoryFixedWindowRateLimiter({
        limit: 10,
        windowMs: 15 * 60_000,
      }),
      global: new MemoryFixedWindowRateLimiter({
        limit: 50,
        windowMs: 15 * 60_000,
      }),
    },
    provider,
    rateLimiter: new MemoryFixedWindowRateLimiter({
      limit: config.rateLimit,
      windowMs: config.rateWindowMs,
    }),
    limits: {
      maxAudioBytes: config.maxAudioBytes,
      maxAudioDurationMs: config.maxAudioDurationMs,
    },
    policy:
      config.transcriptionProvider === "openai"
        ? {
            mode: "paid-cloud",
            provider: provider.name,
            paidCloudEnabled: true,
            hardSpendLimitUsd: config.paidCloudHardSpendLimitUsd,
            billingWarning:
              "Paid cloud transcription can incur provider charges. The configured app limit is not a provider-account billing cap.",
          }
        : config.transcriptionProvider === "local"
          ? {
              mode: "free-local",
              provider: provider.name,
              paidCloudEnabled: false,
              hardSpendLimitUsd: 0,
            }
          : {
              mode: "test-mock",
              provider: provider.name,
              paidCloudEnabled: false,
              hardSpendLimitUsd: 0,
            },
    ...(paidCloudSpendLimit === undefined ? {} : { paidCloudSpendLimit }),
  });

  const mirrorStore = new JsonFileMirrorJobStore(config.mirrorJobStorePath);
  const mirrorProvider = new OllamaMirrorProvider({
    baseUrl: config.mirrorOllamaUrl,
    model: config.mirrorModel,
  });
  const mirrorService = new MirrorJobService({
    store: mirrorStore,
    model: mirrorProvider.model,
  });
  const mirrorWorker = new MirrorWorker({
    store: mirrorStore,
    provider: mirrorProvider,
  });
  const mirrorRateLimiter = new MemoryFixedWindowRateLimiter({
    limit: config.mirrorRateLimit,
    windowMs: config.mirrorRateWindowMs,
  });
  app.use(
    "/api/mirror",
    createAuthenticationMiddleware(authenticate),
    createRateLimitMiddleware(mirrorRateLimiter),
    createMirrorRouter({
      service: mirrorService,
      worker: mirrorWorker,
      providerName: mirrorProvider.name,
    }),
    mirrorGatewayErrorHandler,
  );

  return { app, mirrorWorker };
};

export const createConfiguredApp = (config: ServerConfig): Express =>
  createConfiguredRuntime(config).app;

export const mountPreviewPwa = (
  app: Express,
  distributionDirectory = resolve(process.cwd(), "dist"),
): void => {
  app.use((_request, response, next) => {
    response.setHeader("X-Content-Type-Options", "nosniff");
    response.setHeader("Referrer-Policy", "no-referrer");
    response.setHeader(
      "Permissions-Policy",
      "microphone=(self), camera=(), geolocation=()",
    );
    response.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; connect-src 'self' https://resource2.heygen.ai; img-src 'self' data: blob:; media-src 'self' blob: https://resource2.heygen.ai; script-src 'self'; style-src 'self' 'unsafe-inline'; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    );
    next();
  });
  app.use(express.static(distributionDirectory, { dotfiles: "deny" }));
  app.use((request, response, next) => {
    if (
      request.method !== "GET" ||
      request.path.startsWith("/api/") ||
      request.accepts("html") === false
    ) {
      next();
      return;
    }
    response.sendFile(resolve(distributionDirectory, "index.html"), (error) => {
      if (error !== undefined) {
        next(error);
      }
    });
  });
};

const mainPath = process.argv[1];
if (
  mainPath !== undefined &&
  import.meta.url === pathToFileURL(mainPath).href
) {
  const config = loadServerConfig();
  const runtime = createConfiguredRuntime(config);
  mountPreviewPwa(runtime.app);
  runtime.mirrorWorker.start(config.mirrorPollIntervalMs);
  const httpServer = runtime.app.listen(config.port, "127.0.0.1", () => {
    process.stdout.write(
      `QCTP Free Local server listening on http://127.0.0.1:${String(config.port)}\n`,
    );
  });
  const shutdown = (): void => {
    runtime.mirrorWorker.stop();
    void runtime.mirrorWorker.waitForIdle().finally(() => {
      httpServer.close();
    });
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

export * from "./app.js";
export * from "./auth.js";
export * from "./config.js";
export * from "./contracts.js";
export * from "./errors.js";
export * from "./idempotency.js";
export * from "./media.js";
export * from "./mirror/index.js";
export * from "./providers/mock.js";
export * from "./providers/local-whisper.js";
export * from "./providers/openai.js";
export * from "./providers/types.js";
export * from "./rate-limit.js";
export * from "./remote-objects.js";
export * from "./spend-limit.js";
