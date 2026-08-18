import { randomUUID } from "node:crypto";
import { chmod, mkdir, open, readFile, rename, unlink } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import {
  MirrorJobRecordSchema,
  MirrorStoreDocumentSchema,
  type MirrorJobRecord,
  type MirrorStoreDocument,
} from "./contracts.js";
import { MirrorStoreError } from "./errors.js";

export interface CreateOrGetJobResult {
  readonly job: MirrorJobRecord;
  readonly created: boolean;
}

export type RetryJobResult =
  | { readonly kind: "updated"; readonly job: MirrorJobRecord }
  | { readonly kind: "not_found" }
  | { readonly kind: "not_retryable"; readonly job: MirrorJobRecord };

export interface MirrorJobStore {
  createOrGet(job: MirrorJobRecord): Promise<CreateOrGetJobResult>;
  get(jobId: string): Promise<MirrorJobRecord | null>;
  listByRequestIds(requestIds: readonly string[]): Promise<MirrorJobRecord[]>;
  claimNext(
    now: string,
    leaseExpiresAt: string,
  ): Promise<MirrorJobRecord | null>;
  finishAttempt(job: MirrorJobRecord): Promise<boolean>;
  retry(jobId: string, now: string): Promise<RetryJobResult>;
  delete(jobId: string): Promise<boolean>;
  deleteByRequestId(requestId: string): Promise<boolean>;
}

const emptyDocument = (): MirrorStoreDocument => ({ version: 1, jobs: [] });

const cloneJob = (job: MirrorJobRecord): MirrorJobRecord =>
  structuredClone(job);

const isDue = (job: MirrorJobRecord, nowMs: number): boolean => {
  if (job.status === "queued") {
    return true;
  }
  if (job.status === "retry_wait") {
    return job.nextAttemptAt === null || Date.parse(job.nextAttemptAt) <= nowMs;
  }
  return (
    job.status === "processing" &&
    job.leaseExpiresAt !== null &&
    Date.parse(job.leaseExpiresAt) <= nowMs
  );
};

const claimFromDocument = (
  document: MirrorStoreDocument,
  now: string,
  leaseExpiresAt: string,
): MirrorJobRecord | null => {
  const nowMs = Date.parse(now);
  const candidate = document.jobs
    .filter((job) => isDue(job, nowMs))
    .sort((left, right) => {
      const timeDifference =
        Date.parse(left.createdAt) - Date.parse(right.createdAt);
      return timeDifference === 0
        ? left.id.localeCompare(right.id)
        : timeDifference;
    })[0];
  if (candidate === undefined) {
    return null;
  }

  const claimed: MirrorJobRecord = {
    ...candidate,
    status: "processing",
    attempts: candidate.attempts + 1,
    updatedAt: now,
    lastError: null,
    nextAttemptAt: null,
    leaseExpiresAt,
  };
  const index = document.jobs.findIndex((job) => job.id === candidate.id);
  document.jobs[index] = claimed;
  return cloneJob(claimed);
};

const retryInDocument = (
  document: MirrorStoreDocument,
  jobId: string,
  now: string,
): RetryJobResult => {
  const index = document.jobs.findIndex((job) => job.id === jobId);
  const existing = document.jobs[index];
  if (existing === undefined) {
    return { kind: "not_found" };
  }
  if (existing.status !== "failed" && existing.status !== "retry_wait") {
    return { kind: "not_retryable", job: cloneJob(existing) };
  }
  const retried: MirrorJobRecord = {
    ...existing,
    status: "queued",
    updatedAt: now,
    attempts: 0,
    lastError: null,
    result: null,
    nextAttemptAt: null,
    leaseExpiresAt: null,
  };
  document.jobs[index] = retried;
  return { kind: "updated", job: cloneJob(retried) };
};

export class InMemoryMirrorJobStore implements MirrorJobStore {
  readonly #document: MirrorStoreDocument;

  constructor(initialJobs: readonly MirrorJobRecord[] = []) {
    this.#document = MirrorStoreDocumentSchema.parse({
      version: 1,
      jobs: initialJobs,
    });
  }

  createOrGet(job: MirrorJobRecord): Promise<CreateOrGetJobResult> {
    const validated = MirrorJobRecordSchema.parse(job);
    const existing = this.#document.jobs.find(
      (candidate) => candidate.requestId === validated.requestId,
    );
    if (existing !== undefined) {
      return Promise.resolve({ job: cloneJob(existing), created: false });
    }
    this.#document.jobs.push(cloneJob(validated));
    return Promise.resolve({ job: cloneJob(validated), created: true });
  }

  get(jobId: string): Promise<MirrorJobRecord | null> {
    const job = this.#document.jobs.find((candidate) => candidate.id === jobId);
    return Promise.resolve(job === undefined ? null : cloneJob(job));
  }

  listByRequestIds(requestIds: readonly string[]): Promise<MirrorJobRecord[]> {
    const requestIdSet = new Set(requestIds);
    return Promise.resolve(
      this.#document.jobs
        .filter((job) => requestIdSet.has(job.requestId))
        .map(cloneJob),
    );
  }

  claimNext(
    now: string,
    leaseExpiresAt: string,
  ): Promise<MirrorJobRecord | null> {
    return Promise.resolve(
      claimFromDocument(this.#document, now, leaseExpiresAt),
    );
  }

  finishAttempt(job: MirrorJobRecord): Promise<boolean> {
    const validated = MirrorJobRecordSchema.parse(job);
    const index = this.#document.jobs.findIndex(
      (candidate) => candidate.id === validated.id,
    );
    const existing = this.#document.jobs[index];
    if (
      existing === undefined ||
      existing.status !== "processing" ||
      existing.attempts !== validated.attempts
    ) {
      return Promise.resolve(false);
    }
    this.#document.jobs[index] = cloneJob(validated);
    return Promise.resolve(true);
  }

  retry(jobId: string, now: string): Promise<RetryJobResult> {
    return Promise.resolve(retryInDocument(this.#document, jobId, now));
  }

  delete(jobId: string): Promise<boolean> {
    const index = this.#document.jobs.findIndex((job) => job.id === jobId);
    if (index < 0) return Promise.resolve(false);
    this.#document.jobs.splice(index, 1);
    return Promise.resolve(true);
  }

  deleteByRequestId(requestId: string): Promise<boolean> {
    const index = this.#document.jobs.findIndex(
      (job) => job.requestId === requestId,
    );
    if (index < 0) return Promise.resolve(false);
    this.#document.jobs.splice(index, 1);
    return Promise.resolve(true);
  }
}

const isMissingFileError = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  "code" in error &&
  error.code === "ENOENT";

export class JsonFileMirrorJobStore implements MirrorJobStore {
  readonly #filePath: string;
  #operationTail: Promise<void> = Promise.resolve();

  constructor(filePath: string) {
    if (filePath.trim().length === 0) {
      throw new Error("A Mirror job-store file path is required.");
    }
    this.#filePath = filePath;
  }

  async #exclusive<T>(operation: () => Promise<T>): Promise<T> {
    const predecessor = this.#operationTail;
    let release = (): void => undefined;
    this.#operationTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await predecessor;
    try {
      return await operation();
    } finally {
      release();
    }
  }

  async #read(): Promise<MirrorStoreDocument> {
    let serialized: string;
    try {
      serialized = await readFile(this.#filePath, "utf8");
    } catch (error: unknown) {
      if (isMissingFileError(error)) {
        return emptyDocument();
      }
      throw new MirrorStoreError("The Mirror job file could not be read.", {
        cause: error,
      });
    }

    try {
      return MirrorStoreDocumentSchema.parse(JSON.parse(serialized) as unknown);
    } catch (error: unknown) {
      throw new MirrorStoreError(
        "The Mirror job file is corrupt or has an unsupported format.",
        { cause: error },
      );
    }
  }

  async #write(document: MirrorStoreDocument): Promise<void> {
    const validated = MirrorStoreDocumentSchema.parse(document);
    const directory = dirname(this.#filePath);
    const temporaryPath = join(
      directory,
      `.${basename(this.#filePath)}.${process.pid}.${randomUUID()}.tmp`,
    );
    let handle: Awaited<ReturnType<typeof open>> | undefined;
    try {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      handle = await open(temporaryPath, "wx", 0o600);
      await handle.writeFile(`${JSON.stringify(validated, null, 2)}\n`, "utf8");
      await handle.sync();
      await handle.close();
      handle = undefined;
      await rename(temporaryPath, this.#filePath);
      await chmod(this.#filePath, 0o600);
    } catch (error: unknown) {
      if (handle !== undefined) {
        await handle.close().catch(() => undefined);
      }
      await unlink(temporaryPath).catch(() => undefined);
      throw new MirrorStoreError("The Mirror job file could not be saved.", {
        cause: error,
      });
    }
  }

  async createOrGet(job: MirrorJobRecord): Promise<CreateOrGetJobResult> {
    const validated = MirrorJobRecordSchema.parse(job);
    return this.#exclusive(async () => {
      const document = await this.#read();
      const existing = document.jobs.find(
        (candidate) => candidate.requestId === validated.requestId,
      );
      if (existing !== undefined) {
        return { job: cloneJob(existing), created: false };
      }
      document.jobs.push(cloneJob(validated));
      await this.#write(document);
      return { job: cloneJob(validated), created: true };
    });
  }

  async get(jobId: string): Promise<MirrorJobRecord | null> {
    return this.#exclusive(async () => {
      const document = await this.#read();
      const job = document.jobs.find((candidate) => candidate.id === jobId);
      return job === undefined ? null : cloneJob(job);
    });
  }

  async listByRequestIds(
    requestIds: readonly string[],
  ): Promise<MirrorJobRecord[]> {
    return this.#exclusive(async () => {
      const document = await this.#read();
      const requestIdSet = new Set(requestIds);
      return document.jobs
        .filter((job) => requestIdSet.has(job.requestId))
        .map(cloneJob);
    });
  }

  async claimNext(
    now: string,
    leaseExpiresAt: string,
  ): Promise<MirrorJobRecord | null> {
    return this.#exclusive(async () => {
      const document = await this.#read();
      const claimed = claimFromDocument(document, now, leaseExpiresAt);
      if (claimed !== null) {
        await this.#write(document);
      }
      return claimed;
    });
  }

  async finishAttempt(job: MirrorJobRecord): Promise<boolean> {
    const validated = MirrorJobRecordSchema.parse(job);
    return this.#exclusive(async () => {
      const document = await this.#read();
      const index = document.jobs.findIndex(
        (candidate) => candidate.id === validated.id,
      );
      const existing = document.jobs[index];
      if (
        existing === undefined ||
        existing.status !== "processing" ||
        existing.attempts !== validated.attempts
      ) {
        return false;
      }
      document.jobs[index] = cloneJob(validated);
      await this.#write(document);
      return true;
    });
  }

  async retry(jobId: string, now: string): Promise<RetryJobResult> {
    return this.#exclusive(async () => {
      const document = await this.#read();
      const result = retryInDocument(document, jobId, now);
      if (result.kind === "updated") {
        await this.#write(document);
      }
      return result;
    });
  }

  async delete(jobId: string): Promise<boolean> {
    return this.#exclusive(async () => {
      const document = await this.#read();
      const index = document.jobs.findIndex((job) => job.id === jobId);
      if (index < 0) return false;
      document.jobs.splice(index, 1);
      await this.#write(document);
      return true;
    });
  }

  async deleteByRequestId(requestId: string): Promise<boolean> {
    return this.#exclusive(async () => {
      const document = await this.#read();
      const index = document.jobs.findIndex(
        (job) => job.requestId === requestId,
      );
      if (index < 0) return false;
      document.jobs.splice(index, 1);
      await this.#write(document);
      return true;
    });
  }
}
