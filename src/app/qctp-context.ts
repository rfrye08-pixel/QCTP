import { createContext, useContext } from "react";

import type {
  DeleteRecordingResult,
  DeleteRecordingSelection,
  QctpRepository,
  Rev1MigrationResult,
} from "../data";
import type {
  AppSettings,
  FoundationState,
  MirrorCitation,
  MirrorDisposition,
  MirrorProviderType,
  MirrorResultRevision,
  WorkbookState,
} from "../domain";
import type { MirrorServicePolicy } from "../mirror";
import type { LocalTranscriptionPolicy } from "../transcription";

export interface QctpRuntime {
  repository: QctpRepository;
  foundation: FoundationState;
  settings: AppSettings;
  workbook: WorkbookState;
  migration: Rev1MigrationResult;
  revision: number;
  localTranscriptionStatus:
    "not-configured" | "checking" | "ready" | "unavailable";
  localTranscriptionMessage: string;
  localTranscriptionPolicy: LocalTranscriptionPolicy | null;
  mirror: MirrorRuntime;
  refresh(): Promise<void>;
  markFoundationComponent(
    component: "morning" | "midday" | "evening",
  ): Promise<void>;
  updateSettings(changes: Partial<AppSettings>): Promise<void>;
  updateWorkbookAnswer(
    day: number,
    promptId: string,
    value: string,
  ): Promise<void>;
  configureLocalTranscription(
    accessToken: string,
    baseUrl?: string,
  ): Promise<void>;
  clearLocalTranscription(): Promise<void>;
  processTranscriptionQueue(): Promise<{
    completed: string[];
    failed: string[];
  }>;
  deleteVoiceRecording(
    recordingId: string,
    selection?: DeleteRecordingSelection,
  ): Promise<{
    local: DeleteRecordingResult;
    remote: "deleted" | "not_found" | null;
  }>;
}

export interface MirrorClientJob {
  id: string;
  status:
    | "queued_local"
    | "submitted"
    | "processing"
    | "complete"
    | "retry_wait"
    | "failed";
  prompt: string;
  sourceRecordIds: string[];
  createdAt: string;
  updatedAt: string;
  remoteJobId: string | null;
  resultText: string | null;
  resultCitations: MirrorCitation[];
  resultId: string | null;
  resultProviderType: MirrorProviderType | null;
  resultProvider: string | null;
  resultModel: string | null;
  resultQuery: string | null;
  resultSourceRecordIds: string[];
  resultProposedQuestion: string | null;
  resultProposedAction: string | null;
  resultDisposition: MirrorDisposition | null;
  resultRevisionCount: number;
  resultRevisionHistory: MirrorResultRevision[];
  resultAnnotation: string | null;
  lastError: string | null;
}

export interface MirrorRuntime {
  connectivity: "offline" | "checking" | "online";
  coreStatus: "ready" | "error";
  policy: MirrorServicePolicy | null;
  jobs: MirrorClientJob[];
  notificationPermission: NotificationPermission | "unsupported";
  refresh(): Promise<void>;
  connect(): Promise<void>;
  enqueue(input: {
    prompt: string;
    sourceRecordIds: string[];
  }): Promise<string>;
  retry(jobId: string): Promise<void>;
  deleteRequest(input: {
    requestId: string;
    remoteJobId: string | null;
  }): Promise<void>;
  deleteReflection(input: {
    requestId: string;
    resultId: string;
    remoteJobId: string | null;
  }): Promise<void>;
  restoreRequest(requestId: string): Promise<void>;
  restoreReflection(input: {
    requestId: string;
    resultId: string;
  }): Promise<void>;
  purgeRequest(input: {
    requestId: string;
    remoteJobId: string | null;
  }): Promise<void>;
  purgeReflection(input: {
    requestId: string;
    resultId: string;
    remoteJobId: string | null;
  }): Promise<void>;
  requestNotifications(): Promise<void>;
}

export const QctpContext = createContext<QctpRuntime | null>(null);

export function useQctp(): QctpRuntime {
  const value = useContext(QctpContext);
  if (!value) throw new Error("QCTP local runtime is unavailable.");
  return value;
}
