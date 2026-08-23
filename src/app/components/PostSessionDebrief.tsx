import { useEffect, useRef, useState } from "react";

import type { PracticeSession } from "../../domain";
import type { PracticeDebriefTransition } from "../../practice";
import {
  VoiceRecorderPanel,
  type AcceptedCapture,
  type CapturePersistence,
} from "../../voice-capture";
import { StatusBadge } from "./StatusBadge";

export interface PostSessionDebriefProps {
  session: PracticeSession;
  persistence: CapturePersistence;
  localTranscriptionAvailable: boolean;
  onAccept: (capture: AcceptedCapture) => Promise<void>;
  onTypeAccept: (rawObservation: string) => Promise<void>;
  onTransition: (transition: PracticeDebriefTransition) => Promise<void>;
}

export function PostSessionDebrief({
  session,
  persistence,
  localTranscriptionAvailable,
  onAccept,
  onTypeAccept,
  onTransition,
}: PostSessionDebriefProps) {
  const containerRef = useRef<HTMLElement | null>(null);
  const [recorderOpen, setRecorderOpen] = useState(false);
  const [typeOpen, setTypeOpen] = useState(false);
  const [typedObservation, setTypedObservation] = useState("");
  const [useNow, setUseNow] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debrief = session.debrief;

  useEffect(() => {
    const handle = window.requestAnimationFrame(() => {
      containerRef.current?.focus();
      if (typeof containerRef.current?.scrollIntoView === "function") {
        containerRef.current.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }
    });
    return () => window.cancelAnimationFrame(handle);
  }, [session.id]);

  useEffect(() => {
    if (debrief?.status !== "remind_later") return;
    const update = () => setNowMs(Date.now());
    const interval = window.setInterval(update, 30_000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") update();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [debrief?.status]);

  if (!debrief || debrief.status === "completed") return null;

  const deferred =
    debrief.status === "remind_later" &&
    debrief.remindAt !== null &&
    Date.parse(debrief.remindAt) > nowMs &&
    !useNow;
  const setDisposition = async (status: "remind_later" | "skipped") => {
    setSaving(true);
    setError(null);
    const updatedAt = new Date().toISOString();
    try {
      if (status === "remind_later") {
        await onTransition({
          to: status,
          occurredAt: updatedAt,
          remindAt: new Date(Date.now() + 60 * 60 * 1_000).toISOString(),
        });
      } else {
        await onTransition({ to: status, occurredAt: updatedAt });
      }
      setRecorderOpen(false);
      setTypeOpen(false);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The debrief choice could not be saved locally.",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      ref={containerRef}
      id="post-session-debrief"
      tabIndex={-1}
      className="panel-card post-session-debrief"
      aria-labelledby="post-session-debrief-title"
    >
      <div className="card-heading">
        <div>
          <p className="eyebrow">After the complete return</p>
          <h2 id="post-session-debrief-title">Capture the raw observation</h2>
        </div>
        <StatusBadge status="ready" />
      </div>
      <p className="debrief-prompt">
        Before explaining it, say only what you directly noticed in your body,
        attention, imagery, sound, or sense of space.
      </p>
      <p className="fine-print">
        Raw audio is preserved first and linked to this exact practice. Local
        PX13 transcription is optional and can wait safely; no interpretation or
        state claim is created here.
      </p>

      {deferred ? (
        <div className="debrief-deferred" role="status">
          <strong>Saved for later</strong>
          <span>
            This remains on Today and is due again at{" "}
            {debrief.remindAt
              ? new Date(debrief.remindAt).toLocaleTimeString([], {
                  hour: "numeric",
                  minute: "2-digit",
                })
              : "the next check"}
            .
          </span>
          <button
            className="secondary-button"
            type="button"
            onClick={() => setUseNow(true)}
          >
            Record now instead
          </button>
        </div>
      ) : recorderOpen ? (
        <VoiceRecorderPanel
          persistence={persistence}
          mode="debrief"
          initialDestination="codex"
          sessionId={session.id}
          initialTitle="Day 1 raw observation"
          initialTags={[
            "foundation",
            "day-1",
            "post-practice",
            "raw-observation",
          ]}
          defaultQueueLocalTranscription
          localTranscriptionAvailable={localTranscriptionAvailable}
          onAccept={onAccept}
          onClose={() => setRecorderOpen(false)}
        />
      ) : typeOpen ? (
        <div className="debrief-typed-entry">
          <label>
            Raw observation
            <textarea
              autoFocus
              value={typedObservation}
              onChange={(event) => setTypedObservation(event.target.value)}
              placeholder="Write only what you directly noticed…"
            />
          </label>
          <div className="debrief-actions">
            <button
              className="primary-button"
              type="button"
              disabled={saving || !typedObservation.trim()}
              onClick={() => {
                setSaving(true);
                setError(null);
                void onTypeAccept(typedObservation)
                  .catch((cause) =>
                    setError(
                      cause instanceof Error
                        ? cause.message
                        : "The typed observation could not be saved locally.",
                    ),
                  )
                  .finally(() => setSaving(false));
              }}
            >
              {saving ? "Saving locally…" : "Save raw observation"}
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={saving}
              onClick={() => setTypeOpen(false)}
            >
              Back
            </button>
          </div>
        </div>
      ) : (
        <div className="debrief-actions">
          <button
            className="primary-button"
            type="button"
            onClick={() => setRecorderOpen(true)}
          >
            Record raw observation
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => setTypeOpen(true)}
          >
            Type instead
          </button>
          <button
            className="secondary-button"
            type="button"
            disabled={saving}
            onClick={() => void setDisposition("remind_later")}
          >
            Remind me in one hour
          </button>
          <button
            className="text-button"
            type="button"
            disabled={saving}
            onClick={() => void setDisposition("skipped")}
          >
            Skip this debrief
          </button>
        </div>
      )}
      {error ? (
        <p className="recorder-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
