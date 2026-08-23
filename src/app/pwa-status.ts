import { useSyncExternalStore } from "react";
import { registerSW } from "virtual:pwa-register";

import {
  getPwaUpdateActivationSafety,
  runWithPwaUpdateActivationLock,
} from "./pwa-update-safety";

export type PwaUpdateStatus =
  | "checking"
  | "ready"
  | "offline-ready"
  | "update-available"
  | "update-retry"
  | "applying-update"
  | "error";

export interface PwaStatusSnapshot {
  updateStatus: PwaUpdateStatus;
  installed: boolean;
  message: string;
  candidateSha: string | null;
}

const listeners = new Set<() => void>();
const UPDATE_ACTIVATION_TIMEOUT_MS = 15_000;
const UPDATE_ACTIVATION_POLL_MS = 25;
const UPDATE_ACTIVATION_REQUEST_TIMEOUT_MS = 5_000;
const ACTIVATE_WAITING_CANDIDATE = "QCTP_ACTIVATE_WAITING_CANDIDATE";
const ACTIVATION_ACCEPTED = "QCTP_ACTIVATION_ACCEPTED";
let started = false;
let serviceWorkerRegistration: ServiceWorkerRegistration | null = null;
let reloadRequested = false;

function readCandidateSha(): string | null {
  if (typeof document === "undefined") return null;
  const metaValue = document
    .querySelector<HTMLMetaElement>('meta[name="qctp-candidate-sha"]')
    ?.content.trim()
    .toLowerCase();
  const compiledValue = __QCTP_BUILD_CANDIDATE_SHA__.trim().toLowerCase();
  if (!/^[0-9a-f]{40}$/u.test(compiledValue)) return null;
  return metaValue === compiledValue ? compiledValue : null;
}

let snapshot: PwaStatusSnapshot = {
  updateStatus: "checking",
  installed: false,
  message: "Checking the local app package…",
  candidateSha: readCandidateSha(),
};

function isInstalled(): boolean {
  if (typeof window === "undefined") return false;
  return (
    (typeof window.matchMedia === "function" &&
      window.matchMedia("(display-mode: standalone)").matches) ||
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

async function getServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (serviceWorkerRegistration !== null) return serviceWorkerRegistration;
  if (!("serviceWorker" in navigator)) return null;
  serviceWorkerRegistration =
    (await navigator.serviceWorker.getRegistration()) ?? null;
  return serviceWorkerRegistration;
}

async function waitForActivatedReplacement(
  registration: ServiceWorkerRegistration,
  replacement: ServiceWorker,
  previousActive: ServiceWorker | null,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const startedAt = Date.now();
    let pollHandle: number | null = null;

    const cleanup = () => {
      replacement.removeEventListener("statechange", inspect);
      if (pollHandle !== null) window.clearTimeout(pollHandle);
    };
    const inspect = () => {
      if (
        replacement.state === "activated" &&
        registration.active === replacement &&
        registration.active !== previousActive &&
        registration.waiting !== replacement
      ) {
        cleanup();
        resolve();
        return;
      }
      if (Date.now() - startedAt >= UPDATE_ACTIVATION_TIMEOUT_MS) {
        cleanup();
        reject(new Error("The ready app package did not activate in time."));
        return;
      }
      pollHandle = window.setTimeout(inspect, UPDATE_ACTIVATION_POLL_MS);
    };

    replacement.addEventListener("statechange", inspect);
    inspect();
  });
}

async function requestWaitingCandidateActivation(
  replacement: ServiceWorker,
  currentCandidateSha: string | null,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const channel = new MessageChannel();
    const timeoutHandle = window.setTimeout(() => {
      channel.port1.close();
      reject(new Error("The ready app package did not accept activation."));
    }, UPDATE_ACTIVATION_REQUEST_TIMEOUT_MS);
    const rejectRequest = (message: string) => {
      window.clearTimeout(timeoutHandle);
      channel.port1.close();
      reject(new Error(message));
    };
    channel.port1.onmessage = (event: MessageEvent<unknown>) => {
      if (typeof event.data !== "object" || event.data === null) {
        rejectRequest("The ready app package returned an invalid response.");
        return;
      }
      const response = event.data as {
        readonly type?: unknown;
        readonly candidateSha?: unknown;
      };
      const candidateSha = response.candidateSha;
      if (
        response.type !== ACTIVATION_ACCEPTED ||
        typeof candidateSha !== "string" ||
        !/^[0-9a-f]{40}$/u.test(candidateSha) ||
        candidateSha === currentCandidateSha
      ) {
        rejectRequest(
          "The ready app package identity did not pass activation checks.",
        );
        return;
      }
      window.clearTimeout(timeoutHandle);
      channel.port1.close();
      resolve();
    };
    channel.port1.onmessageerror = () => {
      rejectRequest("The ready app package response could not be read.");
    };
    channel.port1.start();
    replacement.postMessage({ type: ACTIVATE_WAITING_CANDIDATE }, [
      channel.port2,
    ]);
  });
}

function reloadForActivatedUpdate(): void {
  if (reloadRequested) return;
  reloadRequested = true;
  publish({
    updateStatus: "applying-update",
    message: "Opening the verified update…",
  });
  window.location.reload();
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
    onRegisteredSW: (_swUrl, registration) => {
      serviceWorkerRegistration = registration ?? null;
      if (
        snapshot.updateStatus === "update-available" ||
        snapshot.updateStatus === "update-retry" ||
        snapshot.updateStatus === "applying-update"
      ) {
        return;
      }
      publish({
        updateStatus: "ready",
        message:
          "App package registered. Exact identity is shown when available.",
      });
    },
    onOfflineReady: () => {
      if (
        snapshot.updateStatus === "update-available" ||
        snapshot.updateStatus === "update-retry" ||
        snapshot.updateStatus === "applying-update"
      ) {
        return;
      }
      publish({
        updateStatus: "offline-ready",
        message: "Offline app package is ready.",
      });
    },
    onNeedRefresh: () => {
      publish({
        updateStatus: "update-available",
        message:
          "An update is ready. Apply it here when no practice is running.",
      });
    },
    onNeedReload: () => {
      if (getPwaUpdateActivationSafety().blocked) {
        publish({
          updateStatus: "error",
          message:
            "A newer app package is active, but this window kept critical work open. Finish or save it, then close and reopen QCTP.",
        });
        return;
      }
      reloadForActivatedUpdate();
    },
    onRegisterError: () => {
      publish({
        updateStatus: "error",
        message: "App-package update check needs a reconnect.",
      });
    },
  });
}

export async function applyPwaUpdate(): Promise<boolean> {
  if (
    snapshot.updateStatus !== "update-available" &&
    snapshot.updateStatus !== "update-retry"
  ) {
    return false;
  }
  const lockResult = await runWithPwaUpdateActivationLock(async () => {
    const safety = getPwaUpdateActivationSafety();
    if (safety.blocked) {
      const location =
        safety.reason === "other-tab-critical-activity"
          ? "another open QCTP window"
          : safety.reason === "coordination-unavailable"
            ? "an unverified open QCTP window"
            : "this QCTP window";
      publish({
        updateStatus: "update-available",
        message: `The update is waiting safely while ${location} finishes active work.`,
      });
      return false;
    }
    publish({
      updateStatus: "applying-update",
      message: "Installing the ready update without clearing local data…",
    });
    try {
      const registration = await getServiceWorkerRegistration();
      const replacement = registration?.waiting ?? null;
      const previousActive = registration?.active ?? null;
      if (registration === null || replacement === null) {
        throw new Error("The ready app package registration is unavailable.");
      }
      if (getPwaUpdateActivationSafety().blocked) {
        publish({
          updateStatus: "update-available",
          message:
            "The update is waiting safely while newly started critical work finishes.",
        });
        return false;
      }
      await requestWaitingCandidateActivation(
        replacement,
        snapshot.candidateSha,
      );
      await waitForActivatedReplacement(
        registration,
        replacement,
        previousActive,
      );
      reloadForActivatedUpdate();
      return true;
    } catch {
      const registration = await getServiceWorkerRegistration().catch(
        () => null,
      );
      const stillWaiting =
        registration !== null && registration.waiting !== null;
      publish({
        updateStatus: stillWaiting ? "update-retry" : "error",
        message: stillWaiting
          ? "The update is still ready. Finish active work, then retry; this package and local data remain available."
          : "The update could not be applied. This app package and local data remain available; close and reopen QCTP before retrying.",
      });
      return false;
    }
  });
  if (!lockResult.acquired) {
    publish({
      updateStatus: "update-available",
      message:
        "The update is waiting safely while another QCTP window has active or unverified critical work.",
    });
    return false;
  }
  return lockResult.result;
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
  candidateSha: null,
};

export function usePwaStatus(): PwaStatusSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, () => serverSnapshot);
}
