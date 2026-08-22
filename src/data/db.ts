import { deleteDB, openDB, type DBSchema, type IDBPDatabase } from "idb";

import type {
  AppSettings,
  Attachment,
  CodexRecord,
  DerivedNote,
  FoundationState,
  MigrationLedgerEntry,
  MirrorInsightFeedback,
  MirrorRequest,
  MirrorResult,
  PathState,
  RegSession,
  Revision,
  SearchDocument,
  Transcript,
  TranscriptionQueueItem,
  VoiceRecording,
  WorkbookState,
} from "../domain";

export const QCTP_DATABASE_NAME = "qctp-rev2";
export const QCTP_DATABASE_VERSION = 3;

export interface AudioChunk {
  schemaVersion: 1;
  id: string;
  recordingId: string;
  segmentId: string;
  sequence: number;
  createdAt: string;
  mimeType: string;
  blob: Blob;
}

export interface AttachmentBlob {
  schemaVersion: 1;
  id: string;
  attachmentId: string;
  createdAt: string;
  blob: Blob;
}

interface QctpDbSchema extends DBSchema {
  foundation: {
    key: string;
    value: FoundationState;
  };
  workbook: {
    key: string;
    value: WorkbookState;
  };
  settings: {
    key: string;
    value: AppSettings;
  };
  records: {
    key: string;
    value: CodexRecord;
    indexes: {
      kind: CodexRecord["kind"];
      createdAt: string;
      updatedAt: string;
      tags: string;
    };
  };
  searchDocuments: {
    key: string;
    value: SearchDocument;
    indexes: {
      kind: SearchDocument["kind"];
      tags: string;
      updatedAt: string;
    };
  };
  recordings: {
    key: string;
    value: VoiceRecording;
    indexes: {
      status: VoiceRecording["status"];
      destinationType: VoiceRecording["destinationType"];
      createdAt: string;
    };
  };
  audioChunks: {
    key: string;
    value: AudioChunk;
    indexes: {
      recordingId: string;
      segmentId: string;
      recordingSequence: [string, number];
    };
  };
  transcripts: {
    key: string;
    value: Transcript;
    indexes: {
      recordingId: string;
    };
  };
  derivedNotes: {
    key: string;
    value: DerivedNote;
    indexes: {
      transcriptId: string;
    };
  };
  transcriptionQueue: {
    key: string;
    value: TranscriptionQueueItem;
    indexes: {
      recordingId: string;
      status: TranscriptionQueueItem["status"];
      nextAttemptAt: string;
    };
  };
  attachments: {
    key: string;
    value: Attachment;
    indexes: {
      parentId: string;
      kind: Attachment["kind"];
      localBlobRef: string;
    };
  };
  attachmentBlobs: {
    key: string;
    value: AttachmentBlob;
    indexes: {
      attachmentId: string;
    };
  };
  revisions: {
    key: string;
    value: Revision;
    indexes: {
      entityId: string;
      entityType: Revision["entityType"];
    };
  };
  paths: {
    key: string;
    value: PathState;
    indexes: {
      pathType: PathState["pathType"];
    };
  };
  regSessions: {
    key: string;
    value: RegSession;
    indexes: {
      moduleId: RegSession["moduleId"];
      status: RegSession["status"];
    };
  };
  migrationLedger: {
    key: string;
    value: MigrationLedgerEntry;
    indexes: {
      migrationId: MigrationLedgerEntry["migrationId"];
      sourceFingerprint: string;
    };
  };
  mirrorRequests: {
    key: string;
    value: MirrorRequest;
    indexes: {
      status: MirrorRequest["status"];
      remoteJobId: string;
      updatedAt: string;
    };
  };
  mirrorResults: {
    key: string;
    value: MirrorResult;
    indexes: {
      requestId: string;
      remoteJobId: string;
      createdAt: string;
    };
  };
  mirrorInsightFeedback: {
    key: string;
    value: MirrorInsightFeedback;
    indexes: {
      insightKey: string;
      kind: MirrorInsightFeedback["kind"];
      disposition: MirrorInsightFeedback["disposition"];
      updatedAt: string;
    };
  };
}

export type QctpDatabase = IDBPDatabase<QctpDbSchema>;
export type QctpStoreName = keyof QctpDbSchema;

export interface OpenQctpDatabaseOptions {
  name?: string;
}

export async function openQctpDatabase(
  options: OpenQctpDatabaseOptions = {},
): Promise<QctpDatabase> {
  return openDB<QctpDbSchema>(
    options.name ?? QCTP_DATABASE_NAME,
    QCTP_DATABASE_VERSION,
    {
      upgrade(database, oldVersion) {
        if (oldVersion < 1) {
          database.createObjectStore("foundation", { keyPath: "id" });
          database.createObjectStore("workbook", { keyPath: "id" });
          database.createObjectStore("settings", { keyPath: "id" });

          const records = database.createObjectStore("records", {
            keyPath: "id",
          });
          records.createIndex("kind", "kind");
          records.createIndex("createdAt", "createdAt");
          records.createIndex("updatedAt", "updatedAt");
          records.createIndex("tags", "tags", { multiEntry: true });

          const search = database.createObjectStore("searchDocuments", {
            keyPath: "recordId",
          });
          search.createIndex("kind", "kind");
          search.createIndex("tags", "tags", { multiEntry: true });
          search.createIndex("updatedAt", "updatedAt");

          const recordings = database.createObjectStore("recordings", {
            keyPath: "id",
          });
          recordings.createIndex("status", "status");
          recordings.createIndex("destinationType", "destinationType");
          recordings.createIndex("createdAt", "createdAt");

          const audioChunks = database.createObjectStore("audioChunks", {
            keyPath: "id",
          });
          audioChunks.createIndex("recordingId", "recordingId");
          audioChunks.createIndex("segmentId", "segmentId");
          audioChunks.createIndex("recordingSequence", [
            "recordingId",
            "sequence",
          ]);

          const transcripts = database.createObjectStore("transcripts", {
            keyPath: "id",
          });
          transcripts.createIndex("recordingId", "recordingId", {
            unique: true,
          });

          const derivedNotes = database.createObjectStore("derivedNotes", {
            keyPath: "id",
          });
          derivedNotes.createIndex("transcriptId", "transcriptId");

          const queue = database.createObjectStore("transcriptionQueue", {
            keyPath: "id",
          });
          queue.createIndex("recordingId", "recordingId", { unique: true });
          queue.createIndex("status", "status");
          queue.createIndex("nextAttemptAt", "nextAttemptAt");

          const attachments = database.createObjectStore("attachments", {
            keyPath: "id",
          });
          attachments.createIndex("parentId", "parentId");
          attachments.createIndex("kind", "kind");
          attachments.createIndex("localBlobRef", "localBlobRef", {
            unique: true,
          });

          const attachmentBlobs = database.createObjectStore(
            "attachmentBlobs",
            {
              keyPath: "id",
            },
          );
          attachmentBlobs.createIndex("attachmentId", "attachmentId", {
            unique: true,
          });

          const revisions = database.createObjectStore("revisions", {
            keyPath: "id",
          });
          revisions.createIndex("entityId", "entityId");
          revisions.createIndex("entityType", "entityType");

          const paths = database.createObjectStore("paths", { keyPath: "id" });
          paths.createIndex("pathType", "pathType");

          const sessions = database.createObjectStore("regSessions", {
            keyPath: "id",
          });
          sessions.createIndex("moduleId", "moduleId");
          sessions.createIndex("status", "status");

          const ledger = database.createObjectStore("migrationLedger", {
            keyPath: "id",
          });
          ledger.createIndex("migrationId", "migrationId");
          ledger.createIndex("sourceFingerprint", "sourceFingerprint", {
            unique: true,
          });
        }

        if (oldVersion < 2) {
          const requests = database.createObjectStore("mirrorRequests", {
            keyPath: "id",
          });
          requests.createIndex("status", "status");
          requests.createIndex("remoteJobId", "remoteJobId");
          requests.createIndex("updatedAt", "updatedAt");

          const results = database.createObjectStore("mirrorResults", {
            keyPath: "id",
          });
          results.createIndex("requestId", "requestId", { unique: true });
          results.createIndex("remoteJobId", "remoteJobId", { unique: true });
          results.createIndex("createdAt", "createdAt");
        }

        if (oldVersion < 3) {
          const feedback = database.createObjectStore("mirrorInsightFeedback", {
            keyPath: "id",
          });
          feedback.createIndex("insightKey", "insightKey", { unique: true });
          feedback.createIndex("kind", "kind");
          feedback.createIndex("disposition", "disposition");
          feedback.createIndex("updatedAt", "updatedAt");
        }
      },
    },
  );
}

export async function deleteQctpDatabase(
  name = QCTP_DATABASE_NAME,
): Promise<void> {
  await deleteDB(name);
}
