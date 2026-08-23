const LEASE_SCHEMA = "qctp-pwa-critical-activity/v1";

export const PWA_CRITICAL_ACTIVITY_STORAGE_PREFIX =
  "qctp:pwa-critical-activity:v1:";
export const PWA_CRITICAL_ACTIVITY_HEARTBEAT_MS = 10_000;
// Mobile browsers can heavily throttle background timers. Keep an orphaned
// lease conservative for longer than the complete 25-minute practice rather
// than risk another tab activating a worker during a paused/backgrounded run.
export const PWA_CRITICAL_ACTIVITY_STALE_AFTER_MS = 2 * 60 * 60 * 1_000;
export const PWA_UPDATE_ACTIVATION_LOCK_NAME = "qctp:pwa-update-activation:v1";

type IntervalHandle = ReturnType<typeof globalThis.setInterval>;

interface PwaWebLock {
  readonly name: string;
}

export interface PwaWebLockManager {
  request<T>(
    name: string,
    options: {
      readonly mode: "shared" | "exclusive";
      readonly ifAvailable?: boolean;
    },
    callback: (lock: PwaWebLock | null) => T | PromiseLike<T>,
  ): Promise<T>;
}

interface CriticalActivityLease {
  schema: typeof LEASE_SCHEMA;
  tabId: string;
  activities: string[];
  heartbeatAt: number;
}

export type PwaUpdateActivationBlockReason =
  | "current-tab-critical-activity"
  | "other-tab-critical-activity"
  | "coordination-unavailable"
  | null;

export interface PwaUpdateActivationSafetySnapshot {
  blocked: boolean;
  reason: PwaUpdateActivationBlockReason;
  activityIds: string[];
}

export interface PwaUpdateSafetyOptions {
  tabId?: string;
  storage?: Storage | null;
  now?: () => number;
  heartbeatMs?: number;
  staleAfterMs?: number;
  scheduleInterval?: (
    callback: () => void,
    intervalMs: number,
  ) => IntervalHandle;
  cancelInterval?: (handle: IntervalHandle) => void;
  locks?: PwaWebLockManager | null;
}

function browserStorage(): Storage | null {
  try {
    return "localStorage" in globalThis ? globalThis.localStorage : null;
  } catch {
    return null;
  }
}

function createTabId(): string {
  try {
    return globalThis.crypto.randomUUID();
  } catch {
    const entropy = Math.random().toString(36).slice(2);
    return `${Date.now().toString(36)}-${entropy}`;
  }
}

function browserLocks(): PwaWebLockManager | null {
  try {
    return (
      (navigator as Navigator & { readonly locks?: PwaWebLockManager }).locks ??
      null
    );
  } catch {
    return null;
  }
}

function isCriticalActivityLease(
  value: unknown,
): value is CriticalActivityLease {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    candidate.schema === LEASE_SCHEMA &&
    typeof candidate.tabId === "string" &&
    candidate.tabId.length > 0 &&
    Array.isArray(candidate.activities) &&
    candidate.activities.length > 0 &&
    candidate.activities.every(
      (activity) => typeof activity === "string" && activity.length > 0,
    ) &&
    typeof candidate.heartbeatAt === "number" &&
    Number.isFinite(candidate.heartbeatAt)
  );
}

/**
 * Coordinates service-worker activation safety between every open QCTP tab.
 * Leases are ephemeral coordination metadata only; this class never reads,
 * removes, or mutates QCTP user records.
 */
export class PwaUpdateSafetyGuard {
  private readonly tabId: string;
  private readonly storage: Storage | null;
  private readonly now: () => number;
  private readonly heartbeatMs: number;
  private readonly staleAfterMs: number;
  private readonly scheduleInterval: NonNullable<
    PwaUpdateSafetyOptions["scheduleInterval"]
  >;
  private readonly cancelInterval: NonNullable<
    PwaUpdateSafetyOptions["cancelInterval"]
  >;
  private readonly locks: PwaWebLockManager | null;
  private readonly activeActivityIds = new Set<string>();
  private heartbeatHandle: IntervalHandle | null = null;
  private sharedLockRequested = false;
  private sharedLockShouldRemainHeld = false;
  private releaseSharedLock: (() => void) | null = null;
  private coordinationFailed = false;

  constructor(options: PwaUpdateSafetyOptions = {}) {
    this.tabId = options.tabId ?? createTabId();
    this.storage =
      options.storage === undefined ? browserStorage() : options.storage;
    this.now = options.now ?? Date.now;
    this.heartbeatMs =
      options.heartbeatMs ?? PWA_CRITICAL_ACTIVITY_HEARTBEAT_MS;
    this.staleAfterMs =
      options.staleAfterMs ?? PWA_CRITICAL_ACTIVITY_STALE_AFTER_MS;
    this.scheduleInterval =
      options.scheduleInterval ??
      ((callback, intervalMs) => globalThis.setInterval(callback, intervalMs));
    this.cancelInterval =
      options.cancelInterval ??
      ((handle) => {
        globalThis.clearInterval(handle);
      });
    this.locks = options.locks === undefined ? browserLocks() : options.locks;
  }

  markActive(activityId: string): void {
    const normalizedId = activityId.trim();
    if (normalizedId.length === 0) {
      throw new Error("A critical activity ID is required.");
    }

    this.activeActivityIds.add(normalizedId);
    this.writeHeartbeat();
    this.holdSharedActivityLock();
    this.ensureHeartbeatTimer();
  }

  markIdle(activityId: string): void {
    this.activeActivityIds.delete(activityId.trim());
    if (this.activeActivityIds.size > 0) {
      this.writeHeartbeat();
      return;
    }

    this.stopHeartbeatTimer();
    this.removeOwnLease();
    this.releaseSharedActivityLock();
  }

  getActivationSafety(): PwaUpdateActivationSafetySnapshot {
    if (this.activeActivityIds.size > 0) {
      return {
        blocked: true,
        reason: "current-tab-critical-activity",
        activityIds: [...this.activeActivityIds].sort(),
      };
    }

    if (this.storage === null) {
      return {
        blocked: true,
        reason: "coordination-unavailable",
        activityIds: [],
      };
    }

    if (this.coordinationFailed) {
      return {
        blocked: true,
        reason: "coordination-unavailable",
        activityIds: [],
      };
    }

    const now = this.now();
    try {
      for (let index = this.storage.length - 1; index >= 0; index -= 1) {
        const key = this.storage.key(index);
        if (
          key === null ||
          !key.startsWith(PWA_CRITICAL_ACTIVITY_STORAGE_PREFIX)
        ) {
          continue;
        }

        const serialized = this.storage.getItem(key);
        if (serialized === null) continue;
        const lease = this.readLease(key, serialized);
        if (lease === null) {
          return {
            blocked: true,
            reason: "coordination-unavailable",
            activityIds: [],
          };
        }
        if (now - lease.heartbeatAt > this.staleAfterMs) {
          this.removeLease(key);
          continue;
        }

        return {
          blocked: true,
          reason:
            lease.tabId === this.tabId
              ? "current-tab-critical-activity"
              : "other-tab-critical-activity",
          activityIds: [...lease.activities].sort(),
        };
      }
    } catch {
      return {
        blocked: true,
        reason: "coordination-unavailable",
        activityIds: [],
      };
    }

    return { blocked: false, reason: null, activityIds: [] };
  }

  isActivationBlocked(): boolean {
    return this.getActivationSafety().blocked;
  }

  dispose(): void {
    this.activeActivityIds.clear();
    this.stopHeartbeatTimer();
    this.removeOwnLease();
    this.releaseSharedActivityLock();
  }

  private get storageKey(): string {
    return `${PWA_CRITICAL_ACTIVITY_STORAGE_PREFIX}${this.tabId}`;
  }

  private ensureHeartbeatTimer(): void {
    if (this.heartbeatHandle !== null) {
      return;
    }

    this.heartbeatHandle = this.scheduleInterval(() => {
      if (this.activeActivityIds.size > 0) {
        this.writeHeartbeat();
      }
    }, this.heartbeatMs);
  }

  private stopHeartbeatTimer(): void {
    if (this.heartbeatHandle === null) {
      return;
    }

    this.cancelInterval(this.heartbeatHandle);
    this.heartbeatHandle = null;
  }

  private writeHeartbeat(): void {
    if (this.storage === null || this.activeActivityIds.size === 0) {
      return;
    }

    const lease: CriticalActivityLease = {
      schema: LEASE_SCHEMA,
      tabId: this.tabId,
      activities: [...this.activeActivityIds].sort(),
      heartbeatAt: this.now(),
    };

    try {
      this.storage.setItem(this.storageKey, JSON.stringify(lease));
      this.coordinationFailed = false;
    } catch {
      // Web Locks still protect modern cross-tab clients. This tab also stays
      // fail-closed if durable lease coordination cannot be written.
      this.coordinationFailed = true;
    }
  }

  private readLease(
    key: string,
    serialized: string,
  ): CriticalActivityLease | null {
    try {
      const lease: unknown = JSON.parse(serialized);
      if (!isCriticalActivityLease(lease)) {
        return null;
      }

      return key === `${PWA_CRITICAL_ACTIVITY_STORAGE_PREFIX}${lease.tabId}`
        ? lease
        : null;
    } catch {
      return null;
    }
  }

  private removeOwnLease(): void {
    this.removeLease(this.storageKey);
  }

  private removeLease(key: string): void {
    try {
      this.storage?.removeItem(key);
    } catch {
      // A fresh orphaned lease remains conservative and expires naturally.
    }
  }

  private holdSharedActivityLock(): void {
    this.sharedLockShouldRemainHeld = true;
    if (this.locks === null || this.sharedLockRequested) return;
    this.sharedLockRequested = true;
    void this.locks
      .request(
        PWA_UPDATE_ACTIVATION_LOCK_NAME,
        { mode: "shared" },
        async (lock) => {
          if (lock === null || !this.sharedLockShouldRemainHeld) return;
          await new Promise<void>((resolveRelease) => {
            this.releaseSharedLock = resolveRelease;
          });
        },
      )
      .catch(() => {
        this.coordinationFailed = true;
      })
      .finally(() => {
        this.releaseSharedLock = null;
        this.sharedLockRequested = false;
        if (this.sharedLockShouldRemainHeld) this.holdSharedActivityLock();
      });
  }

  private releaseSharedActivityLock(): void {
    this.sharedLockShouldRemainHeld = false;
    this.releaseSharedLock?.();
  }
}

export async function runWithPwaUpdateActivationLock(
  task: () => Promise<boolean>,
  locks: PwaWebLockManager | null = browserLocks(),
): Promise<{ readonly acquired: boolean; readonly result: boolean }> {
  if (locks === null) {
    return { acquired: true, result: await task() };
  }
  try {
    return await locks.request(
      PWA_UPDATE_ACTIVATION_LOCK_NAME,
      { mode: "exclusive", ifAvailable: true },
      async (lock) =>
        lock === null
          ? { acquired: false, result: false }
          : { acquired: true, result: await task() },
    );
  } catch {
    return { acquired: false, result: false };
  }
}

let browserGuard: PwaUpdateSafetyGuard | null = null;

function getBrowserGuard(): PwaUpdateSafetyGuard {
  browserGuard ??= new PwaUpdateSafetyGuard();
  return browserGuard;
}

export function markPwaCriticalActivityActive(activityId: string): void {
  getBrowserGuard().markActive(activityId);
}

export function markPwaCriticalActivityIdle(activityId: string): void {
  getBrowserGuard().markIdle(activityId);
}

export function getPwaUpdateActivationSafety(): PwaUpdateActivationSafetySnapshot {
  return getBrowserGuard().getActivationSafety();
}

export function isPwaUpdateActivationBlocked(): boolean {
  return getBrowserGuard().isActivationBlocked();
}
