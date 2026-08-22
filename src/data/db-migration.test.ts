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
    expect(upgraded.version).toBe(3);
    expect([...upgraded.objectStoreNames]).toEqual(
      expect.arrayContaining([
        "foundation",
        "mirrorRequests",
        "mirrorResults",
        "mirrorInsightFeedback",
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
    expect(upgraded.version).toBe(3);
    expect([...upgraded.objectStoreNames]).toEqual(
      expect.arrayContaining([
        "mirrorRequests",
        "mirrorResults",
        "mirrorInsightFeedback",
      ]),
    );
    upgraded.close();
  });
});
