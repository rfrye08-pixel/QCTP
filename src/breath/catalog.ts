import {
  BreathFoundationSessionSchema,
  BreathMethodSchema,
  type BreathFoundationSession,
  type BreathMethod,
  type BreathMethodId,
} from "./types";

export const BREATH_STOP_CONDITIONS = [
  "Dizziness",
  "Visual dimming",
  "Tingling around the mouth or hands",
  "Marked air hunger",
  "Chest pain",
  "Irregular or alarming heart sensation",
  "Panic escalation",
  "Loss of balance",
  "Confusion",
  "Inability to maintain the pattern without gasping",
] as const;

const methodCatalog: BreathMethod[] = [
  {
    id: "QCTP-B1",
    name: "Foundation Resonance Breath",
    sourceClass: "qctp_regulation_support",
    primaryUses: [
      "Morning settling",
      "Coherence support outside controlled source sessions",
      "Pre-meditation regulation",
      "Emotional regulation",
      "Transition into open awareness",
    ],
    cadence: {
      kind: "timed",
      inhaleSeconds: 4,
      secondInhaleSeconds: null,
      inhaleHoldSeconds: 0,
      exhaleSeconds: 6,
      exhaleHoldSeconds: 0,
    },
    inhaleRoute: "nose",
    exhaleRoute: "nose_default_mouth_if_restrictive",
    volumeInstruction:
      "Quiet and comfortable, approximately 60–75% of a maximal breath; do not repeatedly fill the lungs.",
    minimumDurationSeconds: 60,
    defaultDurationSeconds: 300,
    maximumDurationSeconds: 600,
    permittedPostures: ["seated", "lying"],
    prerequisiteMethodIds: [],
    execution: [
      "Use a neutral spine, loose shoulders, unclenched jaw, and relaxed tongue.",
      "Inhale quietly through the nose for four seconds with three-dimensional lower-rib expansion.",
      "Exhale smoothly for six seconds without squeezing empty.",
      "Let the next inhale begin without a deliberate hold.",
    ],
    transitionInstruction:
      "After the final paced exhale, stop counting and allow breathing to regulate itself.",
    stopConditions: [...BREATH_STOP_CONDITIONS],
  },
  {
    id: "QCTP-B2",
    name: "Cyclic Sighing",
    sourceClass: "qctp_regulation_support",
    primaryUses: ["Five-minute emotional downshift", "Reducing activation"],
    cadence: {
      kind: "double_inhale",
      firstInhale: "comfortable_near_full",
      secondInhale: "small_top_off",
      exhale: "long_smooth_complete",
      hold: "none",
    },
    inhaleRoute: "nose",
    exhaleRoute: "mouth",
    volumeInstruction:
      "Keep both inhales gentle. The second inhale is a small top-off, not another maximal breath.",
    minimumDurationSeconds: 60,
    defaultDurationSeconds: 300,
    maximumDurationSeconds: 300,
    permittedPostures: ["seated", "lying"],
    prerequisiteMethodIds: [],
    execution: [
      "Inhale gently through the nose to a comfortable near-full level.",
      "Take one smaller second nasal inhale.",
      "Exhale slowly and completely through the mouth without forcing empty.",
      "Repeat gently for no more than five minutes.",
    ],
    transitionInstruction:
      "Stop the double-inhale pattern and observe quiet natural breathing.",
    stopConditions: [...BREATH_STOP_CONDITIONS],
  },
  {
    id: "QCTP-B3",
    name: "Balanced Breath",
    sourceClass: "qctp_regulation_support",
    primaryUses: [
      "Balanced focus",
      "CAD and geometry preparation",
      "Source study",
      "Remote viewing preparation",
      "Alert regulation",
    ],
    cadence: {
      kind: "timed",
      inhaleSeconds: 5,
      secondInhaleSeconds: null,
      inhaleHoldSeconds: 0,
      exhaleSeconds: 5,
      exhaleHoldSeconds: 0,
    },
    inhaleRoute: "nose",
    exhaleRoute: "nose",
    volumeInstruction:
      "Quiet, low-effort, non-maximal breathing with relaxed shoulders and throat.",
    minimumDurationSeconds: 60,
    defaultDurationSeconds: 180,
    maximumDurationSeconds: 240,
    permittedPostures: ["seated", "lying", "standing"],
    prerequisiteMethodIds: [],
    execution: [
      "Inhale quietly through the nose for five seconds.",
      "Exhale smoothly through the nose for five seconds.",
      "Do not add a hold and do not increase breath volume to fill the count.",
    ],
    transitionInstruction:
      "Release pacing and begin the selected focus task with natural breathing.",
    stopConditions: [...BREATH_STOP_CONDITIONS],
  },
  {
    id: "QCTP-B4",
    name: "Box Breath",
    sourceClass: "qctp_regulation_support",
    primaryUses: [
      "Composure",
      "Deliberate attention",
      "Controlled transitions",
    ],
    cadence: {
      kind: "timed",
      inhaleSeconds: 4,
      secondInhaleSeconds: null,
      inhaleHoldSeconds: 4,
      exhaleSeconds: 4,
      exhaleHoldSeconds: 4,
    },
    inhaleRoute: "nose",
    exhaleRoute: "nose",
    volumeInstruction:
      "Use quiet, comfortable volume. Holds must remain easy and must not become competitive.",
    minimumDurationSeconds: 120,
    defaultDurationSeconds: 180,
    maximumDurationSeconds: 240,
    permittedPostures: ["seated", "lying"],
    prerequisiteMethodIds: ["QCTP-B1", "QCTP-B3"],
    execution: [
      "Inhale for four seconds.",
      "Hold comfortably for four seconds.",
      "Exhale for four seconds.",
      "Hold empty comfortably for four seconds.",
      "Reduce holds to two seconds or return to no-hold breathing if tension appears.",
    ],
    transitionInstruction:
      "Release all holds and return to natural breathing before beginning another task.",
    stopConditions: [...BREATH_STOP_CONDITIONS],
  },
  {
    id: "QCTP-B5",
    name: "Alternate Nostril Breath",
    sourceClass: "qctp_regulation_support",
    primaryUses: [
      "Attention training",
      "Ritualized state transition",
      "Left/right sensory focus",
      "Contemplative preparation",
    ],
    cadence: {
      kind: "alternate_nostril",
      leftInhaleSeconds: 4,
      rightExhaleSeconds: 4,
      rightInhaleSeconds: 4,
      leftExhaleSeconds: 4,
      hold: "none",
      initialCycles: 5,
    },
    inhaleRoute: "alternating_nostrils",
    exhaleRoute: "alternating_nostrils",
    volumeInstruction:
      "Use quiet, comfortable nasal breaths without retention or forced nasal pressure.",
    minimumDurationSeconds: 80,
    defaultDurationSeconds: 160,
    maximumDurationSeconds: 300,
    permittedPostures: ["seated"],
    prerequisiteMethodIds: [],
    execution: [
      "Close the right nostril and inhale left for four seconds.",
      "Switch and exhale right for four seconds.",
      "Inhale right for four seconds.",
      "Switch and exhale left for four seconds.",
      "Repeat five cycles initially without a breath hold.",
    ],
    transitionInstruction:
      "Release the nostrils, lower the hand, and observe natural breathing.",
    stopConditions: [...BREATH_STOP_CONDITIONS],
  },
  {
    id: "QCTP-B6",
    name: "Step Breath",
    sourceClass: "qctp_regulation_support",
    primaryUses: [
      "Calm walking",
      "Transition after work",
      "Future-self walking",
      "Living-in-the-field practice",
    ],
    cadence: {
      kind: "steps",
      inhaleSteps: 3,
      exhaleSteps: 4,
      hold: "none",
    },
    inhaleRoute: "nose",
    exhaleRoute: "nose_default_mouth_if_restrictive",
    volumeInstruction:
      "Match comfortable walking demand; never force the count uphill or during exertion.",
    minimumDurationSeconds: 60,
    defaultDurationSeconds: 300,
    maximumDurationSeconds: 600,
    permittedPostures: ["walking"],
    prerequisiteMethodIds: [],
    execution: [
      "Walk in a safe, unobstructed place.",
      "Inhale for three comfortable steps.",
      "Exhale for four comfortable steps.",
      "Release the cadence immediately when exertion changes.",
    ],
    transitionInstruction:
      "Allow natural task-compatible breathing whenever walking demand changes.",
    stopConditions: [...BREATH_STOP_CONDITIONS],
  },
];

export const BREATH_METHODS = BreathMethodSchema.array().parse(methodCatalog);

const foundationCatalog: BreathFoundationSession[] = [
  {
    id: "BREATH-01",
    order: 1,
    title: "Mechanics",
    sourceClass: "qctp_regulation_support",
    durationSeconds: 300,
    methodIds: ["QCTP-B3"],
    objectives: [
      "Use neutral posture, nasal inhale, and three-dimensional lower-rib expansion.",
      "Keep breath volume quiet and shoulders and throat relaxed.",
    ],
    practiceSteps: [
      "Place one hand over the lower ribs for early feedback.",
      "Practice five minutes of five-in/five-out breathing without holds.",
      "Stop deliberate pacing if symptoms appear.",
    ],
    completionEvidence: [
      "Record physical ease, air hunger, shoulder effort, and throat effort.",
    ],
    grantsStateCreditFromElapsedTime: false,
  },
  {
    id: "BREATH-02",
    order: 2,
    title: "Exhale Bias",
    sourceClass: "qctp_regulation_support",
    durationSeconds: 360,
    methodIds: ["QCTP-B3", "QCTP-B1"],
    objectives: [
      "Compare balanced five/five breathing with four/six exhale-biased breathing.",
      "Notice calm, clarity, air hunger, and effort without forcing the exhale.",
    ],
    practiceSteps: [
      "Practice a short five/five interval.",
      "Practice a short four/six interval at lower-than-maximal volume.",
      "Release counting and compare the two conditions.",
    ],
    completionEvidence: [
      "Record the observed differences before interpreting them.",
    ],
    grantsStateCreditFromElapsedTime: false,
  },
  {
    id: "BREATH-03",
    order: 3,
    title: "Physiological Sigh",
    sourceClass: "qctp_regulation_support",
    durationSeconds: 180,
    methodIds: [],
    objectives: [
      "Learn one controlled double inhale and long exhale as a rapid state reset.",
    ],
    practiceSteps: [
      "Take one comfortable nasal inhale and one small nasal top-off.",
      "Exhale long and smoothly through the mouth.",
      "Practice only one to three cycles, then return to natural breathing.",
    ],
    completionEvidence: ["Record activation before and after the reset."],
    grantsStateCreditFromElapsedTime: false,
  },
  {
    id: "BREATH-04",
    order: 4,
    title: "Cyclic Sighing",
    sourceClass: "qctp_regulation_support",
    durationSeconds: 300,
    methodIds: ["QCTP-B2"],
    objectives: ["Perform a gentle five-minute cyclic-sighing downshift."],
    practiceSteps: [
      "Keep the first inhale comfortable and the second inhale small.",
      "Use a long mouth exhale without squeezing empty.",
      "Stop immediately on any controlled stop condition.",
    ],
    completionEvidence: ["Complete the post-session state and symptom log."],
    grantsStateCreditFromElapsedTime: false,
  },
  {
    id: "BREATH-05",
    order: 5,
    title: "Holds and Box Breathing",
    sourceClass: "qctp_regulation_support",
    durationSeconds: 240,
    methodIds: ["QCTP-B4"],
    objectives: [
      "Distinguish filled and empty holds.",
      "Learn when holds are not appropriate.",
    ],
    practiceSteps: [
      "Begin with four/two/four/two if four-second holds are not easy.",
      "Use four/four/four/four only without strain.",
      "Return to no-hold breathing if tension or air hunger appears.",
    ],
    completionEvidence: [
      "Record hold comfort and whether prerequisites remained met.",
    ],
    grantsStateCreditFromElapsedTime: false,
  },
  {
    id: "BREATH-06",
    order: 6,
    title: "Alternate Nostril and Walking Breath",
    sourceClass: "qctp_regulation_support",
    durationSeconds: 480,
    methodIds: ["QCTP-B5", "QCTP-B6"],
    objectives: [
      "Practice the no-hold alternate-nostril pattern.",
      "Integrate step-count breathing with eyes open.",
    ],
    practiceSteps: [
      "Complete five initial alternate-nostril cycles while seated.",
      "In a separate safe walking interval, use three steps in and four steps out.",
      "Release step counting when terrain or exertion changes.",
    ],
    completionEvidence: [
      "Record comfort separately for seated and walking methods.",
    ],
    grantsStateCreditFromElapsedTime: false,
  },
  {
    id: "BREATH-07",
    order: 7,
    title: "Personal Calibration and Baseline Lock",
    sourceClass: "qctp_regulation_support",
    durationSeconds: 780,
    methodIds: ["QCTP-B3", "QCTP-B1"],
    objectives: [
      "Select personal calm and focus cadences and an acute-reset method.",
      "Store only a pattern that passes ease and symptom limits.",
    ],
    practiceSteps: [
      "Observe natural breathing for two minutes.",
      "Test five/five for three minutes and four/six for three minutes.",
      "Test five/seven for three minutes only if comfortable.",
      "Recover with natural breathing for two minutes.",
    ],
    completionEvidence: [
      "Rate ease, calm, clarity, air hunger, tension, sleepiness, emotional shift, and desire to continue.",
      "Lock a baseline only when air hunger and tension are zero or one, with no dizziness or recovery gasp.",
    ],
    grantsStateCreditFromElapsedTime: false,
  },
];

export const BREATH_FOUNDATIONS =
  BreathFoundationSessionSchema.array().parse(foundationCatalog);

const methodsById = new Map(
  BREATH_METHODS.map((method) => [method.id, method] as const),
);

export function getBreathMethod(methodId: BreathMethodId): BreathMethod {
  const method = methodsById.get(methodId);
  if (!method) {
    throw new Error(`Unknown controlled breath method: ${methodId}`);
  }
  return method;
}
