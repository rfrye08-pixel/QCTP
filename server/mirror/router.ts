import { randomUUID } from "node:crypto";

import express from "express";
import type {
  ErrorRequestHandler,
  Request,
  RequestHandler,
  Router,
} from "express";
import { z } from "zod";

import {
  CreateMirrorJobRequestSchema,
  MirrorIdentifierSchema,
  MirrorPolicySchema,
} from "./contracts.js";
import { MirrorError, normalizeMirrorError, publicError } from "./errors.js";
import type { MirrorJobService } from "./service.js";
import type { MirrorWorker } from "./worker.js";

export interface CreateMirrorRouterOptions {
  readonly service: MirrorJobService;
  readonly worker: MirrorWorker;
  readonly providerName?: string;
  readonly createRequestId?: () => string;
}

interface MirrorRequest extends Request {
  qctpMirrorRequestId?: string;
}

const SyncQuerySchema = z
  .object({
    requestIds: z.string().trim().min(1).max(6_500),
  })
  .strict();

const requestIdFrom = (request: Request): string =>
  (request as MirrorRequest).qctpMirrorRequestId ?? randomUUID();

const invalidRequest = (field: string): MirrorError =>
  new MirrorError({
    code: "INVALID_REQUEST",
    message: "The Mirror request is invalid.",
    status: 400,
    field,
  });

const parseJobId = (request: Request): string => {
  const parsed = MirrorIdentifierSchema.safeParse(request.params.jobId);
  if (!parsed.success) {
    throw invalidRequest("jobId");
  }
  return parsed.data;
};

const parseClientRequestId = (request: Request): string => {
  const parsed = MirrorIdentifierSchema.safeParse(request.params.requestId);
  if (!parsed.success) {
    throw invalidRequest("requestId");
  }
  return parsed.data;
};

const asyncRoute =
  (
    handler: (request: Request, response: express.Response) => Promise<void>,
  ): RequestHandler =>
  (request, response, next) => {
    void handler(request, response).catch(next);
  };

export const createMirrorRouter = (
  options: CreateMirrorRouterOptions,
): Router => {
  const router = express.Router();
  const createRequestId = options.createRequestId ?? randomUUID;

  router.use((request, response, next) => {
    const requestId = createRequestId();
    (request as MirrorRequest).qctpMirrorRequestId = requestId;
    response.setHeader("X-Request-Id", requestId);
    next();
  });
  router.use(express.json({ limit: "64kb", strict: true }));

  router.get("/policy", (_request, response) => {
    response.status(200).json(
      MirrorPolicySchema.parse({
        mode: "free-local",
        provider: options.providerName ?? "local-model",
        model: options.service.model,
        paidCloudEnabled: false,
        recurringApiCostUsd: 0,
      }),
    );
  });

  router.post(
    "/jobs",
    asyncRoute(async (request, response) => {
      const parsed = CreateMirrorJobRequestSchema.safeParse(
        request.body as unknown,
      );
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        throw invalidRequest(String(issue?.path[0] ?? "body"));
      }
      const submitted = await options.service.submit(parsed.data);
      response.status(submitted.created ? 202 : 200).json(submitted.job);
      options.worker.trigger();
    }),
  );

  router.delete(
    "/jobs/by-request/:requestId",
    asyncRoute(async (request, response) => {
      await options.service.deleteByRequestId(parseClientRequestId(request));
      response.status(204).end();
    }),
  );

  router.delete(
    "/jobs/:jobId",
    asyncRoute(async (request, response) => {
      await options.service.delete(parseJobId(request));
      response.status(204).end();
    }),
  );

  router.get(
    "/jobs",
    asyncRoute(async (request, response) => {
      const parsed = SyncQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        throw invalidRequest("requestIds");
      }
      const requestIds = parsed.data.requestIds
        .split(",")
        .map((requestId) => requestId.trim());
      if (
        requestIds.length > 50 ||
        requestIds.some(
          (requestId) => !MirrorIdentifierSchema.safeParse(requestId).success,
        ) ||
        new Set(requestIds).size !== requestIds.length
      ) {
        throw invalidRequest("requestIds");
      }
      const jobs = await options.service.sync(requestIds);
      response.status(200).json({ jobs });
    }),
  );

  router.get(
    "/jobs/:jobId",
    asyncRoute(async (request, response) => {
      const job = await options.service.get(parseJobId(request));
      response.status(200).json(job);
    }),
  );

  router.post(
    "/jobs/:jobId/retry",
    asyncRoute(async (request, response) => {
      const job = await options.service.retry(parseJobId(request));
      response.status(202).json(job);
      options.worker.trigger();
    }),
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
    const normalized =
      error instanceof SyntaxError
        ? invalidRequest("body")
        : normalizeMirrorError(error);
    response
      .status(normalized.status)
      .json(publicError(normalized, requestIdFrom(request)));
  };
  router.use(errorHandler);

  return router;
};
