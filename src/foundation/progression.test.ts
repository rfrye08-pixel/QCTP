import { describe, expect, it } from "vitest";

import {
  createFoundationProgress,
  getCompletedFoundationDays,
  getFoundationDayComponents,
  markFoundationComponentComplete,
} from "./progression";

describe("completion-based Foundation progression", () => {
  it("advances only after all three released-day components are complete", () => {
    let progress = createFoundationProgress();

    progress = markFoundationComponentComplete(progress, 1, "morning");
    expect(progress.currentDay).toBe(1);
    progress = markFoundationComponentComplete(progress, 1, "midday");
    expect(progress.currentDay).toBe(1);
    progress = markFoundationComponentComplete(progress, 1, "evening");

    expect(progress.currentDay).toBe(2);
    expect(getFoundationDayComponents(progress, 1)).toEqual({
      morning: true,
      midday: true,
      evening: true,
    });
    expect(getCompletedFoundationDays(progress)).toEqual([1]);
  });

  it("is idempotent and refuses to complete reserved content", () => {
    const morning = markFoundationComponentComplete(
      createFoundationProgress(),
      1,
      "morning",
    );
    expect(markFoundationComponentComplete(morning, 1, "morning")).toBe(
      morning,
    );
    expect(() =>
      markFoundationComponentComplete(morning, 2, "morning"),
    ).toThrow("Foundation Day 2 is reserved");
  });

  it("normalizes imported partial component state without calendar advancement", () => {
    const progress = createFoundationProgress(1, {
      1: { morning: true, midday: true },
      200: { evening: true },
    });

    expect(progress.currentDay).toBe(1);
    expect(getFoundationDayComponents(progress, 1)).toEqual({
      morning: true,
      midday: true,
      evening: false,
    });
    expect(getCompletedFoundationDays(progress)).toEqual([]);
  });
});
