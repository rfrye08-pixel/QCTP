import { z } from "zod";

import {
  ControlledContentClassSchema,
  ControlledContentRefSchema,
  contentRefFor,
} from "../controlled-content";

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
  contentClass: ControlledContentClassSchema,
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
  contentClass: ControlledContentClassSchema,
  durationSeconds: z.number().int().positive(),
  methodIds: z.array(BreathMethodIdSchema),
  objectives: z.array(z.string().trim().min(1)).min(1),
  practiceSteps: z.array(z.string().trim().min(1)).min(1),
  completionEvidence: z.array(z.string().trim().min(1)).min(1),
  grantsStateCreditFromElapsedTime: z.literal(false),
});

const BreathFoundationProtocolSegmentObjectSchema = z
  .object({
    segmentId: z.string().trim().min(1),
    order: z.number().int().positive(),
    label: z.string().trim().min(1),
    technique: z.enum([
      "controlled_method",
      "physiological_sigh",
      "natural_breathing",
    ]),
    contentRef: ControlledContentRefSchema,
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
  })
  .superRefine((segment, context) => {
    const expectedAuthorityKey = authorityKeyForBreathSegment(segment);
    if (
      expectedAuthorityKey &&
      segment.contentRef.authorityKey !== expectedAuthorityKey
    ) {
      context.addIssue({
        code: "custom",
        path: ["contentRef", "authorityKey"],
        message: `CONTROLLED_CONTENT_PARENT_MISMATCH: expected ${expectedAuthorityKey}`,
      });
    }
  });

function authorityKeyForBreathSegment(value: unknown): string | null {
  if (typeof value !== "object" || value === null) return null;
  return "methodId" in value && typeof value.methodId === "string"
    ? `breath.method.${value.methodId}`
    : "technique" in value && value.technique === "physiological_sigh"
      ? "breath.method.physiological-sigh"
      : "technique" in value && value.technique === "natural_breathing"
        ? "breath.method.natural-breathing"
        : null;
}

export const BreathFoundationProtocolSegmentSchema = z.preprocess((value) => {
  if (typeof value !== "object" || value === null || "contentRef" in value) {
    return value;
  }
  const authorityKey = authorityKeyForBreathSegment(value);
  return authorityKey
    ? { ...value, contentRef: contentRefFor(authorityKey) }
    : value;
}, BreathFoundationProtocolSegmentObjectSchema);

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

const ReadyBreathSelectionObjectSchema = z
  .object({
    status: z.literal("ready"),
    protocolId: z.string().trim().min(1),
    sourceClass: z.enum([
      "qctp_regulation_support",
      "source_specific_controlled",
    ]),
    contentClass: ControlledContentClassSchema,
    contentRef: ControlledContentRefSchema,
    embeddedContentRefs: z.array(ControlledContentRefSchema).default([]),
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
  })
  .superRefine((selection, context) => {
    const expectedAuthorityKey = authorityKeyForBreathProtocol(
      selection.protocolId,
    );
    if (
      expectedAuthorityKey &&
      selection.contentRef.authorityKey !== expectedAuthorityKey
    ) {
      context.addIssue({
        code: "custom",
        path: ["contentRef", "authorityKey"],
        message: `CONTROLLED_CONTENT_PARENT_MISMATCH: expected ${expectedAuthorityKey}`,
      });
    }
    if (selection.contentClass !== selection.contentRef.contentClass) {
      context.addIssue({
        code: "custom",
        path: ["contentClass"],
        message:
          "CONTROLLED_CONTENT_PARENT_MISMATCH: selection class must describe its protocol contentRef",
      });
    }
  });

function authorityKeyForBreathProtocol(protocolId: string): string | null {
  if (/^QCTP-B[1-6]$/u.test(protocolId)) {
    return `breath.method.${protocolId}`;
  }
  const foundation = /^(BREATH-0[1-7])-PROTOCOL-REV1$/u.exec(protocolId);
  if (foundation?.[1]) {
    return `breath.foundation.${foundation[1]}`;
  }
  if (protocolId === "QCTP-BREATH-CALIBRATION-REV0") {
    return "breath.calibration";
  }
  if (protocolId === "FOUNDATION-DAY-01-HEARTMATH-REV0") {
    return "foundation.day1.heartmath-rail";
  }
  return null;
}

function migrateLegacyReadyBreathSelection(value: unknown): unknown {
  if (
    typeof value !== "object" ||
    value === null ||
    !("protocolId" in value) ||
    typeof value.protocolId !== "string"
  ) {
    return value;
  }
  const authorityKey = authorityKeyForBreathProtocol(value.protocolId);
  if (!authorityKey) return value;
  const expected = contentRefFor(authorityKey);
  const inferredEmbeddedContentRefs =
    "prelude" in value &&
    Array.isArray(value.prelude) &&
    value.prelude.some((item: unknown) => {
      if (typeof item !== "object" || item === null || !("kind" in item)) {
        return false;
      }
      return item.kind === "physiological_sigh";
    })
      ? [contentRefFor("breath.method.physiological-sigh")]
      : [];
  return {
    ...value,
    contentClass:
      "contentClass" in value ? value.contentClass : expected.contentClass,
    contentRef: "contentRef" in value ? value.contentRef : expected,
    embeddedContentRefs:
      "embeddedContentRefs" in value
        ? value.embeddedContentRefs
        : inferredEmbeddedContentRefs,
  };
}

export const ReadyBreathSelectionSchema = z.preprocess(
  migrateLegacyReadyBreathSelection,
  ReadyBreathSelectionObjectSchema,
);

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

export const BreathSelectionSchema = z.union([
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

const BreathSessionRecordObjectSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: z.string().trim().min(1).max(240),
    goal: BreathGoalSchema,
    context: BreathContextSchema,
    foundationSessionId:
      BreathFoundationSessionIdSchema.nullable().default(null),
    contentRef: ControlledContentRefSchema.optional(),
    foundationProtocol: BreathFoundationProtocolSchema.nullable().optional(),
    protocolProgress: z
      .array(BreathFoundationProtocolProgressSchema)
      .optional(),
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
  })
  .superRefine((record, context) => {
    const expectedAuthorityKey = record.foundationSessionId
      ? `breath.foundation.${record.foundationSessionId}`
      : authorityKeyForBreathProtocol(record.selection.protocolId);
    if (
      expectedAuthorityKey &&
      record.contentRef &&
      record.contentRef.authorityKey !== expectedAuthorityKey
    ) {
      context.addIssue({
        code: "custom",
        path: ["contentRef", "authorityKey"],
        message: `CONTROLLED_CONTENT_PARENT_MISMATCH: expected ${expectedAuthorityKey}`,
      });
    }
    if (record.foundationSessionId) {
      const expectedProtocolId = `${record.foundationSessionId}-PROTOCOL-REV1`;
      if (record.selection.protocolId !== expectedProtocolId) {
        context.addIssue({
          code: "custom",
          path: ["selection", "protocolId"],
          message: `CONTROLLED_CONTENT_PARENT_MISMATCH: expected ${expectedProtocolId}`,
        });
      }
      if (
        record.foundationProtocol &&
        (record.foundationProtocol.foundationSessionId !==
          record.foundationSessionId ||
          record.foundationProtocol.protocolId !== expectedProtocolId)
      ) {
        context.addIssue({
          code: "custom",
          path: ["foundationProtocol"],
          message: `CONTROLLED_CONTENT_PARENT_MISMATCH: expected ${record.foundationSessionId} / ${expectedProtocolId}`,
        });
      }
    } else if (
      record.foundationProtocol ||
      /^(?:BREATH-0[1-7])-PROTOCOL-REV1$/u.test(record.selection.protocolId)
    ) {
      context.addIssue({
        code: "custom",
        path: ["foundationSessionId"],
        message:
          "CONTROLLED_CONTENT_PARENT_MISMATCH: a Foundation protocol requires its Foundation session identity",
      });
    }
  });

export const BreathSessionRecordSchema = z.preprocess((value) => {
  if (typeof value !== "object" || value === null) {
    return value;
  }
  const foundationSessionId =
    "foundationSessionId" in value &&
    typeof value.foundationSessionId === "string"
      ? value.foundationSessionId
      : null;
  const selection =
    "selection" in value &&
    typeof value.selection === "object" &&
    value.selection !== null
      ? value.selection
      : null;
  const protocolId =
    selection &&
    "protocolId" in selection &&
    typeof selection.protocolId === "string"
      ? selection.protocolId
      : null;
  const authorityKey = foundationSessionId
    ? `breath.foundation.${foundationSessionId}`
    : protocolId
      ? authorityKeyForBreathProtocol(protocolId)
      : null;
  const foundationProtocol =
    "foundationProtocol" in value &&
    typeof value.foundationProtocol === "object" &&
    value.foundationProtocol !== null
      ? value.foundationProtocol
      : null;
  const segments =
    foundationProtocol &&
    "segments" in foundationProtocol &&
    Array.isArray(foundationProtocol.segments)
      ? foundationProtocol.segments
      : [];
  const embeddedContentRefs = [
    ...new Map(
      segments.flatMap((segment) => {
        const segmentAuthorityKey = authorityKeyForBreathSegment(segment);
        return segmentAuthorityKey
          ? [[segmentAuthorityKey, contentRefFor(segmentAuthorityKey)] as const]
          : [];
      }),
    ).values(),
  ];
  const enrichedSelection =
    selection &&
    !("embeddedContentRefs" in selection) &&
    embeddedContentRefs.length > 0
      ? { ...selection, embeddedContentRefs }
      : selection;
  return {
    ...value,
    ...(enrichedSelection ? { selection: enrichedSelection } : {}),
    ...(!("contentRef" in value) && authorityKey
      ? { contentRef: contentRefFor(authorityKey) }
      : {}),
  };
}, BreathSessionRecordObjectSchema);

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
