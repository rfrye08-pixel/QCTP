import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  BrowserRecorderSession,
  type CapturePersistence,
} from "./browser-recorder";
import type { RecorderState } from "./recorder-machine";

class FakeMediaRecorder extends EventTarget {
  static instances: FakeMediaRecorder[] = [];
  static isTypeSupported(type: string): boolean {
    return type.startsWith("audio/webm");
  }

  readonly mimeType: string;
  state: RecordingState = "inactive";

  constructor(_stream: MediaStream, options?: MediaRecorderOptions) {
    super();
    this.mimeType = options?.mimeType ?? "audio/webm";
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
      (recordingId: string, index: number, chunk: Blob) => Promise<void>
    >
  >;
  finalize: ReturnType<
    typeof vi.fn<
      (
        recordingId: string,
        durationMs: number,
        mimeType: string,
      ) => Promise<Blob>
    >
  >;
  recoverInterrupted: ReturnType<
    typeof vi.fn<
      (
        recordingId: string,
        durationMs: number,
        mimeType: string,
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
      (recordingId: string, index: number, chunk: Blob) => Promise<void>
    >(() => Promise.resolve()),
    finalize: vi.fn<
      (
        recordingId: string,
        durationMs: number,
        mimeType: string,
      ) => Promise<Blob>
    >((_id, _duration, mimeType) =>
      new Response("audio", { headers: { "content-type": mimeType } }).blob(),
    ),
    recoverInterrupted: vi.fn<
      (
        recordingId: string,
        durationMs: number,
        mimeType: string,
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
    expect(latest).toMatchObject({
      phase: "recording",
      recordingId: "browser-recording",
    });
    const recorder = FakeMediaRecorder.instances[0];
    if (!recorder) throw new Error("Fake recorder was not created.");
    recorder.emitChunk(new Blob(["chunk"], { type: "audio/webm" }));
    await Promise.resolve();
    now = 1_350;
    await session.stop();
    const appendCall = persistence.appendChunk.mock.calls[0];
    expect(appendCall?.[0]).toBe("browser-recording");
    expect(appendCall?.[1]).toBe(0);
    expect(appendCall?.[2]).toBeInstanceOf(Blob);
    expect(persistence.finalize).toHaveBeenCalledWith(
      "browser-recording",
      1_250,
      "audio/webm;codecs=opus",
    );
    expect(stopTrack).toHaveBeenCalledTimes(1);
    expect(latest).toMatchObject({ phase: "review", accumulatedMs: 1_250 });
  });

  it("auto-stops at its limit and preserves prior duration when appending", async () => {
    vi.useFakeTimers();
    let now = 10_000;
    let latest: RecorderState | null = null;
    const persistence = createPersistence();
    persistence.begin.mockResolvedValue(3);
    const session = new BrowserRecorderSession({
      persistence,
      onStateChange: (state) => {
        latest = state;
      },
      now: () => now,
      recordingId: "append-recording",
      append: true,
      initialAccumulatedMs: 4_000,
      initialSizeBytes: 900,
      durationLimitMs: 5_000,
    });
    await session.start();
    now = 11_100;
    await vi.advanceTimersByTimeAsync(100);
    expect(persistence.finalize).toHaveBeenCalledWith(
      "append-recording",
      5_000,
      "audio/webm;codecs=opus",
    );
    expect(latest).toMatchObject({
      phase: "review",
      accumulatedMs: 5_000,
      sizeBytes: 900,
    });
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
    expect(latest).toMatchObject({ phase: "review", accumulatedMs: 450 });
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
    );
    expect(session.snapshot()).toMatchObject({
      phase: "review",
      accumulatedMs: 1_250,
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

  it("stops the recorder and every microphone track when a chunk cannot persist", async () => {
    const persistence = createPersistence();
    persistence.appendChunk.mockRejectedValueOnce(
      new Error("IndexedDB unavailable"),
    );
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

    recorder.emitChunk(new Blob(["chunk"], { type: "audio/webm" }));
    await vi.waitFor(() => {
      expect(latest).toMatchObject({ phase: "error" });
    });
    expect(recorder.state).toBe("inactive");
    expect(stopTrack).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => {
      expect(persistence.recoverInterrupted).toHaveBeenCalledOnce();
    });
    expect(persistence.finalize).not.toHaveBeenCalled();
  });
});
