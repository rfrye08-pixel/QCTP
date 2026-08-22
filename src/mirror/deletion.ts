import type { MirrorRequest } from "../domain";

export type RemoteMirrorDeletionTarget =
  | { kind: "none" }
  | { kind: "job_id"; id: string }
  | { kind: "request_id"; id: string };

/**
 * A request can reach PX13 even if its POST response never reaches the phone.
 * Only an untouched local queue item is provably local-only; every uncertain
 * submission is resolved by the stable client request ID before local delete.
 */
export function remoteMirrorDeletionTarget(
  request: Pick<MirrorRequest, "id" | "status" | "attempts" | "remoteJobId">,
): RemoteMirrorDeletionTarget {
  if (request.remoteJobId) return { kind: "job_id", id: request.remoteJobId };
  if (request.status === "QUEUED_LOCAL" && request.attempts === 0) {
    return { kind: "none" };
  }
  return { kind: "request_id", id: request.id };
}
