export interface SpendReservation {
  commit(): void;
  release(): void;
}

export interface PaidCloudSpendLimit {
  reserve(maximumChargeUsd: number): SpendReservation;
  snapshot(): {
    readonly hardLimitUsd: number;
    readonly committedUsd: number;
    readonly reservedUsd: number;
    readonly remainingUsd: number;
  };
}

export class SpendLimitExceededError extends Error {
  constructor() {
    super("The paid-cloud hard spend limit has been reached.");
    this.name = "SpendLimitExceededError";
  }
}

export class MemoryPaidCloudSpendLimit implements PaidCloudSpendLimit {
  readonly #hardLimitUsd: number;
  #committedUsd = 0;
  #reservedUsd = 0;

  constructor(hardLimitUsd: number) {
    if (!Number.isFinite(hardLimitUsd) || hardLimitUsd <= 0) {
      throw new Error("Paid-cloud hard spend limit must be positive.");
    }
    this.#hardLimitUsd = hardLimitUsd;
  }

  reserve(maximumChargeUsd: number): SpendReservation {
    if (!Number.isFinite(maximumChargeUsd) || maximumChargeUsd <= 0) {
      throw new Error("Maximum request charge must be positive.");
    }
    if (
      this.#committedUsd + this.#reservedUsd + maximumChargeUsd >
      this.#hardLimitUsd
    ) {
      throw new SpendLimitExceededError();
    }

    this.#reservedUsd += maximumChargeUsd;
    let state: "reserved" | "committed" | "released" = "reserved";
    return {
      commit: () => {
        if (state !== "reserved") return;
        this.#reservedUsd -= maximumChargeUsd;
        this.#committedUsd += maximumChargeUsd;
        state = "committed";
      },
      release: () => {
        if (state !== "reserved") return;
        this.#reservedUsd -= maximumChargeUsd;
        state = "released";
      },
    };
  }

  snapshot() {
    return {
      hardLimitUsd: this.#hardLimitUsd,
      committedUsd: this.#committedUsd,
      reservedUsd: this.#reservedUsd,
      remainingUsd: Math.max(
        0,
        this.#hardLimitUsd - this.#committedUsd - this.#reservedUsd,
      ),
    };
  }
}
