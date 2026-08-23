import { describe, expect, it } from "vitest";

import {
  hashForAppLocation,
  hashForCodexRecord,
  hashForMirrorSource,
  parseAppLocation,
  routeFromHash,
} from "./routes";

describe("typed application routes", () => {
  it("keeps every base route and the legacy #codex spelling compatible", () => {
    expect(parseAppLocation("#/today")).toEqual({
      kind: "base",
      route: "today",
      invalidLink: null,
    });
    expect(parseAppLocation("#codex")).toEqual({
      kind: "base",
      route: "codex",
      invalidLink: null,
    });
    expect(routeFromHash("#/settings")).toBe("settings");
    expect(routeFromHash("#/not-a-route")).toBe("today");
  });

  it("round-trips reserved characters and Unicode without decoding twice", () => {
    const recordId = "morning/field #1?focus=✓ %2F 🌅";
    const codexHash = hashForCodexRecord(recordId);
    const mirrorHash = hashForMirrorSource(recordId);

    expect(codexHash).toBe(
      "#/codex/record/morning%2Ffield%20%231%3Ffocus%3D%E2%9C%93%20%252F%20%F0%9F%8C%85",
    );
    expect(parseAppLocation(codexHash)).toEqual({
      kind: "codex-record",
      route: "codex",
      recordId,
      invalidLink: null,
    });
    expect(parseAppLocation(mirrorHash)).toEqual({
      kind: "mirror-source",
      route: "mirror",
      recordId,
      invalidLink: null,
    });
  });

  it("round-trips schema-valid unpaired UTF-16 code units without throwing", () => {
    const recordId = "legacy-high-\uD800-low-\uDC00";
    const codexHash = hashForCodexRecord(recordId);
    const mirrorHash = hashForMirrorSource(recordId);

    expect(codexHash).toBe("#/codex/record/legacy-high-%uD800-low-%uDC00");
    expect(parseAppLocation(codexHash)).toMatchObject({
      kind: "codex-record",
      recordId,
    });
    expect(parseAppLocation(mirrorHash)).toMatchObject({
      kind: "mirror-source",
      recordId,
    });
  });

  it("formats every typed location canonically", () => {
    expect(
      hashForAppLocation({
        kind: "base",
        route: "lab",
        invalidLink: null,
      }),
    ).toBe("#/lab");
    expect(
      hashForAppLocation({
        kind: "codex-record",
        route: "codex",
        recordId: "record-1",
        invalidLink: null,
      }),
    ).toBe("#/codex/record/record-1");
  });

  it.each([
    ["empty ID", "#/codex/record/", "codex", "invalid-record-id"],
    [
      "trim-changing ID",
      "#/codex/record/%20record",
      "codex",
      "invalid-record-id",
    ],
    [
      "malformed percent",
      "#/mirror/source/%E0%A4%A",
      "mirror",
      "invalid-record-id",
    ],
    [
      "overlong ID",
      `#/codex/record/${"a".repeat(241)}`,
      "codex",
      "invalid-record-id",
    ],
    [
      "extra segment",
      "#/mirror/source/record/extra",
      "mirror",
      "malformed-path",
    ],
    ["wrong deep route", "#/codex/source/record", "codex", "malformed-path"],
  ])(
    "rejects %s and falls back to the owning base route",
    (_label, hash, route, reason) => {
      expect(parseAppLocation(hash)).toEqual({
        kind: "base",
        route,
        invalidLink: { reason, requestedHash: hash },
      });
    },
  );

  it("rejects formatter inputs that EntityIdSchema would silently trim", () => {
    expect(() => hashForCodexRecord(" record-1")).toThrow(
      "Record ID must be an exact valid QCTP entity ID.",
    );
    expect(() => hashForMirrorSource("")).toThrow(
      "Record ID must be an exact valid QCTP entity ID.",
    );
  });

  it("accepts the old Mirror anchor once so App can replace it canonically", () => {
    const location = parseAppLocation("#mirror-source-record%2Fone");
    expect(location).toEqual({
      kind: "mirror-source",
      route: "mirror",
      recordId: "record/one",
      invalidLink: null,
    });
    expect(hashForAppLocation(location)).toBe("#/mirror/source/record%2Fone");
  });

  it("holds unknown top-level links on Today without losing the bad hash", () => {
    const hash = "#/elsewhere/record/one";
    expect(parseAppLocation(hash)).toEqual({
      kind: "base",
      route: "today",
      invalidLink: {
        reason: "unknown-route",
        requestedHash: hash,
      },
    });
  });
});
