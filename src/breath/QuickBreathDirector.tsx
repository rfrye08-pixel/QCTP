import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import { ContentClassBadge } from "../app/components/ContentClassBadge";
import { selectBreathProtocol } from "./director";
import type {
  BreathCadence,
  BreathGoal,
  BreathHazard,
  BreathMethodId,
  BreathPosture,
  BreathRoute,
  BreathSelection,
  ParsedBreathDirectorInput,
  ReadyBreathSelection,
} from "./types";

import "./quick-breath-director.css";

export interface QuickBreathCuePreferences {
  visualPacer: boolean;
  localTones: boolean;
  haptics: boolean;
}

export interface QuickBreathDirectorPreferences {
  director: ParsedBreathDirectorInput;
  cues: QuickBreathCuePreferences;
}

export interface QuickBreathDirectorProps {
  preferences: QuickBreathDirectorPreferences;
  onPreferencesChange: (preferences: QuickBreathDirectorPreferences) => void;
  className?: string;
}

const GOAL_OPTIONS: ReadonlyArray<readonly [BreathGoal, string]> = [
  ["calm_coherence", "Calm and coherence"],
  ["acute_reset", "Acute reset"],
  ["focus", "Alert focus"],
  ["meditation_gap", "Meditation / Gap entry"],
  ["sleep", "Sleep preparation"],
  ["focus10_obe", "Focus 10 / OBE preparation"],
  ["remote_viewing", "Remote-viewing preparation"],
  ["walking", "Walking regulation"],
  ["alternate_nostril", "Alternate-nostril practice"],
  ["box_breathing", "Box-breathing practice"],
  ["calibration", "Personal calibration"],
];

const POSTURE_OPTIONS: ReadonlyArray<readonly [BreathPosture, string]> = [
  ["seated", "Seated"],
  ["lying", "Lying down"],
  ["standing", "Standing"],
  ["walking", "Walking"],
];

const HAZARD_OPTIONS: ReadonlyArray<readonly [BreathHazard, string]> = [
  ["none", "Safe practice setting"],
  ["driving", "Driving"],
  ["machinery", "Using machinery"],
  ["ladder", "On a ladder / at height"],
  ["water", "In or near water"],
  ["other_hazard", "Another hazardous activity"],
];

const ROUTE_LABELS: Record<BreathRoute, string> = {
  nose: "nose",
  mouth: "mouth",
  nose_default_mouth_if_restrictive: "nose; mouth if restrictive",
  alternating_nostrils: "alternating nostrils",
  comfortable_route: "comfortable route",
  automatic: "automatic / natural",
};

interface PacerStep {
  id: string;
  label: string;
  seconds: number;
  cue: "inhale" | "exhale" | "hold" | "neutral";
}

type PacerStyle = CSSProperties & { "--qctp-pacer-seconds": string };

function cadenceLabel(cadence: BreathCadence): string {
  switch (cadence.kind) {
    case "timed": {
      const parts = [
        `${cadence.inhaleSeconds}s inhale`,
        ...(cadence.secondInhaleSeconds
          ? [`${cadence.secondInhaleSeconds}s second inhale`]
          : []),
        ...(cadence.inhaleHoldSeconds
          ? [`${cadence.inhaleHoldSeconds}s hold`]
          : []),
        `${cadence.exhaleSeconds}s exhale`,
        ...(cadence.exhaleHoldSeconds
          ? [`${cadence.exhaleHoldSeconds}s empty hold`]
          : []),
      ];
      return parts.join(" · ");
    }
    case "double_inhale":
      return "Gentle inhale · small top-off · long smooth exhale · no hold";
    case "alternate_nostril":
      return `${cadence.leftInhaleSeconds}s inhale left · ${cadence.rightExhaleSeconds}s exhale right · ${cadence.rightInhaleSeconds}s inhale right · ${cadence.leftExhaleSeconds}s exhale left`;
    case "steps":
      return `${cadence.inhaleSteps} walking steps in · ${cadence.exhaleSteps} walking steps out · no hold`;
    case "natural":
      return "Observe natural breathing without changing it";
    case "calibration":
      return cadence.phases
        .map(
          (phase) =>
            `${phase.label} (${Math.round(phase.durationSeconds / 60)} min)`,
        )
        .join(" · ");
  }
}

function pacingSteps(cadence: BreathCadence): PacerStep[] {
  if (cadence.kind === "timed") {
    return [
      {
        id: "inhale",
        label: "Inhale gently",
        seconds: cadence.inhaleSeconds,
        cue: "inhale",
      },
      ...(cadence.secondInhaleSeconds
        ? [
            {
              id: "second-inhale",
              label: "Small second inhale",
              seconds: cadence.secondInhaleSeconds,
              cue: "inhale" as const,
            },
          ]
        : []),
      ...(cadence.inhaleHoldSeconds
        ? [
            {
              id: "inhale-hold",
              label: "Hold comfortably",
              seconds: cadence.inhaleHoldSeconds,
              cue: "hold" as const,
            },
          ]
        : []),
      {
        id: "exhale",
        label: "Exhale smoothly",
        seconds: cadence.exhaleSeconds,
        cue: "exhale",
      },
      ...(cadence.exhaleHoldSeconds
        ? [
            {
              id: "exhale-hold",
              label: "Rest empty without strain",
              seconds: cadence.exhaleHoldSeconds,
              cue: "hold" as const,
            },
          ]
        : []),
    ];
  }
  if (cadence.kind === "alternate_nostril") {
    return [
      {
        id: "left-inhale",
        label: "Inhale left",
        seconds: cadence.leftInhaleSeconds,
        cue: "inhale",
      },
      {
        id: "right-exhale",
        label: "Exhale right",
        seconds: cadence.rightExhaleSeconds,
        cue: "exhale",
      },
      {
        id: "right-inhale",
        label: "Inhale right",
        seconds: cadence.rightInhaleSeconds,
        cue: "inhale",
      },
      {
        id: "left-exhale",
        label: "Exhale left",
        seconds: cadence.leftExhaleSeconds,
        cue: "exhale",
      },
    ];
  }
  return [];
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "Controlled by the active source practice";
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return remainder === 0
    ? `${minutes} minute${minutes === 1 ? "" : "s"}`
    : `${minutes}:${String(remainder).padStart(2, "0")}`;
}

function emitLocalCue(
  step: PacerStep,
  cues: QuickBreathCuePreferences,
  audioContextRef: { current: AudioContext | null },
): void {
  if (cues.haptics && typeof navigator.vibrate === "function") {
    navigator.vibrate(step.cue === "inhale" ? 35 : 20);
  }
  if (!cues.localTones || typeof window.AudioContext === "undefined") return;
  try {
    const context = audioContextRef.current ?? new AudioContext();
    audioContextRef.current = context;
    if (context.state === "suspended") void context.resume();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value =
      step.cue === "inhale" ? 528 : step.cue === "exhale" ? 396 : 440;
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.035, context.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.12);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.13);
  } catch {
    // A blocked local cue never blocks the visual or silent practice.
  }
}

function BreathPacer({
  selection,
  cues,
}: {
  selection: ReadyBreathSelection;
  cues: QuickBreathCuePreferences;
}) {
  const steps = useMemo(() => pacingSteps(selection.cadence), [selection]);
  const [running, setRunning] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const step = steps[stepIndex] ?? null;

  useEffect(() => {
    if (!running || !step || steps.length === 0) return;
    emitLocalCue(step, cues, audioContextRef);
    const handle = window.setTimeout(() => {
      setStepIndex((current) => (current + 1) % steps.length);
    }, step.seconds * 1_000);
    return () => window.clearTimeout(handle);
  }, [cues, running, step, steps.length]);

  useEffect(
    () => () => {
      if (audioContextRef.current) void audioContextRef.current.close();
    },
    [],
  );

  if (steps.length === 0) {
    return (
      <div className="qctp-breath-pacer qctp-breath-pacer-static">
        <strong>Self-paced visual guide</strong>
        <p>{cadenceLabel(selection.cadence)}</p>
        <small>
          This method has no model-authored phase timer. Follow the controlled
          steps without forcing a pace.
        </small>
      </div>
    );
  }

  const pacerStyle: PacerStyle = {
    "--qctp-pacer-seconds": `${step?.seconds ?? 1}s`,
  };
  return (
    <div className="qctp-breath-pacer">
      <div
        className={`qctp-breath-orb qctp-breath-orb-${step?.cue ?? "neutral"}${running ? " is-running" : ""}${cues.visualPacer ? "" : " is-visually-muted"}`}
        style={pacerStyle}
        aria-hidden="true"
      />
      <p className="qctp-breath-phase" aria-live="polite">
        <strong>{running ? step?.label : "Pacer ready"}</strong>
        <span>
          {running && step
            ? `${step.seconds} seconds`
            : cadenceLabel(selection.cadence)}
        </span>
      </p>
      <button
        type="button"
        className={running ? "qctp-breath-stop" : "qctp-breath-start"}
        onClick={() => {
          if (running) {
            setRunning(false);
            setStepIndex(0);
          } else {
            if (cues.localTones && typeof window.AudioContext !== "undefined") {
              try {
                audioContextRef.current ??= new AudioContext();
                if (audioContextRef.current.state === "suspended") {
                  void audioContextRef.current.resume().catch(() => undefined);
                }
              } catch {
                // Local tone activation is optional; silent pacing remains ready.
              }
            }
            setStepIndex(0);
            setRunning(true);
          }
        }}
      >
        {running ? "Stop pacing" : "Start pacing"}
      </button>
    </div>
  );
}

function SelectionDetails({ selection }: { selection: BreathSelection }) {
  if (selection.status === "blocked") {
    return (
      <section className="qctp-breath-selection is-blocked" aria-live="polite">
        <p className="qctp-breath-selection-label">Practice held</p>
        <h3>Use natural breathing or practice later</h3>
        <p>{selection.message}</p>
        <dl>
          <div>
            <dt>Controlled fallback</dt>
            <dd>{selection.fallback.replaceAll("_", " ")}</dd>
          </div>
          <div>
            <dt>Reason</dt>
            <dd>{selection.reasonCodes.join(", ").replaceAll("_", " ")}</dd>
          </div>
        </dl>
      </section>
    );
  }

  return (
    <section className="qctp-breath-selection" aria-live="polite">
      <p className="qctp-breath-selection-label">Deterministic selection</p>
      <h3>{selection.title}</h3>
      <ContentClassBadge
        authorityKey={selection.contentRef.authorityKey}
        scope="Selected protocol"
      />
      <p>{selection.why}</p>
      <dl className="qctp-breath-details">
        <div>
          <dt>Cadence</dt>
          <dd>{cadenceLabel(selection.cadence)}</dd>
        </div>
        <div>
          <dt>Route</dt>
          <dd>
            Inhale: {ROUTE_LABELS[selection.inhaleRoute]}; exhale:{" "}
            {ROUTE_LABELS[selection.exhaleRoute]}
          </dd>
        </div>
        <div>
          <dt>Breath volume</dt>
          <dd>{selection.volumeInstruction}</dd>
        </div>
        <div>
          <dt>Planned pacing</dt>
          <dd>{formatDuration(selection.plannedDurationSeconds)}</dd>
        </div>
        <div>
          <dt>Transition</dt>
          <dd>{selection.transitionInstruction}</dd>
        </div>
      </dl>
      {selection.prelude.map((prelude) => (
        <div className="qctp-breath-prelude" key={prelude.kind}>
          <ContentClassBadge
            authorityKey="breath.method.physiological-sigh"
            scope="Prelude"
          />
          <p>
            <strong>Prelude · {prelude.repetitions} gentle sigh(s):</strong>{" "}
            {prelude.instruction}
          </p>
        </div>
      ))}
      {selection.warnings.length > 0 ? (
        <ul className="qctp-breath-warnings">
          {selection.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
      <details className="qctp-breath-stop-conditions">
        <summary>Stop conditions</summary>
        <ul>
          {selection.stopConditions.map((condition) => (
            <li key={condition}>{condition}</li>
          ))}
        </ul>
      </details>
    </section>
  );
}

function toggleComfortableMethod(
  current: BreathMethodId[],
  methodId: BreathMethodId,
  checked: boolean,
): BreathMethodId[] {
  return checked
    ? [...new Set([...current, methodId])]
    : current.filter((candidate) => candidate !== methodId);
}

export function QuickBreathDirector({
  preferences,
  onPreferencesChange,
  className,
}: QuickBreathDirectorProps) {
  const id = useId();
  const selection = useMemo(
    () => selectBreathProtocol(preferences.director),
    [preferences.director],
  );
  const updateDirector = (patch: Partial<ParsedBreathDirectorInput>): void => {
    onPreferencesChange({
      ...preferences,
      director: { ...preferences.director, ...patch },
    });
  };
  const updateCues = (patch: Partial<QuickBreathCuePreferences>): void => {
    onPreferencesChange({
      ...preferences,
      cues: { ...preferences.cues, ...patch },
    });
  };

  return (
    <section
      className={["qctp-quick-breath", className].filter(Boolean).join(" ")}
      aria-labelledby={`${id}-title`}
    >
      <header className="qctp-quick-breath-header">
        <p>Breath Director</p>
        <h2 id={`${id}-title`}>Choose the safest useful pattern</h2>
        <small>
          Deterministic and device-local. No cloud model, paid provider, or API
          key is used.
        </small>
      </header>

      <div className="qctp-breath-input-grid">
        <label>
          Goal
          <select
            value={preferences.director.goal}
            onChange={(event) =>
              updateDirector({ goal: event.target.value as BreathGoal })
            }
          >
            {GOAL_OPTIONS.map(([value, label]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Posture
          <select
            value={preferences.director.posture}
            onChange={(event) =>
              updateDirector({ posture: event.target.value as BreathPosture })
            }
          >
            {POSTURE_OPTIONS.map(([value, label]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Available time (minutes)
          <input
            type="number"
            min="0.5"
            max="60"
            step="0.5"
            value={preferences.director.availableMinutes}
            onChange={(event) => {
              const value = Number(event.target.value);
              if (Number.isFinite(value) && value > 0) {
                updateDirector({
                  availableMinutes: Math.min(60, Math.max(0.5, value)),
                });
              }
            }}
          />
        </label>
        <label>
          Safety setting
          <select
            value={preferences.director.hazard}
            onChange={(event) =>
              updateDirector({ hazard: event.target.value as BreathHazard })
            }
          >
            {HAZARD_OPTIONS.map(([value, label]) => (
              <option value={value} key={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <fieldset className="qctp-breath-readiness">
        <legend>Current readiness · 0 low, 5 high</legend>
        {(
          [
            ["activation", "Activation"],
            ["sleepiness", "Sleepiness"],
            ["airHungerAtRest", "Air hunger at rest"],
          ] as const
        ).map(([field, label]) => (
          <label key={field}>
            <span>
              {label}{" "}
              <output htmlFor={`${id}-${field}`}>
                {preferences.director[field]}
              </output>
            </span>
            <input
              id={`${id}-${field}`}
              type="range"
              min="0"
              max="5"
              step="1"
              value={preferences.director[field]}
              onChange={(event) =>
                updateDirector({ [field]: Number(event.target.value) })
              }
            />
          </label>
        ))}
      </fieldset>

      {preferences.director.goal === "box_breathing" ? (
        <fieldset className="qctp-breath-prerequisites">
          <legend>Comfortable no-hold prerequisites</legend>
          {(["QCTP-B1", "QCTP-B3"] as const).map((methodId) => (
            <label key={methodId}>
              <input
                type="checkbox"
                checked={preferences.director.comfortableMethodIds.includes(
                  methodId,
                )}
                onChange={(event) =>
                  updateDirector({
                    comfortableMethodIds: toggleComfortableMethod(
                      preferences.director.comfortableMethodIds,
                      methodId,
                      event.target.checked,
                    ),
                  })
                }
              />
              {methodId} is comfortable without air hunger
            </label>
          ))}
        </fieldset>
      ) : null}

      <SelectionDetails selection={selection} />

      {selection.status === "ready" ? (
        <>
          <fieldset className="qctp-breath-cues">
            <legend>Optional local pacing cues</legend>
            <label>
              <input
                type="checkbox"
                checked={preferences.cues.visualPacer}
                onChange={(event) =>
                  updateCues({ visualPacer: event.target.checked })
                }
              />
              Visual breath pacer
            </label>
            <label>
              <input
                type="checkbox"
                checked={preferences.cues.localTones}
                onChange={(event) =>
                  updateCues({ localTones: event.target.checked })
                }
              />
              Quiet device-local phase tones
            </label>
            <label>
              <input
                type="checkbox"
                checked={preferences.cues.haptics}
                onChange={(event) =>
                  updateCues({ haptics: event.target.checked })
                }
              />
              Device haptics when supported
            </label>
          </fieldset>
          <BreathPacer
            key={`${selection.protocolId}:${cadenceLabel(selection.cadence)}`}
            selection={selection}
            cues={preferences.cues}
          />
        </>
      ) : null}

      <p className="qctp-breath-credit-boundary">
        Pacing time and timer completion never advance State Atlas capability.
        Progress requires separately persisted controlled evidence.
      </p>
    </section>
  );
}
