import { createHash, randomUUID } from "node:crypto";

import {
  CreateMirrorJobRequestSchema,
  PublicMirrorJobSchema,
  type CreateMirrorJobRequest,
  type MirrorJobRecord,
  type PublicMirrorJob,
} from "./contracts.js";
import { MirrorError } from "./errors.js";
import type { MirrorJobStore } from "./store.js";

export interface MirrorJobServiceOptions {
  readonly store: MirrorJobStore;
  readonly model: string;
  readonly now?: () => Date;
  readonly createId?: () => string;
}

export interface SubmitMirrorJobResult {
  readonly job: PublicMirrorJob;
  readonly created: boolean;
}

const requestFingerprint = (request: CreateMirrorJobRequest): string =>
  createHash("sha256").update(JSON.stringify(request), "utf8").digest("hex");

export const toPublicMirrorJob = (job: MirrorJobRecord): PublicMirrorJob =>
  PublicMirrorJobSchema.parse({
    id: job.id,
    requestId: job.requestId,
    status: job.status,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    attempts: job.attempts,
    lastError: job.lastError,
    result: job.result,
  });

export class MirrorJobService {
  readonly #store: MirrorJobStore;
  readonly #model: string;
  readonly #now: () => Date;
  readonly #createId: () => string;

  get model(): string {
    return this.#model;
  }

  constructor(options: MirrorJobServiceOptions) {
    this.#store = options.store;
    this.#model = options.model.trim();
    if (this.#model.length === 0 || this.#model.length > 200) {
      throw new Error("The local Mirror model identifier is invalid.");
    }
    this.#now = options.now ?? (() => new Date());
    this.#createId = options.createId ?? randomUUID;
  }

  async submit(input: CreateMirrorJobRequest): Promise<SubmitMirrorJobResult> {
    const request = CreateMirrorJobRequestSchema.parse(input);
    const now = this.#now().toISOString();
    const fingerprint = requestFingerprint(request);
    const record: MirrorJobRecord = {
      id: this.#createId(),
      requestId: request.requestId,
      status: "queued",
      createdAt: now,
      updatedAt: now,
      attempts: 0,
      lastError: null,
      result: null,
      prompt: request.prompt,
      sources: request.sources,
      requestFingerprint: fingerprint,
      nextAttemptAt: null,
      leaseExpiresAt: null,
    };
    const result = await this.#store.createOrGet(record);
    if (result.job.requestFingerprint !== fingerprint) {
      throw new MirrorError({
        code: "REQUEST_ID_CONFLICT",
        message:
          "That request identifier is already used by another Mirror request.",
        status: 409,
        field: "requestId",
      });
    }
    return {
      job: toPublicMirrorJob(result.job),
      created: result.created,
    };
  }

  async get(jobId: string): Promise<PublicMirrorJob> {
    const job = await this.#store.get(jobId);
    if (job === null) {
      throw new MirrorError({
        code: "JOB_NOT_FOUND",
        message: "The Mirror job was not found.",
        status: 404,
      });
    }
    return toPublicMirrorJob(job);
  }

  async sync(requestIds: readonly string[]): Promise<PublicMirrorJob[]> {
    const jobs = await this.#store.listByRequestIds(requestIds);
    const jobsByRequestId = new Map(
      jobs.map((job) => [job.requestId, toPublicMirrorJob(job)]),
    );
    return requestIds.flatMap((requestId) => {
      const job = jobsByRequestId.get(requestId);
      return job === undefined ? [] : [job];
    });
  }

  async retry(jobId: string): Promise<PublicMirrorJob> {
    const result = await this.#store.retry(jobId, this.#now().toISOString());
    if (result.kind === "not_found") {
      throw new MirrorError({
        code: "JOB_NOT_FOUND",
        message: "The Mirror job was not found.",
        status: 404,
      });
    }
    if (result.kind === "not_retryable") {
      throw new MirrorError({
        code: "JOB_NOT_RETRYABLE",
        message: "The Mirror job cannot be retried in its current state.",
        status: 409,
      });
    }
    return toPublicMirrorJob(result.job);
  }

  async delete(jobId: string): Promise<void> {
    if (!(await this.#store.delete(jobId))) {
      throw new MirrorError({
        code: "JOB_NOT_FOUND",
        message: "The Mirror job was not found.",
        status: 404,
      });
    }
  }

  async deleteByRequestId(requestId: string): Promise<void> {
    if (!(await this.#store.deleteByRequestId(requestId))) {
      throw new MirrorError({
        code: "JOB_NOT_FOUND",
        message: "The Mirror job was not found.",
        status: 404,
      });
    }
  }
}
