import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  createQctpRepository,
  deleteQctpDatabase,
  type QctpRepository,
} from "../../data";
import {
  CodexRecordSchema,
  MirrorRequestSchema,
  MirrorResultSchema,
} from "../../domain";
import { QctpContext, type QctpRuntime } from "../qctp-context";

import { MirrorScreen } from "./MirrorScreen";

const createdAt = "2026-08-17T12:00:00.000Z";
const deletedAt = "2026-08-17T12:10:00.000Z";

let databaseName: string;
let repository: QctpRepository;
let runtime: QctpRuntime;

function request(id: string, remoteJobId: string | null, attempts: number) {
  return MirrorRequestSchema.parse({
    schemaVersion: 1,
    id,
    prompt: `Prompt for ${id}`,
    sourceRecordIds: ["source-1"],
    sourceSnapshots: [
      {
        recordId: "source-1",
        title: "Exact source title",
        kind: "mirror",
        excerpt: "Exact immutable source excerpt.",
        recordUpdatedAt: createdAt,
      },
    ],
    status: remoteJobId ? "COMPLETE" : "QUEUED_LOCAL",
    remoteJobId,
    attempts,
    nextAttemptAt: null,
    lastError: null,
    createdAt,
    updatedAt: deletedAt,
    deletedAt,
  });
}

async function seedDeletedItems(): Promise<void> {
  await repository.saveRecord(
    CodexRecordSchema.parse({
      schemaVersion: 1,
      id: "source-1",
      kind: "mirror",
      title: "Exact source title",
      createdAt,
      updatedAt: createdAt,
      observation: null,
      interpretation: null,
      tags: ["symbol:circle"],
      backlinks: [],
      sourceLinks: [],
      attachmentIds: [],
      revisionIds: [],
      pathId: null,
      sessionId: null,
      fields: {},
      deletedAt: null,
    }),
  );
  await repository.saveMirrorRequest(request("request-only", null, 0));

  await repository.saveMirrorRequest(
    MirrorRequestSchema.parse({
      ...request("request-paired", "remote-paired", 1),
      deletedAt: null,
      updatedAt: createdAt,
      status: "PROCESSING",
    }),
  );
  await repository.saveMirrorResult(
    MirrorResultSchema.parse({
      schemaVersion: 1,
      id: "result-paired",
      requestId: "request-paired",
      remoteJobId: "remote-paired",
      text: "Generated reflection with exact provenance.",
      citations: [
        {
          recordId: "source-1",
          title: "Exact source title",
          excerpt: "Exact immutable source excerpt.",
        },
      ],
      providerType: "local_model",
      provider: "px13-local",
      model: "test-model",
      query: "Prompt for request-paired",
      sourceRecordIds: ["source-1"],
      proposedQuestion: "What changed?",
      proposedAction: "Record one observation.",
      disposition: "unreviewed",
      revisionHistory: [],
      annotation: null,
      createdAt,
      deletedAt: null,
    }),
  );
  await repository.deleteMirrorReflection(
    "request-paired",
    "result-paired",
    deletedAt,
  );

  const feedback = await repository.reviewMirrorInsight(
    {
      insightKey: "symbol:circle",
      kind: "symbol",
      label: "circle evidence",
      sourceRecordIds: ["source-1"],
      action: "accepted",
    },
    createdAt,
  );
  await repository.deleteMirrorInsightFeedback(feedback.id, deletedAt);
}

function renderMirror(): void {
  render(
    <QctpContext.Provider value={runtime}>
      <MirrorScreen />
    </QctpContext.Provider>,
  );
}

beforeEach(async () => {
  databaseName = `mirror-screen-deletion-${crypto.randomUUID()}`;
  repository = await createQctpRepository({ name: databaseName });
  await repository.initializeDefaults(createdAt);
  await seedDeletedItems();
  const foundation = await repository.getFoundationState();
  const settings = await repository.getSettings();
  const workbook = await repository.getWorkbookState();
  if (!foundation || !settings || !workbook)
    throw new Error("Missing defaults");

  runtime = {
    repository,
    foundation,
    settings,
    workbook,
    migration: {
      status: "no_source",
      fingerprint: null,
      ledgerId: null,
      importedEntityIds: [],
      warnings: [],
    },
    revision: 0,
    localTranscriptionStatus: "not-configured",
    localTranscriptionMessage: "Not connected",
    localTranscriptionPolicy: null,
    mirror: {
      connectivity: "offline",
      coreStatus: "ready",
      policy: null,
      jobs: [],
      notificationPermission: "unsupported",
      refresh: () => Promise.resolve(),
      connect: () => Promise.resolve(),
      enqueue: () => Promise.resolve("new-request"),
      retry: () => Promise.resolve(),
      deleteRequest: () => Promise.resolve(),
      deleteReflection: () => Promise.resolve(),
      restoreRequest: async (id) => {
        await repository.restoreMirrorRequest(id);
      },
      restoreReflection: async ({ requestId, resultId }) => {
        await repository.restoreMirrorReflection(requestId, resultId);
      },
      purgeRequest: async ({ requestId }) => {
        await repository.purgeMirrorRequest(requestId);
      },
      purgeReflection: async ({ requestId, resultId }) => {
        await repository.purgeMirrorReflection(requestId, resultId);
      },
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
});

describe("Mirror deleted-items management", () => {
  it("shows preserved layers and restores each deleted artifact type", async () => {
    const user = userEvent.setup();
    renderMirror();

    expect(await screen.findByText("Deleted Mirror items")).toBeVisible();
    expect(await screen.findByText("Result-less request")).toBeVisible();
    expect(screen.getByText("Generated reflection pair")).toBeVisible();
    expect(screen.getByText("Deterministic insight review")).toBeVisible();

    const requestItem = screen
      .getByText("Prompt for request-only")
      .closest("article");
    if (!requestItem) throw new Error("Request deleted item missing");
    await user.click(within(requestItem).getByText(/Exact source snapshots/));
    expect(
      within(requestItem).getByText("Exact immutable source excerpt."),
    ).toBeVisible();
    await user.click(
      within(requestItem).getByRole("button", {
        name: "Restore to local queue",
      }),
    );
    await waitFor(async () => {
      expect(await repository.getMirrorRequest("request-only")).toMatchObject({
        deletedAt: null,
        status: "QUEUED_LOCAL",
      });
    });

    const pairedItem = screen
      .getByText("Prompt for request-paired")
      .closest("article");
    if (!pairedItem) throw new Error("Paired deleted item missing");
    await user.click(
      within(pairedItem).getByRole("button", {
        name: "Restore request + reflection",
      }),
    );
    await waitFor(async () => {
      expect(await repository.getMirrorResult("result-paired")).toBeDefined();
    });

    const feedbackItem = screen.getByText("circle evidence").closest("article");
    if (!feedbackItem) throw new Error("Feedback deleted item missing");
    await user.click(
      within(feedbackItem).getByRole("button", {
        name: "Restore insight review",
      }),
    );
    await waitFor(async () => {
      expect(
        await repository.getMirrorInsightFeedback("symbol:circle"),
      ).toBeDefined();
    });
  });

  it("requires the exact typed purge phrase and preserves the pair when verification fails", async () => {
    const user = userEvent.setup();
    const purge = vi.fn(() =>
      Promise.reject(
        new Error(
          "PX13 deletion could not be verified. The local Mirror reflection was preserved.",
        ),
      ),
    );
    runtime = {
      ...runtime,
      mirror: { ...runtime.mirror, purgeReflection: purge },
    };
    renderMirror();

    const pairedItem = (
      await screen.findByText("Prompt for request-paired")
    ).closest("article");
    if (!pairedItem) throw new Error("Paired deleted item missing");
    const button = within(pairedItem).getByRole("button", {
      name: "Permanently purge",
    });
    const confirmation = within(pairedItem).getByLabelText(
      "Permanent purge confirmation for result-paired",
    );
    expect(button).toBeDisabled();
    await user.type(confirmation, "PURGE result-paire");
    expect(button).toBeDisabled();
    expect(purge).not.toHaveBeenCalled();
    await user.type(confirmation, "d");
    expect(button).toBeEnabled();
    await user.click(button);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "local Mirror reflection was preserved",
    );
    expect(purge).toHaveBeenCalledWith({
      requestId: "request-paired",
      resultId: "result-paired",
      remoteJobId: "remote-paired",
    });
    expect(
      await repository.getMirrorRequest("request-paired", {
        includeDeleted: true,
      }),
    ).toBeDefined();
    expect(
      await repository.getMirrorResult("result-paired", {
        includeDeleted: true,
      }),
    ).toBeDefined();
  });
});
