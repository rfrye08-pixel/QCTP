import { describe, expect, it } from "vitest";

import { DAY1_CUES } from "../foundation/day1";
import {
  createDay1SequencerState,
  DAY1_SEQUENCER_DEFINITION,
} from "../foundation/sequencer";
import {
  createSequencerState,
  getSequencerElapsedSeconds,
  reduceSequencer,
  type SequencerEffect,
  type SequencerEvent,
} from "./sequencer";

function dispatch(
  state: ReturnType<typeof createDay1SequencerState>,
  event: SequencerEvent,
): {
  state: ReturnType<typeof createDay1SequencerState>;
  effects: readonly SequencerEffect<(typeof DAY1_CUES)[number]>[];
} {
  return reduceSequencer(state, event);
}

function cueTimes(
  effects: readonly SequencerEffect<(typeof DAY1_CUES)[number]>[],
): readonly number[] {
  return effects.flatMap((effect) =>
    effect.type === "cue" ? [effect.cue.at] : [],
  );
}

describe("monotonic timed sequencer", () => {
  it("fires each due cue exactly once", () => {
    let state = createDay1SequencerState();
    let result = dispatch(state, { type: "start", nowMs: 0 });
    state = result.state;
    expect(cueTimes(result.effects)).toEqual([0]);

    result = dispatch(state, { type: "tick", nowMs: 45_000 });
    state = result.state;
    expect(cueTimes(result.effects)).toEqual([45]);

    result = dispatch(state, { type: "tick", nowMs: 45_000 });
    state = result.state;
    expect(result.effects).toEqual([]);

    result = dispatch(state, { type: "tick", nowMs: 1_499_000 });
    const allCueTimes = result.state.firedCueTimes;
    expect(allCueTimes).toEqual(DAY1_CUES.map(({ at }) => at));
    expect(new Set(allCueTimes).size).toBe(DAY1_CUES.length);
  });

  it("excludes paused wall time and resumes from accumulated active time", () => {
    let state = createDay1SequencerState();
    state = dispatch(state, { type: "start", nowMs: 1_000 }).state;
    state = dispatch(state, { type: "tick", nowMs: 11_000 }).state;
    state = dispatch(state, { type: "pause", nowMs: 21_000 }).state;
    expect(state.status).toBe("paused");
    expect(getSequencerElapsedSeconds(state)).toBe(20);

    state = dispatch(state, { type: "tick", nowMs: 121_000 }).state;
    expect(getSequencerElapsedSeconds(state)).toBe(20);
    state = dispatch(state, { type: "resume", nowMs: 151_000 }).state;
    state = dispatch(state, { type: "tick", nowMs: 181_000 }).state;

    expect(state.status).toBe("running");
    expect(getSequencerElapsedSeconds(state)).toBe(50);
  });

  it("never grants completion for an early user end", () => {
    let state = createDay1SequencerState();
    state = dispatch(state, { type: "start", nowMs: 0 }).state;
    const result = dispatch(state, { type: "end", nowMs: 149_999 });

    expect(result.state.status).toBe("ended");
    expect(result.state.endReason).toBe("user");
    expect(result.effects.some(({ type }) => type === "completed")).toBe(false);
  });

  it("finishes accelerated test mode without granting completion", () => {
    let state = createDay1SequencerState({ testMode: true });
    state = dispatch(state, { type: "start", nowMs: 0 }).state;
    const result = dispatch(state, { type: "tick", nowMs: 90_000 });

    expect(result.state.status).toBe("ended");
    expect(result.state.endReason).toBe("test-finished");
    expect(getSequencerElapsedSeconds(result.state)).toBe(90);
    expect(result.effects.some(({ type }) => type === "completed")).toBe(false);
  });

  it("grants completion once, only after the natural non-test 1,500-second boundary", () => {
    let state = createDay1SequencerState();
    state = dispatch(state, { type: "start", nowMs: 0 }).state;
    state = dispatch(state, { type: "tick", nowMs: 1_499_999 }).state;
    expect(state.status).toBe("running");

    let result = dispatch(state, { type: "tick", nowMs: 1_500_000 });
    state = result.state;
    expect(state.status).toBe("completed");
    expect(state.endReason).toBe("natural");
    expect(
      result.effects.filter(({ type }) => type === "completed"),
    ).toHaveLength(1);

    result = dispatch(state, { type: "tick", nowMs: 1_600_000 });
    expect(result.effects).toEqual([]);
  });

  it("rejects backwards clock values and sub-threshold definitions", () => {
    let state = createDay1SequencerState();
    state = dispatch(state, { type: "start", nowMs: 10 }).state;
    expect(() => dispatch(state, { type: "tick", nowMs: 9 })).toThrow(
      "cannot move backwards",
    );

    let shortState = createSequencerState({
      ...DAY1_SEQUENCER_DEFINITION,
      durationSeconds: 100,
      minimumCompletionSeconds: 1_500,
      cues: DAY1_CUES.slice(0, 2),
    });
    shortState = reduceSequencer(shortState, { type: "start", nowMs: 0 }).state;
    const result = reduceSequencer(shortState, {
      type: "tick",
      nowMs: 100_000,
    });
    expect(result.state.status).toBe("ended");
    expect(result.state.endReason).toBe("non-qualifying");
    expect(result.effects.some(({ type }) => type === "completed")).toBe(false);
  });
});
