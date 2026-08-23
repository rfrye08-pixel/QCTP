import { getStateDefinition } from "./catalog";
import {
  CapabilityLevelSchema,
  StateAttemptSchema,
  StateCapabilityRecordSchema,
  StateIdSchema,
  StateSessionRecordSchema,
  TrainingProcessPhaseSchema,
  type CapabilityLevel,
  type GuidanceTier,
  type StateAttempt,
  type StateCapabilityRecord,
  type StateDefinition,
  type StateId,
  type StateSessionRecord,
  type TrainingProcessPhase,
} from "./types";

export const CAPABILITY_LEVELS: readonly CapabilityLevel[] = [
  "Introduced",
  "Accessed",
  "Stabilized",
  "Functional",
  "Transferable",
];

export const TRAINING_PROCESS_PHASES: readonly TrainingProcessPhase[] = [
  "PREPARE",
  "INDUCE",
  "RECOGNIZE",
  "STABILIZE",
  "USE",
  "EXIT",
  "RECORD",
  "ADAPT",
];

const levelRank = new Map(
  CAPABILITY_LEVELS.map((level, index) => [level, index] as const),
);

export interface CapabilitySnapshot {
  readonly stateId: StateId;
  readonly level: CapabilityLevel;
}

export interface GateResult {
  readonly eligible: boolean;
  readonly evidenceAttemptIds: string[];
  readonly unmet: string[];
}

export interface PrerequisiteGateResult {
  readonly eligible: boolean;
  readonly unmet: string[];
}

export interface ProgressionEvaluation {
  readonly stateId: StateId;
  readonly currentLevel: CapabilityLevel | null;
  readonly recommendedLevel: CapabilityLevel | null;
  readonly advanced: boolean;
  readonly gate: GateResult;
}

function hasMinimumLevel(
  actual: CapabilityLevel | undefined,
  required: CapabilityLevel,
): boolean {
  if (!actual) {
    return false;
  }
  return (levelRank.get(actual) ?? -1) >= (levelRank.get(required) ?? 99);
}

export function evaluatePrerequisites(
  stateIdInput: StateId,
  capabilitySnapshots: readonly CapabilitySnapshot[],
): PrerequisiteGateResult {
  const stateId = StateIdSchema.parse(stateIdInput);
  const definition = getStateDefinition(stateId);
  const levels = new Map(
    capabilitySnapshots.map((snapshot) => [
      StateIdSchema.parse(snapshot.stateId),
      CapabilityLevelSchema.parse(snapshot.level),
    ]),
  );
  const unmet = definition.prerequisiteGroups.flatMap((group) => {
    const groupMet = group.some((requirement) =>
      hasMinimumLevel(
        levels.get(requirement.stateId),
        requirement.minimumLevel,
      ),
    );
    if (groupMet) {
      return [];
    }
    const alternatives = group
      .map(
        (requirement) => `${requirement.stateId} ${requirement.minimumLevel}`,
      )
      .join(" or ");
    return [`Requires ${alternatives}.`];
  });
  return { eligible: unmet.length === 0, unmet };
}

export function evaluateMarkerGate(
  definition: StateDefinition,
  attempt: StateAttempt,
): GateResult {
  const unmet: string[] = [];
  const scoredMarkerIds = definition.targetMarkers
    .map((marker) => marker.id)
    .filter((markerId) => (attempt.markerScores[markerId] ?? 0) >= 2);

  if (!attempt.mechanicsUnderstood || !attempt.mechanicsCorrect) {
    unmet.push(
      "Controlled mechanics were not understood and performed correctly.",
    );
  }
  if (attempt.safetyStopOccurred || !attempt.safeAndOriented) {
    unmet.push("A safety stop occurred or safe orientation was not retained.");
  }
  if (scoredMarkerIds.length < definition.minimumAccessedMarkers) {
    unmet.push(
      `At least ${definition.minimumAccessedMarkers} target markers must score two or higher.`,
    );
  }
  if (attempt.alertness < 2) {
    unmet.push("Alertness must remain adequate.");
  }
  if (attempt.memoryContinuity < 2) {
    unmet.push("Memory continuity must remain adequate.");
  }
  if (attempt.fearAnxiety >= 3) {
    unmet.push("High fear or anxiety holds capability credit.");
  }
  if (attempt.physicalComfort <= 1) {
    unmet.push("Marked physical discomfort holds capability credit.");
  }
  if (attempt.airHunger !== null && attempt.airHunger >= 3) {
    unmet.push("Marked air hunger holds capability credit.");
  }
  if (attempt.soleEvidenceWasUnusualSensation) {
    unmet.push("One unusual sensation cannot be the sole state evidence.");
  }
  if (!attempt.rawObservation) {
    unmet.push("Capability credit requires a preserved raw observation.");
  }
  if (!attempt.returnedSafely || !attempt.orientedAfterReturn) {
    unmet.push("Capability evidence requires a complete, oriented return.");
  }

  return {
    eligible: unmet.length === 0,
    evidenceAttemptIds: unmet.length === 0 ? [attempt.id] : [],
    unmet,
  };
}

function introductionGate(attempts: readonly StateAttempt[]): GateResult {
  const candidate = attempts.at(-1);
  if (!candidate) {
    return {
      eligible: false,
      evidenceAttemptIds: [],
      unmet: ["A safe mechanics attempt is required for introduction credit."],
    };
  }
  const unmet: string[] = [];
  if (!candidate.mechanicsUnderstood || !candidate.mechanicsCorrect) {
    unmet.push("The task must be understood and its mechanics performed.");
  }
  if (candidate.safetyStopOccurred || !candidate.safeAndOriented) {
    unmet.push(
      "Introduction cannot be credited after a safety stop or loss of orientation.",
    );
  }
  if (!candidate.returnedSafely || !candidate.orientedAfterReturn) {
    unmet.push("Introduction requires a complete, oriented return.");
  }
  if (!candidate.rawObservation) {
    unmet.push("Introduction requires a preserved raw observation.");
  }
  if (
    candidate.alertness < 2 ||
    candidate.memoryContinuity < 2 ||
    candidate.fearAnxiety >= 3 ||
    candidate.physicalComfort <= 1 ||
    (candidate.airHunger !== null && candidate.airHunger >= 3)
  ) {
    unmet.push(
      "Introduction ratings must show adequate alertness, continuity, comfort, and respiratory safety.",
    );
  }
  return {
    eligible: unmet.length === 0,
    evidenceAttemptIds: unmet.length === 0 ? [candidate.id] : [],
    unmet,
  };
}

function accessGate(
  definition: StateDefinition,
  attempts: readonly StateAttempt[],
): GateResult {
  const evaluated = [...attempts]
    .reverse()
    .map((attempt) => evaluateMarkerGate(definition, attempt));
  const passing = evaluated.find((result) => result.eligible);
  if (passing) {
    return passing;
  }
  return (
    evaluated[0] ?? {
      eligible: false,
      evidenceAttemptIds: [],
      unmet: ["A state-marker attempt is required."],
    }
  );
}

function stabilizationGate(
  definition: StateDefinition,
  attempts: readonly StateAttempt[],
): GateResult {
  const window = attempts.slice(-definition.stabilizationWindow);
  const qualifying = window.filter((attempt) => {
    const markerGate = evaluateMarkerGate(definition, attempt);
    return (
      markerGate.eligible &&
      attempt.continuousTargetStateSeconds >=
        definition.minimumContinuousSecondsForStabilized &&
      !attempt.soleEvidenceWasUnusualSensation
    );
  });
  const hasFailureCorrection = window.some(
    (attempt) => attempt.primaryFailureMode && attempt.correctionUsed,
  );
  const unmet: string[] = [];
  if (qualifying.length < definition.stabilizationAttemptCount) {
    unmet.push(
      `Requires ${definition.stabilizationAttemptCount} qualifying attempts within the last ${definition.stabilizationWindow}; ${qualifying.length} qualify.`,
    );
  }
  if (!hasFailureCorrection) {
    unmet.push(
      "The common failure mode and its correction must be identified.",
    );
  }
  return {
    eligible: unmet.length === 0,
    evidenceAttemptIds:
      unmet.length === 0
        ? qualifying
            .slice(-definition.stabilizationAttemptCount)
            .map((attempt) => attempt.id)
        : [],
    unmet,
  };
}

function rawPrecedesInterpretation(attempt: StateAttempt): boolean {
  if (!attempt.rawObservation) {
    return false;
  }
  if (!attempt.interpretation) {
    return true;
  }
  return (
    Date.parse(attempt.rawObservation.recordedAt) <=
    Date.parse(attempt.interpretation.recordedAt)
  );
}

function qualifiesFunctionally(
  definition: StateDefinition,
  attempt: StateAttempt,
): boolean {
  return (
    evaluateMarkerGate(definition, attempt).eligible &&
    attempt.functionalTaskCompleted &&
    attempt.retainedStateDuringTask &&
    rawPrecedesInterpretation(attempt) &&
    attempt.returnedSafely &&
    attempt.orientedAfterReturn &&
    ((attempt.guidanceTier !== "Test" &&
      attempt.guidanceTier !== "Independent") ||
      attempt.guidanceDependence <= 2) &&
    (!definition.functionalRequiresBlinding || attempt.blinded) &&
    (!definition.functionalRequiresFeedback || attempt.feedbackScored) &&
    (!definition.functionalRequiresCoherentEpisode ||
      attempt.coherentEpisodeRecord)
  );
}

function functionalGate(
  definition: StateDefinition,
  attempts: readonly StateAttempt[],
): GateResult {
  const qualifying = attempts.filter((attempt) =>
    qualifiesFunctionally(definition, attempt),
  );
  const unmet: string[] = [];
  if (qualifying.length < definition.functionalMinimumAttempts) {
    unmet.push(
      `Requires ${definition.functionalMinimumAttempts} qualifying functional attempt(s); ${qualifying.length} qualify.`,
    );
  }
  if (
    attempts.some((attempt) => attempt.functionalTaskCompleted) &&
    qualifying.length === 0
  ) {
    unmet.push(
      "Functional credit requires retained state, raw-before-interpretation capture, and a safe oriented return.",
    );
  }
  return {
    eligible: unmet.length === 0,
    evidenceAttemptIds:
      unmet.length === 0
        ? qualifying
            .slice(-definition.functionalMinimumAttempts)
            .map((attempt) => attempt.id)
        : [],
    unmet,
  };
}

function transferableGate(
  definition: StateDefinition,
  attempts: readonly StateAttempt[],
): GateResult {
  const qualifying = attempts.filter(
    (attempt) =>
      qualifiesFunctionally(definition, attempt) &&
      (attempt.guidanceTier === "Test" ||
        attempt.guidanceTier === "Independent") &&
      attempt.stableEnoughForUse &&
      definition.permittedContexts.includes(attempt.context),
  );
  const contexts = new Set(qualifying.map((attempt) => attempt.context));
  const timeContexts = new Set(
    qualifying.map((attempt) => attempt.timeContext),
  );
  const reproduced = contexts.size >= 2 || timeContexts.size >= 2;
  const unmet: string[] = [];
  if (qualifying.length < 2) {
    unmet.push(
      "At least two stable functional attempts with reduced guidance are required.",
    );
  }
  if (!reproduced) {
    unmet.push(
      "The skill must be reproduced in two permitted contexts or at two different times.",
    );
  }
  return {
    eligible: unmet.length === 0,
    evidenceAttemptIds:
      unmet.length === 0
        ? qualifying.slice(-2).map((attempt) => attempt.id)
        : [],
    unmet,
  };
}

export function evaluateCapabilityProgression(input: {
  readonly stateId: StateId;
  readonly currentLevel: CapabilityLevel | null;
  readonly attempts: readonly (StateAttempt & {
    readonly sourceTrackHold?: unknown;
  })[];
  readonly capabilities?: readonly CapabilitySnapshot[];
}): ProgressionEvaluation {
  const stateId = StateIdSchema.parse(input.stateId);
  const currentLevel =
    input.currentLevel === null
      ? null
      : CapabilityLevelSchema.parse(input.currentLevel);
  const attempts = StateAttemptSchema.array()
    .parse(input.attempts.filter((attempt) => !attempt.sourceTrackHold))
    .filter((attempt) => attempt.stateId === stateId)
    .sort(
      (left, right) => Date.parse(left.endedAt) - Date.parse(right.endedAt),
    );
  const prerequisites = evaluatePrerequisites(
    stateId,
    input.capabilities ?? [],
  );
  if (!prerequisites.eligible) {
    return {
      stateId,
      currentLevel,
      recommendedLevel: currentLevel,
      advanced: false,
      gate: {
        eligible: false,
        evidenceAttemptIds: [],
        unmet: prerequisites.unmet,
      },
    };
  }

  let recommendedLevel: CapabilityLevel;
  let gate: GateResult;
  switch (currentLevel) {
    case null:
      recommendedLevel = "Introduced";
      gate = introductionGate(attempts);
      break;
    case "Introduced":
      recommendedLevel = "Accessed";
      gate = accessGate(getStateDefinition(stateId), attempts);
      break;
    case "Accessed":
      recommendedLevel = "Stabilized";
      gate = stabilizationGate(getStateDefinition(stateId), attempts);
      break;
    case "Stabilized":
      recommendedLevel = "Functional";
      gate = functionalGate(getStateDefinition(stateId), attempts);
      break;
    case "Functional":
      recommendedLevel = "Transferable";
      gate = transferableGate(getStateDefinition(stateId), attempts);
      break;
    case "Transferable":
      return {
        stateId,
        currentLevel,
        recommendedLevel: currentLevel,
        advanced: false,
        gate: { eligible: true, evidenceAttemptIds: [], unmet: [] },
      };
  }

  return {
    stateId,
    currentLevel,
    recommendedLevel: gate.eligible ? recommendedLevel : currentLevel,
    advanced: gate.eligible,
    gate,
  };
}

export function recommendedGuidanceTier(
  level: CapabilityLevel | null,
): GuidanceTier {
  switch (level) {
    case null:
    case "Introduced":
      return "Teach";
    case "Accessed":
      return "Coach";
    case "Stabilized":
      return "Test";
    case "Functional":
    case "Transferable":
      return "Independent";
  }
}

export interface TrainingPhaseCheckpoint {
  readonly readinessPassed: boolean;
  readonly safetyStop: boolean;
  readonly prerequisiteStatePresent: boolean;
  readonly markerGatePassed: boolean;
  readonly stateStable: boolean;
  readonly functionalTaskPermitted: boolean;
  readonly functionalTaskComplete: boolean;
  readonly returnComplete: boolean;
  readonly recordPersisted: boolean;
}

export function nextTrainingProcessPhase(
  phaseInput: TrainingProcessPhase,
  checkpoint: TrainingPhaseCheckpoint,
): TrainingProcessPhase | null {
  const phase = TrainingProcessPhaseSchema.parse(phaseInput);
  if (checkpoint.safetyStop && phase !== "PREPARE") {
    return "EXIT";
  }
  switch (phase) {
    case "PREPARE":
      return checkpoint.readinessPassed && !checkpoint.safetyStop
        ? "INDUCE"
        : "PREPARE";
    case "INDUCE":
      return checkpoint.prerequisiteStatePresent ? "RECOGNIZE" : "INDUCE";
    case "RECOGNIZE":
      return checkpoint.markerGatePassed ? "STABILIZE" : "INDUCE";
    case "STABILIZE":
      if (!checkpoint.stateStable) {
        return "RECOGNIZE";
      }
      return checkpoint.functionalTaskPermitted ? "USE" : "EXIT";
    case "USE":
      return checkpoint.functionalTaskComplete ? "EXIT" : "USE";
    case "EXIT":
      return checkpoint.returnComplete ? "RECORD" : "EXIT";
    case "RECORD":
      return checkpoint.recordPersisted ? "ADAPT" : "RECORD";
    case "ADAPT":
      return null;
  }
}

export function capabilitySnapshotsFromRecords(
  records: readonly StateCapabilityRecord[],
): CapabilitySnapshot[] {
  return records
    .filter((record) => !record.sourceTrackHold)
    .map((record) => ({
      stateId: record.stateId,
      level: record.level,
    }));
}

export class StateCapabilityIntegrityError extends Error {
  readonly issues: string[];

  constructor(issues: string[]) {
    super(`State capability ledger rejected: ${issues.join("; ")}`);
    this.name = "StateCapabilityIntegrityError";
    this.issues = issues;
  }
}

function sameOrderedIds(left: readonly string[], right: readonly string[]) {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function snapshotsAt(
  capabilities: readonly StateCapabilityRecord[],
  achievedAt: string,
): CapabilitySnapshot[] {
  return capabilities.flatMap((capability) => {
    const available = capability.transitions
      .filter(
        (transition) =>
          Date.parse(transition.achievedAt) <= Date.parse(achievedAt),
      )
      .at(-1);
    return available
      ? [{ stateId: capability.stateId, level: available.to }]
      : [];
  });
}

/**
 * Replays every claimed transition against the ordered source sessions.
 * Stored capability labels are treated as claims, never as authority.
 */
export function assertValidStateCapabilityLedger(input: {
  readonly sessions: readonly StateSessionRecord[];
  readonly capabilities: readonly StateCapabilityRecord[];
}): void {
  const sessions = StateSessionRecordSchema.array().parse(input.sessions);
  const capabilities = StateCapabilityRecordSchema.array().parse(
    input.capabilities,
  );
  const issues: string[] = [];
  const sessionsById = new Map<string, StateSessionRecord>();
  for (const session of sessions) {
    if (sessionsById.has(session.id)) {
      issues.push(`Duplicate state session id ${session.id}.`);
    }
    sessionsById.set(session.id, session);
  }
  const capabilityIds = new Set<string>();
  const capabilityStates = new Set<StateId>();
  for (const capability of capabilities) {
    if (capabilityIds.has(capability.id)) {
      issues.push(`Duplicate capability id ${capability.id}.`);
    }
    if (capabilityStates.has(capability.stateId)) {
      issues.push(
        `More than one capability record claims ${capability.stateId}.`,
      );
    }
    capabilityIds.add(capability.id);
    capabilityStates.add(capability.stateId);

    const expectedTransitionCount = (levelRank.get(capability.level) ?? -1) + 1;
    if (capability.transitions.length !== expectedTransitionCount) {
      issues.push(
        `${capability.id} claims ${capability.level} but has ${capability.transitions.length} transition(s); ${expectedTransitionCount} ordered transition(s) are required.`,
      );
    }

    let previousLevel: CapabilityLevel | null = null;
    let previousAchievedAt = Number.NEGATIVE_INFINITY;
    for (const [index, transition] of capability.transitions.entries()) {
      const expectedTo = CAPABILITY_LEVELS[index];
      if (transition.from !== previousLevel || transition.to !== expectedTo) {
        issues.push(
          `${capability.id} transition ${index + 1} must be ${previousLevel ?? "null"} -> ${expectedTo ?? "no further level"}, not ${transition.from ?? "null"} -> ${transition.to}.`,
        );
      }
      const transitionTime = Date.parse(transition.achievedAt);
      if (transitionTime < previousAchievedAt) {
        issues.push(`${capability.id} transitions are not chronological.`);
      }
      if (
        new Set(transition.evidenceAttemptIds).size !==
        transition.evidenceAttemptIds.length
      ) {
        issues.push(
          `${capability.id} transition ${transition.to} repeats an evidence session id.`,
        );
      }
      for (const evidenceId of transition.evidenceAttemptIds) {
        const session = sessionsById.get(evidenceId);
        if (!session || session.stateId !== capability.stateId) {
          issues.push(
            `${capability.id} transition ${transition.to} requires matching ${capability.stateId} session ${evidenceId}.`,
          );
        } else if (Date.parse(session.endedAt) > transitionTime) {
          issues.push(
            `${capability.id} transition ${transition.to} predates evidence session ${evidenceId}.`,
          );
        }
      }
      previousLevel = transition.to;
      previousAchievedAt = transitionTime;
    }

    const finalTransition = capability.transitions.at(-1);
    if (finalTransition) {
      if (finalTransition.to !== capability.level) {
        issues.push(
          `${capability.id} final transition does not establish ${capability.level}.`,
        );
      }
      if (finalTransition.achievedAt !== capability.achievedAt) {
        issues.push(
          `${capability.id} achievedAt must equal its final transition time.`,
        );
      }
      if (
        !sameOrderedIds(
          capability.evidenceAttemptIds,
          finalTransition.evidenceAttemptIds,
        )
      ) {
        issues.push(
          `${capability.id} top-level evidence must exactly match its final transition evidence.`,
        );
      }
    }
    if (Date.parse(capability.updatedAt) < Date.parse(capability.achievedAt)) {
      issues.push(`${capability.id} updatedAt predates achievedAt.`);
    }
  }

  if (issues.length > 0) {
    throw new StateCapabilityIntegrityError(issues);
  }

  for (const capability of capabilities) {
    let currentLevel: CapabilityLevel | null = null;
    for (const transition of capability.transitions) {
      const attemptsAvailable = sessions.filter(
        (session) =>
          session.stateId === capability.stateId &&
          Date.parse(session.endedAt) <= Date.parse(transition.achievedAt),
      );
      const evaluation = evaluateCapabilityProgression({
        stateId: capability.stateId,
        currentLevel,
        attempts: attemptsAvailable,
        capabilities: snapshotsAt(capabilities, transition.achievedAt),
      });
      if (
        !evaluation.advanced ||
        evaluation.recommendedLevel !== transition.to
      ) {
        issues.push(
          `${capability.id} ${currentLevel ?? "null"} -> ${transition.to} is not supported by the progression gate: ${evaluation.gate.unmet.join(" ") || "wrong next level"}`,
        );
      } else if (
        !sameOrderedIds(
          evaluation.gate.evidenceAttemptIds,
          transition.evidenceAttemptIds,
        )
      ) {
        issues.push(
          `${capability.id} ${transition.to} evidence does not match the ordered sessions selected by the progression gate.`,
        );
      }
      currentLevel = transition.to;
    }
  }

  if (issues.length > 0) {
    throw new StateCapabilityIntegrityError(issues);
  }
}
