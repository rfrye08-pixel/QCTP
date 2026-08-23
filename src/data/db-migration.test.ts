import { openDB } from "idb";
import { afterEach, describe, expect, it } from "vitest";

import { deleteQctpDatabase, openQctpDatabase } from "./db";

describe("IndexedDB schema migration", () => {
  const names: string[] = [];

  afterEach(async () => {
    await Promise.all(names.splice(0).map((name) => deleteQctpDatabase(name)));
  });

  it("adds Mirror queue/result/feedback stores when a Rev2 v1 database already exists", async () => {
    const name = `qctp-v1-upgrade-${crypto.randomUUID()}`;
    names.push(name);
    const old = await openDB(name, 1, {
      upgrade(database) {
        database.createObjectStore("foundation", { keyPath: "id" });
      },
    });
    old.close();
    const upgraded = await openQctpDatabase({ name });
    expect(upgraded.version).toBe(5);
    expect([...upgraded.objectStoreNames]).toEqual(
      expect.arrayContaining([
        "foundation",
        "mirrorRequests",
        "mirrorResults",
        "mirrorInsightFeedback",
        "practiceSessions",
        "breathProfiles",
        "breathSessions",
        "stateSessions",
        "stateCapabilities",
      ]),
    );
    upgraded.close();
  });

  it("adds insight feedback without disturbing existing v2 Mirror stores", async () => {
    const name = `qctp-v2-upgrade-${crypto.randomUUID()}`;
    names.push(name);
    const old = await openDB(name, 2, {
      upgrade(database) {
        database.createObjectStore("mirrorRequests", { keyPath: "id" });
        database.createObjectStore("mirrorResults", { keyPath: "id" });
      },
    });
    old.close();

    const upgraded = await openQctpDatabase({ name });
    expect(upgraded.version).toBe(5);
    expect([...upgraded.objectStoreNames]).toEqual(
      expect.arrayContaining([
        "mirrorRequests",
        "mirrorResults",
        "mirrorInsightFeedback",
        "practiceSessions",
        "breathProfiles",
        "stateCapabilities",
      ]),
    );
    upgraded.close();
  });

  it("adds practice sessions without disturbing an existing v3 database", async () => {
    const name = `qctp-v3-upgrade-${crypto.randomUUID()}`;
    names.push(name);
    const old = await openDB(name, 3, {
      upgrade(database) {
        database.createObjectStore("foundation", { keyPath: "id" });
        database.createObjectStore("mirrorInsightFeedback", {
          keyPath: "id",
        });
      },
    });
    old.close();

    const upgraded = await openQctpDatabase({ name });
    expect(upgraded.version).toBe(5);
    expect([...upgraded.objectStoreNames]).toContain("practiceSessions");
    expect([...upgraded.objectStoreNames]).toEqual(
      expect.arrayContaining([
        "breathProfiles",
        "breathSessions",
        "stateSessions",
        "stateCapabilities",
      ]),
    );
    upgraded.close();
  });

  it("adds Breath and State stores without disturbing existing v4 practice data", async () => {
    const name = `qctp-v4-upgrade-${crypto.randomUUID()}`;
    names.push(name);
    const old = await openDB(name, 4, {
      upgrade(database) {
        database.createObjectStore("practiceSessions", { keyPath: "id" });
      },
    });
    await old.put("practiceSessions", {
      id: "preserved-practice-session",
      marker: "must-survive-v5",
    });
    old.close();

    const upgraded = await openQctpDatabase({ name });
    expect(upgraded.version).toBe(5);
    expect([...upgraded.objectStoreNames]).toEqual(
      expect.arrayContaining([
        "practiceSessions",
        "breathProfiles",
        "breathSessions",
        "stateSessions",
        "stateCapabilities",
      ]),
    );
    expect(
      await upgraded.get("practiceSessions", "preserved-practice-session"),
    ).toMatchObject({ marker: "must-survive-v5" });
    upgraded.close();
  });

  it("fails with recovery guidance instead of hanging behind an older open tab", async () => {
    const name = `qctp-blocked-upgrade-${crypto.randomUUID()}`;
    names.push(name);
    const old = await openDB(name, 4, {
      upgrade(database) {
        database.createObjectStore("practiceSessions", { keyPath: "id" });
      },
    });
    try {
      await expect(openQctpDatabase({ name })).rejects.toThrow(
        /blocked by another open QCTP tab.*local data remains unchanged/i,
      );
    } finally {
      old.close();
    }
  });
});
