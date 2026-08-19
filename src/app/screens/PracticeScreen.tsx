import { useCallback, useEffect, useRef, useState } from "react";

import {
  getSequencerProgress,
  getSequencerRemainingSeconds,
  reduceSequencer,
  type SequencerEvent,
} from "../../audio-player";
import {
  CHILL_BRIAN_AUDIO,
  createDay1SequencerState,
  DAY1_LESSON_PARAGRAPHS,
  type Day1Cue,
  type Day1CueMode,
  type Day1SequencerState,
} from "../../foundation";
import { ScreenHeader } from "../components/ScreenHeader";
import { StatusBadge } from "../components/StatusBadge";

export interface PracticeScreenProps {
  cueMode?: Day1CueMode;
  testMode?: boolean;
  onMorningComplete?: () => Promise<void> | void;
}

const SILENT_AUDIO_DATA_URL =
  "data:audio/wav;base64,UklGRsQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YaAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

function formatSeconds(seconds: number): string {
  const wholeSeconds = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(wholeSeconds / 60)}:${String(wholeSeconds % 60).padStart(2, "0")}`;
}

export function PracticeScreen({
  cueMode: initialCueMode = "guided",
  testMode = false,
  onMorningComplete,
}: PracticeScreenProps) {
  const [cueMode, setCueMode] = useState<Day1CueMode>(initialCueMode);
  const [sequencer, setSequencer] = useState<Day1SequencerState>(() =>
    createDay1SequencerState({ cueMode: initialCueMode, testMode }),
  );
  const [lessonPlaying, setLessonPlaying] = useState(false);
  const [wakeStatus, setWakeStatus] = useState("Not requested");
  const [audioIssue, setAudioIssue] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const sequencerRef = useRef(sequencer);
  const lessonRef = useRef<HTMLAudioElement | null>(null);
  const cueAudioRef = useRef<HTMLAudioElement | null>(null);
  const cueAudioPrimedRef = useRef(false);
  const testToneContextRef = useRef<AudioContext | null>(null);
  const dispatchRef = useRef<(event: SequencerEvent) => void>(() => undefined);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  const releaseWakeLock = useCallback(async () => {
    const current = wakeLockRef.current;
    wakeLockRef.current = null;
    if (!current) return;
    try {
      await current.release();
    } finally {
      setWakeStatus("Released");
    }
  }, []);

  const requestWakeLock = useCallback(async () => {
    const wakeLock = "wakeLock" in navigator ? navigator.wakeLock : undefined;
    if (!wakeLock) {
      setWakeStatus("Unsupported; keep the screen awake");
      return;
    }
    if (document.visibilityState !== "visible") {
      setWakeStatus("Waiting for foreground");
      return;
    }
    try {
      wakeLockRef.current = await wakeLock.request("screen");
      setWakeStatus("Active");
    } catch {
      setWakeStatus("Unavailable; keep the screen awake");
    }
  }, []);

  const getCueAudio = useCallback(() => {
    if (cueAudioRef.current) return cueAudioRef.current;
    const audio = new Audio();
    audio.preload = "auto";
    cueAudioRef.current = audio;
    return audio;
  }, []);

  const primeCueAudio = useCallback(() => {
    if (cueAudioPrimedRef.current) return;
    const audio = getCueAudio();
    const priorVolume = audio.volume;
    audio.pause();
    audio.volume = 0;
    audio.src = SILENT_AUDIO_DATA_URL;
    audio.currentTime = 0;
    audio.load();
    void audio
      .play()
      .then(() => {
        cueAudioPrimedRef.current = true;
        audio.pause();
        audio.currentTime = 0;
        audio.removeAttribute("src");
        audio.load();
        audio.volume = priorVolume;
      })
      .catch(() => {
        audio.volume = priorVolume;
      });
  }, [getCueAudio]);

  const getTestToneContext = useCallback(() => {
    if (testToneContextRef.current) return testToneContextRef.current;
    if (typeof navigator !== "undefined" && navigator.webdriver) {
      return null;
    }
    if (typeof AudioContext === "undefined") return null;
    try {
      const context = new AudioContext();
      testToneContextRef.current = context;
      return context;
    } catch {
      return null;
    }
  }, []);

  const primeTestTone = useCallback(() => {
    const context = getTestToneContext();
    if (!context || context.state !== "suspended") return;
    void context.resume().catch(() => undefined);
  }, [getTestToneContext]);

  const playTestMarker = useCallback(() => {
    const context = getTestToneContext();
    if (!context) return;

    const emit = () => {
      try {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.frequency.value = 660;
        gain.gain.setValueAtTime(0.0001, context.currentTime);
        gain.gain.exponentialRampToValueAtTime(
          0.06,
          context.currentTime + 0.01,
        );
        gain.gain.exponentialRampToValueAtTime(
          0.0001,
          context.currentTime + 0.12,
        );
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start();
        oscillator.stop(context.currentTime + 0.13);
      } catch {
        // Verification timing remains valid when the local marker is unavailable.
      }
    };

    if (context.state === "suspended") {
      void context
        .resume()
        .then(emit)
        .catch(() => undefined);
      return;
    }
    emit();
  }, [getTestToneContext]);

  const playCue = useCallback(
    (cue: Day1Cue) => {
      if (testMode) {
        setAudioIssue(null);
        playTestMarker();
        return;
      }

      const audio = getCueAudio();
      audio.pause();
      audio.preload = "auto";
      audio.volume = 1;
      audio.src = cue.audioUrl;
      audio.currentTime = 0;
      audio.load();
      setAudioIssue(null);
      void audio
        .play()
        .then(() => {
          cueAudioPrimedRef.current = true;
        })
        .catch(() => {
          setAudioIssue(
            "Guide audio could not start, so the timer was paused. Check the iPhone media volume and connection, then tap Resume to retry.",
          );
          if (sequencerRef.current.status === "running") {
            dispatchRef.current({
              type: "pause",
              nowMs: performance.now(),
            });
            void releaseWakeLock();
          }
        });
    },
    [getCueAudio, playTestMarker, releaseWakeLock, testMode],
  );

  const dispatch = useCallback(
    (event: SequencerEvent) => {
      const transition = reduceSequencer(sequencerRef.current, event);
      sequencerRef.current = transition.state;
      setSequencer(transition.state);
      for (const effect of transition.effects) {
        if (effect.type === "cue") playCue(effect.cue);
        if (effect.type === "completed") {
          setSaveStatus("Saving natural completion locally…");
          void Promise.resolve(onMorningComplete?.())
            .then(() =>
              setSaveStatus("Day 1 morning completion saved locally."),
            )
            .catch(() =>
              setSaveStatus(
                "Practice completed. Local completion could not be saved yet.",
              ),
            );
          void releaseWakeLock();
        }
        if (effect.type === "ended") void releaseWakeLock();
      }
    },
    [onMorningComplete, playCue, releaseWakeLock],
  );

  useEffect(() => {
    dispatchRef.current = dispatch;
  }, [dispatch]);

  const startPractice = useCallback(() => {
    lessonRef.current?.pause();
    setLessonPlaying(false);
    setSaveStatus(null);
    setAudioIssue(null);
    if (testMode) primeTestTone();
    if (
      sequencerRef.current.status === "ended" ||
      sequencerRef.current.status === "completed"
    ) {
      const fresh = createDay1SequencerState({ cueMode, testMode });
      sequencerRef.current = fresh;
      setSequencer(fresh);
    }
    dispatch({ type: "start", nowMs: performance.now() });
    void requestWakeLock();
  }, [cueMode, dispatch, primeTestTone, requestWakeLock, testMode]);

  useEffect(() => {
    if (sequencer.status !== "running") return;
    const handle = window.setInterval(() => {
      dispatch({ type: "tick", nowMs: performance.now() });
    }, 200);
    return () => window.clearInterval(handle);
  }, [dispatch, sequencer.status]);

  useEffect(() => {
    const restoreWakeLock = () => {
      if (
        document.visibilityState === "visible" &&
        sequencerRef.current.status === "running"
      ) {
        void requestWakeLock();
      }
    };
    document.addEventListener("visibilitychange", restoreWakeLock);
    return () =>
      document.removeEventListener("visibilitychange", restoreWakeLock);
  }, [requestWakeLock]);

  useEffect(
    () => () => {
      lessonRef.current?.pause();
      const cueAudio = cueAudioRef.current;
      cueAudioRef.current = null;
      if (cueAudio) {
        cueAudio.pause();
        cueAudio.removeAttribute("src");
        cueAudio.load();
      }
      const testToneContext = testToneContextRef.current;
      testToneContextRef.current = null;
      if (testToneContext) void testToneContext.close();
      const current = wakeLockRef.current;
      wakeLockRef.current = null;
      if (current) void current.release();
    },
    [],
  );

  const pauseOrResume = () => {
    const nowMs = performance.now();
    if (sequencer.status === "running") {
      cueAudioRef.current?.pause();
      dispatch({ type: "pause", nowMs });
      void releaseWakeLock();
    } else if (sequencer.status === "paused") {
      dispatch({ type: "resume", nowMs });
      void requestWakeLock();
      const cueAudio = cueAudioRef.current;
      if (!testMode && cueAudio?.src && !cueAudio.ended) {
        void cueAudio
          .play()
          .then(() => setAudioIssue(null))
          .catch(() =>
            setAudioIssue(
              "Guide audio is still blocked. Keep the screen open, check media volume and connection, then tap Pause and Resume once more.",
            ),
          );
      }
    }
  };

  const endPractice = () => {
    cueAudioRef.current?.pause();
    dispatch({ type: "end", nowMs: performance.now() });
  };

  const changeCueMode = (nextMode: Day1CueMode) => {
    if (sequencer.status !== "idle") return;
    setCueMode(nextMode);
    const next = createDay1SequencerState({ cueMode: nextMode, testMode });
    sequencerRef.current = next;
    setSequencer(next);
  };

  const remaining = getSequencerRemainingSeconds(sequencer);
  const progress = getSequencerProgress(sequencer) * 100;
  const activeCue = sequencer.activeCue;

  return (
    <>
      <ScreenHeader eyebrow="Foundation · Released Day 1" title="State Control">
        <p>
          The protected lesson and exact 1,500-second Chill Brian practice
          sequence.
        </p>
      </ScreenHeader>

      <section className="panel-card lesson-card">
        <div className="card-heading">
          <div>
            <p className="eyebrow">Lesson narration</p>
            <h2>Learn the control layer</h2>
          </div>
          <StatusBadge status="released" />
        </div>
        <details>
          <summary>Read the complete Day 1 lesson</summary>
          <div className="lesson-copy">
            {DAY1_LESSON_PARAGRAPHS.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
        </details>
        <audio
          ref={lessonRef}
          controls
          preload="metadata"
          src={CHILL_BRIAN_AUDIO.lesson}
          onPointerDown={primeCueAudio}
          onPlay={() => {
            setLessonPlaying(true);
            primeCueAudio();
          }}
          onPause={() => setLessonPlaying(false)}
          onEnded={startPractice}
          onError={() =>
            setAudioIssue(
              "The lesson narration could not load. The exact written lesson remains available.",
            )
          }
        >
          The Day 1 narration is not supported in this browser.
        </audio>
        <p className="fine-print">
          {lessonPlaying
            ? "Chill Brian narration is playing. The practice begins when the lesson ends."
            : "Static pre-rendered narration; no metered text-to-speech call is made."}
        </p>
      </section>

      <section className="hero-card practice-player">
        <div className="card-heading">
          <div>
            <p className="eyebrow">Guided practice</p>
            <h2>{testMode ? "90-second verification" : "25:00 exact"}</h2>
          </div>
          <StatusBadge
            status={sequencer.status === "completed" ? "released" : "ready"}
          />
        </div>

        <div className="cue-display" aria-live="polite">
          <p className="phase-label">
            {activeCue?.phase ??
              (sequencer.status === "idle" ? "Ready" : sequencer.status)}
          </p>
          <p>
            {activeCue?.text ??
              "Put the phone face-down after starting. Spoken cues are separated by real silence."}
          </p>
          <strong className="practice-timer" data-testid="practice-timer">
            {formatSeconds(remaining)}
          </strong>
        </div>
        <div
          className="timeline"
          aria-label={`${Math.round(progress)} percent complete`}
        >
          <div style={{ width: `${progress}%` }} />
        </div>

        <div className="practice-controls">
          {sequencer.status === "idle" ||
          sequencer.status === "ended" ||
          sequencer.status === "completed" ? (
            <button
              className="primary-button"
              type="button"
              onClick={startPractice}
            >
              {sequencer.status === "idle" ? "Begin practice" : "Start again"}
            </button>
          ) : (
            <button
              className="primary-button"
              type="button"
              onClick={pauseOrResume}
            >
              {sequencer.status === "running" ? "Pause" : "Resume"}
            </button>
          )}
          {sequencer.status === "running" || sequencer.status === "paused" ? (
            <button
              className="secondary-button"
              type="button"
              onClick={endPractice}
            >
              End without completion
            </button>
          ) : null}
        </div>

        <label className="compact-field">
          Guidance mode
          <select
            value={cueMode}
            disabled={sequencer.status !== "idle"}
            onChange={(event) =>
              changeCueMode(event.target.value as Day1CueMode)
            }
          >
            <option value="guided">Guided · all 21 cues</option>
            <option value="light">Light guidance</option>
            <option value="minimal">Minimal guidance</option>
          </select>
        </label>
        <p className="screen-status">
          <strong>Screen awake:</strong> {wakeStatus}
        </p>
        {testMode ? (
          <p className="notice-inline">
            Verification mode uses local tone markers and can never earn morning
            completion.
          </p>
        ) : null}
        {audioIssue ? (
          <p className="recorder-error" role="alert">
            {audioIssue}
          </p>
        ) : null}
        {saveStatus ? (
          <p className="save-status" role="status">
            {saveStatus}
          </p>
        ) : null}
      </section>
    </>
  );
}
