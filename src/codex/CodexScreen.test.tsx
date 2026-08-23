import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { QctpContext, type QctpRuntime } from "../app/qctp-context";
import { CodexScreen } from "../app/screens/CodexScreen";
import {
  createQctpRepository,
  deleteQctpDatabase,
  type QctpRepository,
} from "../data";
import { TranscriptSchema } from "../domain";

import {
  buildDerivedNote,
  buildRecord,
  draftFromDerivedNote,
  draftFromRecord,
} from "./workflows";

const now = "2026-08-17T12:00:00.000Z";
let databaseName: string;
let repository: QctpRepository;
let runtime: QctpRuntime;

beforeEach(async () => {
  databaseName = `qctp-codex-ui-${crypto.randomUUID()}`;
  repository = await createQctpRepository({ name: databaseName });
  await repository.initializeDefaults(now);
  const foundation = await repository.getFoundationState();
  const settings = await repository.getSettings();
  const workbook = await repository.getWorkbookState();
  const breathProfile = await repository.getBreathProfile("breath-profile");
  if (!foundation || !settings || !workbook || !breathProfile) {
    throw new Error("Test defaults were not initialized.");
  }
  runtime = {
    repository,
    foundation,
    settings,
    workbook,
    breathProfile,
    breathSessions: [],
    stateCapabilities: [],
    stateSessions: [],
    migration: {
      status: "no_source",
      fingerprint: null,
      ledgerId: null,
      importedEntityIds: [],
      warnings: [],
    },
    revision: 0,
    localTranscriptionStatus: "not-configured",
    localTranscriptionMessage: "Local transcription is not connected.",
    localTranscriptionPolicy: null,
    notifications: {
      permission: "unsupported",
      deliveryMode: "BEST_EFFORT_WHILE_APP_ACTIVE_WITH_DURABLE_IN_APP_FALLBACK",
      requestPermission: () => Promise.resolve(),
    },
    mirror: {
      connectivity: "offline",
      coreStatus: "ready",
      policy: null,
      jobs: [],
      notificationPermission: "unsupported",
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
    updateReminderPreferences: () => Promise.resolve(),
    updateWorkbookAnswer: () => Promise.resolve(),
    updateQuickBreathPreferences: () => Promise.resolve(),
    saveBreathSession: () => Promise.resolve(),
    saveStateSession: () => Promise.resolve(),
    saveStateCapability: () => Promise.resolve(),
    configureLocalTranscription: () => Promise.resolve(),
    clearLocalTranscription: () => Promise.resolve(),
    processTranscriptionQueue: () =>
      Promise.resolve({ completed: [], failed: [] }),
    deleteVoiceRecording: async (recordingId, selection) => ({
      local: await repository.deleteRecording(recordingId, selection),
      remote: null,
    }),
  };
});

afterEach(async () => {
  cleanup();
  repository.close();
  await deleteQctpDatabase(databaseName);
});

function renderCodex(targetRecordId: string | null = null) {
  return render(
    <QctpContext.Provider value={runtime}>
      <CodexScreen targetRecordId={targetRecordId} />
    </QctpContext.Provider>,
  );
}

describe("CodexScreen local workflows", () => {
  it("keeps an exact linked record selected outside the current filter", async () => {
    const target = buildRecord(
      {
        ...draftFromRecord(),
        title: "Linked dream evidence",
        kind: "dream",
        observation: "Exact linked observation.",
      },
      null,
      now,
      () => "linked-dream",
    );
    await repository.saveRecord(target);

    const user = userEvent.setup();
    renderCodex(target.id);
    await screen.findByRole("heading", { name: target.title });
    await user.selectOptions(
      screen.getByLabelText(/^Record type$/u),
      "lab_result",
    );

    expect(
      await screen.findByText("Opened from link · outside current filter"),
    ).toBeVisible();
    expect(screen.getByLabelText(/^Record type$/u)).toHaveValue("lab_result");
    expect(screen.getByRole("heading", { name: target.title })).toBeVisible();
    expect(
      screen.getByRole("link", { name: new RegExp(target.title, "u") }),
    ).toHaveAttribute("aria-current", "location");
  });

  it("preserves a missing target without substituting the first record", async () => {
    const existing = buildRecord(
      {
        ...draftFromRecord(),
        title: "Unrelated local record",
        observation: "Must not be opened as a fallback.",
      },
      null,
      now,
      () => "unrelated-record",
    );
    await repository.saveRecord(existing);

    const before = await repository.listRecords();
    const { container } = renderCodex("missing-record");
    expect(
      await screen.findByText("This record is unavailable on this device."),
    ).toBeVisible();
    expect(container.querySelector(".codex-detail")).toBeNull();
    expect(screen.getByText("Unrelated local record")).toBeVisible();
    expect(await repository.listRecords()).toEqual(before);
  });

  it("keeps a deleted deep-link target on its exact unavailable hold", async () => {
    const target = buildRecord(
      {
        ...draftFromRecord(),
        title: "Delete exact target",
        observation: "The route must remain exact after deletion.",
      },
      null,
      now,
      () => "delete-exact-target",
    );
    await repository.saveRecord(target);
    window.location.hash = "#/codex/record/delete-exact-target";

    const user = userEvent.setup();
    renderCodex(target.id);
    await screen.findByRole("heading", { name: target.title });
    await user.click(
      screen.getByRole("button", { name: "Open deletion controls" }),
    );
    await user.click(
      screen.getByRole("checkbox", { name: /Linked Codex record/u }),
    );
    await user.type(screen.getByLabelText(/Type DELETE to confirm/u), "DELETE");
    await user.click(
      screen.getByRole("button", { name: "Delete selected layers" }),
    );

    expect(
      await screen.findByText("This record is unavailable on this device."),
    ).toBeVisible();
    expect(window.location.hash).toBe("#/codex/record/delete-exact-target");
    expect(await repository.getRecord(target.id)).toBeUndefined();
  });

  it("uses canonical backlinks and resets transient drafts when the target changes", async () => {
    const recordB = buildRecord(
      {
        ...draftFromRecord(),
        title: "Record B",
        observation: "Second exact record.",
      },
      null,
      now,
      () => "record-b",
    );
    const recordA = {
      ...buildRecord(
        {
          ...draftFromRecord(),
          title: "Record A",
          observation: "First exact record.",
        },
        null,
        now,
        () => "record-a",
      ),
      backlinks: [{ recordId: recordB.id, relationship: "supports" }],
    };
    await repository.saveRecord(recordB);
    await repository.saveRecord(recordA);

    const user = userEvent.setup();
    const view = renderCodex(recordA.id);
    await screen.findByRole("heading", { name: "Record A" });
    expect(screen.getByRole("link", { name: recordB.id })).toHaveAttribute(
      "href",
      "#/codex/record/record-b",
    );
    await user.click(screen.getByRole("button", { name: "Edit record" }));
    expect(screen.getByRole("heading", { name: "Edit record" })).toBeVisible();

    view.rerender(
      <QctpContext.Provider value={runtime}>
        <CodexScreen targetRecordId={recordB.id} />
      </QctpContext.Provider>,
    );
    await screen.findByRole("heading", { name: "Record B" });
    await waitFor(() =>
      expect(view.container.querySelector(".codex-detail")).toHaveFocus(),
    );
    expect(screen.queryByRole("heading", { name: "Edit record" })).toBeNull();
  });

  it("creates a manual record with separate evidence and interpretation", async () => {
    const user = userEvent.setup();
    renderCodex();
    await screen.findByText(/ready for its first record/i);

    await user.click(
      screen.getByRole("button", { name: /create manual record/i }),
    );
    await user.type(screen.getByLabelText(/^Title$/u), "Morning observation");
    await user.selectOptions(screen.getByLabelText(/^Kind$/u), "dream");
    await user.selectOptions(
      screen.getByLabelText(/^Destination$/u),
      "foundation",
    );
    await user.type(
      screen.getByLabelText(/^Raw observation/u),
      "A bright blue circle appeared before waking.",
    );
    await user.type(
      screen.getByLabelText(/^Optional interpretation$/u),
      "It may reflect yesterday's geometry practice.",
    );
    await user.type(
      screen.getByLabelText(/^Accepted record tags/u),
      "dream, geometry, DREAM",
    );
    await user.click(
      screen.getByRole("button", { name: /create local record/i }),
    );

    await screen.findByRole("heading", { name: "Morning observation" });
    const records = await repository.listRecords();
    expect(records).toHaveLength(1);
    expect(records[0]?.kind).toBe("dream");
    expect(records[0]?.pathId).toBe("foundation-path");
    expect(records[0]?.tags).toEqual(["dream", "geometry"]);
    expect(records[0]?.observation?.text).toContain("blue circle");
    expect(records[0]?.interpretation?.text).toContain("may reflect");
    expect(records[0]?.interpretation?.basedOnEvidenceIds).toEqual([
      records[0]?.observation?.id,
    ]);
  }, 10_000);

  it("selectively deletes clean notes while preserving transcript and audio", async () => {
    const record = buildRecord(
      {
        ...draftFromRecord(),
        title: "Layered voice record",
        observation: "Directly observed text.",
      },
      null,
      now,
      (prefix) => `${prefix}-fixture`,
    );
    await repository.saveRecord({
      ...record,
      fields: { ...record.fields, voiceRecordingId: "recording-1" },
    });
    await repository.saveRecording({
      schemaVersion: 1,
      id: "recording-1",
      createdAt: now,
      updatedAt: now,
      acceptedAt: now,
      durationMs: 1_000,
      captureMode: null,
      requestedDurationMs: null,
      captureContext: null,
      completedByDurationLimit: null,
      mimeType: "audio/webm",
      sizeBytes: 0,
      localBlobRef: "recording-1",
      remoteObjectRef: null,
      destinationType: "codex",
      destinationId: record.id,
      status: "LOCAL_ONLY",
      segments: [
        {
          id: "segment-1",
          sequence: 0,
          startedAt: now,
          endedAt: now,
          durationMs: 1_000,
          mimeType: "audio/webm",
          sizeBytes: 0,
          chunkIds: [],
        },
      ],
      transcriptionRoute: "local_only",
      provider: null,
      model: null,
      checksumSha256: null,
      retentionPolicy: "keep",
      failureCode: null,
      failureMessage: null,
      deletedAt: null,
    });
    await repository.appendAudioChunk(
      "recording-1",
      "segment-1",
      await new Response("raw", {
        headers: { "content-type": "audio/webm" },
      }).blob(),
    );
    const transcript = TranscriptSchema.parse({
      schemaVersion: 1,
      id: "transcript-1",
      recordingId: "recording-1",
      provider: "px13-local-whisper",
      model: "base",
      language: "en",
      originalText: "Immutable verbatim source.",
      correctedText: null,
      corrections: [],
      timestamps: [],
      confidenceMetadata: {},
      createdAt: now,
      correctedAt: null,
    });
    await repository.saveTranscript(transcript);
    await repository.saveDerivedNote(
      buildDerivedNote(
        {
          ...draftFromDerivedNote(null, record.title),
          cleanText: "Cleaned account.",
          suggestedTags: "review",
        },
        transcript.id,
        null,
        now,
        (prefix) => `${prefix}-fixture`,
      ),
    );

    const user = userEvent.setup();
    renderCodex();
    await screen.findByRole("heading", { name: record.title });
    await user.click(
      screen.getByRole("button", { name: /open deletion controls/i }),
    );
    await user.click(
      screen.getByRole("checkbox", { name: /all clean derived notes/i }),
    );
    await user.type(screen.getByLabelText(/type delete to confirm/i), "DELETE");
    await user.click(
      screen.getByRole("button", { name: /delete selected layers/i }),
    );

    await screen.findByText(/selected local layers deleted/i);
    await waitFor(async () => {
      expect(
        await repository.getDerivedNotesForTranscript(transcript.id),
      ).toHaveLength(0);
    });
    expect(await repository.getTranscript(transcript.id)).toBeDefined();
    expect(await repository.listAudioChunks("recording-1")).toHaveLength(1);
    expect(await repository.getRecord(record.id)).toBeDefined();
  });

  it("discards an interrupted unlinked recording after typed confirmation", async () => {
    await repository.saveRecording({
      schemaVersion: 1,
      id: "orphan-recording",
      createdAt: now,
      updatedAt: now,
      acceptedAt: null,
      durationMs: 2_000,
      captureMode: null,
      requestedDurationMs: null,
      captureContext: null,
      completedByDurationLimit: null,
      mimeType: "audio/webm",
      sizeBytes: 0,
      localBlobRef: "orphan-recording",
      remoteObjectRef: null,
      destinationType: "unclassified",
      destinationId: null,
      status: "LOCAL_ONLY",
      segments: [
        {
          id: "orphan-segment",
          sequence: 0,
          startedAt: now,
          endedAt: now,
          durationMs: 2_000,
          mimeType: "audio/webm",
          sizeBytes: 0,
          chunkIds: [],
        },
      ],
      transcriptionRoute: "local_only",
      provider: null,
      model: null,
      checksumSha256: null,
      retentionPolicy: "keep",
      failureCode: null,
      failureMessage: null,
      deletedAt: null,
    });
    await repository.appendAudioChunk(
      "orphan-recording",
      "orphan-segment",
      await new Response("partial raw audio", {
        headers: { "content-type": "audio/webm" },
      }).blob(),
    );

    const user = userEvent.setup();
    renderCodex();
    await screen.findByRole("heading", { name: /unlinked local recordings/i });
    await user.click(
      screen.getByRole("button", { name: "Discard orphan-recording" }),
    );
    await user.type(
      screen.getByLabelText(/type delete to discard orphan-recording/i),
      "DELETE",
    );
    await user.click(
      screen.getByRole("button", { name: /discard recording stack/i }),
    );

    await screen.findByText(/unlinked local recording discarded/i);
    await waitFor(async () => {
      expect(await repository.getRecording("orphan-recording")).toBeUndefined();
    });
    expect(await repository.listAudioChunks("orphan-recording")).toHaveLength(
      0,
    );
    expect(
      screen.queryByRole("heading", { name: /unlinked local recordings/i }),
    ).not.toBeInTheDocument();
  });

  it("locks a foreign active capture against playback and deletion", async () => {
    await repository.saveRecording({
      schemaVersion: 1,
      id: "foreign-active-recording",
      createdAt: now,
      updatedAt: now,
      acceptedAt: null,
      durationMs: 0,
      captureMode: "quick",
      requestedDurationMs: null,
      captureContext: { type: "global" },
      completedByDurationLimit: null,
      mimeType: "audio/webm",
      sizeBytes: 0,
      localBlobRef: "foreign-active-recording",
      remoteObjectRef: null,
      destinationType: "unclassified",
      destinationId: null,
      status: "CAPTURING",
      segments: [
        {
          id: "foreign-active-segment",
          sequence: 0,
          startedAt: now,
          endedAt: now,
          durationMs: 0,
          mimeType: "audio/webm",
          sizeBytes: 0,
          chunkIds: [],
        },
      ],
      captureOwnerId: "other-qctp-tab",
      captureLeaseExpiresAt: "2099-08-17T12:00:00.000Z",
      transcriptionRoute: "local_only",
      provider: null,
      model: null,
      checksumSha256: null,
      retentionPolicy: "keep",
      failureCode: null,
      failureMessage: null,
      deletedAt: null,
    });

    renderCodex();
    await screen.findByText(/active capture in another QCTP tab/i);
    expect(
      screen.queryByRole("button", {
        name: "Discard foreign-active-recording",
      }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/load local playback/i)).not.toBeInTheDocument();
    await expect(
      repository.deleteRecording("foreign-active-recording"),
    ).rejects.toThrow(/still active/u);
    expect(
      await repository.getRecording("foreign-active-recording"),
    ).toMatchObject({ status: "CAPTURING", captureOwnerId: "other-qctp-tab" });
  });
});
