import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  getHeartMathBreathRail,
  getVoiceFreeDay1Phase,
  getVoiceFreeSupportUrl,
  isVoiceFreeSupportCached,
  VOICE_FREE_DAY1_DURATION_SECONDS,
  VOICE_FREE_DAY1_TEST_DURATION_SECONDS,
  type VoiceFreeSupportMode,
} from "./voice-free-day1";

export type VoiceFreeSessionStatus =
  | "idle"
  | "starting"
  | "running"
  | "paused"
  | "ended"
  | "recording_issue"
  | "saving"
  | "save_pending"
  | "completed"
  | "error";

export interface VoiceFreeNaturalCompletion {
  readonly id: string;
  readonly startedAt: string;
  readonly endedAt: string;
  readonly elapsedMs: number;
  readonly supportMode: VoiceFreeSupportMode;
}

export interface VoiceFreeAttemptIssue {
  readonly code:
    | "EARLY_USER_END"
    | "AUDIO_DURATION_INVALID"
    | "AUDIO_LOAD_FAILED"
    | "AUDIO_START_BLOCKED"
    | "AUDIO_RESUME_BLOCKED"
    | "AUDIO_ENDED_EARLY";
  readonly message: string;
  readonly occurredAt: string;
  readonly elapsedMs: number;
  readonly supportMode: VoiceFreeSupportMode;
  readonly completionCreditGranted: false;
  readonly stateCapabilityCreditGranted: false;
}

export interface VoiceFreeDay1SessionController {
  readonly status: VoiceFreeSessionStatus;
  readonly readiness: "loading" | "ready" | "error";
  readonly offlinePackageReady: boolean;
  readonly issue: string | null;
  readonly supportMode: VoiceFreeSupportMode;
  readonly elapsedSeconds: number;
  readonly remainingSeconds: number;
  readonly progress: number;
  readonly phase: ReturnType<typeof getVoiceFreeDay1Phase>;
  readonly breathRail: ReturnType<typeof getHeartMathBreathRail>;
  readonly testMode: boolean;
  readonly setSupportMode: (mode: VoiceFreeSupportMode) => void;
  readonly start: () => void;
  readonly pause: () => void;
  readonly resume: () => void;
  readonly end: () => void;
  readonly retrySave: () => void;
}

export interface UseVoiceFreeDay1SessionOptions {
  readonly testMode?: boolean;
  readonly keepAwake?: boolean;
  readonly onNaturalComplete?: (
    completion: VoiceFreeNaturalCompletion,
  ) => Promise<void> | void;
  readonly onAttemptIssue?: (
    issue: VoiceFreeAttemptIssue,
  ) => Promise<void> | void;
}

function createSessionId(): string {
  const random =
    globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  return `practice-voice-free-day1-${random}`;
}

export function useVoiceFreeDay1Session(
  options: UseVoiceFreeDay1SessionOptions = {},
): VoiceFreeDay1SessionController {
  const testMode = options.testMode === true;
  const keepAwake = options.keepAwake !== false;
  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const [status, setStatus] = useState<VoiceFreeSessionStatus>("idle");
  const [readiness, setReadiness] = useState<"loading" | "ready" | "error">(
    typeof Audio === "undefined" ? "error" : "loading",
  );
  const [issue, setIssue] = useState<string | null>(
    typeof Audio === "undefined"
      ? "This browser cannot create the required local audio player."
      : null,
  );
  const [offlinePackageReady, setOfflinePackageReady] = useState(false);
  const [supportMode, setSupportModeState] =
    useState<VoiceFreeSupportMode>("ambient");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const startedAtRef = useRef<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const endingRef = useRef<"user" | "test" | null>(null);
  const completionSentRef = useRef(false);
  const pendingCompletionRef = useRef<VoiceFreeNaturalCompletion | null>(null);
  const completionCallbackRef = useRef(options.onNaturalComplete);
  const issueCallbackRef = useRef(options.onAttemptIssue);
  const reportedIssueRef = useRef<string | null>(null);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    completionCallbackRef.current = options.onNaturalComplete;
  }, [options.onNaturalComplete]);

  useEffect(() => {
    issueCallbackRef.current = options.onAttemptIssue;
  }, [options.onAttemptIssue]);

  const releaseWakeLock = useCallback(async () => {
    const current = wakeLockRef.current;
    wakeLockRef.current = null;
    if (current) await current.release().catch(() => undefined);
  }, []);

  const requestWakeLock = useCallback(async () => {
    if (!keepAwake || document.visibilityState !== "visible") return;
    const wakeLock = "wakeLock" in navigator ? navigator.wakeLock : undefined;
    if (!wakeLock) return;
    wakeLockRef.current = await wakeLock.request("screen").catch(() => null);
  }, [keepAwake]);

  const persistCompletion = useCallback(
    async (completion: VoiceFreeNaturalCompletion) => {
      setStatus("saving");
      setIssue(null);
      pendingCompletionRef.current = completion;
      try {
        await Promise.resolve(completionCallbackRef.current?.(completion));
        pendingCompletionRef.current = null;
        setStatus("completed");
      } catch {
        setStatus("save_pending");
        setIssue(
          "The full return completed, but its local record is not saved yet. Keep QCTP open and tap Retry local save.",
        );
      }
    },
    [],
  );

  const persistAttemptIssue = useCallback(
    async (
      code: VoiceFreeAttemptIssue["code"],
      message: string,
      elapsedMs: number,
    ) => {
      const occurredAt = new Date().toISOString();
      const signature = `${code}:${supportMode}:${Math.round(elapsedMs / 1_000)}`;
      if (reportedIssueRef.current === signature) return;
      reportedIssueRef.current = signature;
      const attemptIssue: VoiceFreeAttemptIssue = {
        code,
        message,
        occurredAt,
        elapsedMs: Math.min(1_500_000, Math.max(0, Math.round(elapsedMs))),
        supportMode,
        completionCreditGranted: false,
        stateCapabilityCreditGranted: false,
      };
      try {
        await Promise.resolve(issueCallbackRef.current?.(attemptIssue));
      } catch {
        setIssue(
          `${message} The unresolved issue could not be saved locally; keep QCTP open and try again.`,
        );
      }
    },
    [supportMode],
  );

  useEffect(() => {
    if (typeof Audio === "undefined") return;
    const audioElement = new Audio();
    audioElementRef.current = audioElement;

    // Metadata is enough to prove the controlled 1,500-second package before
    // the user's start gesture. Preloading the entire long response in every
    // open QCTP tab can keep the current service worker busy indefinitely and
    // block a later explicitly approved app update.
    audioElement.preload = "metadata";
    audioElement.loop = false;
    audioElement.src = getVoiceFreeSupportUrl(supportMode);
    audioElement.load();

    const updateElapsed = () => {
      const next = Math.min(
        VOICE_FREE_DAY1_DURATION_SECONDS,
        Math.max(0, audioElement.currentTime || 0),
      );
      setElapsedSeconds(next);
      if (testMode && next >= VOICE_FREE_DAY1_TEST_DURATION_SECONDS) {
        endingRef.current = "test";
        audioElement.pause();
        setStatus("ended");
        void releaseWakeLock();
      }
    };
    const handleReady = () => {
      const duration = audioElement.duration;
      if (!Number.isFinite(duration) || duration < 1_499 || duration > 1_501) {
        const message =
          "The local support file failed the 25-minute duration check. The practice did not start.";
        setReadiness("error");
        setStatus("error");
        setIssue(message);
        void persistAttemptIssue("AUDIO_DURATION_INVALID", message, 0);
        return;
      }
      setReadiness("ready");
      setIssue(null);
    };
    const handlePlay = () => {
      setStatus("running");
      setIssue(null);
    };
    const handlePause = () => {
      updateElapsed();
      if (audioElement.ended || endingRef.current !== null) return;
      setStatus((current) =>
        current === "running" || current === "starting" ? "paused" : current,
      );
      void releaseWakeLock();
    };
    const handleError = () => {
      const message =
        "The selected same-origin support track could not play. No completion was recorded. Reopen QCTP after the offline pack finishes installing, then retry.";
      setReadiness("error");
      setStatus("error");
      setIssue(message);
      void persistAttemptIssue(
        "AUDIO_LOAD_FAILED",
        message,
        audioElement.currentTime * 1_000,
      );
      void releaseWakeLock();
    };
    const handleEnded = () => {
      updateElapsed();
      void releaseWakeLock();
      if (testMode || endingRef.current !== null) {
        setStatus("ended");
        return;
      }
      if (audioElement.currentTime < 1_499) {
        const message =
          "The support track ended before the controlled return completed. No completion was recorded.";
        setStatus("error");
        setIssue(message);
        void persistAttemptIssue(
          "AUDIO_ENDED_EARLY",
          message,
          audioElement.currentTime * 1_000,
        );
        return;
      }
      setElapsedSeconds(VOICE_FREE_DAY1_DURATION_SECONDS);
      if (completionSentRef.current) return;
      completionSentRef.current = true;
      const endedAt = new Date().toISOString();
      const completion: VoiceFreeNaturalCompletion = {
        id: sessionIdRef.current ?? createSessionId(),
        startedAt: startedAtRef.current ?? endedAt,
        endedAt,
        elapsedMs: 1_500_000,
        supportMode,
      };
      void persistCompletion(completion);
    };

    audioElement.addEventListener("loadedmetadata", handleReady);
    audioElement.addEventListener("canplay", handleReady);
    audioElement.addEventListener("timeupdate", updateElapsed);
    audioElement.addEventListener("play", handlePlay);
    audioElement.addEventListener("pause", handlePause);
    audioElement.addEventListener("error", handleError);
    audioElement.addEventListener("ended", handleEnded);
    return () => {
      audioElement.removeEventListener("loadedmetadata", handleReady);
      audioElement.removeEventListener("canplay", handleReady);
      audioElement.removeEventListener("timeupdate", updateElapsed);
      audioElement.removeEventListener("play", handlePlay);
      audioElement.removeEventListener("pause", handlePause);
      audioElement.removeEventListener("error", handleError);
      audioElement.removeEventListener("ended", handleEnded);
      audioElement.pause();
      audioElement.removeAttribute("src");
      audioElement.load();
      if (audioElementRef.current === audioElement) {
        audioElementRef.current = null;
      }
    };
  }, [
    persistAttemptIssue,
    persistCompletion,
    releaseWakeLock,
    supportMode,
    testMode,
  ]);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: number | null = null;
    const check = async () => {
      const cached = await isVoiceFreeSupportCached(supportMode).catch(
        () => false,
      );
      if (cancelled) return;
      setOfflinePackageReady(cached);
      if (!cached) {
        retryTimer = window.setTimeout(() => void check(), 1_500);
      }
    };
    void check();
    return () => {
      cancelled = true;
      if (retryTimer !== null) window.clearTimeout(retryTimer);
    };
  }, [supportMode]);

  useEffect(() => {
    if (status !== "running") return;
    const timer = window.setInterval(() => {
      const audioElement = audioElementRef.current;
      if (!audioElement) return;
      setElapsedSeconds(
        Math.min(
          VOICE_FREE_DAY1_DURATION_SECONDS,
          Math.max(0, audioElement.currentTime || 0),
        ),
      );
    }, 250);
    return () => window.clearInterval(timer);
  }, [status]);

  useEffect(() => {
    const restore = () => {
      if (document.visibilityState === "visible" && status === "running") {
        void requestWakeLock();
      }
    };
    document.addEventListener("visibilitychange", restore);
    return () => document.removeEventListener("visibilitychange", restore);
  }, [requestWakeLock, status]);

  useEffect(() => () => void releaseWakeLock(), [releaseWakeLock]);

  const setSupportMode = useCallback(
    (mode: VoiceFreeSupportMode) => {
      if (
        status === "running" ||
        status === "paused" ||
        status === "starting"
      ) {
        return;
      }
      setSupportModeState(mode);
      setElapsedSeconds(0);
      setStatus("idle");
      setReadiness("loading");
      setOfflinePackageReady(false);
      setIssue(null);
    },
    [status],
  );

  const start = useCallback(() => {
    if (
      status === "starting" ||
      status === "running" ||
      status === "paused" ||
      status === "recording_issue" ||
      status === "saving" ||
      status === "save_pending"
    ) {
      setIssue(
        "This practice is already active. Complete the return or save the pending record before starting again.",
      );
      return;
    }
    const audioElement = audioElementRef.current;
    if (!audioElement) {
      setStatus("error");
      setIssue("This browser cannot create the required local audio player.");
      return;
    }
    if (readiness !== "ready") {
      setIssue(
        readiness === "error"
          ? "The selected offline support track is unavailable. No completion was recorded."
          : "The selected offline support track is still preparing. Wait for AUDIO READY, then tap Begin once.",
      );
      return;
    }
    endingRef.current = null;
    completionSentRef.current = false;
    reportedIssueRef.current = null;
    sessionIdRef.current = createSessionId();
    startedAtRef.current = new Date().toISOString();
    setIssue(null);
    setElapsedSeconds(0);
    setStatus("starting");
    audioElement.pause();
    audioElement.currentTime = 0;
    if (!audioElement.src.endsWith(getVoiceFreeSupportUrl(supportMode))) {
      audioElement.src = getVoiceFreeSupportUrl(supportMode);
      audioElement.load();
    }
    void audioElement
      .play()
      .then(() => requestWakeLock())
      .catch(() => {
        const message =
          "The iPhone blocked the first audio start. Nothing was lost. Tap Begin once more while QCTP is visible.";
        setStatus("error");
        setIssue(message);
        void persistAttemptIssue("AUDIO_START_BLOCKED", message, 0);
      });
  }, [persistAttemptIssue, readiness, requestWakeLock, status, supportMode]);

  const pause = useCallback(() => {
    if (status !== "running") return;
    audioElementRef.current?.pause();
  }, [status]);

  const resume = useCallback(() => {
    const audioElement = audioElementRef.current;
    if (!audioElement || status !== "paused") return;
    setStatus("starting");
    void audioElement
      .play()
      .then(() => requestWakeLock())
      .catch(() => {
        const message =
          "The local support track could not resume. No completion was recorded; retry while QCTP is visible.";
        setStatus("error");
        setIssue(message);
        void persistAttemptIssue(
          "AUDIO_RESUME_BLOCKED",
          message,
          audioElement.currentTime * 1_000,
        );
      });
  }, [persistAttemptIssue, requestWakeLock, status]);

  const end = useCallback(() => {
    const audioElement = audioElementRef.current;
    if (!audioElement) return;
    endingRef.current = "user";
    audioElement.pause();
    const endedAtSeconds = Math.min(
      VOICE_FREE_DAY1_DURATION_SECONDS,
      audioElement.currentTime || 0,
    );
    // Release the long same-origin response before marking the session idle.
    // A paused media element can keep the controlling service worker's fetch
    // event alive, which prevents an explicitly approved waiting update from
    // activating even after the practice has ended.
    audioElement.removeAttribute("src");
    audioElement.load();
    setElapsedSeconds(endedAtSeconds);
    void releaseWakeLock();
    if (testMode) {
      setStatus("ended");
      return;
    }
    const message =
      "Practice ended before the complete return. No completion or state credit was recorded.";
    setIssue(message);
    setStatus("recording_issue");
    void persistAttemptIssue(
      "EARLY_USER_END",
      message,
      endedAtSeconds * 1_000,
    ).finally(() => setStatus("ended"));
  }, [persistAttemptIssue, releaseWakeLock, testMode]);

  const retrySave = useCallback(() => {
    const pending = pendingCompletionRef.current;
    if (!pending || status !== "save_pending") return;
    void persistCompletion(pending);
  }, [persistCompletion, status]);

  const effectiveDuration = testMode
    ? VOICE_FREE_DAY1_TEST_DURATION_SECONDS
    : VOICE_FREE_DAY1_DURATION_SECONDS;
  const remainingSeconds = Math.max(0, effectiveDuration - elapsedSeconds);
  const progress = Math.min(1, elapsedSeconds / effectiveDuration);
  const phase = useMemo(
    () => getVoiceFreeDay1Phase(elapsedSeconds),
    [elapsedSeconds],
  );
  const breathRail = useMemo(
    () => getHeartMathBreathRail(elapsedSeconds),
    [elapsedSeconds],
  );

  return {
    status,
    readiness,
    offlinePackageReady,
    issue,
    supportMode,
    elapsedSeconds,
    remainingSeconds,
    progress,
    phase,
    breathRail,
    testMode,
    setSupportMode,
    start,
    pause,
    resume,
    end,
    retrySave,
  };
}
