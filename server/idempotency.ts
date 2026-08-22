export interface CachedHttpResponse {
  readonly status: number;
  readonly body: unknown;
}

export interface IdempotencyExecutionResult {
  readonly response: CachedHttpResponse;
  readonly replayed: boolean;
}

export interface IdempotencyStore {
  execute(
    scope: string,
    key: string,
    operation: () => Promise<CachedHttpResponse>,
  ): Promise<IdempotencyExecutionResult>;
}

interface StoredOperation {
  readonly expiresAt: number;
  readonly promise: Promise<CachedHttpResponse>;
}

export class MemoryIdempotencyStore implements IdempotencyStore {
  readonly #ttlMs: number;
  readonly #now: () => number;
  readonly #operations = new Map<string, StoredOperation>();

  constructor(options: { ttlMs?: number; now?: () => number } = {}) {
    this.#ttlMs = options.ttlMs ?? 24 * 60 * 60 * 1_000;
    this.#now = options.now ?? Date.now;
    if (!Number.isInteger(this.#ttlMs) || this.#ttlMs < 1) {
      throw new Error("Idempotency TTL must be a positive integer.");
    }
  }

  async execute(
    scope: string,
    key: string,
    operation: () => Promise<CachedHttpResponse>,
  ): Promise<IdempotencyExecutionResult> {
    const now = this.#now();
    for (const [storedKey, stored] of this.#operations) {
      if (stored.expiresAt <= now) {
        this.#operations.delete(storedKey);
      }
    }

    const compoundKey = `${scope}\u0000${key}`;
    const existing = this.#operations.get(compoundKey);
    if (existing !== undefined) {
      return { response: await existing.promise, replayed: true };
    }

    const promise = operation();
    this.#operations.set(compoundKey, {
      expiresAt: now + this.#ttlMs,
      promise,
    });

    try {
      return { response: await promise, replayed: false };
    } catch (error: unknown) {
      const current = this.#operations.get(compoundKey);
      if (current?.promise === promise) {
        this.#operations.delete(compoundKey);
      }
      throw error;
    }
  }
}
