import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { PracticeSession } from "../domain";

import { deleteQctpDatabase } from "./db";
import { createQctpRepository, type QctpRepository } from "./repository";

const startedAt = "2026-08-22T10:00:00.000Z";
const endedAt = "2026-08-22T10:25:00.000Z";
let databaseName: string;
let repository: QctpRepository;

function session(id: string): PracticeSession {
  return {
    schemaVersion: 1,
    id,
    practiceId: "foundation-day1-source-rev0-voice-free",
    foundationDay: 1,
    scriptId: "QCTP-D1-SOURCE-LABELED-SCRIPT-CANDIDATE-REV0",
    scriptSha256:
      "2649ce70e5ab824dbc6b797e07082567fda2443962016e8e6c7dbe454f5ee555",
    startedAt,
    endedAt,
    elapsedMs: 1_500_000,
    completionMode: "VOICE_FREE_FALLBACK",
    supportMode: "ambient",
    sourceSequence: ["Bullard", "HeartMath", "Dispenza", "QCTP return"],
    heartMathBreath:
      "approximately five seconds in / five seconds out or comfortable; no hold",
    naturalCompletion: true,
    narrationUsed: false,
    narratedContentAcceptance: "NOT_APPLICABLE",
    stateAttainment: "NOT_ASSESSED",
    debrief: null,
    createdAt: endedAt,
  };
}

beforeEach(async () => {
  databaseName = `qctp-practice-session-${crypto.randomUUID()}`;
  repository = await createQctpRepository({ name: databaseName });
});

afterEach(async () => {
  repository.close();
  await deleteQctpDatabase(databaseName);
});

describe("Voice-Free practice persistence", () => {
  it("stores fallback completion separately from state and narration acceptance", async () => {
    const saved = await repository.savePracticeSession(session("practice-1"));
    expect(saved).toMatchObject({
      completionMode: "VOICE_FREE_FALLBACK",
      narrationUsed: false,
      narratedContentAcceptance: "NOT_APPLICABLE",
      stateAttainment: "NOT_ASSESSED",
    });
    expect(await repository.getPracticeSession(saved.id)).toEqual(saved);
    expect(await repository.listPracticeSessions()).toEqual([saved]);
  });

  it("includes practice sessions in the distinct Rev3 export/import envelope", async () => {
    await repository.initializeDefaults(startedAt);
    await repository.savePracticeSession(session("practice-export"));
    const snapshot = await repository.readSnapshot(endedAt);
    expect(snapshot.practiceSessions).toHaveLength(1);

    const importedName = `qctp-practice-import-${crypto.randomUUID()}`;
    const imported = await createQctpRepository({ name: importedName });
    try {
      await imported.importSnapshot(snapshot);
      expect(await imported.listPracticeSessions()).toEqual(
        snapshot.practiceSessions,
      );
    } finally {
      imported.close();
      await deleteQctpDatabase(importedName);
    }
  });

  it("persists a deferred or completed raw-observation debrief without changing completion credit", async () => {
    await repository.initializeDefaults(startedAt);
    await repository.savePracticeSession({
      ...session("practice-debrief"),
      debrief: {
        status: "pending",
        recordId: null,
        updatedAt: endedAt,
        remindAt: null,
        promptVersion: "RAW_OBSERVATION_REV0",
      },
    });
    const reminderAt = "2026-08-22T11:00:00.000Z";
    const deferred = await repository.transitionPracticeDebrief(
      "practice-debrief",
      {
        to: "remind_later",
        occurredAt: endedAt,
        remindAt: reminderAt,
      },
    );
    expect(deferred.debrief).toMatchObject({
      status: "remind_later",
      remindAt: reminderAt,
    });
    const completed = await repository.acceptTypedPracticeDebrief(
      "practice-debrief",
      "Warmth was directly noticeable in the center of my chest.",
      reminderAt,
    );
    expect(completed).toMatchObject({
      practiceSession: {
        naturalCompletion: true,
        stateAttainment: "NOT_ASSESSED",
        debrief: {
          status: "completed",
          recordId: "practice-debrief:practice-debrief",
        },
      },
      record: {
        interpretation: null,
        sessionId: "practice-debrief",
      },
    });
    expect(
      await repository.acceptTypedPracticeDebrief(
        "practice-debrief",
        "Warmth was directly noticeable in the center of my chest.",
        reminderAt,
      ),
    ).toEqual(completed);
    expect(
      (await repository.getFoundationState())?.completion["1"]?.morning,
    ).not.toBe(true);
  });

  it("commits the practice evidence and Foundation morning flag atomically", async () => {
    await repository.initializeDefaults(startedAt);
    const current = await repository.getFoundationState();
    const currentSettings = await repository.getSettings();
    if (!current || !currentSettings)
      throw new Error("Foundation or settings default is missing");
    await repository.saveSettings({
      ...currentSettings,
      lastVoiceFreeIssue: {
        code: "EARLY_USER_END",
        message: "Practice ended before the complete return.",
        occurredAt: startedAt,
        elapsedMs: 120_000,
        supportMode: "ambient",
        completionCreditGranted: false,
        stateCapabilityCreditGranted: false,
      },
      updatedAt: startedAt,
    });
    const foundation = {
      ...current,
      completion: {
        ...current.completion,
        "1": { ...current.completion["1"]!, morning: true },
      },
      updatedAt: endedAt,
    };
    await repository.savePracticeSessionAndFoundation(
      session("practice-atomic"),
      foundation,
      {
        ...currentSettings,
        lastVoiceFreeIssue: null,
        updatedAt: endedAt,
      },
    );
    expect(
      await repository.getPracticeSession("practice-atomic"),
    ).toBeDefined();
    expect(
      (await repository.getFoundationState())?.completion["1"]?.morning,
    ).toBe(true);
    expect((await repository.getSettings())?.lastVoiceFreeIssue).toBeNull();

    await expect(
      repository.savePracticeSessionAndFoundation(session("practice-invalid"), {
        ...foundation,
        updatedAt: "not-an-iso-date",
      }),
    ).rejects.toThrow();
    expect(
      await repository.getPracticeSession("practice-invalid"),
    ).toBeUndefined();

    await expect(
      repository.savePracticeSessionAndFoundation(
        session("practice-invalid-settings"),
        foundation,
        {
          ...currentSettings,
          lastVoiceFreeIssue: {
            code: "EARLY_USER_END",
            message: "Invalid timestamp must fail before transaction.",
            occurredAt: "not-an-iso-date",
            elapsedMs: 1,
            supportMode: "ambient",
            completionCreditGranted: false,
            stateCapabilityCreditGranted: false,
          },
        },
      ),
    ).rejects.toThrow();
    expect(
      await repository.getPracticeSession("practice-invalid-settings"),
    ).toBeUndefined();
  });
});
