import { describe, expect, it } from "vitest";

import { contentRefFor } from "../controlled-content";
import {
  StateCapabilityRecordSchema,
  StateSessionRecordSchema,
  type CapabilityLevel,
  type StateCapabilityRecord,
  type StateId,
  type StateSessionRecord,
} from "../state-atlas";
import {
  applyStateSourceTrackIntegrityLedger,
  assertStateSessionSourceTrackWritable,
  evaluateStateSessionSourceTrackIntegrity,
} from "./state-session-integrity";
import { sourceTrackReferenceFor } from "./registry";

const before = "2026-08-22T11:00:00.000Z";
const startedAt = "2026-08-22T12:00:00.000Z";
const endedAt = "2026-08-22T12:10:00.000Z";
const after = "2026-08-22T13:00:00.000Z";

function session(
  id: string,
  stateId: StateId,
  sourceTrackRef?: unknown,
): StateSessionRecord {
  return StateSessionRecordSchema.parse({
    schemaVersion: 1,
    id,
    stateId,
    endedAt,
    guidanceTier: "Teach",
    context: "seated_morning",
    timeContext: "morning",
    mechanicsUnderstood: true,
    mechanicsCorrect: true,
    safetyStopOccurred: false,
    safeAndOriented: true,
    markerScores: {
      quiet_breathing: 2,
      reduced_jaw_shoulder_effort: 2,
    },
    alertness: 3,
    effort: 1,
    fearAnxiety: 0,
    physicalComfort: 3,
    memoryContinuity: 3,
    guidanceDependence: 3,
    airHunger: 0,
    recoveryTimeAfterDistractionSeconds: 5,
    elapsedSessionSeconds: 420,
    continuousTargetStateSeconds: 180,
    completedTimer: true,
    soleEvidenceWasUnusualSensation: false,
    primaryFailureMode: "capture",
    correctionUsed: "return_to_anchor",
    functionalTaskAttempted: null,
    functionalTaskCompleted: false,
    retainedStateDuringTask: false,
    rawObservation: {
      text: "The mechanics were clear and the return was complete.",
      recordedAt: endedAt,
    },
    interpretation: null,
    outcomeFeedback: null,
    returnedSafely: true,
    orientedAfterReturn: true,
    blinded: false,
    feedbackScored: false,
    coherentEpisodeRecord: false,
    stableEnoughForUse: false,
    sessionRevision: `${stateId}-REV0`,
    contentRef: contentRefFor(`state.recipe.${stateId}`),
    ...(sourceTrackRef === undefined ? {} : { sourceTrackRef }),
    startedAt,
    posture: "safe supported posture",
    breathMethod: null,
    capabilityBefore: null,
    capabilityAfter: "Introduced",
    nextPermittedSessionIds: [`${stateId}-TEACH`],
    saveStatus: "saved",
    updatedAt: endedAt,
  });
}

function capability(
  id: string,
  stateId: StateId,
  level: CapabilityLevel,
  evidenceAttemptId: string,
  achievedAt = before,
): StateCapabilityRecord {
  return StateCapabilityRecordSchema.parse({
    schemaVersion: 1,
    id,
    stateId,
    level,
    achievedAt,
    evidenceAttemptIds: [evidenceAttemptId],
    transitions: [
      {
        from: null,
        to: level,
        achievedAt,
        evidenceAttemptIds: [evidenceAttemptId],
      },
    ],
    updatedAt: achievedAt,
  });
}

const heldPrerequisite = (record: StateCapabilityRecord) =>
  StateCapabilityRecordSchema.parse({
    ...record,
    sourceTrackHold: {
      status: "HELD",
      code: "SOURCE_TRACK_EVIDENCE_HELD",
      stateId: record.stateId,
      trackId: null,
      accessId: null,
      message: "Test prerequisite is held.",
    },
  });

describe("State Atlas source-track session integrity", () => {
  it("accepts route-less state evidence and rejects an unexpected binding", () => {
    const generic = session("q1-generic", "Q1");
    expect(
      evaluateStateSessionSourceTrackIntegrity({
        session: generic,
        capabilities: [],
      }),
    ).toMatchObject({ allowed: true, code: "NOT_APPLICABLE" });

    expect(
      evaluateStateSessionSourceTrackIntegrity({
        session: {
          ...generic,
          sourceTrackRef: sourceTrackReferenceFor("monroe-buhlman", "M-F10"),
        },
        capabilities: [],
      }),
    ).toMatchObject({
      allowed: false,
      code: "SOURCE_TRACK_UNEXPECTED_BINDING",
    });
  });

  it("fails closed for missing, invalid, foreign, and parentless bindings", () => {
    const unbound = session("focus-unbound", "M-F10");
    expect(
      evaluateStateSessionSourceTrackIntegrity({
        session: unbound,
        capabilities: [],
      }),
    ).toMatchObject({
      allowed: false,
      code: "SOURCE_TRACK_BINDING_REQUIRED",
    });
    expect(
      evaluateStateSessionSourceTrackIntegrity({
        session: session("focus-invalid", "M-F10", { legacy: true }),
        capabilities: [],
      }),
    ).toMatchObject({
      allowed: false,
      code: "SOURCE_TRACK_BINDING_INVALID",
    });
    expect(
      evaluateStateSessionSourceTrackIntegrity({
        session: session(
          "focus-foreign",
          "M-F10",
          sourceTrackReferenceFor("thomas-campbell", "TC-PC"),
        ),
        capabilities: [],
      }),
    ).toMatchObject({
      allowed: false,
      code: "SOURCE_TRACK_ROUTE_MISMATCH",
    });

    const bound = session(
      "focus-parentless",
      "M-F10",
      sourceTrackReferenceFor("monroe-buhlman", "M-F10"),
    );
    expect(
      evaluateStateSessionSourceTrackIntegrity({
        session: StateSessionRecordSchema.parse({
          ...bound,
          contentRef: undefined,
        }),
        capabilities: [],
      }),
    ).toMatchObject({
      allowed: false,
      code: "SOURCE_TRACK_PARENT_MISMATCH",
    });
  });

  it("requires prerequisite transitions to predate the source session and ignores held claims", () => {
    const focus = session(
      "focus-bound",
      "M-F10",
      sourceTrackReferenceFor("monroe-buhlman", "M-F10"),
    );
    const q1 = capability("cap-q1", "Q1", "Stabilized", "q1-evidence");
    const q3 = capability("cap-q3", "Q3", "Stabilized", "q3-evidence");
    expect(
      evaluateStateSessionSourceTrackIntegrity({
        session: focus,
        capabilities: [q1, q3],
      }),
    ).toMatchObject({ allowed: true, code: "ALLOWED" });

    const futureDecision = evaluateStateSessionSourceTrackIntegrity({
      session: focus,
      capabilities: [
        capability("cap-q1-future", "Q1", "Stabilized", "q1", after),
        q3,
      ],
    });
    expect(futureDecision).toMatchObject({
      allowed: false,
      code: "SOURCE_TRACK_ACCESS_DENIED",
    });
    expect(futureDecision.message).toContain("PREREQUISITES_UNMET");
    const simultaneousDecision = evaluateStateSessionSourceTrackIntegrity({
      session: focus,
      capabilities: [
        capability("cap-q1-simultaneous", "Q1", "Stabilized", "q1", startedAt),
        q3,
      ],
    });
    expect(simultaneousDecision).toMatchObject({
      allowed: false,
      code: "SOURCE_TRACK_ACCESS_DENIED",
    });
    expect(simultaneousDecision.message).toContain("PREREQUISITES_UNMET");
    const heldDecision = evaluateStateSessionSourceTrackIntegrity({
      session: focus,
      capabilities: [heldPrerequisite(q1), q3],
    });
    expect(heldDecision).toMatchObject({
      allowed: false,
      code: "SOURCE_TRACK_ACCESS_DENIED",
    });
    expect(heldDecision.message).toContain("PREREQUISITES_UNMET");
  });

  it("rejects inverted session chronology and canonicalizes an accepted source reference", () => {
    expect(
      StateSessionRecordSchema.safeParse({
        ...session("focus-inverted", "M-F10"),
        startedAt: after,
      }).success,
    ).toBe(false);

    const canonical = sourceTrackReferenceFor("monroe-buhlman", "M-F10");
    const accepted = assertStateSessionSourceTrackWritable({
      session: session("focus-normalized", "M-F10", {
        ...canonical,
        trackId: ` ${canonical.trackId} `,
        authorityIds: canonical.authorityIds.map(
          (authorityId) => ` ${authorityId} `,
        ),
        contentRefs: canonical.contentRefs.map((contentRef) => ({
          ...contentRef,
          ignoredLegacyField: "strip-me",
        })),
      }),
      capabilities: [
        capability("cap-q1", "Q1", "Stabilized", "q1"),
        capability("cap-q3", "Q3", "Stabilized", "q3"),
      ],
    });

    expect(accepted.sourceTrackRef).toEqual(canonical);
  });

  it("keeps the QR protocol read-only even when prerequisites exist", () => {
    const qr = session(
      "qr-bound",
      "QR",
      sourceTrackReferenceFor("remote-viewing", "QR"),
    );
    const decision = evaluateStateSessionSourceTrackIntegrity({
      session: qr,
      capabilities: [
        capability("cap-q3", "Q3", "Stabilized", "q3"),
        capability("cap-q4", "Q4", "Accessed", "q4"),
      ],
    });
    expect(decision).toMatchObject({
      allowed: false,
      code: "SOURCE_TRACK_ACCESS_DENIED",
    });
    expect(decision.message).toContain("ACTION_NOT_PERMITTED");
  });

  it("preserves invalid source records while withholding their capability credit", () => {
    const invalid = session("focus-invalid", "M-F10", {
      legacy: "unverified",
    });
    const claimed = capability("cap-focus", "M-F10", "Introduced", invalid.id);
    const ledger = applyStateSourceTrackIntegrityLedger({
      sessions: [invalid],
      capabilities: [claimed],
    });

    expect(ledger.sessions[0]).toMatchObject({
      sourceTrackRef: { legacy: "unverified" },
      sourceTrackHold: { code: "SOURCE_TRACK_BINDING_INVALID" },
    });
    expect(ledger.capabilities[0]).toMatchObject({
      sourceTrackHold: { code: "SOURCE_TRACK_EVIDENCE_HELD" },
    });
    expect(ledger.activeSessions).toEqual([]);
    expect(ledger.activeCapabilities).toEqual([]);
    expect(ledger.heldSessionIds).toEqual([invalid.id]);
    expect(ledger.heldCapabilityIds).toEqual([claimed.id]);
    expect(applyStateSourceTrackIntegrityLedger(ledger)).toEqual(ledger);
  });

  it("removes stale derived holds and propagates a held prerequisite transitively", () => {
    const q1 = session(
      "q1-tainted",
      "Q1",
      sourceTrackReferenceFor("monroe-buhlman", "M-F10"),
    );
    const q3 = session("q3-valid", "Q3");
    const focus = session(
      "focus-dependent",
      "M-F10",
      sourceTrackReferenceFor("monroe-buhlman", "M-F10"),
    );
    const ledger = applyStateSourceTrackIntegrityLedger({
      sessions: [q1, q3, focus],
      capabilities: [
        capability("cap-q1", "Q1", "Stabilized", q1.id),
        capability("cap-q3", "Q3", "Stabilized", q3.id),
        capability("cap-focus", "M-F10", "Introduced", focus.id),
      ],
    });
    expect(ledger.activeCapabilities.map((record) => record.id)).toEqual([
      "cap-q3",
    ]);
    expect(ledger.heldCapabilityIds).toEqual(["cap-q1", "cap-focus"]);
    expect(
      ledger.sessions.find((record) => record.id === focus.id)?.sourceTrackHold,
    ).toMatchObject({ code: "SOURCE_TRACK_ACCESS_DENIED" });

    const staleHold = StateSessionRecordSchema.parse({
      ...session("q1-stale-hold", "Q1"),
      sourceTrackHold: {
        status: "HELD",
        code: "SOURCE_TRACK_BINDING_REQUIRED",
        stateId: "Q1",
        trackId: null,
        accessId: null,
        message: "Stale derived state.",
      },
    });
    expect(
      applyStateSourceTrackIntegrityLedger({
        sessions: [staleHold],
        capabilities: [],
      }).sessions[0]?.sourceTrackHold,
    ).toBeUndefined();
  });
});
