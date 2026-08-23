import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { CapturePersistence } from "./browser-recorder";
import { VoiceRecorderPanel } from "./VoiceRecorderPanel";

class PanelMediaRecorder extends EventTarget {
  static isTypeSupported(type: string): boolean {
    return type.startsWith("audio/webm");
  }

  readonly mimeType: string;
  state: RecordingState = "inactive";

  constructor(_stream: MediaStream, options?: MediaRecorderOptions) {
    super();
    this.mimeType = options?.mimeType ?? "audio/webm";
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
}

describe("VoiceRecorderPanel lifecycle controls", () => {
  const stopTrack = vi.fn();
  const discard = vi.fn<(recordingId: string) => Promise<void>>(() =>
    Promise.resolve(),
  );
  const persistence: CapturePersistence = {
    begin: () => Promise.resolve(0),
    appendChunk: () => Promise.resolve(),
    finalize: (_recordingId, _durationMs, mimeType) =>
      new Response("audio", {
        headers: { "content-type": mimeType },
      }).blob(),
    recoverInterrupted: () => Promise.resolve(null),
    discard,
  };

  beforeEach(() => {
    stopTrack.mockClear();
    discard.mockClear();
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: () =>
          Promise.resolve({
            getTracks: () => [{ stop: stopTrack }],
          } as unknown as MediaStream),
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
    fireEvent.click(cancel);
    expect(confirm).toHaveBeenCalledOnce();
    expect(discard).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    fireEvent.click(cancel);
    await waitFor(() => expect(discard).toHaveBeenCalledOnce());
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
        sessionId="practice-one"
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
        sessionId: "practice-one",
        title: "Day 1 raw observation",
        tags: ["raw-observation", "day-1"],
        queueLocalTranscription: true,
      }),
    );
    releaseAccept?.();
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });
});
