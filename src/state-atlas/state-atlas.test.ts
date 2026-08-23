import { describe, expect, it } from "vitest";

import {
  CAPABILITY_LEVELS,
  STATE_ATLAS,
  STATE_PRACTICE_RECIPES,
  StateAttemptSchema,
  StateDefinitionSchema,
  StateSessionRecordSchema,
  TRAINING_PROCESS_PHASES,
  evaluateCapabilityProgression,
  evaluateMarkerGate,
  evaluatePrerequisites,
  getStateDefinition,
  getStatePracticeRecipe,
  nextTrainingProcessPhase,
  assertValidStateCapabilityLedger,
  recommendedGuidanceTier,
  type CapabilitySnapshot,
  type StateAttempt,
  type StateCapabilityRecord,
  type StateId,
  type StateSessionRecord,
  type TrainingPhaseCheckpoint,
} from "./index";

const baseTime = Date.parse("2026-08-22T12:00:00.000Z");

function markerScores(stateId: StateId, score = 2): Record<string, number> {
  return Object.fromEntries(
    getStateDefinition(stateId)
      .targetMarkers.slice(0, 2)
      .map((marker) => [marker.id, score]),
  );
}

function attempt(
  stateId: StateId,
  sequence: number,
  overrides: Partial<StateAttempt> = {},
): StateAttempt {
  const recordedAt = new Date(baseTime + sequence * 60_000).toISOString();
  return {
    id: `${stateId}-attempt-${sequence}`,
    stateId,
    endedAt: recordedAt,
    guidanceTier: "Coach",
    context:
      getStateDefinition(stateId).permittedContexts[0] ?? "state_training",
    timeContext: "morning",
    mechanicsUnderstood: true,
    mechanicsCorrect: true,
    safetyStopOccurred: false,
    safeAndOriented: true,
    markerScores: markerScores(stateId),
    alertness: 3,
    effort: 1,
    fearAnxiety: 0,
    physicalComfort: 3,
    memoryContinuity: 3,
    guidanceDependence: 2,
    airHunger: 0,
    recoveryTimeAfterDistractionSeconds: 5,
    elapsedSessionSeconds: 600,
    continuousTargetStateSeconds:
      getStateDefinition(stateId).minimumContinuousSecondsForStabilized,
    completedTimer: true,
    soleEvidenceWasUnusualSensation: false,
    primaryFailureMode: "capture",
    correctionUsed: "return_to_anchor",
    functionalTaskAttempted: null,
    functionalTaskCompleted: false,
    retainedStateDuringTask: false,
    rawObservation: {
      text: "A raw observed session record.",
      recordedAt,
    },
    interpretation: null,
    outcomeFeedback: null,
    returnedSafely: true,
    orientedAfterReturn: true,
    blinded: false,
    feedbackScored: false,
    coherentEpisodeRecord: false,
    stableEnoughForUse: false,
    ...overrides,
  };
}

function functionalAttempt(
  stateId: StateId,
  sequence: number,
  overrides: Partial<StateAttempt> = {},
): StateAttempt {
  const rawTime = new Date(baseTime + sequence * 60_000).toISOString();
  const interpretationTime = new Date(
    baseTime + sequence * 60_000 + 1_000,
  ).toISOString();
  return attempt(stateId, sequence, {
    functionalTaskAttempted: "one controlled task",
    functionalTaskCompleted: true,
    retainedStateDuringTask: true,
    rawObservation: { text: "A raw observed marker.", recordedAt: rawTime },
    interpretation: {
      text: "A separate interpretation.",
      recordedAt: interpretationTime,
    },
    stableEnoughForUse: true,
    ...overrides,
  });
}

describe("controlled State Atlas", () => {
  it("exposes the exact process, guidance, and reliability vocabulary", () => {
    expect(TRAINING_PROCESS_PHASES).toEqual([
      "PREPARE",
      "INDUCE",
      "RECOGNIZE",
      "STABILIZE",
      "USE",
      "EXIT",
      "RECORD",
      "ADAPT",
    ]);
    expect(CAPABILITY_LEVELS).toEqual([
      "Introduced",
      "Accessed",
      "Stabilized",
      "Functional",
      "Transferable",
    ]);
    expect([
      recommendedGuidanceTier(null),
      recommendedGuidanceTier("Accessed"),
      recommendedGuidanceTier("Stabilized"),
      recommendedGuidanceTier("Functional"),
    ]).toEqual(["Teach", "Coach", "Test", "Independent"]);
  });

  it("contains the complete controlled state map without collapsing source labels", () => {
    expect(STATE_ATLAS.map((state) => state.id)).toEqual([
      "Q0",
      "Q1",
      "Q2",
      "Q3",
      "Q4",
      "Q5",
      "TC-PC",
      "M-F10",
      "M-F12",
      "QR",
      "QO",
      "QI",
    ]);
    expect(getStateDefinition("TC-PC")).toMatchObject({
      contentClass: "QCTP_ORIGINAL",
      recipeContentRef: {
        authorityKey: "state.recipe.TC-PC",
        contentClass: "QCTP_ORIGINAL",
      },
      sourceTargetContentRef: {
        authorityKey: "state.target.TC-PC",
        contentClass: "SOURCE_FAITHFUL",
      },
      sourceRelationship: "source_specific_target",
    });
    for (const stateId of ["M-F10", "M-F12"] as const) {
      expect(getStateDefinition(stateId)).toMatchObject({
        recipeContentRef: {
          authorityKey: `state.recipe.${stateId}`,
          contentClass: "QCTP_ORIGINAL",
        },
        sourceTargetContentRef: {
          authorityKey: `state.target.${stateId}`,
          contentClass: "SOURCE_FAITHFUL",
        },
      });
      expect(getStateDefinition(stateId).sourceLabel).toMatch(/Monroe/i);
    }
    expect(getStateDefinition("QR")).toMatchObject({
      contentClass: "QCTP_SYNTHESIS",
      sourceRelationship: "experimental_protocol",
      functionalMinimumAttempts: 10,
      functionalRequiresBlinding: true,
      functionalRequiresFeedback: true,
    });
    expect(getStateDefinition("Q4").contentClass).toBe("QCTP_SYNTHESIS");
    expect(getStateDefinition("Q5").contentClass).toBe("QCTP_SYNTHESIS");
    expect(getStateDefinition("QO").contentClass).toBe("QCTP_ORIGINAL");
    expect(getStateDefinition("QI").contentClass).toBe("QCTP_ORIGINAL");
  });

  it("requires source-target identity separately from the runnable recipe identity", () => {
    const sourceSpecific = getStateDefinition("TC-PC");
    expect(() =>
      StateDefinitionSchema.parse({
        ...sourceSpecific,
        sourceTargetContentRef: null,
      }),
    ).toThrow(/CONTROLLED_CONTENT_TARGET_REQUIRED/u);
    expect(() =>
      StateDefinitionSchema.parse({
        ...sourceSpecific,
        sourceTargetContentRef:
          getStateDefinition("M-F10").sourceTargetContentRef,
      }),
    ).toThrow(/CONTROLLED_CONTENT_PARENT_MISMATCH/u);
    expect(() =>
      StateDefinitionSchema.parse({
        ...getStateDefinition("Q1"),
        sourceTargetContentRef: sourceSpecific.sourceTargetContentRef,
      }),
    ).toThrow(/CONTROLLED_CONTENT_TARGET_NOT_APPLICABLE/u);
  });

  it("provides an instruction, timing cue, stop gate, and no-attainment contract for every state", () => {
    expect(STATE_PRACTICE_RECIPES).toHaveLength(STATE_ATLAS.length);
    for (const definition of STATE_ATLAS) {
      const recipe = getStatePracticeRecipe(definition.id);
      expect(recipe.timingIsEvidence).toBe(false);
      expect(recipe.steps.map((step) => step.phase)).toEqual([
        "PREPARE",
        "INDUCE",
        "RECOGNIZE",
        "STABILIZE",
        "USE",
        "EXIT",
        "RECORD",
        "ADAPT",
      ]);
      expect(recipe.steps.every((step) => step.durationSeconds > 0)).toBe(true);
      expect(recipe.steps.every((step) => step.instruction.length > 20)).toBe(
        true,
      );
      expect(recipe.stopConditions.join(" ")).toMatch(/dizziness|panic/i);
    }
  });

  it("enforces conjunctive prerequisites and controlled alternatives", () => {
    expect(
      evaluatePrerequisites("TC-PC", [{ stateId: "Q3", level: "Stabilized" }]),
    ).toMatchObject({ eligible: false });
    expect(
      evaluatePrerequisites("TC-PC", [
        { stateId: "Q3", level: "Stabilized" },
        { stateId: "Q4", level: "Accessed" },
      ]),
    ).toEqual({ eligible: true, unmet: [] });

    const q3: CapabilitySnapshot = { stateId: "Q3", level: "Stabilized" };
    expect(
      evaluatePrerequisites("QR", [q3, { stateId: "TC-PC", level: "Accessed" }])
        .eligible,
    ).toBe(true);
    expect(
      evaluatePrerequisites("QR", [q3, { stateId: "Q4", level: "Accessed" }])
        .eligible,
    ).toBe(true);
    expect(evaluatePrerequisites("QR", [q3]).unmet[0]).toMatch(
      /Q4 Accessed or TC-PC Accessed/,
    );
  });
});

describe("marker and capability gates", () => {
  it("requires two target markers plus mechanics, safety, alertness, and continuity", () => {
    const definition = getStateDefinition("Q1");
    expect(evaluateMarkerGate(definition, attempt("Q1", 1)).eligible).toBe(
      true,
    );
    const failed = evaluateMarkerGate(
      definition,
      attempt("Q1", 2, {
        markerScores: { quiet_breathing: 2 },
        memoryContinuity: 1,
      }),
    );
    expect(failed.eligible).toBe(false);
    expect(failed.unmet).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/At least 2 target markers/),
        expect.stringMatching(/Memory continuity/),
      ]),
    );
  });

  it("never awards Accessed from elapsed time or timer completion alone", () => {
    const elapsedOnly = attempt("Q1", 1, {
      elapsedSessionSeconds: 10_000,
      continuousTargetStateSeconds: 10_000,
      completedTimer: true,
      markerScores: {},
    });
    const evaluation = evaluateCapabilityProgression({
      stateId: "Q1",
      currentLevel: "Introduced",
      attempts: [elapsedOnly],
    });
    expect(evaluation).toMatchObject({
      recommendedLevel: "Introduced",
      advanced: false,
    });
  });

  it("uses adverse user ratings as holds rather than accepting favorable defaults", () => {
    expect(
      evaluateCapabilityProgression({
        stateId: "Q1",
        currentLevel: null,
        attempts: [attempt("Q1", 1, { fearAnxiety: 4 })],
      }).advanced,
    ).toBe(false);
    expect(
      evaluateCapabilityProgression({
        stateId: "Q1",
        currentLevel: "Introduced",
        attempts: [attempt("Q1", 2, { airHunger: 4 })],
      }).gate.unmet,
    ).toEqual(expect.arrayContaining([expect.stringMatching(/air hunger/i)]));
    expect(
      evaluateCapabilityProgression({
        stateId: "Q1",
        currentLevel: "Stabilized",
        attempts: [
          functionalAttempt("Q1", 3, {
            guidanceTier: "Test",
            guidanceDependence: 4,
          }),
        ],
      }).advanced,
    ).toBe(false);
  });

  it("awards at most one level and requires a safe mechanics attempt for Introduced", () => {
    const unsafe = evaluateCapabilityProgression({
      stateId: "Q1",
      currentLevel: null,
      attempts: [attempt("Q1", 1, { safetyStopOccurred: true })],
    });
    expect(unsafe.advanced).toBe(false);
    const introduced = evaluateCapabilityProgression({
      stateId: "Q1",
      currentLevel: null,
      attempts: [attempt("Q1", 2)],
    });
    expect(introduced).toMatchObject({
      recommendedLevel: "Introduced",
      advanced: true,
    });
  });

  it("requires three qualifying attempts in the last five plus failure/correction evidence for Stabilized", () => {
    const attempts = [
      attempt("Q1", 1),
      attempt("Q1", 2),
      attempt("Q1", 3),
      attempt("Q1", 4, { markerScores: {} }),
      attempt("Q1", 5, { markerScores: {} }),
    ];
    expect(
      evaluateCapabilityProgression({
        stateId: "Q1",
        currentLevel: "Accessed",
        attempts,
      }),
    ).toMatchObject({ recommendedLevel: "Stabilized", advanced: true });

    const displaced = [
      attempt("Q1", 1),
      attempt("Q1", 2),
      attempt("Q1", 3),
      attempt("Q1", 4, { markerScores: {} }),
      attempt("Q1", 5, { markerScores: {} }),
      attempt("Q1", 6, { markerScores: {} }),
    ];
    expect(
      evaluateCapabilityProgression({
        stateId: "Q1",
        currentLevel: "Accessed",
        attempts: displaced,
      }).advanced,
    ).toBe(false);
  });

  it("does not treat one unusual sensation as stabilization evidence", () => {
    const attempts = [1, 2, 3].map((sequence) =>
      attempt("Q1", sequence, { soleEvidenceWasUnusualSensation: true }),
    );
    expect(
      evaluateCapabilityProgression({
        stateId: "Q1",
        currentLevel: "Accessed",
        attempts,
      }).advanced,
    ).toBe(false);
  });

  it("requires retained state, raw-before-interpretation capture, and safe return for Functional", () => {
    const good = functionalAttempt("Q1", 1);
    expect(
      evaluateCapabilityProgression({
        stateId: "Q1",
        currentLevel: "Stabilized",
        attempts: [good],
      }),
    ).toMatchObject({ recommendedLevel: "Functional", advanced: true });

    const noRaw = attempt("Q1", 2, {
      functionalTaskAttempted: "one task",
      functionalTaskCompleted: true,
      retainedStateDuringTask: true,
      rawObservation: null,
      returnedSafely: true,
      orientedAfterReturn: true,
    });
    expect(
      evaluateCapabilityProgression({
        stateId: "Q1",
        currentLevel: "Stabilized",
        attempts: [noRaw],
      }).advanced,
    ).toBe(false);
  });

  it("requires ten blinded, feedback-scored records for QR Functional credit", () => {
    const capabilities: CapabilitySnapshot[] = [
      { stateId: "Q3", level: "Stabilized" },
      { stateId: "Q4", level: "Accessed" },
    ];
    const attempts = Array.from({ length: 10 }, (_, index) =>
      functionalAttempt("QR", index + 1, {
        blinded: true,
        feedbackScored: true,
        outcomeFeedback:
          "Revealed target scored against the locked raw record.",
        context: "blinded_remote_viewing",
      }),
    );
    expect(
      evaluateCapabilityProgression({
        stateId: "QR",
        currentLevel: "Stabilized",
        attempts: attempts.slice(0, 9),
        capabilities,
      }).advanced,
    ).toBe(false);
    expect(
      evaluateCapabilityProgression({
        stateId: "QR",
        currentLevel: "Stabilized",
        attempts,
        capabilities,
      }),
    ).toMatchObject({ recommendedLevel: "Functional", advanced: true });
  });

  it("requires a coherent episode record for OBE Functional credit", () => {
    const capabilities: CapabilitySnapshot[] = [
      { stateId: "M-F10", level: "Stabilized" },
    ];
    expect(
      evaluateCapabilityProgression({
        stateId: "QO",
        currentLevel: "Stabilized",
        attempts: [functionalAttempt("QO", 1)],
        capabilities,
      }).advanced,
    ).toBe(false);
    expect(
      evaluateCapabilityProgression({
        stateId: "QO",
        currentLevel: "Stabilized",
        attempts: [functionalAttempt("QO", 2, { coherentEpisodeRecord: true })],
        capabilities,
      }).advanced,
    ).toBe(true);
  });

  it("requires reduced guidance and reproduction across contexts or times for Transferable", () => {
    const same = [1, 2].map((sequence) =>
      functionalAttempt("Q1", sequence, {
        guidanceTier: "Test",
        context: "seated_morning",
        timeContext: "morning",
      }),
    );
    expect(
      evaluateCapabilityProgression({
        stateId: "Q1",
        currentLevel: "Functional",
        attempts: same,
      }).advanced,
    ).toBe(false);

    const varied = [
      same[0]!,
      functionalAttempt("Q1", 3, {
        guidanceTier: "Independent",
        context: "pre_meditation",
        timeContext: "evening",
      }),
    ];
    expect(
      evaluateCapabilityProgression({
        stateId: "Q1",
        currentLevel: "Functional",
        attempts: varied,
      }),
    ).toMatchObject({ recommendedLevel: "Transferable", advanced: true });
  });
});

describe("process and persistence contracts", () => {
  const checkpoint: TrainingPhaseCheckpoint = {
    readinessPassed: true,
    safetyStop: false,
    prerequisiteStatePresent: true,
    markerGatePassed: true,
    stateStable: true,
    functionalTaskPermitted: true,
    functionalTaskComplete: true,
    returnComplete: true,
    recordPersisted: true,
  };

  it("advances the controlled process without using elapsed time", () => {
    expect(nextTrainingProcessPhase("PREPARE", checkpoint)).toBe("INDUCE");
    expect(nextTrainingProcessPhase("INDUCE", checkpoint)).toBe("RECOGNIZE");
    expect(nextTrainingProcessPhase("RECOGNIZE", checkpoint)).toBe("STABILIZE");
    expect(nextTrainingProcessPhase("STABILIZE", checkpoint)).toBe("USE");
    expect(nextTrainingProcessPhase("USE", checkpoint)).toBe("EXIT");
    expect(nextTrainingProcessPhase("EXIT", checkpoint)).toBe("RECORD");
    expect(nextTrainingProcessPhase("RECORD", checkpoint)).toBe("ADAPT");
    expect(nextTrainingProcessPhase("ADAPT", checkpoint)).toBeNull();
  });

  it("holds, remediates, or exits when a gate is not met", () => {
    expect(
      nextTrainingProcessPhase("PREPARE", {
        ...checkpoint,
        readinessPassed: false,
      }),
    ).toBe("PREPARE");
    expect(
      nextTrainingProcessPhase("RECOGNIZE", {
        ...checkpoint,
        markerGatePassed: false,
      }),
    ).toBe("INDUCE");
    expect(
      nextTrainingProcessPhase("STABILIZE", {
        ...checkpoint,
        stateStable: false,
      }),
    ).toBe("RECOGNIZE");
    expect(
      nextTrainingProcessPhase("INDUCE", { ...checkpoint, safetyStop: true }),
    ).toBe("EXIT");
    expect(
      nextTrainingProcessPhase("RECORD", {
        ...checkpoint,
        recordPersisted: false,
      }),
    ).toBe("RECORD");
  });

  it("preserves raw observation before interpretation in saved session schemas", () => {
    const base = functionalAttempt("Q1", 1);
    const record = {
      schemaVersion: 1,
      ...base,
      sessionRevision: "Q1-REV0",
      startedAt: new Date(baseTime).toISOString(),
      posture: "seated",
      breathMethod: "QCTP-B1",
      capabilityBefore: "Stabilized",
      capabilityAfter: "Functional",
      nextPermittedSessionIds: ["Q1-REDUCED-GUIDANCE"],
      saveStatus: "saved",
      updatedAt: base.endedAt,
    } as const;
    const migrated = StateSessionRecordSchema.parse(record);
    expect(migrated.rawObservation?.text).toMatch(/raw observed/i);
    expect(migrated.contentRef).toEqual({
      authorityKey: "state.recipe.Q1",
      contentClass: "QCTP_ORIGINAL",
    });
    expect(() =>
      StateSessionRecordSchema.parse({
        ...record,
        rawObservation: null,
      }),
    ).toThrow(/separately preserved raw observation/i);
    expect(() =>
      StateSessionRecordSchema.parse({
        ...record,
        interpretation: {
          text: "Premature interpretation.",
          recordedAt: new Date(baseTime - 1_000).toISOString(),
        },
      }),
    ).toThrow(/before interpretation/i);
    expect(() =>
      StateSessionRecordSchema.parse({
        ...record,
        contentRef: {
          authorityKey: "state.recipe.Q2",
          contentClass: "QCTP_SYNTHESIS",
        },
      }),
    ).toThrow(/CONTROLLED_CONTENT_PARENT_MISMATCH/u);
  });

  it("requires an outcome record whenever feedback is marked scored", () => {
    expect(() =>
      StateAttemptSchema.parse(
        functionalAttempt("QR", 1, {
          blinded: true,
          feedbackScored: true,
          outcomeFeedback: null,
        }),
      ),
    ).toThrow(/scored feedback requires a preserved outcome record/i);
    expect(
      StateAttemptSchema.parse(
        functionalAttempt("QR", 2, {
          blinded: true,
          feedbackScored: true,
          outcomeFeedback: "Target 42: two matches, three misses; rubric 2/5.",
        }),
      ).outcomeFeedback,
    ).toMatch(/rubric 2\/5/);
  });

  it("rejects a crafted null-to-Transferable import claim", () => {
    const source = attempt("Q1", 1, {
      rawObservation: {
        text: "Breathing remained comfortable and orientation stayed clear.",
        recordedAt: new Date(baseTime + 60_000).toISOString(),
      },
    });
    const session: StateSessionRecord = {
      schemaVersion: 1,
      ...source,
      sessionRevision: "Q1-REV0",
      startedAt: new Date(baseTime).toISOString(),
      posture: "seated",
      breathMethod: "QCTP-B1",
      capabilityBefore: null,
      capabilityAfter: "Transferable",
      nextPermittedSessionIds: ["Q1-INDEPENDENT"],
      saveStatus: "saved",
      updatedAt: source.endedAt,
    };
    const forged: StateCapabilityRecord = {
      schemaVersion: 1,
      id: "forged-Q1",
      stateId: "Q1",
      level: "Transferable",
      achievedAt: source.endedAt,
      evidenceAttemptIds: [source.id],
      transitions: [
        {
          from: null,
          to: "Transferable",
          achievedAt: source.endedAt,
          evidenceAttemptIds: [source.id],
        },
      ],
      updatedAt: source.endedAt,
    };
    expect(() =>
      assertValidStateCapabilityLedger({
        sessions: [session],
        capabilities: [forged],
      }),
    ).toThrow(/null -> Introduced|ordered transition/i);
  });

  it("recomputes a structurally ordered ledger instead of trusting its final label", () => {
    const source = attempt("Q1", 1, {
      rawObservation: {
        text: "One qualifying attempt cannot establish repeated reliability.",
        recordedAt: new Date(baseTime + 60_000).toISOString(),
      },
    });
    const session: StateSessionRecord = {
      schemaVersion: 1,
      ...source,
      sessionRevision: "Q1-REV0",
      startedAt: new Date(baseTime).toISOString(),
      posture: "seated",
      breathMethod: "QCTP-B1",
      capabilityBefore: null,
      capabilityAfter: "Introduced",
      nextPermittedSessionIds: ["Q1-TEACH"],
      saveStatus: "saved",
      updatedAt: source.endedAt,
    };
    const levels = CAPABILITY_LEVELS;
    const forged: StateCapabilityRecord = {
      schemaVersion: 1,
      id: "forged-ordered-Q1",
      stateId: "Q1",
      level: "Transferable",
      achievedAt: source.endedAt,
      evidenceAttemptIds: [source.id],
      transitions: levels.map((to, index) => ({
        from: index === 0 ? null : levels[index - 1]!,
        to,
        achievedAt: source.endedAt,
        evidenceAttemptIds: [source.id],
      })),
      updatedAt: source.endedAt,
    };
    expect(() =>
      assertValidStateCapabilityLedger({
        sessions: [session],
        capabilities: [forged],
      }),
    ).toThrow(/not supported by the progression gate.*Requires 3/i);
  });
});
