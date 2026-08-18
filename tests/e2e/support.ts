import { expect, type BrowserContext, type Page } from "@playwright/test";

export const DATABASE_NAME = "qctp-rev2";

interface CapturedRequest {
  url: string;
  method: string;
}

export function auditPaidCloudRequests(page: Page): CapturedRequest[] {
  const captured: CapturedRequest[] = [];
  page.on("request", (request) => {
    const hostname = new URL(request.url()).hostname.toLocaleLowerCase();
    if (
      hostname === "api.openai.com" ||
      hostname.endsWith(".openai.com") ||
      hostname === "api.anthropic.com" ||
      hostname.endsWith(".anthropic.com")
    ) {
      captured.push({ url: request.url(), method: request.method() });
    }
  });
  return captured;
}

export async function openQctp(page: Page, hash = ""): Promise<void> {
  await page.goto(`/${hash}`);
  await expect(page.getByRole("heading", { level: 1 }).first()).toBeVisible();
  await expect(
    page.getByRole("navigation", { name: "Primary navigation" }),
  ).toBeVisible();
}

export async function readStore<T>(
  page: Page,
  storeName: string,
): Promise<T[]> {
  return page.evaluate(
    ({ databaseName, targetStore }) =>
      new Promise<T[]>((resolve, reject) => {
        const request = indexedDB.open(databaseName);
        request.onerror = () =>
          reject(request.error ?? new Error("Unable to open QCTP database."));
        request.onsuccess = () => {
          const database = request.result;
          try {
            const transaction = database.transaction(targetStore, "readonly");
            const values = transaction.objectStore(targetStore).getAll();
            values.onerror = () =>
              reject(values.error ?? new Error("Unable to read QCTP store."));
            values.onsuccess = () => resolve(values.result as T[]);
            transaction.oncomplete = () => database.close();
          } catch (error) {
            database.close();
            reject(
              error instanceof Error
                ? error
                : new Error("Unable to access QCTP store.", { cause: error }),
            );
          }
        };
      }),
    { databaseName: DATABASE_NAME, targetStore: storeName },
  );
}

export async function listStoreNames(page: Page): Promise<string[]> {
  return page.evaluate(
    (databaseName) =>
      new Promise<string[]>((resolve, reject) => {
        const request = indexedDB.open(databaseName);
        request.onerror = () =>
          reject(request.error ?? new Error("Unable to open QCTP database."));
        request.onsuccess = () => {
          const database = request.result;
          resolve([...database.objectStoreNames]);
          database.close();
        };
      }),
    DATABASE_NAME,
  );
}

export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(() => ({
        documentOverflow:
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
        bodyOverflow:
          document.body.scrollWidth - document.documentElement.clientWidth,
      })),
    )
    .toEqual({ documentOverflow: 0, bodyOverflow: 0 });
}

export async function installFakeMicrophone(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const state = {
      getUserMediaCalls: 0,
      trackStops: 0,
      playbackCalls: 0,
    };
    Object.defineProperty(window, "__qctpMediaTest", {
      configurable: true,
      value: state,
    });

    const track = {
      kind: "audio",
      enabled: true,
      muted: false,
      readyState: "live",
      stop: () => {
        state.trackStops += 1;
        track.readyState = "ended";
      },
    };
    const stream = {
      active: true,
      getTracks: () => [track],
      getAudioTracks: () => [track],
    };
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: (constraints: MediaStreamConstraints) => {
          state.getUserMediaCalls += 1;
          if (!constraints.audio)
            return Promise.reject(
              new DOMException("Audio was not requested", "NotAllowedError"),
            );
          return Promise.resolve(stream);
        },
      },
    });

    class FakeMediaRecorder extends EventTarget {
      static isTypeSupported(type: string): boolean {
        return type === "audio/webm";
      }

      readonly mimeType: string;
      state: RecordingState = "inactive";
      private interval: number | null = null;
      private chunk = 0;

      constructor(_stream: MediaStream, options?: MediaRecorderOptions) {
        super();
        this.mimeType = options?.mimeType || "audio/webm";
      }

      start(): void {
        this.state = "recording";
        this.emitChunk();
        this.interval = window.setInterval(() => this.emitChunk(), 35);
        this.dispatchEvent(new Event("start"));
      }

      pause(): void {
        if (this.state !== "recording") return;
        this.state = "paused";
        this.dispatchEvent(new Event("pause"));
      }

      resume(): void {
        if (this.state !== "paused") return;
        this.state = "recording";
        this.dispatchEvent(new Event("resume"));
      }

      stop(): void {
        if (this.state === "inactive") return;
        if (this.interval !== null) window.clearInterval(this.interval);
        this.interval = null;
        this.emitChunk();
        this.state = "inactive";
        this.dispatchEvent(new Event("stop"));
      }

      private emitChunk(): void {
        if (this.state === "paused" || this.state === "inactive") return;
        this.chunk += 1;
        const event = new Event("dataavailable") as Event & { data: Blob };
        Object.defineProperty(event, "data", {
          value: new Blob([`QCTP test chunk ${String(this.chunk)}`], {
            type: this.mimeType,
          }),
        });
        this.dispatchEvent(event);
      }
    }
    Object.defineProperty(window, "MediaRecorder", {
      configurable: true,
      value: FakeMediaRecorder,
    });

    class FakeAudioNode extends EventTarget {
      connect(): this {
        return this;
      }
      disconnect(): void {}
    }
    class FakeOscillator extends FakeAudioNode {
      frequency = { value: 0 };
      start(): void {}
      stop(): void {
        queueMicrotask(() => this.dispatchEvent(new Event("ended")));
      }
    }
    class FakeAnalyser extends FakeAudioNode {
      fftSize = 256;
      frequencyBinCount = 128;
      getByteTimeDomainData(values: Uint8Array): void {
        values.fill(132);
      }
    }
    class FakeAudioContext {
      currentTime = 0;
      destination = new FakeAudioNode();
      createOscillator(): FakeOscillator {
        return new FakeOscillator();
      }
      createGain(): FakeAudioNode & {
        gain: {
          setValueAtTime: () => void;
          exponentialRampToValueAtTime: () => void;
        };
      } {
        return Object.assign(new FakeAudioNode(), {
          gain: {
            setValueAtTime: () => undefined,
            exponentialRampToValueAtTime: () => undefined,
          },
        });
      }
      createMediaStreamSource(): FakeAudioNode {
        return new FakeAudioNode();
      }
      createAnalyser(): FakeAnalyser {
        return new FakeAnalyser();
      }
      close(): Promise<void> {
        return Promise.resolve();
      }
    }
    Object.defineProperty(window, "AudioContext", {
      configurable: true,
      value: FakeAudioContext,
    });

    Object.defineProperty(HTMLMediaElement.prototype, "play", {
      configurable: true,
      value: function play(): Promise<void> {
        state.playbackCalls += 1;
        return Promise.resolve();
      },
    });
  });
}

export async function mediaTestState(page: Page): Promise<{
  getUserMediaCalls: number;
  trackStops: number;
  playbackCalls: number;
}> {
  return page.evaluate(() => {
    const state = (
      window as unknown as Window & {
        __qctpMediaTest: {
          getUserMediaCalls: number;
          trackStops: number;
          playbackCalls: number;
        };
      }
    ).__qctpMediaTest;
    return { ...state };
  });
}

export async function readAudioChunkFacts(
  page: Page,
): Promise<Array<{ recordingId: string; size: number; type: string }>> {
  return page.evaluate(
    (databaseName) =>
      new Promise<Array<{ recordingId: string; size: number; type: string }>>(
        (resolve, reject) => {
          const request = indexedDB.open(databaseName);
          request.onerror = () =>
            reject(
              request.error ?? new Error("Unable to open Blob probe database."),
            );
          request.onsuccess = () => {
            const database = request.result;
            const values = database
              .transaction("audioChunks", "readonly")
              .objectStore("audioChunks")
              .getAll();
            values.onerror = () =>
              reject(values.error ?? new Error("Unable to read audio chunks."));
            values.onsuccess = () => {
              resolve(
                (
                  values.result as Array<{ recordingId: string; blob: Blob }>
                ).map((chunk) => ({
                  recordingId: chunk.recordingId,
                  size: chunk.blob.size,
                  type: chunk.blob.type,
                })),
              );
              database.close();
            };
          };
        },
      ),
    DATABASE_NAME,
  );
}

/**
 * Playwright's Windows WebKit build currently rejects Blob values during
 * IndexedDB preparation. Probe the capability so that suite output identifies
 * that harness limitation instead of misreporting it as a QCTP recorder bug.
 */
export async function indexedDbBlobRoundTripSupported(
  page: Page,
): Promise<boolean> {
  return page.evaluate(async () => {
    const databaseName = `qctp-e2e-blob-probe-${crypto.randomUUID()}`;
    try {
      const database = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(databaseName, 1);
        request.onupgradeneeded = () =>
          request.result.createObjectStore("chunks", { keyPath: "id" });
        request.onerror = () =>
          reject(
            request.error ?? new Error("Unable to open Blob probe database."),
          );
        request.onsuccess = () => resolve(request.result);
      });
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction("chunks", "readwrite");
        transaction.objectStore("chunks").put({
          id: "probe",
          blob: new Blob(["QCTP IndexedDB Blob probe"], {
            type: "audio/webm",
          }),
        });
        transaction.onerror = () =>
          reject(
            transaction.error ?? new Error("Blob probe transaction failed."),
          );
        transaction.onabort = () =>
          reject(
            transaction.error ?? new Error("Blob probe transaction aborted."),
          );
        transaction.oncomplete = () => resolve();
      });
      database.close();
      return true;
    } catch {
      return false;
    } finally {
      indexedDB.deleteDatabase(databaseName);
    }
  });
}

export async function forceOffline(
  context: BrowserContext,
  page: Page,
): Promise<void> {
  await context.setOffline(true);
  await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
}
