import { getBreathMethod } from "./catalog";
import {
  BreathAdjustmentFeedbackSchema,
  BreathAdjustmentSchema,
  BreathCalibrationTrialSchema,
  BreathDirectorInputSchema,
  BreathSelectionSchema,
  type BreathAdjustment,
  type BreathAdjustmentFeedback,
  type BreathCadence,
  type BreathDirectorInput,
  type BreathMethod,
  type BreathMethodId,
  type BreathSelection,
  type ParsedBreathDirectorInput,
  type ReadyBreathSelection,
  type TimedCadence,
} from "./types";

const day1HeartMathCadence: TimedCadence = {
  kind: "timed",
  inhaleSeconds: 5,
  secondInhaleSeconds: null,
  inhaleHoldSeconds: 0,
  exhaleSeconds: 5,
  exhaleHoldSeconds: 0,
};

const calibrationCadence: BreathCadence = {
  kind: "calibration",
  phases: [
    {
      label: "Natural baseline",
      durationSeconds: 120,
      cadence: { kind: "natural", instruction: "observe_without_changing" },
    },
    {
      label: "Balanced trial",
      durationSeconds: 180,
      cadence: {
        kind: "timed",
        inhaleSeconds: 5,
        secondInhaleSeconds: null,
        inhaleHoldSeconds: 0,
        exhaleSeconds: 5,
        exhaleHoldSeconds: 0,
      },
    },
    {
      label: "Exhale-biased trial",
      durationSeconds: 180,
      cadence: {
        kind: "timed",
        inhaleSeconds: 4,
        secondInhaleSeconds: null,
        inhaleHoldSeconds: 0,
        exhaleSeconds: 6,
        exhaleHoldSeconds: 0,
      },
    },
    {
      label: "Slower exhale-biased trial, only if comfortable",
      durationSeconds: 180,
      cadence: {
        kind: "timed",
        inhaleSeconds: 5,
        secondInhaleSeconds: null,
        inhaleHoldSeconds: 0,
        exhaleSeconds: 7,
        exhaleHoldSeconds: 0,
      },
    },
    {
      label: "Natural recovery",
      durationSeconds: 120,
      cadence: { kind: "natural", instruction: "observe_without_changing" },
    },
  ],
};

interface MethodSelectionOptions {
  readonly durationFloorSeconds?: number;
  readonly durationCeilingSeconds?: number;
  readonly cadence?: BreathCadence;
  readonly transitionInstruction?: string;
  readonly why: string;
  readonly warnings?: string[];
  readonly prelude?: ReadyBreathSelection["prelude"];
}

function blocked(
  input: ParsedBreathDirectorInput,
  reasonCodes: Extract<BreathSelection, { status: "blocked" }>["reasonCodes"],
  message: string,
  fallback: Extract<BreathSelection, { status: "blocked" }>["fallback"],
): BreathSelection {
  return BreathSelectionSchema.parse({
    status: "blocked",
    goal: input.goal,
    reasonCodes,
    message,
    fallback,
    grantsStateCreditFromElapsedTime: false,
  });
}

function fromMethod(
  input: ParsedBreathDirectorInput,
  method: BreathMethod,
  options: MethodSelectionOptions,
): BreathSelection {
  if (!method.permittedPostures.includes(input.posture)) {
    return blocked(
      input,
      ["POSTURE_INCOMPATIBLE"],
      `${method.name} is not released for the selected posture. Choose a safe supported posture or practice later.`,
      "practice_later",
    );
  }

  const floor = Math.max(
    method.minimumDurationSeconds,
    options.durationFloorSeconds ?? method.minimumDurationSeconds,
  );
  const ceiling = Math.min(
    method.maximumDurationSeconds,
    options.durationCeilingSeconds ?? method.defaultDurationSeconds,
  );
  const availableSeconds = Math.floor(input.availableMinutes * 60);
  if (availableSeconds < floor) {
    return blocked(
      input,
      ["INSUFFICIENT_TIME"],
      `${method.name} needs at least ${Math.ceil(floor / 60)} minute(s) in its controlled form.`,
      "practice_later",
    );
  }

  const plannedDurationSeconds = Math.min(availableSeconds, ceiling);
  return BreathSelectionSchema.parse({
    status: "ready",
    protocolId: method.id,
    sourceClass: method.sourceClass,
    goal: input.goal,
    methodId: method.id,
    title: method.name,
    cadence: options.cadence ?? method.cadence,
    inhaleRoute: method.inhaleRoute,
    exhaleRoute: method.exhaleRoute,
    volumeInstruction: method.volumeInstruction,
    plannedDurationSeconds,
    permittedPostures: method.permittedPostures,
    transitionInstruction:
      options.transitionInstruction ?? method.transitionInstruction,
    why: options.why,
    prelude: options.prelude ?? [],
    stopConditions: method.stopConditions,
    warnings: options.warnings ?? [],
    grantsStateCreditFromElapsedTime: false,
  });
}

function selectGeneralProtocol(
  input: ParsedBreathDirectorInput,
): BreathSelection {
  switch (input.goal) {
    case "calm_coherence":
      return fromMethod(input, getBreathMethod("QCTP-B1"), {
        durationFloorSeconds: 60,
        durationCeilingSeconds: 300,
        why: "A quiet exhale-biased pattern supports down-regulation before deliberate breath control is released.",
      });
    case "acute_reset": {
      const repetitions =
        input.activation >= 5 ? 3 : input.activation >= 3 ? 2 : 1;
      return fromMethod(input, getBreathMethod("QCTP-B1"), {
        durationFloorSeconds: 60,
        durationCeilingSeconds: 180,
        why: "One to three physiological sighs provide a brief reset before a short low-effort exhale-biased interval.",
        prelude: [
          {
            kind: "physiological_sigh",
            repetitions,
            instruction:
              "Inhale through the nose to a comfortable near-full level, add one small nasal top-off, then exhale slowly through the mouth. Do not gasp maximally.",
          },
        ],
      });
    }
    case "focus": {
      const cadence: TimedCadence =
        input.sleepiness >= 4
          ? {
              kind: "timed",
              inhaleSeconds: 4,
              secondInhaleSeconds: null,
              inhaleHoldSeconds: 0,
              exhaleSeconds: 4,
              exhaleHoldSeconds: 0,
            }
          : {
              kind: "timed",
              inhaleSeconds: 5,
              secondInhaleSeconds: null,
              inhaleHoldSeconds: 0,
              exhaleSeconds: 5,
              exhaleHoldSeconds: 0,
            };
      return fromMethod(input, getBreathMethod("QCTP-B3"), {
        durationFloorSeconds: 60,
        durationCeilingSeconds: 240,
        cadence,
        why: "Equal no-hold breathing supports alert focus without a strongly sedating exhale bias.",
        warnings:
          input.sleepiness >= 4
            ? ["Remain upright with eyes open and a broad visual field."]
            : [],
      });
    }
    case "meditation_gap":
      return fromMethod(input, getBreathMethod("QCTP-B1"), {
        durationFloorSeconds: 180,
        durationCeilingSeconds: 300,
        why: "Exhale-biased pacing is used only for entry; continuing to count would interfere with open focus and Gap practice.",
        transitionInstruction:
          "Stop controlling the breath, allow quiet natural breathing, then move to open focus. Do not count through the Gap practice.",
      });
    case "sleep":
      if (input.airHungerAtRest >= 2) {
        return fromMethod(input, getBreathMethod("QCTP-B3"), {
          durationFloorSeconds: 60,
          durationCeilingSeconds: 240,
          why: "Balanced five/five breathing is the controlled fallback when four/six creates air hunger while lying down.",
          transitionInstruction:
            "Stop counting and allow natural sleep breathing.",
        });
      }
      return fromMethod(input, getBreathMethod("QCTP-B1"), {
        durationFloorSeconds: 300,
        durationCeilingSeconds: 600,
        why: "Very low-effort exhale-biased breathing supports sleep preparation before counting is released.",
        transitionInstruction:
          "Stop counting and allow natural sleep breathing.",
      });
    case "focus10_obe":
      return fromMethod(input, getBreathMethod("QCTP-B1"), {
        durationFloorSeconds: 180,
        durationCeilingSeconds: 300,
        why: "The breath settles the body only during entry; automatic breathing is a prerequisite for later Focus 10 or OBE work.",
        transitionInstruction:
          "Release all deliberate breath control before body-sleep, separation, or imagery exercises.",
        warnings: [
          "No forceful hyperventilation or prolonged retention belongs in this Foundation sequence.",
        ],
      });
    case "remote_viewing":
      return fromMethod(input, getBreathMethod("QCTP-B3"), {
        durationFloorSeconds: 120,
        durationCeilingSeconds: 180,
        why: "Balanced breathing supports alert observation before first impressions are recorded.",
        transitionInstruction:
          "Stop counting and record first impressions with natural breathing; do not continue pacing during capture.",
      });
    case "walking":
      return fromMethod(input, getBreathMethod("QCTP-B6"), {
        durationFloorSeconds: 60,
        durationCeilingSeconds: 600,
        why: "Step breathing integrates low-effort regulation with safe, comfortable walking.",
      });
    case "alternate_nostril":
      return fromMethod(input, getBreathMethod("QCTP-B5"), {
        durationFloorSeconds: 80,
        durationCeilingSeconds: 300,
        why: "The no-hold Foundation pattern trains attentional switching and a deliberate state transition.",
      });
    case "box_breathing": {
      const required: BreathMethodId[] = ["QCTP-B1", "QCTP-B3"];
      const missing = required.filter(
        (methodId) => !input.comfortableMethodIds.includes(methodId),
      );
      if (missing.length > 0) {
        return blocked(
          input,
          ["PREREQUISITE_NOT_MET"],
          "Box breathing remains optional until both no-hold B1 and B3 are comfortable without air hunger.",
          "QCTP-B3",
        );
      }
      return fromMethod(input, getBreathMethod("QCTP-B4"), {
        durationFloorSeconds: 120,
        durationCeilingSeconds: 240,
        why: "Box breathing trains composure and deliberate transitions only after no-hold prerequisites are comfortable.",
      });
    }
    case "calibration": {
      if (input.posture !== "seated") {
        return blocked(
          input,
          ["POSTURE_INCOMPATIBLE"],
          "Personal calibration is performed seated in the same safe posture for every trial.",
          "practice_later",
        );
      }
      if (input.availableMinutes < 13) {
        return blocked(
          input,
          ["INSUFFICIENT_CALIBRATION_TIME"],
          "The controlled calibration sequence requires thirteen uninterrupted minutes.",
          "practice_later",
        );
      }
      return BreathSelectionSchema.parse({
        status: "ready",
        protocolId: "QCTP-BREATH-CALIBRATION-REV0",
        sourceClass: "qctp_regulation_support",
        goal: input.goal,
        methodId: null,
        title: "Personal Breath Calibration",
        cadence: calibrationCadence,
        inhaleRoute: "nose",
        exhaleRoute: "nose_default_mouth_if_restrictive",
        volumeInstruction:
          "Use quiet, low-effort, non-maximal breathing in the same seated posture for every trial.",
        plannedDurationSeconds: 780,
        permittedPostures: ["seated"],
        transitionInstruction:
          "Finish with two minutes of natural breathing and lock no baseline that produced symptoms or recovery gasps.",
        why: "Matched trials identify a personal calm-and-clarity baseline without assuming one cadence is permanently optimal.",
        prelude: [],
        stopConditions: getBreathMethod("QCTP-B1").stopConditions,
        warnings: [
          "Skip the five/seven trial unless the earlier trials remain comfortable.",
        ],
        grantsStateCreditFromElapsedTime: false,
      });
    }
  }
}

export function selectBreathProtocol(
  directorInput: BreathDirectorInput,
): BreathSelection {
  const input = BreathDirectorInputSchema.parse(directorInput);

  if (input.hazard !== "none") {
    return blocked(
      input,
      ["HAZARDOUS_ACTIVITY"],
      "Deliberate breathwork is blocked while driving, around machinery, on a ladder, in water, or during another hazardous task.",
      "practice_later",
    );
  }

  if (input.airHungerAtRest >= 4) {
    return blocked(
      input,
      ["AIR_HUNGER_AT_REST"],
      "Marked air hunger at rest is not a condition for deliberate pacing. Breathe naturally and do not start this session.",
      "natural_breathing_only",
    );
  }

  if (input.context === "foundation_day_1") {
    if (input.posture !== "seated" && input.posture !== "lying") {
      return blocked(
        input,
        ["POSTURE_INCOMPATIBLE"],
        "The controlled Day 1 breath rail is available only in a safe seated or lying practice posture.",
        "practice_later",
      );
    }
    return BreathSelectionSchema.parse({
      status: "ready",
      protocolId: "FOUNDATION-DAY-01-HEARTMATH-REV0",
      sourceClass: "source_specific_controlled",
      goal: input.goal,
      methodId: null,
      title: "Foundation Day 1 HeartMath Breath Rail",
      cadence: day1HeartMathCadence,
      inhaleRoute: "comfortable_route",
      exhaleRoute: "comfortable_route",
      volumeInstruction:
        "Breathe approximately five seconds in and five seconds out, or comfortably; do not force volume.",
      plannedDurationSeconds: null,
      permittedPostures: ["seated", "lying"],
      transitionInstruction:
        "Follow the locked Day 1 phase transition. Do not substitute QCTP-B1 or add a hold.",
      why: "Day 1 retains its source-controlled HeartMath heart-area rail rather than the general QCTP-B1 default.",
      prelude: [],
      stopConditions: getBreathMethod("QCTP-B1").stopConditions,
      warnings: [
        "No hold.",
        "No nasal-only requirement.",
        "Timing remains controlled by the locked 1,500-second Day 1 sequence.",
      ],
      grantsStateCreditFromElapsedTime: false,
    });
  }

  return selectGeneralProtocol(input);
}

export function calculateCadenceCycleSeconds(
  cadence: BreathCadence,
): number | null {
  if (cadence.kind === "timed") {
    return (
      cadence.inhaleSeconds +
      (cadence.secondInhaleSeconds ?? 0) +
      cadence.inhaleHoldSeconds +
      cadence.exhaleSeconds +
      cadence.exhaleHoldSeconds
    );
  }
  if (cadence.kind === "alternate_nostril") {
    return (
      cadence.leftInhaleSeconds +
      cadence.rightExhaleSeconds +
      cadence.rightInhaleSeconds +
      cadence.leftExhaleSeconds
    );
  }
  return null;
}

export function calculateExpectedCycles(
  cadence: BreathCadence,
  durationSeconds: number,
): number | null {
  if (!Number.isFinite(durationSeconds) || durationSeconds < 0) {
    throw new RangeError(
      "durationSeconds must be a finite non-negative number",
    );
  }
  const cycleSeconds = calculateCadenceCycleSeconds(cadence);
  return cycleSeconds === null
    ? null
    : Math.floor(durationSeconds / cycleSeconds);
}

function adjustedTimedCadence(
  cadence: TimedCadence,
  feedback: "too_slow" | "too_fast",
): TimedCadence {
  if (feedback === "too_slow") {
    return {
      ...cadence,
      inhaleSeconds: Math.max(3, cadence.inhaleSeconds - 1),
      inhaleHoldSeconds: Math.min(2, cadence.inhaleHoldSeconds),
      exhaleSeconds: Math.max(3, cadence.exhaleSeconds - 1),
      exhaleHoldSeconds: Math.min(2, cadence.exhaleHoldSeconds),
    };
  }
  return {
    ...cadence,
    inhaleSeconds: Math.min(5, cadence.inhaleSeconds + 1),
    exhaleSeconds: Math.min(7, cadence.exhaleSeconds + 1),
  };
}

export function createBreathAdjustment(
  selection: ReadyBreathSelection,
  adjustmentFeedback: BreathAdjustmentFeedback,
  recordedAt: string,
  volumeAlreadyReduced = false,
): BreathAdjustment {
  const feedback = BreathAdjustmentFeedbackSchema.parse(adjustmentFeedback);
  let adjustment: Omit<BreathAdjustment, "recordedAt" | "feedback">;

  switch (feedback) {
    case "comfortable":
      adjustment = {
        action: "none",
        instruction: "Continue at the current low-effort cadence.",
        cadence: selection.cadence,
      };
      break;
    case "dizziness":
      adjustment = {
        action: "stop_session",
        instruction:
          "Stop counting now, breathe naturally and quietly, sit or lie safely, and do not restart this session.",
        cadence: null,
      };
      break;
    case "too_much_air":
      adjustment = {
        action: "reduce_volume",
        instruction:
          "Keep the cadence but reduce breath volume first; do not fill or squeeze the lungs.",
        cadence: selection.cadence,
      };
      break;
    case "air_hunger":
      if (!volumeAlreadyReduced) {
        adjustment = {
          action: "reduce_volume",
          instruction:
            "Reduce breath volume first while keeping the pattern quiet and easy.",
          cadence: selection.cadence,
        };
      } else if (
        selection.cadence.kind === "timed" &&
        (selection.cadence.inhaleSeconds !== 5 ||
          selection.cadence.exhaleSeconds !== 5 ||
          selection.cadence.inhaleHoldSeconds !== 0 ||
          selection.cadence.exhaleHoldSeconds !== 0)
      ) {
        adjustment = {
          action: "change_cadence",
          instruction:
            "Change to quiet five-in/five-out breathing with no holds. If air hunger remains, return to natural breathing.",
          cadence: day1HeartMathCadence,
        };
      } else {
        adjustment = {
          action: "return_to_natural_breathing",
          instruction:
            "Stop deliberate pacing and allow natural breathing. Do not restart this session.",
          cadence: { kind: "natural", instruction: "observe_without_changing" },
        };
      }
      break;
    case "too_slow":
    case "too_fast":
      if (selection.cadence.kind !== "timed") {
        adjustment = {
          action: "none",
          instruction:
            "This controlled pattern does not support live cadence changes; stop and choose a different method if it remains uncomfortable.",
          cadence: selection.cadence,
        };
      } else {
        const cadence = adjustedTimedCadence(selection.cadence, feedback);
        adjustment = {
          action: "change_cadence",
          instruction:
            "Use the adjusted cadence at quiet, non-maximal volume and stop if symptoms appear.",
          cadence,
        };
      }
      break;
  }

  return BreathAdjustmentSchema.parse({
    recordedAt,
    feedback,
    ...adjustment,
  });
}

export function selectPassingCalibrationTrial(
  trialsInput: unknown[],
): ReturnType<typeof BreathCalibrationTrialSchema.parse> | null {
  const passing = trialsInput
    .map((trial) => BreathCalibrationTrialSchema.parse(trial))
    .filter(
      (trial) =>
        trial.airHunger <= 1 &&
        trial.tension <= 1 &&
        !trial.dizziness &&
        !trial.recoveryBreathRequired,
    )
    .sort((left, right) => {
      const rightScore =
        right.calm +
        right.clarity +
        right.physicalEase +
        right.desireToContinue;
      const leftScore =
        left.calm + left.clarity + left.physicalEase + left.desireToContinue;
      return rightScore - leftScore;
    });
  return passing[0] ?? null;
}
