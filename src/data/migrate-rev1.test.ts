import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { deleteQctpDatabase } from "./db";
import {
  fingerprintRev1Source,
  migrateRev1LocalStorage,
  migrateRev1Payload,
  parseRev1Payload,
} from "./migrate-rev1";
import { createQctpRepository } from "./repository";
import type { QctpRepository } from "./repository";

let databaseName: string;
let repository: QctpRepository;

beforeEach(async () => {
  databaseName = `qctp-migration-test-${crypto.randomUUID()}`;
  repository = await createQctpRepository({ name: databaseName });
});

afterEach(async () => {
  repository.close();
  await deleteQctpDatabase(databaseName);
});

describe("Rev1 localStorage migration", () => {
  it("accepts both the raw state and the exported Rev1 wrapper", () => {
    expect(parseRev1Payload({ currentDay: 3 }).wrapped).toBe(false);
    expect(
      parseRev1Payload({
        schema: "qctp-training-state-v1",
        appVersion: "1.1.4",
        state: { currentDay: 3 },
      }),
    ).toMatchObject({ wrapped: true, sourceSchema: "qctp-training-state-v1" });
  });

  it("preserves current day, completion, answers, logs, test/neural settings, and exact unknown source", async () => {
    const legacy = {
      currentDay: 7,
      done: { 1: { morning: true, midday: true, evening: false } },
      answers: { 1: { starting: "Tired", question: "What changes?" } },
      logs: [
        {
          type: "Remote Viewing",
          day: 1,
          timestamp: "2026-08-16T04:00:00.000Z",
          text: "Blue, cold, metallic.",
        },
      ],
      settings: {
        mode: "minimal",
        rate: 1.05,
        volume: 0.8,
        tone: 0.2,
        timing: true,
        voice: "Aaron",
        keepAwake: false,
        neuralVoice: "chill-brian",
        neuralEnabled: true,
        futureUnknownSetting: { retained: true },
      },
      test: true,
      whollyUnknown: ["exact", { nested: 42 }],
    };
    const raw = JSON.stringify(legacy);
    const storage = {
      getItem: vi.fn(() => raw),
      removeItem: vi.fn(),
    };
    const result = await migrateRev1LocalStorage(repository, storage);
    expect(result.status).toBe("migrated");
    expect(storage.removeItem).not.toHaveBeenCalled();
    expect((await repository.getFoundationState())?.currentDay).toBe(7);
    expect((await repository.getFoundationState())?.completion["1"]).toEqual({
      morning: true,
      midday: true,
      evening: false,
    });
    expect((await repository.getWorkbookState())?.answers["1"]?.starting).toBe(
      "Tired",
    );
    expect(await repository.getSettings()).toMatchObject({
      guidanceMode: "minimal",
      testMode: true,
      neuralVoice: "chill-brian",
      neuralEnabled: true,
      transcriptionRoute: "local_only",
    });
    expect((await repository.listRecords())[0]).toMatchObject({
      kind: "remote_viewing",
      observation: { text: "Blue, cold, metallic." },
    });
    const ledger = await repository.findMigrationByFingerprint(
      fingerprintRev1Source(raw),
    );
    expect(ledger?.sourceSnapshotJson).toBe(raw);
    expect(JSON.parse(ledger?.sourceSnapshotJson ?? "")).toEqual(legacy);
  });

  it("is idempotent for byte-identical sources and wrapper imports", async () => {
    const raw = JSON.stringify({
      schema: "qctp-training-state-v1",
      state: {
        currentDay: 2,
        done: {},
        answers: {},
        logs: [],
        settings: {},
        test: false,
      },
    });
    const first = await migrateRev1Payload(repository, raw, "import-file");
    const second = await migrateRev1Payload(repository, raw, "import-file");
    expect(first.status).toBe("migrated");
    expect(second.status).toBe("already_applied");
    expect(second.ledgerId).toBe(first.ledgerId);
    expect((await repository.readSnapshot()).migrationLedger).toHaveLength(1);
  });

  it("sanitizes malformed legacy fields while retaining every original byte", async () => {
    const legacy = {
      currentDay: 999,
      done: { "1": "invalid", "2": { morning: "yes", evening: true } },
      answers: {
        "1": { numeric: 42, nested: { retained: true } },
        "2": ["invalid"],
      },
      logs: [
        null,
        { type: "Missing text" },
        { type: "OBE / Focus 10", text: "body asleep", timestamp: "invalid" },
        { type: "Psionics", text: "stable construct" },
        { type: "Dream", text: "stairs" },
        { type: "Synchronicity", text: "number repeated" },
        { type: "Intuition / Reception", text: "initial impression" },
        { type: "Unclassified legacy", text: "miscellaneous" },
      ],
      settings: {
        mode: "invalid",
        rate: "not-a-number",
        volume: 9,
        tone: -1,
        timing: "yes",
        keepAwake: "yes",
        neuralEnabled: "yes",
      },
      test: "yes",
    };
    const raw = JSON.stringify(legacy);
    const result = await migrateRev1Payload(
      repository,
      raw,
      "malformed-source",
      "2026-08-17T13:00:00.000Z",
    );
    expect(result.warnings).toEqual(
      expect.arrayContaining([
        "Legacy completion for day 1 was not an object.",
        "Legacy workbook answers for day 2 were not an object.",
        "Legacy log 0 was not an object.",
        "Legacy log 1 did not contain text.",
      ]),
    );
    expect((await repository.getFoundationState())?.currentDay).toBe(112);
    expect((await repository.getWorkbookState())?.answers["1"]).toEqual({
      numeric: "42",
      nested: '{"retained":true}',
    });
    expect(
      new Set((await repository.listRecords()).map((record) => record.kind)),
    ).toEqual(
      new Set([
        "obe",
        "psionics",
        "dream",
        "synchronicity",
        "intuition",
        "source_note",
      ]),
    );
    expect(await repository.getSettings()).toMatchObject({
      guidanceMode: "guided",
      speechRate: 0.9,
      voiceVolume: 1,
      toneVolume: 0,
      testMode: false,
      neuralEnabled: true,
    });
    const ledger = await repository.findMigrationByFingerprint(
      fingerprintRev1Source(raw),
    );
    expect(ledger?.sourceSnapshotJson).toBe(raw);
  });

  it("rejects corrupt JSON rather than writing a partial migration", async () => {
    expect(() => parseRev1Payload("not-json")).toThrow();
    expect(() => parseRev1Payload([])).toThrow();
    await expect(migrateRev1Payload(repository, "not-json")).rejects.toThrow();
    expect((await repository.readSnapshot()).migrationLedger).toEqual([]);
  });

  it("does nothing when the legacy key is absent", async () => {
    const storage = { getItem: vi.fn(() => null) };
    await expect(
      migrateRev1LocalStorage(repository, storage),
    ).resolves.toMatchObject({
      status: "no_source",
      fingerprint: null,
    });
    expect(await repository.getFoundationState()).toBeUndefined();
  });
});
