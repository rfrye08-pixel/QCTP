import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createQctpRepository,
  deleteQctpDatabase,
  type QctpRepository,
} from "../data";
import { selectBreathProtocol } from "./director";
import {
  createFoundationProtocol,
  createInitialFoundationProgress,
} from "./foundation-protocol";
import { recoverInterruptedBreathSessions } from "./recovery";
import type { BreathSessionRecord } from "./types";

let repository: QctpRepository;
let databaseName: string;

beforeEach(async () => {
  databaseName = `qctp-breath-recovery-${crypto.randomUUID()}`;
  repository = await createQctpRepository({ name: databaseName });
});

afterEach(async () => {
  repository.close();
  await deleteQctpDatabase(databaseName);
});

function session(status: BreathSessionRecord["status"]): BreathSessionRecord {
  const selection = selectBreathProtocol({
    goal: "calm_coherence",
    context: "general",
    activation: 2,
    sleepiness: 1,
    airHungerAtRest: 0,
    availableMinutes: 5,
    posture: "seated",
    hazard: "none",
    comfortableMethodIds: [],
  });
  if (selection.status !== "ready") throw new Error("fixture blocked");
  return {
    schemaVersion: 1,
    id: `breath-${status}`,
    goal: "calm_coherence",
    context: "general",
    foundationSessionId: "BREATH-01",
    selection,
    startedAt: "2026-08-22T10:00:00.000Z",
    endedAt: null,
    plannedDurationSeconds: 300,
    completedDurationSeconds: 42,
    initialState: {
      activation: 2,
      sleepiness: 1,
      calm: 2,
      clarity: 3,
      airHunger: 0,
    },
    finalState: null,
    adjustments: [],
    symptoms: [],
    shouldReuseForGoal: null,
    rawObservation: "",
    interpretation: "",
    status,
    stateCapabilityCreditGranted: false,
    updatedAt: "2026-08-22T10:00:42.000Z",
  };
}

describe("Breath session crash recovery", () => {
  it("marks only crash-left in-progress sessions interrupted", async () => {
    await repository.saveBreathSession(session("in_progress"));
    await repository.saveBreathSession(session("save_pending"));

    await expect(
      recoverInterruptedBreathSessions(repository, "2026-08-22T11:00:00.000Z"),
    ).resolves.toEqual(["breath-in_progress"]);
    await expect(
      repository.getBreathSession("breath-in_progress"),
    ).resolves.toMatchObject({
      status: "interrupted",
      endedAt: null,
      completedDurationSeconds: 42,
      updatedAt: "2026-08-22T11:00:00.000Z",
    });
    await expect(
      repository.getBreathSession("breath-save_pending"),
    ).resolves.toMatchObject({
      status: "save_pending",
    });
  });

  it("preserves progressive physical checkpoints and draft evidence after interruption", async () => {
    const protocol = createFoundationProtocol("BREATH-02");
    const progress = createInitialFoundationProgress(protocol);
    progress[0] = {
      ...progress[0]!,
      activePracticeMilliseconds: 180_000,
      performedAsDirected: true,
      checkpointConfirmedAt: "2026-08-22T10:03:00.000Z",
      rating: {
        cadenceLabel: protocol.segments[0]!.label,
        physicalEase: 4,
        calm: 3,
        clarity: 4,
        airHunger: 0,
        tension: 1,
        sleepiness: 1,
        emotionalShift: 2,
        desireToContinue: 4,
        dizziness: false,
        recoveryBreathRequired: false,
      },
      symptoms: ["brief shoulder effort, corrected"],
    };
    progress[1] = {
      ...progress[1]!,
      activePracticeMilliseconds: 37_000,
    };
    await repository.saveBreathSession({
      ...session("in_progress"),
      id: "breath-progressive-checkpoint",
      foundationSessionId: "BREATH-02",
      foundationProtocol: protocol,
      protocolProgress: progress,
      completedDurationSeconds: 217,
      finalState: {
        activation: 1,
        sleepiness: 1,
        calm: 4,
        clarity: 4,
        airHunger: 0,
      },
      symptoms: ["brief shoulder effort, corrected"],
      shouldReuseForGoal: false,
      rawObservation: "The first condition felt physically easy.",
      interpretation: "Comparison is unfinished.",
      checkpoint: {
        checkpointRevision: "QCTP-REV3-BREATH-CHECKPOINT-REV1",
        activePracticeMilliseconds: 217_000,
        currentSegmentId: protocol.segments[1]!.segmentId,
        savedAt: "2026-08-22T10:03:37.000Z",
      },
    });

    await recoverInterruptedBreathSessions(
      repository,
      "2026-08-22T11:00:00.000Z",
    );
    const recovered = await repository.getBreathSession(
      "breath-progressive-checkpoint",
    );
    expect(recovered).toMatchObject({
      status: "interrupted",
      completedDurationSeconds: 217,
      rawObservation: "The first condition felt physically easy.",
      interpretation: "Comparison is unfinished.",
      shouldReuseForGoal: false,
      checkpoint: {
        activePracticeMilliseconds: 217_000,
        currentSegmentId: "BREATH-02-S2",
      },
    });
    expect(
      recovered?.foundationProtocol?.segments.map((item) => item.methodId),
    ).toEqual(["QCTP-B3", "QCTP-B1"]);
    expect(recovered?.protocolProgress?.[0]).toMatchObject({
      activePracticeMilliseconds: 180_000,
      performedAsDirected: true,
      symptoms: ["brief shoulder effort, corrected"],
    });
    expect(recovered?.protocolProgress?.[1]?.activePracticeMilliseconds).toBe(
      37_000,
    );
  });
});
