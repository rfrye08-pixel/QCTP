import { z } from "zod";

export const ControlledContentClassSchema = z.enum([
  "SOURCE_FAITHFUL",
  "SOURCE_ENHANCED",
  "QCTP_SYNTHESIS",
  "QCTP_ORIGINAL",
]);

export type ControlledContentClass = z.infer<
  typeof ControlledContentClassSchema
>;

export const CONTROLLED_CONTENT_CLASS_DETAILS: Readonly<
  Record<
    ControlledContentClass,
    Readonly<{ label: string; description: string }>
  >
> = Object.freeze({
  SOURCE_FAITHFUL: Object.freeze({
    label: "Source faithful",
    description:
      "One source method preserved through an original QCTP paraphrase.",
  }),
  SOURCE_ENHANCED: Object.freeze({
    label: "Source enhanced",
    description:
      "One identified source method with separately identified QCTP support.",
  }),
  QCTP_SYNTHESIS: Object.freeze({
    label: "QCTP synthesis",
    description:
      "A controlled integration of compatible source methods with explicit transitions.",
  }),
  QCTP_ORIGINAL: Object.freeze({
    label: "QCTP original",
    description:
      "An original QCTP exercise that is not presented as a named source method.",
  }),
});

const legacyClassMap = Object.freeze({
  source_faithful_summary: "SOURCE_FAITHFUL",
  source_faithful: "SOURCE_FAITHFUL",
  source_enhanced: "SOURCE_ENHANCED",
  qctp_synthesis: "QCTP_SYNTHESIS",
  qctp_original: "QCTP_ORIGINAL",
} as const satisfies Record<string, ControlledContentClass>);

export type LegacyControlledContentClass = keyof typeof legacyClassMap;

export function normalizeLegacyControlledContentClass(
  value: unknown,
): ControlledContentClass | null {
  if (typeof value !== "string") return null;
  const canonical = ControlledContentClassSchema.safeParse(value);
  if (canonical.success) return canonical.data;
  return legacyClassMap[value as LegacyControlledContentClass] ?? null;
}

export const ControlledContentStatusSchema = z.enum([
  "RELEASED",
  "PREREQUISITE",
  "RESERVED",
  "WORKFLOW",
]);

export const ControlledContentRegistryEntrySchema = z.object({
  authorityKey: z.string().trim().min(1).max(240),
  contentId: z.string().trim().min(1).max(240),
  title: z.string().trim().min(1),
  contentClass: ControlledContentClassSchema,
  authorityIds: z.array(z.string().trim().min(1)).min(1),
  sourceLabels: z.array(z.string().trim().min(1)),
  status: ControlledContentStatusSchema,
});

export type ControlledContentRegistryEntry = z.infer<
  typeof ControlledContentRegistryEntrySchema
>;

const SOURCE_FIDELITY_AUTHORITY = "QCTP-SOURCE-FIDELITY-REV0" as const;
const STATE_ATLAS_AUTHORITY = "QCTP-STATE-ATLAS-REV0" as const;
const BREATH_AUTHORITY = "QCTP-BREATH-REV0" as const;
const CAMPBELL_AUTHORITY = "QCTP-TC-INTEGRATION-REV0" as const;
const REG_AUTHORITY = "QCTP-REG-INTEGRATION-REV0" as const;
const PRODUCT_AUTHORITY = "QCTP-PRODUCT-ARCH-REV2" as const;

function entry(
  authorityKey: string,
  contentId: string,
  title: string,
  contentClass: ControlledContentClass,
  authorityIds: readonly string[],
  sourceLabels: readonly string[],
  status: z.infer<typeof ControlledContentStatusSchema> = "RELEASED",
): ControlledContentRegistryEntry {
  return ControlledContentRegistryEntrySchema.parse({
    authorityKey,
    contentId,
    title,
    contentClass,
    authorityIds,
    sourceLabels,
    status,
  });
}

const stateClasses = Object.freeze({
  Q0: "QCTP_ORIGINAL",
  Q1: "QCTP_ORIGINAL",
  Q2: "QCTP_SYNTHESIS",
  Q3: "QCTP_ORIGINAL",
  Q4: "QCTP_SYNTHESIS",
  Q5: "QCTP_SYNTHESIS",
  "TC-PC": "QCTP_ORIGINAL",
  "M-F10": "QCTP_ORIGINAL",
  "M-F12": "QCTP_ORIGINAL",
  QR: "QCTP_SYNTHESIS",
  QO: "QCTP_ORIGINAL",
  QI: "QCTP_ORIGINAL",
} as const satisfies Record<string, ControlledContentClass>);

const stateTitles = Object.freeze({
  Q0: "Ordinary Baseline",
  Q1: "Regulated Body and Breath",
  Q2: "Coherent Affective State",
  Q3: "Focused Attention",
  Q4: "Open Monitoring and Spatial Awareness",
  Q5: "Gap Awareness",
  "TC-PC": "Point Consciousness recipe",
  "M-F10": "Focus 10 candidate recipe",
  "M-F12": "Focus 12 candidate recipe",
  QR: "Remote-Information Receiver recipe",
  QO: "OBE Threshold and Separation recipe",
  QI: "Stable Imaginality Environment recipe",
} as const);

const sourceSpecificStateTargets = Object.freeze({
  "TC-PC": Object.freeze({
    title: "Point Consciousness source target",
    authorityIds: [
      STATE_ATLAS_AUTHORITY,
      SOURCE_FIDELITY_AUTHORITY,
      CAMPBELL_AUTHORITY,
    ],
    sourceLabels: ["Thomas Campbell Point Consciousness terminology"],
  }),
  "M-F10": Object.freeze({
    title: "Focus 10 source target",
    authorityIds: [STATE_ATLAS_AUTHORITY, SOURCE_FIDELITY_AUTHORITY],
    sourceLabels: ["Monroe Focus 10 terminology"],
  }),
  "M-F12": Object.freeze({
    title: "Focus 12 source target",
    authorityIds: [STATE_ATLAS_AUTHORITY, SOURCE_FIDELITY_AUTHORITY],
    sourceLabels: ["Monroe Focus 12 terminology"],
  }),
} as const);

const breathMethodClasses = Object.freeze({
  "QCTP-B1": "QCTP_ORIGINAL",
  "QCTP-B2": "SOURCE_ENHANCED",
  "QCTP-B3": "QCTP_ORIGINAL",
  "QCTP-B4": "QCTP_ORIGINAL",
  "QCTP-B5": "QCTP_ORIGINAL",
  "QCTP-B6": "QCTP_ORIGINAL",
} as const satisfies Record<string, ControlledContentClass>);

const campbellModuleClasses = Object.freeze({
  "TC-01": "SOURCE_FAITHFUL",
  "TC-02": "SOURCE_FAITHFUL",
  "TC-03": null,
  "TC-04": "SOURCE_FAITHFUL",
  "TC-05": "SOURCE_FAITHFUL",
  "TC-06": "SOURCE_FAITHFUL",
  "TC-07": null,
  "TC-08": null,
  "TC-09": null,
  "TC-10": null,
} as const satisfies Record<string, ControlledContentClass | null>);

const campbellExerciseIds = [
  "TC-01-POSSIBILITY-LEDGER",
  "TC-02-POINT-CONSCIOUSNESS",
  "TC-04-INTENT-STACK",
  "TC-05-TRIGGER-RECONSTRUCTION",
  "TC-06-IMAGINALITY-MAP",
] as const;

const registryEntries: ControlledContentRegistryEntry[] = [
  ...[
    ["bullard", "Dr. Theresa Bullard-Whyke", "TB-ANCHOR-01"],
    ["heartmath", "HeartMath", "HM-QC-01"],
    ["dispenza", "Dr. Joe Dispenza", "JD-SPACE-01"],
  ].map(([id, title, sourceId]) =>
    entry(
      `source.profile.${id}`,
      `source-profile-${id}`,
      `${title} controlled source profile`,
      "SOURCE_FAITHFUL",
      [SOURCE_FIDELITY_AUTHORITY, sourceId!],
      [title!],
    ),
  ),
  entry(
    "source.profile.thomas-campbell",
    "source-profile-thomas-campbell",
    "Thomas Campbell controlled source profile",
    "SOURCE_FAITHFUL",
    [SOURCE_FIDELITY_AUTHORITY, CAMPBELL_AUTHORITY],
    ["Thomas Campbell public source set"],
  ),
  entry(
    "source.profile.robert-edward-grant",
    "source-profile-robert-edward-grant",
    "Robert Edward Grant controlled source profile",
    "SOURCE_FAITHFUL",
    [SOURCE_FIDELITY_AUTHORITY, REG_AUTHORITY],
    ["Robert Edward Grant public source framework"],
  ),
  entry(
    "foundation.day1.practice",
    "foundation-day1-source-rev0-voice-free",
    "Foundation Day 1 source-grounded practice",
    "QCTP_SYNTHESIS",
    [SOURCE_FIDELITY_AUTHORITY, "QCTP-D1-SOURCE-LABELED-SCRIPT-CANDIDATE-REV0"],
    ["Bullard", "HeartMath", "Dispenza", "QCTP return"],
  ),
  entry(
    "foundation.day1.phase.baseline-observation",
    "QCTP-BASELINE-OBSERVATION",
    "Day 1 baseline observation",
    "QCTP_ORIGINAL",
    [SOURCE_FIDELITY_AUTHORITY, "QCTP-D1-SOURCE-LABELED-SCRIPT-CANDIDATE-REV0"],
    ["QCTP baseline observation"],
  ),
  entry(
    "foundation.day1.phase.bullard-contraction",
    "TB-ANCHOR-01",
    "Day 1 Bullard contraction awareness",
    "SOURCE_ENHANCED",
    [SOURCE_FIDELITY_AUTHORITY, "TB-ANCHOR-01"],
    ["Dr. Theresa Bullard-Whyke", "QCTP safety and pacing support"],
  ),
  entry(
    "foundation.day1.transition.bullard-to-heartmath",
    "QCTP-TRANSITION-01-BULLARD-TO-HEARTMATH",
    "Day 1 Bullard-to-HeartMath transition",
    "QCTP_SYNTHESIS",
    [SOURCE_FIDELITY_AUTHORITY, "QCTP-TRANSITION-01"],
    ["QCTP controlled source transition"],
  ),
  entry(
    "foundation.day1.phase.heart-coherence",
    "HM-QC-01-DAY1",
    "Day 1 HeartMath coherence",
    "SOURCE_ENHANCED",
    [SOURCE_FIDELITY_AUTHORITY, BREATH_AUTHORITY, "HM-QC-01"],
    ["HeartMath Quick Coherence", "QCTP breath rail and safety support"],
  ),
  entry(
    "foundation.day1.transition.heartmath-to-dispenza",
    "QCTP-TRANSITION-01-HEARTMATH-TO-DISPENZA",
    "Day 1 HeartMath-to-Dispenza transition",
    "QCTP_SYNTHESIS",
    [SOURCE_FIDELITY_AUTHORITY, "QCTP-TRANSITION-01"],
    ["QCTP controlled source transition"],
  ),
  entry(
    "foundation.day1.phase.spatial-induction",
    "JD-SPACE-01-INDUCTION",
    "Day 1 spatial-attention induction",
    "SOURCE_ENHANCED",
    [SOURCE_FIDELITY_AUTHORITY, "JD-SPACE-01"],
    [
      "Dr. Joe Dispenza spatial-attention method",
      "QCTP safety and pacing support",
    ],
  ),
  entry(
    "foundation.day1.transition.spatial-to-open-space",
    "QCTP-TRANSITION-01-SPATIAL-TO-OPEN-SPACE",
    "Day 1 spatial-induction transition",
    "QCTP_SYNTHESIS",
    [SOURCE_FIDELITY_AUTHORITY, "QCTP-TRANSITION-01"],
    ["QCTP controlled source transition"],
  ),
  entry(
    "foundation.day1.phase.open-spatial-awareness",
    "JD-SPACE-01-OPEN-AWARENESS",
    "Day 1 open spatial awareness",
    "SOURCE_ENHANCED",
    [SOURCE_FIDELITY_AUTHORITY, "JD-SPACE-01"],
    [
      "Dr. Joe Dispenza spatial-attention method",
      "QCTP safety and recovery support",
    ],
  ),
  entry(
    "foundation.day1.transition.end-spatial-method",
    "QCTP-TRANSITION-01-END-SPATIAL-METHOD",
    "Day 1 end-spatial-method transition",
    "QCTP_SYNTHESIS",
    [SOURCE_FIDELITY_AUTHORITY, "QCTP-TRANSITION-01"],
    ["QCTP controlled source transition"],
  ),
  entry(
    "foundation.day1.phase.pure-observation",
    "QCTP-PURE-OBSERVATION",
    "Day 1 pure observation",
    "QCTP_ORIGINAL",
    [SOURCE_FIDELITY_AUTHORITY, "QCTP-D1-SOURCE-LABELED-SCRIPT-CANDIDATE-REV0"],
    ["QCTP pure observation"],
  ),
  entry(
    "foundation.day1.phase.return",
    "QCTP-RETURN-01",
    "Day 1 complete return",
    "QCTP_ORIGINAL",
    [SOURCE_FIDELITY_AUTHORITY, "QCTP-D1-SOURCE-LABELED-SCRIPT-CANDIDATE-REV0"],
    ["QCTP complete return"],
  ),
  ...Object.entries(stateClasses).map(([stateId, contentClass]) =>
    entry(
      `state.recipe.${stateId}`,
      `state-recipe-${stateId}`,
      stateTitles[stateId as keyof typeof stateTitles],
      contentClass,
      [STATE_ATLAS_AUTHORITY, SOURCE_FIDELITY_AUTHORITY],
      stateId.startsWith("M-")
        ? ["Monroe source-specific target", "QCTP induction"]
        : stateId === "TC-PC"
          ? ["Thomas Campbell source-specific target", "QCTP induction"]
          : ["QCTP State Atlas"],
    ),
  ),
  ...Object.entries(sourceSpecificStateTargets).map(([stateId, target]) =>
    entry(
      `state.target.${stateId}`,
      `state-target-${stateId}`,
      target.title,
      "SOURCE_FAITHFUL",
      target.authorityIds,
      target.sourceLabels,
    ),
  ),
  ...Object.entries(breathMethodClasses).map(([methodId, contentClass]) =>
    entry(
      `breath.method.${methodId}`,
      methodId,
      methodId,
      contentClass,
      [BREATH_AUTHORITY, SOURCE_FIDELITY_AUTHORITY],
      methodId === "QCTP-B2"
        ? ["Cyclic sighing source method", "QCTP safety enhancements"]
        : ["QCTP Breathwork"],
    ),
  ),
  entry(
    "breath.method.physiological-sigh",
    "PHYSIOLOGICAL-SIGH-PRELUDE-REV0",
    "Physiological-sigh prelude",
    "SOURCE_ENHANCED",
    [BREATH_AUTHORITY, SOURCE_FIDELITY_AUTHORITY],
    ["Physiological sigh source method", "QCTP safety limits"],
  ),
  entry(
    "breath.method.natural-breathing",
    "QCTP-NATURAL-BREATH-RECOVERY-REV0",
    "Natural-breathing recovery segment",
    "QCTP_ORIGINAL",
    [BREATH_AUTHORITY, SOURCE_FIDELITY_AUTHORITY],
    ["QCTP Breathwork recovery support"],
  ),
  ...Array.from({ length: 7 }, (_, index) => {
    const id = `BREATH-${String(index + 1).padStart(2, "0")}`;
    return entry(
      `breath.foundation.${id}`,
      id,
      `Breath Foundations ${id}`,
      "QCTP_ORIGINAL",
      [BREATH_AUTHORITY, SOURCE_FIDELITY_AUTHORITY],
      ["QCTP Breath Foundations"],
    );
  }),
  entry(
    "breath.calibration",
    "QCTP-BREATH-CALIBRATION-REV0",
    "Personal Breath Calibration",
    "QCTP_ORIGINAL",
    [BREATH_AUTHORITY, SOURCE_FIDELITY_AUTHORITY],
    ["QCTP Breathwork"],
  ),
  entry(
    "foundation.day1.heartmath-rail",
    "FOUNDATION-DAY-01-HEARTMATH-REV0",
    "Foundation Day 1 HeartMath breath rail",
    "SOURCE_ENHANCED",
    [BREATH_AUTHORITY, SOURCE_FIDELITY_AUTHORITY, "HM-QC-01"],
    ["HeartMath Quick Coherence", "QCTP pacing support"],
  ),
  ...Object.entries(campbellModuleClasses).flatMap(
    ([moduleId, contentClass]) =>
      contentClass
        ? [
            entry(
              `campbell.module.${moduleId}`,
              moduleId,
              `Thomas Campbell ${moduleId} source-concept summary`,
              contentClass,
              [CAMPBELL_AUTHORITY, SOURCE_FIDELITY_AUTHORITY],
              ["Thomas Campbell source concept"],
              moduleId === "TC-02" || moduleId === "TC-06"
                ? "PREREQUISITE"
                : "RELEASED",
            ),
          ]
        : [],
  ),
  ...campbellExerciseIds.map((exerciseId) =>
    entry(
      `campbell.exercise.${exerciseId}`,
      exerciseId,
      `Thomas Campbell controlled exercise ${exerciseId}`,
      "QCTP_ORIGINAL",
      [CAMPBELL_AUTHORITY, SOURCE_FIDELITY_AUTHORITY],
      ["Thomas Campbell source concept", "Original QCTP exercise"],
    ),
  ),
  entry(
    "grant.exercise.REG-01-A",
    "REG-01-A",
    "Learn to See: Two Equal Circles",
    "QCTP_ORIGINAL",
    [REG_AUTHORITY, SOURCE_FIDELITY_AUTHORITY],
    ["Robert Edward Grant public framework", "Original QCTP exercise"],
  ),
  entry(
    "workflow.lab",
    "qctp-lab-workflow",
    "QCTP Lab evidence workflow",
    "QCTP_ORIGINAL",
    [PRODUCT_AUTHORITY, SOURCE_FIDELITY_AUTHORITY],
    ["QCTP workflow"],
    "WORKFLOW",
  ),
  entry(
    "workflow.codex",
    "qctp-codex-workflow",
    "QCTP Codex workflow",
    "QCTP_ORIGINAL",
    [PRODUCT_AUTHORITY, SOURCE_FIDELITY_AUTHORITY],
    ["QCTP workflow"],
    "WORKFLOW",
  ),
  entry(
    "workflow.mirror",
    "qctp-mirror-workflow",
    "QCTP Mirror workflow",
    "QCTP_ORIGINAL",
    [PRODUCT_AUTHORITY, SOURCE_FIDELITY_AUTHORITY],
    ["QCTP workflow"],
    "WORKFLOW",
  ),
];

export const CONTROLLED_CONTENT_REGISTRY = Object.freeze(
  ControlledContentRegistryEntrySchema.array().parse(registryEntries),
);

const registryByAuthorityKey = new Map(
  CONTROLLED_CONTENT_REGISTRY.map((item) => [item.authorityKey, item] as const),
);

if (registryByAuthorityKey.size !== CONTROLLED_CONTENT_REGISTRY.length) {
  throw new Error(
    "Controlled content registry contains a duplicate authority key.",
  );
}

export function getControlledContent(
  authorityKey: string,
): ControlledContentRegistryEntry | null {
  return registryByAuthorityKey.get(authorityKey) ?? null;
}

export const ControlledContentRefSchema = z
  .object({
    authorityKey: z.string().trim().min(1).max(240),
    contentClass: ControlledContentClassSchema,
  })
  .superRefine((reference, context) => {
    const registered = getControlledContent(reference.authorityKey);
    if (!registered) {
      context.addIssue({
        code: "custom",
        path: ["authorityKey"],
        message: `UNREGISTERED_CONTROLLED_CONTENT: ${reference.authorityKey}`,
      });
      return;
    }
    if (registered.contentClass !== reference.contentClass) {
      context.addIssue({
        code: "custom",
        path: ["contentClass"],
        message: `CONTROLLED_CONTENT_CLASS_MISMATCH: expected ${registered.contentClass}`,
      });
    }
  });

export type ControlledContentRef = z.infer<typeof ControlledContentRefSchema>;

export function contentRefFor(authorityKey: string): ControlledContentRef {
  const registered = getControlledContent(authorityKey);
  if (!registered) {
    throw new ControlledContentHoldError(
      "UNREGISTERED_CONTROLLED_CONTENT",
      authorityKey,
      null,
    );
  }
  return ControlledContentRefSchema.parse({
    authorityKey,
    contentClass: registered.contentClass,
  });
}

export function controlledContentRefSchemaFor(authorityKey: string) {
  const expected = contentRefFor(authorityKey);
  return ControlledContentRefSchema.superRefine((reference, context) => {
    if (reference.authorityKey !== expected.authorityKey) {
      context.addIssue({
        code: "custom",
        path: ["authorityKey"],
        message: `CONTROLLED_CONTENT_PARENT_MISMATCH: expected ${expected.authorityKey}`,
      });
    }
  });
}

export const ControlledContentHoldCodeSchema = z.enum([
  "UNREGISTERED_CONTROLLED_CONTENT",
  "UNMAPPED_LEGACY_CONTENT_CLASS",
  "CONTROLLED_CONTENT_CLASS_MISMATCH",
]);

export type ControlledContentHoldCode = z.infer<
  typeof ControlledContentHoldCodeSchema
>;

export const ControlledContentHoldSchema = z.object({
  status: z.literal("HELD"),
  code: ControlledContentHoldCodeSchema,
  authorityKey: z.string().trim().min(1).max(240),
  rawValue: z.string(),
  message: z.string().trim().min(1),
});

export type ControlledContentHold = z.infer<typeof ControlledContentHoldSchema>;

export class ControlledContentHoldError extends Error {
  readonly code: ControlledContentHoldCode;
  readonly authorityKey: string;
  readonly rawValue: string | null;

  constructor(
    code: ControlledContentHoldCode,
    authorityKey: string,
    rawValue: string | null,
  ) {
    super(
      `${code}: ${authorityKey}${rawValue === null ? "" : ` (${rawValue})`}. No data changed.`,
    );
    this.name = "ControlledContentHoldError";
    this.code = code;
    this.authorityKey = authorityKey;
    this.rawValue = rawValue;
  }
}

function projectLegacyHold(
  record: Record<string, unknown>,
  code: ControlledContentHoldCode,
  authorityKey: string,
  rawValue: string,
): Record<string, unknown> {
  const error = new ControlledContentHoldError(code, authorityKey, rawValue);
  return {
    ...record,
    controlledContentHold: ControlledContentHoldSchema.parse({
      status: "HELD",
      code,
      authorityKey,
      rawValue,
      message: error.message,
    }),
  };
}

export function trustedLegacyAuthorityKey(
  fields: Record<string, unknown>,
): string | null {
  if (typeof fields.controlledContentAuthorityKey === "string") {
    return fields.controlledContentAuthorityKey;
  }
  if (
    fields.sourceTrack === "thomas-campbell" &&
    typeof fields.exerciseId === "string"
  ) {
    return `campbell.exercise.${fields.exerciseId}`;
  }
  return null;
}

export function migrateTrustedLegacyContentRef(value: unknown): unknown {
  if (typeof value !== "object" || value === null) return value;
  const record = value as Record<string, unknown>;
  if (typeof record.fields !== "object" || record.fields === null) return value;
  const fields = record.fields as Record<string, unknown>;
  const authorityKey = trustedLegacyAuthorityKey(fields);
  if (!authorityKey || typeof fields.contentClass !== "string") return value;
  const registered = getControlledContent(authorityKey);
  if (!registered) {
    return projectLegacyHold(
      record,
      "UNREGISTERED_CONTROLLED_CONTENT",
      authorityKey,
      fields.contentClass,
    );
  }
  const normalized = normalizeLegacyControlledContentClass(fields.contentClass);
  if (!normalized) {
    return projectLegacyHold(
      record,
      "UNMAPPED_LEGACY_CONTENT_CLASS",
      authorityKey,
      fields.contentClass,
    );
  }
  if (normalized !== registered.contentClass) {
    return projectLegacyHold(
      record,
      "CONTROLLED_CONTENT_CLASS_MISMATCH",
      authorityKey,
      fields.contentClass,
    );
  }
  if (typeof record.contentRef === "object" && record.contentRef !== null) {
    const reference = record.contentRef as Record<string, unknown>;
    if (reference.authorityKey !== authorityKey) {
      throw new ControlledContentHoldError(
        "CONTROLLED_CONTENT_CLASS_MISMATCH",
        authorityKey,
        fields.contentClass,
      );
    }
    if (reference.contentClass !== normalized) {
      throw new ControlledContentHoldError(
        "CONTROLLED_CONTENT_CLASS_MISMATCH",
        authorityKey,
        fields.contentClass,
      );
    }
    return value;
  }
  const resolvedRecord = { ...record };
  Reflect.deleteProperty(resolvedRecord, "controlledContentHold");
  return {
    ...resolvedRecord,
    contentRef: {
      authorityKey,
      contentClass: normalized,
    },
  };
}
