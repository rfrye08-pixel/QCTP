/** A cue positioned on the authoritative, unscaled practice timeline. */
export interface TimedCue {
  readonly at: number;
}

export interface SequencerDefinition<TCue extends TimedCue> {
  readonly durationSeconds: number;
  readonly testDurationSeconds: number;
  readonly minimumCompletionSeconds: number;
  readonly cues: readonly TCue[];
}

export type SequencerStatus =
  "idle" | "running" | "paused" | "ended" | "completed";
export type SequencerEndReason =
  "user" | "test-finished" | "non-qualifying" | "natural";

export interface SequencerState<TCue extends TimedCue> {
  readonly definition: SequencerDefinition<TCue>;
  readonly status: SequencerStatus;
  readonly testMode: boolean;
  /** Accumulated active playback time. Paused wall time is never included. */
  readonly elapsedMilliseconds: number;
  /** Last observed value from the caller's monotonic clock. */
  readonly lastNowMilliseconds: number | null;
  readonly firedCueTimes: readonly number[];
  readonly activeCue: TCue | null;
  readonly endReason: SequencerEndReason | null;
}

export type SequencerEvent =
  | { readonly type: "start"; readonly nowMs: number }
  | { readonly type: "tick"; readonly nowMs: number }
  | { readonly type: "pause"; readonly nowMs: number }
  | { readonly type: "resume"; readonly nowMs: number }
  | { readonly type: "end"; readonly nowMs: number }
  | { readonly type: "reset" };

export interface CueEffect<TCue extends TimedCue> {
  readonly type: "cue";
  readonly cue: TCue;
}

export interface CompletedEffect {
  readonly type: "completed";
  readonly elapsedSeconds: number;
  readonly natural: true;
  readonly testMode: false;
}

export interface EndedEffect {
  readonly type: "ended";
  readonly elapsedSeconds: number;
  readonly reason: Exclude<SequencerEndReason, "natural">;
}

export type SequencerEffect<TCue extends TimedCue> =
  CueEffect<TCue> | CompletedEffect | EndedEffect;

export interface SequencerTransition<TCue extends TimedCue> {
  readonly state: SequencerState<TCue>;
  readonly effects: readonly SequencerEffect<TCue>[];
}

export interface SequencerOptions {
  readonly testMode?: boolean;
}

export interface SequencerEngine<TCue extends TimedCue> {
  readonly initialState: SequencerState<TCue>;
  readonly reduce: (
    state: SequencerState<TCue>,
    event: SequencerEvent,
  ) => SequencerTransition<TCue>;
}

const NO_EFFECTS = Object.freeze([]) as readonly never[];

/**
 * Builds serializable state for a sequencer driven by `performance.now()` (or
 * another monotonic millisecond clock). No timers, audio, storage, or DOM calls
 * live in this module.
 */
export function createSequencerState<TCue extends TimedCue>(
  definition: SequencerDefinition<TCue>,
  options: SequencerOptions = {},
): SequencerState<TCue> {
  const normalizedDefinition = normalizeDefinition(definition);

  return Object.freeze({
    definition: normalizedDefinition,
    status: "idle",
    testMode: options.testMode === true,
    elapsedMilliseconds: 0,
    lastNowMilliseconds: null,
    firedCueTimes: Object.freeze([]),
    activeCue: null,
    endReason: null,
  });
}

export function createSequencerEngine<TCue extends TimedCue>(
  definition: SequencerDefinition<TCue>,
  options: SequencerOptions = {},
): SequencerEngine<TCue> {
  return Object.freeze({
    initialState: createSequencerState(definition, options),
    reduce: reduceSequencer<TCue>,
  });
}

/**
 * Pure state transition. Every event timestamp must come from the same
 * monotonic clock; a backwards timestamp is rejected instead of allowing the
 * countdown or cue cursor to move backwards.
 */
export function reduceSequencer<TCue extends TimedCue>(
  state: SequencerState<TCue>,
  event: SequencerEvent,
): SequencerTransition<TCue> {
  if (event.type === "reset") {
    return transition(
      createSequencerState(state.definition, { testMode: state.testMode }),
    );
  }

  assertMonotonicTimestamp(event.nowMs, state.lastNowMilliseconds);

  switch (event.type) {
    case "start":
      return start(state, event.nowMs);
    case "tick":
      return tick(state, event.nowMs);
    case "pause":
      return pause(state, event.nowMs);
    case "resume":
      return resume(state, event.nowMs);
    case "end":
      return end(state, event.nowMs);
  }
}

export function getSequencerDurationSeconds<TCue extends TimedCue>(
  state: SequencerState<TCue>,
): number {
  return state.testMode
    ? state.definition.testDurationSeconds
    : state.definition.durationSeconds;
}

export function getSequencerElapsedSeconds<TCue extends TimedCue>(
  state: SequencerState<TCue>,
): number {
  return state.elapsedMilliseconds / 1_000;
}

export function getSequencerRemainingSeconds<TCue extends TimedCue>(
  state: SequencerState<TCue>,
): number {
  return Math.max(
    0,
    getSequencerDurationSeconds(state) - getSequencerElapsedSeconds(state),
  );
}

export function getSequencerProgress<TCue extends TimedCue>(
  state: SequencerState<TCue>,
): number {
  const duration = getSequencerDurationSeconds(state);
  return Math.min(1, Math.max(0, getSequencerElapsedSeconds(state) / duration));
}

function start<TCue extends TimedCue>(
  state: SequencerState<TCue>,
  nowMs: number,
): SequencerTransition<TCue> {
  if (state.status === "running" || state.status === "paused") {
    return transition(state);
  }

  const started: SequencerState<TCue> = Object.freeze({
    ...state,
    status: "running",
    elapsedMilliseconds: 0,
    lastNowMilliseconds: nowMs,
    firedCueTimes: Object.freeze([]),
    activeCue: null,
    endReason: null,
  });

  return emitDueCues(started, NO_EFFECTS);
}

function tick<TCue extends TimedCue>(
  state: SequencerState<TCue>,
  nowMs: number,
): SequencerTransition<TCue> {
  if (state.status !== "running") return observeOnly(state, nowMs);
  return advanceRunningState(state, nowMs);
}

function pause<TCue extends TimedCue>(
  state: SequencerState<TCue>,
  nowMs: number,
): SequencerTransition<TCue> {
  if (state.status !== "running") return observeOnly(state, nowMs);

  const advanced = advanceRunningState(state, nowMs);
  if (advanced.state.status !== "running") return advanced;

  return transition(
    Object.freeze({
      ...advanced.state,
      status: "paused",
    }),
    advanced.effects,
  );
}

function resume<TCue extends TimedCue>(
  state: SequencerState<TCue>,
  nowMs: number,
): SequencerTransition<TCue> {
  if (state.status !== "paused") return observeOnly(state, nowMs);

  return transition(
    Object.freeze({
      ...state,
      status: "running",
      lastNowMilliseconds: nowMs,
    }),
  );
}

function end<TCue extends TimedCue>(
  state: SequencerState<TCue>,
  nowMs: number,
): SequencerTransition<TCue> {
  if (state.status !== "running" && state.status !== "paused") {
    return observeOnly(state, nowMs);
  }

  if (state.status === "running") {
    const elapsed = projectedElapsedMilliseconds(state, nowMs);
    if (elapsed >= effectiveDurationMilliseconds(state)) {
      // The authoritative duration elapsed naturally before the event was
      // observed, so completion remains valid even when this is the first event
      // after the deadline.
      return advanceRunningState(state, nowMs);
    }
  }

  const elapsedMilliseconds =
    state.status === "running"
      ? projectedElapsedMilliseconds(state, nowMs)
      : state.elapsedMilliseconds;
  const endedState: SequencerState<TCue> = Object.freeze({
    ...state,
    status: "ended",
    elapsedMilliseconds,
    lastNowMilliseconds: nowMs,
    endReason: "user",
  });
  const ended: EndedEffect = Object.freeze({
    type: "ended",
    elapsedSeconds: elapsedMilliseconds / 1_000,
    reason: "user",
  });

  return transition(endedState, Object.freeze([ended]));
}

function advanceRunningState<TCue extends TimedCue>(
  state: SequencerState<TCue>,
  nowMs: number,
): SequencerTransition<TCue> {
  const elapsedMilliseconds = projectedElapsedMilliseconds(state, nowMs);
  const advanced: SequencerState<TCue> = Object.freeze({
    ...state,
    elapsedMilliseconds,
    lastNowMilliseconds: nowMs,
  });
  const withCues = emitDueCues(advanced, NO_EFFECTS);

  if (elapsedMilliseconds < effectiveDurationMilliseconds(state))
    return withCues;
  return finishNaturally(withCues.state, withCues.effects);
}

function emitDueCues<TCue extends TimedCue>(
  state: SequencerState<TCue>,
  priorEffects: readonly SequencerEffect<TCue>[],
): SequencerTransition<TCue> {
  const fired = new Set(state.firedCueTimes);
  const dueCues = state.definition.cues.filter((cue) => {
    if (fired.has(cue.at)) return false;
    return scaledCueMilliseconds(state, cue) <= state.elapsedMilliseconds;
  });

  if (dueCues.length === 0) return transition(state, priorEffects);
  for (const cue of dueCues) fired.add(cue.at);

  const cueEffects: readonly CueEffect<TCue>[] = Object.freeze(
    dueCues.map((cue) => Object.freeze({ type: "cue" as const, cue })),
  );
  const activeCue = dueCues[dueCues.length - 1];
  if (activeCue === undefined) return transition(state, priorEffects);

  return transition(
    Object.freeze({
      ...state,
      firedCueTimes: Object.freeze(
        [...fired].sort((left, right) => left - right),
      ),
      activeCue,
    }),
    Object.freeze([...priorEffects, ...cueEffects]),
  );
}

function finishNaturally<TCue extends TimedCue>(
  state: SequencerState<TCue>,
  priorEffects: readonly SequencerEffect<TCue>[],
): SequencerTransition<TCue> {
  const elapsedSeconds = state.elapsedMilliseconds / 1_000;
  const completionEligible =
    !state.testMode &&
    elapsedSeconds >= state.definition.minimumCompletionSeconds;

  if (completionEligible) {
    const completedState: SequencerState<TCue> = Object.freeze({
      ...state,
      status: "completed",
      endReason: "natural",
    });
    const completed: CompletedEffect = Object.freeze({
      type: "completed",
      elapsedSeconds,
      natural: true,
      testMode: false,
    });
    return transition(
      completedState,
      Object.freeze([...priorEffects, completed]),
    );
  }

  const reason: EndedEffect["reason"] = state.testMode
    ? "test-finished"
    : "non-qualifying";
  const endedState: SequencerState<TCue> = Object.freeze({
    ...state,
    status: "ended",
    endReason: reason,
  });
  const ended: EndedEffect = Object.freeze({
    type: "ended",
    elapsedSeconds,
    reason,
  });
  return transition(endedState, Object.freeze([...priorEffects, ended]));
}

function observeOnly<TCue extends TimedCue>(
  state: SequencerState<TCue>,
  nowMs: number,
): SequencerTransition<TCue> {
  if (
    state.lastNowMilliseconds === null ||
    state.lastNowMilliseconds === nowMs
  ) {
    return transition(state);
  }

  return transition(
    Object.freeze({
      ...state,
      lastNowMilliseconds: nowMs,
    }),
  );
}

function projectedElapsedMilliseconds<TCue extends TimedCue>(
  state: SequencerState<TCue>,
  nowMs: number,
): number {
  const lastNowMs = state.lastNowMilliseconds ?? nowMs;
  return Math.min(
    effectiveDurationMilliseconds(state),
    state.elapsedMilliseconds + (nowMs - lastNowMs),
  );
}

function effectiveDurationMilliseconds<TCue extends TimedCue>(
  state: SequencerState<TCue>,
): number {
  return getSequencerDurationSeconds(state) * 1_000;
}

function scaledCueMilliseconds<TCue extends TimedCue>(
  state: SequencerState<TCue>,
  cue: TCue,
): number {
  const scale =
    getSequencerDurationSeconds(state) / state.definition.durationSeconds;
  return cue.at * scale * 1_000;
}

function normalizeDefinition<TCue extends TimedCue>(
  definition: SequencerDefinition<TCue>,
): SequencerDefinition<TCue> {
  assertPositiveFinite(definition.durationSeconds, "durationSeconds");
  assertPositiveFinite(definition.testDurationSeconds, "testDurationSeconds");
  assertPositiveFinite(
    definition.minimumCompletionSeconds,
    "minimumCompletionSeconds",
  );

  let previousTimestamp = -1;
  for (const cue of definition.cues) {
    if (
      !Number.isFinite(cue.at) ||
      cue.at < 0 ||
      cue.at > definition.durationSeconds
    ) {
      throw new RangeError(
        "Cue timestamps must fall on the authoritative practice timeline.",
      );
    }
    if (cue.at <= previousTimestamp) {
      throw new RangeError(
        "Cue timestamps must be unique and strictly increasing.",
      );
    }
    previousTimestamp = cue.at;
  }

  return Object.freeze({
    durationSeconds: definition.durationSeconds,
    testDurationSeconds: definition.testDurationSeconds,
    minimumCompletionSeconds: definition.minimumCompletionSeconds,
    cues: Object.freeze([...definition.cues]),
  });
}

function assertPositiveFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive finite number.`);
  }
}

function assertMonotonicTimestamp(
  nowMs: number,
  lastNowMs: number | null,
): void {
  if (!Number.isFinite(nowMs) || nowMs < 0) {
    throw new RangeError(
      "Sequencer timestamps must be non-negative finite milliseconds.",
    );
  }
  if (lastNowMs !== null && nowMs < lastNowMs) {
    throw new RangeError(
      "Sequencer timestamps must be monotonic and cannot move backwards.",
    );
  }
}

function transition<TCue extends TimedCue>(
  state: SequencerState<TCue>,
  effects: readonly SequencerEffect<TCue>[] = NO_EFFECTS,
): SequencerTransition<TCue> {
  return Object.freeze({ state, effects });
}
