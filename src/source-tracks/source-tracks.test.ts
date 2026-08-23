import { describe, expect, it } from "vitest";

import { getControlledContent } from "../controlled-content";
import {
  getCampbellExercise,
  THOMAS_CAMPBELL_EXERCISES,
  THOMAS_CAMPBELL_MODULES,
} from "./catalog";
import { CONTROLLED_SOURCE_ARCHITECTURE } from "./registry";

describe("controlled source-track catalogs", () => {
  it("defines all ten Campbell modules without copying paid content", () => {
    expect(THOMAS_CAMPBELL_MODULES.map((module) => module.id)).toEqual(
      Array.from(
        { length: 10 },
        (_, index) => `TC-${String(index + 1).padStart(2, "0")}`,
      ),
    );
    expect(
      THOMAS_CAMPBELL_MODULES.every((module) =>
        module.sourceLabel.toLowerCase().includes("campbell"),
      ),
    ).toBe(true);
  });

  it("ships the five controlled MVP exercises with raw-first fields", () => {
    expect(
      THOMAS_CAMPBELL_EXERCISES.map((exercise) => exercise.moduleId),
    ).toEqual(["TC-01", "TC-02", "TC-04", "TC-05", "TC-06"]);
    for (const exercise of THOMAS_CAMPBELL_EXERCISES) {
      const firstInterpretation = exercise.fields.findIndex(
        (field) => field.layer === "interpretation",
      );
      expect(exercise.fields.some((field) => field.layer === "raw")).toBe(true);
      expect(firstInterpretation).toBeGreaterThanOrEqual(0);
      expect(
        exercise.fields
          .slice(0, firstInterpretation)
          .every((field) => field.layer === "raw"),
      ).toBe(true);
      expect(exercise.contentClass).toBe("QCTP_ORIGINAL");
    }
  });

  it("keeps state/timer and experimental controls explicit", () => {
    expect(
      THOMAS_CAMPBELL_MODULES.find((module) => module.id === "TC-02"),
    ).toMatchObject({
      status: "prerequisite",
      prerequisites: ["Q3 Stabilized", "Q4 Accessed"],
    });
    expect(
      getCampbellExercise("TC-02-POINT-CONSCIOUSNESS")?.completionGate,
    ).toMatch(/evidence gate/i);
    expect(
      THOMAS_CAMPBELL_MODULES.find((module) => module.id === "TC-08")
        ?.objective,
    ).toMatch(/probabilities/i);
    expect(CONTROLLED_SOURCE_ARCHITECTURE.map((source) => source.id)).toContain(
      "psionics",
    );
    for (const module of THOMAS_CAMPBELL_MODULES.filter(
      (candidate) => candidate.status === "reserved",
    )) {
      expect(module.contentClass).toBeNull();
      expect(getControlledContent(`campbell.module.${module.id}`)).toBeNull();
      expect(module.sourceLabel).toMatch(/content held/i);
    }
    for (const module of THOMAS_CAMPBELL_MODULES.filter(
      (candidate) => candidate.status !== "reserved",
    )) {
      expect(module.contentClass).toBe("SOURCE_FAITHFUL");
      expect(
        getControlledContent(`campbell.module.${module.id}`)?.contentClass,
      ).toBe("SOURCE_FAITHFUL");
    }
  });
});
