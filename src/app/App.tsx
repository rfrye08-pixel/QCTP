import { useCallback, useEffect, useMemo, useState } from "react";

import {
  acceptVoiceCapture,
  RepositoryCapturePersistence,
  VoiceRecorderPanel,
  type AcceptedCapture,
} from "../voice-capture";
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
        return <TodayOverview onNavigate={navigate} />;
      case "paths":
        return <PathsOverview onNavigate={navigate} />;
      case "more":
        return <MoreOverview onNavigate={navigate} />;
      case "practice":
        return (
          <PracticeScreen
            cueMode={runtime.settings.guidanceMode}
            testMode={runtime.settings.testMode}
            onMorningComplete={() => runtime.markFoundationComponent("morning")}
          />
        );
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
