import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  markPwaCriticalActivityActive,
  markPwaCriticalActivityIdle,
} from "../app/pwa-update-safety";
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
  GLOBAL_CAPTURE_CONTEXT,
  timedCaptureMinutes,
  type AcceptedCapture,
  type CaptureContext,
  type CaptureDestination,
  type CaptureMode,
  type TimedCaptureMinutes,
} from "./capture-types";

export interface VoiceRecorderPanelProps {
  persistence: CapturePersistence;
  mode?: CaptureMode;
  allowModeSelection?: boolean;
  initialDestination?: CaptureDestination;
  captureContext?: CaptureContext;
  fixedAutoDurationMinutes?: TimedCaptureMinutes | null;
  initialTitle?: string;
  initialTags?: readonly string[];
  defaultQueueLocalTranscription?: boolean;
  localTranscriptionAvailable?: boolean;
  allowPause?: boolean;
  allowAppend?: boolean;
  onAccept: (capture: AcceptedCapture) => Promise<void>;
  onClose: () => void;
}

function formatDuration(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1_000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function formatDurationForAssistiveTech(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1_000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes} minute${minutes === 1 ? "" : "s"} ${seconds} second${seconds === 1 ? "" : "s"}`;
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
  allowModeSelection = false,
  initialDestination = "unclassified",
  captureContext = GLOBAL_CAPTURE_CONTEXT,
  fixedAutoDurationMinutes = null,
  initialTitle = "",
  initialTags = [],
  defaultQueueLocalTranscription,
  localTranscriptionAvailable = false,
  allowPause = true,
  allowAppend = false,
  onAccept,
  onClose,
}: VoiceRecorderPanelProps) {
  const [recorderState, setRecorderState] = useState<RecorderState>(
    INITIAL_RECORDER_STATE,
  );
  const [displayedElapsedMs, setDisplayedElapsedMs] = useState(0);
  const [selectableMode, setSelectableMode] = useState<
    "quick" | "auto-dictation"
  >(mode === "auto-dictation" ? "auto-dictation" : "quick");
  const [autoMinutes, setAutoMinutes] = useState<TimedCaptureMinutes>(
    fixedAutoDurationMinutes ?? 5,
  );
  const [destination, setDestination] =
    useState<CaptureDestination>(initialDestination);
  const [title, setTitle] = useState(initialTitle);
  const [tagText, setTagText] = useState(initialTags.join(", "));
  const [manualText, setManualText] = useState("");
  const [queueLocalTranscription, setQueueLocalTranscription] = useState(
    defaultQueueLocalTranscription ??
      (mode === "auto-dictation" || localTranscriptionAvailable),
  );
  const [playbackUrl, setPlaybackUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const sessionRef = useRef<BrowserRecorderSession | null>(null);
  const acceptingRef = useRef(false);
  const recorderInstanceId = useId();
  const updateSafetyActivityId = `voice-capture-${recorderInstanceId}`;

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

  const captureMode = allowModeSelection ? selectableMode : mode;
  const selectedAutoMinutes = fixedAutoDurationMinutes ?? autoMinutes;
  const durationLimitMs =
    captureMode === "auto-dictation" ? selectedAutoMinutes * 60_000 : null;
  const elapsedMs = displayedElapsedMs;
  const remainingMs =
    durationLimitMs === null ? null : Math.max(0, durationLimitMs - elapsedMs);
  const isActive =
    recorderState.phase === "recording" || recorderState.phase === "paused";
  const isReview = recorderState.phase === "review";
  const completedByDurationLimit =
    recorderState.stopReason === "duration-limit";
  const mayAppend =
    allowAppend &&
    !(
      captureMode === "auto-dictation" &&
      (completedByDurationLimit || remainingMs === 0)
    );
  const hasCapture =
    recorderState.recordingId !== null || recorderState.sizeBytes > 0;
  const updateCritical =
    saving ||
    [
      "requesting-permission",
      "recording",
      "paused",
      "finalizing",
      "review",
      "saving",
    ].includes(recorderState.phase);
  useEffect(() => {
    if (updateCritical) {
      markPwaCriticalActivityActive(updateSafetyActivityId);
    } else {
      markPwaCriticalActivityIdle(updateSafetyActivityId);
    }
    return () => markPwaCriticalActivityIdle(updateSafetyActivityId);
  }, [updateCritical, updateSafetyActivityId]);
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
    if (recorderState.phase === "finalizing")
      return "Microphone off — securing local audio";
    if (recorderState.phase === "review") {
      if (recorderState.stopReason === "interrupted") {
        return captureMode === "auto-dictation"
          ? `Recording interrupted at ${formatDuration(elapsedMs)} — recovered audio is safe locally and ready to review.`
          : "Recording interrupted — recovered audio is safe locally and ready to review";
      }
      if (captureMode === "auto-dictation") {
        return completedByDurationLimit
          ? `Timer complete — the full ${selectedAutoMinutes}-minute recording is safe locally.`
          : `Stopped early at ${formatDuration(elapsedMs)} — captured audio is safe locally.${mayAppend ? " You can append up to the selected limit." : ""}`;
      }
      return "Stopped — locally safe and ready to review";
    }
    if (recorderState.phase === "error") return "Recording needs attention";
    return "Ready — microphone is off";
  }, [
    captureMode,
    completedByDurationLimit,
    elapsedMs,
    mayAppend,
    recorderState.pauseReason,
    recorderState.phase,
    recorderState.stopReason,
    selectedAutoMinutes,
  ]);

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
        captureMode,
        captureContext,
        onCaptureReady: (blob) => {
          setPlaybackUrl((currentUrl) => {
            if (currentUrl) URL.revokeObjectURL(currentUrl);
            return URL.createObjectURL(blob);
          });
        },
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
      captureContext,
      captureMode,
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
    await sessionRef.current?.stop();
  }, []);

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
    if (acceptingRef.current) return;
    acceptingRef.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      await onAccept({
        recordingId: recorderState.recordingId,
        title:
          title.trim() ||
          (captureMode === "auto-dictation"
            ? `${selectedAutoMinutes}-minute Auto-Dictation`
            : "Voice note"),
        destination,
        tags: tagText
          .split(",")
          .map((tag) => tag.trim().toLowerCase())
          .filter(Boolean),
        durationMs: Math.round(recorderState.accumulatedMs),
        mimeType: recorderState.mimeType,
        manualText: manualText.trim(),
        captureMode,
        requestedDurationMinutes:
          captureMode === "auto-dictation" ? selectedAutoMinutes : null,
        completedByDurationLimit,
        context: captureContext,
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
      acceptingRef.current = false;
      setSaving(false);
    }
  }, [
    captureContext,
    captureMode,
    completedByDurationLimit,
    destination,
    isReview,
    manualText,
    onAccept,
    onClose,
    queueLocalTranscription,
    recorderState.accumulatedMs,
    recorderState.mimeType,
    recorderState.recordingId,
    selectedAutoMinutes,
    tagText,
    title,
  ]);

  return (
    <section className="voice-recorder">
      <div
        className="recorder-state-row"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <span
          className={`recording-indicator phase-${recorderState.phase}`}
          aria-hidden="true"
        />
        <strong>{phaseLabel}</strong>
      </div>

      {allowModeSelection && recorderState.phase === "idle" ? (
        <fieldset className="capture-mode-picker">
          <legend>Capture mode</legend>
          <label>
            <input
              type="radio"
              name={`${recorderInstanceId}-capture-mode`}
              value="quick"
              checked={selectableMode === "quick"}
              onChange={() => setSelectableMode("quick")}
            />
            <span>
              Quick voice note
              <small>Record until you choose Stop.</small>
            </span>
          </label>
          <label>
            <input
              type="radio"
              name={`${recorderInstanceId}-capture-mode`}
              value="auto-dictation"
              checked={selectableMode === "auto-dictation"}
              onChange={() => {
                setSelectableMode("auto-dictation");
                if (defaultQueueLocalTranscription === undefined) {
                  setQueueLocalTranscription(true);
                }
              }}
            />
            <span>
              Timed Auto-Dictation
              <small>Stops locally at the selected limit.</small>
            </span>
          </label>
        </fieldset>
      ) : null}

      {captureMode === "auto-dictation" &&
      recorderState.phase === "idle" &&
      fixedAutoDurationMinutes === null ? (
        <fieldset className="duration-picker">
          <legend>Auto-Dictation duration</legend>
          {timedCaptureMinutes.map((minutes) => (
            <label key={minutes}>
              <input
                type="radio"
                name={`${recorderInstanceId}-auto-duration`}
                value={minutes}
                checked={autoMinutes === minutes}
                onChange={() => setAutoMinutes(minutes)}
              />
              {minutes} minutes
            </label>
          ))}
        </fieldset>
      ) : null}

      {captureMode === "auto-dictation" &&
      recorderState.phase === "idle" &&
      fixedAutoDurationMinutes !== null ? (
        <p className="controlled-duration">
          Controlled duration: {fixedAutoDurationMinutes} minutes
        </p>
      ) : null}

      <div
        className="recorder-clock"
        data-testid="recorder-clock"
        role="timer"
        aria-label={
          remainingMs === null
            ? `${formatDurationForAssistiveTech(elapsedMs)} elapsed`
            : `${formatDurationForAssistiveTech(remainingMs)} remaining`
        }
      >
        <strong>{formatDuration(remainingMs ?? elapsedMs)}</strong>
        <small>{remainingMs === null ? "elapsed" : "remaining"}</small>
      </div>
      <div
        className="level-meter"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(recorderState.level * 100)}
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
            <span className="record-dot" aria-hidden="true" />{" "}
            {captureMode === "auto-dictation"
              ? `Start ${selectedAutoMinutes}-minute Auto-Dictation`
              : "Start recording"}
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
          {captureMode === "auto-dictation" ? (
            <p className="recorder-interruption-note">
              Keep QCTP visible. If iPhone backgrounds or locks QCTP, recording
              stops safely and captured audio remains recoverable.
            </p>
          ) : null}
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
            {mayAppend ? (
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
          {captureMode !== "debrief" ? (
            <label>
              Title
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Voice note"
              />
            </label>
          ) : null}
          {captureMode !== "field" && captureMode !== "debrief" ? (
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
          {captureMode !== "debrief" ? (
            <label>
              Tags
              <input
                value={tagText}
                onChange={(event) => setTagText(event.target.value)}
                placeholder="geometry, observation"
              />
            </label>
          ) : null}
          <label>
            {captureMode === "debrief"
              ? "Optional typed raw observation"
              : "Manual text or correction (optional)"}
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
              onChange={(event) =>
                setQueueLocalTranscription(event.target.checked)
              }
            />
            <span>
              Queue no-cost local PX13 transcription
              <small>
                {localTranscriptionAvailable
                  ? "Processes after this recording is accepted."
                  : "Stays queued locally until the PX13 companion is available; the recording remains fully usable."}
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
