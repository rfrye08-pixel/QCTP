import { useEffect, useMemo, useRef, useState } from "react";

import { contentRefFor } from "../../controlled-content";
import {
  advanceForegroundPracticeClock,
  applyActivePracticeDelta,
  BREATH_FOUNDATIONS,
  BREATH_STOP_CONDITIONS,
  createFoundationProtocol,
  createInitialFoundationProgress,
  cueAtActiveTime,
  foundationCompletionGate,
  ReadyBreathSelectionSchema,
  totalActivePracticeMilliseconds,
  type BreathCalibrationTrial,
  type BreathFoundationProtocol,
  type BreathFoundationProtocolProgress,
  type BreathFoundationProtocolSegment,
  type BreathFoundationSession,
  type BreathGoal,
  type BreathSessionRecord,
  type BreathStateRating,
  type ForegroundPracticeClock,
} from "../../breath";
import { useQctp } from "../qctp-context";
import { ContentClassBadge } from "./ContentClassBadge";

const emptyRating: BreathStateRating = {
  activation: 2,
  sleepiness: 1,
  calm: 2,
  clarity: 3,
  airHunger: 0,
};

const goalBySession: Record<BreathFoundationSession["id"], BreathGoal> = {
  "BREATH-01": "focus",
  "BREATH-02": "calm_coherence",
  "BREATH-03": "acute_reset",
  "BREATH-04": "acute_reset",
  "BREATH-05": "box_breathing",
  "BREATH-06": "alternate_nostril",
  "BREATH-07": "calibration",
};

function emptyTrial(cadenceLabel: string): BreathCalibrationTrial {
  return {
    cadenceLabel,
    physicalEase: 3,
    calm: 3,
    clarity: 3,
    airHunger: 0,
    tension: 0,
    sleepiness: 1,
    emotionalShift: 2,
    desireToContinue: 3,
    dizziness: false,
    recoveryBreathRequired: false,
  };
}

function trialRemainsComfortable(trial: BreathCalibrationTrial): boolean {
  return (
    trial.airHunger <= 1 &&
    trial.tension <= 1 &&
    !trial.dizziness &&
    !trial.recoveryBreathRequired
  );
}

function sessionSelection(
  session: BreathFoundationSession,
  protocol: BreathFoundationProtocol,
) {
  const first = protocol.segments[0]!;
  const controlledMethods = [
    ...new Set(
      protocol.segments.flatMap((segment) =>
        segment.methodId ? [segment.methodId] : [],
      ),
    ),
  ];
  return ReadyBreathSelectionSchema.parse({
    status: "ready",
    protocolId: protocol.protocolId,
    sourceClass: "qctp_regulation_support",
    contentClass: session.contentClass,
    contentRef: contentRefFor(`breath.foundation.${session.id}`),
    embeddedContentRefs: [
      ...new Map(
        protocol.segments.map(
          (segment) =>
            [segment.contentRef.authorityKey, segment.contentRef] as const,
        ),
      ).values(),
    ],
    goal: goalBySession[session.id],
    methodId: controlledMethods.length === 1 ? controlledMethods[0] : null,
    title: `Breath Foundations ${session.order}: ${session.title}`,
    cadence: first.cadence ?? {
      kind: "natural",
      instruction: "observe_without_changing",
    },
    inhaleRoute: first.inhaleRoute,
    exhaleRoute: first.exhaleRoute,
    volumeInstruction:
      "Keep every breath quiet, comfortable, and non-maximal; stop deliberate pacing on any warning sign.",
    plannedDurationSeconds: protocol.totalActiveDurationSeconds,
    permittedPostures: [
      ...new Set(protocol.segments.map((item) => item.posture)),
    ],
    transitionInstruction:
      protocol.segments.at(-1)?.instructions.at(-1) ??
      "Release pacing and return to natural breathing.",
    why: session.objectives.join(" "),
    prelude: [],
    stopConditions: BREATH_STOP_CONDITIONS,
    warnings: [
      "Only active, foreground monotonic practice time is counted.",
      "Timer completion alone grants no state or Breath capability credit.",
    ],
    grantsStateCreditFromElapsedTime: false,
  });
}

function formatClock(seconds: number): string {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function RatingFields({
  legend,
  value,
  onChange,
}: {
  legend: string;
  value: BreathStateRating;
  onChange: (next: BreathStateRating) => void;
}) {
  return (
    <fieldset className="breath-rating-grid">
      <legend>{legend}</legend>
      {(
        [
          ["activation", "Activation"],
          ["sleepiness", "Sleepiness"],
          ["calm", "Calm"],
          ["clarity", "Clarity"],
          ["airHunger", "Air hunger"],
        ] as const
      ).map(([field, label]) => (
        <label key={field}>
          <span>{label}</span>
          <input
            type="range"
            min="0"
            max="5"
            value={value[field]}
            onChange={(event) =>
              onChange({ ...value, [field]: Number(event.target.value) })
            }
          />
          <output>{value[field]}</output>
        </label>
      ))}
    </fieldset>
  );
}

function TrialFields({
  value,
  onChange,
  detailed,
}: {
  value: BreathCalibrationTrial;
  onChange: (next: BreathCalibrationTrial) => void;
  detailed: boolean;
}) {
  const fields = detailed
    ? ([
        ["physicalEase", "Physical ease"],
        ["calm", "Calm"],
        ["clarity", "Clarity"],
        ["airHunger", "Air hunger"],
        ["tension", "Tension"],
        ["sleepiness", "Sleepiness"],
        ["emotionalShift", "Emotional shift"],
        ["desireToContinue", "Desire to continue"],
      ] as const)
    : ([
        ["physicalEase", "Physical ease"],
        ["airHunger", "Air hunger"],
        ["tension", "Tension"],
      ] as const);
  return (
    <fieldset className="breath-rating-grid">
      <legend>Physical checkpoint · 0 low / 5 high</legend>
      {fields.map(([field, label]) => (
        <label key={field}>
          <span>{label}</span>
          <input
            aria-label={label}
            type="range"
            min="0"
            max="5"
            value={value[field]}
            onChange={(event) =>
              onChange({ ...value, [field]: Number(event.target.value) })
            }
          />
          <output>{value[field]}</output>
        </label>
      ))}
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={value.dizziness}
          onChange={(event) =>
            onChange({ ...value, dizziness: event.target.checked })
          }
        />
        Dizziness occurred
      </label>
      <label className="checkbox-field">
        <input
          type="checkbox"
          checked={value.recoveryBreathRequired}
          onChange={(event) =>
            onChange({
              ...value,
              recoveryBreathRequired: event.target.checked,
            })
          }
        />
        Recovery gasp or breath required
      </label>
    </fieldset>
  );
}

function isForeground(): boolean {
  return (
    document.visibilityState === "visible" &&
    (typeof document.hasFocus !== "function" || document.hasFocus())
  );
}

export function BreathFoundationsPanel() {
  const runtime = useQctp();
  // QctpRuntime methods are closure-backed callbacks and never read `this`.
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const saveBreathSession = runtime.saveBreathSession;
  const completed = useMemo(
    () =>
      new Set(
        runtime.breathSessions
          .filter(
            (record) =>
              record.status === "completed" &&
              foundationCompletionGate(record).complete,
          )
          .flatMap((record) =>
            record.foundationSessionId ? [record.foundationSessionId] : [],
          ),
      ),
    [runtime.breathSessions],
  );
  const [selectedId, setSelectedId] = useState<BreathFoundationSession["id"]>(
    () =>
      BREATH_FOUNDATIONS.find((session) => !completed.has(session.id))?.id ??
      "BREATH-07",
  );
  const selected = BREATH_FOUNDATIONS.find(
    (session) => session.id === selectedId,
  )!;
  const protocol = useMemo(
    () => createFoundationProtocol(selected),
    [selected],
  );
  const priorComplete = BREATH_FOUNDATIONS.filter(
    (session) => session.order < selected.order,
  ).every((session) => completed.has(session.id));
  const holdComfort =
    selected.id === "BREATH-05" &&
    !["QCTP-B1", "QCTP-B3"].every((method) =>
      runtime.breathProfile.comfortableMethodIds.includes(
        method as "QCTP-B1" | "QCTP-B3",
      ),
    );
  const resumeCandidate = useMemo(
    () =>
      runtime.breathSessions.find(
        (record) =>
          record.foundationSessionId === selected.id &&
          record.status === "interrupted" &&
          record.foundationProtocol?.catalogRevision ===
            "QCTP-REV3-BREATH-FOUNDATIONS-REV1" &&
          record.protocolProgress,
      ),
    [runtime.breathSessions, selected.id],
  );
  const [activeRecord, setActiveRecord] = useState<BreathSessionRecord | null>(
    null,
  );
  const activeRecordRef = useRef(activeRecord);
  const [initialState, setInitialState] = useState(emptyRating);
  const [finalState, setFinalState] = useState(emptyRating);
  const [rawObservation, setRawObservation] = useState("");
  const [interpretation, setInterpretation] = useState("");
  const [symptoms, setSymptoms] = useState("");
  const [reuse, setReuse] = useState<"yes" | "no" | "unsure">("unsure");
  const [progress, setProgress] = useState<BreathFoundationProtocolProgress[]>(
    () => createInitialFoundationProgress(protocol),
  );
  const progressRef = useRef(progress);
  const [message, setMessage] = useState("");
  const [localTones, setLocalTones] = useState(
    runtime.breathProfile.accessibility.audioTones,
  );
  const [checkpointPerformed, setCheckpointPerformed] = useState(false);
  const [checkpointSymptoms, setCheckpointSymptoms] = useState("");
  const [checkpointRating, setCheckpointRating] = useState(() =>
    emptyTrial(protocol.segments[0]!.label),
  );
  const clockRef = useRef<ForegroundPracticeClock | null>(null);
  const saveQueueRef = useRef(Promise.resolve());
  const finalizingRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const previousCueRef = useRef("");

  useEffect(() => {
    activeRecordRef.current = activeRecord;
  }, [activeRecord]);
  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);
  const activeIndex = protocol.segments.findIndex((segment, index) => {
    const item = progress[index];
    return (
      item &&
      (item.activePracticeMilliseconds < segment.durationSeconds * 1_000 ||
        !item.checkpointConfirmedAt)
    );
  });
  const activeSegment =
    activeIndex >= 0 ? (protocol.segments[activeIndex] ?? null) : null;
  const activeProgress =
    activeIndex >= 0 ? (progress[activeIndex] ?? null) : null;
  const coachedSegment: BreathFoundationProtocolSegment | null =
    activeSegment &&
    activeProgress?.executionMode === "natural_breathing_safety_substitution"
      ? {
          ...activeSegment,
          label: "Natural-breath safety substitution",
          technique: "natural_breathing",
          methodId: null,
          methodName: "Natural breathing recovery",
          cadence: {
            kind: "natural",
            instruction: "observe_without_changing",
          },
          inhaleRoute: "automatic",
          exhaleRoute: "automatic",
          instructions: [
            "The optional paced trial was withheld because the preceding physical checkpoint did not meet comfort limits.",
            "Observe natural breathing without changing it; do not attempt five/seven pacing in this session.",
          ],
          cuePhases: [
            {
              label: "Observe natural breathing",
              durationSeconds: 10,
              toneHz: 330,
            },
          ],
        }
      : activeSegment;
  const waitingForCheckpoint = Boolean(
    activeSegment &&
    activeProgress &&
    activeProgress.activePracticeMilliseconds >=
      activeSegment.durationSeconds * 1_000 &&
    !activeProgress.checkpointConfirmedAt,
  );
  const elapsedSeconds = Math.floor(
    totalActivePracticeMilliseconds(progress) / 1_000,
  );
  const cue =
    coachedSegment && activeProgress
      ? cueAtActiveTime(
          coachedSegment,
          activeProgress.activePracticeMilliseconds,
        )
      : null;

  useEffect(() => {
    if (!activeRecord) return;
    const sample = () => {
      const currentProgress = progressRef.current;
      const index = protocol.segments.findIndex((segment, position) => {
        const item = currentProgress[position];
        return (
          item &&
          (item.activePracticeMilliseconds < segment.durationSeconds * 1_000 ||
            !item.checkpointConfirmedAt)
        );
      });
      const segment = index >= 0 ? protocol.segments[index] : null;
      const item = index >= 0 ? currentProgress[index] : null;
      const countable = Boolean(
        segment &&
        item &&
        item.activePracticeMilliseconds < segment.durationSeconds * 1_000 &&
        !item.checkpointConfirmedAt &&
        isForeground(),
      );
      const now = performance.now();
      const currentClock = clockRef.current ?? {
        lastMonotonicMilliseconds: now,
        wasCountable: countable,
      };
      const advanced = advanceForegroundPracticeClock(
        currentClock,
        now,
        countable,
      );
      clockRef.current = advanced.clock;
      if (advanced.activeDeltaMilliseconds > 0) {
        setProgress((current) => {
          const next = applyActivePracticeDelta(
            protocol,
            current,
            advanced.activeDeltaMilliseconds,
          );
          progressRef.current = next;
          return next;
        });
      }
    };
    sample();
    const interval = window.setInterval(sample, 250);
    document.addEventListener("visibilitychange", sample);
    window.addEventListener("focus", sample);
    window.addEventListener("blur", sample);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", sample);
      window.removeEventListener("focus", sample);
      window.removeEventListener("blur", sample);
      sample();
    };
  }, [activeRecord, protocol]);

  useEffect(() => {
    if (!activeRecord) return;
    const timeout = window.setTimeout(() => {
      if (finalizingRef.current) return;
      const now = new Date().toISOString();
      const currentProgress = progressRef.current;
      const draft: BreathSessionRecord = {
        ...activeRecordRef.current!,
        completedDurationSeconds: Math.floor(
          totalActivePracticeMilliseconds(currentProgress) / 1_000,
        ),
        initialState,
        finalState,
        protocolProgress: currentProgress,
        symptoms: symptoms
          .split(/[\n,]/u)
          .map((item) => item.trim())
          .filter(Boolean),
        shouldReuseForGoal: reuse === "unsure" ? null : reuse === "yes",
        rawObservation,
        interpretation,
        checkpoint: {
          checkpointRevision: "QCTP-REV3-BREATH-CHECKPOINT-REV1",
          activePracticeMilliseconds:
            totalActivePracticeMilliseconds(currentProgress),
          currentSegmentId: activeSegment?.segmentId ?? null,
          savedAt: now,
        },
        status: "in_progress",
        updatedAt: now,
      };
      saveQueueRef.current = saveQueueRef.current
        .catch(() => undefined)
        .then(() => saveBreathSession(draft))
        .catch(() => {
          setMessage(
            "Checkpoint save needs retry. Keep this screen open or stop safely.",
          );
        });
    }, 50);
    return () => window.clearTimeout(timeout);
  }, [
    activeRecord,
    activeSegment?.segmentId,
    finalState,
    initialState,
    interpretation,
    progress,
    rawObservation,
    reuse,
    saveBreathSession,
    symptoms,
  ]);

  useEffect(() => {
    if (!activeRecord || waitingForCheckpoint || !cue || !localTones) return;
    const cueKey = `${coachedSegment?.segmentId}:${cue.label}`;
    if (previousCueRef.current === cueKey) return;
    previousCueRef.current = cueKey;
    const AudioContextConstructor = window.AudioContext;
    if (!AudioContextConstructor) return;
    const context = audioContextRef.current ?? new AudioContextConstructor();
    audioContextRef.current = context;
    if (context.state === "suspended") void context.resume();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = cue.toneHz ?? 330;
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.045, context.currentTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.12);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.13);
  }, [
    activeRecord,
    coachedSegment?.segmentId,
    cue,
    localTones,
    waitingForCheckpoint,
  ]);

  const start = async () => {
    if (!priorComplete || holdComfort || activeRecord) return;
    const now = new Date().toISOString();
    finalizingRef.current = false;
    const initialProgress = createInitialFoundationProgress(protocol);
    const record: BreathSessionRecord = {
      schemaVersion: 1,
      id: `breath-foundation-${crypto.randomUUID()}`,
      goal: goalBySession[selected.id],
      context: "general",
      foundationSessionId: selected.id,
      contentRef: contentRefFor(`breath.foundation.${selected.id}`),
      foundationProtocol: protocol,
      protocolProgress: initialProgress,
      checkpoint: {
        checkpointRevision: "QCTP-REV3-BREATH-CHECKPOINT-REV1",
        activePracticeMilliseconds: 0,
        currentSegmentId: protocol.segments[0]!.segmentId,
        savedAt: now,
      },
      selection: sessionSelection(selected, protocol),
      startedAt: now,
      endedAt: null,
      plannedDurationSeconds: protocol.totalActiveDurationSeconds,
      completedDurationSeconds: 0,
      initialState,
      finalState: null,
      adjustments: [],
      symptoms: [],
      shouldReuseForGoal: null,
      rawObservation: "",
      interpretation: "",
      status: "in_progress",
      stateCapabilityCreditGranted: false,
      updatedAt: now,
    };
    await saveBreathSession(record);
    setProgress(initialProgress);
    progressRef.current = initialProgress;
    setActiveRecord(record);
    clockRef.current = {
      lastMonotonicMilliseconds: performance.now(),
      wasCountable: isForeground(),
    };
    if (localTones && window.AudioContext) {
      audioContextRef.current ??= new window.AudioContext();
      void audioContextRef.current.resume();
    }
    setMessage(
      "Session saved as in progress. Active foreground practice and draft evidence are checkpointed locally.",
    );
  };

  const resume = async () => {
    if (
      !resumeCandidate?.foundationProtocol ||
      !resumeCandidate.protocolProgress
    ) {
      return;
    }
    const recoveredProtocol = resumeCandidate.foundationProtocol;
    const recoveredProgress = resumeCandidate.protocolProgress;
    finalizingRef.current = false;
    const now = new Date().toISOString();
    const record: BreathSessionRecord = {
      ...resumeCandidate,
      endedAt: null,
      status: "in_progress",
      updatedAt: now,
    };
    setInitialState(record.initialState);
    setFinalState(record.finalState ?? emptyRating);
    setRawObservation(record.rawObservation);
    setInterpretation(record.interpretation);
    setSymptoms(record.symptoms.join(", "));
    setReuse(
      record.shouldReuseForGoal === null
        ? "unsure"
        : record.shouldReuseForGoal
          ? "yes"
          : "no",
    );
    setProgress(recoveredProgress);
    progressRef.current = recoveredProgress;
    const resumeIndex = recoveredProtocol.segments.findIndex(
      (segment, index) => {
        const item = recoveredProgress[index];
        return (
          item &&
          (item.activePracticeMilliseconds < segment.durationSeconds * 1_000 ||
            !item.checkpointConfirmedAt)
        );
      },
    );
    const resumeSegment = recoveredProtocol.segments[resumeIndex];
    const resumeProgress = recoveredProgress[resumeIndex];
    setCheckpointPerformed(resumeProgress?.performedAsDirected ?? false);
    setCheckpointSymptoms(resumeProgress?.symptoms.join(", ") ?? "");
    setCheckpointRating(
      resumeProgress?.rating ??
        emptyTrial(resumeSegment?.label ?? "Checkpoint"),
    );
    await saveBreathSession(record);
    setActiveRecord(record);
    clockRef.current = {
      lastMonotonicMilliseconds: performance.now(),
      wasCountable: isForeground(),
    };
    setMessage(
      "Recovered checkpoint resumed; suspended wall time was not counted.",
    );
  };

  const confirmSegment = () => {
    if (!activeSegment || !activeProgress || !checkpointPerformed) {
      setMessage(
        "Confirm that you physically performed this segment before continuing.",
      );
      return;
    }
    const now = new Date().toISOString();
    const nextSegment = protocol.segments[activeIndex + 1];
    const useSafetySubstitution = Boolean(
      nextSegment?.comfortRequired &&
      !trialRemainsComfortable(checkpointRating),
    );
    setProgress((current) => {
      const next = current.map((item, index) =>
        item.segmentId === activeSegment.segmentId
          ? {
              ...item,
              performedAsDirected: true,
              checkpointConfirmedAt: now,
              rating: checkpointRating,
              symptoms: checkpointSymptoms
                .split(/[\n,]/u)
                .map((value) => value.trim())
                .filter(Boolean),
            }
          : index === activeIndex + 1 && useSafetySubstitution
            ? {
                ...item,
                executionMode: "natural_breathing_safety_substitution" as const,
              }
            : item,
      );
      progressRef.current = next;
      return next;
    });
    setCheckpointPerformed(false);
    setCheckpointSymptoms("");
    setCheckpointRating(
      emptyTrial(
        useSafetySubstitution
          ? "Natural-breath safety substitution"
          : (nextSegment?.label ?? "Session completion"),
      ),
    );
    setMessage(
      activeIndex === protocol.segments.length - 1
        ? "All physical checkpoints are saved. Complete the after-practice evidence."
        : "Physical checkpoint saved. The next exact protocol segment is ready.",
    );
  };

  const finalize = async (requested: "completed" | "stopped") => {
    if (!activeRecord) return;
    const now = new Date().toISOString();
    const currentProgress = progressRef.current;
    const candidate: BreathSessionRecord = {
      ...activeRecord,
      endedAt: now,
      completedDurationSeconds: Math.floor(
        totalActivePracticeMilliseconds(currentProgress) / 1_000,
      ),
      finalState,
      protocolProgress: currentProgress,
      checkpoint: {
        checkpointRevision: "QCTP-REV3-BREATH-CHECKPOINT-REV1",
        activePracticeMilliseconds:
          totalActivePracticeMilliseconds(currentProgress),
        currentSegmentId: activeSegment?.segmentId ?? null,
        savedAt: now,
      },
      symptoms: symptoms
        .split(/[\n,]/u)
        .map((item) => item.trim())
        .filter(Boolean),
      shouldReuseForGoal: reuse === "unsure" ? null : reuse === "yes",
      rawObservation,
      interpretation,
      status: requested,
      updatedAt: now,
    };
    if (requested === "completed") {
      const gate = foundationCompletionGate(candidate);
      if (!gate.complete) {
        setMessage(
          gate.reasons[0] ?? "Controlled completion evidence is incomplete.",
        );
        return;
      }
    }
    finalizingRef.current = true;
    const terminalSave = saveQueueRef.current
      .catch(() => undefined)
      .then(() => saveBreathSession(candidate));
    saveQueueRef.current = terminalSave;
    await terminalSave;
    setActiveRecord(null);
    clockRef.current = null;
    setMessage(
      requested === "completed"
        ? "Breath Foundations evidence saved. No state capability was granted."
        : "Stopped session preserved, including all checkpoints, with no completion or state credit.",
    );
  };

  return (
    <section className="panel-card breath-foundations-panel">
      <div className="card-heading">
        <div>
          <p className="eyebrow">Controlled skill path</p>
          <h2>Breath Foundations</h2>
        </div>
        <span className="counter">{completed.size} / 7 evidence-complete</span>
      </div>
      <p>
        Seven source-controlled sessions teach mechanics, correction, safe
        stopping, and calibration. Only active foreground monotonic practice
        counts; text and elapsed wall time cannot satisfy the physical gate.
      </p>
      <div className="breath-foundation-tabs" role="list">
        {BREATH_FOUNDATIONS.map((session) => (
          <button
            type="button"
            key={session.id}
            className={selected.id === session.id ? "is-active" : undefined}
            onClick={() => {
              if (!activeRecord) {
                const nextProtocol = createFoundationProtocol(session);
                const nextProgress =
                  createInitialFoundationProgress(nextProtocol);
                setSelectedId(session.id);
                setProgress(nextProgress);
                progressRef.current = nextProgress;
                setCheckpointPerformed(false);
                setCheckpointSymptoms("");
                setCheckpointRating(
                  emptyTrial(nextProtocol.segments[0]!.label),
                );
              }
            }}
          >
            <span>{session.id}</span>
            <strong>{session.title}</strong>
            <small>
              {completed.has(session.id)
                ? "Evidence saved"
                : `${Math.round(session.durationSeconds / 60)} min`}
            </small>
          </button>
        ))}
      </div>
      <article className="breath-foundation-detail">
        <header>
          <div>
            <p className="eyebrow">
              {selected.id} · {protocol.protocolId} · exact method provenance
            </p>
            <h3>{selected.title}</h3>
            <ContentClassBadge
              authorityKey={`breath.foundation.${selected.id}`}
              scope="Curriculum session"
            />
          </div>
          <strong className="breath-session-clock">
            {formatClock(
              activeRecord ? elapsedSeconds : selected.durationSeconds,
            )}
          </strong>
        </header>
        <ol className="breath-protocol-segments">
          {protocol.segments.map((segment, index) => (
            <li key={segment.segmentId}>
              <strong>{segment.label}</strong>
              <ContentClassBadge
                authorityKey={segment.contentRef.authorityKey}
                scope="Method segment"
              />
              <span>
                {segment.methodId ?? segment.methodName} ·{" "}
                {segment.durationSeconds}s · {segment.posture}
              </span>
              {activeRecord ? (
                <small>
                  {Math.floor(
                    (progress[index]?.activePracticeMilliseconds ?? 0) / 1_000,
                  )}
                  s active ·{" "}
                  {progress[index]?.checkpointConfirmedAt
                    ? "checkpoint saved"
                    : progress[index]?.executionMode ===
                        "natural_breathing_safety_substitution"
                      ? "natural safety substitution"
                      : "checkpoint pending"}
                </small>
              ) : null}
            </li>
          ))}
        </ol>
        {!priorComplete ? (
          <p className="notice-inline">
            Complete the prior Breath Foundations evidence gate first.
          </p>
        ) : null}
        {holdComfort ? (
          <p className="notice-inline">
            Box breathing remains held until both no-hold B1 and B3 are recorded
            as comfortable.
          </p>
        ) : null}
        <RatingFields
          legend="Before practice · 0 low / 5 high"
          value={initialState}
          onChange={setInitialState}
        />
        {activeRecord ? (
          <>
            {coachedSegment && activeProgress ? (
              <div className="breath-live-guidance" aria-live="polite">
                <p className="eyebrow">
                  Segment {coachedSegment.order} / {protocol.segments.length}
                </p>
                <strong>{coachedSegment.label}</strong>
                <span>
                  {coachedSegment.methodId ?? coachedSegment.methodName}
                </span>
                {!waitingForCheckpoint && cue ? (
                  <div className="breath-pacer" data-cue={cue.label}>
                    <span
                      className={`breath-pacer-orb ${
                        /inhale/u.test(cue.label.toLowerCase())
                          ? "is-inhale"
                          : /exhale/u.test(cue.label.toLowerCase())
                            ? "is-exhale"
                            : /filled/u.test(cue.label.toLowerCase())
                              ? "is-filled"
                              : /empty/u.test(cue.label.toLowerCase())
                                ? "is-empty"
                                : "is-observe"
                      }`}
                      style={{ transitionDuration: `${cue.durationSeconds}s` }}
                      aria-hidden="true"
                    />
                    <strong>{cue.label}</strong>
                    <output>{cue.remainingSeconds}</output>
                  </div>
                ) : null}
                <ul>
                  {coachedSegment.instructions.map((instruction) => (
                    <li key={instruction}>{instruction}</li>
                  ))}
                </ul>
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={localTones}
                    onChange={(event) => setLocalTones(event.target.checked)}
                  />
                  Local phase tones for eyes-closed coaching (no cloud or API)
                </label>
                {!isForeground() ? (
                  <p className="notice-inline">
                    Practice clock paused while QCTP is not visible and focused.
                  </p>
                ) : null}
              </div>
            ) : null}
            {waitingForCheckpoint && activeSegment ? (
              <div className="breath-checkpoint-card">
                <h4>Physical checkpoint · {activeSegment.label}</h4>
                <p>
                  The timer is paused. Confirm the actual practice before the
                  next method begins; text alone cannot pass this gate.
                </p>
                <TrialFields
                  value={checkpointRating}
                  onChange={(next) => {
                    setCheckpointRating(next);
                    setProgress((current) => {
                      const nextProgress = current.map((item) =>
                        item.segmentId === activeSegment.segmentId
                          ? { ...item, rating: next }
                          : item,
                      );
                      progressRef.current = nextProgress;
                      return nextProgress;
                    });
                  }}
                  detailed={selected.id === "BREATH-07"}
                />
                <label className="form-field">
                  Segment symptoms or corrections (leave blank if none)
                  <textarea
                    value={checkpointSymptoms}
                    onChange={(event) => {
                      const value = event.target.value;
                      setCheckpointSymptoms(value);
                      setProgress((current) => {
                        const nextProgress = current.map((item) =>
                          item.segmentId === activeSegment.segmentId
                            ? {
                                ...item,
                                symptoms: value
                                  .split(/[\n,]/u)
                                  .map((entry) => entry.trim())
                                  .filter(Boolean),
                              }
                            : item,
                        );
                        progressRef.current = nextProgress;
                        return nextProgress;
                      });
                    }}
                  />
                </label>
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={checkpointPerformed}
                    onChange={(event) => {
                      const checked = event.target.checked;
                      setCheckpointPerformed(checked);
                      setProgress((current) => {
                        const nextProgress = current.map((item) =>
                          item.segmentId === activeSegment.segmentId
                            ? { ...item, performedAsDirected: checked }
                            : item,
                        );
                        progressRef.current = nextProgress;
                        return nextProgress;
                      });
                    }}
                  />
                  I physically performed this exact segment as directed
                </label>
                <button
                  type="button"
                  className="primary-button"
                  onClick={confirmSegment}
                >
                  Save checkpoint and continue
                </button>
              </div>
            ) : null}
            <details className="breath-stop-list">
              <summary>Stop conditions</summary>
              <ul>
                {BREATH_STOP_CONDITIONS.map((condition) => (
                  <li key={condition}>{condition}</li>
                ))}
              </ul>
            </details>
            <RatingFields
              legend="After practice · 0 low / 5 high"
              value={finalState}
              onChange={setFinalState}
            />
            <label className="form-field">
              Raw observation
              <textarea
                value={rawObservation}
                onChange={(event) => setRawObservation(event.target.value)}
              />
            </label>
            <label className="form-field">
              Later interpretation
              <textarea
                value={interpretation}
                onChange={(event) => setInterpretation(event.target.value)}
              />
            </label>
            <label className="form-field">
              Session symptoms or corrections, comma separated
              <textarea
                value={symptoms}
                onChange={(event) => setSymptoms(event.target.value)}
              />
            </label>
            <label className="compact-field">
              Reuse for this goal?
              <select
                value={reuse}
                onChange={(event) =>
                  setReuse(event.target.value as typeof reuse)
                }
              >
                <option value="unsure">Unsure</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </label>
            <div className="platform-action-row">
              <button
                type="button"
                className="primary-button"
                onClick={() => void finalize("completed")}
              >
                Finish and save evidence
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => void finalize("stopped")}
              >
                Stop safely and preserve
              </button>
            </div>
          </>
        ) : (
          <div className="platform-action-row">
            <button
              className="primary-button"
              type="button"
              disabled={
                !priorComplete || holdComfort || completed.has(selected.id)
              }
              onClick={() => void start()}
            >
              {completed.has(selected.id)
                ? "Evidence already saved"
                : "Start controlled session"}
            </button>
            {resumeCandidate ? (
              <button
                className="secondary-button"
                type="button"
                onClick={() => void resume()}
              >
                Resume saved checkpoint
              </button>
            ) : null}
          </div>
        )}
        {message ? <p className="save-status">{message}</p> : null}
      </article>
    </section>
  );
}
