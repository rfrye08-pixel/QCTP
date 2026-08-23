import { BREATH_FOUNDATIONS, getBreathMethod } from "./catalog";
import {
  BreathFoundationProtocolSchema,
  type BreathCadence,
  type BreathFoundationProtocol,
  type BreathFoundationProtocolProgress,
  type BreathFoundationProtocolSegment,
  type BreathFoundationSession,
  type BreathFoundationSessionId,
  type BreathMethodId,
  type BreathPosture,
  type BreathRoute,
  type BreathSessionRecord,
} from "./types";

const CATALOG_REVISION = "QCTP-REV3-BREATH-FOUNDATIONS-REV1" as const;

function cuePhases(
  cadence: BreathCadence | null,
): BreathFoundationProtocolSegment["cuePhases"] {
  if (!cadence || cadence.kind === "natural") {
    return [
      { label: "Observe natural breathing", durationSeconds: 10, toneHz: 330 },
    ];
  }
  if (cadence.kind === "timed") {
    return [
      { label: "Inhale", durationSeconds: cadence.inhaleSeconds, toneHz: 440 },
      ...(cadence.secondInhaleSeconds
        ? [
            {
              label: "Small top-off inhale",
              durationSeconds: cadence.secondInhaleSeconds,
              toneHz: 520,
            },
          ]
        : []),
      ...(cadence.inhaleHoldSeconds
        ? [
            {
              label: "Easy filled hold",
              durationSeconds: cadence.inhaleHoldSeconds,
              toneHz: 392,
            },
          ]
        : []),
      { label: "Exhale", durationSeconds: cadence.exhaleSeconds, toneHz: 330 },
      ...(cadence.exhaleHoldSeconds
        ? [
            {
              label: "Easy empty hold",
              durationSeconds: cadence.exhaleHoldSeconds,
              toneHz: 294,
            },
          ]
        : []),
    ];
  }
  if (cadence.kind === "double_inhale") {
    return [
      { label: "Comfortable inhale", durationSeconds: 3, toneHz: 440 },
      { label: "Small top-off", durationSeconds: 1, toneHz: 520 },
      { label: "Long smooth exhale", durationSeconds: 6, toneHz: 330 },
    ];
  }
  if (cadence.kind === "alternate_nostril") {
    return [
      {
        label: "Close right · inhale left",
        durationSeconds: cadence.leftInhaleSeconds,
        toneHz: 440,
      },
      {
        label: "Switch · exhale right",
        durationSeconds: cadence.rightExhaleSeconds,
        toneHz: 330,
      },
      {
        label: "Inhale right",
        durationSeconds: cadence.rightInhaleSeconds,
        toneHz: 440,
      },
      {
        label: "Switch · exhale left",
        durationSeconds: cadence.leftExhaleSeconds,
        toneHz: 330,
      },
    ];
  }
  if (cadence.kind === "steps") {
    return [
      {
        label: `Inhale · ${cadence.inhaleSteps} comfortable steps`,
        durationSeconds: cadence.inhaleSteps,
        toneHz: 440,
      },
      {
        label: `Exhale · ${cadence.exhaleSteps} comfortable steps`,
        durationSeconds: cadence.exhaleSteps,
        toneHz: 330,
      },
    ];
  }
  return cadence.phases.flatMap((phase) => cuePhases(phase.cadence));
}

function methodSegment(
  sessionId: BreathFoundationSessionId,
  order: number,
  label: string,
  methodId: BreathMethodId,
  durationSeconds: number,
  posture: BreathPosture,
  cadenceOverride?: BreathCadence,
  instructionsOverride?: string[],
  comfortRequired = false,
): BreathFoundationProtocolSegment {
  const method = getBreathMethod(methodId);
  const cadence = cadenceOverride ?? method.cadence;
  return {
    segmentId: `${sessionId}-S${order}`,
    order,
    label,
    technique: "controlled_method",
    methodId,
    methodName: method.name,
    cadence,
    inhaleRoute: method.inhaleRoute,
    exhaleRoute: method.exhaleRoute,
    posture,
    durationSeconds,
    comfortRequired,
    instructions: instructionsOverride ?? [
      ...method.execution,
      method.transitionInstruction,
    ],
    cuePhases: cuePhases(cadence),
  };
}

function specialSegment(
  sessionId: BreathFoundationSessionId,
  order: number,
  values: {
    label: string;
    technique: "physiological_sigh" | "natural_breathing";
    methodName: string;
    cadence: BreathCadence | null;
    inhaleRoute: BreathRoute;
    exhaleRoute: BreathRoute;
    posture: BreathPosture;
    durationSeconds: number;
    instructions: string[];
  },
): BreathFoundationProtocolSegment {
  return {
    segmentId: `${sessionId}-S${order}`,
    order,
    methodId: null,
    comfortRequired: false,
    ...values,
    cuePhases: cuePhases(values.cadence),
  };
}

const fiveSevenCadence: BreathCadence = {
  kind: "timed",
  inhaleSeconds: 5,
  secondInhaleSeconds: null,
  inhaleHoldSeconds: 0,
  exhaleSeconds: 7,
  exhaleHoldSeconds: 0,
};

const reducedBoxCadence: BreathCadence = {
  kind: "timed",
  inhaleSeconds: 4,
  secondInhaleSeconds: null,
  inhaleHoldSeconds: 2,
  exhaleSeconds: 4,
  exhaleHoldSeconds: 2,
};

function segmentsFor(session: BreathFoundationSession) {
  switch (session.id) {
    case "BREATH-01":
      return [
        methodSegment(
          session.id,
          1,
          "Five-in / five-out mechanics",
          "QCTP-B3",
          300,
          "seated",
        ),
      ];
    case "BREATH-02":
      return [
        methodSegment(
          session.id,
          1,
          "Balanced five/five comparison",
          "QCTP-B3",
          180,
          "seated",
        ),
        methodSegment(
          session.id,
          2,
          "Exhale-biased four/six comparison",
          "QCTP-B1",
          180,
          "seated",
        ),
      ];
    case "BREATH-03":
      return [
        specialSegment(session.id, 1, {
          label: "One to three physiological sighs",
          technique: "physiological_sigh",
          methodName: "Physiological Sigh",
          cadence: {
            kind: "double_inhale",
            firstInhale: "comfortable_near_full",
            secondInhale: "small_top_off",
            exhale: "long_smooth_complete",
            hold: "none",
          },
          inhaleRoute: "nose",
          exhaleRoute: "mouth",
          posture: "seated",
          durationSeconds: 30,
          instructions: [
            "Use only one to three gentle cycles: comfortable inhale, small top-off, long smooth exhale.",
            "Do not continue repeated deliberate sighing after the third cycle.",
          ],
        }),
        specialSegment(session.id, 2, {
          label: "Natural-breath recovery observation",
          technique: "natural_breathing",
          methodName: "Natural breathing observation",
          cadence: null,
          inhaleRoute: "automatic",
          exhaleRoute: "automatic",
          posture: "seated",
          durationSeconds: 150,
          instructions: [
            "Release all deliberate pacing and observe natural breathing without changing it.",
          ],
        }),
      ];
    case "BREATH-04":
      return [
        methodSegment(
          session.id,
          1,
          "Gentle cyclic sighing",
          "QCTP-B2",
          300,
          "seated",
        ),
      ];
    case "BREATH-05":
      return [
        methodSegment(
          session.id,
          1,
          "Reduced holds · four/two/four/two",
          "QCTP-B4",
          120,
          "seated",
          reducedBoxCadence,
          [
            "Inhale quietly for four seconds, then use an easy two-second filled hold.",
            "Exhale smoothly for four seconds, then use an easy two-second empty hold.",
            "Release all holds and return to no-hold breathing immediately if tension or air hunger appears.",
          ],
        ),
        methodSegment(
          session.id,
          2,
          "Comfortable box · four/four/four/four",
          "QCTP-B4",
          120,
          "seated",
        ),
      ];
    case "BREATH-06":
      return [
        methodSegment(
          session.id,
          1,
          "Seated alternate-nostril practice",
          "QCTP-B5",
          240,
          "seated",
        ),
        methodSegment(
          session.id,
          2,
          "Eyes-open walking breath",
          "QCTP-B6",
          240,
          "walking",
        ),
      ];
    case "BREATH-07":
      return [
        specialSegment(session.id, 1, {
          label: "Natural baseline observation",
          technique: "natural_breathing",
          methodName: "Natural breathing observation",
          cadence: null,
          inhaleRoute: "automatic",
          exhaleRoute: "automatic",
          posture: "seated",
          durationSeconds: 120,
          instructions: ["Observe natural breathing without changing it."],
        }),
        methodSegment(
          session.id,
          2,
          "Five/five calibration trial",
          "QCTP-B3",
          180,
          "seated",
        ),
        methodSegment(
          session.id,
          3,
          "Four/six calibration trial",
          "QCTP-B1",
          180,
          "seated",
        ),
        methodSegment(
          session.id,
          4,
          "Five/seven optional comfort trial",
          "QCTP-B1",
          180,
          "seated",
          fiveSevenCadence,
          [
            "Only if the earlier trials remained comfortable, inhale quietly for five seconds.",
            "Exhale smoothly for seven seconds without squeezing empty or increasing breath volume.",
            "Release pacing immediately on air hunger, tension, dizziness, or a need for a recovery breath.",
          ],
          true,
        ),
        specialSegment(session.id, 5, {
          label: "Natural recovery observation",
          technique: "natural_breathing",
          methodName: "Natural breathing recovery",
          cadence: null,
          inhaleRoute: "automatic",
          exhaleRoute: "automatic",
          posture: "seated",
          durationSeconds: 120,
          instructions: [
            "Release pacing and observe whether breathing returns comfortably without a recovery gasp.",
          ],
        }),
      ];
  }
}

export function createFoundationProtocol(
  sessionOrId: BreathFoundationSession | BreathFoundationSessionId,
): BreathFoundationProtocol {
  const session =
    typeof sessionOrId === "string"
      ? BREATH_FOUNDATIONS.find((item) => item.id === sessionOrId)
      : sessionOrId;
  if (!session) {
    const sessionId =
      typeof sessionOrId === "string" ? sessionOrId : sessionOrId.id;
    throw new Error(`Unknown Breath Foundations session: ${sessionId}`);
  }
  const segments = segmentsFor(session);
  const totalActiveDurationSeconds = segments.reduce(
    (total, segment) => total + segment.durationSeconds,
    0,
  );
  if (totalActiveDurationSeconds !== session.durationSeconds) {
    throw new Error(
      `${session.id} protocol totals ${totalActiveDurationSeconds}s, expected ${session.durationSeconds}s`,
    );
  }
  return BreathFoundationProtocolSchema.parse({
    protocolId: `${session.id}-PROTOCOL-REV1`,
    catalogRevision: CATALOG_REVISION,
    foundationSessionId: session.id,
    totalActiveDurationSeconds,
    segments,
  });
}

export function createInitialFoundationProgress(
  protocol: BreathFoundationProtocol,
): BreathFoundationProtocolProgress[] {
  return protocol.segments.map((segment) => ({
    segmentId: segment.segmentId,
    methodId: segment.methodId,
    activePracticeMilliseconds: 0,
    executionMode: "planned_technique",
    performedAsDirected: false,
    checkpointConfirmedAt: null,
    rating: null,
    symptoms: [],
  }));
}

export interface ForegroundPracticeClock {
  lastMonotonicMilliseconds: number;
  wasCountable: boolean;
}

export function advanceForegroundPracticeClock(
  clock: ForegroundPracticeClock,
  nowMonotonicMilliseconds: number,
  countableNow: boolean,
): { clock: ForegroundPracticeClock; activeDeltaMilliseconds: number } {
  const rawDelta = nowMonotonicMilliseconds - clock.lastMonotonicMilliseconds;
  const activeDeltaMilliseconds = clock.wasCountable
    ? Math.max(0, Math.min(rawDelta, 2_000))
    : 0;
  return {
    clock: {
      lastMonotonicMilliseconds: nowMonotonicMilliseconds,
      wasCountable: countableNow,
    },
    activeDeltaMilliseconds,
  };
}

export function applyActivePracticeDelta(
  protocol: BreathFoundationProtocol,
  progress: BreathFoundationProtocolProgress[],
  deltaMilliseconds: number,
): BreathFoundationProtocolProgress[] {
  if (deltaMilliseconds <= 0) return progress;
  const targetIndex = protocol.segments.findIndex((segment, index) => {
    const item = progress[index];
    return (
      item &&
      (item.activePracticeMilliseconds < segment.durationSeconds * 1_000 ||
        !item.checkpointConfirmedAt)
    );
  });
  if (targetIndex < 0) return progress;
  const target = protocol.segments[targetIndex];
  const current = progress[targetIndex];
  if (
    !target ||
    !current ||
    current.checkpointConfirmedAt ||
    current.activePracticeMilliseconds >= target.durationSeconds * 1_000
  ) {
    return progress;
  }
  const next = [...progress];
  next[targetIndex] = {
    ...current,
    activePracticeMilliseconds: Math.min(
      target.durationSeconds * 1_000,
      current.activePracticeMilliseconds + Math.floor(deltaMilliseconds),
    ),
  };
  return next;
}

export function totalActivePracticeMilliseconds(
  progress: BreathFoundationProtocolProgress[],
): number {
  return progress.reduce(
    (total, item) => total + item.activePracticeMilliseconds,
    0,
  );
}

export function foundationCompletionGate(record: BreathSessionRecord): {
  complete: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];
  const protocol = record.foundationProtocol;
  const progress = record.protocolProgress;
  if (!record.foundationSessionId || !protocol || !progress) {
    reasons.push("Exact controlled protocol provenance is missing.");
  } else {
    if (protocol.foundationSessionId !== record.foundationSessionId) {
      reasons.push("Protocol and Foundation session identities do not match.");
    }
    if (progress.length !== protocol.segments.length) {
      reasons.push("Every protocol segment must have preserved evidence.");
    }
    for (const segment of protocol.segments) {
      const item = progress.find(
        (candidate) => candidate.segmentId === segment.segmentId,
      );
      if (!item || item.methodId !== segment.methodId) {
        reasons.push(`${segment.label}: exact method identity is missing.`);
        continue;
      }
      if (
        item.executionMode === "natural_breathing_safety_substitution" &&
        !segment.comfortRequired
      ) {
        reasons.push(
          `${segment.label}: an unauthorized substitution was recorded.`,
        );
      }
      if (item.activePracticeMilliseconds < segment.durationSeconds * 1_000) {
        reasons.push(
          `${segment.label}: active foreground practice is incomplete.`,
        );
      }
      if (
        !item.performedAsDirected ||
        !item.checkpointConfirmedAt ||
        !item.rating
      ) {
        reasons.push(`${segment.label}: physical checkpoint is unconfirmed.`);
      }
    }
  }
  if (!record.finalState) reasons.push("The after-practice rating is missing.");
  if (!record.rawObservation.trim())
    reasons.push("A raw observation is missing.");
  if (record.interpretation.trim() && !record.rawObservation.trim()) {
    reasons.push("Interpretation cannot precede raw observation.");
  }
  if (record.stateCapabilityCreditGranted) {
    reasons.push("Breath Foundations cannot grant state capability credit.");
  }
  return { complete: reasons.length === 0, reasons };
}

export function cueAtActiveTime(
  segment: BreathFoundationProtocolSegment,
  segmentActiveMilliseconds: number,
) {
  const cycleSeconds = segment.cuePhases.reduce(
    (total, phase) => total + phase.durationSeconds,
    0,
  );
  let withinCycle = (segmentActiveMilliseconds / 1_000) % cycleSeconds;
  for (const phase of segment.cuePhases) {
    if (withinCycle < phase.durationSeconds) {
      return {
        ...phase,
        remainingSeconds: Math.max(
          1,
          Math.ceil(phase.durationSeconds - withinCycle),
        ),
      };
    }
    withinCycle -= phase.durationSeconds;
  }
  return { ...segment.cuePhases[0]!, remainingSeconds: 1 };
}
