export type RecorderPhase =
  | "idle"
  | "requesting-permission"
  | "recording"
  | "paused"
  | "review"
  | "saving"
  | "saved"
  | "cancelled"
  | "error";

export type PauseReason = "user" | "document-hidden";

export interface RecorderState {
  phase: RecorderPhase;
  recordingId: string | null;
  mimeType: string | null;
  startedAtMs: number | null;
  accumulatedMs: number;
  durationLimitMs: number | null;
  sizeBytes: number;
  level: number;
  pauseReason: PauseReason | null;
  error: string | null;
}

export type RecorderEvent =
  | {
      type: "REQUEST_PERMISSION";
      durationLimitMs: number | null;
      initialAccumulatedMs?: number;
      initialSizeBytes?: number;
    }
  | {
      type: "PERMISSION_GRANTED";
      recordingId: string;
      mimeType: string;
      nowMs: number;
    }
  | { type: "CHUNK_PERSISTED"; sizeBytes: number }
  | { type: "TICK"; nowMs: number; level: number }
  | { type: "PAUSE"; nowMs: number; reason: PauseReason }
  | { type: "RESUME"; nowMs: number }
  | { type: "STOP"; nowMs: number }
  | { type: "SAVE" }
  | { type: "SAVED" }
  | { type: "CANCEL" }
  | { type: "RESET" }
  | { type: "FAIL"; message: string };

export interface RecorderTransition {
  state: RecorderState;
  shouldStop: boolean;
}

export const INITIAL_RECORDER_STATE: RecorderState = {
  phase: "idle",
  recordingId: null,
  mimeType: null,
  startedAtMs: null,
  accumulatedMs: 0,
  durationLimitMs: null,
  sizeBytes: 0,
  level: 0,
  pauseReason: null,
  error: null,
};

export function recorderElapsedMs(state: RecorderState, nowMs: number): number {
  const elapsed =
    state.phase !== "recording" || state.startedAtMs === null
      ? state.accumulatedMs
      : state.accumulatedMs + Math.max(0, nowMs - state.startedAtMs);
  return state.durationLimitMs === null
    ? elapsed
    : Math.min(state.durationLimitMs, elapsed);
}

export function reduceRecorder(
  state: RecorderState,
  event: RecorderEvent,
): RecorderTransition {
  switch (event.type) {
    case "REQUEST_PERMISSION":
      if (
        !["idle", "review", "saved", "cancelled", "error"].includes(state.phase)
      ) {
        return { state, shouldStop: false };
      }
      return {
        state: {
          ...INITIAL_RECORDER_STATE,
          phase: "requesting-permission",
          durationLimitMs: event.durationLimitMs,
          accumulatedMs: Math.max(0, event.initialAccumulatedMs ?? 0),
          sizeBytes: Math.max(0, event.initialSizeBytes ?? 0),
        },
        shouldStop: false,
      };
    case "PERMISSION_GRANTED":
      if (state.phase !== "requesting-permission")
        return { state, shouldStop: false };
      return {
        state: {
          ...state,
          phase: "recording",
          recordingId: event.recordingId,
          mimeType: event.mimeType,
          startedAtMs: event.nowMs,
        },
        shouldStop: false,
      };
    case "CHUNK_PERSISTED":
      if (!["recording", "paused"].includes(state.phase))
        return { state, shouldStop: false };
      return {
        state: {
          ...state,
          sizeBytes: state.sizeBytes + Math.max(0, event.sizeBytes),
        },
        shouldStop: false,
      };
    case "TICK": {
      if (state.phase !== "recording") return { state, shouldStop: false };
      const elapsedMs = recorderElapsedMs(state, event.nowMs);
      const shouldStop =
        state.durationLimitMs !== null && elapsedMs >= state.durationLimitMs;
      return {
        state: { ...state, level: Math.max(0, Math.min(1, event.level)) },
        shouldStop,
      };
    }
    case "PAUSE":
      if (state.phase !== "recording") return { state, shouldStop: false };
      return {
        state: {
          ...state,
          phase: "paused",
          accumulatedMs: recorderElapsedMs(state, event.nowMs),
          startedAtMs: null,
          level: 0,
          pauseReason: event.reason,
        },
        shouldStop: false,
      };
    case "RESUME":
      if (state.phase !== "paused") return { state, shouldStop: false };
      return {
        state: {
          ...state,
          phase: "recording",
          startedAtMs: event.nowMs,
          pauseReason: null,
        },
        shouldStop: false,
      };
    case "STOP":
      if (!["recording", "paused"].includes(state.phase))
        return { state, shouldStop: false };
      return {
        state: {
          ...state,
          phase: "review",
          accumulatedMs: recorderElapsedMs(state, event.nowMs),
          startedAtMs: null,
          level: 0,
          pauseReason: null,
        },
        shouldStop: false,
      };
    case "SAVE":
      return state.phase === "review"
        ? { state: { ...state, phase: "saving" }, shouldStop: false }
        : { state, shouldStop: false };
    case "SAVED":
      return state.phase === "saving"
        ? { state: { ...state, phase: "saved" }, shouldStop: false }
        : { state, shouldStop: false };
    case "CANCEL":
      return {
        state: { ...INITIAL_RECORDER_STATE, phase: "cancelled" },
        shouldStop: false,
      };
    case "RESET":
      return { state: INITIAL_RECORDER_STATE, shouldStop: false };
    case "FAIL":
      return {
        state: {
          ...state,
          phase: "error",
          startedAtMs: null,
          level: 0,
          error: event.message,
        },
        shouldStop: false,
      };
  }
}
