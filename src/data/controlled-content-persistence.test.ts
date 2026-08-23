import { strFromU8, unzipSync } from "fflate";
import { afterEach, describe, expect, it } from "vitest";

import type { CodexRecord } from "../domain";
import {
  exportArchive,
  exportJson,
  importArchive,
  importJson,
} from "../export-import";

import { deleteQctpDatabase, openQctpDatabase } from "./db";
import { createQctpRepository } from "./repository";

const databaseNames: string[] = [];
const now = "2026-08-23T05:00:00.000Z";

function legacyCampbellRecord(id: string, contentClass: string): CodexRecord {
  return {
    schemaVersion: 1,
    id,
    kind: "source_note",
    title: "Legacy Campbell record",
    createdAt: now,
    updatedAt: now,
    observation: null,
    interpretation: null,
    tags: ["thomas-campbell"],
    backlinks: [],
    sourceLinks: [],
    attachmentIds: [],
    revisionIds: [],
    pathId: "thomas-campbell",
    sessionId: null,
    fields: {
      sourceTrack: "thomas-campbell",
      exerciseId: "TC-01-POSSIBILITY-LEDGER",
      contentClass,
    },
    deletedAt: null,
  };
}

afterEach(async () => {
  await Promise.all(
    databaseNames.splice(0).map((name) => deleteQctpDatabase(name)),
  );
});

describe("controlled-content v5 persistence compatibility", () => {
  it("lazily enriches a trusted legacy record without rewriting its raw bytes", async () => {
    const name = `qctp-content-class-${crypto.randomUUID()}`;
    databaseNames.push(name);
    const rawDatabase = await openQctpDatabase({ name });
    await rawDatabase.put(
      "records",
      legacyCampbellRecord("legacy-known", "qctp_original"),
    );
    rawDatabase.close();

    const repository = await createQctpRepository({ name });
    const [record] = await repository.listRecords();
    repository.close();
    expect(record?.contentRef).toEqual({
      authorityKey: "campbell.exercise.TC-01-POSSIBILITY-LEDGER",
      contentClass: "QCTP_ORIGINAL",
    });
    expect(record?.fields.contentClass).toBe("qctp_original");

    const verificationDatabase = await openQctpDatabase({ name });
    const stillRaw = await verificationDatabase.get("records", "legacy-known");
    verificationDatabase.close();
    expect(stillRaw?.contentRef).toBeUndefined();
    expect(stillRaw?.fields.contentClass).toBe("qctp_original");
  });

  it("lists and exports an unknown trusted legacy class with an explicit hold without rewriting it", async () => {
    const name = `qctp-content-hold-${crypto.randomUUID()}`;
    databaseNames.push(name);
    const rawDatabase = await openQctpDatabase({ name });
    await rawDatabase.put(
      "records",
      legacyCampbellRecord("legacy-unknown", "mystery_class"),
    );
    rawDatabase.close();

    const repository = await createQctpRepository({ name });
    const [held] = await repository.listRecords();
    expect(held).toMatchObject({
      id: "legacy-unknown",
      fields: { contentClass: "mystery_class" },
      controlledContentHold: {
        status: "HELD",
        code: "UNMAPPED_LEGACY_CONTENT_CLASS",
        authorityKey: "campbell.exercise.TC-01-POSSIBILITY-LEDGER",
        rawValue: "mystery_class",
      },
    });
    await expect(repository.saveRecord(held!)).rejects.toThrow(
      /UNMAPPED_LEGACY_CONTENT_CLASS.*No data changed/u,
    );

    const json = JSON.parse(await exportJson(repository)) as {
      records: CodexRecord[];
    };
    expect(json.records[0]?.controlledContentHold).toMatchObject({
      status: "HELD",
      rawValue: "mystery_class",
    });
    const archive = await exportArchive(repository);
    const files = unzipSync(new Uint8Array(await archive.arrayBuffer()));
    const data = files["qctp-data.json"];
    expect(data).toBeDefined();
    const archived = JSON.parse(strFromU8(data!)) as {
      records: CodexRecord[];
    };
    expect(archived.records[0]?.controlledContentHold).toMatchObject({
      status: "HELD",
      rawValue: "mystery_class",
    });

    const targetName = `qctp-content-hold-target-${crypto.randomUUID()}`;
    databaseNames.push(targetName);
    const target = await createQctpRepository({ name: targetName });
    await expect(
      importJson(target, JSON.stringify(json), { mode: "replace" }),
    ).rejects.toThrow(/UNMAPPED_LEGACY_CONTENT_CLASS.*No data changed/u);
    await expect(
      importArchive(target, archive, { mode: "replace" }),
    ).rejects.toThrow(/UNMAPPED_LEGACY_CONTENT_CLASS.*No data changed/u);
    expect(await target.listRecords()).toEqual([]);
    target.close();
    repository.close();

    const verificationDatabase = await openQctpDatabase({ name });
    const stillRaw = await verificationDatabase.get(
      "records",
      "legacy-unknown",
    );
    verificationDatabase.close();
    expect(stillRaw?.fields.contentClass).toBe("mystery_class");
    expect(stillRaw?.contentRef).toBeUndefined();
  });
});
