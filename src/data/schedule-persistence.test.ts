import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { exportJson, importJson } from "../export-import";

import {
  createQctpRepository,
  deleteQctpDatabase,
  type QctpRepository,
} from "./index";

const now = "2026-08-22T09:00:00.000Z";
let sourceName: string;
let targetName: string;
let source: QctpRepository;
let target: QctpRepository | null;

beforeEach(async () => {
  sourceName = `qctp-schedule-source-${crypto.randomUUID()}`;
  targetName = `qctp-schedule-target-${crypto.randomUUID()}`;
  source = await createQctpRepository({ name: sourceName });
  await source.initializeDefaults(now);
  target = null;
});

afterEach(async () => {
  source.close();
  target?.close();
  await Promise.all([
    deleteQctpDatabase(sourceName),
    deleteQctpDatabase(targetName),
  ]);
});

describe("local schedule persistence", () => {
  it("serializes concurrent preference changes without clobbering either field", async () => {
    await Promise.all([
      source.updateReminderPreferences(
        (current) => ({ ...current, middayLocalTime: "12:30" }),
        "2026-08-22T09:01:00.000Z",
      ),
      source.updateReminderPreferences(
        (current) => ({ ...current, eveningLocalTime: "19:15" }),
        "2026-08-22T09:02:00.000Z",
      ),
    ]);

    expect((await source.getSettings())?.reminderPreferences).toMatchObject({
      middayLocalTime: "12:30",
      eveningLocalTime: "19:15",
    });
  });

  it("survives close/reopen and a validated JSON merge", async () => {
    await source.updateReminderPreferences(
      (current) => ({
        ...current,
        middayLocalTime: "12:30",
        highestObservedProgramDate: "2026-08-22",
        receipts: [
          {
            id: "foundation-day-1/foundation-day1-morning/04:00",
            assignmentId: "foundation-day1-morning",
            programDate: "2026-08-22",
            scheduledLocalTime: "04:00",
            firstSeenAt: now,
            notificationAttemptedAt: null,
            outcome: "DUE_VISIBLE",
          },
        ],
      }),
      now,
    );
    const exported = await exportJson(source);
    source.close();
    source = await createQctpRepository({ name: sourceName });
    expect(
      (await source.getSettings())?.reminderPreferences.receipts,
    ).toHaveLength(1);

    target = await createQctpRepository({ name: targetName });
    await target.initializeDefaults(now);
    await importJson(target, exported, { mode: "merge" });
    expect((await target.getSettings())?.reminderPreferences).toMatchObject({
      middayLocalTime: "12:30",
      highestObservedProgramDate: "2026-08-22",
      receipts: [
        expect.objectContaining({
          assignmentId: "foundation-day1-morning",
          outcome: "DUE_VISIBLE",
        }),
      ],
    });
  });
});
