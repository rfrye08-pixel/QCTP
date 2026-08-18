import { DAY1_TITLE } from "./day1";

export const FOUNDATION_DAY_COUNT = 112 as const;
export const FOUNDATION_WEEK_COUNT = 16 as const;

/** Module labels preserved from the released Rev1 catalog. */
export const FOUNDATION_MODULES = Object.freeze([
  "Attentional Control / Coherence",
  "Attentional Control / Open Awareness",
  "Gap Access",
  "Elevated Emotion / State Generation",
  "Intention / New Potentials",
  "Embodiment / State Interruption",
  "Energy Centers",
  "OBE Foundation / Focus 10",
  "OBE Induction / Separation",
  "Remote Viewing Foundation",
  "Advanced Remote Viewing",
  "Psionics Foundation",
  "Psionics Development",
  "Intuition / Dreams / Creative Reception",
  "Group Intention / Collective Practice",
  "Integration / Living in the Field",
] as const);

export type FoundationModule = (typeof FOUNDATION_MODULES)[number];
export type FoundationDayStatus = "released" | "reserved";

interface FoundationDayBase {
  readonly day: number;
  readonly week: number;
  readonly module: FoundationModule;
  readonly authored: boolean;
  readonly status: FoundationDayStatus;
}

export interface ReleasedFoundationDay extends FoundationDayBase {
  readonly authored: true;
  readonly status: "released";
  readonly contentId: "foundation-day-1";
  readonly title: typeof DAY1_TITLE;
}

export interface ReservedFoundationDay extends FoundationDayBase {
  readonly authored: false;
  readonly status: "reserved";
}

export type FoundationDayMetadata =
  ReleasedFoundationDay | ReservedFoundationDay;

export const FOUNDATION_DAYS: readonly FoundationDayMetadata[] = Object.freeze(
  Array.from(
    { length: FOUNDATION_DAY_COUNT },
    (_, index): FoundationDayMetadata => {
      const day = index + 1;
      const week = Math.floor(index / 7) + 1;
      const module = FOUNDATION_MODULES[Math.floor(index / 7)];

      if (module === undefined) {
        throw new RangeError(
          `No Foundation module metadata exists for day ${day}.`,
        );
      }

      if (day === 1) {
        return Object.freeze({
          day,
          week,
          module,
          authored: true,
          status: "released",
          contentId: "foundation-day-1",
          title: DAY1_TITLE,
        });
      }

      // Reserved days intentionally contain metadata only. Do not add generated
      // titles, lessons, prompts, practices, or cues here.
      return Object.freeze({
        day,
        week,
        module,
        authored: false,
        status: "reserved",
      });
    },
  ),
);

export function getFoundationDay(
  day: number,
): FoundationDayMetadata | undefined {
  if (!Number.isInteger(day) || day < 1 || day > FOUNDATION_DAY_COUNT)
    return undefined;
  return FOUNDATION_DAYS[day - 1];
}

export function isReleasedFoundationDay(
  day: FoundationDayMetadata,
): day is ReleasedFoundationDay {
  return day.status === "released";
}
