import { z } from "zod";

import {
  ControlledContentClassSchema,
  ControlledContentRefSchema,
  contentRefFor,
} from "../controlled-content";

export const TrainingProcessPhaseSchema = z.enum([
  "PREPARE",
  "INDUCE",
  "RECOGNIZE",
  "STABILIZE",
  "USE",
  "EXIT",
  "RECORD",
  "ADAPT",
]);

export const GuidanceTierSchema = z.enum([
  "Teach",
  "Coach",
  "Test",
  "Independent",
]);

export const CapabilityLevelSchema = z.enum([
  "Introduced",
  "Accessed",
  "Stabilized",
  "Functional",
  "Transferable",
]);

export const StateIdSchema = z.enum([
  "Q0",
  "Q1",
  "Q2",
  "Q3",
  "Q4",
  "Q5",
  "TC-PC",
  "M-F10",
  "M-F12",
  "QR",
  "QO",
  "QI",
]);

export const StateSourceRelationshipSchema = z.enum([
  "qctp",
  "source_informed",
  "source_specific_target",
  "experimental_protocol",
]);

export const StateMarkerScoreSchema = z.number().int().min(0).max(4);

export const StatePrerequisiteSchema = z.object({
  stateId: StateIdSchema,
  minimumLevel: CapabilityLevelSchema,
});

export const StateMarkerDefinitionSchema = z.object({
  id: z.string().trim().min(1).max(120),
  label: z.string().trim().min(1),
});

export const StatePracticeStepSchema = z.object({
  phase: TrainingProcessPhaseSchema,
  durationSeconds: z.number().int().positive(),
  instruction: z.string().trim().min(1),
  completionCue: z.string().trim().min(1),
});

export const StatePracticeRecipeSchema = z.object({
  stateId: StateIdSchema,
  revision: z.string().trim().min(1),
  timingIsEvidence: z.literal(false),
  steps: z.array(StatePracticeStepSchema).min(4),
  stopConditions: z.array(z.string().trim().min(1)).min(1),
});

export const StateDefinitionSchema = z
  .object({
    id: StateIdSchema,
    title: z.string().trim().min(1),
    contentClass: ControlledContentClassSchema,
    recipeContentRef: ControlledContentRefSchema,
    sourceTargetContentRef: ControlledContentRefSchema.nullable(),
    sourceRelationship: StateSourceRelationshipSchema,
    sourceLabel: z.string().trim().min(1),
    purpose: z.string().trim().min(1),
    prerequisiteGroups: z.array(z.array(StatePrerequisiteSchema).min(1)),
    targetMarkers: z.array(StateMarkerDefinitionSchema),
    minimumAccessedMarkers: z.number().int().min(0),
    minimumContinuousSecondsForStabilized: z.number().int().nonnegative(),
    stabilizationAttemptCount: z.number().int().positive(),
    stabilizationWindow: z.number().int().positive(),
    functionalMinimumAttempts: z.number().int().positive(),
    functionalRequiresBlinding: z.boolean(),
    functionalRequiresFeedback: z.boolean(),
    functionalRequiresCoherentEpisode: z.boolean(),
    permittedContexts: z.array(z.string().trim().min(1)).min(1),
    lookAlikes: z.array(z.string().trim().min(1)),
    corrections: z.array(z.string().trim().min(1)),
  })
  .superRefine((definition, context) => {
    const expectedRecipeKey = `state.recipe.${definition.id}`;
    if (definition.recipeContentRef.authorityKey !== expectedRecipeKey) {
      context.addIssue({
        code: "custom",
        path: ["recipeContentRef", "authorityKey"],
        message: `CONTROLLED_CONTENT_PARENT_MISMATCH: expected ${expectedRecipeKey}`,
      });
    }
    if (definition.recipeContentRef.contentClass !== definition.contentClass) {
      context.addIssue({
        code: "custom",
        path: ["contentClass"],
        message: `CONTROLLED_CONTENT_CLASS_MISMATCH: expected ${definition.recipeContentRef.contentClass}`,
      });
    }

    const expectedTargetKey = `state.target.${definition.id}`;
    if (definition.sourceRelationship === "source_specific_target") {
      if (!definition.sourceTargetContentRef) {
        context.addIssue({
          code: "custom",
          path: ["sourceTargetContentRef"],
          message: `CONTROLLED_CONTENT_TARGET_REQUIRED: expected ${expectedTargetKey}`,
        });
      } else if (
        definition.sourceTargetContentRef.authorityKey !== expectedTargetKey
      ) {
        context.addIssue({
          code: "custom",
          path: ["sourceTargetContentRef", "authorityKey"],
          message: `CONTROLLED_CONTENT_PARENT_MISMATCH: expected ${expectedTargetKey}`,
        });
      } else if (
        definition.sourceTargetContentRef.contentClass !== "SOURCE_FAITHFUL"
      ) {
        context.addIssue({
          code: "custom",
          path: ["sourceTargetContentRef", "contentClass"],
          message:
            "CONTROLLED_CONTENT_CLASS_MISMATCH: expected SOURCE_FAITHFUL",
        });
      }
    } else if (definition.sourceTargetContentRef) {
      context.addIssue({
        code: "custom",
        path: ["sourceTargetContentRef"],
        message:
          "CONTROLLED_CONTENT_TARGET_NOT_APPLICABLE: source-specific target relationship required",
      });
    }
  });

export const ObservationLayerSchema = z.object({
  text: z.string().trim().min(1),
  recordedAt: z.string().datetime({ offset: true }),
});

export const InterpretationLayerSchema = z.object({
  text: z.string().trim().min(1),
  recordedAt: z.string().datetime({ offset: true }),
});

const stateAttemptShape = {
  id: z.string().trim().min(1).max(240),
  stateId: StateIdSchema,
  endedAt: z.string().datetime({ offset: true }),
  guidanceTier: GuidanceTierSchema,
  context: z.string().trim().min(1),
  timeContext: z.string().trim().min(1),
  mechanicsUnderstood: z.boolean(),
  mechanicsCorrect: z.boolean(),
  safetyStopOccurred: z.boolean(),
  safeAndOriented: z.boolean(),
  markerScores: z.record(z.string(), StateMarkerScoreSchema),
  alertness: StateMarkerScoreSchema,
  effort: StateMarkerScoreSchema,
  fearAnxiety: StateMarkerScoreSchema,
  physicalComfort: StateMarkerScoreSchema,
  memoryContinuity: StateMarkerScoreSchema,
  guidanceDependence: StateMarkerScoreSchema,
  airHunger: StateMarkerScoreSchema.nullable(),
  recoveryTimeAfterDistractionSeconds: z
    .number()
    .int()
    .nonnegative()
    .nullable(),
  elapsedSessionSeconds: z.number().int().nonnegative(),
  continuousTargetStateSeconds: z.number().int().nonnegative(),
  completedTimer: z.boolean(),
  soleEvidenceWasUnusualSensation: z.boolean(),
  primaryFailureMode: z.string().trim().min(1).nullable(),
  correctionUsed: z.string().trim().min(1).nullable(),
  functionalTaskAttempted: z.string().trim().min(1).nullable(),
  functionalTaskCompleted: z.boolean(),
  retainedStateDuringTask: z.boolean(),
  rawObservation: ObservationLayerSchema.nullable(),
  interpretation: InterpretationLayerSchema.nullable(),
  outcomeFeedback: z.string().trim().min(1).nullable(),
  returnedSafely: z.boolean(),
  orientedAfterReturn: z.boolean(),
  blinded: z.boolean(),
  feedbackScored: z.boolean(),
  coherentEpisodeRecord: z.boolean(),
  stableEnoughForUse: z.boolean(),
} as const;

function validateAttemptEvidence(
  value: {
    rawObservation: { recordedAt: string } | null;
    interpretation: { recordedAt: string } | null;
    outcomeFeedback: string | null;
    feedbackScored: boolean;
    functionalTaskAttempted: string | null;
    functionalTaskCompleted: boolean;
  },
  context: z.core.$RefinementCtx,
): void {
  if (value.interpretation && !value.rawObservation) {
    context.addIssue({
      code: "custom",
      path: ["interpretation"],
      message:
        "Interpretation requires a separately preserved raw observation.",
    });
    return;
  }
  if (
    value.interpretation &&
    value.rawObservation &&
    Date.parse(value.interpretation.recordedAt) <
      Date.parse(value.rawObservation.recordedAt)
  ) {
    context.addIssue({
      code: "custom",
      path: ["interpretation", "recordedAt"],
      message: "Raw observation must be recorded before interpretation.",
    });
  }
  if (value.feedbackScored && !value.outcomeFeedback) {
    context.addIssue({
      code: "custom",
      path: ["outcomeFeedback"],
      message: "Scored feedback requires a preserved outcome record.",
    });
  }
  if (value.functionalTaskCompleted && !value.functionalTaskAttempted) {
    context.addIssue({
      code: "custom",
      path: ["functionalTaskAttempted"],
      message: "A completed functional task must identify the task attempted.",
    });
  }
}

export const StateAttemptSchema = z
  .object(stateAttemptShape)
  .superRefine(validateAttemptEvidence);

const StateSessionRecordObjectSchema = z
  .object({
    schemaVersion: z.literal(1),
    ...stateAttemptShape,
    sessionRevision: z.string().trim().min(1),
    contentRef: ControlledContentRefSchema.optional(),
    startedAt: z.string().datetime({ offset: true }),
    posture: z.string().trim().min(1),
    breathMethod: z.string().trim().min(1).nullable(),
    capabilityBefore: CapabilityLevelSchema.nullable(),
    capabilityAfter: CapabilityLevelSchema.nullable(),
    nextPermittedSessionIds: z.array(z.string().trim().min(1)),
    saveStatus: z.enum(["saved", "save_pending"]),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .superRefine((value, context) => {
    validateAttemptEvidence(value, context);
    const expectedAuthorityKey = `state.recipe.${value.stateId}`;
    if (
      value.contentRef &&
      value.contentRef.authorityKey !== expectedAuthorityKey
    ) {
      context.addIssue({
        code: "custom",
        path: ["contentRef", "authorityKey"],
        message: `CONTROLLED_CONTENT_PARENT_MISMATCH: expected ${expectedAuthorityKey}`,
      });
    }
  });

export const StateSessionRecordSchema = z.preprocess((value) => {
  if (
    typeof value !== "object" ||
    value === null ||
    "contentRef" in value ||
    !("stateId" in value) ||
    typeof value.stateId !== "string"
  ) {
    return value;
  }
  return {
    ...value,
    contentRef: contentRefFor(`state.recipe.${value.stateId}`),
  };
}, StateSessionRecordObjectSchema);

export const CapabilityTransitionSchema = z.object({
  from: CapabilityLevelSchema.nullable(),
  to: CapabilityLevelSchema,
  achievedAt: z.string().datetime({ offset: true }),
  evidenceAttemptIds: z.array(z.string().trim().min(1)).min(1),
});

export const StateCapabilityRecordSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().trim().min(1).max(240),
  stateId: StateIdSchema,
  level: CapabilityLevelSchema,
  achievedAt: z.string().datetime({ offset: true }),
  evidenceAttemptIds: z.array(z.string().trim().min(1)).min(1),
  transitions: z.array(CapabilityTransitionSchema).min(1),
  updatedAt: z.string().datetime({ offset: true }),
});

export type TrainingProcessPhase = z.infer<typeof TrainingProcessPhaseSchema>;
export type GuidanceTier = z.infer<typeof GuidanceTierSchema>;
export type CapabilityLevel = z.infer<typeof CapabilityLevelSchema>;
export type StateId = z.infer<typeof StateIdSchema>;
export type StateSourceRelationship = z.infer<
  typeof StateSourceRelationshipSchema
>;
export type StatePrerequisite = z.infer<typeof StatePrerequisiteSchema>;
export type StateMarkerDefinition = z.infer<typeof StateMarkerDefinitionSchema>;
export type StatePracticeStep = z.infer<typeof StatePracticeStepSchema>;
export type StatePracticeRecipe = z.infer<typeof StatePracticeRecipeSchema>;
export type StateDefinition = z.infer<typeof StateDefinitionSchema>;
export type StateAttempt = z.infer<typeof StateAttemptSchema>;
export type StateSessionRecord = z.infer<typeof StateSessionRecordSchema>;
export type StateCapabilityRecord = z.infer<typeof StateCapabilityRecordSchema>;
