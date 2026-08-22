import { describe, expect, it } from "vitest";

import {
  INITIAL_RECORDER_STATE,
  recorderElapsedMs,
  reduceRecorder,
} from "./recorder-machine";

function begin(limit: number | null = null) {
  const requested = reduceRecorder(INITIAL_RECORDER_STATE, {
    type: "REQUEST_PERMISSION",
    durationLimitMs: limit,
  }).state;
  return reduceRecorder(requested, {
    type: "PERMISSION_GRANTED",
    recordingId: "recording-1",
    mimeType: "audio/webm",
    nowMs: 100,
  }).state;
}

describe("recorder state machine", () => {
  it("does not enter recording before explicit permission flow", () => {
    const transition = reduceRecorder(INITIAL_RECORDER_STATE, {
      type: "PERMISSION_GRANTED",
      recordingId: "not-allowed",
      mimeType: "audio/webm",
      nowMs: 0,
    });
    expect(transition.state).toEqual(INITIAL_RECORDER_STATE);
  });

  it("preserves elapsed time across pause and resume", () => {
    const recording = begin();
    const paused = reduceRecorder(recording, {
      type: "PAUSE",
      nowMs: 1_100,
      reason: "user",
    }).state;
    expect(recorderElapsedMs(paused, 9_000)).toBe(1_000);

    const resumed = reduceRecorder(paused, {
      type: "RESUME",
      nowMs: 5_000,
    }).state;
    expect(recorderElapsedMs(resumed, 5_750)).toBe(1_750);
  });

  it("signals exact timed-session limits without using interval counts", () => {
    const recording = begin(300_000);
    expect(
      reduceRecorder(recording, { type: "TICK", nowMs: 300_099, level: 0.5 })
        .shouldStop,
    ).toBe(false);
    expect(
      reduceRecorder(recording, { type: "TICK", nowMs: 300_100, level: 0.5 })
        .shouldStop,
    ).toBe(true);
  });

  it("tracks persisted bytes and clamps input level", () => {
    const recording = begin();
    const withChunk = reduceRecorder(recording, {
      type: "CHUNK_PERSISTED",
      sizeBytes: 42,
    }).state;
    const withLevel = reduceRecorder(withChunk, {
      type: "TICK",
      nowMs: 200,
      level: 4,
    }).state;
    expect(withLevel.sizeBytes).toBe(42);
    expect(withLevel.level).toBe(1);
  });

  it("records document-hidden pauses distinctly", () => {
    const paused = reduceRecorder(begin(), {
      type: "PAUSE",
      nowMs: 1_000,
      reason: "document-hidden",
    }).state;
    expect(paused.phase).toBe("paused");
    expect(paused.pauseReason).toBe("document-hidden");
  });

  it("requires review before save and retains source metadata through save", () => {
    const recording = begin();
    const stopped = reduceRecorder(recording, {
      type: "STOP",
      nowMs: 2_100,
    }).state;
    const saving = reduceRecorder(stopped, { type: "SAVE" }).state;
    const saved = reduceRecorder(saving, { type: "SAVED" }).state;
    expect(saved.phase).toBe("saved");
    expect(saved.recordingId).toBe("recording-1");
    expect(saved.accumulatedMs).toBe(2_000);
  });
});
