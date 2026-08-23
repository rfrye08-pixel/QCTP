import { describe, expect, it } from "vitest";

import { selectBreathProtocol } from "./director";
import {
  advanceForegroundPracticeClock,
  createFoundationProtocol,
  createInitialFoundationProgress,
  foundationCompletionGate,
} from "./foundation-protocol";
import {
  BreathFoundationProtocolSegmentSchema,
  ReadyBreathSelectionSchema,
  type BreathCalibrationTrial,
  type BreathSessionRecord,
} from "./types";

const now = "2026-08-22T12:00:00.000Z";

function rating(cadenceLabel: string): BreathCalibrationTrial {
  return {
    cadenceLabel,
    physicalEase: 4,
    calm: 4,
    clarity: 4,
    airHunger: 0,
    tension: 0,
    sleepiness: 1,
    emotionalShift: 3,
    desireToContinue: 4,
    dizziness: false,
    recoveryBreathRequired: false,
  };
}

function recordForGate(): BreathSessionRecord {
  const protocol = createFoundationProtocol("BREATH-02");
  const selection = selectBreathProtocol({
    goal: "calm_coherence",
    context: "general",
    activation: 2,
    sleepiness: 1,
    airHungerAtRest: 0,
    availableMinutes: 6,
    posture: "seated",
    hazard: "none",
    comfortableMethodIds: [],
  });
  if (selection.status !== "ready") throw new Error("fixture blocked");
  const foundationSelection = ReadyBreathSelectionSchema.parse({
    ...selection,
    protocolId: protocol.protocolId,
    contentClass: "QCTP_ORIGINAL",
    contentRef: {
      authorityKey: "breath.foundation.BREATH-02",
      contentClass: "QCTP_ORIGINAL",
    },
    embeddedContentRefs: protocol.segments.map((segment) => segment.contentRef),
    methodId: null,
  });
  return {
    schemaVersion: 1,
    id: "breath-foundation-gate",
    goal: "calm_coherence",
    context: "general",
    foundationSessionId: "BREATH-02",
    foundationProtocol: protocol,
    protocolProgress: createInitialFoundationProgress(protocol),
    checkpoint: {
      checkpointRevision: "QCTP-REV3-BREATH-CHECKPOINT-REV1",
      activePracticeMilliseconds: 0,
      currentSegmentId: protocol.segments[0]!.segmentId,
      savedAt: now,
    },
    selection: foundationSelection,
    startedAt: now,
    endedAt: now,
    plannedDurationSeconds: protocol.totalActiveDurationSeconds,
    completedDurationSeconds: protocol.totalActiveDurationSeconds,
    initialState: {
      activation: 2,
      sleepiness: 1,
      calm: 2,
      clarity: 3,
      airHunger: 0,
    },
    finalState: {
      activation: 1,
      sleepiness: 1,
      calm: 4,
      clarity: 4,
      airHunger: 0,
    },
    adjustments: [],
    symptoms: [],
    shouldReuseForGoal: true,
    rawObservation: "Five/five felt neutral; four/six reduced shoulder effort.",
    interpretation: "The exhale-biased pattern may fit calm practice.",
    status: "completed",
    stateCapabilityCreditGranted: false,
    updatedAt: now,
  };
}

describe("Breath Foundations controlled protocol integrity", () => {
  it("persists materially exact identities for every multi-method and calibration segment", () => {
    const comparison = createFoundationProtocol("BREATH-02");
    expect(comparison.segments.map((segment) => segment.methodId)).toEqual([
      "QCTP-B3",
      "QCTP-B1",
    ]);
    expect(
      comparison.segments.map((segment) => segment.durationSeconds),
    ).toEqual([180, 180]);
    expect(
      comparison.segments.map((segment) => segment.contentRef.authorityKey),
    ).toEqual(["breath.method.QCTP-B3", "breath.method.QCTP-B1"]);

    const physiologicalSigh = createFoundationProtocol("BREATH-03");
    expect(physiologicalSigh.segments[0]?.contentRef).toEqual({
      authorityKey: "breath.method.physiological-sigh",
      contentClass: "SOURCE_ENHANCED",
    });

    const cyclicSighing = createFoundationProtocol("BREATH-04");
    expect(cyclicSighing.segments[0]?.contentRef).toEqual({
      authorityKey: "breath.method.QCTP-B2",
      contentClass: "SOURCE_ENHANCED",
    });
    expect(() =>
      BreathFoundationProtocolSegmentSchema.parse({
        ...cyclicSighing.segments[0],
        contentRef: {
          authorityKey: "breath.method.QCTP-B1",
          contentClass: "QCTP_ORIGINAL",
        },
      }),
    ).toThrow(/CONTROLLED_CONTENT_PARENT_MISMATCH/u);

    const combined = createFoundationProtocol("BREATH-06");
    expect(
      combined.segments.map((segment) => [segment.methodId, segment.posture]),
    ).toEqual([
      ["QCTP-B5", "seated"],
      ["QCTP-B6", "walking"],
    ]);

    const calibration = createFoundationProtocol("BREATH-07");
    expect(
      calibration.segments.map((segment) => [
        segment.label,
        segment.methodId,
        segment.durationSeconds,
        segment.cadence?.kind ?? "natural",
      ]),
    ).toEqual([
      ["Natural baseline observation", null, 120, "natural"],
      ["Five/five calibration trial", "QCTP-B3", 180, "timed"],
      ["Four/six calibration trial", "QCTP-B1", 180, "timed"],
      ["Five/seven optional comfort trial", "QCTP-B1", 180, "timed"],
      ["Natural recovery observation", null, 120, "natural"],
    ]);
    expect(calibration.totalActiveDurationSeconds).toBe(780);
    expect(calibration.segments[3]?.comfortRequired).toBe(true);
  });

  it("does not inflate active practice across a long hidden or unfocused interval", () => {
    let clock = {
      lastMonotonicMilliseconds: 0,
      wasCountable: true,
    };
    let active = 0;
    let sample = advanceForegroundPracticeClock(clock, 1_000, true);
    clock = sample.clock;
    active += sample.activeDeltaMilliseconds;
    sample = advanceForegroundPracticeClock(clock, 1_200, false);
    clock = sample.clock;
    active += sample.activeDeltaMilliseconds;
    sample = advanceForegroundPracticeClock(clock, 601_200, false);
    clock = sample.clock;
    active += sample.activeDeltaMilliseconds;
    sample = advanceForegroundPracticeClock(clock, 601_250, true);
    clock = sample.clock;
    active += sample.activeDeltaMilliseconds;
    sample = advanceForegroundPracticeClock(clock, 602_250, true);
    active += sample.activeDeltaMilliseconds;

    expect(active).toBe(2_200);
  });

  it("rejects wall time plus text until each physical segment checkpoint is present", () => {
    const record = recordForGate();
    expect(record.completedDurationSeconds).toBe(360);
    expect(foundationCompletionGate(record)).toMatchObject({ complete: false });

    const protocol = record.foundationProtocol!;
    record.protocolProgress = protocol.segments.map((segment) => ({
      segmentId: segment.segmentId,
      methodId: segment.methodId,
      activePracticeMilliseconds: segment.durationSeconds * 1_000,
      executionMode: "planned_technique",
      performedAsDirected: true,
      checkpointConfirmedAt: now,
      rating: rating(segment.label),
      symptoms: [],
    }));
    expect(foundationCompletionGate(record)).toEqual({
      complete: true,
      reasons: [],
    });

    record.protocolProgress[1] = {
      ...record.protocolProgress[1]!,
      methodId: "QCTP-B3",
    };
    expect(foundationCompletionGate(record).reasons).toContain(
      "Exhale-biased four/six comparison: exact method identity is missing.",
    );
  });
});
