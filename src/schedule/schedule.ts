import type {
  DayCompletion,
  ReminderPreferences,
  ReminderReceipt,
} from "../domain";

export const FOUNDATION_READY_LOCAL_TIME = "04:00" as const;

export type ControlledAssignmentId =
  | "foundation-day1-morning"
  | "foundation-day1-midday"
  | "foundation-day1-evening";

export type ScheduleAssignmentStatus =
  | "complete"
  | "ready"
  | "upcoming"
  | "available_unscheduled"
  | "controlled_hold";

export interface ControlledScheduleAssignment {
  id: ControlledAssignmentId;
  component: keyof DayCompletion;
  label: string;
  summary: string;
  scheduledLocalTime: string | null;
  timingAuthority: "CONTROLLED_04_00" | "USER_SELECTED_NO_SOURCE_CLOCK";
  status: ScheduleAssignmentStatus;
  reminderKey: string | null;
  notificationDue: boolean;
}

export interface ControlledScheduleSnapshot {
  localDate: string;
  localTime: string;
  programDate: string;
  nextProgramBoundaryDate: string;
  timeZone: string;
  boundaryState: "BEFORE_LOCAL_04_00" | "AT_OR_AFTER_LOCAL_04_00";
  activeFoundationDay: number;
  contentStatus: "RELEASED_DAY_1" | "CONTROLLED_CONTENT_HOLD";
  readinessLabel: string;
  assignments: readonly ControlledScheduleAssignment[];
  notificationCandidates: readonly ControlledScheduleAssignment[];
}

export interface DeriveControlledScheduleInput {
  now: Date;
  foundationDay: number;
  completion: DayCompletion;
  reminders: ReminderPreferences;
  timeZone?: string;
}

interface LocalClockParts {
  date: string;
  minutes: number;
  time: string;
  year: number;
  month: number;
  day: number;
}

const READY_MINUTES = 4 * 60;

export const CONTROLLED_DAY1_SCHEDULE = Object.freeze([
  Object.freeze({
    id: "foundation-day1-morning" as const,
    component: "morning" as const,
    label: "Morning lesson + Voice-Free practice",
    summary:
      "The controlled Day 1 mission is available from the 4:00 a.m. local program boundary.",
    timingAuthority: "CONTROLLED_04_00" as const,
  }),
  Object.freeze({
    id: "foundation-day1-midday" as const,
    component: "midday" as const,
    label: "Daytime integration",
    summary:
      "At least three safe eyes-open micro-entries; authority supplies no exact clock time.",
    timingAuthority: "USER_SELECTED_NO_SOURCE_CLOCK" as const,
  }),
  Object.freeze({
    id: "foundation-day1-evening" as const,
    component: "evening" as const,
    label: "Evening closing practice",
    summary:
      "Ten-minute close; authority identifies evening but supplies no exact clock time.",
    timingAuthority: "USER_SELECTED_NO_SOURCE_CLOCK" as const,
  }),
]);

function twoDigits(value: number): string {
  return String(value).padStart(2, "0");
}

function dateKey(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${twoDigits(month)}-${twoDigits(day)}`;
}

function shiftDate(
  year: number,
  month: number,
  day: number,
  deltaDays: number,
): string {
  const date = new Date(Date.UTC(year, month - 1, day + deltaDays));
  return dateKey(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
  );
}

function readLocalClock(now: Date, timeZone: string): LocalClockParts {
  if (Number.isNaN(now.getTime()))
    throw new RangeError("Invalid schedule time.");
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  const year = Number(values.get("year"));
  const month = Number(values.get("month"));
  const day = Number(values.get("day"));
  const rawHour = Number(values.get("hour"));
  const hour = rawHour === 24 ? 0 : rawHour;
  const minute = Number(values.get("minute"));
  if (
    !Number.isInteger(year) ||
    !Number.isInteger(month) ||
    !Number.isInteger(day) ||
    !Number.isInteger(hour) ||
    !Number.isInteger(minute)
  ) {
    throw new Error(`Could not resolve local schedule time for ${timeZone}.`);
  }
  return {
    date: dateKey(year, month, day),
    minutes: hour * 60 + minute,
    time: `${twoDigits(hour)}:${twoDigits(minute)}`,
    year,
    month,
    day,
  };
}

function minutesFor(localTime: string): number {
  const [hour, minute] = localTime.split(":").map(Number);
  if (hour === undefined || minute === undefined)
    throw new RangeError(`Invalid local reminder time: ${localTime}`);
  return hour * 60 + minute;
}

function reminderKey(
  assignmentId: ControlledAssignmentId,
  localTime: string,
): string {
  return `foundation-day-1/${assignmentId}/${localTime}`;
}

export function deriveControlledSchedule(
  input: DeriveControlledScheduleInput,
): ControlledScheduleSnapshot {
  const timeZone =
    input.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC";
  const local = readLocalClock(input.now, timeZone);
  const beforeBoundary = local.minutes < READY_MINUTES;
  const wallClockProgramDate = beforeBoundary
    ? shiftDate(local.year, local.month, local.day, -1)
    : local.date;
  const programDate =
    input.reminders.highestObservedProgramDate &&
    input.reminders.highestObservedProgramDate > wallClockProgramDate
      ? input.reminders.highestObservedProgramDate
      : wallClockProgramDate;
  const wallClockNextBoundaryDate = beforeBoundary
    ? local.date
    : shiftDate(local.year, local.month, local.day, 1);
  const [programYear, programMonth, programDay] = programDate
    .split("-")
    .map(Number);
  if (
    programYear === undefined ||
    programMonth === undefined ||
    programDay === undefined
  )
    throw new Error("Program date could not be resolved.");
  const nextProgramBoundaryDate =
    wallClockNextBoundaryDate > programDate
      ? wallClockNextBoundaryDate
      : shiftDate(programYear, programMonth, programDay, 1);
  const contentReleased = input.foundationDay === 1;
  const definitions = CONTROLLED_DAY1_SCHEDULE.map((definition) => ({
    ...definition,
    scheduledLocalTime:
      definition.component === "morning"
        ? FOUNDATION_READY_LOCAL_TIME
        : definition.component === "midday"
          ? input.reminders.middayLocalTime
          : input.reminders.eveningLocalTime,
  }));

  const assignments = definitions.map(
    (definition): ControlledScheduleAssignment => {
      const complete = input.completion[definition.component];
      const key = definition.scheduledLocalTime
        ? reminderKey(definition.id, definition.scheduledLocalTime)
        : null;
      let status: ScheduleAssignmentStatus;
      if (complete) status = "complete";
      else if (!contentReleased) status = "controlled_hold";
      else if (!definition.scheduledLocalTime) status = "available_unscheduled";
      else {
        const scheduledMinutes = minutesFor(definition.scheduledLocalTime);
        const scheduledTimeHasPassed =
          local.date !== programDate || local.minutes >= scheduledMinutes;
        status = scheduledTimeHasPassed ? "ready" : "upcoming";
      }
      return {
        ...definition,
        status,
        reminderKey: key,
        notificationDue:
          input.reminders.deviceNotificationsEnabled &&
          status === "ready" &&
          key !== null &&
          !input.reminders.receipts.some(
            (receipt) =>
              receipt.id === key && receipt.notificationAttemptedAt !== null,
          ),
      };
    },
  );

  return {
    localDate: local.date,
    localTime: local.time,
    programDate,
    nextProgramBoundaryDate,
    timeZone,
    boundaryState: beforeBoundary
      ? "BEFORE_LOCAL_04_00"
      : "AT_OR_AFTER_LOCAL_04_00",
    activeFoundationDay: input.foundationDay,
    contentStatus: contentReleased
      ? "RELEASED_DAY_1"
      : "CONTROLLED_CONTENT_HOLD",
    readinessLabel: contentReleased
      ? `Day 1 ready since ${programDate} at ${FOUNDATION_READY_LOCAL_TIME} local`
      : `Foundation Day ${String(input.foundationDay)} content remains held`,
    assignments,
    notificationCandidates: assignments.filter(
      (assignment) => assignment.notificationDue,
    ),
  };
}

export function retainRecentReminderReceipts(
  receipts: readonly ReminderReceipt[],
  nextReceipt: ReminderReceipt,
  limit = 64,
): ReminderReceipt[] {
  if (!Number.isInteger(limit) || limit < 1)
    throw new RangeError("Reminder-receipt retention limit must be positive.");
  const byId = new Map(receipts.map((receipt) => [receipt.id, receipt]));
  byId.set(nextReceipt.id, nextReceipt);
  return [...byId.values()]
    .sort((left, right) => left.firstSeenAt.localeCompare(right.firstSeenAt))
    .slice(-limit);
}
