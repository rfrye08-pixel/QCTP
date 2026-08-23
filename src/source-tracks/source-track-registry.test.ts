import { describe, expect, it } from "vitest";

import { getControlledContent } from "../controlled-content";
import {
  CONTROLLED_SOURCE_TRACK_REGISTRY,
  SOURCE_TRACK_LIFECYCLE_DETAILS,
  SOURCE_TRACK_REGISTRY_VALIDATION,
  SourceTrackLifecycleStatusSchema,
  SourceTrackReferenceSchema,
  evaluateSourceTrackAccess,
  getSourceTrack,
  sourceTrackReferenceFor,
  validateSourceTrackRegistry,
} from "./registry";

const capability = (
  stateId: "Q1" | "Q3" | "Q4" | "M-F10" | "TC-PC",
  level: "Accessed" | "Stabilized",
) => ({ stateId, level });

describe("controlled source-track registry", () => {
  it("validates one authority-keyed registry with all eight lifecycle states", () => {
    expect(SOURCE_TRACK_REGISTRY_VALIDATION).toMatchObject({
      valid: true,
      issues: [],
    });
    expect(CONTROLLED_SOURCE_TRACK_REGISTRY.length).toBeGreaterThanOrEqual(10);
    expect(
      new Set(CONTROLLED_SOURCE_TRACK_REGISTRY.map((track) => track.id)).size,
    ).toBe(CONTROLLED_SOURCE_TRACK_REGISTRY.length);

    const statuses = new Set([
      ...CONTROLLED_SOURCE_TRACK_REGISTRY.map((track) => track.status),
      ...CONTROLLED_SOURCE_TRACK_REGISTRY.flatMap((track) =>
        track.accessPoints.map((access) => access.status),
      ),
    ]);
    expect([...statuses].sort()).toEqual(
      [...SourceTrackLifecycleStatusSchema.options].sort(),
    );

    for (const status of SourceTrackLifecycleStatusSchema.options) {
      expect(SOURCE_TRACK_LIFECYCLE_DETAILS[status].label).toBeTruthy();
    }
  });

  it("requires every openable access point to resolve exact authority and gates", () => {
    for (const track of CONTROLLED_SOURCE_TRACK_REGISTRY) {
      for (const access of track.accessPoints) {
        if (!SOURCE_TRACK_LIFECYCLE_DETAILS[access.status].executable) {
          expect(access.destination).toBeNull();
          expect(access.permittedActions).toEqual(["discover"]);
          expect(access.holdReason).toBeTruthy();
          continue;
        }
        expect(access.destination).not.toBeNull();
        expect(access.authorityKeys.length).toBeGreaterThan(0);
        for (const authorityKey of access.authorityKeys) {
          const controlled = getControlledContent(authorityKey);
          expect(
            controlled,
            `${track.id}.${access.id}.${authorityKey}`,
          ).not.toBeNull();
          expect(access.contentClasses).toContain(controlled?.contentClass);
        }
        if (access.mode !== "profile") {
          expect(access.safety.length).toBeGreaterThan(0);
          expect(access.evidenceGates.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it("fails validation for duplicate, unregistered, and lifecycle-invalid entries", () => {
    expect(
      validateSourceTrackRegistry([
        ...CONTROLLED_SOURCE_TRACK_REGISTRY,
        CONTROLLED_SOURCE_TRACK_REGISTRY[0],
      ]),
    ).toMatchObject({ valid: false });

    const unregistered = structuredClone(CONTROLLED_SOURCE_TRACK_REGISTRY);
    unregistered[0]!.accessPoints[0]!.authorityKeys = ["unknown.authority"];
    expect(validateSourceTrackRegistry(unregistered).issues.join(" ")).toMatch(
      /unregistered authority unknown\.authority/u,
    );

    const foreignRegisteredParent = structuredClone(
      CONTROLLED_SOURCE_TRACK_REGISTRY,
    );
    const campbellTc01 = foreignRegisteredParent
      .find((track) => track.id === "thomas-campbell")!
      .accessPoints.find((access) => access.id === "TC-01")!;
    campbellTc01.authorityKeys[1] = "grant.exercise.REG-01-A";
    expect(
      validateSourceTrackRegistry(foreignRegisteredParent).issues.join(" "),
    ).toMatch(/thomas-campbell\.TC-01: authority parent mismatch/u);

    const invalidLifecycle = structuredClone(CONTROLLED_SOURCE_TRACK_REGISTRY);
    const mossbridge = invalidLifecycle.find(
      (track) => track.id === "mossbridge",
    )!;
    mossbridge.accessPoints[0]!.destination = "practice";
    expect(
      validateSourceTrackRegistry(invalidLifecycle).issues.join(" "),
    ).toMatch(/ARCHITECTURE_ONLY access cannot expose a destination/u);
  });

  it("allows REG-01 only and keeps later Grant modules deferred", () => {
    expect(
      evaluateSourceTrackAccess({
        trackId: "robert-edward-grant",
        accessId: "REG-01-A",
        destination: "studio",
        action: "start",
      }),
    ).toMatchObject({ allowed: true, code: "ALLOWED" });
    expect(
      evaluateSourceTrackAccess({
        trackId: "robert-edward-grant",
        accessId: "REG-02",
        destination: "studio",
        action: "start",
      }),
    ).toMatchObject({ allowed: false, code: "LIFECYCLE_HOLD" });
  });

  it("holds Campbell prerequisite exercises until the exact state evidence exists", () => {
    expect(
      evaluateSourceTrackAccess({
        trackId: "thomas-campbell",
        accessId: "TC-02",
        destination: "paths",
        action: "read",
      }),
    ).toMatchObject({
      allowed: false,
      code: "PREREQUISITES_UNMET",
      unmetPrerequisites: ["Requires Q3 Stabilized.", "Requires Q4 Accessed."],
    });
    expect(
      evaluateSourceTrackAccess({
        trackId: "thomas-campbell",
        accessId: "TC-02",
        destination: "paths",
        action: "read",
        capabilities: [capability("Q3", "Stabilized")],
      }),
    ).toMatchObject({ allowed: false, code: "PREREQUISITES_UNMET" });
    expect(
      evaluateSourceTrackAccess({
        trackId: "thomas-campbell",
        accessId: "TC-02",
        destination: "paths",
        action: "read",
        capabilities: [
          capability("Q3", "Stabilized"),
          capability("Q4", "Accessed"),
        ],
      }),
    ).toMatchObject({ allowed: true, code: "ALLOWED" });
    expect(
      evaluateSourceTrackAccess({
        trackId: "thomas-campbell",
        accessId: "TC-06",
        destination: "paths",
        action: "read",
        capabilities: [
          capability("Q3", "Stabilized"),
          capability("Q4", "Accessed"),
        ],
      }),
    ).toMatchObject({ allowed: true, code: "ALLOWED" });
    expect(
      evaluateSourceTrackAccess({
        trackId: "thomas-campbell",
        accessId: "TC-03",
        destination: "paths",
        action: "read",
      }),
    ).toMatchObject({ allowed: false, code: "LIFECYCLE_HOLD" });
  });

  it("limits Day 1 sources, state recipes, experiments, and record-only tracks", () => {
    expect(
      evaluateSourceTrackAccess({
        trackId: "heartmath",
        accessId: "day1-operation",
        destination: "today",
        action: "start",
      }),
    ).toMatchObject({ allowed: true });
    expect(
      evaluateSourceTrackAccess({
        trackId: "heartmath",
        accessId: "day1-operation",
        destination: "practice",
        action: "start",
      }),
    ).toMatchObject({ allowed: false, code: "DESTINATION_MISMATCH" });

    const focusPrerequisites = [
      capability("Q1", "Stabilized"),
      capability("Q3", "Stabilized"),
    ];
    expect(
      evaluateSourceTrackAccess({
        trackId: "monroe-buhlman",
        accessId: "M-F10",
        destination: "paths",
        action: "start",
        capabilities: focusPrerequisites,
      }),
    ).toMatchObject({ allowed: true });
    expect(
      evaluateSourceTrackAccess({
        trackId: "monroe-buhlman",
        accessId: "M-F10",
        destination: "paths",
        action: "start",
        capabilities: [
          {
            ...capability("Q1", "Stabilized"),
            sourceTrackHold: { status: "HELD" },
          },
          capability("Q3", "Stabilized"),
        ],
      }),
    ).toMatchObject({ allowed: false, code: "PREREQUISITES_UNMET" });

    const qrCapabilities = [
      capability("Q3", "Stabilized"),
      capability("Q4", "Accessed"),
    ];
    expect(
      evaluateSourceTrackAccess({
        trackId: "remote-viewing",
        accessId: "QR",
        destination: "paths",
        action: "read",
        capabilities: qrCapabilities,
      }),
    ).toMatchObject({ allowed: true });
    expect(
      evaluateSourceTrackAccess({
        trackId: "remote-viewing",
        accessId: "QR",
        destination: "paths",
        action: "start",
        capabilities: qrCapabilities,
      }),
    ).toMatchObject({ allowed: false, code: "ACTION_NOT_PERMITTED" });

    expect(
      evaluateSourceTrackAccess({
        trackId: "psionics",
        accessId: "record",
        destination: "lab",
        action: "record",
      }),
    ).toMatchObject({ allowed: true });
    expect(
      evaluateSourceTrackAccess({
        trackId: "psionics",
        accessId: "record",
        destination: "lab",
        action: "start",
      }),
    ).toMatchObject({ allowed: false, code: "ACTION_NOT_PERMITTED" });
  });

  it("denies unknown targets and emits exact registry-bound record references", () => {
    expect(
      evaluateSourceTrackAccess({
        trackId: "unknown",
        accessId: "unknown",
        destination: "paths",
        action: "read",
      }),
    ).toMatchObject({ allowed: false, code: "UNKNOWN_TRACK" });

    const reference = sourceTrackReferenceFor(
      "robert-edward-grant",
      "REG-01-A",
    );
    expect(reference).toMatchObject({
      trackId: "robert-edward-grant",
      trackLabel: "Robert Edward Grant",
      accessId: "REG-01-A",
      accessStatus: "RELEASED",
      contentRefs: [
        {
          authorityKey: "grant.exercise.REG-01-A",
          contentClass: "QCTP_ORIGINAL",
        },
      ],
    });
    expect(
      SourceTrackReferenceSchema.safeParse({
        ...reference,
        accessLabel: "Foreign label",
      }).success,
    ).toBe(false);
    expect(
      SourceTrackReferenceSchema.safeParse({
        ...reference,
        authorityIds: ["user-supplied-authority"],
      }).success,
    ).toBe(false);
    expect(
      SourceTrackReferenceSchema.safeParse({
        ...reference,
        forgedExtraField: "not part of the controlled reference",
      }).success,
    ).toBe(false);
    expect(getSourceTrack("lynne-mctaggart")).toMatchObject({
      status: "DEFERRED",
    });
  });

  it("deep-freezes the validated authority graph so runtime mutation cannot open a held route", () => {
    const track = getSourceTrack("mossbridge");
    const access = track?.accessPoints.find(
      (candidate) => candidate.id === "architecture",
    );
    expect(track).not.toBeNull();
    expect(access).toBeDefined();
    expect(Object.isFrozen(SOURCE_TRACK_REGISTRY_VALIDATION)).toBe(true);
    expect(Object.isFrozen(CONTROLLED_SOURCE_TRACK_REGISTRY)).toBe(true);
    expect(Object.isFrozen(track)).toBe(true);
    expect(Object.isFrozen(track?.accessPoints)).toBe(true);
    expect(Object.isFrozen(access)).toBe(true);
    expect(Object.isFrozen(access?.permittedActions)).toBe(true);
    expect(Object.isFrozen(access?.authorityKeys)).toBe(true);

    expect(Reflect.set(track!, "status", "RELEASED")).toBe(false);
    expect(Reflect.set(access!, "status", "RELEASED")).toBe(false);
    expect(Reflect.set(access!, "destination", "lab")).toBe(false);
    expect(() => access!.permittedActions.push("start")).toThrow(TypeError);
    expect(() => access!.authorityKeys.push("workflow.lab")).toThrow(TypeError);

    expect(
      evaluateSourceTrackAccess({
        trackId: "mossbridge",
        accessId: "architecture",
        destination: "lab",
        action: "start",
      }),
    ).toMatchObject({ allowed: false });
  });
});
