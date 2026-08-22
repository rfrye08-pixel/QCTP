import { describe, expect, it } from "vitest";

import {
  FOUNDATION_DAY_COUNT,
  FOUNDATION_DAYS,
  FOUNDATION_MODULES,
  getFoundationDay,
} from "./catalog";

describe("Foundation catalog", () => {
  it("provides exactly 112 sequential day metadata records across 16 weeks", () => {
    expect(FOUNDATION_DAY_COUNT).toBe(112);
    expect(FOUNDATION_DAYS).toHaveLength(112);
    expect(FOUNDATION_MODULES).toHaveLength(16);
    expect(FOUNDATION_DAYS.map(({ day }) => day)).toEqual(
      Array.from({ length: 112 }, (_, index) => index + 1),
    );
    expect(FOUNDATION_DAYS.map(({ week }) => week)).toEqual(
      Array.from({ length: 112 }, (_, index) => Math.floor(index / 7) + 1),
    );
  });

  it("releases only Day 1 and leaves Days 2–112 reserved without invented content", () => {
    expect(FOUNDATION_DAYS[0]).toEqual({
      day: 1,
      week: 1,
      module: "Attentional Control / Coherence",
      authored: true,
      status: "released",
      contentId: "foundation-day-1",
      title: "State Control",
    });

    for (const day of FOUNDATION_DAYS.slice(1)) {
      expect(day.status).toBe("reserved");
      expect(day.authored).toBe(false);
      expect(Object.keys(day).sort()).toEqual([
        "authored",
        "day",
        "module",
        "status",
        "week",
      ]);
    }
  });

  it("performs bounded day lookups without manufacturing missing metadata", () => {
    expect(getFoundationDay(1)).toBe(FOUNDATION_DAYS[0]);
    expect(getFoundationDay(112)).toBe(FOUNDATION_DAYS[111]);
    expect(getFoundationDay(0)).toBeUndefined();
    expect(getFoundationDay(113)).toBeUndefined();
    expect(getFoundationDay(1.5)).toBeUndefined();
  });
});
