import { z } from "zod";

import {
  ControlledContentClassSchema,
  ControlledContentRefSchema,
  getControlledContent,
  type ControlledContentClass,
  type ControlledContentRef,
} from "../controlled-content";
import { getStateDefinition } from "../state-atlas/catalog";
import { getStatePracticeRecipe } from "../state-atlas/recipes";
import {
  CapabilityLevelSchema,
  StateIdSchema,
  type CapabilityLevel,
  type StateCapabilityRecord,
  type StateId,
} from "../state-atlas/types";
import { getCampbellExercise, THOMAS_CAMPBELL_MODULES } from "./catalog";

export const SourceTrackLifecycleStatusSchema = z.enum([
  "RELEASED",
  "PREREQUISITE",
  "RECIPE_ONLY",
  "ARCHITECTURE_ONLY",
  "EXPERIMENTAL_PROTOCOL",
  "RECORD_ONLY",
  "BLOCKED",
  "DEFERRED",
]);

export type SourceTrackLifecycleStatus = z.infer<
  typeof SourceTrackLifecycleStatusSchema
>;

export const SOURCE_TRACK_LIFECYCLE_DETAILS: Readonly<
  Record<
    SourceTrackLifecycleStatus,
    Readonly<{ label: string; description: string; executable: boolean }>
  >
> = Object.freeze({
  RELEASED: Object.freeze({
    label: "Released controlled scope",
    description:
      "The exact registered activity is available; this does not release later modules.",
    executable: true,
  }),
  PREREQUISITE: Object.freeze({
    label: "Prerequisite hold",
    description:
      "Controlled content exists, but its evidence-backed prerequisite must be present first.",
    executable: true,
  }),
  RECIPE_ONLY: Object.freeze({
    label: "Recipe only",
    description:
      "Only the named bounded recipe is controlled; no complete source track is implied.",
    executable: true,
  }),
  ARCHITECTURE_ONLY: Object.freeze({
    label: "Architecture only",
    description:
      "A product slot exists, but no lesson, practice, or protocol is authorized.",
    executable: false,
  }),
  EXPERIMENTAL_PROTOCOL: Object.freeze({
    label: "Experimental protocol",
    description:
      "Only the registered blinded or feedback-bearing experimental protocol is available.",
    executable: true,
  }),
  RECORD_ONLY: Object.freeze({
    label: "Record only",
    description:
      "User evidence may be logged; no source lesson or practice is provided.",
    executable: true,
  }),
  BLOCKED: Object.freeze({
    label: "Authority hold",
    description:
      "Required controlled authority or implementation evidence is missing.",
    executable: false,
  }),
  DEFERRED: Object.freeze({
    label: "Deferred",
    description:
      "The controlled slot is preserved for later source authoring and acceptance.",
    executable: false,
  }),
});

export const SourceTrackAccessModeSchema = z.enum([
  "profile",
  "exercise",
  "recipe",
  "studio",
  "experiment",
  "record",
]);

export const SourceTrackDestinationSchema = z.enum([
  "today",
  "paths",
  "practice",
  "studio",
  "lab",
  "codex",
  "mirror",
  "export",
]);

export const SourceTrackActionSchema = z.enum([
  "discover",
  "read",
  "start",
  "save",
  "complete",
  "record",
  "export",
]);

export type SourceTrackAction = z.infer<typeof SourceTrackActionSchema>;

export type SourceTrackDestination = z.infer<
  typeof SourceTrackDestinationSchema
>;

function sourceTrackActions(
  ...actions: SourceTrackAction[]
): SourceTrackAction[] {
  return actions;
}

const StateCapabilityRequirementSchema = z.object({
  stateId: StateIdSchema,
  minimumLevel: CapabilityLevelSchema,
});

export const SourceTrackPrerequisiteGroupSchema = z.object({
  id: z.string().trim().min(1).max(240),
  label: z.string().trim().min(1),
  alternatives: z.array(StateCapabilityRequirementSchema).min(1),
});

export const SourceTrackAccessPointSchema = z
  .object({
    id: z.string().trim().min(1).max(240),
    label: z.string().trim().min(1),
    status: SourceTrackLifecycleStatusSchema,
    mode: SourceTrackAccessModeSchema,
    destination: SourceTrackDestinationSchema.nullable(),
    permittedActions: z.array(SourceTrackActionSchema).min(1),
    authorityKeys: z.array(z.string().trim().min(1).max(240)),
    contentClasses: z.array(ControlledContentClassSchema),
    prerequisites: z.array(SourceTrackPrerequisiteGroupSchema),
    safety: z.array(z.string().trim().min(1)),
    evidenceGates: z.array(z.string().trim().min(1)),
    holdReason: z.string().trim().min(1).nullable(),
    nextAction: z.string().trim().min(1),
  })
  .superRefine((access, context) => {
    const details = SOURCE_TRACK_LIFECYCLE_DETAILS[access.status];
    if (!details.executable && access.destination !== null) {
      context.addIssue({
        code: "custom",
        path: ["destination"],
        message: `${access.status} access cannot expose a destination.`,
      });
    }
    if (
      !details.executable &&
      access.permittedActions.some((action) => action !== "discover")
    ) {
      context.addIssue({
        code: "custom",
        path: ["permittedActions"],
        message: `${access.status} access can be discovered but not opened or executed.`,
      });
    }
    if (!details.executable && !access.holdReason) {
      context.addIssue({
        code: "custom",
        path: ["holdReason"],
        message: `${access.status} access requires an explicit hold reason.`,
      });
    }
    if (details.executable && access.destination === null) {
      context.addIssue({
        code: "custom",
        path: ["destination"],
        message: `${access.status} access requires an exact destination.`,
      });
    }
    if (details.executable && access.authorityKeys.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["authorityKeys"],
        message: `${access.status} access requires controlled authority.`,
      });
    }
    if (details.executable && access.contentClasses.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["contentClasses"],
        message: `${access.status} access requires a controlled content class.`,
      });
    }
    if (access.status === "PREREQUISITE" && access.prerequisites.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["prerequisites"],
        message:
          "Prerequisite access requires at least one prerequisite group.",
      });
    }
    if (access.status === "RECIPE_ONLY" && access.mode !== "recipe") {
      context.addIssue({
        code: "custom",
        path: ["mode"],
        message: "Recipe-only access can expose only a registered recipe.",
      });
    }
    if (
      access.status === "EXPERIMENTAL_PROTOCOL" &&
      access.mode !== "experiment"
    ) {
      context.addIssue({
        code: "custom",
        path: ["mode"],
        message:
          "Experimental-protocol access can expose only a registered experiment.",
      });
    }
    if (access.status === "RECORD_ONLY" && access.mode !== "record") {
      context.addIssue({
        code: "custom",
        path: ["mode"],
        message: "Record-only access cannot expose lesson or practice content.",
      });
    }
    if (
      details.executable &&
      access.mode !== "profile" &&
      (access.safety.length === 0 || access.evidenceGates.length === 0)
    ) {
      context.addIssue({
        code: "custom",
        path: access.safety.length === 0 ? ["safety"] : ["evidenceGates"],
        message:
          "Executable source activity requires explicit safety and evidence gates.",
      });
    }
  });

export const SourceTrackRegistryEntrySchema = z.object({
  id: z.string().trim().min(1).max(160),
  label: z.string().trim().min(1),
  status: SourceTrackLifecycleStatusSchema,
  scope: z.string().trim().min(1),
  authorityIds: z.array(z.string().trim().min(1)).min(1),
  sourceLabels: z.array(z.string().trim().min(1)),
  profileAuthorityKey: z.string().trim().min(1).max(240).nullable(),
  releaseAuthority: z.string().trim().min(1),
  holdReason: z.string().trim().min(1).nullable(),
  nextAction: z.string().trim().min(1),
  accessPoints: z.array(SourceTrackAccessPointSchema).min(1),
});

export type SourceTrackAccessPoint = z.infer<
  typeof SourceTrackAccessPointSchema
>;
export type SourceTrackRegistryEntry = z.infer<
  typeof SourceTrackRegistryEntrySchema
>;

export interface SourceTrackRegistryValidation {
  readonly valid: boolean;
  readonly issues: readonly string[];
  readonly entries: readonly SourceTrackRegistryEntry[];
}

const SOURCE_FIDELITY_AUTHORITY = "QCTP-SOURCE-FIDELITY-REV0";
const PRODUCT_AUTHORITY = "QCTP-PRODUCT-ARCH-REV2";
const DAY1_AUTHORITY = "QCTP-D1-SOURCE-LABELED-SCRIPT-CANDIDATE-REV0";
const STATE_ATLAS_AUTHORITY = "QCTP-STATE-ATLAS-REV0";
const CAMPBELL_AUTHORITY = "QCTP-TC-INTEGRATION-REV0";
const REG_AUTHORITY = "QCTP-REG-INTEGRATION-REV0";

function prerequisiteGroupsFor(stateId: StateId) {
  return getStateDefinition(stateId).prerequisiteGroups.map((group, index) => ({
    id: `${stateId}:prerequisite:${String(index + 1)}`,
    label: `Requires ${group
      .map((item) => `${item.stateId} ${item.minimumLevel}`)
      .join(" or ")}.`,
    alternatives: group,
  }));
}

function stateRecipeAccess(input: {
  readonly id: StateId;
  readonly label: string;
  readonly status: "RECIPE_ONLY" | "EXPERIMENTAL_PROTOCOL";
  readonly nextAction: string;
}): z.input<typeof SourceTrackAccessPointSchema> {
  const definition = getStateDefinition(input.id);
  const recipe = getStatePracticeRecipe(input.id);
  return {
    id: input.id,
    label: input.label,
    status: input.status,
    mode: input.status === "EXPERIMENTAL_PROTOCOL" ? "experiment" : "recipe",
    destination: "paths",
    permittedActions:
      input.status === "EXPERIMENTAL_PROTOCOL"
        ? ["discover", "read"]
        : ["discover", "read", "start", "save", "complete"],
    authorityKeys: [
      ...(definition.sourceTargetContentRef
        ? [definition.sourceTargetContentRef.authorityKey]
        : []),
      definition.recipeContentRef.authorityKey,
    ],
    contentClasses: [
      ...(definition.sourceTargetContentRef
        ? [definition.sourceTargetContentRef.contentClass]
        : []),
      definition.recipeContentRef.contentClass,
    ],
    prerequisites: prerequisiteGroupsFor(input.id),
    safety: [...recipe.stopConditions],
    evidenceGates: [
      "A timer never grants capability credit.",
      "Raw markers and a complete return must be recorded before interpretation.",
    ],
    holdReason: null,
    nextAction: input.nextAction,
  };
}

const campbellAccessPoints: Array<
  z.input<typeof SourceTrackAccessPointSchema>
> = [
  {
    id: "profile",
    label: "Thomas Campbell source profile",
    status: "RELEASED",
    mode: "profile",
    destination: "paths",
    permittedActions: ["discover", "read"],
    authorityKeys: ["source.profile.thomas-campbell"],
    contentClasses: ["SOURCE_FAITHFUL"],
    prerequisites: [],
    safety: [],
    evidenceGates: [],
    holdReason: null,
    nextAction: "Review the controlled source profile and module map.",
  },
  ...THOMAS_CAMPBELL_MODULES.map((module) => {
    const exercise = module.exerciseId
      ? getCampbellExercise(module.exerciseId)
      : null;
    if (!exercise || module.status === "reserved") {
      return {
        id: module.id,
        label: `${module.id} — ${module.title}`,
        status: "BLOCKED" as const,
        mode: "exercise" as const,
        destination: null,
        permittedActions: sourceTrackActions("discover"),
        authorityKeys: [],
        contentClasses: [],
        prerequisites: [],
        safety: [],
        evidenceGates: [],
        holdReason:
          "The controlled module map exists, but no released runnable exercise is registered for this module.",
        nextAction:
          "Preserve the module slot until its exact source record, exercise, and acceptance gate are controlled.",
      };
    }
    const stateId =
      module.id === "TC-02" ? "TC-PC" : module.id === "TC-06" ? "QI" : null;
    return {
      id: module.id,
      label: `${module.id} — ${module.title}`,
      status:
        module.status === "prerequisite"
          ? ("PREREQUISITE" as const)
          : ("RELEASED" as const),
      mode: "exercise" as const,
      destination: "paths" as const,
      permittedActions: sourceTrackActions(
        "discover",
        "read",
        "save",
        "complete",
      ),
      authorityKeys: [
        `campbell.module.${module.id}`,
        `campbell.exercise.${exercise.id}`,
      ],
      contentClasses: [
        "SOURCE_FAITHFUL",
        "QCTP_ORIGINAL",
      ] as ControlledContentClass[],
      prerequisites: stateId ? prerequisiteGroupsFor(stateId) : [],
      safety: [...exercise.safety],
      evidenceGates: [exercise.completionGate],
      holdReason: null,
      nextAction:
        module.status === "prerequisite"
          ? "Meet the exact State Atlas prerequisites, then open the controlled exercise."
          : "Open the controlled QCTP exercise and preserve raw evidence first.",
    };
  }),
  stateRecipeAccess({
    id: "TC-PC",
    label: "TC-PC — Point Consciousness recipe",
    status: "RECIPE_ONLY",
    nextAction:
      "Meet the State Atlas gates, then use only the registered TC-PC recipe.",
  }),
  stateRecipeAccess({
    id: "QI",
    label: "QI — Stable Imaginality Environment recipe",
    status: "RECIPE_ONLY",
    nextAction:
      "Meet the State Atlas gates, then use only the registered QI recipe.",
  }),
];

const grantModuleTitles = [
  "Learn to See",
  "Circle, Vesica, and Polarity",
  "Flower and Nested Geometry",
  "Cuboctahedron and Metatron Structures",
  "Perspective and Mirror Reflections",
  "Number Origins and Mathematical Constants",
  "The Quadrivium",
  "Sound, Rhythm, and Harmonic Geometry",
  "Mirror of Consciousness",
  "24 Precepts in Daily Life",
  "Auto-Dictation and Creative Reception",
  "Personal Codex Synthesis",
] as const;

const grantAccessPoints: Array<z.input<typeof SourceTrackAccessPointSchema>> = [
  {
    id: "profile",
    label: "Robert Edward Grant source profile",
    status: "RELEASED",
    mode: "profile",
    destination: "paths",
    permittedActions: ["discover", "read"],
    authorityKeys: ["source.profile.robert-edward-grant"],
    contentClasses: ["SOURCE_FAITHFUL"],
    prerequisites: [],
    safety: [],
    evidenceGates: [],
    holdReason: null,
    nextAction: "Review the controlled source profile and twelve-module map.",
  },
  ...grantModuleTitles.map((title, index) => {
    const moduleId = `REG-${String(index + 1).padStart(2, "0")}`;
    if (index === 0) {
      return {
        id: "REG-01-A",
        label: `${moduleId} — ${title}`,
        status: "RELEASED" as const,
        mode: "studio" as const,
        destination: "studio" as const,
        permittedActions: sourceTrackActions(
          "discover",
          "read",
          "start",
          "save",
          "complete",
        ),
        authorityKeys: ["grant.exercise.REG-01-A"],
        contentClasses: ["QCTP_ORIGINAL" as const],
        prerequisites: [],
        safety: [
          "Use an eyes-open seated desk or work surface; do not combine the construction with driving, machinery, cutting, ladders, or hazardous activity.",
        ],
        evidenceGates: [
          "Preserve the construction artifact, raw observation, five-minute auto-dictation, and later interpretation as separate linked layers.",
        ],
        holdReason: null,
        nextAction: "Open the controlled REG-01 Studio session.",
      };
    }
    return {
      id: moduleId,
      label: `${moduleId} — ${title}`,
      status: "DEFERRED" as const,
      mode: "studio" as const,
      destination: null,
      permittedActions: sourceTrackActions("discover"),
      authorityKeys: [],
      contentClasses: [],
      prerequisites: [],
      safety: [],
      evidenceGates: [],
      holdReason:
        "The module architecture is controlled, but its runnable lesson and Studio exercise have not been authored and verified.",
      nextAction:
        "Keep this module unavailable until its source baseline, QCTP delta, and acceptance evidence are controlled.",
    };
  }),
];

const rawRegistry: Array<z.input<typeof SourceTrackRegistryEntrySchema>> = [
  {
    id: "thomas-campbell",
    label: "Thomas Campbell",
    status: "RELEASED",
    scope:
      "Five controlled original QCTP exercises plus source-specific State Atlas recipes; later modules remain held.",
    authorityIds: [
      CAMPBELL_AUTHORITY,
      SOURCE_FIDELITY_AUTHORITY,
      STATE_ATLAS_AUTHORITY,
    ],
    sourceLabels: [
      "Thomas Campbell public source set",
      "Original QCTP exercises",
    ],
    profileAuthorityKey: "source.profile.thomas-campbell",
    releaseAuthority: "CONTROLLED_MVP_SCOPE_ONLY_ZERO_RELEASE",
    holdReason: null,
    nextAction: "Use only an access point that independently passes its gate.",
    accessPoints: campbellAccessPoints,
  },
  {
    id: "robert-edward-grant",
    label: "Robert Edward Grant",
    status: "RELEASED",
    scope: "REG-01-A is available; REG-02 through REG-12 remain deferred.",
    authorityIds: [REG_AUTHORITY, SOURCE_FIDELITY_AUTHORITY, PRODUCT_AUTHORITY],
    sourceLabels: [
      "Robert Edward Grant public framework",
      "Original QCTP exercise",
    ],
    profileAuthorityKey: "source.profile.robert-edward-grant",
    releaseAuthority: "REG_01_MVP_ONLY_ZERO_RELEASE",
    holdReason: null,
    nextAction: "Use REG-01-A only; do not infer release of later modules.",
    accessPoints: grantAccessPoints,
  },
  ...[
    {
      id: "theresa-bullard",
      label: "Theresa Bullard",
      profile: "source.profile.bullard",
      phase: "foundation.day1.phase.bullard-contraction",
      sourceId: "TB-ANCHOR-01",
      scope: "Controlled Day 1 contraction-awareness phase only.",
    },
    {
      id: "heartmath",
      label: "HeartMath",
      profile: "source.profile.heartmath",
      phase: "foundation.day1.phase.heart-coherence",
      sourceId: "HM-QC-01",
      scope: "Controlled Day 1 coherence phase and breath rail only.",
    },
    {
      id: "joe-dispenza",
      label: "Joe Dispenza",
      profile: "source.profile.dispenza",
      phase: "foundation.day1.phase.spatial-induction",
      sourceId: "JD-SPACE-01",
      scope: "Controlled Day 1 spatial-attention phases only.",
    },
  ].map((source) => ({
    id: source.id,
    label: source.label,
    status: "RECIPE_ONLY" as const,
    scope: source.scope,
    authorityIds: [SOURCE_FIDELITY_AUTHORITY, DAY1_AUTHORITY, source.sourceId],
    sourceLabels: [source.label, "QCTP Day 1 enhancement layer"],
    profileAuthorityKey: source.profile,
    releaseAuthority: "DAY1_CONTROLLED_SCOPE_ONLY_ZERO_RELEASE",
    holdReason:
      "No independent full source track is released from the Day 1 source operation.",
    nextAction: "Use the source only inside the controlled Day 1 sequence.",
    accessPoints: [
      {
        id: "profile",
        label: `${source.label} source profile`,
        status: "RELEASED" as const,
        mode: "profile" as const,
        destination: "paths" as const,
        permittedActions: sourceTrackActions("discover", "read"),
        authorityKeys: [source.profile],
        contentClasses: ["SOURCE_FAITHFUL" as const],
        prerequisites: [],
        safety: [],
        evidenceGates: [],
        holdReason: null,
        nextAction: "Review the controlled source profile.",
      },
      {
        id: "day1-operation",
        label: `${source.label} Day 1 operation`,
        status: "RECIPE_ONLY" as const,
        mode: "recipe" as const,
        destination: "today" as const,
        permittedActions: sourceTrackActions(
          "discover",
          "read",
          "start",
          "save",
          "complete",
        ),
        authorityKeys:
          source.id === "heartmath"
            ? [source.phase, "foundation.day1.heartmath-rail"]
            : source.id === "joe-dispenza"
              ? [source.phase, "foundation.day1.phase.open-spatial-awareness"]
              : [source.phase],
        contentClasses: ["SOURCE_ENHANCED" as const],
        prerequisites: [],
        safety: [
          "Use only inside the controlled Day 1 sequence and complete the full return.",
        ],
        evidenceGates: [
          "Completion requires the exact Day 1 sequence and full-return record; this phase alone grants no capability credit.",
        ],
        holdReason: null,
        nextAction: "Open the controlled Day 1 practice.",
      },
    ],
  })),
  {
    id: "monroe-buhlman",
    label: "Monroe / Buhlman",
    status: "RECIPE_ONLY",
    scope:
      "Only the controlled M-F10, M-F12, and QO State Atlas recipes are available; no proprietary audio or expanded source course is included.",
    authorityIds: [
      STATE_ATLAS_AUTHORITY,
      SOURCE_FIDELITY_AUTHORITY,
      PRODUCT_AUTHORITY,
    ],
    sourceLabels: [
      "Monroe source-specific targets",
      "QCTP original candidate recipes",
    ],
    profileAuthorityKey: null,
    releaseAuthority: "STATE_RECIPE_SCOPE_ONLY_ZERO_RELEASE",
    holdReason:
      "An independent Monroe/Buhlman source track is not released; only registered State Atlas scope exists.",
    nextAction:
      "Meet the State Atlas prerequisites and use only a registered recipe.",
    accessPoints: [
      stateRecipeAccess({
        id: "M-F10",
        label: "M-F10 — Focus 10 candidate recipe",
        status: "RECIPE_ONLY",
        nextAction:
          "Meet both State Atlas prerequisite groups, then review M-F10.",
      }),
      stateRecipeAccess({
        id: "M-F12",
        label: "M-F12 — Focus 12 candidate recipe",
        status: "RECIPE_ONLY",
        nextAction: "Stabilize M-F10, then review M-F12.",
      }),
      stateRecipeAccess({
        id: "QO",
        label: "QO — OBE threshold and separation recipe",
        status: "RECIPE_ONLY",
        nextAction:
          "Stabilize M-F10, then review only the controlled QO recipe.",
      }),
      {
        id: "buhlman-expanded-track",
        label: "Expanded William Buhlman instruction",
        status: "BLOCKED",
        mode: "recipe",
        destination: null,
        permittedActions: ["discover"],
        authorityKeys: [],
        contentClasses: [],
        prerequisites: [],
        safety: [],
        evidenceGates: [],
        holdReason:
          "No complete controlled source record or crosswalk authorizes independent Buhlman practice content.",
        nextAction:
          "Create and approve the exact source record and crosswalk before authoring any runnable instruction.",
      },
    ],
  },
  {
    id: "remote-viewing",
    label: "Remote viewing",
    status: "EXPERIMENTAL_PROTOCOL",
    scope:
      "A bounded State Atlas receiver protocol exists; target secrecy, immutable raw capture, feedback, and calibration remain mandatory.",
    authorityIds: [
      STATE_ATLAS_AUTHORITY,
      CAMPBELL_AUTHORITY,
      SOURCE_FIDELITY_AUTHORITY,
    ],
    sourceLabels: [
      "QCTP experimental synthesis",
      "Controlled Campbell experiment foundation",
    ],
    profileAuthorityKey: null,
    releaseAuthority: "CONTROLLED_EXPERIMENT_SCOPE_ONLY_ZERO_RELEASE",
    holdReason: null,
    nextAction:
      "Meet prerequisites and use only the blinded feedback-bearing protocol.",
    accessPoints: [
      stateRecipeAccess({
        id: "QR",
        label: "QR — Remote-information receiver protocol",
        status: "EXPERIMENTAL_PROTOCOL",
        nextAction:
          "Meet both prerequisite groups, preserve target secrecy, and open the controlled QR protocol.",
      }),
    ],
  },
  {
    id: "psionics",
    label: "Psionics",
    status: "RECORD_ONLY",
    scope:
      "The app may preserve user observations and experiments; no source lesson, construct-training method, or practice is released.",
    authorityIds: [PRODUCT_AUTHORITY, SOURCE_FIDELITY_AUTHORITY],
    sourceLabels: ["User evidence only", "QCTP record workflow"],
    profileAuthorityKey: null,
    releaseAuthority: "RECORD_ONLY_ZERO_RELEASE",
    holdReason:
      "Controlled source instruction is absent; logging must not imply method authority.",
    nextAction: "Use the generic Lab ledger only to preserve user evidence.",
    accessPoints: [
      {
        id: "record",
        label: "Psionics user-evidence record",
        status: "RECORD_ONLY",
        mode: "record",
        destination: "lab",
        permittedActions: ["discover", "record", "export"],
        authorityKeys: ["workflow.lab"],
        contentClasses: ["QCTP_ORIGINAL"],
        prerequisites: [],
        safety: [
          "Record observations without treating patterns, sensations, or interpretations as verified external effects.",
        ],
        evidenceGates: [
          "Raw outcome, controls, and later interpretation remain separate; no timer or record grants capability credit.",
        ],
        holdReason: null,
        nextAction: "Open a generic record-only Lab entry.",
      },
    ],
  },
  {
    id: "mossbridge",
    label: "Mossbridge",
    status: "ARCHITECTURE_ONLY",
    scope:
      "A source-track architecture slot exists; no runnable content is controlled.",
    authorityIds: [PRODUCT_AUTHORITY, SOURCE_FIDELITY_AUTHORITY],
    sourceLabels: ["Architecture slot only"],
    profileAuthorityKey: null,
    releaseAuthority: "ZERO_RELEASE",
    holdReason:
      "No complete controlled source record, crosswalk, lesson, or practice is present.",
    nextAction: "Acquire and control a source record before implementation.",
    accessPoints: [
      {
        id: "architecture",
        label: "Mossbridge architecture slot",
        status: "ARCHITECTURE_ONLY",
        mode: "profile",
        destination: null,
        permittedActions: ["discover"],
        authorityKeys: [],
        contentClasses: [],
        prerequisites: [],
        safety: [],
        evidenceGates: [],
        holdReason:
          "Architecture metadata does not authorize a lesson, practice, experiment, or claim.",
        nextAction: "Control an exact source record and crosswalk first.",
      },
    ],
  },
  {
    id: "lynne-mctaggart",
    label: "Lynne McTaggart",
    status: "DEFERRED",
    scope:
      "The product architecture names a future source track; no Rev3 content package is authorized.",
    authorityIds: [PRODUCT_AUTHORITY, SOURCE_FIDELITY_AUTHORITY],
    sourceLabels: ["Deferred source-track slot"],
    profileAuthorityKey: null,
    releaseAuthority: "ZERO_RELEASE",
    holdReason:
      "No controlled source baseline, crosswalk, implementation package, or acceptance evidence is present.",
    nextAction: "Defer until a controlled source package is supplied.",
    accessPoints: [
      {
        id: "DEFERRED",
        label: "Lynne McTaggart source-track slot",
        status: "DEFERRED",
        mode: "profile",
        destination: null,
        permittedActions: ["discover"],
        authorityKeys: [],
        contentClasses: [],
        prerequisites: [],
        safety: [],
        evidenceGates: [],
        holdReason: "No controlled Rev3 source-track content is available.",
        nextAction: "Wait for controlled source authoring authority.",
      },
    ],
  },
];

function issuePath(
  path: readonly (string | number)[],
  message: string,
): string {
  return `${path.join(".")}: ${message}`;
}

function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object" || Object.isFrozen(value)) {
    return value;
  }
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export interface StateSourceTrackRoute {
  readonly trackId: string;
  readonly accessId: string;
}

const stateSourceTrackRoutes = deepFreeze({
  "TC-PC": { trackId: "thomas-campbell", accessId: "TC-PC" },
  "M-F10": { trackId: "monroe-buhlman", accessId: "M-F10" },
  "M-F12": { trackId: "monroe-buhlman", accessId: "M-F12" },
  QR: { trackId: "remote-viewing", accessId: "QR" },
  QO: { trackId: "monroe-buhlman", accessId: "QO" },
  QI: { trackId: "thomas-campbell", accessId: "QI" },
} satisfies Partial<Record<StateId, StateSourceTrackRoute>>);

export function getStateSourceTrackRoute(
  stateId: StateId,
): StateSourceTrackRoute | null {
  return (
    stateSourceTrackRoutes[stateId as keyof typeof stateSourceTrackRoutes] ??
    null
  );
}

function stateAuthorityKeys(stateId: string): readonly string[] | null {
  const parsed = StateIdSchema.safeParse(stateId);
  if (!parsed.success) return null;
  const definition = getStateDefinition(parsed.data);
  return [
    ...(definition.sourceTargetContentRef
      ? [definition.sourceTargetContentRef.authorityKey]
      : []),
    definition.recipeContentRef.authorityKey,
  ];
}

const day1AuthorityKeysByTrack = Object.freeze({
  "theresa-bullard": ["foundation.day1.phase.bullard-contraction"],
  heartmath: [
    "foundation.day1.phase.heart-coherence",
    "foundation.day1.heartmath-rail",
  ],
  "joe-dispenza": [
    "foundation.day1.phase.spatial-induction",
    "foundation.day1.phase.open-spatial-awareness",
  ],
} as const);

function expectedAuthorityKeys(
  entry: z.infer<typeof SourceTrackRegistryEntrySchema>,
  access: z.infer<typeof SourceTrackAccessPointSchema>,
): readonly string[] | null {
  if (access.id === "profile") {
    return entry.profileAuthorityKey ? [entry.profileAuthorityKey] : null;
  }
  if (entry.id === "thomas-campbell") {
    if (access.id === "TC-PC" || access.id === "QI") {
      return stateAuthorityKeys(access.id);
    }
    const module = THOMAS_CAMPBELL_MODULES.find(
      (candidate) => candidate.id === access.id,
    );
    const exercise = module?.exerciseId
      ? getCampbellExercise(module.exerciseId)
      : null;
    return module && exercise && module.status !== "reserved"
      ? [`campbell.module.${module.id}`, `campbell.exercise.${exercise.id}`]
      : [];
  }
  if (entry.id === "robert-edward-grant") {
    return access.id === "REG-01-A" ? ["grant.exercise.REG-01-A"] : [];
  }
  if (entry.id in day1AuthorityKeysByTrack) {
    return access.id === "day1-operation"
      ? day1AuthorityKeysByTrack[
          entry.id as keyof typeof day1AuthorityKeysByTrack
        ]
      : null;
  }
  if (entry.id === "monroe-buhlman" || entry.id === "remote-viewing") {
    return access.id === "buhlman-expanded-track"
      ? []
      : stateAuthorityKeys(access.id);
  }
  if (entry.id === "psionics") {
    return access.id === "record" ? ["workflow.lab"] : null;
  }
  if (entry.id === "mossbridge" || entry.id === "lynne-mctaggart") {
    return [];
  }
  return null;
}

export function validateSourceTrackRegistry(
  input: unknown,
): SourceTrackRegistryValidation {
  const parsed = SourceTrackRegistryEntrySchema.array().safeParse(input);
  if (!parsed.success) {
    return deepFreeze({
      valid: false,
      entries: [],
      issues: parsed.error.issues.map((issue) =>
        issuePath(issue.path.map(String), issue.message),
      ),
    });
  }

  const issues: string[] = [];
  const trackIds = new Set<string>();
  for (const entry of parsed.data) {
    if (trackIds.has(entry.id))
      issues.push(`Duplicate source-track ID: ${entry.id}`);
    trackIds.add(entry.id);

    if (entry.profileAuthorityKey) {
      const profile = getControlledContent(entry.profileAuthorityKey);
      if (!profile) {
        issues.push(
          `${entry.id}: unregistered profile authority ${entry.profileAuthorityKey}`,
        );
      } else if (profile.contentClass !== "SOURCE_FAITHFUL") {
        issues.push(
          `${entry.id}: source profile must be SOURCE_FAITHFUL, received ${profile.contentClass}`,
        );
      }
    }

    const accessIds = new Set<string>();
    for (const access of entry.accessPoints) {
      if (accessIds.has(access.id)) {
        issues.push(`${entry.id}: duplicate access-point ID ${access.id}`);
      }
      accessIds.add(access.id);
      const expectedKeys = expectedAuthorityKeys(entry, access);
      if (expectedKeys === null) {
        issues.push(
          `${entry.id}.${access.id}: no canonical parent binding is registered`,
        );
      } else if (
        expectedKeys.length !== access.authorityKeys.length ||
        expectedKeys.some(
          (authorityKey, index) => authorityKey !== access.authorityKeys[index],
        )
      ) {
        issues.push(
          `${entry.id}.${access.id}: authority parent mismatch; expected ${expectedKeys.join(", ") || "no runnable authority"}`,
        );
      }
      for (const authorityKey of access.authorityKeys) {
        const controlled = getControlledContent(authorityKey);
        if (!controlled) {
          issues.push(
            `${entry.id}.${access.id}: unregistered authority ${authorityKey}`,
          );
          continue;
        }
        if (!access.contentClasses.includes(controlled.contentClass)) {
          issues.push(
            `${entry.id}.${access.id}: ${authorityKey} class ${controlled.contentClass} is not declared by the access point`,
          );
        }
      }
    }
  }

  return deepFreeze({
    valid: issues.length === 0,
    entries: issues.length === 0 ? parsed.data : [],
    issues,
  });
}

export const SOURCE_TRACK_REGISTRY_VALIDATION =
  validateSourceTrackRegistry(rawRegistry);

export const CONTROLLED_SOURCE_TRACK_REGISTRY =
  SOURCE_TRACK_REGISTRY_VALIDATION.entries;

const registryById = new Map(
  CONTROLLED_SOURCE_TRACK_REGISTRY.map((entry) => [entry.id, entry] as const),
);

export function getSourceTrack(
  trackId: string,
): SourceTrackRegistryEntry | null {
  if (!SOURCE_TRACK_REGISTRY_VALIDATION.valid) return null;
  return registryById.get(trackId) ?? null;
}

export function getSourceTrackAccessPoint(
  trackId: string,
  accessId: string,
): SourceTrackAccessPoint | null {
  return (
    getSourceTrack(trackId)?.accessPoints.find(
      (access) => access.id === accessId,
    ) ?? null
  );
}

const capabilityRank = new Map<CapabilityLevel, number>(
  CapabilityLevelSchema.options.map((level, index) => [level, index]),
);

function requirementMet(
  requirement: z.infer<typeof StateCapabilityRequirementSchema>,
  capabilities: ReadonlyMap<StateId, CapabilityLevel>,
): boolean {
  const actual = capabilities.get(requirement.stateId);
  return (
    actual !== undefined &&
    (capabilityRank.get(actual) ?? -1) >=
      (capabilityRank.get(requirement.minimumLevel) ?? Number.MAX_SAFE_INTEGER)
  );
}

export const SourceTrackAccessDecisionCodeSchema = z.enum([
  "ALLOWED",
  "REGISTRY_INVALID",
  "UNKNOWN_TRACK",
  "UNKNOWN_ACCESS_POINT",
  "LIFECYCLE_HOLD",
  "ACTION_NOT_PERMITTED",
  "DESTINATION_MISMATCH",
  "AUTHORITY_HOLD",
  "CONTENT_CLASS_HOLD",
  "PREREQUISITES_UNMET",
]);

export interface SourceTrackAccessDecision {
  readonly allowed: boolean;
  readonly code: z.infer<typeof SourceTrackAccessDecisionCodeSchema>;
  readonly track: SourceTrackRegistryEntry | null;
  readonly accessPoint: SourceTrackAccessPoint | null;
  readonly message: string;
  readonly unmetPrerequisites: readonly string[];
  readonly nextAction: string;
}

function heldDecision(input: Omit<SourceTrackAccessDecision, "allowed">) {
  return Object.freeze({ allowed: false, ...input });
}

export function evaluateSourceTrackAccess(input: {
  readonly trackId: string;
  readonly accessId: string;
  readonly destination: SourceTrackDestination;
  readonly action: SourceTrackAction;
  readonly capabilities?: readonly (Pick<
    StateCapabilityRecord,
    "stateId" | "level"
  > & { readonly sourceTrackHold?: unknown })[];
}): SourceTrackAccessDecision {
  if (!SOURCE_TRACK_REGISTRY_VALIDATION.valid) {
    return heldDecision({
      code: "REGISTRY_INVALID",
      track: null,
      accessPoint: null,
      message: `Source registry authority hold: ${SOURCE_TRACK_REGISTRY_VALIDATION.issues.join("; ")}`,
      unmetPrerequisites: [],
      nextAction:
        "Repair and verify the controlled registry before exposing content.",
    });
  }
  const track = getSourceTrack(input.trackId);
  if (!track) {
    return heldDecision({
      code: "UNKNOWN_TRACK",
      track: null,
      accessPoint: null,
      message: `Unknown source track: ${input.trackId}. No content was opened.`,
      unmetPrerequisites: [],
      nextAction: "Return to the controlled Paths registry.",
    });
  }
  const accessPoint = getSourceTrackAccessPoint(track.id, input.accessId);
  if (!accessPoint) {
    return heldDecision({
      code: "UNKNOWN_ACCESS_POINT",
      track,
      accessPoint: null,
      message: `Unknown controlled access point: ${input.accessId}. No content was opened.`,
      unmetPrerequisites: [],
      nextAction: track.nextAction,
    });
  }
  if (!SOURCE_TRACK_LIFECYCLE_DETAILS[accessPoint.status].executable) {
    return heldDecision({
      code: "LIFECYCLE_HOLD",
      track,
      accessPoint,
      message: accessPoint.holdReason ?? "This content remains held.",
      unmetPrerequisites: [],
      nextAction: accessPoint.nextAction,
    });
  }
  if (!accessPoint.permittedActions.includes(input.action)) {
    return heldDecision({
      code: "ACTION_NOT_PERMITTED",
      track,
      accessPoint,
      message: `${accessPoint.label} does not authorize ${input.action}. No content was opened and no data changed.`,
      unmetPrerequisites: [],
      nextAction: accessPoint.nextAction,
    });
  }
  if (accessPoint.destination !== input.destination) {
    return heldDecision({
      code: "DESTINATION_MISMATCH",
      track,
      accessPoint,
      message: `${accessPoint.label} is not authorized for ${input.destination}. No content was opened.`,
      unmetPrerequisites: [],
      nextAction: accessPoint.nextAction,
    });
  }
  for (const authorityKey of accessPoint.authorityKeys) {
    const controlled = getControlledContent(authorityKey);
    if (!controlled) {
      return heldDecision({
        code: "AUTHORITY_HOLD",
        track,
        accessPoint,
        message: `Missing controlled authority: ${authorityKey}. No content was opened.`,
        unmetPrerequisites: [],
        nextAction: "Restore and verify the exact authority record.",
      });
    }
    if (!accessPoint.contentClasses.includes(controlled.contentClass)) {
      return heldDecision({
        code: "CONTENT_CLASS_HOLD",
        track,
        accessPoint,
        message: `Controlled class mismatch for ${authorityKey}. No content was opened.`,
        unmetPrerequisites: [],
        nextAction:
          "Correct the registry binding and rerun controlled verification.",
      });
    }
  }
  const capabilities = new Map(
    (input.capabilities ?? [])
      .filter((capability) => !capability.sourceTrackHold)
      .map((capability) => [capability.stateId, capability.level]),
  );
  const unmetPrerequisites = accessPoint.prerequisites
    .filter(
      (group) =>
        !group.alternatives.some((requirement) =>
          requirementMet(requirement, capabilities),
        ),
    )
    .map((group) => group.label);
  if (unmetPrerequisites.length > 0) {
    return heldDecision({
      code: "PREREQUISITES_UNMET",
      track,
      accessPoint,
      message: "Evidence-backed prerequisites are not yet present.",
      unmetPrerequisites,
      nextAction: accessPoint.nextAction,
    });
  }
  return Object.freeze({
    allowed: true,
    code: "ALLOWED" as const,
    track,
    accessPoint,
    message: `${accessPoint.label} passed the controlled route gate.`,
    unmetPrerequisites: [],
    nextAction: accessPoint.nextAction,
  });
}

const SourceTrackReferenceObjectSchema = z
  .object({
    trackId: z.string().trim().min(1).max(160),
    trackLabel: z.string().trim().min(1),
    trackStatus: SourceTrackLifecycleStatusSchema,
    accessId: z.string().trim().min(1).max(240),
    accessLabel: z.string().trim().min(1),
    accessStatus: SourceTrackLifecycleStatusSchema,
    authorityIds: z.array(z.string().trim().min(1)).min(1),
    contentRefs: z.array(ControlledContentRefSchema).min(1),
  })
  .strict();

export const SourceTrackReferenceSchema =
  SourceTrackReferenceObjectSchema.superRefine((reference, context) => {
    const track = getSourceTrack(reference.trackId);
    const access = getSourceTrackAccessPoint(
      reference.trackId,
      reference.accessId,
    );
    if (!track || !access) {
      context.addIssue({
        code: "custom",
        path: ["trackId"],
        message:
          "SOURCE_TRACK_REFERENCE_HOLD: unregistered track or access point",
      });
      return;
    }
    if (
      reference.trackLabel !== track.label ||
      reference.trackStatus !== track.status ||
      reference.accessLabel !== access.label ||
      reference.accessStatus !== access.status
    ) {
      context.addIssue({
        code: "custom",
        path: ["accessId"],
        message: "SOURCE_TRACK_REFERENCE_HOLD: registry metadata mismatch",
      });
    }
    if (
      reference.authorityIds.length !== track.authorityIds.length ||
      reference.authorityIds.some(
        (authorityId, index) => authorityId !== track.authorityIds[index],
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["authorityIds"],
        message: "SOURCE_TRACK_REFERENCE_HOLD: authority lineage mismatch",
      });
    }
    if (
      reference.contentRefs.length !== access.authorityKeys.length ||
      reference.contentRefs.some(
        (contentRef, index) =>
          contentRef.authorityKey !== access.authorityKeys[index],
      )
    ) {
      context.addIssue({
        code: "custom",
        path: ["contentRefs"],
        message: "SOURCE_TRACK_REFERENCE_HOLD: authority binding mismatch",
      });
    }
  });

export type SourceTrackReference = z.infer<typeof SourceTrackReferenceSchema>;

export function sourceTrackReferenceFor(
  trackId: string,
  accessId: string,
): SourceTrackReference {
  const track = getSourceTrack(trackId);
  const access = getSourceTrackAccessPoint(trackId, accessId);
  if (!track || !access || access.authorityKeys.length === 0) {
    throw new Error(
      `SOURCE_TRACK_REFERENCE_HOLD: ${trackId}.${accessId}. No data changed.`,
    );
  }
  const contentRefs: ControlledContentRef[] = access.authorityKeys.map(
    (authorityKey) => {
      const controlled = getControlledContent(authorityKey);
      if (!controlled) {
        throw new Error(
          `SOURCE_TRACK_REFERENCE_HOLD: ${authorityKey}. No data changed.`,
        );
      }
      return ControlledContentRefSchema.parse({
        authorityKey,
        contentClass: controlled.contentClass,
      });
    },
  );
  return SourceTrackReferenceSchema.parse({
    trackId: track.id,
    trackLabel: track.label,
    trackStatus: track.status,
    accessId: access.id,
    accessLabel: access.label,
    accessStatus: access.status,
    authorityIds: track.authorityIds,
    contentRefs,
  });
}

export const CONTROLLED_SOURCE_ARCHITECTURE =
  CONTROLLED_SOURCE_TRACK_REGISTRY.map((entry) => ({
    id: entry.id,
    label: entry.label,
    status: entry.status,
  }));
