import {
  FOUNDATION_DAY_COUNT,
  getFoundationDay,
  isReleasedFoundationDay,
} from "./catalog";

export const FOUNDATION_REQUIRED_COMPONENTS = Object.freeze([
  "morning",
  "midday",
  "evening",
] as const);

export type FoundationComponent =
  (typeof FOUNDATION_REQUIRED_COMPONENTS)[number];

export interface FoundationDayComponents {
  readonly morning: boolean;
  readonly midday: boolean;
  readonly evening: boolean;
}

export interface FoundationProgress {
  readonly currentDay: number;
  readonly componentsByDay: Readonly<
    Record<number, Readonly<FoundationDayComponents> | undefined>
  >;
}

const EMPTY_COMPONENTS: Readonly<FoundationDayComponents> = Object.freeze({
  morning: false,
  midday: false,
  evening: false,
});

export function createFoundationProgress(
  currentDay = 1,
  componentsByDay: Readonly<
    Record<number, Readonly<Partial<FoundationDayComponents>> | undefined>
  > = {},
): FoundationProgress {
  assertFoundationDayNumber(currentDay);

  const normalizedComponents: Record<
    number,
    Readonly<FoundationDayComponents>
  > = {};
  for (const [rawDay, components] of Object.entries(componentsByDay)) {
    const day = Number(rawDay);
    if (
      !components ||
      !Number.isInteger(day) ||
      day < 1 ||
      day > FOUNDATION_DAY_COUNT
    ) {
      continue;
    }

    normalizedComponents[day] = Object.freeze({
      morning: components.morning === true,
      midday: components.midday === true,
      evening: components.evening === true,
    });
  }

  return Object.freeze({
    currentDay,
    componentsByDay: Object.freeze(normalizedComponents),
  });
}

export function getFoundationDayComponents(
  progress: FoundationProgress,
  day: number,
): Readonly<FoundationDayComponents> {
  assertFoundationDayNumber(day);
  return progress.componentsByDay[day] ?? EMPTY_COMPONENTS;
}

export function isFoundationDayComplete(
  progress: FoundationProgress,
  day: number,
): boolean {
  const components = getFoundationDayComponents(progress, day);
  return FOUNDATION_REQUIRED_COMPONENTS.every(
    (component) => components[component],
  );
}

/**
 * Advances solely from completed training components, never from wall-clock
 * dates. Finishing Day 1 may place the pointer on reserved Day 2, but a reserved
 * day itself can never be marked complete through this API.
 */
export function advanceFoundationProgress(
  progress: FoundationProgress,
): FoundationProgress {
  if (!isFoundationDayComplete(progress, progress.currentDay)) return progress;
  if (progress.currentDay >= FOUNDATION_DAY_COUNT) return progress;

  return Object.freeze({
    ...progress,
    currentDay: progress.currentDay + 1,
  });
}

export function markFoundationComponentComplete(
  progress: FoundationProgress,
  day: number,
  component: FoundationComponent,
): FoundationProgress {
  assertFoundationDayNumber(day);
  const metadata = getFoundationDay(day);

  if (metadata === undefined || !isReleasedFoundationDay(metadata)) {
    throw new RangeError(
      `Foundation Day ${day} is reserved and cannot be completed.`,
    );
  }

  const existing = getFoundationDayComponents(progress, day);
  if (existing[component]) return advanceFoundationProgress(progress);

  const nextComponents = Object.freeze({
    ...existing,
    [component]: true,
  });
  const nextProgress: FoundationProgress = Object.freeze({
    currentDay: progress.currentDay,
    componentsByDay: Object.freeze({
      ...progress.componentsByDay,
      [day]: nextComponents,
    }),
  });

  return advanceFoundationProgress(nextProgress);
}

export function getCompletedFoundationDays(
  progress: FoundationProgress,
): readonly number[] {
  return Object.freeze(
    Object.keys(progress.componentsByDay)
      .map(Number)
      .filter((day) => isFoundationDayComplete(progress, day))
      .sort((left, right) => left - right),
  );
}

function assertFoundationDayNumber(day: number): void {
  if (!Number.isInteger(day) || day < 1 || day > FOUNDATION_DAY_COUNT) {
    throw new RangeError(
      `Foundation day must be an integer from 1 to ${FOUNDATION_DAY_COUNT}.`,
    );
  }
}
