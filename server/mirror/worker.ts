import {
  MirrorResultSchema,
  type MirrorJobRecord,
  type MirrorResult,
  type MirrorSource,
} from "./contracts.js";
import { MirrorProviderError } from "./errors.js";
import {
  MirrorGenerateOutputSchema,
  type MirrorGenerateOutput,
  type MirrorGeneratedReference,
  type MirrorInferenceProvider,
} from "./provider.js";
import type { MirrorJobStore } from "./store.js";

export interface MirrorWorkerOptions {
  readonly store: MirrorJobStore;
  readonly provider: MirrorInferenceProvider;
  readonly now?: () => Date;
  readonly maxAttempts?: number;
  readonly leaseMs?: number;
  readonly retryDelayMs?: (attempt: number) => number;
  readonly onWorkerError?: (error: unknown) => void;
}

const invalidGeneratedResult = (message: string): MirrorProviderError =>
  new MirrorProviderError({
    code: "LOCAL_MODEL_INVALID_RESULT",
    message,
    retryable: false,
  });

const renderReference = (reference: MirrorGeneratedReference): string =>
  `${reference.text} ${reference.sourceRecordIds
    .map((recordId) => `[source:${recordId}]`)
    .join(" ")}`;

export const createGroundedMirrorResult = (options: {
  readonly generated: MirrorGenerateOutput;
  readonly model: string;
  readonly sources: readonly MirrorSource[];
  readonly createdAt: string;
}): MirrorResult => {
  const parsed = MirrorGenerateOutputSchema.safeParse(options.generated);
  if (!parsed.success) {
    throw invalidGeneratedResult(
      "The local model returned an invalid structured reflection.",
    );
  }
  const sourceById = new Map(
    options.sources.map((source) => [source.recordId, source]),
  );
  const citedIds: string[] = [];
  const seen = new Set<string>();
  const references = [
    ...parsed.data.claims,
    parsed.data.proposedQuestion,
    parsed.data.proposedAction,
  ];
  for (const reference of references) {
    for (const recordId of reference.sourceRecordIds) {
      if (!sourceById.has(recordId)) {
        throw invalidGeneratedResult(
          "The local model returned an ungrounded source reference.",
        );
      }
      if (!seen.has(recordId)) {
        seen.add(recordId);
        citedIds.push(recordId);
      }
    }
  }

  const text = [
    ...parsed.data.claims.map(renderReference),
    `Proposed question: ${renderReference(parsed.data.proposedQuestion)}`,
    `Proposed action: ${renderReference(parsed.data.proposedAction)}`,
  ].join("\n");

  return MirrorResultSchema.parse({
    text,
    model: options.model,
    citations: citedIds.map((recordId) => {
      const source = sourceById.get(recordId);
      if (source === undefined) {
        throw new MirrorProviderError({
          code: "LOCAL_MODEL_INVALID_RESULT",
          message: "The local model returned an ungrounded source reference.",
          retryable: false,
        });
      }
      return {
        recordId: source.recordId,
        title: source.title,
        excerpt: source.excerpt,
      };
    }),
    createdAt: options.createdAt,
  });
};

const safeAttemptError = (
  error: unknown,
): { readonly message: string; readonly retryable: boolean } => {
  if (error instanceof MirrorProviderError) {
    return { message: error.message, retryable: error.retryable };
  }
  return {
    message: "The local Mirror worker could not process this job.",
    retryable: false,
  };
};

export class MirrorWorker {
  readonly #store: MirrorJobStore;
  readonly #provider: MirrorInferenceProvider;
  readonly #now: () => Date;
  readonly #maxAttempts: number;
  readonly #leaseMs: number;
  readonly #retryDelayMs: (attempt: number) => number;
  readonly #onWorkerError: ((error: unknown) => void) | undefined;
  #timer: NodeJS.Timeout | null = null;
  #drainPromise: Promise<void> | null = null;

  constructor(options: MirrorWorkerOptions) {
    this.#store = options.store;
    this.#provider = options.provider;
    this.#now = options.now ?? (() => new Date());
    this.#maxAttempts = options.maxAttempts ?? 3;
    this.#leaseMs = options.leaseMs ?? 5 * 60_000;
    this.#retryDelayMs =
      options.retryDelayMs ??
      ((attempt) => Math.min(60_000, 2 ** Math.max(0, attempt - 1) * 2_000));
    this.#onWorkerError = options.onWorkerError;
    if (!Number.isInteger(this.#maxAttempts) || this.#maxAttempts < 1) {
      throw new Error("Mirror worker maxAttempts must be a positive integer.");
    }
    if (!Number.isInteger(this.#leaseMs) || this.#leaseMs < 1_000) {
      throw new Error("Mirror worker leaseMs must be at least one second.");
    }
  }

  start(pollIntervalMs = 2_000): void {
    if (
      !Number.isInteger(pollIntervalMs) ||
      pollIntervalMs < 250 ||
      pollIntervalMs > 60_000
    ) {
      throw new Error("Mirror worker poll interval is invalid.");
    }
    if (this.#timer !== null) {
      return;
    }
    this.trigger();
    this.#timer = setInterval(() => this.trigger(), pollIntervalMs);
    this.#timer.unref();
  }

  stop(): void {
    if (this.#timer !== null) {
      clearInterval(this.#timer);
      this.#timer = null;
    }
  }

  trigger(): void {
    if (this.#drainPromise === null) {
      this.#drainPromise = this.#drainSafely();
    }
  }

  async waitForIdle(): Promise<void> {
    while (this.#drainPromise !== null) {
      await this.#drainPromise;
    }
  }

  async runOnce(): Promise<boolean> {
    const claimedAt = this.#now();
    const job = await this.#store.claimNext(
      claimedAt.toISOString(),
      new Date(claimedAt.getTime() + this.#leaseMs).toISOString(),
    );
    if (job === null) {
      return false;
    }
    await this.#process(job);
    return true;
  }

  async #drainSafely(): Promise<void> {
    try {
      while (await this.runOnce()) {
        // Drain all currently eligible jobs. Future retry jobs wait for a poll.
      }
    } catch (error: unknown) {
      this.#onWorkerError?.(error);
    } finally {
      this.#drainPromise = null;
    }
  }

  async #process(job: MirrorJobRecord): Promise<void> {
    try {
      const generated = await this.#provider.generate({
        prompt: job.prompt,
        sources: job.sources,
      });
      const completedAt = this.#now().toISOString();
      const completed: MirrorJobRecord = {
        ...job,
        status: "complete",
        updatedAt: completedAt,
        lastError: null,
        result: createGroundedMirrorResult({
          generated,
          model: this.#provider.model,
          sources: job.sources,
          createdAt: completedAt,
        }),
        nextAttemptAt: null,
        leaseExpiresAt: null,
      };
      await this.#store.finishAttempt(completed);
    } catch (error: unknown) {
      const failure = safeAttemptError(error);
      const failedAt = this.#now();
      const willRetry = failure.retryable && job.attempts < this.#maxAttempts;
      const failed: MirrorJobRecord = {
        ...job,
        status: willRetry ? "retry_wait" : "failed",
        updatedAt: failedAt.toISOString(),
        lastError: failure.message,
        result: null,
        nextAttemptAt: willRetry
          ? new Date(
              failedAt.getTime() + this.#retryDelayMs(job.attempts),
            ).toISOString()
          : null,
        leaseExpiresAt: null,
      };
      await this.#store.finishAttempt(failed);
    }
  }
}
