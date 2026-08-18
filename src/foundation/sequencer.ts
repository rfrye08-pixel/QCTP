import {
  createSequencerEngine,
  createSequencerState,
  type SequencerDefinition,
  type SequencerEffect,
  type SequencerEngine,
  type SequencerOptions,
  type SequencerState,
  type SequencerTransition,
} from "../audio-player/sequencer";
import {
  DAY1_CUES,
  DAY1_PRACTICE_DURATION_SECONDS,
  DAY1_TEST_DURATION_SECONDS,
  getDay1Cues,
  type Day1Cue,
  type Day1CueMode,
} from "./day1";

export type Day1SequencerState = SequencerState<Day1Cue>;
export type Day1SequencerEffect = SequencerEffect<Day1Cue>;
export type Day1SequencerTransition = SequencerTransition<Day1Cue>;
export type Day1SequencerEngine = SequencerEngine<Day1Cue>;

export interface Day1SequencerOptions extends SequencerOptions {
  readonly cueMode?: Day1CueMode;
}

/** Completion threshold is deliberately independent of accelerated test time. */
export const DAY1_SEQUENCER_DEFINITION: SequencerDefinition<Day1Cue> =
  Object.freeze({
    durationSeconds: DAY1_PRACTICE_DURATION_SECONDS,
    testDurationSeconds: DAY1_TEST_DURATION_SECONDS,
    minimumCompletionSeconds: DAY1_PRACTICE_DURATION_SECONDS,
    cues: DAY1_CUES,
  });

export function createDay1SequencerState(
  options: Day1SequencerOptions = {},
): Day1SequencerState {
  return createSequencerState(
    definitionForCueMode(options.cueMode ?? "guided"),
    {
      testMode: options.testMode === true,
    },
  );
}

export function createDay1SequencerEngine(
  options: Day1SequencerOptions = {},
): Day1SequencerEngine {
  return createSequencerEngine(
    definitionForCueMode(options.cueMode ?? "guided"),
    {
      testMode: options.testMode === true,
    },
  );
}

function definitionForCueMode(mode: Day1CueMode): SequencerDefinition<Day1Cue> {
  if (mode === "guided") return DAY1_SEQUENCER_DEFINITION;
  return Object.freeze({
    ...DAY1_SEQUENCER_DEFINITION,
    cues: getDay1Cues(mode),
  });
}
