import { z } from "zod";

export const BreathMethodIdSchema = z.enum([
  "QCTP-B1",
  "QCTP-B2",
  "QCTP-B3",
  "QCTP-B4",
  "QCTP-B5",
  "QCTP-B6",
]);

export const BreathGoalSchema = z.enum([
  "calm_coherence",
  "acute_reset",
  "focus",
  "meditation_gap",
  "sleep",
  "focus10_obe",
  "remote_viewing",
  "walking",
  "alternate_nostril",
  "box_breathing",
  "calibration",
]);

export const BreathPostureSchema = z.enum([
  "seated",
  "lying",
  "standing",
  "walking",
]);

export const BreathHazardSchema = z.enum([
  "none",
  "driving",
  "machinery",
  "ladder",
  "water",
  "other_hazard",
]);

export const BreathContextSchema = z.enum([
  "general",
  "foundation_day_1",
  "foundation_meditation",
  "focus10_obe",
  "remote_viewing",
  "grant_studio",
  "mirror_journal",
  "walking_integration",
]);

export const BreathRouteSchema = z.enum([
  "nose",
  "mouth",
  "nose_default_mouth_if_restrictive",
  "alternating_nostrils",
  "comfortable_route",
  "automatic",
]);

export const TimedCadenceSchema = z.object({
  kind: z.literal("timed"),
  inhaleSeconds: z.number().positive(),
  secondInhaleSeconds: z.number().positive().nullable(),
  inhaleHoldSeconds: z.number().nonnegative(),
  exhaleSeconds: z.number().positive(),
  exhaleHoldSeconds: z.number().nonnegative(),
});

export const DoubleInhaleCadenceSchema = z.object({
  kind: z.literal("double_inhale"),
  firstInhale: z.literal("comfortable_near_full"),
  secondInhale: z.literal("small_top_off"),
  exhale: z.literal("long_smooth_complete"),
  hold: z.literal("none"),
});

export const AlternateNostrilCadenceSchema = z.object({
  kind: z.literal("alternate_nostril"),
  leftInhaleSeconds: z.number().positive(),
  rightExhaleSeconds: z.number().positive(),
  rightInhaleSeconds: z.number().positive(),
  leftExhaleSeconds: z.number().positive(),
  hold: z.literal("none"),
  initialCycles: z.number().int().positive(),
});

export const StepCadenceSchema = z.object({
  kind: z.literal("steps"),
  inhaleSteps: z.number().int().positive(),
  exhaleSteps: z.number().int().positive(),
  hold: z.literal("none"),
});

export const NaturalCadenceSchema = z.object({
  kind: z.literal("natural"),
  instruction: z.literal("observe_without_changing"),
});

export const CalibrationCadenceSchema = z.object({
  kind: z.literal("calibration"),
  phases: z
    .array(
      z.object({
        label: z.string().trim().min(1),
        durationSeconds: z.number().int().positive(),
        cadence: z.union([TimedCadenceSchema, NaturalCadenceSchema]),
      }),
    )
    .length(5),
});

export const BreathCadenceSchema = z.discriminatedUnion("kind", [
  TimedCadenceSchema,
  DoubleInhaleCadenceSchema,
  AlternateNostrilCadenceSchema,
  StepCadenceSchema,
  NaturalCadenceSchema,
  CalibrationCadenceSchema,
]);

export const BreathMethodSchema = z.object({
  id: BreathMethodIdSchema,
  name: z.string().trim().min(1),
  sourceClass: z.literal("qctp_regulation_support"),
  primaryUses: z.array(z.string().trim().min(1)).min(1),
  cadence: BreathCadenceSchema,
  inhaleRoute: BreathRouteSchema,
  exhaleRoute: BreathRouteSchema,
  volumeInstruction: z.string().trim().min(1),
  minimumDurationSeconds: z.number().int().nonnegative(),
  defaultDurationSeconds: z.number().int().positive(),
  maximumDurationSeconds: z.number().int().positive(),
  permittedPostures: z.array(BreathPostureSchema).min(1),
  prerequisiteMethodIds: z.array(BreathMethodIdSchema),
  execution: z.array(z.string().trim().min(1)).min(1),
  transitionInstruction: z.string().trim().min(1),
  stopConditions: z.array(z.string().trim().min(1)).min(1),
});

export const BreathFoundationSessionIdSchema = z.enum([
  "BREATH-01",
  "BREATH-02",
  "BREATH-03",
  "BREATH-04",
  "BREATH-05",
  "BREATH-06",
  "BREATH-07",
]);

export const BreathFoundationSessionSchema = z.object({
  id: BreathFoundationSessionIdSchema,
  order: z.number().int().min(1).max(7),
  title: z.string().trim().min(1),
  sourceClass: z.literal("qctp_regulation_support"),
  durationSeconds: z.number().int().positive(),
  methodIds: z.array(BreathMethodIdSchema),
  objectives: z.array(z.string().trim().min(1)).min(1),
  practiceSteps: z.array(z.string().trim().min(1)).min(1),
  completionEvidence: z.array(z.string().trim().min(1)).min(1),
  grantsStateCreditFromElapsedTime: z.literal(false),
});

export const BreathFoundationProtocolSegmentSchema = z.object({
  segmentId: z.string().trim().min(1),
  order: z.number().int().positive(),
  label: z.string().trim().min(1),
  technique: z.enum([
    "controlled_method",
    "physiological_sigh",
    "natural_breathing",
  ]),
  methodId: BreathMethodIdSchema.nullable(),
  methodName: z.string().trim().min(1),
  cadence: BreathCadenceSchema.nullable(),
  inhaleRoute: BreathRouteSchema,
  exhaleRoute: BreathRouteSchema,
  posture: BreathPostureSchema,
  durationSeconds: z.number().int().positive(),
  comfortRequired: z.boolean(),
  instructions: z.array(z.string().trim().min(1)).min(1),
  cuePhases: z
    .array(
      z.object({
        label: z.string().trim().min(1),
        durationSeconds: z.number().positive(),
        toneHz: z.number().positive().nullable(),
      }),
    )
    .min(1),
});

export const BreathFoundationProtocolSchema = z.object({
  protocolId: z.string().trim().min(1),
  catalogRevision: z.literal("QCTP-REV3-BREATH-FOUNDATIONS-REV1"),
  foundationSessionId: BreathFoundationSessionIdSchema,
  totalActiveDurationSeconds: z.number().int().positive(),
  segments: z.array(BreathFoundationProtocolSegmentSchema).min(1),
});

export const BreathDirectorInputSchema = z.object({
  goal: BreathGoalSchema,
  context: BreathContextSchema.default("general"),
  activation: z.number().int().min(0).max(5),
  sleepiness: z.number().int().min(0).max(5),
  airHungerAtRest: z.number().int().min(0).max(5),
  availableMinutes: z.number().positive().max(60),
  posture: BreathPostureSchema,
  hazard: BreathHazardSchema,
  comfortableMethodIds: z.array(BreathMethodIdSchema).default([]),
});

export const BreathPreludeSchema = z.object({
  kind: z.literal("physiological_sigh"),
  repetitions: z.number().int().min(1).max(3),
  instruction: z.string().trim().min(1),
});

export const ReadyBreathSelectionSchema = z.object({
  status: z.literal("ready"),
  protocolId: z.string().trim().min(1),
  sourceClass: z.enum([
    "qctp_regulation_support",
    "source_specific_controlled",
  ]),
  goal: BreathGoalSchema,
  methodId: BreathMethodIdSchema.nullable(),
  title: z.string().trim().min(1),
  cadence: BreathCadenceSchema,
  inhaleRoute: BreathRouteSchema,
  exhaleRoute: BreathRouteSchema,
  volumeInstruction: z.string().trim().min(1),
  plannedDurationSeconds: z.number().int().positive().nullable(),
  permittedPostures: z.array(BreathPostureSchema).min(1),
  transitionInstruction: z.string().trim().min(1),
  why: z.string().trim().min(1),
  prelude: z.array(BreathPreludeSchema),
  stopConditions: z.array(z.string().trim().min(1)).min(1),
  warnings: z.array(z.string().trim().min(1)),
  grantsStateCreditFromElapsedTime: z.literal(false),
});

export const BlockedBreathSelectionSchema = z.object({
  status: z.literal("blocked"),
  goal: BreathGoalSchema,
  reasonCodes: z
    .array(
      z.enum([
        "HAZARDOUS_ACTIVITY",
        "AIR_HUNGER_AT_REST",
        "POSTURE_INCOMPATIBLE",
        "PREREQUISITE_NOT_MET",
        "INSUFFICIENT_TIME",
        "INSUFFICIENT_CALIBRATION_TIME",
      ]),
    )
    .min(1),
  message: z.string().trim().min(1),
  fallback: z.enum(["practice_later", "natural_breathing_only", "QCTP-B3"]),
  grantsStateCreditFromElapsedTime: z.literal(false),
});

export const BreathSelectionSchema = z.discriminatedUnion("status", [
  ReadyBreathSelectionSchema,
  BlockedBreathSelectionSchema,
]);

export const BreathAdjustmentFeedbackSchema = z.enum([
  "too_slow",
  "too_fast",
  "too_much_air",
  "air_hunger",
  "dizziness",
  "comfortable",
]);

export const BreathAdjustmentSchema = z.object({
  recordedAt: z.string().datetime({ offset: true }),
  feedback: BreathAdjustmentFeedbackSchema,
  action: z.enum([
    "none",
    "reduce_volume",
    "change_cadence",
    "return_to_natural_breathing",
    "stop_session",
  ]),
  instruction: z.string().trim().min(1),
  cadence: BreathCadenceSchema.nullable(),
});

export const BreathCalibrationTrialSchema = z.object({
  cadenceLabel: z.string().trim().min(1),
  physicalEase: z.number().int().min(0).max(5),
  calm: z.number().int().min(0).max(5),
  clarity: z.number().int().min(0).max(5),
  airHunger: z.number().int().min(0).max(5),
  tension: z.number().int().min(0).max(5),
  sleepiness: z.number().int().min(0).max(5),
  emotionalShift: z.number().int().min(0).max(5),
  desireToContinue: z.number().int().min(0).max(5),
  dizziness: z.boolean(),
  recoveryBreathRequired: z.boolean(),
});

export const QuickBreathCuePreferencesSchema = z.object({
  visualPacer: z.boolean(),
  localTones: z.boolean(),
  haptics: z.boolean(),
});

export const QuickBreathDirectorPreferencesSchema = z.object({
  director: BreathDirectorInputSchema,
  cues: QuickBreathCuePreferencesSchema,
});

const BreathProfileObjectSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().trim().min(1).max(240),
  calmMethod: z.union([BreathMethodIdSchema, z.literal("natural")]),
  focusMethod: z.union([BreathMethodIdSchema, z.literal("natural")]),
  sleepMethod: z.union([BreathMethodIdSchema, z.literal("natural")]),
  acuteResetMethod: z.union([
    BreathMethodIdSchema,
    z.literal("physiological_sigh_then_QCTP-B1"),
    z.literal("natural"),
  ]),
  comfortableMethodIds: z.array(BreathMethodIdSchema),
  calibrationTrials: z.array(BreathCalibrationTrialSchema),
  accessibility: z.object({
    visualPacer: z.boolean(),
    audioTones: z.boolean(),
    haptics: z.boolean(),
    dimScreen: z.boolean(),
    silentPacing: z.boolean(),
  }),
  quickDirector: QuickBreathDirectorPreferencesSchema,
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});

export const BreathProfileSchema = z.preprocess((value) => {
  if (typeof value !== "object" || value === null || "quickDirector" in value) {
    return value;
  }
  const legacy = value as Record<string, unknown>;
  const accessibility =
    typeof legacy.accessibility === "object" && legacy.accessibility !== null
      ? (legacy.accessibility as Record<string, unknown>)
      : {};
  const comfortableMethodIds = Array.isArray(legacy.comfortableMethodIds)
    ? legacy.comfortableMethodIds
    : [];
  return {
    ...legacy,
    quickDirector: {
      director: {
        goal: "calm_coherence",
        context: "general",
        activation: 2,
        sleepiness: 1,
        airHungerAtRest: 0,
        availableMinutes: 5,
        posture: "seated",
        hazard: "none",
        comfortableMethodIds,
      },
      cues: {
        visualPacer: accessibility.visualPacer ?? true,
        localTones: accessibility.audioTones ?? true,
        haptics: accessibility.haptics ?? true,
      },
    },
  };
}, BreathProfileObjectSchema);

export const BreathStateRatingSchema = z.object({
  activation: z.number().int().min(0).max(5),
  sleepiness: z.number().int().min(0).max(5),
  calm: z.number().int().min(0).max(5),
  clarity: z.number().int().min(0).max(5),
  airHunger: z.number().int().min(0).max(5),
});

export const BreathFoundationProtocolProgressSchema = z.object({
  segmentId: z.string().trim().min(1),
  methodId: BreathMethodIdSchema.nullable(),
  activePracticeMilliseconds: z.number().int().nonnegative(),
  executionMode: z.enum([
    "planned_technique",
    "natural_breathing_safety_substitution",
  ]),
  performedAsDirected: z.boolean(),
  checkpointConfirmedAt: z.string().datetime({ offset: true }).nullable(),
  rating: BreathCalibrationTrialSchema.nullable(),
  symptoms: z.array(z.string().trim().min(1)),
});

export const BreathSessionCheckpointSchema = z.object({
  checkpointRevision: z.literal("QCTP-REV3-BREATH-CHECKPOINT-REV1"),
  activePracticeMilliseconds: z.number().int().nonnegative(),
  currentSegmentId: z.string().trim().min(1).nullable(),
  savedAt: z.string().datetime({ offset: true }),
});

export const BreathSessionRecordSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().trim().min(1).max(240),
  goal: BreathGoalSchema,
  context: BreathContextSchema,
  foundationSessionId: BreathFoundationSessionIdSchema.nullable().default(null),
  foundationProtocol: BreathFoundationProtocolSchema.nullable().optional(),
  protocolProgress: z.array(BreathFoundationProtocolProgressSchema).optional(),
  checkpoint: BreathSessionCheckpointSchema.nullable().optional(),
  selection: ReadyBreathSelectionSchema,
  startedAt: z.string().datetime({ offset: true }),
  endedAt: z.string().datetime({ offset: true }).nullable(),
  plannedDurationSeconds: z.number().int().nonnegative(),
  completedDurationSeconds: z.number().int().nonnegative(),
  initialState: BreathStateRatingSchema,
  finalState: BreathStateRatingSchema.nullable(),
  adjustments: z.array(BreathAdjustmentSchema),
  symptoms: z.array(z.string().trim().min(1)),
  shouldReuseForGoal: z.boolean().nullable(),
  rawObservation: z.string(),
  interpretation: z.string(),
  status: z.enum([
    "in_progress",
    "completed",
    "stopped",
    "interrupted",
    "save_pending",
  ]),
  stateCapabilityCreditGranted: z.literal(false),
  updatedAt: z.string().datetime({ offset: true }),
});

export type BreathMethodId = z.infer<typeof BreathMethodIdSchema>;
export type BreathGoal = z.infer<typeof BreathGoalSchema>;
export type BreathPosture = z.infer<typeof BreathPostureSchema>;
export type BreathHazard = z.infer<typeof BreathHazardSchema>;
export type BreathContext = z.infer<typeof BreathContextSchema>;
export type BreathRoute = z.infer<typeof BreathRouteSchema>;
export type TimedCadence = z.infer<typeof TimedCadenceSchema>;
export type BreathCadence = z.infer<typeof BreathCadenceSchema>;
export type BreathMethod = z.infer<typeof BreathMethodSchema>;
export type BreathFoundationSession = z.infer<
  typeof BreathFoundationSessionSchema
>;
export type BreathFoundationSessionId = z.infer<
  typeof BreathFoundationSessionIdSchema
>;
export type BreathFoundationProtocolSegment = z.infer<
  typeof BreathFoundationProtocolSegmentSchema
>;
export type BreathFoundationProtocol = z.infer<
  typeof BreathFoundationProtocolSchema
>;
export type BreathFoundationProtocolProgress = z.infer<
  typeof BreathFoundationProtocolProgressSchema
>;
export type BreathDirectorInput = z.input<typeof BreathDirectorInputSchema>;
export type ParsedBreathDirectorInput = z.output<
  typeof BreathDirectorInputSchema
>;
export type ReadyBreathSelection = z.infer<typeof ReadyBreathSelectionSchema>;
export type BlockedBreathSelection = z.infer<
  typeof BlockedBreathSelectionSchema
>;
export type BreathSelection = z.infer<typeof BreathSelectionSchema>;
export type BreathAdjustmentFeedback = z.infer<
  typeof BreathAdjustmentFeedbackSchema
>;
export type BreathAdjustment = z.infer<typeof BreathAdjustmentSchema>;
export type BreathCalibrationTrial = z.infer<
  typeof BreathCalibrationTrialSchema
>;
export type StoredQuickBreathCuePreferences = z.infer<
  typeof QuickBreathCuePreferencesSchema
>;
export type StoredQuickBreathDirectorPreferences = z.infer<
  typeof QuickBreathDirectorPreferencesSchema
>;
export type BreathProfile = z.infer<typeof BreathProfileSchema>;
export type BreathStateRating = z.infer<typeof BreathStateRatingSchema>;
export type BreathSessionRecord = z.infer<typeof BreathSessionRecordSchema>;
