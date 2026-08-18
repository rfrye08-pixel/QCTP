// @vitest-environment node

import { describe, expect, it } from "vitest";

import {
  CreateMirrorJobRequestSchema,
  MirrorIdentifierSchema,
} from "./contracts.js";

const source = (recordId: string, excerpt = "Source excerpt") => ({
  recordId,
  title: "Source",
  kind: "observation",
  excerpt,
  recordUpdatedAt: "2026-08-17T12:00:00.000Z",
});

describe("Mirror contracts", () => {
  it("accepts portable identifiers and rejects unsafe ones", () => {
    expect(MirrorIdentifierSchema.safeParse("record_1:a-b.c").success).toBe(
      true,
    );
    expect(MirrorIdentifierSchema.safeParse("../record").success).toBe(false);
    expect(
      MirrorIdentifierSchema.safeParse(" record with spaces ").success,
    ).toBe(false);
  });

  it("rejects duplicate source record identifiers", () => {
    const parsed = CreateMirrorJobRequestSchema.safeParse({
      requestId: "request-1",
      prompt: "Reflect.",
      sources: [source("same"), source("same")],
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(parsed.error.issues[0]?.message).toBe(
        "Source record identifiers must be unique.",
      );
    }
  });

  it("caps the combined source context", () => {
    const parsed = CreateMirrorJobRequestSchema.safeParse({
      requestId: "request-1",
      prompt: "Reflect.",
      sources: Array.from({ length: 11 }, (_, index) =>
        source(`source-${index}`, "x".repeat(4_000)),
      ),
    });
    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      expect(
        parsed.error.issues.some((issue) => issue.path[0] === "sources"),
      ).toBe(true);
    }
  });
});
