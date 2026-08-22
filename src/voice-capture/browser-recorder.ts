import {
  INITIAL_RECORDER_STATE,
  recorderElapsedMs,
  reduceRecorder,
  type PauseReason,
  type RecorderEvent,
  type RecorderState,
} from "./recorder-machine";

export interface CapturePersistence {
  begin(input: {
    recordingId: string;
    mimeType: string;
    createdAt: string;
    append: boolean;
  }): Promise<number>;
  appendChunk(recordingId: string, index: number, chunk: Blob): Promise<void>;
  finalize(
    recordingId: string,
    durationMs: number,
    mimeType: string,
  ): Promise<Blob>;
  recoverInterrupted(
    recordingId: string,
    durationMs: number,
    mimeType: string,
  ): Promise<Blob | null>;
  discard(recordingId: string): Promise<void>;
}

export interface BrowserRecorderOptions {
  persistence: CapturePersistence;
  onStateChange: (state: RecorderState) => void;
  durationLimitMs?: number | null;
  recordingId?: string;
  append?: boolean;
  initialAccumulatedMs?: number;
  initialSizeBytes?: number;
  now?: () => number;
  createId?: () => string;
}

const MIME_CANDIDATES = [
  "audio/mp4",
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
] as const;

export function selectRecordingMimeType(
  mediaRecorder: typeof MediaRecorder,
): string {
  return (
    MIME_CANDIDATES.find((candidate) =>
      mediaRecorder.isTypeSupported(candidate),
    ) ?? ""
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "Microphone access was denied. Allow microphone access in browser settings, then try again.";
  }
  if (error instanceof Error) return error.message;
  return "Voice capture could not start.";
}

function isDocumentHidden(): boolean {
  return document.visibilityState === "hidden";
}

export class BrowserRecorderSession {
  private state: RecorderState = INITIAL_RECORDER_STATE;
  private readonly now: () => number;
  private readonly createId: () => string;
  private mediaRecorder: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private levelSamples: Uint8Array<ArrayBuffer> | null = null;
  private tickHandle: number | null = null;
  private nextChunkIndex = 0;
  private persistenceFailureHandled = false;
  private pendingWrites = new Set<Promise<void>>();
  private activeRecordingId: string | null = null;
  private activeMimeType: string | null = null;
  private disposed = false;
  private startInFlight: Promise<void> | null = null;
  private settlementInFlight: Promise<Blob | null> | null = null;
  private readonly hiddenHandler = () => {
    if (
      document.visibilityState === "hidden" &&
      ["recording", "paused"].includes(this.state.phase)
    ) {
      void this.interrupt();
    }
  };
  private readonly pageHideHandler = () => {
    if (["recording", "paused"].includes(this.state.phase)) {
      void this.interrupt();
    }
  };

  constructor(private readonly options: BrowserRecorderOptions) {
    this.now = options.now ?? (() => performance.now());
    this.createId = options.createId ?? (() => crypto.randomUUID());
  }

  snapshot(): RecorderState {
    return this.state;
  }

  elapsedMs(): number {
    return recorderElapsedMs(this.state, this.now());
  }

  start(): Promise<void> {
    if (this.startInFlight) return this.startInFlight;
    const operation = this.startInternal();
    this.startInFlight = operation;
    return operation.finally(() => {
      if (this.startInFlight === operation) this.startInFlight = null;
    });
  }

  private async startInternal(): Promise<void> {
    if (this.disposed) return;
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof MediaRecorder === "undefined"
    ) {
      this.dispatch({
        type: "FAIL",
        message: "This browser does not support durable microphone capture.",
      });
      return;
    }

    this.dispatch({
      type: "REQUEST_PERMISSION",
      durationLimitMs: this.options.durationLimitMs ?? null,
      ...(this.options.initialAccumulatedMs === undefined
        ? {}
        : { initialAccumulatedMs: this.options.initialAccumulatedMs }),
      ...(this.options.initialSizeBytes === undefined
        ? {}
        : { initialSizeBytes: this.options.initialSizeBytes }),
    });

    try {
      this.persistenceFailureHandled = false;
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (this.disposed || isDocumentHidden()) {
        this.cleanupMedia();
        if (!this.disposed) {
          this.dispatch({
            type: "FAIL",
            message:
              "Voice capture did not start because QCTP is not in the foreground.",
          });
        }
        return;
      }
      const mimeType = selectRecordingMimeType(MediaRecorder);
      const recordingId = this.options.recordingId ?? this.createId();
      this.nextChunkIndex = await this.options.persistence.begin({
        recordingId,
        mimeType: mimeType || "audio/webm",
        createdAt: new Date().toISOString(),
        append: this.options.append ?? false,
      });
      this.activeRecordingId = recordingId;
      this.activeMimeType = mimeType || "audio/webm";
      if (this.disposed || isDocumentHidden()) {
        this.cleanupMedia();
        await this.recoverActiveRecording();
        return;
      }
      this.mediaRecorder = mimeType
        ? new MediaRecorder(this.stream, { mimeType })
        : new MediaRecorder(this.stream);
      this.activeMimeType =
        this.mediaRecorder.mimeType || mimeType || "audio/webm";
      this.installRecorderEvents(recordingId);
      this.setupLevelMeter();
      document.addEventListener("visibilitychange", this.hiddenHandler);
      window.addEventListener("pagehide", this.pageHideHandler);
      this.dispatch({
        type: "PERMISSION_GRANTED",
        recordingId,
        mimeType: this.activeMimeType,
        nowMs: this.now(),
      });
      this.mediaRecorder.start(1_000);
      this.tickHandle = window.setInterval(() => this.tick(), 100);
    } catch (error) {
      this.cleanupMedia();
      if (this.activeRecordingId) await this.recoverActiveRecording();
      if (!this.disposed)
        this.dispatch({ type: "FAIL", message: errorMessage(error) });
    }
  }

  pause(reason: PauseReason = "user"): void {
    if (
      this.state.phase !== "recording" ||
      this.mediaRecorder?.state !== "recording"
    )
      return;
    this.mediaRecorder.pause();
    this.dispatch({ type: "PAUSE", nowMs: this.now(), reason });
  }

  resume(): void {
    if (this.state.phase !== "paused" || this.mediaRecorder?.state !== "paused")
      return;
    this.mediaRecorder.resume();
    this.dispatch({ type: "RESUME", nowMs: this.now() });
  }

  async stop(): Promise<Blob | null> {
    return this.settleCapture(false);
  }

  async cancel(): Promise<void> {
    const recordingId = this.activeRecordingId ?? this.state.recordingId;
    const stopped = this.stopMediaImmediately();
    if (this.settlementInFlight) await this.settlementInFlight;
    else await stopped;
    await Promise.allSettled([...this.pendingWrites]);
    if (recordingId) await this.options.persistence.discard(recordingId);
    this.dispatch({ type: "CANCEL" });
  }

  /**
   * Releases the microphone synchronously, then recovers persisted chunks in
   * IndexedDB asynchronously. Callers may await the returned promise in tests
   * or controlled shutdown paths; React unmount cleanup may safely fire and
   * forget it.
   */
  async dispose(): Promise<void> {
    this.disposed = true;
    if (
      this.activeRecordingId &&
      ["recording", "paused"].includes(this.state.phase)
    ) {
      await this.settleCapture(true);
      return;
    }
    await this.stopMediaImmediately();
    if (this.startInFlight) await this.startInFlight;
    if (
      this.activeRecordingId &&
      this.state.phase === "requesting-permission"
    ) {
      await this.recoverActiveRecording();
    }
  }

  /** Stops a foreground capture because the app became hidden or navigated. */
  interrupt(): Promise<Blob | null> {
    return this.settleCapture(true);
  }

  private installRecorderEvents(recordingId: string): void {
    if (!this.mediaRecorder) return;
    this.mediaRecorder.addEventListener("dataavailable", (event) => {
      if (!event.data.size || this.persistenceFailureHandled) return;
      const chunkIndex = this.nextChunkIndex++;
      const write = this.options.persistence
        .appendChunk(recordingId, chunkIndex, event.data)
        .then(() => {
          this.dispatch({
            type: "CHUNK_PERSISTED",
            sizeBytes: event.data.size,
          });
        })
        .catch((error: unknown) => {
          if (this.persistenceFailureHandled) return;
          this.persistenceFailureHandled = true;
          if (["recording", "paused"].includes(this.state.phase)) {
            this.dispatch({ type: "STOP", nowMs: this.now() });
          }
          this.dispatch({
            type: "FAIL",
            message: `Recording stopped because audio could not be kept safely on this device: ${errorMessage(error)}`,
          });
          // Do not await here: this promise is itself part of pendingWrites.
          // Recovery drains the set after this rejection handler finishes.
          void this.settleCapture(true);
        })
        .finally(() => this.pendingWrites.delete(write));
      this.pendingWrites.add(write);
    });
    this.mediaRecorder.addEventListener("error", () => {
      if (["recording", "paused"].includes(this.state.phase)) {
        this.dispatch({ type: "STOP", nowMs: this.now() });
      }
      this.dispatch({
        type: "FAIL",
        message: "The browser stopped the microphone unexpectedly.",
      });
      void this.settleCapture(true);
    });
  }

  private settleCapture(interrupted: boolean): Promise<Blob | null> {
    if (this.settlementInFlight) return this.settlementInFlight;
    const recordingId = this.activeRecordingId ?? this.state.recordingId;
    const mimeType = this.activeMimeType ?? this.state.mimeType;
    if (!recordingId || !mimeType) {
      return this.stopMediaImmediately().then(() => null);
    }

    const stoppedAtMs = this.now();
    const stopped = this.stopMediaImmediately();
    const operation = (async () => {
      await stopped;
      await Promise.allSettled([...this.pendingWrites]);
      if (["recording", "paused"].includes(this.state.phase)) {
        this.dispatch({ type: "STOP", nowMs: stoppedAtMs });
      }
      const durationMs = recorderElapsedMs(this.state, stoppedAtMs);
      try {
        return interrupted || this.persistenceFailureHandled
          ? await this.options.persistence.recoverInterrupted(
              recordingId,
              durationMs,
              mimeType,
            )
          : await this.options.persistence.finalize(
              recordingId,
              durationMs,
              mimeType,
            );
      } catch (error) {
        if (!interrupted && !this.persistenceFailureHandled) {
          try {
            return await this.options.persistence.recoverInterrupted(
              recordingId,
              durationMs,
              mimeType,
            );
          } catch {
            // Report the original finalization error below. Both durable
            // recovery paths have been attempted and the microphone is off.
          }
        }
        if (!this.disposed) {
          this.dispatch({
            type: "FAIL",
            message: `The microphone is off, but this capture needs local recovery: ${errorMessage(error)}`,
          });
        }
        return null;
      }
    })();
    this.settlementInFlight = operation;
    return operation;
  }

  private async recoverActiveRecording(): Promise<Blob | null> {
    const recordingId = this.activeRecordingId;
    const mimeType = this.activeMimeType;
    if (!recordingId || !mimeType) return null;
    try {
      return await this.options.persistence.recoverInterrupted(
        recordingId,
        recorderElapsedMs(this.state, this.now()),
        mimeType,
      );
    } catch {
      return null;
    }
  }

  private setupLevelMeter(): void {
    if (!this.stream) return;
    const AudioContextConstructor = window.AudioContext;
    if (!AudioContextConstructor) return;
    this.audioContext = new AudioContextConstructor();
    const source = this.audioContext.createMediaStreamSource(this.stream);
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 256;
    this.levelSamples = new Uint8Array(this.analyser.frequencyBinCount);
    source.connect(this.analyser);
  }

  private readLevel(): number {
    if (!this.analyser || !this.levelSamples) return 0;
    this.analyser.getByteTimeDomainData(this.levelSamples);
    let energy = 0;
    for (const sample of this.levelSamples) {
      const centered = (sample - 128) / 128;
      energy += centered * centered;
    }
    return Math.min(1, Math.sqrt(energy / this.levelSamples.length) * 3);
  }

  private tick(): void {
    const transition = this.dispatch({
      type: "TICK",
      nowMs: this.now(),
      level: this.readLevel(),
    });
    if (transition.shouldStop) void this.stop();
  }

  private dispatch(event: RecorderEvent) {
    const transition = reduceRecorder(this.state, event);
    this.state = transition.state;
    if (!this.disposed) this.options.onStateChange(this.state);
    return transition;
  }

  private stopMediaImmediately(): Promise<void> {
    const recorder = this.mediaRecorder;
    let resolveStopped: () => void = () => undefined;
    const stopped = new Promise<void>((resolve) => {
      resolveStopped = resolve;
    });
    if (recorder && recorder.state !== "inactive") {
      recorder.addEventListener("stop", resolveStopped, { once: true });
      try {
        recorder.stop();
      } catch {
        resolveStopped();
      }
    } else {
      resolveStopped();
    }
    this.cleanupMedia();
    return stopped;
  }

  private cleanupMedia(): void {
    document.removeEventListener("visibilitychange", this.hiddenHandler);
    window.removeEventListener("pagehide", this.pageHideHandler);
    if (this.tickHandle !== null) window.clearInterval(this.tickHandle);
    this.tickHandle = null;
    this.mediaRecorder = null;
    for (const track of this.stream?.getTracks() ?? []) track.stop();
    this.stream = null;
    if (this.audioContext) void this.audioContext.close();
    this.audioContext = null;
    this.analyser = null;
    this.levelSamples = null;
  }
}
