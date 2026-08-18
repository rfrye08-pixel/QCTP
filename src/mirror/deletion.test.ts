import { describe, expect, it } from "vitest";

import { remoteMirrorDeletionTarget } from "./deletion";

describe("remote Mirror deletion targeting", () => {
  it("bypasses PX13 only for a request that was provably never submitted", () => {
    expect(
      remoteMirrorDeletionTarget({
        id: "local-only",
        status: "QUEUED_LOCAL",
        attempts: 0,
        remoteJobId: null,
      }),
    ).toEqual({ kind: "none" });
  });

  it.each(["QUEUED_LOCAL", "SUBMITTING", "RETRY_WAIT", "FAILED"] as const)(
    "uses stable request-id deletion after a lost POST response in %s state",
    (status) => {
      expect(
        remoteMirrorDeletionTarget({
          id: "uncertain-submission",
          status,
          attempts: 1,
          remoteJobId: null,
        }),
      ).toEqual({ kind: "request_id", id: "uncertain-submission" });
    },
  );

  it("uses the durable remote job id when it was synchronized", () => {
    expect(
      remoteMirrorDeletionTarget({
        id: "local-request",
        status: "COMPLETE",
        attempts: 1,
        remoteJobId: "px13-job",
      }),
    ).toEqual({ kind: "job_id", id: "px13-job" });
  });
});
