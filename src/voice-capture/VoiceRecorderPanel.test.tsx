import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getPwaUpdateActivationSafety } from "../app/pwa-update-safety";
import type { CapturePersistence } from "./browser-recorder";
import { VoiceRecorderPanel } from "./VoiceRecorderPanel";

class PanelMediaRecorder extends EventTarget {
  static instances: PanelMediaRecorder[] = [];
  static isTypeSupported(type: string): boolean {
    return type.startsWith("audio/webm");
  }

  readonly mimeType: string;
  state: RecordingState = "inactive";

  constructor(_stream: MediaStream, options?: MediaRecorderOptions) {
    super();
    this.mimeType = options?.mimeType ?? "audio/webm";
    PanelMediaRecorder.instances.push(this);
  }

  start(): void {
    this.state = "recording";
  }

  pause(): void {
    this.state = "paused";
  }

  resume(): void {
    this.state = "recording";
  }

  stop(): void {
    this.state = "inactive";
    this.dispatchEvent(new Event("stop"));
  }

  emitChunk(blob: Blob): void {
    const event = new Event("dataavailable") as BlobEvent;
    Object.defineProperty(event, "data", { value: blob });
    this.dispatchEvent(event);
  }
}

describe("VoiceRecorderPanel lifecycle controls", () => {
  const stopTrack = vi.fn();
  const getUserMedia = vi.fn(() =>
    Promise.resolve({
      getTracks: () => [{ stop: stopTrack }],
    } as unknown as MediaStream),
  );
  const begin = vi.fn(() => Promise.resolve(0));
  const discard = vi.fn<(recordingId: string) => Promise<void>>(() =>
    Promise.resolve(),
  );
  const persistence: CapturePersistence = {
    begin,
    appendChunk: () => Promise.resolve(),
    finalize: (_recordingId, _durationMs, mimeType) =>
      new Response("audio", {
        headers: { "content-type": mimeType },
      }).blob(),
    recoverInterrupted: () => Promise.resolve(null),
    discard,
  };

  beforeEach(() => {
    PanelMediaRecorder.instances = [];
    stopTrack.mockClear();
    getUserMedia.mockClear();
    begin.mockClear();
    discard.mockClear();
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia,
      },
    });
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:qctp-test"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    vi.stubGlobal("MediaRecorder", PanelMediaRecorder);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("requires confirmation before deleting an unsaved capture", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const onClose = vi.fn();
    render(
      <VoiceRecorderPanel
        persistence={persistence}
        onAccept={() => Promise.resolve()}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /start recording/i }));
    const cancel = await screen.findByRole("button", { name: "Cancel" });
    expect(getPwaUpdateActivationSafety()).toMatchObject({
      blocked: true,
      reason: "current-tab-critical-activity",
    });
    fireEvent.click(cancel);
    expect(confirm).toHaveBeenCalledOnce();
    expect(discard).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    fireEvent.click(cancel);
    await waitFor(() => expect(discard).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(getPwaUpdateActivationSafety().blocked).toBe(false),
    );
    expect(stopTrack).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("can hide pause and append for a controlled uninterrupted session", async () => {
    render(
      <VoiceRecorderPanel
        persistence={persistence}
        allowPause={false}
        allowAppend={false}
        onAccept={() => Promise.resolve()}
        onClose={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /start recording/i }));
    const stop = await screen.findByRole("button", { name: "Stop" });
    expect(
      screen.queryByRole("button", { name: "Pause" }),
    ).not.toBeInTheDocument();
    fireEvent.click(stop);
    await screen.findByRole("button", { name: /save locally/i });
    expect(
      screen.queryByRole("button", { name: /append segment/i }),
    ).not.toBeInTheDocument();
  });

  it("announces that the microphone is off while durable review is still finalizing", async () => {
    let releaseFinalize: ((blob: Blob) => void) | undefined;
    const durableBlob = await new Response("durable-audio", {
      headers: { "content-type": "audio/webm" },
    }).blob();
    const delayedPersistence: CapturePersistence = {
      ...persistence,
      finalize: () =>
        new Promise<Blob>((resolve) => {
          releaseFinalize = resolve;
        }),
    };
    render(
      <VoiceRecorderPanel
        persistence={delayedPersistence}
        onAccept={() => Promise.resolve()}
        onClose={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /start recording/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Stop" }));

    expect(
      await screen.findByText("Microphone off — securing local audio"),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Stop" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Cancel" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /save locally/i }),
    ).not.toBeInTheDocument();

    releaseFinalize?.(durableBlob);
    expect(
      await screen.findByText("Stopped — locally safe and ready to review"),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: /save locally/i })).toBeVisible();
  });

  it("keeps a debrief classified, queues offline, and latches rapid acceptance", async () => {
    let releaseAccept: (() => void) | undefined;
    const onAccept = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          releaseAccept = resolve;
        }),
    );
    const onClose = vi.fn();
    render(
      <VoiceRecorderPanel
        persistence={persistence}
        mode="debrief"
        initialDestination="codex"
        captureContext={{
          type: "practice-debrief",
          practiceSessionId: "practice-one",
        }}
        initialTitle="Day 1 raw observation"
        initialTags={["raw-observation", "day-1"]}
        defaultQueueLocalTranscription
        localTranscriptionAvailable={false}
        onAccept={onAccept}
        onClose={onClose}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /start recording/i }));
    fireEvent.click(await screen.findByRole("button", { name: "Stop" }));
    const save = await screen.findByRole("button", {
      name: /save locally & queue/i,
    });
    expect(screen.queryByLabelText("Title")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Tags")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Destination")).not.toBeInTheDocument();
    expect(
      screen.getByRole("checkbox", {
        name: /queue no-cost local px13 transcription/i,
      }),
    ).toBeChecked();
    fireEvent.click(save);
    fireEvent.click(save);
    expect(onAccept).toHaveBeenCalledOnce();
    expect(onAccept).toHaveBeenCalledWith(
      expect.objectContaining({
        destination: "codex",
        captureMode: "debrief",
        context: {
          type: "practice-debrief",
          practiceSessionId: "practice-one",
        },
        requestedDurationMinutes: null,
        completedByDurationLimit: false,
        title: "Day 1 raw observation",
        tags: ["raw-observation", "day-1"],
        queueLocalTranscription: true,
      }),
    );
    releaseAccept?.();
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });

  it("offers global Quick and 5-, 10-, or 20-minute Auto-Dictation before permission", () => {
    render(
      <VoiceRecorderPanel
        persistence={persistence}
        allowModeSelection
        onAccept={() => Promise.resolve()}
        onClose={() => undefined}
      />,
    );

    expect(getUserMedia).not.toHaveBeenCalled();
    expect(
      screen.getByRole("radio", { name: /quick voice note/i }),
    ).toBeChecked();
    expect(
      screen.queryByRole("group", { name: "Auto-Dictation duration" }),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("radio", { name: /timed auto-dictation/i }),
    );
    const durationGroup = screen.getByRole("group", {
      name: "Auto-Dictation duration",
    });
    expect(durationGroup).toBeVisible();
    expect(screen.getByRole("radio", { name: "5 minutes" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "10 minutes" })).toBeVisible();
    expect(screen.getByRole("radio", { name: "20 minutes" })).toBeVisible();
    fireEvent.click(screen.getByRole("radio", { name: "10 minutes" }));
    expect(
      screen.getByRole("button", {
        name: "Start 10-minute Auto-Dictation",
      }),
    ).toBeVisible();
    expect(screen.getByRole("timer")).toHaveAccessibleName(
      "10 minutes 0 seconds remaining",
    );
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it("persists and accepts an early-stopped timed capture with typed metadata", async () => {
    const onAccept = vi.fn(() => Promise.resolve());
    const view = render(
      <VoiceRecorderPanel
        persistence={persistence}
        allowModeSelection
        onAccept={onAccept}
        onClose={() => undefined}
      />,
    );

    fireEvent.click(
      screen.getByRole("radio", { name: /timed auto-dictation/i }),
    );
    fireEvent.click(screen.getByRole("radio", { name: "20 minutes" }));
    fireEvent.click(
      screen.getByRole("button", {
        name: "Start 20-minute Auto-Dictation",
      }),
    );
    fireEvent.click(await screen.findByRole("button", { name: "Stop" }));

    await screen.findByText(/Stopped early at/u);
    expect(
      screen.queryByRole("button", { name: "Append segment" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("meter")).toHaveAttribute("aria-valuemin", "0");
    expect(
      screen.getByRole("checkbox", { name: /queue no-cost local/i }),
    ).toBeChecked();
    expect(view.container.querySelector("audio")).toHaveAttribute(
      "src",
      "blob:qctp-test",
    );
    expect(begin).toHaveBeenCalledWith(
      expect.objectContaining({
        captureMode: "auto-dictation",
        requestedDurationMs: 1_200_000,
        captureContext: { type: "global" },
      }),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Save locally & queue" }),
    );
    await waitFor(() => expect(onAccept).toHaveBeenCalledOnce());
    expect(onAccept).toHaveBeenCalledWith(
      expect.objectContaining({
        captureMode: "auto-dictation",
        requestedDurationMinutes: 20,
        completedByDurationLimit: false,
        context: { type: "global" },
        queueLocalTranscription: true,
      }),
    );
  });

  it("keeps REG-style controlled Auto-Dictation fixed at five minutes", () => {
    render(
      <VoiceRecorderPanel
        persistence={persistence}
        mode="auto-dictation"
        fixedAutoDurationMinutes={5}
        captureContext={{ type: "reg-session", regSessionId: "reg-one" }}
        onAccept={() => Promise.resolve()}
        onClose={() => undefined}
      />,
    );

    expect(screen.getByText("Controlled duration: 5 minutes")).toBeVisible();
    expect(
      screen.queryByRole("radio", { name: "10 minutes" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Start 5-minute Auto-Dictation" }),
    ).toBeVisible();
  });

  it("offers recovered playable audio for review after a later chunk failure", async () => {
    const recoveredBlob = await new Response("recovered-audio", {
      headers: { "content-type": "audio/webm" },
    }).blob();
    const appendChunk = vi
      .fn<CapturePersistence["appendChunk"]>()
      .mockResolvedValueOnce()
      .mockRejectedValueOnce(new Error("quota interruption"));
    const recoverInterrupted = vi
      .fn<CapturePersistence["recoverInterrupted"]>()
      .mockResolvedValue(recoveredBlob);
    const recoveredPersistence: CapturePersistence = {
      ...persistence,
      appendChunk,
      recoverInterrupted,
    };
    const onAccept = vi.fn(() => Promise.resolve());
    render(
      <VoiceRecorderPanel
        persistence={recoveredPersistence}
        onAccept={onAccept}
        onClose={() => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /start recording/i }));
    await waitFor(() => expect(PanelMediaRecorder.instances).toHaveLength(1));
    const recorder = PanelMediaRecorder.instances[0];
    if (!recorder) throw new Error("Panel recorder was not created.");
    recorder.emitChunk(new Blob(["kept"], { type: "audio/webm" }));
    await waitFor(() => expect(appendChunk).toHaveBeenCalledOnce());
    recorder.emitChunk(new Blob(["failed"], { type: "audio/webm" }));

    expect(
      await screen.findByText(
        "Recording interrupted — recovered audio is safe locally and ready to review",
      ),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: /save locally/i })).toBeVisible();
    expect(document.querySelector("audio")).toHaveAttribute(
      "src",
      "blob:qctp-test",
    );
    fireEvent.click(screen.getByRole("button", { name: /save locally/i }));
    await waitFor(() => expect(onAccept).toHaveBeenCalledOnce());
  });
});
