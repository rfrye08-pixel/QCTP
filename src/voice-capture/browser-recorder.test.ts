import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  BrowserRecorderSession,
  type CapturePersistence,
} from "./browser-recorder";
import type { RecorderState } from "./recorder-machine";

class FakeMediaRecorder extends EventTarget {
  static instances: FakeMediaRecorder[] = [];
  static reportedMimeType: string | null = null;
  static isTypeSupported(type: string): boolean {
    return type.startsWith("audio/webm");
  }

  readonly mimeType: string;
  state: RecordingState = "inactive";

  constructor(_stream: MediaStream, options?: MediaRecorderOptions) {
    super();
    this.mimeType =
      FakeMediaRecorder.reportedMimeType ?? options?.mimeType ?? "audio/webm";
    FakeMediaRecorder.instances.push(this);
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

interface TestCapturePersistence {
  begin: ReturnType<
    typeof vi.fn<
      (input: Parameters<CapturePersistence["begin"]>[0]) => Promise<number>
    >
  >;
  appendChunk: ReturnType<
    typeof vi.fn<
      (
        recordingId: string,
        index: number,
        chunk: Blob,
        activeDurationMs: number,
      ) => Promise<void>
    >
  >;
  finalize: ReturnType<
    typeof vi.fn<
      (
        recordingId: string,
        durationMs: number,
        mimeType: string,
        completedByDurationLimit?: boolean,
      ) => Promise<Blob>
    >
  >;
  recoverInterrupted: ReturnType<
    typeof vi.fn<
      (
        recordingId: string,
        durationMs: number,
        mimeType: string,
        completedByDurationLimit?: boolean,
      ) => Promise<Blob | null>
    >
  >;
  discard: ReturnType<typeof vi.fn<(recordingId: string) => Promise<void>>>;
}

function createPersistence(): TestCapturePersistence {
  const persistence = {
    begin: vi.fn<
      (input: Parameters<CapturePersistence["begin"]>[0]) => Promise<number>
    >(() => Promise.resolve(0)),
    appendChunk: vi.fn<
      (
        recordingId: string,
        index: number,
        chunk: Blob,
        activeDurationMs: number,
      ) => Promise<void>
    >(() => Promise.resolve()),
    finalize: vi.fn<
      (
        recordingId: string,
        durationMs: number,
        mimeType: string,
        completedByDurationLimit?: boolean,
      ) => Promise<Blob>
    >((_id, _duration, mimeType) =>
      new Response("audio", { headers: { "content-type": mimeType } }).blob(),
    ),
    recoverInterrupted: vi.fn<
      (
        recordingId: string,
        durationMs: number,
        mimeType: string,
        completedByDurationLimit?: boolean,
      ) => Promise<Blob | null>
    >((_id, _duration, mimeType) =>
      new Response("recovered", {
        headers: { "content-type": mimeType },
      }).blob(),
    ),
    discard: vi.fn<(recordingId: string) => Promise<void>>(() =>
      Promise.resolve(),
    ),
  } satisfies CapturePersistence;
  return persistence;
}

describe("BrowserRecorderSession", () => {
  const stopTrack = vi.fn();
  const stream = {
    getTracks: () => [{ stop: stopTrack }],
  } as unknown as MediaStream;
  const getUserMedia = vi.fn(() => Promise.resolve(stream));

  beforeEach(() => {
    FakeMediaRecorder.instances = [];
    FakeMediaRecorder.reportedMimeType = null;
    stopTrack.mockClear();
    getUserMedia.mockClear();
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia },
    });
    vi.stubGlobal("MediaRecorder", FakeMediaRecorder);
  });

  afterEach(() => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "visible",
    });
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("requests permission only after start, persists chunks, and stops every media track", async () => {
    let now = 100;
    let latest: RecorderState | null = null;
    const persistence = createPersistence();
    const session = new BrowserRecorderSession({
      persistence,
      onStateChange: (state) => {
        latest = state;
      },
      now: () => now,
      createId: () => "browser-recording",
    });
    expect(getUserMedia).not.toHaveBeenCalled();
    await session.start();
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(persistence.begin).toHaveBeenCalledWith(
      expect.objectContaining({
        recordingId: "browser-recording",
        append: false,
        captureMode: "quick",
        requestedDurationMs: null,
        captureContext: { type: "global" },
      }),
    );
    expect(latest).toMatchObject({
      phase: "recording",
      recordingId: "browser-recording",
    });
    const recorder = FakeMediaRecorder.instances[0];
    if (!recorder) throw new Error("Fake recorder was not created.");
    now = 1_350;
    recorder.emitChunk(new Blob(["chunk"], { type: "audio/webm" }));
    await vi.waitFor(() =>
      expect(persistence.appendChunk).toHaveBeenCalledOnce(),
    );
    await session.stop();
    const appendCall = persistence.appendChunk.mock.calls[0];
    expect(appendCall?.[0]).toBe("browser-recording");
    expect(appendCall?.[1]).toBe(0);
    expect(appendCall?.[2]).toBeInstanceOf(Blob);
    expect(appendCall?.[3]).toBe(1_250);
    expect(persistence.finalize).toHaveBeenCalledWith(
      "browser-recording",
      1_250,
      "audio/webm;codecs=opus",
      false,
    );
    expect(stopTrack).toHaveBeenCalledTimes(1);
    expect(latest).toMatchObject({
      phase: "review",
      accumulatedMs: 1_250,
      stopReason: "user",
    });
  });

  it("persists the MIME type reported by the constructed recorder", async () => {
    FakeMediaRecorder.reportedMimeType = "audio/mp4";
    let latest: RecorderState | null = null;
    const persistence = createPersistence();
    const session = new BrowserRecorderSession({
      persistence,
      onStateChange: (state) => {
        latest = state;
      },
      createId: () => "normalized-mime",
    });

    await session.start();
    expect(persistence.begin).toHaveBeenCalledWith(
      expect.objectContaining({
        recordingId: "normalized-mime",
        mimeType: "audio/mp4",
      }),
    );
    expect(latest).toMatchObject({ mimeType: "audio/mp4" });
    await session.stop();
    expect(persistence.finalize).toHaveBeenCalledWith(
      "normalized-mime",
      expect.any(Number),
      "audio/mp4",
      false,
    );
  });

  it("leaves permission state terminal when the page hides after durable begin", async () => {
    let latest: RecorderState | null = null;
    let releaseBegin: ((nextIndex: number) => void) | undefined;
    const persistence = createPersistence();
    persistence.begin.mockImplementationOnce(
      () =>
        new Promise<number>((resolve) => {
          releaseBegin = resolve;
        }),
    );
    const session = new BrowserRecorderSession({
      persistence,
      onStateChange: (state) => {
        latest = state;
      },
      createId: () => "hidden-after-begin",
    });

    const starting = session.start();
    await vi.waitFor(() => expect(persistence.begin).toHaveBeenCalledOnce());
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    releaseBegin?.(0);
    await starting;

    expect(stopTrack).toHaveBeenCalledTimes(1);
    expect(persistence.recoverInterrupted).toHaveBeenCalledWith(
      "hidden-after-begin",
      0,
      "audio/webm;codecs=opus",
      false,
    );
    expect(latest).toMatchObject({ phase: "error" });
    expect((latest as RecorderState | null)?.error).toMatch(
      /left the foreground/u,
    );
  });

  it.each([300_000, 600_000, 1_200_000] as const)(
    "auto-stops once at the controlled %i ms limit and returns a review Blob",
    async (durationLimitMs) => {
      vi.useFakeTimers();
      let now = 10_000;
      let latest: RecorderState | null = null;
      const persistence = createPersistence();
      const onCaptureReady = vi.fn<(blob: Blob, reason: string) => void>();
      const recordingId = `timed-${String(durationLimitMs)}`;
      const session = new BrowserRecorderSession({
        persistence,
        onStateChange: (state) => {
          latest = state;
        },
        onCaptureReady,
        now: () => now,
        createId: () => recordingId,
        durationLimitMs,
        captureMode: "auto-dictation",
        captureContext: { type: "global" },
      });

      await session.start();
      expect(persistence.begin).toHaveBeenCalledWith(
        expect.objectContaining({
          recordingId,
          append: false,
          captureMode: "auto-dictation",
          requestedDurationMs: durationLimitMs,
          captureContext: { type: "global" },
        }),
      );
      now += durationLimitMs;
      await vi.advanceTimersByTimeAsync(100);
      await vi.waitFor(() =>
        expect(persistence.finalize).toHaveBeenCalledOnce(),
      );

      expect(persistence.finalize).toHaveBeenCalledWith(
        recordingId,
        durationLimitMs,
        "audio/webm;codecs=opus",
        true,
      );
      expect(latest).toMatchObject({
        phase: "review",
        accumulatedMs: durationLimitMs,
        stopReason: "duration-limit",
      });
      expect(onCaptureReady).toHaveBeenCalledOnce();
      expect(onCaptureReady.mock.calls[0]?.[0]).toBeInstanceOf(Blob);
      expect(onCaptureReady.mock.calls[0]?.[1]).toBe("duration-limit");

      await vi.advanceTimersByTimeAsync(1_000);
      expect(persistence.finalize).toHaveBeenCalledOnce();
      expect(onCaptureReady).toHaveBeenCalledOnce();
    },
  );

  it("does not expose review actions until durable finalization completes", async () => {
    let latest: RecorderState | null = null;
    let releaseFinalize: ((blob: Blob) => void) | undefined;
    const persistence = createPersistence();
    persistence.finalize.mockImplementationOnce(
      () =>
        new Promise<Blob>((resolve) => {
          releaseFinalize = resolve;
        }),
    );
    const onCaptureReady = vi.fn<(blob: Blob, reason: string) => void>();
    const session = new BrowserRecorderSession({
      persistence,
      onStateChange: (state) => {
        latest = state;
      },
      onCaptureReady,
      createId: () => "delayed-finalize",
    });

    await session.start();
    const stopping = session.stop();
    await vi.waitFor(() => expect(persistence.finalize).toHaveBeenCalledOnce());
    expect(latest).toMatchObject({
      phase: "finalizing",
      stopReason: "user",
    });
    expect(onCaptureReady).not.toHaveBeenCalled();

    releaseFinalize?.(new Blob(["durable"], { type: "audio/webm" }));
    await stopping;
    expect(latest).toMatchObject({ phase: "review", stopReason: "user" });
    expect(onCaptureReady).toHaveBeenCalledOnce();
  });

  it("keeps controlled disposal pending until in-flight finalization completes", async () => {
    let releaseFinalize: ((blob: Blob) => void) | undefined;
    const persistence = createPersistence();
    persistence.finalize.mockImplementationOnce(
      () =>
        new Promise<Blob>((resolve) => {
          releaseFinalize = resolve;
        }),
    );
    const session = new BrowserRecorderSession({
      persistence,
      onStateChange: () => undefined,
      createId: () => "dispose-finalizing",
    });
    await session.start();
    const stopping = session.stop();
    await vi.waitFor(() => expect(persistence.finalize).toHaveBeenCalledOnce());
    let disposalComplete = false;
    const disposal = session.dispose().then(() => {
      disposalComplete = true;
    });
    await Promise.resolve();
    expect(disposalComplete).toBe(false);

    releaseFinalize?.(new Blob(["durable"], { type: "audio/webm" }));
    await Promise.all([stopping, disposal]);
    expect(disposalComplete).toBe(true);
  });

  it("rejects a noncontrolled Auto-Dictation limit without beginning persistence", async () => {
    let latest: RecorderState | null = null;
    const persistence = createPersistence();
    const session = new BrowserRecorderSession({
      persistence,
      onStateChange: (state) => {
        latest = state;
      },
      durationLimitMs: 5_000,
      captureMode: "auto-dictation",
      captureContext: { type: "global" },
    });

    await session.start();

    expect(persistence.begin).not.toHaveBeenCalled();
    expect(FakeMediaRecorder.instances).toHaveLength(0);
    expect(stopTrack).toHaveBeenCalledOnce();
    expect(latest).toMatchObject({ phase: "error" });
    expect((latest as RecorderState | null)?.error).toMatch(
      /controlled 5-, 10-, or 20-minute limit/i,
    );
  });

  it("interrupts, releases, and recovers capture when the document leaves the foreground", async () => {
    let now = 0;
    let latest: RecorderState | null = null;
    const persistence = createPersistence();
    const session = new BrowserRecorderSession({
      persistence,
      onStateChange: (state) => {
        latest = state;
      },
      now: () => now,
    });
    await session.start();
    const recorder = FakeMediaRecorder.instances[0];
    if (!recorder) throw new Error("Fake recorder was not created.");
    recorder.emitChunk(new Blob(["kept"], { type: "audio/webm" }));
    await vi.waitFor(() =>
      expect(persistence.appendChunk).toHaveBeenCalledOnce(),
    );
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      value: "hidden",
    });
    now = 450;
    document.dispatchEvent(new Event("visibilitychange"));
    expect(recorder.state).toBe("inactive");
    expect(stopTrack).toHaveBeenCalledTimes(1);
    await vi.waitFor(() =>
      expect(persistence.recoverInterrupted).toHaveBeenCalledOnce(),
    );
    const recoveryCall = persistence.recoverInterrupted.mock.calls[0];
    expect(typeof recoveryCall?.[0]).toBe("string");
    expect(recoveryCall?.[0]).not.toBe("");
    expect(recoveryCall?.[1]).toBe(450);
    expect(recoveryCall?.[2]).toBe("audio/webm;codecs=opus");
    expect(recoveryCall?.[3]).toBe(false);
    expect(latest).toMatchObject({
      phase: "review",
      accumulatedMs: 450,
      stopReason: "interrupted",
    });
  });

  it("stops tracks synchronously on dispose and asynchronously recovers persisted chunks", async () => {
    let now = 1_000;
    const persistence = createPersistence();
    const session = new BrowserRecorderSession({
      persistence,
      onStateChange: () => undefined,
      now: () => now,
      createId: () => "disposed-recording",
    });
    await session.start();
    const recorder = FakeMediaRecorder.instances[0];
    if (!recorder) throw new Error("Fake recorder was not created.");
    recorder.emitChunk(new Blob(["persisted"], { type: "audio/webm" }));
    await vi.waitFor(() =>
      expect(persistence.appendChunk).toHaveBeenCalledOnce(),
    );

    now = 2_250;
    const disposal = session.dispose();
    expect(recorder.state).toBe("inactive");
    expect(stopTrack).toHaveBeenCalledTimes(1);
    await disposal;

    expect(persistence.recoverInterrupted).toHaveBeenCalledWith(
      "disposed-recording",
      1_250,
      "audio/webm;codecs=opus",
      false,
    );
    expect(session.snapshot()).toMatchObject({
      phase: "review",
      accumulatedMs: 1_250,
      stopReason: "interrupted",
    });
  });

  it("cannot acquire a hidden microphone after disposal during a permission request", async () => {
    let resolvePermission: ((value: MediaStream) => void) | undefined;
    getUserMedia.mockImplementationOnce(
      () =>
        new Promise<MediaStream>((resolve) => {
          resolvePermission = resolve;
        }),
    );
    const persistence = createPersistence();
    const session = new BrowserRecorderSession({
      persistence,
      onStateChange: () => undefined,
    });

    const starting = session.start();
    const disposal = session.dispose();
    resolvePermission?.(stream);
    await Promise.all([starting, disposal]);

    expect(stopTrack).toHaveBeenCalledOnce();
    expect(FakeMediaRecorder.instances).toHaveLength(0);
    expect(persistence.begin).not.toHaveBeenCalled();
  });

  it("returns recovered durable audio to review when a later chunk cannot persist", async () => {
    const persistence = createPersistence();
    persistence.appendChunk
      .mockResolvedValueOnce()
      .mockRejectedValueOnce(new Error("IndexedDB unavailable"));
    let latest: RecorderState | null = null;
    const onCaptureReady = vi.fn<(blob: Blob, reason: string) => void>();
    const session = new BrowserRecorderSession({
      persistence,
      onStateChange: (state) => {
        latest = state;
      },
      onCaptureReady,
    });
    await session.start();
    const recorder = FakeMediaRecorder.instances[0];
    if (!recorder) throw new Error("Fake recorder was not created.");

    recorder.emitChunk(new Blob(["durable"], { type: "audio/webm" }));
    await vi.waitFor(() =>
      expect(persistence.appendChunk).toHaveBeenCalledOnce(),
    );
    recorder.emitChunk(new Blob(["failed"], { type: "audio/webm" }));
    await vi.waitFor(() => {
      expect(latest).toMatchObject({
        phase: "review",
        stopReason: "interrupted",
      });
    });
    expect(recorder.state).toBe("inactive");
    expect(stopTrack).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => {
      expect(persistence.recoverInterrupted).toHaveBeenCalledOnce();
    });
    expect(persistence.finalize).not.toHaveBeenCalled();
    expect(onCaptureReady).toHaveBeenCalledWith(
      expect.any(Blob),
      "interrupted",
    );
  });

  it("shows an error when a failed chunk leaves no durable audio to recover", async () => {
    const persistence = createPersistence();
    persistence.appendChunk.mockRejectedValueOnce(
      new Error("IndexedDB unavailable"),
    );
    persistence.recoverInterrupted.mockResolvedValueOnce(null);
    let latest: RecorderState | null = null;
    const session = new BrowserRecorderSession({
      persistence,
      onStateChange: (state) => {
        latest = state;
      },
    });
    await session.start();
    const recorder = FakeMediaRecorder.instances[0];
    if (!recorder) throw new Error("Fake recorder was not created.");

    recorder.emitChunk(new Blob(["failed"], { type: "audio/webm" }));
    await vi.waitFor(() => expect(latest).toMatchObject({ phase: "error" }));
    expect(recorder.state).toBe("inactive");
    expect(persistence.recoverInterrupted).toHaveBeenCalledOnce();
  });

  it("serializes a late chunk failure behind cancellation so discard wins", async () => {
    let rejectAppend: ((error: Error) => void) | undefined;
    const persistence = createPersistence();
    persistence.appendChunk.mockImplementationOnce(
      () =>
        new Promise<void>((_resolve, reject) => {
          rejectAppend = reject;
        }),
    );
    const onCaptureReady = vi.fn<(blob: Blob, reason: string) => void>();
    const session = new BrowserRecorderSession({
      persistence,
      onStateChange: () => undefined,
      onCaptureReady,
      createId: () => "cancel-race",
    });
    await session.start();
    const recorder = FakeMediaRecorder.instances[0];
    if (!recorder) throw new Error("Fake recorder was not created.");
    recorder.emitChunk(new Blob(["late"], { type: "audio/webm" }));
    await vi.waitFor(() =>
      expect(persistence.appendChunk).toHaveBeenCalledOnce(),
    );

    const cancellation = session.cancel();
    rejectAppend?.(new Error("late IndexedDB failure"));
    await cancellation;

    expect(persistence.discard).toHaveBeenCalledWith("cancel-race");
    expect(persistence.recoverInterrupted).not.toHaveBeenCalled();
    expect(persistence.finalize).not.toHaveBeenCalled();
    expect(onCaptureReady).not.toHaveBeenCalled();
    expect(session.snapshot().phase).toBe("cancelled");
  });
});
