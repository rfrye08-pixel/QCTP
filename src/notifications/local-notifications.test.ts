import { afterEach, describe, expect, it, vi } from "vitest";

import {
  SCHEDULE_NOTIFICATION_COPY,
  showBestEffortLocalNotification,
} from "./local-notifications";

const originalServiceWorker = Object.getOwnPropertyDescriptor(
  navigator,
  "serviceWorker",
);

afterEach(() => {
  vi.unstubAllGlobals();
  if (originalServiceWorker) {
    Object.defineProperty(navigator, "serviceWorker", originalServiceWorker);
  } else {
    Reflect.deleteProperty(navigator, "serviceWorker");
  }
});

describe("local notification adapter", () => {
  it("uses generic lock-screen copy without sensitive record content", () => {
    const copy =
      `${SCHEDULE_NOTIFICATION_COPY.title} ${SCHEDULE_NOTIFICATION_COPY.body}`.toLocaleLowerCase();
    expect(copy).not.toMatch(/journal|mirror|transcript|observation|source/u);
  });

  it("returns false without prompting when permission is not granted", async () => {
    vi.stubGlobal("Notification", { permission: "default" });
    await expect(
      showBestEffortLocalNotification("QCTP", "Ready", "qctp-test"),
    ).resolves.toBe(false);
  });

  it("falls back safely when service-worker delivery fails", async () => {
    let constructed = 0;
    class TestNotification {
      static permission = "granted";

      constructor() {
        constructed += 1;
      }
    }
    vi.stubGlobal("Notification", TestNotification);
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: {
        getRegistration: () =>
          Promise.resolve({
            showNotification: () => Promise.reject(new Error("suspended")),
          }),
      },
    });

    await expect(
      showBestEffortLocalNotification("QCTP", "Ready", "qctp-test"),
    ).resolves.toBe(true);
    expect(constructed).toBe(1);
  });
});
