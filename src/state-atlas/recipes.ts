import {
  StatePracticeRecipeSchema,
  type StateId,
  type StatePracticeRecipe,
  type StatePracticeStep,
  type TrainingProcessPhase,
} from "./types";

type StepInput = readonly [
  phase: TrainingProcessPhase,
  durationSeconds: number,
  instruction: string,
  completionCue: string,
];

const commonStopConditions = [
  "Stop the induction and begin EXIT for panic, dizziness, breathing distress, pain, disorientation, or loss of voluntary control.",
  "Do not continue in a hazardous setting, while driving, or when responsible for another person's immediate safety.",
];

function makeRecipe(
  stateId: StateId,
  steps: readonly StepInput[],
  additionalStopConditions: readonly string[] = [],
): StatePracticeRecipe {
  return StatePracticeRecipeSchema.parse({
    stateId,
    revision: `${stateId}-RECIPE-REV0`,
    timingIsEvidence: false,
    steps: steps.map(
      ([phase, durationSeconds, instruction, completionCue]) => ({
        phase,
        durationSeconds,
        instruction,
        completionCue,
      }),
    ),
    stopConditions: [...commonStopConditions, ...additionalStopConditions],
  });
}

const recipes: Record<StateId, StatePracticeRecipe> = {
  Q0: makeRecipe("Q0", [
    [
      "PREPARE",
      30,
      "Sit normally, keep the eyes open, and make no deliberate state change.",
      "You can name the current place, date, and task.",
    ],
    [
      "INDUCE",
      30,
      "Let breathing and posture remain ordinary; do not regulate them for this baseline.",
      "No special induction was added.",
    ],
    [
      "RECOGNIZE",
      90,
      "Notice current alertness, effort, comfort, emotion, breathing, and movement without trying to improve them.",
      "At least one concrete present-moment feature is noticed.",
    ],
    [
      "STABILIZE",
      60,
      "Continue ordinary activity while checking whether the observations remain representative.",
      "The sample reflects an ordinary baseline rather than a trained condition.",
    ],
    [
      "USE",
      30,
      "Perform one neutral action, such as reading one sentence, only to anchor the baseline context.",
      "The neutral action is complete.",
    ],
    [
      "EXIT",
      30,
      "Look around, move the hands and feet, and confirm full ordinary orientation.",
      "Place, time, and body orientation are clear.",
    ],
    [
      "RECORD",
      90,
      "Record raw observations first; add interpretation only afterward.",
      "The raw record is preserved.",
    ],
    [
      "ADAPT",
      30,
      "Choose whether a later baseline should use the same context or a clearly labeled different one.",
      "The next context is named or no change is chosen.",
    ],
  ]),
  Q1: makeRecipe("Q1", [
    [
      "PREPARE",
      60,
      "Use a stable seated or supported posture. Confirm easy natural breathing and normal orientation.",
      "Breathing is comfortable and the setting is safe.",
    ],
    [
      "INDUCE",
      180,
      "Soften jaw, tongue, shoulders, hands, abdomen, and eyes in that order. Let the exhale finish without pushing; use five seconds in and five seconds out only if comfortable, otherwise breathe naturally.",
      "No recovery gasp, dizziness, or forced breath is present.",
    ],
    [
      "RECOGNIZE",
      120,
      "Compare muscle effort, movement urgency, posture, alertness, and breathing with the start. Report only changes actually noticed.",
      "Observed markers can be distinguished from hoped-for effects.",
    ],
    [
      "STABILIZE",
      180,
      "Maintain the easier pattern without deepening it. If air hunger or sleepiness rises, return to natural breathing and upright contact.",
      "The observed pattern remains voluntary and comfortable.",
    ],
    [
      "USE",
      60,
      "While keeping breathing unforced, read or recall one short neutral sentence.",
      "The task ends without breath suppression or lost orientation.",
    ],
    [
      "EXIT",
      60,
      "Release all cadence control, take two natural breaths, open the eyes, move, and identify the room and time.",
      "Natural breathing and full orientation are restored.",
    ],
    [
      "RECORD",
      120,
      "Rate the session and record exact body and breath observations before interpreting them.",
      "Required ratings and raw observations are entered.",
    ],
    [
      "ADAPT",
      60,
      "Select one specific correction for the next attempt, or record that none is needed.",
      "The next adjustment is explicit.",
    ],
  ]),
  Q2: makeRecipe("Q2", [
    [
      "PREPARE",
      60,
      "Establish comfortable Q1 breathing first; stop trying to create emotion while the body is strained.",
      "Breathing and posture are regulated without air hunger.",
    ],
    [
      "INDUCE",
      120,
      "Place gentle attention near the heart area. Recall one concrete appreciative moment for one or two breaths, noticing its body signature rather than rehearsing the story.",
      "A specific body sensation or no-effect observation is available.",
    ],
    [
      "RECOGNIZE",
      120,
      "Release the remembered scene and check whether warmth, ease, openness, or another constructive signature remains. Do not manufacture intensity.",
      "Story content and body-state evidence are distinguished.",
    ],
    [
      "STABILIZE",
      120,
      "Rest with the mild body signature if present; if absent, remain neutral and record absence rather than claiming coherence.",
      "The reported condition is stable enough to observe, whether present or absent.",
    ],
    [
      "USE",
      90,
      "Bring one ordinary upcoming action to mind and check whether the body signature remains without adding a new story.",
      "Retention or loss during the task is directly observed.",
    ],
    [
      "EXIT",
      60,
      "Release heart-area focus, return to natural breathing, open the eyes, move, and orient to the room.",
      "Ordinary orientation is complete.",
    ],
    [
      "RECORD",
      120,
      "Record the raw body signature and whether it survived story release before offering an explanation.",
      "Raw evidence precedes interpretation.",
    ],
    [
      "ADAPT",
      60,
      "Choose a less effortful memory cue, shorter exposure, or neutral retry based on what actually occurred.",
      "One evidence-based adjustment is selected.",
    ],
  ]),
  Q3: makeRecipe("Q3", [
    [
      "PREPARE",
      60,
      "Choose one tactile breathing location and a stable posture. Define distraction as attention leaving that one object.",
      "The single object and stop conditions are understood.",
    ],
    [
      "INDUCE",
      120,
      "Attend to the chosen tactile sensation. Do not alter breathing to make the sensation clearer.",
      "The object can be located without breath control.",
    ],
    [
      "RECOGNIZE",
      180,
      "When capture is noticed, label it once as thinking, sound, or sensation and return without argument. Count recognized returns, not perfect stillness.",
      "At least one capture/return cycle or an honest no-capture observation is available.",
    ],
    [
      "STABILIZE",
      600,
      "Continue repeated recognition and return. Timing supplies a practice container only; continuity and recovery must be rated separately.",
      "Continuity, capture, and recovery can be reported from memory.",
    ],
    [
      "USE",
      120,
      "Retain part of the tactile anchor while holding one neutral word for several breaths, then release the word.",
      "Retention during the small task is observed rather than assumed.",
    ],
    [
      "EXIT",
      60,
      "Widen attention to the body and room, open the eyes, move, and state the present location.",
      "Full external orientation is restored.",
    ],
    [
      "RECORD",
      120,
      "Record capture frequency, recovery estimate, continuity, and raw markers before interpretation.",
      "The evidence record is complete.",
    ],
    [
      "ADAPT",
      60,
      "Shorten the next container or change the anchor only in response to the recorded failure mode.",
      "One correction is tied to one observed failure.",
    ],
  ]),
  Q4: makeRecipe("Q4", [
    [
      "PREPARE",
      60,
      "Begin from a stable Q3 anchor in a quiet, safe seated setting.",
      "Focused attention is available without strain.",
    ],
    [
      "INDUCE",
      120,
      "Expand from the anchor to include the whole body, then room-volume and sound, without moving attention point by point.",
      "Body and room are represented together.",
    ],
    [
      "RECOGNIZE",
      180,
      "Notice sounds, sensations, and thoughts as events within one field. If a chain takes over, recognize it and include it without following.",
      "Broad inclusion is distinguishable from mind-wandering.",
    ],
    [
      "STABILIZE",
      300,
      "Alternate thirty seconds of the broad field with one brief anchor check, then re-expand. Do not claim stability from elapsed time.",
      "Field breadth and capture can be rated from direct observation.",
    ],
    [
      "USE",
      120,
      "Allow one neutral sound or thought to arise while preserving awareness of body and room-volume.",
      "Whether breadth survived the event is known.",
    ],
    [
      "EXIT",
      60,
      "Narrow to body contact, open the eyes, name three visible objects, and move normally.",
      "External orientation is complete.",
    ],
    [
      "RECORD",
      120,
      "Record field breadth, pursued events, and room representation before interpreting the session.",
      "Raw field observations are preserved.",
    ],
    [
      "ADAPT",
      60,
      "Use a shorter expansion or more anchor checks next time if diffuse mind-wandering dominated.",
      "The next adjustment follows the failure evidence.",
    ],
  ]),
  Q5: makeRecipe("Q5", [
    [
      "PREPARE",
      60,
      "Use upright posture after a stable open-monitoring attempt; do not practice when near sleep.",
      "Alertness and Q4 prerequisites are present.",
    ],
    [
      "INDUCE",
      120,
      "Rest in open monitoring without suppressing thoughts or searching for a gap.",
      "Events are allowed rather than blocked.",
    ],
    [
      "RECOGNIZE",
      180,
      "If a naturally content-light interval occurs, note its beginning or end once. If none occurs, record none.",
      "Recognition is retrospective and unforced.",
    ],
    [
      "STABILIZE",
      60,
      "Do not prolong the interval. Check that awareness and memory continuity remain intact across it.",
      "Blankness, sleep onset, and remembered quiet can be distinguished.",
    ],
    [
      "USE",
      60,
      "After any candidate interval, recall the immediately preceding and following event.",
      "Continuity around the candidate is testable.",
    ],
    [
      "EXIT",
      60,
      "Open the eyes, move, state the location and date, and discontinue if memory is unclear.",
      "Ordinary orientation and continuity are confirmed.",
    ],
    [
      "RECORD",
      120,
      "Describe the sequence around the interval before naming what it meant.",
      "A raw sequence, including no-event results, is saved.",
    ],
    [
      "ADAPT",
      60,
      "Return to Q4 or shorten silence when sleepiness, forcing, or memory gaps appear.",
      "The next safe level is selected.",
    ],
  ]),
  "TC-PC": makeRecipe("TC-PC", [
    [
      "PREPARE",
      60,
      "Sit safely in a dim but orientable setting. Establish stable Q3 attention and Q4 breadth before reducing physical salience.",
      "Prerequisite attention is present and fear is low.",
    ],
    [
      "INDUCE",
      240,
      "Let the visual field be dark as it is, soften body commentary, and hold one simple nonverbal intent without forcing imagery.",
      "The intent remains identifiable and the body remains safe.",
    ],
    [
      "RECOGNIZE",
      180,
      "Check for reduced physical salience, lower narration, continuous alertness, and stable intent. Darkness alone is not evidence.",
      "At least two independent markers or an honest absence can be reported.",
    ],
    [
      "STABILIZE",
      300,
      "Maintain the smallest sustainable intent; restore body contact immediately if fear, sleep, or dissociation appears.",
      "Alertness and voluntary exit remain available.",
    ],
    [
      "USE",
      120,
      "Apply the intent to one neutral internal choice, then release it, without treating imagery as external information.",
      "Intent retention during the task is observed.",
    ],
    [
      "EXIT",
      90,
      "Feel the contact points, deepen only naturally, open the eyes, name the room, and stand only when steady.",
      "Body salience and orientation are fully restored.",
    ],
    [
      "RECORD",
      120,
      "Record physical salience, narration, intent, and alertness before assigning a state label.",
      "Raw evidence is preserved separately.",
    ],
    [
      "ADAPT",
      60,
      "Return to Q3/Q4 training if alertness or intent was not continuous.",
      "The next prerequisite or retry is explicit.",
    ],
  ]),
  "M-F10": makeRecipe("M-F10", [
    [
      "PREPARE",
      90,
      "Use a safe supported recline where sleep is acceptable but falling or interruption is not a risk. Confirm Q1 and Q3 prerequisites.",
      "The body is supported and voluntary exit is available.",
    ],
    [
      "INDUCE",
      300,
      "Release tension from feet through face once, then let breathing proceed automatically while attention remains lightly awake.",
      "No breath holding, forced immobility, or distress is present.",
    ],
    [
      "RECOGNIZE",
      180,
      "Check separately for automatic breathing, altered body salience, low movement, retained cue memory, and hypnagogia with awareness. Relaxation alone is not proof.",
      "Markers and look-alikes can be distinguished.",
    ],
    [
      "STABILIZE",
      300,
      "Remain still only while comfortable and alert. If sleep takes over, that attempt is sleep—not a Focus 10 result.",
      "Awareness and recall remain checkable.",
    ],
    [
      "USE",
      120,
      "Recall one neutral word and then release it while observing whether candidate markers persist.",
      "Retention or loss during the task is observed.",
    ],
    [
      "EXIT",
      120,
      "Count slowly upward, deepen natural breathing, move fingers and feet, open the eyes, sit up gradually, and name place and time.",
      "Normal movement and full orientation return.",
    ],
    [
      "RECORD",
      150,
      "Record each candidate marker, any sleep gap, and continuity before interpreting the state.",
      "Raw evidence includes absent and uncertain markers.",
    ],
    [
      "ADAPT",
      60,
      "Use an earlier time, shorter body release, or more upright support if sleep or memory loss dominated.",
      "One correction is chosen from the evidence.",
    ],
  ]),
  "M-F12": makeRecipe("M-F12", [
    [
      "PREPARE",
      90,
      "First establish a currently stable M-F10 candidate with clear recall; do not begin from ordinary relaxation alone.",
      "Focus 10 candidate markers and orientation are checkable.",
    ],
    [
      "INDUCE",
      180,
      "Include sound and room-volume around the body while retaining the existing body-asleep candidate markers.",
      "Expansion does not require a visual bubble or forced size sensation.",
    ],
    [
      "RECOGNIZE",
      180,
      "Check whether the body is less exclusively central, awareness is broader, and clarity remains adequate.",
      "Breadth is distinguished from drowsy diffusion.",
    ],
    [
      "STABILIZE",
      300,
      "Alternate brief body-contact checks with broader awareness. Return to M-F10 if clarity degrades.",
      "Broader awareness and retained prerequisite markers are both observable.",
    ],
    [
      "USE",
      120,
      "Hold one neutral spatial relation, such as sound-left-of-body, without constructing a scene.",
      "The spatial relation and clarity are recalled.",
    ],
    [
      "EXIT",
      120,
      "Narrow to body contact, move, open the eyes, sit up gradually, and identify place and time.",
      "Ordinary body-centered orientation is restored.",
    ],
    [
      "RECORD",
      150,
      "Record retained M-F10 markers, breadth, localization, and clarity before interpretation.",
      "Raw evidence is complete.",
    ],
    [
      "ADAPT",
      60,
      "Return to M-F10 stabilization if expansion displaced clarity or continuity.",
      "The next safe training target is selected.",
    ],
  ]),
  QR: makeRecipe("QR", [
    [
      "PREPARE",
      90,
      "Have another person or tool lock a target identifier and feedback before the session. Do not view target content.",
      "Blindness and later feedback access are verifiable.",
    ],
    [
      "INDUCE",
      120,
      "Use stable Q3 attention and Q4 breadth, then hold only the target identifier for a few seconds.",
      "No target story has been supplied.",
    ],
    [
      "RECOGNIZE",
      180,
      "Write brief sensory descriptors before nouns. Put guesses and scene stories in a separate analytical-overlay field.",
      "A timestamped raw first pass is locked before feedback.",
    ],
    [
      "STABILIZE",
      120,
      "Repeat short receive-and-record cycles without revising earlier marks.",
      "Each cycle remains attributable and unedited.",
    ],
    [
      "USE",
      120,
      "Make one final descriptor summary, close the raw record, and only then reveal the target.",
      "The pre-feedback record is immutable for scoring.",
    ],
    [
      "EXIT",
      60,
      "Release the identifier, orient to body and room, and pause before scoring.",
      "Ordinary orientation is complete.",
    ],
    [
      "RECORD",
      300,
      "Preserve the revealed target or rubric and record specific correspondences and misses. Mark feedback scored only when this outcome record exists.",
      "Raw data, feedback, and score evidence are separately preserved.",
    ],
    [
      "ADAPT",
      90,
      "Choose one procedural correction based on misses; never retrofit raw descriptors after feedback.",
      "The next protocol adjustment is explicit.",
    ],
  ]),
  QO: makeRecipe("QO", [
    [
      "PREPARE",
      90,
      "Use a safe lying position after a currently stable M-F10 candidate. Exclude situations where sudden response is required.",
      "Support, recall, and voluntary exit are available.",
    ],
    [
      "INDUCE",
      180,
      "Maintain M-F10 markers and imagine a very small nonphysical roll or rise without moving muscles or changing breathing.",
      "Breathing remains automatic and muscles remain relaxed.",
    ],
    [
      "RECOGNIZE",
      180,
      "Distinguish imagined movement, actual muscle movement, dream transition, and any spontaneous movement candidate.",
      "The category can be reported without upgrading imagery into an event.",
    ],
    [
      "STABILIZE",
      300,
      "Repeat only small movement cues while continuity remains intact. Stop for fear, breath holding, or confusion.",
      "Voluntary exit and recall remain present.",
    ],
    [
      "USE",
      120,
      "If a coherent candidate occurs, perform one preselected orientation check; otherwise record no episode.",
      "A coherent sequence exists or absence is recorded.",
    ],
    [
      "EXIT",
      120,
      "Reconnect with body contact, move fingers and feet, open the eyes, sit up gradually, and name place and time.",
      "Full bodily and external orientation is restored.",
    ],
    [
      "RECORD",
      180,
      "Record the full chronological episode, including gaps and physical movement, before interpreting it.",
      "A coherent raw episode or honest no-event record is saved.",
    ],
    [
      "ADAPT",
      60,
      "Return to M-F10 training if continuity, safety, or prerequisite stability was lost.",
      "The next safe target is selected.",
    ],
  ]),
  QI: makeRecipe("QI", [
    [
      "PREPARE",
      60,
      "Begin from stable Q3/Q4 skills. Choose one simple anchor object and one boundary; do not aim for photorealism.",
      "The anchor and boundary are defined.",
    ],
    [
      "INDUCE",
      180,
      "Construct the anchor using the strongest available sensory channel, then add one second channel and one spatial relation.",
      "Deliberately constructed elements can be named.",
    ],
    [
      "RECOGNIZE",
      180,
      "Label each event as deliberately constructed, spontaneous candidate, or uncertain without changing it to fit a story.",
      "Source categories remain distinct.",
    ],
    [
      "STABILIZE",
      300,
      "Revisit the anchor after brief releases of attention and check whether geometry and relations are repeatable.",
      "Repeatability is observed across at least two revisits.",
    ],
    [
      "USE",
      120,
      "Change one preselected feature, restore it, and then exit on command.",
      "Voluntary modification and exit are recalled.",
    ],
    [
      "EXIT",
      90,
      "Release the scene, feel body contact, open the eyes, name three visible objects, and move normally.",
      "External orientation is complete.",
    ],
    [
      "RECORD",
      150,
      "Record constructed, spontaneous, and uncertain elements in separate raw categories before interpretation.",
      "Provenance of inner content is preserved.",
    ],
    [
      "ADAPT",
      60,
      "Reduce to fewer elements if geometry drifted or narrative took over.",
      "One complexity adjustment is selected.",
    ],
  ]),
};

export const STATE_PRACTICE_RECIPES: readonly StatePracticeRecipe[] =
  Object.values(recipes);

export function getStatePracticeRecipe(stateId: StateId): StatePracticeRecipe {
  return recipes[stateId];
}

export function recipeDurationSeconds(recipe: StatePracticeRecipe): number {
  return recipe.steps.reduce(
    (total, step: StatePracticeStep) => total + step.durationSeconds,
    0,
  );
}
