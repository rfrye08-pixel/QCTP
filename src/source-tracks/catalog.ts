export type SourceContentClass =
  | "source_faithful_summary"
  | "source_enhanced"
  | "qctp_synthesis"
  | "qctp_original";

export interface SourceTrackModule {
  id: string;
  title: string;
  status: "ready" | "prerequisite" | "reserved";
  contentClass: SourceContentClass;
  sourceLabel: string;
  objective: string;
  exerciseId: string | null;
  prerequisites: readonly string[];
  capabilityOutput: string;
}

export interface SourceExerciseField {
  id: string;
  label: string;
  layer: "raw" | "interpretation";
  input: "text" | "number";
}

export interface SourceTrackExercise {
  id: string;
  moduleId: string;
  title: string;
  contentClass: "qctp_original";
  sourceConcept: string;
  instructions: readonly string[];
  fields: readonly SourceExerciseField[];
  completionGate: string;
  safety: readonly string[];
}

const CAMPBELL_LABEL =
  "Thomas Campbell source concept · original QCTP exercise";

export const THOMAS_CAMPBELL_MODULES: readonly SourceTrackModule[] = [
  {
    id: "TC-01",
    title: "Open-Minded Skepticism",
    status: "ready",
    contentClass: "qctp_original",
    sourceLabel: CAMPBELL_LABEL,
    objective:
      "Distinguish possibility, probability, belief, disbelief, and personal knowledge while preserving contrary data.",
    exerciseId: "TC-01-POSSIBILITY-LEDGER",
    prerequisites: [],
    capabilityOutput:
      "Three feedback-bearing ledgers with one data-led update.",
  },
  {
    id: "TC-02",
    title: "Meditation Mechanics and Point Consciousness",
    status: "prerequisite",
    contentClass: "source_enhanced",
    sourceLabel:
      "Campbell point-consciousness target · hardened QCTP State Atlas recipe",
    objective:
      "Reduce sensory and intellectual dominance without strain while alert continuity remains present.",
    exerciseId: "TC-02-POINT-CONSCIOUSNESS",
    prerequisites: ["Q3 Stabilized"],
    capabilityOutput: "TC-PC Stabilized through evidence, not elapsed time.",
  },
  {
    id: "TC-03",
    title: "Intellect, Intuition, and Noise",
    status: "reserved",
    contentClass: "qctp_original",
    sourceLabel: CAMPBELL_LABEL,
    objective:
      "Separate first impressions, second impressions, and intellectual story using feedback.",
    exerciseId: null,
    prerequisites: ["TC-01 complete"],
    capabilityOutput: "Twenty feedback-bearing First / Second / Story trials.",
  },
  {
    id: "TC-04",
    title: "Intent Quality",
    status: "ready",
    contentClass: "qctp_original",
    sourceLabel: CAMPBELL_LABEL,
    objective:
      "Compare stated desire, control, fear, image protection, caring action, behavior, and outcome.",
    exerciseId: "TC-04-INTENT-STACK",
    prerequisites: [],
    capabilityOutput: "Five real-life Intent Stacks with later outcome review.",
  },
  {
    id: "TC-05",
    title: "Fear, Ego, and Belief Audit",
    status: "ready",
    contentClass: "qctp_original",
    sourceLabel: CAMPBELL_LABEL,
    objective:
      "Reconstruct observable triggers and test one lower-fear behavior without forcing an interpretation.",
    exerciseId: "TC-05-TRIGGER-RECONSTRUCTION",
    prerequisites: [],
    capabilityOutput:
      "One repeated trigger across three records and one lower-fear experiment.",
  },
  {
    id: "TC-06",
    title: "Stable Imaginality",
    status: "prerequisite",
    contentClass: "qctp_original",
    sourceLabel:
      "Campbell imaginality concept · original QCTP environment exercise",
    objective:
      "Revisit a stable inner environment while separating deliberate construction from spontaneous candidates.",
    exerciseId: "TC-06-IMAGINALITY-MAP",
    prerequisites: ["Q3 Stabilized", "Q4 Accessed"],
    capabilityOutput:
      "QI map with stable anchor relationships across three sessions.",
  },
  {
    id: "TC-07",
    title: "Remote Information Experiments",
    status: "reserved",
    contentClass: "qctp_original",
    sourceLabel: CAMPBELL_LABEL,
    objective:
      "Use blinded target IDs, immutable raw descriptors, separated analytical overlay, and honest feedback scoring.",
    exerciseId: null,
    prerequisites: ["TC-PC Stabilized or QR prerequisites met"],
    capabilityOutput: "Ten-session blinded feedback-bearing set.",
  },
  {
    id: "TC-08",
    title: "Probable Future and Decision Trees",
    status: "reserved",
    contentClass: "qctp_original",
    sourceLabel: CAMPBELL_LABEL,
    objective:
      "Treat future impressions as probabilities and return on a predefined feedback date.",
    exerciseId: null,
    prerequisites: ["TC-07 complete"],
    capabilityOutput: "Five delayed-feedback branch forecasts.",
  },
  {
    id: "TC-09",
    title: "OBE, Data-Stream Transition, and Healing Intent",
    status: "reserved",
    contentClass: "source_enhanced",
    sourceLabel:
      "Campbell source-specific concepts · QCTP safety and experiment controls",
    objective:
      "Use a stable prerequisite state without breath strain; keep healing intent consent-based and nonmedical.",
    exerciseId: null,
    prerequisites: ["M-F10 Stabilized or TC-PC Stabilized"],
    capabilityOutput:
      "Coherent continuity record or five bounded outcome reviews.",
  },
  {
    id: "TC-10",
    title: "Quality of Consciousness in Daily Life",
    status: "reserved",
    contentClass: "qctp_original",
    sourceLabel: CAMPBELL_LABEL,
    objective:
      "Translate practice into lower-fear, caring, authentic, and responsible choices.",
    exerciseId: null,
    prerequisites: ["TC-04 and TC-05 evidence"],
    capabilityOutput: "Personal Theory of Practice with confidence and holds.",
  },
] as const;

export const THOMAS_CAMPBELL_EXERCISES: readonly SourceTrackExercise[] = [
  {
    id: "TC-01-POSSIBILITY-LEDGER",
    moduleId: "TC-01",
    title: "Possibility Ledger",
    contentClass: "qctp_original",
    sourceConcept: "Open-minded skepticism",
    instructions: [
      "State one claim neutrally.",
      "Define supporting and contrary data before reviewing the result.",
      "Preserve the result, then update confidence without forcing certainty.",
    ],
    fields: [
      {
        id: "claim",
        label: "Claim in neutral language",
        layer: "raw",
        input: "text",
      },
      {
        id: "supporting_data",
        label: "What would count as supporting data?",
        layer: "raw",
        input: "text",
      },
      {
        id: "contrary_data",
        label: "What would count as contrary data?",
        layer: "raw",
        input: "text",
      },
      {
        id: "confidence_before",
        label: "Confidence before (0–100)",
        layer: "raw",
        input: "number",
      },
      {
        id: "experiment",
        label: "Blinded or feedback-bearing experiment",
        layer: "raw",
        input: "text",
      },
      {
        id: "result",
        label: "Result, including misses or contrary data",
        layer: "raw",
        input: "text",
      },
      {
        id: "confidence_after",
        label: "Confidence after (0–100)",
        layer: "interpretation",
        input: "number",
      },
      {
        id: "unresolved",
        label: "What remains unresolved?",
        layer: "interpretation",
        input: "text",
      },
    ],
    completionGate:
      "Complete three ledgers in which confidence changes in response to data at least once.",
    safety: ["Apply skepticism symmetrically to belief and disbelief."],
  },
  {
    id: "TC-02-POINT-CONSCIOUSNESS",
    moduleId: "TC-02",
    title: "Point Consciousness evidence record",
    contentClass: "qctp_original",
    sourceConcept: "Point consciousness",
    instructions: [
      "Use only a safe seated or supported reclining setting.",
      "Enter through the controlled TC-PC State Atlas recipe and return fully.",
      "Record markers before interpretation; a timer cannot grant capability.",
    ],
    fields: [
      {
        id: "sensory_change",
        label: "Raw sensory change",
        layer: "raw",
        input: "text",
      },
      {
        id: "chatter_change",
        label: "Raw intellectual-chatter change",
        layer: "raw",
        input: "text",
      },
      {
        id: "alert_continuity",
        label: "Evidence of alert continuity",
        layer: "raw",
        input: "text",
      },
      {
        id: "return",
        label: "Return and orientation result",
        layer: "raw",
        input: "text",
      },
      {
        id: "look_alikes",
        label: "Sleep, strain, or dissociation look-alikes considered",
        layer: "interpretation",
        input: "text",
      },
    ],
    completionGate:
      "Reach TC-PC Stabilized through the State Atlas evidence gate before information experiments.",
    safety: [
      "No hyperventilation or prolonged retention.",
      "Stop and orient for fear, panic, disorientation, or persistent derealization.",
    ],
  },
  {
    id: "TC-04-INTENT-STACK",
    moduleId: "TC-04",
    title: "Intent Stack",
    contentClass: "qctp_original",
    sourceConcept: "Intent quality",
    instructions: [
      "Record the real choice before judging it.",
      "Separate observable behavior and outcome from inferred motive.",
      "Return later to preserve the actual outcome.",
    ],
    fields: [
      {
        id: "stated_want",
        label: "What do I say I want?",
        layer: "raw",
        input: "text",
      },
      {
        id: "actual_action",
        label: "What did I actually do?",
        layer: "raw",
        input: "text",
      },
      {
        id: "actual_outcome",
        label: "What observable outcome followed?",
        layer: "raw",
        input: "text",
      },
      {
        id: "controlled_outcome",
        label: "What outcome am I trying to control?",
        layer: "interpretation",
        input: "text",
      },
      {
        id: "feared_outcome",
        label: "What am I afraid will happen?",
        layer: "interpretation",
        input: "text",
      },
      {
        id: "image_need",
        label: "What do I need another person to think?",
        layer: "interpretation",
        input: "text",
      },
      {
        id: "image_action",
        label: "What action protects my image?",
        layer: "interpretation",
        input: "text",
      },
      {
        id: "responsible_action",
        label:
          "What action best expresses care, truth, courage, and responsibility?",
        layer: "interpretation",
        input: "text",
      },
    ],
    completionGate:
      "Complete five real-life Intent Stacks with later outcome review.",
    safety: ["Do not infer another person’s inner state as fact."],
  },
  {
    id: "TC-05-TRIGGER-RECONSTRUCTION",
    moduleId: "TC-05",
    title: "Trigger Reconstruction",
    contentClass: "qctp_original",
    sourceConcept: "Fear, ego, and belief audit",
    instructions: [
      "Begin with the observable event and immediate body response.",
      "Keep beliefs and judgments in the interpretation layer.",
      "Record the later outcome even when the experiment has no effect.",
    ],
    fields: [
      { id: "event", label: "Observable event", layer: "raw", input: "text" },
      {
        id: "body_reaction",
        label: "Immediate body reaction",
        layer: "raw",
        input: "text",
      },
      {
        id: "later_outcome",
        label: "Later observable outcome",
        layer: "raw",
        input: "text",
      },
      {
        id: "feared_outcome",
        label: "Feared outcome",
        layer: "interpretation",
        input: "text",
      },
      {
        id: "self_image",
        label: "Self-image under threat",
        layer: "interpretation",
        input: "text",
      },
      {
        id: "judgment",
        label: "Judgment of the other person",
        layer: "interpretation",
        input: "text",
      },
      {
        id: "belief",
        label: "Belief that made the event threatening",
        layer: "interpretation",
        input: "text",
      },
      {
        id: "alternative",
        label: "Alternative interpretation",
        layer: "interpretation",
        input: "text",
      },
      {
        id: "lower_fear_action",
        label: "Lower-fear action",
        layer: "interpretation",
        input: "text",
      },
    ],
    completionGate:
      "Identify one repeated trigger across at least three events and perform one lower-fear behavioral experiment.",
    safety: ["Keep daily functioning and relationship safety primary."],
  },
  {
    id: "TC-06-IMAGINALITY-MAP",
    moduleId: "TC-06",
    title: "Stable Imaginality Map",
    contentClass: "qctp_original",
    sourceConcept: "Imaginality",
    instructions: [
      "Create one anchor environment without copying a proprietary exercise.",
      "Record stable relationships and sensory channels.",
      "Separate deliberate changes from spontaneous candidates before interpretation.",
    ],
    fields: [
      {
        id: "anchor",
        label: "Anchor environment",
        layer: "raw",
        input: "text",
      },
      {
        id: "stable_objects",
        label: "Stable objects and relationships",
        layer: "raw",
        input: "text",
      },
      {
        id: "sensory_channels",
        label: "Sensory channels present",
        layer: "raw",
        input: "text",
      },
      {
        id: "deliberate_changes",
        label: "Deliberate changes",
        layer: "raw",
        input: "text",
      },
      {
        id: "spontaneous_candidates",
        label: "Spontaneous candidates",
        layer: "raw",
        input: "text",
      },
      {
        id: "interpretation",
        label: "Later interpretation",
        layer: "interpretation",
        input: "text",
      },
      {
        id: "revision",
        label: "Revision from prior visits",
        layer: "interpretation",
        input: "text",
      },
    ],
    completionGate:
      "Re-enter and map the same environment across three sessions with stable anchor relationships.",
    safety: [
      "Do not treat every inner event as external information.",
      "Exit and orient if fear, disorientation, or persistent derealization occurs.",
    ],
  },
] as const;

export const CONTROLLED_SOURCE_ARCHITECTURE = [
  { id: "bullard", label: "Bullard", status: "day1_source_controlled" },
  { id: "heartmath", label: "HeartMath", status: "day1_source_controlled" },
  { id: "dispenza", label: "Dispenza", status: "day1_source_controlled" },
  {
    id: "monroe-buhlman",
    label: "Monroe / Buhlman",
    status: "state_recipe_controlled",
  },
  { id: "mossbridge", label: "Mossbridge", status: "architecture_only" },
  {
    id: "remote-viewing",
    label: "Remote viewing",
    status: "experimental_protocol_controlled",
  },
  { id: "psionics", label: "Psionics", status: "record_architecture_only" },
] as const;

export function getCampbellExercise(id: string): SourceTrackExercise | null {
  return (
    THOMAS_CAMPBELL_EXERCISES.find((exercise) => exercise.id === id) ?? null
  );
}
