import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import {
  createQctpRepository,
  migrateRev1LocalStorage,
  type DeleteRecordingSelection,
  type QctpRepository,
  type Rev1MigrationResult,
} from "../data";
import {
  normalizeBreathProfile,
  recoverInterruptedBreathSessions,
  type BreathProfile,
  type BreathSessionRecord,
  type StoredQuickBreathDirectorPreferences,
} from "../breath";
import {
  AppSettingsSchema,
  FoundationStateSchema,
  WorkbookStateSchema,
  type AppSettings,
  type FoundationState,
  type MirrorRequest,
  type ReminderPreferences,
  type WorkbookState,
} from "../domain";
import {
  createFoundationProgress,
  getFoundationDayComponents,
  markFoundationComponentComplete,
} from "../foundation";
import {
  clearLocalGatewaySession,
  LocalTranscriptionClient,
  pairLocalGatewaySession,
  type LocalTranscriptionPolicy,
} from "../transcription";
import {
  enqueueMirrorRequest,
  MirrorServiceClient,
  remoteMirrorDeletionTarget,
  synchronizeMirrorRequests,
  type MirrorServicePolicy,
} from "../mirror";
import { recoverInterruptedCaptures } from "../voice-capture/repository-persistence";
import type { StateCapabilityRecord, StateSessionRecord } from "../state-atlas";
import {
  deriveControlledSchedule,
  retainRecentReminderReceipts,
} from "../schedule";
import {
  SCHEDULE_NOTIFICATION_COPY,
  showBestEffortLocalNotification,
} from "../notifications";

import {
  QctpContext,
  type MirrorClientJob,
  type QctpRuntime,
} from "./qctp-context";

interface ReadyState {
  repository: QctpRepository;
  foundation: FoundationState;
  settings: AppSettings;
  workbook: WorkbookState;
  breathProfile: BreathProfile;
  breathSessions: BreathSessionRecord[];
  stateCapabilities: StateCapabilityRecord[];
  stateSessions: StateSessionRecord[];
  migration: Rev1MigrationResult;
}

const DEVICE_SESSION_AUTO_RESTORE_KEY =
  "qctp-device-session-auto-restore-disabled";

function emptyMigration(error?: unknown): Rev1MigrationResult {
  return {
    status: "no_source",
    fingerprint: null,
    ledgerId: null,
    importedEntityIds: [],
    warnings:
      error instanceof Error ? [`Migration held: ${error.message}`] : [],
  };
}

async function readMirrorJobs(
  repository: QctpRepository,
): Promise<MirrorClientJob[]> {
  const [requests, results] = await Promise.all([
    repository.listMirrorRequests(),
    repository.listMirrorResults(),
  ]);
  const resultByRequest = new Map(
    results.map((result) => [result.requestId, result]),
  );
  return requests.map((request) => {
    const result = resultByRequest.get(request.id);
    const status: MirrorClientJob["status"] = (() => {
      switch (request.status) {
        case "QUEUED_LOCAL":
          return "queued_local";
        case "SUBMITTING":
        case "QUEUED_PX13":
          return "submitted";
        case "PROCESSING":
          return "processing";
        case "RETRY_WAIT":
          return "retry_wait";
        case "COMPLETE":
          return "complete";
        case "FAILED":
          return "failed";
      }
    })();
    return {
      id: request.id,
      status,
      prompt: request.prompt,
      sourceRecordIds: request.sourceRecordIds,
      createdAt: request.createdAt,
      updatedAt: request.updatedAt,
      remoteJobId: request.remoteJobId,
      resultText: result?.text ?? null,
      resultCitations: result?.citations ?? [],
      resultId: result?.id ?? null,
      resultProviderType: result?.providerType ?? null,
      resultProvider: result?.provider ?? null,
      resultModel: result?.model ?? null,
      resultQuery: result?.query ?? null,
      resultSourceRecordIds: result?.sourceRecordIds ?? [],
      resultProposedQuestion: result?.proposedQuestion ?? null,
      resultProposedAction: result?.proposedAction ?? null,
      resultDisposition: result?.disposition ?? null,
      resultRevisionCount: result?.revisionHistory.length ?? 0,
      resultRevisionHistory: result?.revisionHistory ?? [],
      resultAnnotation: result?.annotation ?? null,
      lastError: request.lastError,
    };
  });
}

async function showMirrorCompletionNotification(
  completedCount: number,
): Promise<void> {
  await showBestEffortLocalNotification(
    "QCTP Local AI Mirror result ready",
    `${String(completedCount)} local PX13 result${completedCount === 1 ? "" : "s"} synchronized.`,
    "qctp-mirror-complete",
  );
}

export function QctpProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState<ReadyState | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const [deviceSessionActive, setDeviceSessionActive] = useState(false);
  const [px13BaseUrl, setPx13BaseUrl] = useState("");
  const [localTranscriptionStatus, setLocalTranscriptionStatus] =
    useState<QctpRuntime["localTranscriptionStatus"]>("not-configured");
  const [localTranscriptionMessage, setLocalTranscriptionMessage] = useState(
    "Recording and playback are ready. Local transcription has not been connected.",
  );
  const [localTranscriptionPolicy, setLocalTranscriptionPolicy] =
    useState<LocalTranscriptionPolicy | null>(null);
  const [mirrorConnectivity, setMirrorConnectivity] =
    useState<QctpRuntime["mirror"]["connectivity"]>("offline");
  const [mirrorPolicy, setMirrorPolicy] = useState<MirrorServicePolicy | null>(
    null,
  );
  const [mirrorJobs, setMirrorJobs] = useState<MirrorClientJob[]>([]);
  const transcriptionRunRef = useRef<Promise<{
    completed: string[];
    failed: string[];
  }> | null>(null);
  const mirrorRunRef = useRef<Promise<void> | null>(null);
  const mirrorConsecutiveFailuresRef = useRef(0);
  const sessionRestoreAttemptedRef = useRef(false);
  const providerActiveRef = useRef(true);
  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | "unsupported"
  >(() =>
    typeof Notification === "undefined"
      ? "unsupported"
      : Notification.permission,
  );

  useEffect(() => {
    providerActiveRef.current = true;
    return () => {
      providerActiveRef.current = false;
    };
  }, []);

  useEffect(() => {
    let disposed = false;
    let opened: QctpRepository | null = null;
    void (async () => {
      try {
        const repository = await createQctpRepository();
        opened = repository;
        await repository.initializeDefaults();
        await recoverInterruptedCaptures(repository);
        await recoverInterruptedBreathSessions(repository);
        let migration = emptyMigration();
        try {
          migration = await migrateRev1LocalStorage(repository);
        } catch (error) {
          migration = emptyMigration(error);
        }
        const [
          foundation,
          settings,
          workbook,
          breathProfile,
          breathSessions,
          stateCapabilities,
          stateSessions,
          initialMirrorJobs,
        ] = await Promise.all([
          repository.getFoundationState(),
          repository.getSettings(),
          repository.getWorkbookState(),
          repository.getBreathProfile("breath-profile"),
          repository.listBreathSessions(),
          repository.listStateCapabilities(),
          repository.listStateSessions(),
          readMirrorJobs(repository),
        ]);
        if (!foundation || !settings || !workbook || !breathProfile)
          throw new Error("Local defaults were not initialized.");
        if (disposed) {
          repository.close();
          return;
        }
        setMirrorJobs(initialMirrorJobs);
        setReady({
          repository,
          foundation,
          settings,
          workbook,
          breathProfile,
          breathSessions,
          stateCapabilities,
          stateSessions,
          migration,
        });
      } catch (error) {
        if (!disposed) {
          setBootError(
            error instanceof Error
              ? error.message
              : "Local storage could not be opened.",
          );
        }
      }
    })();
    return () => {
      disposed = true;
      opened?.close();
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!ready) return;
    const [
      foundation,
      settings,
      workbook,
      breathProfile,
      breathSessions,
      stateCapabilities,
      stateSessions,
      nextMirrorJobs,
    ] = await Promise.all([
      ready.repository.getFoundationState(),
      ready.repository.getSettings(),
      ready.repository.getWorkbookState(),
      ready.repository.getBreathProfile("breath-profile"),
      ready.repository.listBreathSessions(),
      ready.repository.listStateCapabilities(),
      ready.repository.listStateSessions(),
      readMirrorJobs(ready.repository),
    ]);
    if (!foundation || !settings || !workbook || !breathProfile)
      throw new Error("Local QCTP state is incomplete.");
    setReady((current) =>
      current
        ? {
            ...current,
            foundation,
            settings,
            workbook,
            breathProfile,
            breathSessions,
            stateCapabilities,
            stateSessions,
          }
        : current,
    );
    setMirrorJobs(nextMirrorJobs);
    setRevision((value) => value + 1);
  }, [ready]);

  const markFoundationComponent = useCallback(
    async (component: "morning" | "midday" | "evening") => {
      if (!ready) return;
      const current =
        (await ready.repository.getFoundationState()) ?? ready.foundation;
      const progress = createFoundationProgress(
        current.currentDay,
        Object.fromEntries(
          Object.entries(current.completion).map(([day, value]) => [
            Number(day),
            value,
          ]),
        ),
      );
      const nextProgress = markFoundationComponentComplete(
        progress,
        1,
        component,
      );
      const dayOne = getFoundationDayComponents(nextProgress, 1);
      const next = FoundationStateSchema.parse({
        ...current,
        currentDay: nextProgress.currentDay,
        completion: { ...current.completion, "1": dayOne },
        updatedAt: new Date().toISOString(),
      });
      await ready.repository.saveFoundationState(next);
      await refresh();
    },
    [ready, refresh],
  );

  const updateSettings = useCallback(
    async (changes: Partial<AppSettings>) => {
      if (!ready) return;
      const settings = AppSettingsSchema.parse({
        ...ready.settings,
        ...changes,
        schemaVersion: 1,
        id: "settings",
        updatedAt: new Date().toISOString(),
      });
      await ready.repository.saveSettings(settings);
      await refresh();
    },
    [ready, refresh],
  );

  const updateReminderPreferences = useCallback(
    async (changes: Partial<ReminderPreferences>) => {
      if (!ready) return;
      const settings = await ready.repository.updateReminderPreferences(
        (current) => ({ ...current, ...changes }),
      );
      setReady((current) => (current ? { ...current, settings } : current));
      setRevision((value) => value + 1);
    },
    [ready],
  );

  const updateWorkbookAnswer = useCallback(
    async (day: number, promptId: string, value: string) => {
      if (!ready) return;
      const current =
        (await ready.repository.getWorkbookState()) ?? ready.workbook;
      const workbook = WorkbookStateSchema.parse({
        ...current,
        answers: {
          ...current.answers,
          [String(day)]: {
            ...(current.answers[String(day)] ?? {}),
            [promptId]: value,
          },
        },
        updatedAt: new Date().toISOString(),
      });
      await ready.repository.saveWorkbookState(workbook);
      await refresh();
    },
    [ready, refresh],
  );

  const updateQuickBreathPreferences = useCallback(
    async (preferences: StoredQuickBreathDirectorPreferences) => {
      if (!ready) return;
      const profile = normalizeBreathProfile({
        ...ready.breathProfile,
        comfortableMethodIds: preferences.director.comfortableMethodIds,
        quickDirector: preferences,
        updatedAt: new Date().toISOString(),
      });
      await ready.repository.saveBreathProfile(profile);
      await refresh();
    },
    [ready, refresh],
  );

  const saveBreathSession = useCallback(
    async (session: BreathSessionRecord) => {
      if (!ready) return;
      await ready.repository.saveBreathSession(session);
      await refresh();
    },
    [ready, refresh],
  );

  const saveStateSession = useCallback(
    async (session: StateSessionRecord) => {
      if (!ready) return;
      await ready.repository.saveStateSession(session);
      await refresh();
    },
    [ready, refresh],
  );

  const saveStateCapability = useCallback(
    async (capability: StateCapabilityRecord) => {
      if (!ready) return;
      await ready.repository.saveStateCapability(capability);
      await refresh();
    },
    [ready, refresh],
  );

  const configureLocalTranscription = useCallback(
    async (accessToken: string, baseUrl = "") => {
      setLocalTranscriptionStatus("checking");
      setLocalTranscriptionMessage(
        "Checking the loopback-only transcription service…",
      );
      try {
        await pairLocalGatewaySession(accessToken, baseUrl);
        const client = new LocalTranscriptionClient({ baseUrl });
        const policy = await client.getPolicy();
        if (policy.mode !== "free-local" || policy.paidCloudEnabled) {
          throw new Error("The service did not attest to Free Local Mode.");
        }
        setDeviceSessionActive(true);
        localStorage.removeItem(DEVICE_SESSION_AUTO_RESTORE_KEY);
        setPx13BaseUrl(baseUrl);
        setLocalTranscriptionPolicy(policy);
        setLocalTranscriptionStatus("ready");
        setLocalTranscriptionMessage(
          `Connected to ${policy.provider}; paid cloud is disabled.`,
        );
      } catch (error) {
        setDeviceSessionActive(false);
        setLocalTranscriptionPolicy(null);
        setLocalTranscriptionStatus("unavailable");
        setLocalTranscriptionMessage(
          error instanceof Error
            ? error.message
            : "The local service is unavailable.",
        );
        throw error;
      }
    },
    [],
  );

  const clearLocalTranscription = useCallback(async () => {
    try {
      await clearLocalGatewaySession(px13BaseUrl);
    } catch {
      // The non-secret local opt-out below still prevents automatic reuse when
      // the PX13 is offline and therefore cannot clear its HttpOnly cookie.
    }
    localStorage.setItem(DEVICE_SESSION_AUTO_RESTORE_KEY, "true");
    setDeviceSessionActive(false);
    setPx13BaseUrl("");
    setLocalTranscriptionPolicy(null);
    setLocalTranscriptionStatus("not-configured");
    setLocalTranscriptionMessage(
      "Local transcription disconnected. Recording and playback remain available.",
    );
    setMirrorConnectivity("offline");
    setMirrorPolicy(null);
  }, [px13BaseUrl]);

  useEffect(() => {
    if (!ready || sessionRestoreAttemptedRef.current) return;
    sessionRestoreAttemptedRef.current = true;
    if (localStorage.getItem(DEVICE_SESSION_AUTO_RESTORE_KEY) === "true") {
      return;
    }
    void (async () => {
      setLocalTranscriptionStatus("checking");
      setLocalTranscriptionMessage(
        "Restoring the private PX13 device session…",
      );
      try {
        const policy = await new LocalTranscriptionClient({}).getPolicy();
        if (policy.mode !== "free-local" || policy.paidCloudEnabled) {
          throw new Error("The service did not attest to Free Local Mode.");
        }
        setDeviceSessionActive(true);
        setLocalTranscriptionPolicy(policy);
        setLocalTranscriptionStatus("ready");
        setLocalTranscriptionMessage(
          `Restored the private ${policy.provider} device session; paid cloud is disabled.`,
        );
      } catch {
        setDeviceSessionActive(false);
        setLocalTranscriptionPolicy(null);
        setLocalTranscriptionStatus("not-configured");
        setLocalTranscriptionMessage(
          "Recording and playback are ready. Pair this device once to synchronize with the PX13.",
        );
      }
    })();
  }, [ready]);

  const processTranscriptionQueue = useCallback(() => {
    if (!ready || !deviceSessionActive) {
      return Promise.reject(
        new Error("Connect the no-cost local transcription service first."),
      );
    }
    if (transcriptionRunRef.current) return transcriptionRunRef.current;
    const execution = (async () => {
      const result = await new LocalTranscriptionClient({
        baseUrl: px13BaseUrl,
      }).processQueue(ready.repository);
      if (result.completed.length > 0 || result.failed.length > 0) {
        await refresh();
      }
      return result;
    })();
    const tracked = execution.finally(() => {
      if (transcriptionRunRef.current === tracked) {
        transcriptionRunRef.current = null;
      }
    });
    transcriptionRunRef.current = tracked;
    return tracked;
  }, [deviceSessionActive, px13BaseUrl, ready, refresh]);

  useEffect(() => {
    if (!ready || !deviceSessionActive) return;
    const synchronize = () => {
      void processTranscriptionQueue().catch(() => undefined);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") synchronize();
    };
    window.addEventListener("online", synchronize);
    document.addEventListener("visibilitychange", onVisibility);
    const interval = window.setInterval(synchronize, 30_000);
    synchronize();
    return () => {
      window.removeEventListener("online", synchronize);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(interval);
    };
  }, [deviceSessionActive, processTranscriptionQueue, ready]);

  const deleteVoiceRecording = useCallback(
    async (recordingId: string, selection: DeleteRecordingSelection = {}) => {
      if (!ready) throw new Error("The local QCTP database is still opening.");
      const recording = await ready.repository.getRecording(recordingId);
      if (!recording) throw new Error("The local recording was not found.");
      const removesAudio = selection.audio ?? true;
      const removesMetadata = selection.metadata ?? true;
      let remote: "deleted" | "not_found" | null = null;
      if (recording.remoteObjectRef && (removesAudio || removesMetadata)) {
        if (!deviceSessionActive) {
          throw new Error(
            "Reconnect the PX13 gateway before deleting a recording with a remote artifact.",
          );
        }
        const status = await new LocalTranscriptionClient({
          baseUrl: px13BaseUrl,
        }).deleteRemoteRecording(recordingId);
        if (status === "not_configured") {
          throw new Error(
            "The gateway could not verify remote cleanup; the local recording was preserved.",
          );
        }
        remote = status;
      }
      const local = await ready.repository.deleteRecording(
        recordingId,
        selection,
      );
      await refresh();
      return { local, remote };
    },
    [deviceSessionActive, px13BaseUrl, ready, refresh],
  );

  const refreshMirror = useCallback(async () => {
    if (!ready || !providerActiveRef.current) return;
    try {
      const jobs = await readMirrorJobs(ready.repository);
      if (providerActiveRef.current) setMirrorJobs(jobs);
    } catch (error) {
      if (providerActiveRef.current) throw error;
    }
  }, [ready]);

  const connectMirror = useCallback(() => {
    if (mirrorRunRef.current) return mirrorRunRef.current;
    const execution = (async () => {
      if (!ready || !deviceSessionActive) {
        setMirrorConnectivity("offline");
        setMirrorPolicy(null);
        await refreshMirror();
        return;
      }
      setMirrorConnectivity((current) =>
        current === "online" ? current : "checking",
      );
      try {
        const client = new MirrorServiceClient({ baseUrl: px13BaseUrl });
        const policy = await client.probe();
        mirrorConsecutiveFailuresRef.current = 0;
        setMirrorPolicy(policy);
        setMirrorConnectivity("online");
        const result = await synchronizeMirrorRequests(
          ready.repository,
          client,
        );
        await refreshMirror();
        await showMirrorCompletionNotification(
          result.completedRequestIds.length,
        );
      } catch {
        mirrorConsecutiveFailuresRef.current += 1;
        if (mirrorConsecutiveFailuresRef.current >= 3) {
          setMirrorPolicy(null);
        }
        setMirrorConnectivity((current) => {
          if (
            current === "online" &&
            mirrorConsecutiveFailuresRef.current < 3
          ) {
            return current;
          }
          return "offline";
        });
        await refreshMirror();
      }
    })();
    const tracked = execution.finally(() => {
      if (mirrorRunRef.current === tracked) mirrorRunRef.current = null;
    });
    mirrorRunRef.current = tracked;
    return tracked;
  }, [deviceSessionActive, px13BaseUrl, ready, refreshMirror]);

  const enqueueMirror = useCallback(
    async (input: { prompt: string; sourceRecordIds: string[] }) => {
      if (!ready)
        throw new Error("The local Mirror data store is still opening.");
      const request = await enqueueMirrorRequest(ready.repository, input);
      await refreshMirror();
      void connectMirror();
      return request.id;
    },
    [connectMirror, ready, refreshMirror],
  );

  const retryMirror = useCallback(
    async (jobId: string) => {
      if (!ready) return;
      const request = await ready.repository.getMirrorRequest(jobId);
      if (!request)
        throw new Error("The Local AI Mirror request was not found.");
      await ready.repository.saveMirrorRequest({
        ...request,
        status: request.remoteJobId ? "SUBMITTING" : "QUEUED_LOCAL",
        nextAttemptAt: null,
        lastError: null,
        updatedAt: new Date().toISOString(),
      });
      await refreshMirror();
      void connectMirror();
    },
    [connectMirror, ready, refreshMirror],
  );

  const verifyMirrorRemoteDeletion = useCallback(
    async (request: MirrorRequest, claimedRemoteJobId: string | null) => {
      if (claimedRemoteJobId !== request.remoteJobId) {
        throw new Error(
          "The Local AI Mirror deletion target changed; local data was preserved.",
        );
      }
      const target = remoteMirrorDeletionTarget(request);
      if (target.kind === "none") return;
      if (!deviceSessionActive) {
        throw new Error(
          "Reconnect the PX13 Local AI companion before deleting this submitted request. Local data was preserved.",
        );
      }
      const client = new MirrorServiceClient({ baseUrl: px13BaseUrl });
      if (target.kind === "job_id") {
        await client.deleteJob(target.id);
      } else {
        // A POST response can be lost after PX13 durably creates the job.
        // Stable request-id cleanup closes that orphan window.
        await client.deleteJobByRequestId(target.id);
      }
    },
    [deviceSessionActive, px13BaseUrl],
  );

  const deleteMirrorReflection = useCallback(
    async (input: {
      requestId: string;
      resultId: string;
      remoteJobId: string | null;
    }) => {
      if (!ready) throw new Error("The local QCTP database is still opening.");
      const [request, result] = await Promise.all([
        ready.repository.getMirrorRequest(input.requestId),
        ready.repository.getMirrorResult(input.resultId),
      ]);
      if (!request || !result || result.requestId !== request.id) {
        throw new Error("The Local AI Mirror reflection was not found.");
      }
      if (request.remoteJobId !== result.remoteJobId) {
        throw new Error(
          "The Local AI Mirror deletion target changed; local data was preserved.",
        );
      }
      await verifyMirrorRemoteDeletion(request, input.remoteJobId);
      await ready.repository.deleteMirrorReflection(request.id, result.id);
      await refreshMirror();
    },
    [ready, refreshMirror, verifyMirrorRemoteDeletion],
  );

  const deleteMirrorRequest = useCallback(
    async (input: { requestId: string; remoteJobId: string | null }) => {
      if (!ready) throw new Error("The local QCTP database is still opening.");
      const request = await ready.repository.getMirrorRequest(input.requestId);
      if (!request) {
        throw new Error("The Local AI Mirror request was not found.");
      }
      await verifyMirrorRemoteDeletion(request, input.remoteJobId);
      await ready.repository.deleteMirrorRequest(request.id);
      await refreshMirror();
    },
    [ready, refreshMirror, verifyMirrorRemoteDeletion],
  );

  const restoreMirrorRequest = useCallback(
    async (requestId: string) => {
      if (!ready) throw new Error("The local QCTP database is still opening.");
      await ready.repository.restoreMirrorRequest(requestId);
      await refreshMirror();
    },
    [ready, refreshMirror],
  );

  const restoreMirrorReflection = useCallback(
    async (input: { requestId: string; resultId: string }) => {
      if (!ready) throw new Error("The local QCTP database is still opening.");
      await ready.repository.restoreMirrorReflection(
        input.requestId,
        input.resultId,
      );
      await refreshMirror();
    },
    [ready, refreshMirror],
  );

  const purgeMirrorRequest = useCallback(
    async (input: { requestId: string; remoteJobId: string | null }) => {
      if (!ready) throw new Error("The local QCTP database is still opening.");
      const request = await ready.repository.getMirrorRequest(input.requestId, {
        includeDeleted: true,
      });
      if (!request || request.deletedAt === null) {
        throw new Error("The deleted Local AI Mirror request was not found.");
      }
      await verifyMirrorRemoteDeletion(request, input.remoteJobId);
      await ready.repository.purgeMirrorRequest(request.id);
      await refreshMirror();
    },
    [ready, refreshMirror, verifyMirrorRemoteDeletion],
  );

  const purgeMirrorReflection = useCallback(
    async (input: {
      requestId: string;
      resultId: string;
      remoteJobId: string | null;
    }) => {
      if (!ready) throw new Error("The local QCTP database is still opening.");
      const [request, result] = await Promise.all([
        ready.repository.getMirrorRequest(input.requestId, {
          includeDeleted: true,
        }),
        ready.repository.getMirrorResult(input.resultId, {
          includeDeleted: true,
        }),
      ]);
      if (
        !request ||
        !result ||
        request.deletedAt === null ||
        result.deletedAt === null ||
        result.requestId !== request.id ||
        result.remoteJobId !== request.remoteJobId
      ) {
        throw new Error(
          "The deleted Local AI Mirror reflection pair was not found.",
        );
      }
      await verifyMirrorRemoteDeletion(request, input.remoteJobId);
      await ready.repository.purgeMirrorReflection(request.id, result.id);
      await refreshMirror();
    },
    [ready, refreshMirror, verifyMirrorRemoteDeletion],
  );

  const requestMirrorNotifications = useCallback(async () => {
    if (typeof Notification === "undefined") {
      setNotificationPermission("unsupported");
      return;
    }
    setNotificationPermission(await Notification.requestPermission());
  }, []);

  useEffect(() => {
    const synchronizePermission = () => {
      setNotificationPermission(
        typeof Notification === "undefined"
          ? "unsupported"
          : Notification.permission,
      );
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") synchronizePermission();
    };
    window.addEventListener("pageshow", synchronizePermission);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pageshow", synchronizePermission);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  useEffect(() => {
    if (!ready) return;
    let disposed = false;
    let running = false;
    const checkSchedule = async () => {
      if (running || disposed) return;
      running = true;
      try {
        const [foundation, settings] = await Promise.all([
          ready.repository.getFoundationState(),
          ready.repository.getSettings(),
        ]);
        if (!foundation || !settings) return;
        const snapshot = deriveControlledSchedule({
          now: new Date(),
          foundationDay: foundation.currentDay,
          completion: foundation.completion["1"] ?? {
            morning: false,
            midday: false,
            evening: false,
          },
          reminders: settings.reminderPreferences,
        });
        const observedAt = new Date().toISOString();
        let nextReminders = {
          ...settings.reminderPreferences,
          highestObservedProgramDate: snapshot.programDate,
        };
        for (const assignment of snapshot.assignments) {
          const scheduledLocalTime = assignment.scheduledLocalTime;
          if (
            assignment.status !== "ready" ||
            !assignment.reminderKey ||
            !scheduledLocalTime
          )
            continue;
          const existing = nextReminders.receipts.find(
            (receipt) => receipt.id === assignment.reminderKey,
          );
          if (existing) continue;
          nextReminders = {
            ...nextReminders,
            receipts: retainRecentReminderReceipts(nextReminders.receipts, {
              id: assignment.reminderKey,
              assignmentId: assignment.id,
              programDate: snapshot.programDate,
              scheduledLocalTime,
              firstSeenAt: observedAt,
              notificationAttemptedAt: null,
              outcome:
                notificationPermission === "denied" ||
                notificationPermission === "unsupported"
                  ? "IN_APP_FALLBACK"
                  : "DUE_VISIBLE",
            }),
          };
        }
        const candidate = snapshot.notificationCandidates[0];
        let notificationAt = settings.reminderPreferences.lastNotificationAt;
        if (
          candidate?.reminderKey &&
          notificationPermission === "granted" &&
          settings.reminderPreferences.deviceNotificationsEnabled
        ) {
          const delivered = await showBestEffortLocalNotification(
            SCHEDULE_NOTIFICATION_COPY.title,
            SCHEDULE_NOTIFICATION_COPY.body,
            `qctp-schedule-${candidate.id}`,
          );
          if (disposed) return;
          notificationAt = delivered
            ? new Date().toISOString()
            : notificationAt;
          const receipt = nextReminders.receipts.find(
            (item) => item.id === candidate.reminderKey,
          );
          if (receipt) {
            nextReminders = {
              ...nextReminders,
              receipts: retainRecentReminderReceipts(nextReminders.receipts, {
                ...receipt,
                notificationAttemptedAt: observedAt,
                outcome: delivered ? "DEVICE_NOTIFIED" : "IN_APP_FALLBACK",
              }),
            };
          }
        }
        nextReminders = {
          ...nextReminders,
          lastNotificationAt: notificationAt,
        };
        if (
          JSON.stringify(nextReminders) ===
          JSON.stringify(settings.reminderPreferences)
        )
          return;
        const next = await ready.repository.updateReminderPreferences(
          (current) => {
            let receipts = current.receipts;
            for (const receipt of nextReminders.receipts) {
              receipts = retainRecentReminderReceipts(receipts, receipt);
            }
            return {
              ...current,
              highestObservedProgramDate:
                current.highestObservedProgramDate &&
                current.highestObservedProgramDate > snapshot.programDate
                  ? current.highestObservedProgramDate
                  : snapshot.programDate,
              receipts,
              lastNotificationAt: notificationAt ?? current.lastNotificationAt,
            };
          },
          observedAt,
        );
        if (disposed) return;
        setReady((current) =>
          current ? { ...current, settings: next } : current,
        );
        setRevision((value) => value + 1);
      } catch {
        // Reconciliation is additive. A closing database or unavailable
        // notification surface must never block the local-first application.
      } finally {
        running = false;
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") void checkSchedule();
    };
    void checkSchedule();
    const interval = window.setInterval(() => void checkSchedule(), 30_000);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      disposed = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [notificationPermission, ready]);

  useEffect(() => {
    if (!ready || !deviceSessionActive) return;
    const synchronize = () => void connectMirror();
    const onVisibility = () => {
      if (document.visibilityState === "visible") synchronize();
    };
    window.addEventListener("online", synchronize);
    document.addEventListener("visibilitychange", onVisibility);
    const interval = window.setInterval(synchronize, 10_000);
    synchronize();
    return () => {
      window.removeEventListener("online", synchronize);
      document.removeEventListener("visibilitychange", onVisibility);
      window.clearInterval(interval);
    };
  }, [connectMirror, deviceSessionActive, ready]);

  const mirror = useMemo<QctpRuntime["mirror"]>(
    () => ({
      connectivity: mirrorConnectivity,
      coreStatus: "ready",
      policy: mirrorPolicy,
      jobs: mirrorJobs,
      notificationPermission,
      refresh: refreshMirror,
      connect: connectMirror,
      enqueue: enqueueMirror,
      retry: retryMirror,
      deleteRequest: deleteMirrorRequest,
      deleteReflection: deleteMirrorReflection,
      restoreRequest: restoreMirrorRequest,
      restoreReflection: restoreMirrorReflection,
      purgeRequest: purgeMirrorRequest,
      purgeReflection: purgeMirrorReflection,
      requestNotifications: requestMirrorNotifications,
    }),
    [
      connectMirror,
      deleteMirrorReflection,
      deleteMirrorRequest,
      enqueueMirror,
      mirrorConnectivity,
      mirrorJobs,
      mirrorPolicy,
      notificationPermission,
      purgeMirrorReflection,
      purgeMirrorRequest,
      refreshMirror,
      requestMirrorNotifications,
      restoreMirrorReflection,
      restoreMirrorRequest,
      retryMirror,
    ],
  );

  const notifications = useMemo<QctpRuntime["notifications"]>(
    () => ({
      permission: notificationPermission,
      deliveryMode: "BEST_EFFORT_WHILE_APP_ACTIVE_WITH_DURABLE_IN_APP_FALLBACK",
      requestPermission: requestMirrorNotifications,
    }),
    [notificationPermission, requestMirrorNotifications],
  );

  const runtime = useMemo<QctpRuntime | null>(
    () =>
      ready
        ? {
            ...ready,
            revision,
            localTranscriptionStatus,
            localTranscriptionMessage,
            localTranscriptionPolicy,
            notifications,
            mirror,
            refresh,
            markFoundationComponent,
            updateSettings,
            updateReminderPreferences,
            updateWorkbookAnswer,
            updateQuickBreathPreferences,
            saveBreathSession,
            saveStateSession,
            saveStateCapability,
            configureLocalTranscription,
            clearLocalTranscription,
            processTranscriptionQueue,
            deleteVoiceRecording,
          }
        : null,
    [
      clearLocalTranscription,
      configureLocalTranscription,
      localTranscriptionMessage,
      localTranscriptionPolicy,
      localTranscriptionStatus,
      markFoundationComponent,
      mirror,
      notifications,
      processTranscriptionQueue,
      deleteVoiceRecording,
      ready,
      refresh,
      revision,
      saveBreathSession,
      saveStateSession,
      saveStateCapability,
      updateSettings,
      updateReminderPreferences,
      updateQuickBreathPreferences,
      updateWorkbookAnswer,
    ],
  );

  if (bootError) {
    return (
      <main className="boot-screen" role="alert">
        <p className="eyebrow">Local-first startup held</p>
        <h1>QCTP could not open its device database.</h1>
        <p>{bootError}</p>
        <p>
          No legacy data was deleted. Reload after checking private-browsing or
          storage permissions.
        </p>
      </main>
    );
  }
  // The runtime intentionally contains callbacks that consult concurrency refs
  // only when invoked; checking the memoized context object here does not read
  // those refs during render.
  // eslint-disable-next-line react-hooks/refs
  if (!runtime) {
    return (
      <main className="boot-screen" aria-live="polite">
        <p className="eyebrow">Free Local Mode</p>
        <h1>Opening QCTP on this device…</h1>
        <p>Preparing IndexedDB and checking for preserved Rev1 data.</p>
      </main>
    );
  }
  return (
    <QctpContext.Provider value={runtime}>{children}</QctpContext.Provider>
  );
}
