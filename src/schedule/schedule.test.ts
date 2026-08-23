import { describe, expect, it } from "vitest";

import { createDefaultSettings } from "../domain";

import {
  deriveControlledSchedule,
  retainRecentReminderReceipts,
  CONTROLLED_DAY1_SCHEDULE,
} from "./schedule";

const emptyCompletion = { morning: false, midday: false, evening: false };

function scheduleAt(iso: string) {
  return deriveControlledSchedule({
    now: new Date(iso),
    foundationDay: 1,
    completion: emptyCompletion,
    reminders: createDefaultSettings().reminderPreferences,
    timeZone: "America/Chicago",
  });
}

describe("controlled local schedule", () => {
  it("changes the program date exactly at 04:00 local time", () => {
    const before = scheduleAt("2026-08-22T08:59:00.000Z");
    const boundary = scheduleAt("2026-08-22T09:00:00.000Z");

    expect(before.localTime).toBe("03:59");
    expect(before.programDate).toBe("2026-08-21");
    expect(before.nextProgramBoundaryDate).toBe("2026-08-22");
    expect(before.boundaryState).toBe("BEFORE_LOCAL_04_00");
    expect(boundary.localTime).toBe("04:00");
    expect(boundary.programDate).toBe("2026-08-22");
    expect(boundary.nextProgramBoundaryDate).toBe("2026-08-23");
    expect(boundary.boundaryState).toBe("AT_OR_AFTER_LOCAL_04_00");
    const after = scheduleAt("2026-08-22T09:01:00.000Z");
    expect(after.localTime).toBe("04:01");
    expect(after.boundaryState).toBe("AT_OR_AFTER_LOCAL_04_00");
  });

  it("keeps the 04:00 boundary correct across both DST transitions", () => {
    const springBefore = scheduleAt("2026-03-08T08:59:00.000Z");
    const springBoundary = scheduleAt("2026-03-08T09:00:00.000Z");
    const fallBefore = scheduleAt("2026-11-01T09:59:00.000Z");
    const fallBoundary = scheduleAt("2026-11-01T10:00:00.000Z");

    expect(springBefore.localTime).toBe("03:59");
    expect(springBefore.programDate).toBe("2026-03-07");
    expect(springBoundary.localTime).toBe("04:00");
    expect(springBoundary.programDate).toBe("2026-03-08");
    expect(fallBefore.localTime).toBe("03:59");
    expect(fallBefore.programDate).toBe("2026-10-31");
    expect(fallBoundary.localTime).toBe("04:00");
    expect(fallBoundary.programDate).toBe("2026-11-01");
  });

  it("does not invent clock times for the controlled midday or evening work", () => {
    const snapshot = scheduleAt("2026-08-22T17:00:00.000Z");
    expect(snapshot.assignments.map((assignment) => assignment.status)).toEqual(
      ["ready", "available_unscheduled", "available_unscheduled"],
    );
    expect(
      snapshot.assignments
        .slice(1)
        .map((assignment) => assignment.scheduledLocalTime),
    ).toEqual([null, null]);
  });

  it("honors optional user-selected local times and exposes missed recovery", () => {
    const settings = createDefaultSettings();
    const snapshot = deriveControlledSchedule({
      now: new Date("2026-08-22T23:30:00.000Z"),
      foundationDay: 1,
      completion: emptyCompletion,
      reminders: {
        ...settings.reminderPreferences,
        deviceNotificationsEnabled: true,
        middayLocalTime: "12:30",
        eveningLocalTime: "19:00",
      },
      timeZone: "America/Chicago",
    });

    expect(snapshot.localTime).toBe("18:30");
    expect(snapshot.assignments.map((assignment) => assignment.status)).toEqual(
      ["ready", "ready", "upcoming"],
    );
    expect(snapshot.notificationCandidates).toHaveLength(2);
    expect(snapshot.notificationCandidates[1]?.id).toBe(
      "foundation-day1-midday",
    );
  });

  it("never schedules unauthored Foundation content", () => {
    const settings = createDefaultSettings();
    const snapshot = deriveControlledSchedule({
      now: new Date("2026-08-22T17:00:00.000Z"),
      foundationDay: 2,
      completion: emptyCompletion,
      reminders: settings.reminderPreferences,
      timeZone: "America/Chicago",
    });

    expect(snapshot.contentStatus).toBe("CONTROLLED_CONTENT_HOLD");
    expect(
      snapshot.assignments.every((item) => item.status === "controlled_hold"),
    ).toBe(true);
    expect(snapshot.notificationCandidates).toEqual([]);
  });

  it("contains only the three controlled Day 1 assignments", () => {
    expect(CONTROLLED_DAY1_SCHEDULE.map((item) => item.id)).toEqual([
      "foundation-day1-morning",
      "foundation-day1-midday",
      "foundation-day1-evening",
    ]);
  });

  it("does not remind for completed work and bounds the durable delivery ledger", () => {
    const receipt = (id: string, firstSeenAt: string) => ({
      id,
      assignmentId: "foundation-day1-morning" as const,
      programDate: "2026-08-22",
      scheduledLocalTime: "04:00",
      firstSeenAt,
      notificationAttemptedAt: null,
      outcome: "DUE_VISIBLE" as const,
    });
    const a = receipt("a", "2026-08-22T09:00:00.000Z");
    const b = receipt("b", "2026-08-22T09:01:00.000Z");
    const c = receipt("c", "2026-08-22T09:02:00.000Z");
    expect(retainRecentReminderReceipts([a, b], b, 2)).toEqual([a, b]);
    expect(retainRecentReminderReceipts([a, b], c, 2)).toEqual([b, c]);
    expect(() => retainRecentReminderReceipts([], a, 0)).toThrow(
      "Reminder-receipt retention limit must be positive.",
    );
  });

  it("does not retract a released service date after a timezone move", () => {
    const settings = createDefaultSettings();
    const first = deriveControlledSchedule({
      now: new Date("2026-08-23T05:30:00.000Z"),
      foundationDay: 1,
      completion: emptyCompletion,
      reminders: settings.reminderPreferences,
      timeZone: "Pacific/Kiritimati",
    });
    const moved = deriveControlledSchedule({
      now: new Date("2026-08-23T05:31:00.000Z"),
      foundationDay: 1,
      completion: emptyCompletion,
      reminders: {
        ...settings.reminderPreferences,
        highestObservedProgramDate: first.programDate,
      },
      timeZone: "Pacific/Honolulu",
    });

    expect(first.programDate).toBe("2026-08-23");
    expect(moved.programDate).toBe(first.programDate);
    expect(moved.assignments[0]?.status).toBe("ready");
  });
});
