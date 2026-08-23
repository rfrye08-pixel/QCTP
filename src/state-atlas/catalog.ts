import { contentRefFor } from "../controlled-content";
import {
  StateDefinitionSchema,
  type StateDefinition,
  type StateId,
} from "./types";

type StateDefinitionSource = Omit<
  StateDefinition,
  "recipeContentRef" | "sourceTargetContentRef"
>;

const stateDefinitions: StateDefinitionSource[] = [
  {
    id: "Q0",
    title: "Ordinary Baseline",
    contentClass: "QCTP_ORIGINAL",
    sourceRelationship: "qctp",
    sourceLabel: "QCTP baseline reference",
    purpose:
      "Record the ordinary starting condition without claiming a trained state.",
    prerequisiteGroups: [],
    targetMarkers: [],
    minimumAccessedMarkers: 0,
    minimumContinuousSecondsForStabilized: 0,
    stabilizationAttemptCount: 1,
    stabilizationWindow: 1,
    functionalMinimumAttempts: 1,
    functionalRequiresBlinding: false,
    functionalRequiresFeedback: false,
    functionalRequiresCoherentEpisode: false,
    permittedContexts: ["baseline"],
    lookAlikes: [],
    corrections: [],
  },
  {
    id: "Q1",
    title: "Regulated Body and Breath",
    contentClass: "QCTP_ORIGINAL",
    sourceRelationship: "qctp",
    sourceLabel: "QCTP original foundation state",
    purpose:
      "Reduce unnecessary muscular and respiratory effort while preserving alertness.",
    prerequisiteGroups: [],
    targetMarkers: [
      {
        id: "quiet_breathing",
        label: "Quiet breathing without recovery gasps",
      },
      {
        id: "reduced_jaw_shoulder_effort",
        label: "Lower jaw and shoulder effort",
      },
      { id: "stable_posture", label: "Stable posture" },
      { id: "alertness_intact", label: "Alertness remains intact" },
      { id: "no_dizziness_tingling", label: "No dizziness or tingling" },
      { id: "reduced_movement_urgency", label: "Reduced urgency to move" },
    ],
    minimumAccessedMarkers: 2,
    minimumContinuousSecondsForStabilized: 180,
    stabilizationAttemptCount: 3,
    stabilizationWindow: 5,
    functionalMinimumAttempts: 1,
    functionalRequiresBlinding: false,
    functionalRequiresFeedback: false,
    functionalRequiresCoherentEpisode: false,
    permittedContexts: ["seated_morning", "supported_lying", "pre_meditation"],
    lookAlikes: ["Breath suppression", "Drowsiness", "Rigid posture"],
    corrections: [
      "Reduce breath volume before changing cadence.",
      "Use five/five or natural breathing if air hunger remains.",
      "Sit more upright if sleepiness rises.",
    ],
  },
  {
    id: "Q2",
    title: "Coherent Affective State",
    contentClass: "QCTP_SYNTHESIS",
    sourceRelationship: "source_informed",
    sourceLabel: "QCTP synthesis informed by heart-focused coherence methods",
    purpose:
      "Generate a clear constructive body-state and retain it after releasing the memory story.",
    prerequisiteGroups: [[{ stateId: "Q1", minimumLevel: "Accessed" }]],
    targetMarkers: [
      {
        id: "heart_area_attention",
        label: "Heart-area attention remains present",
      },
      {
        id: "constructive_body_signature",
        label: "Constructive body signature is clear",
      },
      {
        id: "story_released",
        label: "State remains after the story is released",
      },
      { id: "body_signature_named", label: "Body signature can be named" },
    ],
    minimumAccessedMarkers: 2,
    minimumContinuousSecondsForStabilized: 120,
    stabilizationAttemptCount: 3,
    stabilizationWindow: 5,
    functionalMinimumAttempts: 1,
    functionalRequiresBlinding: false,
    functionalRequiresFeedback: false,
    functionalRequiresCoherentEpisode: false,
    permittedContexts: [
      "seated_morning",
      "pre_meditation",
      "daily_integration",
    ],
    lookAlikes: ["Repeating an appreciation story", "Forced positive emotion"],
    corrections: [
      "Use one concrete memory for one or two breaths, then release the story again.",
      "Reduce effort and accept a mild constructive state rather than forcing intensity.",
    ],
  },
  {
    id: "Q3",
    title: "Focused Attention",
    contentClass: "QCTP_ORIGINAL",
    sourceRelationship: "qctp",
    sourceLabel: "QCTP attentional foundation",
    purpose:
      "Hold attention on one selected object, recognize capture, and return efficiently.",
    prerequisiteGroups: [[{ stateId: "Q1", minimumLevel: "Accessed" }]],
    targetMarkers: [
      { id: "capture_recognized", label: "Distraction is recognized" },
      {
        id: "return_without_argument",
        label: "Attention returns without argument",
      },
      {
        id: "selected_object_stable",
        label: "One selected object is retained",
      },
      { id: "continuous_recall", label: "Session continuity is remembered" },
    ],
    minimumAccessedMarkers: 2,
    minimumContinuousSecondsForStabilized: 600,
    stabilizationAttemptCount: 3,
    stabilizationWindow: 5,
    functionalMinimumAttempts: 1,
    functionalRequiresBlinding: false,
    functionalRequiresFeedback: false,
    functionalRequiresCoherentEpisode: false,
    permittedContexts: [
      "seated_morning",
      "studio_preparation",
      "state_training",
    ],
    lookAlikes: [
      "Thought suppression",
      "Switching breath locations",
      "Unnoticed capture",
    ],
    corrections: [
      "Shorten the session and use tactile abdomen sensation when capture is constant.",
      "Label one distraction briefly and return without evaluating it.",
    ],
  },
  {
    id: "Q4",
    title: "Open Monitoring and Spatial Awareness",
    contentClass: "QCTP_SYNTHESIS",
    sourceRelationship: "source_informed",
    sourceLabel: "QCTP open-monitoring and spatial-attention practice",
    purpose:
      "Include body, room, sound, thought, and sensation in one broad field without following one event.",
    prerequisiteGroups: [[{ stateId: "Q3", minimumLevel: "Accessed" }]],
    targetMarkers: [
      { id: "broad_field", label: "Awareness remains broader than one object" },
      { id: "events_included", label: "Events are included without pursuit" },
      { id: "room_volume", label: "Room-volume remains represented" },
      {
        id: "thought_chains_recognized",
        label: "Thought chains are recognized and released",
      },
    ],
    minimumAccessedMarkers: 2,
    minimumContinuousSecondsForStabilized: 300,
    stabilizationAttemptCount: 3,
    stabilizationWindow: 5,
    functionalMinimumAttempts: 1,
    functionalRequiresBlinding: false,
    functionalRequiresFeedback: false,
    functionalRequiresCoherentEpisode: false,
    permittedContexts: ["seated_morning", "state_training", "room_awareness"],
    lookAlikes: ["Diffuse mind-wandering", "Sequential body scanning"],
    corrections: [
      "Return to one breath sensation for three cycles, then re-expand gradually.",
      "Use the phrase already included once, then stop commentary.",
    ],
  },
  {
    id: "Q5",
    title: "Gap Awareness",
    contentClass: "QCTP_SYNTHESIS",
    sourceRelationship: "source_informed",
    sourceLabel: "QCTP synthesis Gap practice",
    purpose:
      "Recognize content-light intervals while awareness and memory remain continuous.",
    prerequisiteGroups: [[{ stateId: "Q4", minimumLevel: "Stabilized" }]],
    targetMarkers: [
      {
        id: "content_light_interval",
        label: "A content-light interval is recognized",
      },
      { id: "awareness_continuous", label: "Awareness remains continuous" },
      { id: "memory_continuous", label: "The interval is remembered" },
      { id: "no_forcing", label: "The interval is not forced or extended" },
    ],
    minimumAccessedMarkers: 2,
    minimumContinuousSecondsForStabilized: 60,
    stabilizationAttemptCount: 3,
    stabilizationWindow: 5,
    functionalMinimumAttempts: 1,
    functionalRequiresBlinding: false,
    functionalRequiresFeedback: false,
    functionalRequiresCoherentEpisode: false,
    permittedContexts: ["upright_gap_practice", "open_monitoring_session"],
    lookAlikes: ["Sleep-onset blankness", "Thought suppression", "Memory gap"],
    corrections: [
      "Stop searching and return to open monitoring.",
      "Use upright posture and shorter silent intervals when continuity is lost.",
    ],
  },
  {
    id: "TC-PC",
    title: "Point Consciousness",
    contentClass: "QCTP_ORIGINAL",
    sourceRelationship: "source_specific_target",
    sourceLabel: "Campbell source-specific target with original QCTP recipe",
    purpose:
      "Reduce physical salience and narration while retaining alert awareness and one stable intent.",
    prerequisiteGroups: [
      [{ stateId: "Q3", minimumLevel: "Stabilized" }],
      [{ stateId: "Q4", minimumLevel: "Accessed" }],
    ],
    targetMarkers: [
      {
        id: "reduced_physical_salience",
        label: "Physical input is less salient",
      },
      { id: "low_narration", label: "Internal narration is low" },
      { id: "continuous_alertness", label: "Alertness remains continuous" },
      { id: "stable_intent", label: "One nonverbal intent remains stable" },
    ],
    minimumAccessedMarkers: 2,
    minimumContinuousSecondsForStabilized: 300,
    stabilizationAttemptCount: 3,
    stabilizationWindow: 5,
    functionalMinimumAttempts: 1,
    functionalRequiresBlinding: false,
    functionalRequiresFeedback: false,
    functionalRequiresCoherentEpisode: false,
    permittedContexts: ["dark_field_seated", "campbell_source_track"],
    lookAlikes: ["Forced visual darkness", "Sleep", "Dissociation"],
    corrections: [
      "Relax ocular effort and notice the visual field as it is.",
      "Restore body contact and end if fear appears.",
    ],
  },
  {
    id: "M-F10",
    title: "Focus 10 Candidate State",
    contentClass: "QCTP_ORIGINAL",
    sourceRelationship: "source_specific_target",
    sourceLabel: "Monroe source-specific target with original QCTP induction",
    purpose:
      "Approach mind-awake/body-asleep markers without treating ordinary relaxation as proof.",
    prerequisiteGroups: [
      [{ stateId: "Q1", minimumLevel: "Stabilized" }],
      [{ stateId: "Q3", minimumLevel: "Stabilized" }],
    ],
    targetMarkers: [
      { id: "automatic_breathing", label: "Breathing feels automatic" },
      {
        id: "body_remote_heavy",
        label: "Body feels heavy, remote, numb, or altered",
      },
      { id: "low_movement", label: "Physical movement is very low" },
      { id: "retained_awareness", label: "Cues are followed and remembered" },
      {
        id: "hypnagogia_with_awareness",
        label: "Hypnagogia may occur with retained awareness",
      },
    ],
    minimumAccessedMarkers: 2,
    minimumContinuousSecondsForStabilized: 300,
    stabilizationAttemptCount: 3,
    stabilizationWindow: 5,
    functionalMinimumAttempts: 1,
    functionalRequiresBlinding: false,
    functionalRequiresFeedback: false,
    functionalRequiresCoherentEpisode: false,
    permittedContexts: ["supported_recline", "safe_lying"],
    lookAlikes: ["Ordinary relaxation", "Full sleep", "Tense immobility"],
    corrections: [
      "Extend systematic release and reduce physical adjustments.",
      "Use an earlier time or supported recline if full sleep repeatedly occurs.",
      "Open the eyes and orient if panic appears.",
    ],
  },
  {
    id: "M-F12",
    title: "Focus 12 Candidate State",
    contentClass: "QCTP_ORIGINAL",
    sourceRelationship: "source_specific_target",
    sourceLabel:
      "Monroe source-specific target with original QCTP expansion practice",
    purpose:
      "Maintain Focus 10 markers while awareness becomes broader and less body-centered.",
    prerequisiteGroups: [[{ stateId: "M-F10", minimumLevel: "Stabilized" }]],
    targetMarkers: [
      { id: "focus10_retained", label: "Focus 10 markers remain present" },
      {
        id: "body_not_exclusive_center",
        label: "Body is not awareness's exclusive center",
      },
      {
        id: "broader_awareness",
        label: "Awareness feels broader or less localized",
      },
      { id: "clarity_adequate", label: "Clarity remains adequate" },
    ],
    minimumAccessedMarkers: 2,
    minimumContinuousSecondsForStabilized: 300,
    stabilizationAttemptCount: 3,
    stabilizationWindow: 5,
    functionalMinimumAttempts: 1,
    functionalRequiresBlinding: false,
    functionalRequiresFeedback: false,
    functionalRequiresCoherentEpisode: false,
    permittedContexts: ["supported_recline", "safe_lying"],
    lookAlikes: [
      "Large-bubble visualization",
      "Diffuse drowsiness",
      "Dissociation",
    ],
    corrections: [
      "Return to Focus 10 rather than forcing expansion.",
      "Include sound and room-volume if visual imagery dominates.",
    ],
  },
  {
    id: "QR",
    title: "Remote-Information Receiver State",
    contentClass: "QCTP_SYNTHESIS",
    sourceRelationship: "experimental_protocol",
    sourceLabel: "QCTP experimental synthesis",
    purpose:
      "Reduce analysis, preserve first-pass descriptors, and evaluate blinded correspondence after capture.",
    prerequisiteGroups: [
      [{ stateId: "Q3", minimumLevel: "Stabilized" }],
      [
        { stateId: "Q4", minimumLevel: "Accessed" },
        { stateId: "TC-PC", minimumLevel: "Accessed" },
      ],
    ],
    targetMarkers: [
      { id: "brief_first_impressions", label: "First impressions are brief" },
      { id: "descriptors_before_nouns", label: "Descriptors precede nouns" },
      { id: "overlay_separated", label: "Analytical overlay is separated" },
      {
        id: "target_blinded",
        label: "Target feedback remains concealed during capture",
      },
    ],
    minimumAccessedMarkers: 2,
    minimumContinuousSecondsForStabilized: 0,
    stabilizationAttemptCount: 3,
    stabilizationWindow: 5,
    functionalMinimumAttempts: 10,
    functionalRequiresBlinding: true,
    functionalRequiresFeedback: true,
    functionalRequiresCoherentEpisode: false,
    permittedContexts: ["blinded_remote_viewing"],
    lookAlikes: [
      "Guessing",
      "Constructing a scene",
      "Retrofitting after feedback",
    ],
    corrections: [
      "Capture descriptors before nouns in a locked raw record.",
      "Move stories to a separate analytical-overlay field.",
    ],
  },
  {
    id: "QO",
    title: "OBE Threshold and Separation Practice",
    contentClass: "QCTP_ORIGINAL",
    sourceRelationship: "source_informed",
    sourceLabel: "QCTP original practice informed by source traditions",
    purpose:
      "Test nonphysical-movement imagery only after stable Focus 10 while preserving safety and recall.",
    prerequisiteGroups: [[{ stateId: "M-F10", minimumLevel: "Stabilized" }]],
    targetMarkers: [
      { id: "focus10_stable", label: "Focus 10 prerequisite remains stable" },
      {
        id: "nonphysical_movement",
        label: "Nonphysical movement exceeds deliberate imagery alone",
      },
      { id: "muscles_still", label: "Physical muscles remain still" },
      { id: "continuity_intact", label: "Continuity and recall remain intact" },
    ],
    minimumAccessedMarkers: 2,
    minimumContinuousSecondsForStabilized: 300,
    stabilizationAttemptCount: 3,
    stabilizationWindow: 5,
    functionalMinimumAttempts: 1,
    functionalRequiresBlinding: false,
    functionalRequiresFeedback: false,
    functionalRequiresCoherentEpisode: true,
    permittedContexts: ["safe_lying_separation_practice"],
    lookAlikes: ["Physical rocking", "Breath holding", "Dreamed movement"],
    corrections: [
      "Reduce imagined amplitude if muscles move.",
      "Return to body contact and end if fear rises.",
      "Return to Focus 10 training when no nonphysical movement is present.",
    ],
  },
  {
    id: "QI",
    title: "Stable Imaginality Environment",
    contentClass: "QCTP_ORIGINAL",
    sourceRelationship: "source_informed",
    sourceLabel:
      "QCTP original Studio/Lab practice informed by source concepts",
    purpose:
      "Build a repeatable inner environment and separate deliberate construction from spontaneous candidates.",
    prerequisiteGroups: [
      [{ stateId: "Q3", minimumLevel: "Stabilized" }],
      [{ stateId: "Q4", minimumLevel: "Accessed" }],
    ],
    targetMarkers: [
      { id: "anchor_revisited", label: "Anchor location can be revisited" },
      { id: "geometry_stable", label: "Basic geometry remains stable" },
      {
        id: "two_sensory_channels",
        label: "At least two sensory channels are present",
      },
      {
        id: "construction_distinguished",
        label: "Constructed and spontaneous content remain distinct",
      },
      { id: "exit_and_recall", label: "Exit occurs on command with recall" },
    ],
    minimumAccessedMarkers: 2,
    minimumContinuousSecondsForStabilized: 300,
    stabilizationAttemptCount: 3,
    stabilizationWindow: 5,
    functionalMinimumAttempts: 1,
    functionalRequiresBlinding: false,
    functionalRequiresFeedback: false,
    functionalRequiresCoherentEpisode: false,
    permittedContexts: ["studio_imaginality", "lab_receptive_task"],
    lookAlikes: ["Uncontrolled fantasy", "Dream onset", "Forced photorealism"],
    corrections: [
      "Reduce the scene to one object and one boundary.",
      "Use touch, sound, and spatial relation if visual imagery is weak.",
      "Return to the anchor object when story takes over.",
    ],
  },
];

export const STATE_ATLAS = StateDefinitionSchema.array().parse(
  stateDefinitions.map((definition) => ({
    ...definition,
    recipeContentRef: contentRefFor(`state.recipe.${definition.id}`),
    sourceTargetContentRef:
      definition.sourceRelationship === "source_specific_target"
        ? contentRefFor(`state.target.${definition.id}`)
        : null,
  })),
);

const statesById = new Map(
  STATE_ATLAS.map((definition) => [definition.id, definition] as const),
);

export function getStateDefinition(stateId: StateId): StateDefinition {
  const definition = statesById.get(stateId);
  if (!definition) {
    throw new Error(`Unknown controlled state: ${stateId}`);
  }
  return definition;
}
