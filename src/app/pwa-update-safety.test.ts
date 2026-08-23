import { describe, expect, it, vi } from "vitest";

import {
  PWA_CRITICAL_ACTIVITY_STORAGE_PREFIX,
  PWA_UPDATE_ACTIVATION_LOCK_NAME,
  PwaUpdateSafetyGuard,
  runWithPwaUpdateActivationLock,
  type PwaWebLockManager,
} from "./pwa-update-safety";

class SharedStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

const TEST_INTERVAL_HANDLE = {} as ReturnType<typeof globalThis.setInterval>;

function noInterval(): ReturnType<typeof globalThis.setInterval> {
  return TEST_INTERVAL_HANDLE;
}

describe("PwaUpdateSafetyGuard", () => {
  it("blocks in the current tab until every active activity is idle", () => {
    const storage = new SharedStorage();
    const guard = new PwaUpdateSafetyGuard({
      storage,
      tabId: "current",
      now: () => 100,
      scheduleInterval: noInterval,
    });

    storage.setItem("qctp-user-data", "preserve-me");
    guard.markActive("day1-practice");
    guard.markActive("voice-capture");

    expect(guard.getActivationSafety()).toEqual({
      blocked: true,
      reason: "current-tab-critical-activity",
      activityIds: ["day1-practice", "voice-capture"],
    });

    guard.markIdle("voice-capture");
    expect(guard.isActivationBlocked()).toBe(true);

    guard.markIdle("day1-practice");
    expect(guard.getActivationSafety()).toEqual({
      blocked: false,
      reason: null,
      activityIds: [],
    });
    expect(storage.getItem("qctp-user-data")).toBe("preserve-me");
  });

  it("blocks a different tab while a fresh heartbeat exists", () => {
    const storage = new SharedStorage();
    const now = 1_000;
    const practiceTab = new PwaUpdateSafetyGuard({
      storage,
      tabId: "practice-tab",
      now: () => now,
      scheduleInterval: noInterval,
      staleAfterMs: 100,
    });
    const updateTab = new PwaUpdateSafetyGuard({
      storage,
      tabId: "update-tab",
      now: () => now,
      scheduleInterval: noInterval,
      staleAfterMs: 100,
    });

    practiceTab.markActive("day1-practice");

    expect(updateTab.getActivationSafety()).toEqual({
      blocked: true,
      reason: "other-tab-critical-activity",
      activityIds: ["day1-practice"],
    });
  });

  it("refreshes a heartbeat and expires an abandoned lease", () => {
    const storage = new SharedStorage();
    let now = 10;
    const heartbeat: { current: (() => void) | null } = { current: null };
    const practiceTab = new PwaUpdateSafetyGuard({
      storage,
      tabId: "practice-tab",
      now: () => now,
      heartbeatMs: 10,
      staleAfterMs: 50,
      scheduleInterval: (callback) => {
        heartbeat.current = callback;
        return TEST_INTERVAL_HANDLE;
      },
    });
    const updateTab = new PwaUpdateSafetyGuard({
      storage,
      tabId: "update-tab",
      now: () => now,
      scheduleInterval: noInterval,
      staleAfterMs: 50,
    });

    practiceTab.markActive("day1-practice");
    now = 50;
    heartbeat.current?.();
    now = 90;
    expect(updateTab.isActivationBlocked()).toBe(true);

    now = 101;
    expect(updateTab.isActivationBlocked()).toBe(false);
    expect(
      storage.getItem(`${PWA_CRITICAL_ACTIVITY_STORAGE_PREFIX}practice-tab`),
    ).toBeNull();
  });

  it("fails closed for the current tab when persistence throws", () => {
    const storage = new SharedStorage();
    vi.spyOn(storage, "setItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    const guard = new PwaUpdateSafetyGuard({
      storage,
      tabId: "private-mode-tab",
      scheduleInterval: noInterval,
    });

    guard.markActive("day1-practice");

    expect(guard.getActivationSafety()).toEqual({
      blocked: true,
      reason: "current-tab-critical-activity",
      activityIds: ["day1-practice"],
    });
    guard.markIdle("day1-practice");
    expect(guard.getActivationSafety()).toEqual({
      blocked: true,
      reason: "coordination-unavailable",
      activityIds: [],
    });
  });

  it("fails closed when cross-tab coordination cannot be inspected", () => {
    const storage = new SharedStorage();
    vi.spyOn(storage, "key").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });
    storage.setItem(
      `${PWA_CRITICAL_ACTIVITY_STORAGE_PREFIX}unknown-tab`,
      "unknown",
    );
    const guard = new PwaUpdateSafetyGuard({
      storage,
      tabId: "current-tab",
      scheduleInterval: noInterval,
    });

    expect(guard.getActivationSafety()).toEqual({
      blocked: true,
      reason: "coordination-unavailable",
      activityIds: [],
    });
  });

  it("fails closed on invalid guard metadata and never touches user data", () => {
    const storage = new SharedStorage();
    const invalidKey = `${PWA_CRITICAL_ACTIVITY_STORAGE_PREFIX}broken-tab`;
    storage.setItem(invalidKey, "not-json");
    storage.setItem("qctp-recording", "raw-audio-pointer");
    const guard = new PwaUpdateSafetyGuard({
      storage,
      tabId: "current-tab",
      scheduleInterval: noInterval,
    });

    expect(guard.getActivationSafety()).toEqual({
      blocked: true,
      reason: "coordination-unavailable",
      activityIds: [],
    });
    expect(storage.getItem(invalidKey)).toBe("not-json");
    expect(storage.getItem("qctp-recording")).toBe("raw-audio-pointer");
  });

  it("uses an exclusive Web Lock and fails closed when another tab holds it", async () => {
    const task = vi.fn(() => Promise.resolve(true));
    const deniedCalls: Array<{
      name: string;
      options: { mode: "shared" | "exclusive"; ifAvailable?: boolean };
    }> = [];
    const deniedLocks: PwaWebLockManager = {
      async request(name, options, callback) {
        deniedCalls.push({ name, options });
        return await callback(null);
      },
    };

    await expect(
      runWithPwaUpdateActivationLock(task, deniedLocks),
    ).resolves.toEqual({ acquired: false, result: false });
    expect(task).not.toHaveBeenCalled();
    expect(deniedCalls).toEqual([
      {
        name: PWA_UPDATE_ACTIVATION_LOCK_NAME,
        options: { mode: "exclusive", ifAvailable: true },
      },
    ]);

    const grantedLocks: PwaWebLockManager = {
      async request(_name, _options, callback) {
        return await callback({ name: PWA_UPDATE_ACTIVATION_LOCK_NAME });
      },
    };
    await expect(
      runWithPwaUpdateActivationLock(task, grantedLocks),
    ).resolves.toEqual({ acquired: true, result: true });
    expect(task).toHaveBeenCalledOnce();
  });
});
