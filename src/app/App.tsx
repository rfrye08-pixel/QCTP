import { useCallback, useEffect, useMemo, useState } from "react";

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
} from "../domain";
import {
  createFoundationProgress,
  getFoundationDayComponents,
  markFoundationComponentComplete,
} from "../foundation";
import {
  useVoiceFreeDay1Session,
  VOICE_FREE_DAY1_PRACTICE_ID,
  VOICE_FREE_DAY1_SCRIPT_ID,
  VOICE_FREE_DAY1_SCRIPT_SHA256,
  type VoiceFreeAttemptIssue,
  type VoiceFreeNaturalCompletion,
} from "../practice";
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
import { routeFromHash, type AppRoute } from "./routes";

export function App() {
  const runtime = useQctp();
  const [route, setRoute] = useState<AppRoute>(() =>
    routeFromHash(window.location.hash),
  );
  const [quickCaptureOpen, setQuickCaptureOpen] = useState(false);
  const persistence = useMemo(
    () => new RepositoryCapturePersistence(runtime.repository),
    [runtime.repository],
  );

  useEffect(() => {
    const handleHash = () => setRoute(routeFromHash(window.location.hash));
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, []);

  const navigate = useCallback((next: AppRoute) => {
    window.location.hash = `/${next}`;
    setRoute(next);
    window.scrollTo({ top: 0, behavior: "instant" });
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
      if (
        capture.queueLocalTranscription &&
        runtime.localTranscriptionStatus === "ready"
      ) {
        void runtime.processTranscriptionQueue();
      }
    },
    [runtime],
  );

  const screen = (() => {
    switch (route) {
      case "today":
        return (
          <TodayOverview
            onNavigate={navigate}
            voiceFreeSession={voiceFreeSession}
            onStartVoiceFreeDay1={startVoiceFreeDay1}
            onQuickCapture={() => setQuickCaptureOpen(true)}
          />
        );
      case "paths":
        return <PathsOverview onNavigate={navigate} />;
      case "more":
        return <MoreOverview onNavigate={navigate} />;
      case "practice":
        return <PracticeScreen voiceFreeSession={voiceFreeSession} />;
      case "studio":
        return <StudioScreen />;
      case "lab":
        return <LabScreen />;
      case "codex":
        return <CodexScreen />;
      case "mirror":
        return <MirrorScreen />;
      case "settings":
        return <SettingsScreen />;
    }
  })();

  return (
    <Shell
      route={route}
      foundationDay={runtime.foundation.currentDay}
      onNavigate={navigate}
      onQuickCapture={() => setQuickCaptureOpen(true)}
      practiceActive={[
        "starting",
        "running",
        "paused",
        "recording_issue",
        "saving",
        "save_pending",
      ].includes(voiceFreeSession.status)}
    >
      {screen}
      {quickCaptureOpen ? (
        <div className="modal-backdrop" role="presentation">
          <section
            className="capture-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="capture-title"
          >
            <div className="sheet-handle" />
            <p className="eyebrow">Global voice input</p>
            <h2 id="capture-title">Quick Capture</h2>
            <p>
              Microphone permission is requested only after Start. Every chunk
              is written to IndexedDB as it arrives.
            </p>
            <VoiceRecorderPanel
              persistence={persistence}
              localTranscriptionAvailable={
                runtime.localTranscriptionStatus === "ready"
              }
              onAccept={acceptQuickCapture}
              onClose={() => setQuickCaptureOpen(false)}
            />
          </section>
        </div>
      ) : null}
    </Shell>
  );
}
