import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  BreathProfileSchema,
  createDefaultBreathProfile,
  normalizeBreathProfile,
  selectBreathProtocol,
  type BreathSessionRecord,
} from "../breath";
import { exportJson, importJson, parseQctpJson } from "../export-import";
import type { StateCapabilityRecord, StateSessionRecord } from "../state-atlas";

import { deleteQctpDatabase } from "./db";
import { createQctpRepository, type QctpRepository } from "./repository";

const now = "2026-08-22T12:00:00.000Z";
const later = "2026-08-22T13:00:00.000Z";

let databaseName: string;
let repository: QctpRepository;

function breathSession(
  id: string,
  goal: "calm_coherence" | "focus" = "calm_coherence",
  startedAt = now,
): BreathSessionRecord {
  const selection = selectBreathProtocol({
    goal,
    context: "general",
    activation: 2,
    sleepiness: 1,
    airHungerAtRest: 0,
    availableMinutes: 5,
    posture: "seated",
    hazard: "none",
    comfortableMethodIds: [],
  });
  if (selection.status !== "ready") {
    throw new Error("Breath test fixture unexpectedly blocked");
  }
  return {
    schemaVersion: 1,
    id,
    goal,
    context: "general",
    foundationSessionId: null,
    selection,
    startedAt,
    endedAt: later,
    plannedDurationSeconds: selection.plannedDurationSeconds ?? 0,
    completedDurationSeconds: selection.plannedDurationSeconds ?? 0,
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
    rawObservation: "Breathing became quieter.",
    interpretation: "This cadence may be useful again.",
    status: "completed",
    stateCapabilityCreditGranted: false,
    updatedAt: later,
  };
}

function stateSession(id: string, endedAt = later): StateSessionRecord {
  return {
    schemaVersion: 1,
    id,
    stateId: "Q1",
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
      text: "Jaw and shoulder effort decreased.",
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
    sessionRevision: "Q1-REV0",
    startedAt: now,
    posture: "seated",
    breathMethod: "QCTP-B1",
    capabilityBefore: null,
    capabilityAfter: "Introduced",
    nextPermittedSessionIds: ["Q1-TEACH"],
    saveStatus: "saved",
    updatedAt: endedAt,
  };
}

function capability(
  id: string,
  evidenceSessionId: string,
): StateCapabilityRecord {
  return {
    schemaVersion: 1,
    id,
    stateId: "Q1",
    level: "Introduced",
    achievedAt: later,
    evidenceAttemptIds: [evidenceSessionId],
    transitions: [
      {
        from: null,
        to: "Introduced",
        achievedAt: later,
        evidenceAttemptIds: [evidenceSessionId],
      },
    ],
    updatedAt: later,
  };
}

beforeEach(async () => {
  databaseName = `qctp-breath-state-${crypto.randomUUID()}`;
  repository = await createQctpRepository({ name: databaseName });
});

afterEach(async () => {
  repository.close();
  await deleteQctpDatabase(databaseName);
});

describe("Breath profile defaults and compatibility", () => {
  it("creates canonical zero-cost defaults with complete Quick Director preferences", () => {
    const profile = createDefaultBreathProfile(now);
    expect(profile).toMatchObject({
      id: "breath-profile",
      calmMethod: "QCTP-B1",
      focusMethod: "QCTP-B3",
      sleepMethod: "QCTP-B1",
      quickDirector: {
        director: {
          goal: "calm_coherence",
          context: "general",
          activation: 2,
          sleepiness: 1,
          airHungerAtRest: 0,
          availableMinutes: 5,
          posture: "seated",
          hazard: "none",
        },
        cues: { localTones: true },
      },
    });
    expect(profile.quickDirector.cues.localTones).toBe(
      profile.accessibility.audioTones,
    );
    expect(profile.comfortableMethodIds).toEqual([]);
  });

  it("initializes the Breath profile and controlled paths once without overwriting progress", async () => {
    await repository.initializeDefaults(now);
    await repository.initializeDefaults(later);

    const profile = await repository.getBreathProfile("breath-profile");
    expect(profile).toEqual(createDefaultBreathProfile(now));
    expect(await repository.listBreathProfiles()).toHaveLength(1);

    const breathPath = await repository.getPath("breath-foundations");
    expect(breathPath).toMatchObject({
      pathType: "skill",
      totalModules: 7,
      releasedModuleIds: [
        "BREATH-01",
        "BREATH-02",
        "BREATH-03",
        "BREATH-04",
        "BREATH-05",
        "BREATH-06",
        "BREATH-07",
      ],
    });
    const campbellPath = await repository.getPath("thomas-campbell");
    expect(campbellPath).toMatchObject({
      pathType: "source",
      totalModules: 10,
      releasedModuleIds: ["TC-01", "TC-02", "TC-04", "TC-05", "TC-06"],
    });
    if (!campbellPath) throw new Error("Thomas Campbell path is missing");
    const progressed = await repository.savePath({
      ...campbellPath,
      currentModule: 2,
      completedModuleIds: ["TC-01"],
      updatedAt: later,
    });
    await repository.initializeDefaults("2026-08-22T14:00:00.000Z");
    expect(await repository.getPath("thomas-campbell")).toEqual(progressed);

    if (!profile) throw new Error("Breath profile is missing");
    const customized = await repository.saveBreathProfile({
      ...profile,
      quickDirector: {
        ...profile.quickDirector,
        director: { ...profile.quickDirector.director, goal: "focus" },
      },
      updatedAt: later,
    });
    await repository.initializeDefaults("2026-08-22T15:00:00.000Z");
    expect(await repository.getBreathProfile(profile.id)).toEqual(customized);
  });

  it("upgrades additive schemaVersion-1 profiles and maps local tones safely", () => {
    const current = createDefaultBreathProfile(now);
    const legacy = { ...current } as Record<string, unknown>;
    delete legacy.quickDirector;
    legacy.accessibility = {
      ...current.accessibility,
      audioTones: false,
    };

    const parsed = BreathProfileSchema.parse(legacy);
    expect(parsed.quickDirector.director.goal).toBe("calm_coherence");
    expect(parsed.quickDirector.cues.localTones).toBe(false);

    const normalized = normalizeBreathProfile({
      ...current,
      quickDirector: {
        ...current.quickDirector,
        cues: { ...current.quickDirector.cues, localTones: false },
      },
    });
    expect(normalized.accessibility.audioTones).toBe(false);
  });
});

describe("Breath and State repository CRUD", () => {
  it("creates, updates, lists, filters, and deletes Breath profiles and sessions", async () => {
    const initial = await repository.saveBreathProfile(
      createDefaultBreathProfile(now),
    );
    const updated = await repository.saveBreathProfile({
      ...initial,
      quickDirector: {
        ...initial.quickDirector,
        director: {
          ...initial.quickDirector.director,
          goal: "focus",
          availableMinutes: 3,
        },
        cues: { ...initial.quickDirector.cues, localTones: false },
      },
      updatedAt: later,
    });
    expect(updated.quickDirector.director.goal).toBe("focus");
    expect(updated.accessibility.audioTones).toBe(false);
    expect(await repository.getBreathProfile(updated.id)).toEqual(updated);
    expect(await repository.listBreathProfiles()).toEqual([updated]);

    const calm = await repository.saveBreathSession(
      breathSession("breath-calm"),
    );
    const focus = await repository.saveBreathSession(
      breathSession("breath-focus", "focus", later),
    );
    expect(await repository.getBreathSession(calm.id)).toEqual(calm);
    expect(await repository.listBreathSessions()).toEqual([focus, calm]);
    expect(await repository.listBreathSessions("focus")).toEqual([focus]);

    const interrupted = await repository.saveBreathSession({
      ...breathSession("breath-foundation-interrupted"),
      foundationSessionId: "BREATH-01",
      endedAt: null,
      completedDurationSeconds: 45,
      status: "interrupted",
    });
    const pending = await repository.saveBreathSession({
      ...breathSession("breath-foundation-pending", "focus", later),
      foundationSessionId: "BREATH-01",
      status: "save_pending",
    });
    expect(await repository.listBreathFoundationSessions("BREATH-01")).toEqual([
      pending,
      interrupted,
    ]);

    await repository.deleteBreathSession(calm.id);
    await repository.deleteBreathProfile(updated.id);
    expect(await repository.getBreathSession(calm.id)).toBeUndefined();
    expect(await repository.getBreathProfile(updated.id)).toBeUndefined();
  });

  it("preserves state evidence integrity across session and capability CRUD", async () => {
    const session = await repository.saveStateSession(
      stateSession("state-session-1"),
    );
    const savedCapability = await repository.saveStateCapability(
      capability("state-capability-Q1", session.id),
    );
    expect(await repository.getStateSession(session.id)).toEqual(session);
    expect(await repository.listStateSessions("Q1")).toEqual([session]);
    expect(await repository.getStateCapabilityByStateId("Q1")).toEqual(
      savedCapability,
    );
    expect(await repository.listStateCapabilities()).toEqual([savedCapability]);

    await expect(repository.deleteStateSession(session.id)).rejects.toThrow(
      /is evidence for capability/,
    );
    await expect(
      repository.saveStateCapability(
        capability("different-capability-id", session.id),
      ),
    ).rejects.toThrow(/already has capability record/);
    await expect(
      repository.saveStateCapability(
        capability("state-capability-Q1", "missing-session"),
      ),
    ).rejects.toThrow(/requires matching session/);

    await repository.deleteStateCapability(savedCapability.id);
    await repository.deleteStateSession(session.id);
    expect(
      await repository.getStateCapability(savedCapability.id),
    ).toBeUndefined();
    expect(await repository.getStateSession(session.id)).toBeUndefined();
  });
});

describe("snapshot, JSON, and import preservation", () => {
  it("round-trips all Breath and State records through controlled JSON", async () => {
    await repository.initializeDefaults(now);
    const profile = await repository.saveBreathProfile(
      createDefaultBreathProfile(now),
    );
    const breath = await repository.saveBreathSession(
      breathSession("breath-export"),
    );
    const state = await repository.saveStateSession(
      stateSession("state-export"),
    );
    const stateCapability = await repository.saveStateCapability(
      capability("capability-export", state.id),
    );

    const json = await exportJson(repository);
    const targetName = `qctp-breath-state-import-${crypto.randomUUID()}`;
    const target = await createQctpRepository({ name: targetName });
    try {
      await target.saveBreathSession(breathSession("replace-me"));
      await importJson(target, json, { mode: "replace" });
      expect(await target.listBreathProfiles()).toEqual([profile]);
      expect(await target.listBreathSessions()).toEqual([breath]);
      expect(await target.listStateSessions()).toEqual([state]);
      expect(await target.listStateCapabilities()).toEqual([stateCapability]);
      expect(await target.getBreathSession("replace-me")).toBeUndefined();
    } finally {
      target.close();
      await deleteQctpDatabase(targetName);
    }
  });

  it("parses pre-v5 JSON with empty additive Breath and State collections", async () => {
    await repository.initializeDefaults(now);
    const value = JSON.parse(await exportJson(repository)) as Record<
      string,
      unknown
    >;
    delete value.breathProfiles;
    delete value.breathSessions;
    delete value.stateSessions;
    delete value.stateCapabilities;

    await expect(parseQctpJson(JSON.stringify(value))).resolves.toMatchObject({
      breathProfiles: [],
      breathSessions: [],
      stateSessions: [],
      stateCapabilities: [],
    });
  });

  it("rejects broken capability evidence before a replace transaction can clear data", async () => {
    const state = await repository.saveStateSession(
      stateSession("state-atomic-source"),
    );
    await repository.saveStateCapability(
      capability("capability-atomic-source", state.id),
    );
    const invalid = {
      ...(await repository.readSnapshot(later)),
      stateSessions: [],
    };

    const targetName = `qctp-state-atomic-${crypto.randomUUID()}`;
    const target = await createQctpRepository({ name: targetName });
    try {
      const preserved = await target.saveBreathProfile(
        createDefaultBreathProfile(now),
      );
      await expect(
        target.importSnapshot(invalid, { mode: "replace" }),
      ).rejects.toThrow(/requires matching session/);
      expect(await target.getBreathProfile(preserved.id)).toEqual(preserved);
    } finally {
      target.close();
      await deleteQctpDatabase(targetName);
    }
  });

  it("rejects semantic capability inflation before an import transaction can clear data", async () => {
    const state = await repository.saveStateSession(
      stateSession("state-forged-transferable"),
    );
    const snapshot = await repository.readSnapshot(later);
    const forged: StateCapabilityRecord = {
      schemaVersion: 1,
      id: "capability-forged-transferable",
      stateId: "Q1",
      level: "Transferable",
      achievedAt: state.endedAt,
      evidenceAttemptIds: [state.id],
      transitions: [
        {
          from: null,
          to: "Transferable",
          achievedAt: state.endedAt,
          evidenceAttemptIds: [state.id],
        },
      ],
      updatedAt: state.endedAt,
    };
    const targetName = `qctp-state-semantic-atomic-${crypto.randomUUID()}`;
    const target = await createQctpRepository({ name: targetName });
    try {
      const preserved = await target.saveBreathProfile(
        createDefaultBreathProfile(now),
      );
      await expect(
        importJson(
          target,
          JSON.stringify({ ...snapshot, stateCapabilities: [forged] }),
          { mode: "replace" },
        ),
      ).rejects.toThrow(/null -> Introduced|ordered transition/i);
      expect(await target.getBreathProfile(preserved.id)).toEqual(preserved);
      expect(await target.listStateCapabilities()).toEqual([]);
    } finally {
      target.close();
      await deleteQctpDatabase(targetName);
    }
  });
});
