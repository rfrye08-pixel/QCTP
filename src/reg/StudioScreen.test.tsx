import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { QctpContext, type QctpRuntime } from "../app/qctp-context";
import { StudioScreen } from "../app/screens/StudioScreen";
import {
  createQctpRepository,
  deleteQctpDatabase,
  type QctpRepository,
} from "../data";

import { REG01_SESSION_ID, REG01_STEPS } from "./reg01";

let databaseName: string;
let repository: QctpRepository;
let runtime: QctpRuntime;

beforeEach(async () => {
  databaseName = `qctp-reg-ui-${crypto.randomUUID()}`;
  repository = await createQctpRepository({ name: databaseName });
  await repository.initializeDefaults("2026-08-17T12:00:00.000Z");
  const foundation = await repository.getFoundationState();
  const settings = await repository.getSettings();
  const workbook = await repository.getWorkbookState();
  if (!foundation || !settings || !workbook)
    throw new Error("Test defaults were not initialized.");
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
    localTranscriptionMessage: "Local transcription is not connected.",
    localTranscriptionPolicy: null,
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
  repository.close();
  await deleteQctpDatabase(databaseName);
});

function renderStudio() {
  return render(
    <QctpContext.Provider value={runtime}>
      <StudioScreen />
    </QctpContext.Provider>,
  );
}

describe("StudioScreen REG-01-A", () => {
  it("persists every gate, completes atomically, and resumes the trace on reload", async () => {
    const user = userEvent.setup();
    const firstRender = renderStudio();
    await screen.findByRole("heading", { name: "Learn to See" });

    for (const step of REG01_STEPS) {
      await user.click(
        screen.getByRole("checkbox", {
          name: new RegExp(step.slice(0, 35), "i"),
        }),
      );
    }

    fireEvent.change(screen.getByLabelText(/Raw observation \*/i), {
      target: {
        value:
          "The shared chord is vertical and the second circle is slightly lighter.",
      },
    });
    fireEvent.change(screen.getByLabelText(/Meaning, symbolism/i), {
      target: { value: "I associate the overlap with cooperation." },
    });
    fireEvent.change(screen.getByLabelText(/Raw auto-dictation text/i), {
      target: {
        value:
          "Constructing showed exactly where my hand rushed and corrected itself.",
      },
    });
    fireEvent.change(
      screen.getByLabelText(/One practical daily-life application/i),
      {
        target: {
          value:
            "Name the visible facts before deciding what another person intended.",
        },
      },
    );
    fireEvent.change(screen.getByLabelText(/Later review/i), {
      target: {
        value: "The pause reduced certainty and made room for a question.",
      },
    });
    await user.click(screen.getByRole("checkbox", { name: /I practiced/i }));

    const file = new File(
      [new Uint8Array([137, 80, 78, 71])],
      "two-circles.png",
      {
        type: "image/png",
      },
    );
    await user.upload(
      screen.getByLabelText(/Photograph or choose image/i),
      file,
    );

    await waitFor(async () => {
      expect(
        (await repository.getRegSession(REG01_SESSION_ID))?.attachmentIds,
      ).toHaveLength(1);
    });
    const acceptedAt = "2026-08-17T12:10:00.000Z";
    await repository.saveRecording({
      schemaVersion: 1,
      id: "reg-ui-auto-recording",
      createdAt: acceptedAt,
      updatedAt: acceptedAt,
      acceptedAt,
      durationMs: 5 * 60 * 1_000,
      mimeType: "audio/webm",
      sizeBytes: 0,
      localBlobRef: "reg-ui-auto-recording",
      remoteObjectRef: null,
      destinationType: "studio_geometry",
      destinationId: REG01_SESSION_ID,
      status: "LOCAL_ONLY",
      segments: [
        {
          id: "reg-ui-auto-segment",
          sequence: 0,
          startedAt: acceptedAt,
          endedAt: acceptedAt,
          durationMs: 5 * 60 * 1_000,
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
      "reg-ui-auto-recording",
      "reg-ui-auto-segment",
      await new Response("raw-audio", {
        headers: { "content-type": "audio/webm" },
      }).blob(),
    );
    const beforeLink = await repository.getRegSession(REG01_SESSION_ID);
    if (!beforeLink) throw new Error("REG session was not persisted.");
    await repository.saveRegSession({
      ...beforeLink,
      autoDictationRecordingId: "reg-ui-auto-recording",
      autoDictationDurationMs: 5 * 60 * 1_000,
      updatedAt: acceptedAt,
    });
    firstRender.unmount();
    const resumedRender = renderStudio();
    await screen.findByRole("heading", { name: "Learn to See" });

    const complete = screen.getByRole("button", {
      name: /Complete REG-01 atomically/i,
    });
    await waitFor(() => expect(complete).toBeEnabled());
    await user.click(complete);

    await screen.findByText(
      /completed atomically across Studio, Codex, Mirror/i,
    );
    const storedSession = await repository.getRegSession(REG01_SESSION_ID);
    expect(storedSession?.status).toBe("complete");
    expect(storedSession?.steps.every((step) => step.complete)).toBe(true);
    expect(storedSession?.rawObservation?.text).toContain("shared chord");
    expect(storedSession?.interpretation?.text).toContain("cooperation");
    expect(storedSession?.autoDictation?.text).toContain("my hand rushed");
    expect(storedSession?.attachmentIds).toHaveLength(1);

    const records = await repository.listRecords({ tags: ["reg-01"] });
    expect(records.map((record) => record.kind).sort()).toEqual([
      "auto_dictation",
      "geometry",
      "mirror",
    ]);
    expect(
      records.every((record) => record.sessionId === REG01_SESSION_ID),
    ).toBe(true);
    expect(
      (await repository.getPath("reg-path"))?.completedModuleIds,
    ).toContain("REG-01-A");

    resumedRender.unmount();
    renderStudio();
    await screen.findByText(/REG-01-A complete/i);
    expect(screen.getByText(/Codex auto-dictation/i)).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Complete REG-01 atomically/i }),
    ).not.toBeInTheDocument();
  });
});
