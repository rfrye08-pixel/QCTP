import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import {
  acceptVoiceCapture,
  RepositoryCapturePersistence,
  VoiceRecorderPanel,
  type AcceptedCapture,
} from "../voice-capture";
import {
  AppSettingsSchema,
  FoundationStateSchema,
  PracticeSessionSchema,
  type PracticeSession,
} from "../domain";
import {
  createFoundationProgress,
  getFoundationDayComponents,
  markFoundationComponentComplete,
} from "../foundation";
import {
  useVoiceFreeDay1Session,
  createPendingPracticeDebrief,
  VOICE_FREE_DAY1_PRACTICE_ID,
  VOICE_FREE_DAY1_SCRIPT_ID,
  VOICE_FREE_DAY1_SCRIPT_SHA256,
  type VoiceFreeAttemptIssue,
  type PracticeDebriefTransition,
  type VoiceFreeNaturalCompletion,
} from "../practice";
import { evaluateReg01SourceTrackAccess } from "../reg/reg01";
import { Shell } from "./Shell";
import {
  MoreOverview,
  PathsOverview,
  TodayOverview,
} from "./screens/OverviewScreens";
import { PracticeScreen } from "./screens/PracticeScreen";
import { StudioScreen } from "./screens/StudioScreen";
import { LabScreen } from "./screens/LabScreen";
import { CodexScreen } from "./screens/CodexScreen";
import { MirrorScreen } from "./screens/MirrorScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { useQctp } from "./qctp-context";
import {
  hashForAppLocation,
  isLegacyMirrorSourceHash,
  parseAppLocation,
  type AppLocation,
  type AppRoute,
} from "./routes";
import { PostSessionDebrief } from "./components/PostSessionDebrief";
import {
  markPwaCriticalActivityActive,
  markPwaCriticalActivityIdle,
} from "./pwa-update-safety";

export function App() {
  const runtime = useQctp();
  const [location, setLocation] = useState<AppLocation>(() =>
    parseAppLocation(window.location.hash),
  );
  const initialHashSynchronized = useRef(false);
  const [quickCaptureOpen, setQuickCaptureOpen] = useState(false);
  const [captureSaveStatus, setCaptureSaveStatus] = useState<string | null>(
    null,
  );
  const captureDialogRef = useRef<HTMLElement | null>(null);
  const captureReturnFocusRef = useRef<HTMLElement | null>(null);
  const [unresolvedDebriefSession, setUnresolvedDebriefSession] =
    useState<PracticeSession | null>(null);
  const persistence = useMemo(
    () => new RepositoryCapturePersistence(runtime.repository),
    [runtime.repository],
  );

  const openVoiceCapture = useCallback((trigger: HTMLButtonElement) => {
    // Mobile WebKit does not focus a button merely because it was tapped, so
    // retain the concrete invoker instead of relying on document.activeElement.
    captureReturnFocusRef.current = trigger;
    setCaptureSaveStatus(null);
    setQuickCaptureOpen(true);
  }, []);

  useEffect(() => {
    if (quickCaptureOpen) {
      const frame = window.requestAnimationFrame(() =>
        captureDialogRef.current?.focus(),
      );
      return () => window.cancelAnimationFrame(frame);
    }
    const returnTarget = captureReturnFocusRef.current;
    if (!returnTarget) return;
    // Wait until React has removed `inert` from the app frame. WebKit ignores a
    // focus attempt made while an ancestor is still transitioning out of inert.
    const timer = window.setTimeout(() => {
      if (returnTarget.isConnected) returnTarget.focus({ preventScroll: true });
      captureReturnFocusRef.current = null;
    }, 0);
    return () => window.clearTimeout(timer);
  }, [quickCaptureOpen]);

  const handleCaptureDialogKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLElement>) => {
      const dialog = captureDialogRef.current;
      if (!dialog) return;
      if (event.key === "Escape") {
        const safeClose = dialog.querySelector<HTMLButtonElement>(
          ".recorder-idle-actions .secondary-button",
        );
        if (safeClose) {
          event.preventDefault();
          safeClose.click();
        }
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = [
        ...dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), audio[controls], a[href], [tabindex]:not([tabindex="-1"])',
        ),
      ].filter(
        (element) =>
          !element.hidden &&
          element.getAttribute("aria-hidden") !== "true" &&
          element.getClientRects().length > 0,
      );
      if (focusable.length === 0) {
        event.preventDefault();
        dialog.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    },
    [],
  );

  useEffect(() => {
    const handleHash = () => {
      const requestedHash = window.location.hash;
      const nextLocation = parseAppLocation(requestedHash);
      if (
        nextLocation.invalidLink !== null ||
        isLegacyMirrorSourceHash(requestedHash) ||
        (nextLocation.kind !== "base" &&
          requestedHash !== hashForAppLocation(nextLocation))
      ) {
        const canonicalHash = hashForAppLocation(nextLocation);
        window.history.replaceState(
          window.history.state,
          "",
          `${window.location.pathname}${window.location.search}${canonicalHash}`,
        );
      }
      setLocation(nextLocation);
      window.scrollTo({ top: 0, behavior: "instant" });
    };
    // React Strict Mode replays effects. Keep a rejected link's alert visible
    // after its URL is safely replaced instead of reparsing the fallback URL.
    if (!initialHashSynchronized.current) {
      initialHashSynchronized.current = true;
      handleHash();
    }
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, []);

  useEffect(() => {
    let disposed = false;
    void runtime.repository.listPracticeSessions().then((sessions) => {
      if (disposed) return;
      setUnresolvedDebriefSession(
        sessions.find(
          (candidate) =>
            candidate.debrief?.status === "pending" ||
            candidate.debrief?.status === "remind_later",
        ) ?? null,
      );
    });
    return () => {
      disposed = true;
    };
  }, [runtime.repository, runtime.revision]);

  const navigate = useCallback((next: AppRoute) => {
    const nextHash = hashForAppLocation({
      kind: "base",
      route: next,
      invalidLink: null,
    });
    if (window.location.hash === nextHash) {
      window.dispatchEvent(new HashChangeEvent("hashchange"));
      return;
    }
    window.location.hash = nextHash;
  }, []);

  const saveVoiceFreeCompletion = useCallback(
    async (completion: VoiceFreeNaturalCompletion) => {
      const practiceSession = PracticeSessionSchema.parse({
        schemaVersion: 1,
        id: completion.id,
        practiceId: VOICE_FREE_DAY1_PRACTICE_ID,
        foundationDay: 1,
        scriptId: VOICE_FREE_DAY1_SCRIPT_ID,
        scriptSha256: VOICE_FREE_DAY1_SCRIPT_SHA256,
        startedAt: completion.startedAt,
        endedAt: completion.endedAt,
        elapsedMs: completion.elapsedMs,
        completionMode: "VOICE_FREE_FALLBACK",
        supportMode: completion.supportMode,
        sourceSequence: ["Bullard", "HeartMath", "Dispenza", "QCTP return"],
        heartMathBreath:
          "approximately five seconds in / five seconds out or comfortable; no hold",
        naturalCompletion: true,
        narrationUsed: false,
        narratedContentAcceptance: "NOT_APPLICABLE",
        stateAttainment: "NOT_ASSESSED",
        debrief: createPendingPracticeDebrief(
          {
            id: completion.id,
            completionStatus: "completed",
            naturalCompletion: true,
            testShortened: false,
          },
          completion.endedAt,
        ),
        createdAt: completion.endedAt,
      });
      const current =
        (await runtime.repository.getFoundationState()) ?? runtime.foundation;
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
        "morning",
      );
      const foundation = FoundationStateSchema.parse({
        ...current,
        currentDay: nextProgress.currentDay,
        completion: {
          ...current.completion,
          "1": getFoundationDayComponents(nextProgress, 1),
        },
        updatedAt: completion.endedAt,
      });
      const currentSettings =
        (await runtime.repository.getSettings()) ?? runtime.settings;
      const settings = AppSettingsSchema.parse({
        ...currentSettings,
        lastVoiceFreeIssue: null,
        updatedAt: completion.endedAt,
      });
      await runtime.repository.savePracticeSessionAndFoundation(
        practiceSession,
        foundation,
        settings,
      );
      await runtime.refresh();
    },
    [runtime],
  );

  const saveVoiceFreeIssue = useCallback(
    async (issue: VoiceFreeAttemptIssue) => {
      const current =
        (await runtime.repository.getSettings()) ?? runtime.settings;
      await runtime.repository.saveSettings(
        AppSettingsSchema.parse({
          ...current,
          lastVoiceFreeIssue: issue,
          updatedAt: issue.occurredAt,
        }),
      );
      await runtime.refresh();
    },
    [runtime],
  );

  const voiceFreeSession = useVoiceFreeDay1Session({
    testMode: runtime.settings.testMode,
    keepAwake: runtime.settings.keepAwake,
    onNaturalComplete: saveVoiceFreeCompletion,
    onAttemptIssue: saveVoiceFreeIssue,
  });

  const startVoiceFreeDay1 = useCallback(() => {
    voiceFreeSession.start();
    navigate("practice");
  }, [navigate, voiceFreeSession]);

  const acceptQuickCapture = useCallback(
    async (capture: AcceptedCapture) => {
      await acceptVoiceCapture(runtime.repository, capture);
      await runtime.refresh();
      const label =
        capture.captureMode === "auto-dictation"
          ? "Auto-Dictation"
          : "Voice note";
      setCaptureSaveStatus(
        capture.queueLocalTranscription
          ? `${label} saved locally and queued for PX13 transcription.`
          : `${label} saved locally.`,
      );
      if (
        capture.queueLocalTranscription &&
        runtime.localTranscriptionStatus === "ready"
      ) {
        void runtime.processTranscriptionQueue();
      }
    },
    [runtime],
  );

  const updatePostSessionDebrief = useCallback(
    async (sessionId: string, transition: PracticeDebriefTransition) => {
      await runtime.repository.transitionPracticeDebrief(sessionId, transition);
      await runtime.refresh();
    },
    [runtime],
  );

  const acceptTypedPostSessionDebrief = useCallback(
    async (sessionId: string, rawObservation: string) => {
      await runtime.repository.acceptTypedPracticeDebrief(
        sessionId,
        rawObservation,
      );
      await runtime.refresh();
    },
    [runtime],
  );

  const acceptPostSessionDebrief = useCallback(
    async (capture: AcceptedCapture) => {
      if (capture.context.type !== "practice-debrief") {
        throw new Error("The practice link is missing from this debrief.");
      }
      await acceptVoiceCapture(runtime.repository, capture);
      await runtime.refresh();
      if (
        capture.queueLocalTranscription &&
        runtime.localTranscriptionStatus === "ready"
      ) {
        void runtime.processTranscriptionQueue();
      }
    },
    [runtime],
  );

  const practiceActive = [
    "starting",
    "running",
    "paused",
    "recording_issue",
    "saving",
    "save_pending",
  ].includes(voiceFreeSession.status);

  useEffect(() => {
    const activityId = "foundation-day1-practice";
    if (practiceActive) {
      markPwaCriticalActivityActive(activityId);
    } else {
      markPwaCriticalActivityIdle(activityId);
    }
    return () => markPwaCriticalActivityIdle(activityId);
  }, [practiceActive]);

  const screen = (() => {
    switch (location.route) {
      case "today":
        return (
          <TodayOverview
            onNavigate={navigate}
            voiceFreeSession={voiceFreeSession}
            onStartVoiceFreeDay1={startVoiceFreeDay1}
            onQuickCapture={openVoiceCapture}
            unresolvedDebriefSession={unresolvedDebriefSession}
            onOpenDebrief={() => navigate("practice")}
          />
        );
      case "paths":
        return <PathsOverview onNavigate={navigate} />;
      case "more":
        return <MoreOverview onNavigate={navigate} />;
      case "practice":
        return (
          <>
            <PracticeScreen voiceFreeSession={voiceFreeSession} />
            {unresolvedDebriefSession && !practiceActive ? (
              <PostSessionDebrief
                session={unresolvedDebriefSession}
                persistence={persistence}
                localTranscriptionAvailable={
                  runtime.localTranscriptionStatus === "ready"
                }
                onAccept={acceptPostSessionDebrief}
                onTypeAccept={(rawObservation) =>
                  acceptTypedPostSessionDebrief(
                    unresolvedDebriefSession.id,
                    rawObservation,
                  )
                }
                onTransition={(transition) =>
                  updatePostSessionDebrief(
                    unresolvedDebriefSession.id,
                    transition,
                  )
                }
              />
            ) : null}
          </>
        );
      case "studio": {
        const navigationDecision = evaluateReg01SourceTrackAccess("start");
        return <StudioScreen navigationDecision={navigationDecision} />;
      }
      case "lab":
        return <LabScreen />;
      case "codex":
        return (
          <CodexScreen
            targetRecordId={
              location.kind === "codex-record" ? location.recordId : null
            }
          />
        );
      case "mirror":
        return (
          <MirrorScreen
            focusedSourceRecordId={
              location.kind === "mirror-source" ? location.recordId : null
            }
          />
        );
      case "settings":
        return <SettingsScreen />;
    }
  })();

  return (
    <>
      <Shell
        route={location.route}
        foundationDay={runtime.foundation.currentDay}
        onNavigate={navigate}
        onQuickCapture={openVoiceCapture}
        practiceActive={practiceActive}
        inactiveForModal={quickCaptureOpen}
      >
        {location.invalidLink ? (
          <p className="platform-message warning" role="alert">
            That record link is invalid. QCTP opened the nearest safe page and
            did not change any local records.
          </p>
        ) : null}
        {screen}
        {captureSaveStatus ? (
          <div className="save-status global-capture-status" role="status">
            <span>{captureSaveStatus}</span>
            <button
              type="button"
              aria-label="Dismiss voice capture confirmation"
              onClick={() => setCaptureSaveStatus(null)}
            >
              Dismiss
            </button>
          </div>
        ) : null}
      </Shell>
      {quickCaptureOpen ? (
        <div className="modal-backdrop" role="presentation">
          <section
            ref={captureDialogRef}
            className="capture-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="capture-title"
            tabIndex={-1}
            onKeyDown={handleCaptureDialogKeyDown}
          >
            <div className="sheet-handle" />
            <p className="eyebrow">Global voice input</p>
            <h2 id="capture-title">Voice Capture</h2>
            <p>
              Choose a quick note or a 5-, 10-, or 20-minute Auto-Dictation.
              Microphone permission is requested only after Start, and every
              chunk is written to IndexedDB as it arrives.
            </p>
            <VoiceRecorderPanel
              persistence={persistence}
              allowModeSelection
              localTranscriptionAvailable={
                runtime.localTranscriptionStatus === "ready"
              }
              onAccept={acceptQuickCapture}
              onClose={() => setQuickCaptureOpen(false)}
            />
          </section>
        </div>
      ) : null}
    </>
  );
}
