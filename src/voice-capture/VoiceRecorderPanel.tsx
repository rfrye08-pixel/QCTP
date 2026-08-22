import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  BrowserRecorderSession,
  type CapturePersistence,
} from "./browser-recorder";
import {
  INITIAL_RECORDER_STATE,
  recorderElapsedMs,
  type RecorderState,
} from "./recorder-machine";
import {
  captureDestinations,
  type AcceptedCapture,
  type CaptureDestination,
  type CaptureMode,
} from "./capture-types";

export interface VoiceRecorderPanelProps {
  persistence: CapturePersistence;
  mode?: CaptureMode;
  initialDestination?: CaptureDestination;
  fieldTargetId?: string | null;
  localTranscriptionAvailable?: boolean;
  allowPause?: boolean;
  allowAppend?: boolean;
  onAccept: (capture: AcceptedCapture) => Promise<void>;
  onClose: () => void;
}

const timedDurations = [
  [5, "5 minutes"],
  [10, "10 minutes"],
  [20, "20 minutes"],
] as const;

function formatDuration(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1_000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function playCaptureTone(): void {
  const context = new AudioContext();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.frequency.value = 660;
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.12);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.13);
  oscillator.addEventListener("ended", () => void context.close(), {
    once: true,
  });
}

export function VoiceRecorderPanel({
  persistence,
  mode = "quick",
  initialDestination = "unclassified",
  fieldTargetId = null,
  localTranscriptionAvailable = false,
  allowPause = true,
  allowAppend = true,
  onAccept,
  onClose,
}: VoiceRecorderPanelProps) {
  const [recorderState, setRecorderState] = useState<RecorderState>(
    INITIAL_RECORDER_STATE,
  );
  const [displayedElapsedMs, setDisplayedElapsedMs] = useState(0);
  const [autoMinutes, setAutoMinutes] = useState<5 | 10 | 20>(5);
  const [destination, setDestination] =
    useState<CaptureDestination>(initialDestination);
  const [title, setTitle] = useState("");
  const [tagText, setTagText] = useState("");
  const [manualText, setManualText] = useState("");
  const [queueLocalTranscription, setQueueLocalTranscription] = useState(
    localTranscriptionAvailable,
  );
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const sessionRef = useRef<BrowserRecorderSession | null>(null);

  useEffect(
    () => () => {
      void sessionRef.current?.dispose();
    },
    [],
  );

  useEffect(
    () => () => {
      if (playbackUrl) URL.revokeObjectURL(playbackUrl);
    },
    [playbackUrl],
  );

  const durationLimitMs =
    mode === "auto-dictation" ? autoMinutes * 60_000 : null;
  const elapsedMs = displayedElapsedMs;
  const remainingMs =
    durationLimitMs === null ? null : Math.max(0, durationLimitMs - elapsedMs);
  const isActive =
    recorderState.phase === "recording" || recorderState.phase === "paused";
  const isReview = recorderState.phase === "review";
  const hasCapture =
    recorderState.recordingId !== null || recorderState.sizeBytes > 0;
  const phaseLabel = useMemo(() => {
    if (recorderState.phase === "requesting-permission")
      return "Requesting microphone permission";
    if (recorderState.phase === "recording")
      return "Recording — audio is being stored locally";
    if (recorderState.phase === "paused") {
      return recorderState.pauseReason === "document-hidden"
        ? "Paused because QCTP left the foreground"
        : "Paused";
    }
    if (recorderState.phase === "review")
      return "Stopped — locally safe and ready to review";
    if (recorderState.phase === "error") return "Recording needs attention";
    return "Ready — microphone is off";
  }, [recorderState.pauseReason, recorderState.phase]);

  const createSession = useCallback(
    (append: boolean) => {
      const session = new BrowserRecorderSession({
        persistence,
        onStateChange: (nextState) => {
          setRecorderState(nextState);
          setDisplayedElapsedMs(
            recorderElapsedMs(nextState, performance.now()),
          );
        },
        durationLimitMs,
        ...(append && recorderState.recordingId
          ? {
              recordingId: recorderState.recordingId,
              append: true,
              initialAccumulatedMs: recorderState.accumulatedMs,
              initialSizeBytes: recorderState.sizeBytes,
            }
          : {}),
      });
      sessionRef.current = session;
      return session;
    },
    [
      durationLimitMs,
      persistence,
      recorderState.accumulatedMs,
      recorderState.recordingId,
      recorderState.sizeBytes,
    ],
  );

  const start = useCallback(
    async (append = false) => {
      setSaveError(null);
      if (playbackUrl) {
        URL.revokeObjectURL(playbackUrl);
        setPlaybackUrl(null);
      }
      try {
        playCaptureTone();
      } catch {
        // A blocked cue must not block explicit recording.
      }
      await createSession(append).start();
    },
    [createSession, playbackUrl],
  );

  const stop = useCallback(async () => {
    const blob = await sessionRef.current?.stop();
    if (!blob) return;
    if (playbackUrl) URL.revokeObjectURL(playbackUrl);
    setPlaybackUrl(URL.createObjectURL(blob));
  }, [playbackUrl]);

  const cancel = useCallback(async () => {
    if (
      hasCapture &&
      !window.confirm(
        "Delete this unsaved local recording and every captured segment?",
      )
    ) {
      return;
    }
    await sessionRef.current?.cancel();
    if (playbackUrl) URL.revokeObjectURL(playbackUrl);
    onClose();
  }, [hasCapture, onClose, playbackUrl]);

  const rerecord = useCallback(async () => {
    if (!window.confirm("Delete this take and start a new recording?")) return;
    await sessionRef.current?.cancel();
    if (playbackUrl) URL.revokeObjectURL(playbackUrl);
    setPlaybackUrl(null);
    setRecorderState(INITIAL_RECORDER_STATE);
    setDisplayedElapsedMs(0);
    await start(false);
  }, [playbackUrl, start]);

  const accept = useCallback(async () => {
    if (!recorderState.recordingId || !recorderState.mimeType || !isReview)
      return;
    setSaving(true);
    setSaveError(null);
    try {
      await onAccept({
        recordingId: recorderState.recordingId,
        title: title.trim() || "Voice note",
        destination,
        tags: tagText
          .split(",")
          .map((tag) => tag.trim().toLowerCase())
          .filter(Boolean),
        durationMs: Math.round(recorderState.accumulatedMs),
        mimeType: recorderState.mimeType,
        manualText: manualText.trim(),
        fieldTargetId,
        queueLocalTranscription,
      });
      onClose();
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : "The recording remains local but could not be routed.",
      );
    } finally {
      setSaving(false);
    }
  }, [
    destination,
    fieldTargetId,
    isReview,
    manualText,
    onAccept,
    onClose,
    queueLocalTranscription,
    recorderState.accumulatedMs,
    recorderState.mimeType,
    recorderState.recordingId,
    tagText,
    title,
  ]);

  return (
    <section className="voice-recorder" aria-live="polite">
      <div className="recorder-state-row">
        <span
          className={`recording-indicator phase-${recorderState.phase}`}
          aria-hidden="true"
        />
        <strong>{phaseLabel}</strong>
      </div>

      {mode === "auto-dictation" && recorderState.phase === "idle" ? (
        <fieldset className="duration-picker">
          <legend>Auto-Dictation duration</legend>
          {timedDurations.map(([minutes, label]) => (
            <label key={minutes}>
              <input
                type="radio"
                name="auto-duration"
                value={minutes}
                checked={autoMinutes === minutes}
                onChange={() => setAutoMinutes(minutes)}
              />
              {label}
            </label>
          ))}
        </fieldset>
      ) : null}

      <div className="recorder-clock" data-testid="recorder-clock">
        <strong>{formatDuration(remainingMs ?? elapsedMs)}</strong>
        <small>{remainingMs === null ? "elapsed" : "remaining"}</small>
      </div>
      <div
        className="level-meter"
        aria-label={`Input level ${Math.round(recorderState.level * 100)} percent`}
      >
        {Array.from({ length: 20 }, (_, index) => (
          <span
            key={index}
            className={index / 20 < recorderState.level ? "lit" : undefined}
          />
        ))}
      </div>

      {recorderState.phase === "idle" || recorderState.phase === "cancelled" ? (
        <div className="recorder-idle-actions">
          <button
            className="record-button"
            type="button"
            onClick={() => void start(false)}
          >
            <span className="record-dot" aria-hidden="true" /> Start recording
          </button>
          <button className="secondary-button" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      ) : null}
      {recorderState.phase === "requesting-permission" ? (
        <button className="record-button" type="button" disabled>
          Waiting for permission…
        </button>
      ) : null}
      {isActive ? (
        <div className="recorder-controls">
          {allowPause ? (
            <button
              type="button"
              onClick={() =>
                recorderState.phase === "recording"
                  ? sessionRef.current?.pause()
                  : sessionRef.current?.resume()
              }
            >
              {recorderState.phase === "recording" ? "Pause" : "Resume"}
            </button>
          ) : null}
          <button
            className="stop-button"
            type="button"
            onClick={() => void stop()}
          >
            Stop
          </button>
          <button type="button" onClick={() => void cancel()}>
            Cancel
          </button>
        </div>
      ) : null}

      {recorderState.phase === "error" ? (
        <div className="recorder-error" role="alert">
          <p>{recorderState.error}</p>
          <button
            className="secondary-button"
            type="button"
            onClick={() => void cancel()}
          >
            Discard partial recording
          </button>
        </div>
      ) : null}

      {isReview ? (
        <div className="recording-review">
          {playbackUrl ? (
            <audio controls preload="metadata" src={playbackUrl}>
              Playback is not supported.
            </audio>
          ) : null}
          <div className="review-actions">
            {allowAppend ? (
              <button type="button" onClick={() => void start(true)}>
                Append segment
              </button>
            ) : null}
            <button type="button" onClick={() => void rerecord()}>
              Re-record
            </button>
            <button type="button" onClick={() => void cancel()}>
              Discard
            </button>
          </div>
          <label>
            Title
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Voice note"
            />
          </label>
          {mode !== "field" ? (
            <label>
              Destination
              <select
                value={destination}
                onChange={(event) =>
                  setDestination(event.target.value as CaptureDestination)
                }
              >
                {captureDestinations.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label>
            Tags
            <input
              value={tagText}
              onChange={(event) => setTagText(event.target.value)}
              placeholder="geometry, observation"
            />
          </label>
          <label>
            Manual text or correction (optional)
            <textarea
              value={manualText}
              onChange={(event) => setManualText(event.target.value)}
              placeholder="Add text now without waiting for transcription…"
            />
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={queueLocalTranscription}
              disabled={!localTranscriptionAvailable}
              onChange={(event) =>
                setQueueLocalTranscription(event.target.checked)
              }
            />
            <span>
              Queue no-cost local PX13 transcription
              <small>
                {localTranscriptionAvailable
                  ? "Processes after this recording is accepted."
                  : "Local companion unavailable; the recording remains fully usable."}
              </small>
            </span>
          </label>
          {saveError ? (
            <p className="recorder-error" role="alert">
              {saveError}
            </p>
          ) : null}
          <button
            className="primary-button"
            type="button"
            disabled={saving}
            onClick={() => void accept()}
          >
            {saving
              ? "Saving locally…"
              : queueLocalTranscription
                ? "Save locally & queue"
                : "Save locally"}
          </button>
          <p className="fine-print">
            Saving never depends on a transcription provider. Audio is already
            stored in IndexedDB.
          </p>
        </div>
      ) : null}
    </section>
  );
}
