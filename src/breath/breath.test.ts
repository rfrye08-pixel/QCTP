import { describe, expect, it } from "vitest";

import {
  BREATH_FOUNDATIONS,
  BREATH_METHODS,
  BreathProfileSchema,
  BreathSessionRecordSchema,
  calculateCadenceCycleSeconds,
  calculateExpectedCycles,
  createBreathAdjustment,
  getBreathMethod,
  selectBreathProtocol,
  selectPassingCalibrationTrial,
  type BreathDirectorInput,
  type ReadyBreathSelection,
} from "./index";

const now = "2026-08-22T12:00:00.000-05:00";

function input(
  overrides: Partial<BreathDirectorInput> = {},
): BreathDirectorInput {
  return {
    goal: "calm_coherence",
    context: "general",
    activation: 2,
    sleepiness: 1,
    airHungerAtRest: 0,
    availableMinutes: 5,
    posture: "seated",
    hazard: "none",
    comfortableMethodIds: [],
    ...overrides,
  };
}

function ready(
  overrides: Partial<BreathDirectorInput> = {},
): ReadyBreathSelection {
  const selection = selectBreathProtocol(input(overrides));
  if (selection.status !== "ready") {
    throw new Error(`Expected a ready selection: ${selection.message}`);
  }
  return selection;
}

describe("controlled breath catalog", () => {
  it("represents B1 through B6 as six complete structured local methods", () => {
    expect(BREATH_METHODS.map((method) => method.id)).toEqual([
      "QCTP-B1",
      "QCTP-B2",
      "QCTP-B3",
      "QCTP-B4",
      "QCTP-B5",
      "QCTP-B6",
    ]);
    for (const method of BREATH_METHODS) {
      expect(method.sourceClass).toBe("qctp_regulation_support");
      expect(method.volumeInstruction.length).toBeGreaterThan(10);
      expect(method.permittedPostures.length).toBeGreaterThan(0);
      expect(method.transitionInstruction.length).toBeGreaterThan(10);
      expect(method.stopConditions).toContain("Dizziness");
      expect(method.stopConditions).toContain("Marked air hunger");
    }
  });

  it("keeps B1 quiet, no-hold, four-in/six-out and releases counting", () => {
    const method = getBreathMethod("QCTP-B1");
    expect(method.cadence).toEqual({
      kind: "timed",
      inhaleSeconds: 4,
      secondInhaleSeconds: null,
      inhaleHoldSeconds: 0,
      exhaleSeconds: 6,
      exhaleHoldSeconds: 0,
    });
    expect(method.volumeInstruction).toMatch(/60–75%|non-maximal/i);
    expect(method.transitionInstruction).toMatch(/stop counting/i);
  });

  it("contains exactly the seven controlled Breath Foundations sessions", () => {
    expect(BREATH_FOUNDATIONS).toHaveLength(7);
    expect(BREATH_FOUNDATIONS.map((session) => session.id)).toEqual([
      "BREATH-01",
      "BREATH-02",
      "BREATH-03",
      "BREATH-04",
      "BREATH-05",
      "BREATH-06",
      "BREATH-07",
    ]);
    expect(
      BREATH_FOUNDATIONS.every(
        (session) => session.grantsStateCreditFromElapsedTime === false,
      ),
    ).toBe(true);
    expect(
      BREATH_FOUNDATIONS.some((session) => /Day 2/i.test(session.title)),
    ).toBe(false);
  });
});

describe("deterministic Breath Director", () => {
  it.each([
    ["calm_coherence", "QCTP-B1"],
    ["focus", "QCTP-B3"],
    ["meditation_gap", "QCTP-B1"],
    ["focus10_obe", "QCTP-B1"],
    ["remote_viewing", "QCTP-B3"],
    ["alternate_nostril", "QCTP-B5"],
  ] as const)("maps %s to %s", (goal, methodId) => {
    expect(ready({ goal }).methodId).toBe(methodId);
  });

  it("preserves Day 1 HeartMath five/five-or-comfortable instead of substituting B1", () => {
    const selection = ready({
      goal: "meditation_gap",
      context: "foundation_day_1",
    });
    expect(selection).toMatchObject({
      protocolId: "FOUNDATION-DAY-01-HEARTMATH-REV0",
      sourceClass: "source_specific_controlled",
      methodId: null,
      inhaleRoute: "comfortable_route",
      exhaleRoute: "comfortable_route",
      plannedDurationSeconds: null,
    });
    expect(selection.cadence).toEqual({
      kind: "timed",
      inhaleSeconds: 5,
      secondInhaleSeconds: null,
      inhaleHoldSeconds: 0,
      exhaleSeconds: 5,
      exhaleHoldSeconds: 0,
    });
    expect(selection.warnings).toContain("No nasal-only requirement.");
    expect(selection.transitionInstruction).toMatch(
      /Do not substitute QCTP-B1/i,
    );
    expect(
      selectBreathProtocol(
        input({ context: "foundation_day_1", posture: "walking" }),
      ),
    ).toMatchObject({
      status: "blocked",
      reasonCodes: ["POSTURE_INCOMPATIBLE"],
    });
  });

  it.each(["driving", "machinery", "ladder", "water", "other_hazard"] as const)(
    "blocks every deliberate protocol during %s",
    (hazard) => {
      const selection = selectBreathProtocol(input({ hazard }));
      expect(selection).toMatchObject({
        status: "blocked",
        reasonCodes: ["HAZARDOUS_ACTIVITY"],
        fallback: "practice_later",
        grantsStateCreditFromElapsedTime: false,
      });
    },
  );

  it("blocks pacing for marked air hunger at rest", () => {
    expect(selectBreathProtocol(input({ airHungerAtRest: 4 }))).toMatchObject({
      status: "blocked",
      reasonCodes: ["AIR_HUNGER_AT_REST"],
      fallback: "natural_breathing_only",
    });
  });

  it("uses one to three physiological sighs before the acute-reset interval", () => {
    expect(
      ready({ goal: "acute_reset", activation: 1 }).prelude[0]?.repetitions,
    ).toBe(1);
    expect(
      ready({ goal: "acute_reset", activation: 3 }).prelude[0]?.repetitions,
    ).toBe(2);
    expect(
      ready({ goal: "acute_reset", activation: 5 }).prelude[0]?.repetitions,
    ).toBe(3);
  });

  it("uses balanced five/five as the controlled sleep fallback for air hunger", () => {
    const selection = ready({
      goal: "sleep",
      posture: "lying",
      airHungerAtRest: 2,
    });
    expect(selection.methodId).toBe("QCTP-B3");
    expect(selection.cadence).toMatchObject({
      kind: "timed",
      inhaleSeconds: 5,
      exhaleSeconds: 5,
      inhaleHoldSeconds: 0,
      exhaleHoldSeconds: 0,
    });
  });

  it("blocks box breathing until both no-hold prerequisites are comfortable", () => {
    const held = selectBreathProtocol(input({ goal: "box_breathing" }));
    expect(held).toMatchObject({
      status: "blocked",
      reasonCodes: ["PREREQUISITE_NOT_MET"],
      fallback: "QCTP-B3",
    });
    expect(
      ready({
        goal: "box_breathing",
        comfortableMethodIds: ["QCTP-B1", "QCTP-B3"],
      }).methodId,
    ).toBe("QCTP-B4");
  });

  it("enforces controlled posture and minimum-time constraints", () => {
    expect(
      selectBreathProtocol(input({ goal: "walking", posture: "seated" })),
    ).toMatchObject({
      status: "blocked",
      reasonCodes: ["POSTURE_INCOMPATIBLE"],
    });
    expect(
      selectBreathProtocol(
        input({ goal: "alternate_nostril", availableMinutes: 0.5 }),
      ),
    ).toMatchObject({ status: "blocked", reasonCodes: ["INSUFFICIENT_TIME"] });
  });

  it("returns the exact thirteen-minute five-phase calibration only when seated", () => {
    expect(
      selectBreathProtocol(
        input({ goal: "calibration", availableMinutes: 12.9 }),
      ),
    ).toMatchObject({
      status: "blocked",
      reasonCodes: ["INSUFFICIENT_CALIBRATION_TIME"],
    });
    const selection = ready({ goal: "calibration", availableMinutes: 13 });
    expect(selection.plannedDurationSeconds).toBe(780);
    expect(selection.cadence.kind).toBe("calibration");
    if (selection.cadence.kind === "calibration") {
      expect(
        selection.cadence.phases.map((phase) => phase.durationSeconds),
      ).toEqual([120, 180, 180, 180, 120]);
    }
  });
});

describe("cadence, adaptation, and persistence contracts", () => {
  it("calculates timed and alternate-nostril cycles without inventing timing for sighs or steps", () => {
    expect(
      calculateCadenceCycleSeconds(getBreathMethod("QCTP-B1").cadence),
    ).toBe(10);
    expect(
      calculateExpectedCycles(getBreathMethod("QCTP-B1").cadence, 300),
    ).toBe(30);
    expect(
      calculateCadenceCycleSeconds(getBreathMethod("QCTP-B5").cadence),
    ).toBe(16);
    expect(
      calculateCadenceCycleSeconds(getBreathMethod("QCTP-B2").cadence),
    ).toBeNull();
    expect(
      calculateCadenceCycleSeconds(getBreathMethod("QCTP-B6").cadence),
    ).toBeNull();
    expect(() =>
      calculateExpectedCycles(getBreathMethod("QCTP-B1").cadence, -1),
    ).toThrow(RangeError);
  });

  it("reduces volume before changing cadence, then returns to natural breathing if needed", () => {
    const selection = ready();
    expect(
      createBreathAdjustment(selection, "air_hunger", now, false),
    ).toMatchObject({ action: "reduce_volume" });
    expect(
      createBreathAdjustment(selection, "air_hunger", now, true),
    ).toMatchObject({
      action: "change_cadence",
      cadence: { kind: "timed", inhaleSeconds: 5, exhaleSeconds: 5 },
    });
    const balanced = ready({ goal: "focus" });
    expect(
      createBreathAdjustment(balanced, "air_hunger", now, true),
    ).toMatchObject({
      action: "return_to_natural_breathing",
      cadence: { kind: "natural" },
    });
  });

  it("stops rather than adapting through dizziness", () => {
    expect(createBreathAdjustment(ready(), "dizziness", now)).toMatchObject({
      action: "stop_session",
      cadence: null,
    });
  });

  it("selects the strongest passing calibration result and rejects symptomatic trials", () => {
    const base = {
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
    expect(
      selectPassingCalibrationTrial([
        { ...base, cadenceLabel: "4/6", calm: 5, dizziness: true },
        { ...base, cadenceLabel: "5/5", clarity: 5 },
        { ...base, cadenceLabel: "natural", calm: 2 },
      ])?.cadenceLabel,
    ).toBe("5/5");
    expect(
      selectPassingCalibrationTrial([
        { ...base, cadenceLabel: "4/6", airHunger: 2 },
      ]),
    ).toBeNull();
  });

  it("parses saved profile and session records without granting timer-based state credit", () => {
    const profile = BreathProfileSchema.parse({
      schemaVersion: 1,
      id: "breath-profile",
      calmMethod: "QCTP-B1",
      focusMethod: "QCTP-B3",
      sleepMethod: "natural",
      acuteResetMethod: "physiological_sigh_then_QCTP-B1",
      comfortableMethodIds: ["QCTP-B1", "QCTP-B3"],
      calibrationTrials: [],
      accessibility: {
        visualPacer: true,
        audioTones: true,
        haptics: true,
        dimScreen: false,
        silentPacing: false,
      },
      createdAt: now,
      updatedAt: now,
    });
    expect(profile.focusMethod).toBe("QCTP-B3");

    const selection = ready();
    const record = {
      schemaVersion: 1,
      id: "breath-session-1",
      goal: "calm_coherence",
      context: "general",
      selection,
      startedAt: now,
      endedAt: now,
      plannedDurationSeconds: 300,
      completedDurationSeconds: 300,
      initialState: {
        activation: 3,
        sleepiness: 1,
        calm: 1,
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
      rawObservation: "Jaw effort decreased.",
      interpretation: "The cadence may be useful in the morning.",
      status: "completed",
      stateCapabilityCreditGranted: false,
      updatedAt: now,
    } as const;
    expect(
      BreathSessionRecordSchema.parse(record).completedDurationSeconds,
    ).toBe(300);
    expect(() =>
      BreathSessionRecordSchema.parse({
        ...record,
        stateCapabilityCreditGranted: true,
      }),
    ).toThrow();
  });
});
