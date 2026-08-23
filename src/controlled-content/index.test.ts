import { describe, expect, it } from "vitest";

import {
  CONTROLLED_CONTENT_REGISTRY,
  ControlledContentClassSchema,
  ControlledContentHoldError,
  ControlledContentRefSchema,
  contentRefFor,
  getControlledContent,
  migrateTrustedLegacyContentRef,
  normalizeLegacyControlledContentClass,
} from ".";

describe("canonical controlled-content identity", () => {
  it("accepts only the four exact controlled classes on new writes", () => {
    expect(ControlledContentClassSchema.options).toEqual([
      "SOURCE_FAITHFUL",
      "SOURCE_ENHANCED",
      "QCTP_SYNTHESIS",
      "QCTP_ORIGINAL",
    ]);
    expect(
      ControlledContentClassSchema.safeParse("qctp_original").success,
    ).toBe(false);
    expect(
      ControlledContentClassSchema.safeParse("source_specific").success,
    ).toBe(false);
  });

  it("maps only the closed legacy aliases", () => {
    expect(
      normalizeLegacyControlledContentClass("source_faithful_summary"),
    ).toBe("SOURCE_FAITHFUL");
    expect(normalizeLegacyControlledContentClass("source_faithful")).toBe(
      "SOURCE_FAITHFUL",
    );
    expect(normalizeLegacyControlledContentClass("source_enhanced")).toBe(
      "SOURCE_ENHANCED",
    );
    expect(normalizeLegacyControlledContentClass("qctp_synthesis")).toBe(
      "QCTP_SYNTHESIS",
    );
    expect(normalizeLegacyControlledContentClass("qctp_original")).toBe(
      "QCTP_ORIGINAL",
    );
    expect(normalizeLegacyControlledContentClass("source_specific")).toBeNull();
    expect(
      normalizeLegacyControlledContentClass("experimental_protocol"),
    ).toBeNull();
    expect(
      normalizeLegacyControlledContentClass("qctp_regulation_support"),
    ).toBeNull();
  });

  it("has unique authority keys and the authority-correct State Atlas classes", () => {
    expect(
      new Set(CONTROLLED_CONTENT_REGISTRY.map((item) => item.authorityKey))
        .size,
    ).toBe(CONTROLLED_CONTENT_REGISTRY.length);
    expect(
      new Set(CONTROLLED_CONTENT_REGISTRY.map((item) => item.contentClass)),
    ).toEqual(
      new Set([
        "SOURCE_FAITHFUL",
        "SOURCE_ENHANCED",
        "QCTP_SYNTHESIS",
        "QCTP_ORIGINAL",
      ]),
    );
    expect(
      CONTROLLED_CONTENT_REGISTRY.every((item) => item.authorityIds.length > 0),
    ).toBe(true);
    expect(getControlledContent("state.recipe.Q4")?.contentClass).toBe(
      "QCTP_SYNTHESIS",
    );
    expect(getControlledContent("state.recipe.Q5")?.contentClass).toBe(
      "QCTP_SYNTHESIS",
    );
    expect(getControlledContent("state.recipe.QO")?.contentClass).toBe(
      "QCTP_ORIGINAL",
    );
    expect(getControlledContent("state.recipe.QI")?.contentClass).toBe(
      "QCTP_ORIGINAL",
    );
    expect(getControlledContent("state.recipe.Q1")?.authorityIds).toContain(
      "QCTP-STATE-ATLAS-REV0",
    );
    for (const stateId of ["TC-PC", "M-F10", "M-F12"] as const) {
      expect(
        getControlledContent(`state.recipe.${stateId}`)?.contentClass,
      ).toBe("QCTP_ORIGINAL");
      expect(
        getControlledContent(`state.target.${stateId}`)?.contentClass,
      ).toBe("SOURCE_FAITHFUL");
    }
    expect(
      getControlledContent("breath.method.QCTP-B1")?.authorityIds,
    ).toContain("QCTP-BREATH-REV0");
    expect(
      getControlledContent("campbell.module.TC-01")?.authorityIds,
    ).toContain("QCTP-TC-INTEGRATION-REV0");
    expect(getControlledContent("workflow.lab")?.authorityIds).toContain(
      "QCTP-PRODUCT-ARCH-REV2",
    );
    expect(
      getControlledContent("breath.method.physiological-sigh")?.contentClass,
    ).toBe("SOURCE_ENHANCED");
    expect(
      getControlledContent("foundation.day1.phase.baseline-observation")
        ?.contentClass,
    ).toBe("QCTP_ORIGINAL");
    expect(
      getControlledContent("foundation.day1.phase.bullard-contraction")
        ?.contentClass,
    ).toBe("SOURCE_ENHANCED");
    expect(
      getControlledContent("foundation.day1.transition.bullard-to-heartmath")
        ?.contentClass,
    ).toBe("QCTP_SYNTHESIS");
    expect(
      getControlledContent("foundation.day1.phase.pure-observation")
        ?.contentClass,
    ).toBe("QCTP_ORIGINAL");
  });

  it("rejects unregistered and class-mismatched references", () => {
    expect(() => contentRefFor("missing.content")).toThrow(
      ControlledContentHoldError,
    );
    expect(
      ControlledContentRefSchema.safeParse({
        authorityKey: "foundation.day1.practice",
        contentClass: "QCTP_ORIGINAL",
      }).success,
    ).toBe(false);
  });

  it("normalizes only a trusted legacy template while leaving raw fields unchanged", () => {
    const fields = {
      sourceTrack: "thomas-campbell",
      exerciseId: "TC-01-POSSIBILITY-LEDGER",
      contentClass: "qctp_original",
    };
    const migrated = migrateTrustedLegacyContentRef({
      id: "legacy-campbell",
      fields,
    }) as Record<string, unknown>;
    expect(migrated.contentRef).toEqual(
      contentRefFor("campbell.exercise.TC-01-POSSIBILITY-LEDGER"),
    );
    expect(migrated.fields).toBe(fields);
    expect((migrated.fields as typeof fields).contentClass).toBe(
      "qctp_original",
    );
  });

  it("projects explicit recovery holds for unknown and mismatched trusted legacy identities", () => {
    for (const [contentClass, code] of [
      ["mystery_class", "UNMAPPED_LEGACY_CONTENT_CLASS"],
      ["source_enhanced", "CONTROLLED_CONTENT_CLASS_MISMATCH"],
    ] as const) {
      const projected = migrateTrustedLegacyContentRef({
        id: "legacy-campbell-held",
        fields: {
          sourceTrack: "thomas-campbell",
          exerciseId: "TC-01-POSSIBILITY-LEDGER",
          contentClass,
        },
      }) as Record<string, unknown>;
      expect(projected).toMatchObject({
        fields: { contentClass },
        controlledContentHold: {
          status: "HELD",
          code,
          authorityKey: "campbell.exercise.TC-01-POSSIBILITY-LEDGER",
          rawValue: contentClass,
        },
      });
    }
  });
});
