import { useSyncExternalStore } from "react";
import { registerSW } from "virtual:pwa-register";

export type PwaUpdateStatus =
  "checking" | "ready" | "offline-ready" | "update-available" | "error";

export interface PwaStatusSnapshot {
  updateStatus: PwaUpdateStatus;
  installed: boolean;
  message: string;
}

const listeners = new Set<() => void>();
let started = false;
let snapshot: PwaStatusSnapshot = {
  updateStatus: "checking",
  installed: false,
  message: "Checking the local app package…",
};

function isInstalled(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator &&
      (navigator as Navigator & { standalone?: boolean }).standalone === true)
  );
}

function publish(changes: Partial<PwaStatusSnapshot>): void {
  snapshot = {
    ...snapshot,
    ...changes,
    installed: isInstalled(),
  };
  for (const listener of listeners) listener();
}

export function startPwaLifecycle(): void {
  if (started) return;
  started = true;
  publish({
    updateStatus: "checking",
    message: "Checking the local app package…",
  });
  registerSW({
    immediate: true,
    onRegisteredSW: () => {
      publish({
        updateStatus: "ready",
        message: "App package is current.",
      });
    },
    onOfflineReady: () => {
      publish({
        updateStatus: "offline-ready",
        message: "Offline app package is ready.",
      });
    },
    onNeedRefresh: () => {
      publish({
        updateStatus: "update-available",
        message: "An update is installing automatically.",
      });
    },
    onRegisterError: () => {
      publish({
        updateStatus: "error",
        message: "App-package update check needs a reconnect.",
      });
    },
  });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): PwaStatusSnapshot {
  return snapshot;
}

const serverSnapshot: PwaStatusSnapshot = {
  updateStatus: "checking",
  installed: false,
  message: "Checking the local app package…",
};

export function usePwaStatus(): PwaStatusSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, () => serverSnapshot);
}
