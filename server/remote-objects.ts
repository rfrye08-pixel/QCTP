import type { RemoteObjectDeletionStatus } from "./contracts.js";

export interface RemoteObjectStore {
  deleteForRecording(
    recordingId: string,
    ownerSubject: string,
  ): Promise<RemoteObjectDeletionStatus>;
}

export class NoRemoteObjectStore implements RemoteObjectStore {
  deleteForRecording(): Promise<"not_configured"> {
    return Promise.resolve("not_configured");
  }
}
