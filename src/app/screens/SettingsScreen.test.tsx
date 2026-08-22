import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createQctpRepository,
  deleteQctpDatabase,
  type QctpRepository,
} from "../../data";
import type {
  Attachment,
  TranscriptionQueueItem,
  VoiceRecording,
} from "../../domain";
import {
  QctpContext,
  type MirrorClientJob,
  type QctpRuntime,
} from "../qctp-context";

import { SettingsScreen } from "./SettingsScreen";

const now = "2026-08-17T12:00:00.000Z";
const mib = 1_024 * 1_024;

let databaseName: string;
let repository: QctpRepository;
let runtimeFixture: QctpRuntime;
let storageDescriptor: PropertyDescriptor | undefined;

const transcriptionQueue: TranscriptionQueueItem[] = [
  {
    schemaVersion: 1,
    id: "transcription-queue-1",
    recordingId: "recording-1",
    status: "QUEUED",
    attempts: 0,
    nextAttemptAt: null,
    lastError: null,
    createdAt: now,
    updatedAt: now,
  },
  {
    schemaVersion: 1,
    id: "transcription-queue-2",
    recordingId: "recording-2",
    status: "RETRY_WAIT",
    attempts: 1,
    nextAttemptAt: "2026-08-17T12:05:00.000Z",
    lastError: "PX13 was temporarily unavailable.",
    createdAt: now,
    updatedAt: now,
  },
];

const recordings: VoiceRecording[] = [
  {
    schemaVersion: 1,
    id: "recording-1",
    createdAt: now,
    updatedAt: now,
    acceptedAt: now,
    durationMs: 60_000,
    mimeType: "audio/webm",
    sizeBytes: 1.5 * mib,
    localBlobRef: "recording-1",
    remoteObjectRef: null,
    destinationType: "codex",
    destinationId: "record-1",
    status: "TRANSCRIPTION_QUEUED",
    segments: [],
    transcriptionRoute: "local_only",
    provider: null,
    model: null,
    checksumSha256: null,
    retentionPolicy: "keep",
    failureCode: null,
    failureMessage: null,
    deletedAt: null,
  },
];

const attachments: Attachment[] = [
  {
    schemaVersion: 1,
    id: "attachment-active",
    parentId: "record-1",
    kind: "image",
    filename: "geometry.png",
    mimeType: "image/png",
    sizeBytes: 0.5 * mib,
    localBlobRef: "attachment-active",
    remoteObjectRef: null,
    checksumSha256: null,
    createdAt: now,
    deletedAt: null,
  },
  {
    schemaVersion: 1,
    id: "attachment-deleted",
    parentId: "record-1",
    kind: "document",
    filename: "deleted.pdf",
    mimeType: "application/pdf",
    sizeBytes: 10 * mib,
    localBlobRef: "attachment-deleted",
    remoteObjectRef: null,
    checksumSha256: null,
    createdAt: now,
    deletedAt: now,
  },
];

function mirrorJob(
  id: string,
  status: MirrorClientJob["status"],
): MirrorClientJob {
  return {
    id,
    status,
    prompt: `Prompt for ${id}`,
    sourceRecordIds: ["record-1"],
    createdAt: now,
    updatedAt: now,
    remoteJobId: null,
    resultText: null,
    resultCitations: [],
    resultId: null,
    resultProviderType: null,
    resultProvider: null,
    resultModel: null,
    resultQuery: null,
    resultSourceRecordIds: [],
    resultProposedQuestion: null,
    resultProposedAction: null,
    resultDisposition: null,
    resultRevisionCount: 0,
    resultRevisionHistory: [],
    resultAnnotation: null,
    lastError: null,
  };
}

function runtimeWithMirror(
  connectivity: QctpRuntime["mirror"]["connectivity"],
  jobs: MirrorClientJob[],
): QctpRuntime {
  return {
    ...runtimeFixture,
    mirror: {
      ...runtimeFixture.mirror,
      connectivity,
      jobs,
    },
  };
}

function renderSettings(runtime = runtimeFixture) {
  return render(
    <QctpContext.Provider value={runtime}>
      <SettingsScreen />
    </QctpContext.Provider>,
  );
}

function definitionValue(term: string): HTMLElement {
  const label = screen.getByText(term, { selector: "dt" });
  const value = label.parentElement?.querySelector("dd");
  if (!(value instanceof HTMLElement)) {
    throw new Error(`No definition value was rendered for ${term}.`);
  }
  return value;
}

beforeEach(async () => {
  databaseName = `qctp-settings-ui-${crypto.randomUUID()}`;
  repository = await createQctpRepository({ name: databaseName });
  await repository.initializeDefaults(now);
  const foundation = await repository.getFoundationState();
  const settings = await repository.getSettings();
  const workbook = await repository.getWorkbookState();
  if (!foundation || !settings || !workbook) {
    throw new Error("Test defaults were not initialized.");
  }

  vi.spyOn(repository, "listTranscriptionQueue").mockResolvedValue(
    transcriptionQueue,
  );
  vi.spyOn(repository, "listRecordings").mockResolvedValue(recordings);
  vi.spyOn(repository, "listAttachments").mockResolvedValue(attachments);

  storageDescriptor = Object.getOwnPropertyDescriptor(navigator, "storage");
  Object.defineProperty(navigator, "storage", {
    configurable: true,
    value: {
      estimate: vi.fn(() =>
        Promise.resolve({ usage: 5 * mib, quota: 20 * mib }),
      ),
    },
  });

  runtimeFixture = {
    repository,
    foundation,
    settings: { ...settings, transcriptionRoute: "local_only" },
    workbook,
    migration: {
      status: "no_source",
      fingerprint: null,
      ledgerId: null,
      importedEntityIds: [],
      warnings: [],
    },
    revision: 0,
    localTranscriptionStatus: "ready",
    localTranscriptionMessage:
      "Connected to the authenticated no-cost PX13 transcription companion.",
    localTranscriptionPolicy: {
      mode: "free-local",
      provider: "px13-local-whisper",
      paidCloudEnabled: false,
      hardSpendLimitUsd: 0,
    },
    mirror: {
      connectivity: "online",
      coreStatus: "ready",
      policy: {
        mode: "free-local",
        provider: "ollama-local",
        model: "qwen2.5:7b",
        paidCloudEnabled: false,
        recurringApiCostUsd: 0,
      },
      jobs: [],
      notificationPermission: "default",
      refresh: () => Promise.resolve(),
      connect: () => Promise.resolve(),
      enqueue: () => Promise.resolve("mirror-request"),
      retry: () => Promise.resolve(),
      deleteRequest: () => Promise.resolve(),
      deleteReflection: () => Promise.resolve(),
      restoreRequest: () => Promise.resolve(),
      restoreReflection: () => Promise.resolve(),
      purgeRequest: () => Promise.resolve(),
      purgeReflection: () => Promise.resolve(),
      requestNotifications: () => Promise.resolve(),
    },
    refresh: () => Promise.resolve(),
    markFoundationComponent: () => Promise.resolve(),
    updateSettings: () => Promise.resolve(),
    updateWorkbookAnswer: () => Promise.resolve(),
    configureLocalTranscription: () => Promise.resolve(),
    clearLocalTranscription: () => Promise.resolve(),
    processTranscriptionQueue: () =>
      Promise.resolve({ completed: [], failed: [] }),
    deleteVoiceRecording: () =>
      Promise.resolve({
        local: {
          deletedChunkIds: [],
          deletedTranscriptIds: [],
          deletedDerivedNoteIds: [],
          remoteObjectsToDelete: [],
        },
        remote: null,
      }),
  };
});

afterEach(async () => {
  cleanup();
  repository.close();
  await deleteQctpDatabase(databaseName);
  if (storageDescriptor) {
    Object.defineProperty(navigator, "storage", storageDescriptor);
  } else {
    Reflect.deleteProperty(navigator, "storage");
  }
});

describe("SettingsScreen controlled local runtime status", () => {
  it("shows the Free Local baseline, local Mirror identity, queue counts, and storage without API-key UI", async () => {
    renderSettings(
      runtimeWithMirror("online", [
        mirrorJob("mirror-queued", "queued_local"),
        mirrorJob("mirror-submitted", "submitted"),
        mirrorJob("mirror-processing", "processing"),
        mirrorJob("mirror-retry", "retry_wait"),
        mirrorJob("mirror-complete", "complete"),
        mirrorJob("mirror-failed", "failed"),
      ]),
    );

    expect(
      screen.getByRole("heading", { name: "Free Local Mode" }),
    ).toBeInTheDocument();
    expect(screen.getByText("$0 recurring")).toBeInTheDocument();
    expect(definitionValue("Mirror Core")).toHaveTextContent(/^On$/u);
    expect(definitionValue("Local AI companion")).toHaveTextContent(
      /^processing$/u,
    );
    expect(definitionValue("Local model/runtime")).toHaveTextContent(
      "ollama-local · qwen2.5:7b",
    );
    expect(definitionValue("Pending local Mirror analyses")).toHaveTextContent(
      /^4$/u,
    );
    expect(definitionValue("Cloud AI")).toHaveTextContent(/^Off$/u);

    await waitFor(() => {
      expect(definitionValue("Pending local transcriptions")).toHaveTextContent(
        /^2$/u,
      );
      expect(definitionValue("Local origin storage use")).toHaveTextContent(
        "5.0 MiB of 20.0 MiB",
      );
      expect(
        definitionValue("Tracked audio and attachment blobs"),
      ).toHaveTextContent("2.0 MiB");
    });

    expect(
      screen.getByText(/No API key is required or accepted by this screen\./u),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("textbox", { name: /API key/iu }),
    ).not.toBeInTheDocument();
    expect(document.querySelector('input[type="password"]')).toBeNull();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it.each([
    {
      label: "connected",
      connectivity: "online" as const,
      jobs: [mirrorJob("mirror-complete", "complete")],
      expected: "connected",
    },
    {
      label: "processing",
      connectivity: "online" as const,
      jobs: [mirrorJob("mirror-processing", "processing")],
      expected: "processing",
    },
    {
      label: "unavailable",
      connectivity: "offline" as const,
      jobs: [mirrorJob("mirror-queued", "queued_local")],
      expected: "unavailable",
    },
  ])(
    "reports the Local AI companion as $label",
    ({ connectivity, jobs, expected }) => {
      renderSettings(runtimeWithMirror(connectivity, jobs));

      expect(definitionValue("Local AI companion")).toHaveTextContent(
        new RegExp(`^${expected}$`, "u"),
      );
    },
  );
});
