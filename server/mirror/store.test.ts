// @vitest-environment node

import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { MirrorJobRecord } from "./contracts.js";
import { MirrorStoreError } from "./errors.js";
import { InMemoryMirrorJobStore, JsonFileMirrorJobStore } from "./store.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map(async (directory) =>
        rm(directory, { recursive: true, force: true }),
      ),
  );
});

const createTemporaryStore = async () => {
  const directory = await mkdtemp(join(tmpdir(), "qctp-mirror-store-"));
  temporaryDirectories.push(directory);
  return {
    directory,
    file: join(directory, "jobs.json"),
    store: new JsonFileMirrorJobStore(join(directory, "jobs.json")),
  };
};

const jobRecord = (suffix: string): MirrorJobRecord => ({
  id: `job-${suffix}`,
  requestId: `request-${suffix}`,
  status: "queued",
  createdAt: "2026-08-17T12:00:00.000Z",
  updatedAt: "2026-08-17T12:00:00.000Z",
  attempts: 0,
  lastError: null,
  result: null,
  prompt: "Reflect on the observation.",
  sources: [
    {
      recordId: `record-${suffix}`,
      title: "Observation",
      kind: "observation",
      excerpt: "A stable local source excerpt.",
      recordUpdatedAt: "2026-08-17T11:00:00.000Z",
    },
  ],
  requestFingerprint: "a".repeat(64),
  nextAttemptAt: null,
  leaseExpiresAt: null,
});

describe("JsonFileMirrorJobStore", () => {
  it("validates the durable file path", () => {
    expect(() => new JsonFileMirrorJobStore(" ")).toThrow(/file path/);
  });

  it("treats a missing job file as an empty store", async () => {
    const temporary = await createTemporaryStore();
    await expect(temporary.store.get("missing")).resolves.toBeNull();
    await expect(
      temporary.store.claimNext(
        "2026-08-17T12:00:00.000Z",
        "2026-08-17T12:05:00.000Z",
      ),
    ).resolves.toBeNull();
    await expect(
      temporary.store.retry("missing", "2026-08-17T12:00:00.000Z"),
    ).resolves.toEqual({ kind: "not_found" });
    await expect(temporary.store.delete("missing")).resolves.toBe(false);
    await expect(temporary.store.deleteByRequestId("missing")).resolves.toBe(
      false,
    );
  });

  it("persists jobs durably across store instances", async () => {
    const temporary = await createTemporaryStore();
    await temporary.store.createOrGet(jobRecord("1"));

    const restarted = new JsonFileMirrorJobStore(temporary.file);
    await expect(restarted.get("job-1")).resolves.toEqual(jobRecord("1"));
  });

  it("serializes concurrent updates without losing jobs", async () => {
    const temporary = await createTemporaryStore();
    const jobs = Array.from({ length: 8 }, (_, index) =>
      jobRecord(String(index + 1)),
    );
    await Promise.all(jobs.map((job) => temporary.store.createOrGet(job)));

    const stored = await temporary.store.listByRequestIds(
      jobs.map((job) => job.requestId),
    );
    expect(stored).toHaveLength(8);
    const files = await readdir(temporary.directory);
    expect(files).toEqual(["jobs.json"]);
  });

  it("replays an existing request without replacing it", async () => {
    const temporary = await createTemporaryStore();
    const original = jobRecord("original");
    await temporary.store.createOrGet(original);
    const replay = await temporary.store.createOrGet({
      ...jobRecord("different-id"),
      requestId: original.requestId,
    });
    expect(replay).toEqual({ job: original, created: false });
  });

  it("durably removes a job and its private source excerpts", async () => {
    const temporary = await createTemporaryStore();
    await temporary.store.createOrGet(jobRecord("delete"));
    await expect(temporary.store.delete("job-delete")).resolves.toBe(true);
    await expect(temporary.store.get("job-delete")).resolves.toBeNull();
    await expect(
      new JsonFileMirrorJobStore(temporary.file).get("job-delete"),
    ).resolves.toBeNull();
  });

  it("durably removes a job by its client request id", async () => {
    const temporary = await createTemporaryStore();
    await temporary.store.createOrGet(jobRecord("lost-response"));
    await temporary.store.createOrGet(jobRecord("keep"));
    await expect(
      temporary.store.deleteByRequestId("request-lost-response"),
    ).resolves.toBe(true);
    await expect(temporary.store.get("job-lost-response")).resolves.toBeNull();
    await expect(temporary.store.get("job-keep")).resolves.toEqual(
      jobRecord("keep"),
    );
    await expect(
      new JsonFileMirrorJobStore(temporary.file).listByRequestIds([
        "request-lost-response",
        "request-keep",
      ]),
    ).resolves.toEqual([jobRecord("keep")]);
  });

  it("does not let an in-flight worker resurrect a request-id deletion", async () => {
    const temporary = await createTemporaryStore();
    const queued = jobRecord("delete-in-flight");
    await temporary.store.createOrGet(queued);
    const claimed = await temporary.store.claimNext(
      "2026-08-17T12:01:00.000Z",
      "2026-08-17T12:06:00.000Z",
    );
    expect(claimed).not.toBeNull();
    if (claimed === null) return;

    await expect(
      temporary.store.deleteByRequestId(queued.requestId),
    ).resolves.toBe(true);
    await expect(
      temporary.store.finishAttempt({
        ...claimed,
        status: "failed",
        updatedAt: "2026-08-17T12:02:00.000Z",
        lastError: "Stopped.",
        leaseExpiresAt: null,
      }),
    ).resolves.toBe(false);
    await expect(temporary.store.get(queued.id)).resolves.toBeNull();
  });

  it("atomically retries a failed job", async () => {
    const temporary = await createTemporaryStore();
    const failed: MirrorJobRecord = {
      ...jobRecord("failed"),
      status: "failed",
      attempts: 3,
      lastError: "The local model was unavailable.",
    };
    await temporary.store.createOrGet(failed);

    const result = await temporary.store.retry(
      failed.id,
      "2026-08-17T13:00:00.000Z",
    );
    expect(result).toMatchObject({
      kind: "updated",
      job: {
        status: "queued",
        attempts: 0,
        lastError: null,
        updatedAt: "2026-08-17T13:00:00.000Z",
      },
    });
  });

  it("does not let a stale worker overwrite a newer state", async () => {
    const temporary = await createTemporaryStore();
    await temporary.store.createOrGet(jobRecord("lease"));
    const claimed = await temporary.store.claimNext(
      "2026-08-17T12:01:00.000Z",
      "2026-08-17T12:06:00.000Z",
    );
    expect(claimed).not.toBeNull();
    if (claimed === null) {
      return;
    }
    const finished = await temporary.store.finishAttempt({
      ...claimed,
      status: "failed",
      updatedAt: "2026-08-17T12:02:00.000Z",
      lastError: "Stopped.",
      leaseExpiresAt: null,
    });
    expect(finished).toBe(true);
    await temporary.store.retry(claimed.id, "2026-08-17T12:03:00.000Z");

    await expect(
      temporary.store.finishAttempt({
        ...claimed,
        status: "complete",
        updatedAt: "2026-08-17T12:04:00.000Z",
        leaseExpiresAt: null,
      }),
    ).resolves.toBe(false);
  });

  it("leaves future retry and active processing jobs unclaimed", async () => {
    const temporary = await createTemporaryStore();
    await temporary.store.createOrGet({
      ...jobRecord("future"),
      status: "retry_wait",
      attempts: 1,
      nextAttemptAt: "2026-08-17T14:00:00.000Z",
    });
    await temporary.store.createOrGet({
      ...jobRecord("active"),
      status: "processing",
      attempts: 1,
      leaseExpiresAt: "2026-08-17T14:00:00.000Z",
    });
    await expect(
      temporary.store.claimNext(
        "2026-08-17T13:00:00.000Z",
        "2026-08-17T13:05:00.000Z",
      ),
    ).resolves.toBeNull();
  });

  it("rejects corrupt files and wraps write failures", async () => {
    const corrupt = await createTemporaryStore();
    await writeFile(corrupt.file, "not-json", "utf8");
    await expect(corrupt.store.get("job")).rejects.toBeInstanceOf(
      MirrorStoreError,
    );

    const blocked = await createTemporaryStore();
    const blocker = join(blocked.directory, "not-a-directory");
    await writeFile(blocker, "block", "utf8");
    const unwritable = new JsonFileMirrorJobStore(join(blocker, "jobs.json"));
    await expect(
      unwritable.createOrGet(jobRecord("blocked")),
    ).rejects.toBeInstanceOf(MirrorStoreError);
  });
});

describe("InMemoryMirrorJobStore", () => {
  it("implements deterministic cloning and transition guards", async () => {
    const store = new InMemoryMirrorJobStore();
    const original = jobRecord("memory");
    await expect(store.createOrGet(original)).resolves.toMatchObject({
      created: true,
    });
    const replay = await store.createOrGet(original);
    expect(replay.created).toBe(false);
    replay.job.sources[0]!.title = "Mutated test clone";
    await expect(store.get(original.id)).resolves.toMatchObject({
      sources: [{ title: "Observation" }],
    });
    await expect(store.get("missing")).resolves.toBeNull();
    await expect(
      store.finishAttempt({ ...original, status: "failed" }),
    ).resolves.toBe(false);
    await expect(
      store.retry("missing", "2026-08-17T13:00:00.000Z"),
    ).resolves.toEqual({ kind: "not_found" });
    await expect(
      store.retry(original.id, "2026-08-17T13:00:00.000Z"),
    ).resolves.toMatchObject({ kind: "not_retryable" });
    await expect(store.delete(original.id)).resolves.toBe(true);
    await expect(store.delete(original.id)).resolves.toBe(false);
    await expect(store.get(original.id)).resolves.toBeNull();

    const byRequest = jobRecord("memory-request");
    await store.createOrGet(byRequest);
    await expect(store.deleteByRequestId(byRequest.requestId)).resolves.toBe(
      true,
    );
    await expect(store.deleteByRequestId(byRequest.requestId)).resolves.toBe(
      false,
    );
  });
});
