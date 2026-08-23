import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import {
  chromium,
  expect,
  test,
  webkit,
  type BrowserContext,
  type Page,
} from "@playwright/test";

import {
  buildPwaCandidate,
  type CandidateBuild,
  SwappableCandidateServer,
} from "./candidate-harness";

const CANDIDATE_A_SHA = "a".repeat(40);
const CANDIDATE_B_SHA = "b".repeat(40);
const LOCAL_STORAGE_SENTINEL = "qctp-pwa-upgrade-preserved";
const CRITICAL_ACTIVITY_LEASE_PREFIX = "qctp:pwa-critical-activity:v1:";
const SEEDED_RECORD = {
  schemaVersion: 1,
  id: "pwa-upgrade-preservation-record",
  kind: "source_note",
  title: "PWA upgrade preservation probe",
  createdAt: "2026-08-22T12:00:00.000Z",
  updatedAt: "2026-08-22T12:00:00.000Z",
  observation: null,
  interpretation: null,
  tags: ["pwa-upgrade"],
  backlinks: [],
  sourceLinks: [],
  attachmentIds: ["pwa-upgrade-attachment"],
  revisionIds: [],
  pathId: null,
  sessionId: null,
  fields: { purpose: "non-destructive-upgrade-gate" },
  deletedAt: null,
} as const;

interface DatabaseSnapshot {
  readonly version: number;
  readonly schemaSha256: string;
  readonly aggregateSha256: string;
  readonly stores: Record<
    string,
    {
      readonly count: number;
      readonly sha256: string;
      readonly schemaSha256: string;
    }
  >;
}

async function waitForApplication(page: Page): Promise<void> {
  await expect(
    page.getByRole("navigation", { name: "Primary navigation" }),
  ).toBeVisible({ timeout: 30_000 });
}

async function ensureControlled(page: Page): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          const registration = await navigator.serviceWorker.getRegistration();
          return registration?.active?.state ?? null;
        }),
      { timeout: 30_000 },
    )
    .toBe("activated");
  if (
    !(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
  ) {
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForApplication(page);
  }
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    )
    .toBe(true);
}

async function readCachedCandidate(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const response = await fetch("./qctp-pwa-candidate.json", {
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error(`Candidate marker returned HTTP ${response.status}.`);
    }
    const marker = (await response.json()) as {
      schema?: string;
      candidateSha?: string;
      releaseAuthority?: string;
    };
    if (
      marker.schema !== "qctp-pwa-upgrade-candidate-v1" ||
      marker.releaseAuthority !== "ZERO_RELEASE" ||
      !/^[a-f0-9]{40}$/u.test(marker.candidateSha ?? "")
    ) {
      throw new Error("Candidate marker failed its ZERO_RELEASE contract.");
    }
    return marker.candidateSha as string;
  });
}

async function readNetworkCandidate(
  page: Page,
  origin: string,
): Promise<string> {
  const response = await page.request.get(
    `${origin}/qctp-pwa-candidate.json?network=${Date.now()}`,
    { headers: { "Cache-Control": "no-cache" } },
  );
  expect(response.ok()).toBe(true);
  const marker = (await response.json()) as { candidateSha?: string };
  return marker.candidateSha ?? "";
}

async function readDomCandidate(page: Page): Promise<string | null> {
  return page
    .locator('meta[name="qctp-candidate-sha"]')
    .getAttribute("content");
}

async function readMarkerCacheRevisions(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const revisions: string[] = [];
    for (const cacheName of await caches.keys()) {
      if (!cacheName.startsWith("workbox-precache")) continue;
      const cache = await caches.open(cacheName);
      for (const request of await cache.keys()) {
        const url = new URL(request.url);
        if (!url.pathname.endsWith("/qctp-pwa-candidate.json")) continue;
        revisions.push(url.searchParams.get("__WB_REVISION__") ?? "");
      }
    }
    return revisions.sort();
  });
}

async function expectActiveCandidate(
  page: Page,
  candidate: CandidateBuild,
): Promise<void> {
  expect(await readDomCandidate(page)).toBe(candidate.candidateSha);
  expect(await readCachedCandidate(page)).toBe(candidate.candidateSha);
  expect(await readMarkerCacheRevisions(page)).toEqual([
    candidate.markerRevision,
  ]);
  expect(
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      return registration.waiting?.state ?? null;
    }),
  ).toBeNull();
}

async function stageServedUpdate(page: Page): Promise<{
  readonly controllerUnchanged: boolean;
  readonly waitingState: string | null;
  readonly observedWaitMs: number;
}> {
  return page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    const previousController = navigator.serviceWorker.controller;
    await registration.update();
    const deadline = Date.now() + 30_000;
    while (registration.waiting === null && Date.now() < deadline) {
      await new Promise((resolveWait) => window.setTimeout(resolveWait, 50));
    }
    if (registration.waiting === null) {
      throw new Error(
        "Replacement service worker did not enter waiting state.",
      );
    }
    const waitingStartedAt = performance.now();
    await new Promise((resolveWait) => window.setTimeout(resolveWait, 1_100));
    return {
      controllerUnchanged:
        navigator.serviceWorker.controller === previousController,
      waitingState: registration.waiting?.state ?? null,
      observedWaitMs: performance.now() - waitingStartedAt,
    };
  });
}

async function identifyWaitingCandidate(page: Page): Promise<string | null> {
  return page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    const waiting = registration.waiting;
    if (waiting === null) return null;
    const channel = new MessageChannel();
    return new Promise<string | null>((resolveIdentity) => {
      const timeoutHandle = window.setTimeout(() => {
        channel.port1.close();
        resolveIdentity(null);
      }, 5_000);
      channel.port1.onmessage = (event: MessageEvent<unknown>) => {
        window.clearTimeout(timeoutHandle);
        channel.port1.close();
        if (typeof event.data !== "object" || event.data === null) {
          resolveIdentity(null);
          return;
        }
        const response = event.data as {
          readonly type?: unknown;
          readonly candidateSha?: unknown;
        };
        resolveIdentity(
          response.type === "QCTP_WAITING_CANDIDATE_IDENTITY" &&
            typeof response.candidateSha === "string"
            ? response.candidateSha
            : null,
        );
      };
      channel.port1.start();
      waiting.postMessage({ type: "QCTP_IDENTIFY_WAITING_CANDIDATE" }, [
        channel.port2,
      ]);
    });
  });
}

async function applyReadyUpdate(
  page: Page,
  candidate: CandidateBuild,
): Promise<void> {
  const reloaded = page.waitForEvent("load", { timeout: 30_000 });
  await page.getByRole("button", { name: "Apply ready update" }).click();
  try {
    // Do not poll a service-worker-controlled URL while activation is pending:
    // every probe creates a fetch event on the old active worker and can keep
    // Try Activate from observing an event-free boundary.
    await reloaded;
  } catch (error) {
    const workerState = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      const waiting = registration?.waiting ?? null;
      let directActivationReply: unknown = null;
      if (waiting !== null) {
        const channel = new MessageChannel();
        directActivationReply = await new Promise<unknown>((resolveReply) => {
          const timeoutHandle = window.setTimeout(
            () => resolveReply("timeout"),
            2_000,
          );
          channel.port1.onmessage = (event: MessageEvent<unknown>) => {
            window.clearTimeout(timeoutHandle);
            resolveReply(event.data);
          };
          channel.port1.start();
          waiting.postMessage({ type: "QCTP_ACTIVATE_WAITING_CANDIDATE" }, [
            channel.port2,
          ]);
        });
        channel.port1.close();
        await new Promise((resolveWait) => window.setTimeout(resolveWait, 500));
      }
      return {
        directActivationReply,
        controller: navigator.serviceWorker.controller?.state ?? null,
        controllerScript: navigator.serviceWorker.controller?.scriptURL ?? null,
        active: registration?.active?.state ?? null,
        activeScript: registration?.active?.scriptURL ?? null,
        waiting: registration?.waiting?.state ?? null,
        waitingScript: registration?.waiting?.scriptURL ?? null,
        installing: registration?.installing?.state ?? null,
      };
    });
    throw new Error(
      `Candidate ${candidate.candidateSha} did not activate: ${JSON.stringify(workerState)}`,
      { cause: error },
    );
  }
  await waitForApplication(page);
  await expectActiveCandidate(page, candidate);
}

async function readCriticalActivityLeaseKeys(page: Page): Promise<string[]> {
  return page.evaluate((prefix) => {
    const keys: string[] = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (key?.startsWith(prefix)) keys.push(key);
    }
    return keys.sort();
  }, CRITICAL_ACTIVITY_LEASE_PREFIX);
}

async function seedPreservationFixture(
  page: Page,
  includeBinary: boolean,
): Promise<void> {
  await page.evaluate(
    ({ record, sentinel, withBinary }) => {
      localStorage.setItem(sentinel, "preserved");
      return new Promise<void>((resolveWrite, rejectWrite) => {
        const opening = indexedDB.open("qctp-rev2");
        opening.onerror = () =>
          rejectWrite(opening.error ?? new Error("QCTP database open failed."));
        opening.onsuccess = () => {
          const database = opening.result;
          const storeNames = [
            "records",
            "transcriptionQueue",
            "mirrorRequests",
            "practiceSessions",
            ...(withBinary
              ? ["recordings", "audioChunks", "attachments", "attachmentBlobs"]
              : []),
          ];
          const transaction = database.transaction(storeNames, "readwrite");
          transaction.objectStore("records").put(record);
          transaction.objectStore("transcriptionQueue").put({
            schemaVersion: 1,
            id: "pwa-upgrade-transcription-queue",
            recordingId: "pwa-upgrade-recording",
            status: "FAILED",
            attempts: 2,
            nextAttemptAt: null,
            lastError: "Preserved terminal queue fixture",
            createdAt: "2026-08-22T12:00:00.000Z",
            updatedAt: "2026-08-22T12:00:00.000Z",
          });
          transaction.objectStore("mirrorRequests").put({
            schemaVersion: 1,
            id: "pwa-upgrade-mirror-queue",
            prompt: "Preserve this terminal local queue fixture.",
            sourceRecordIds: [record.id],
            sourceSnapshots: [
              {
                recordId: record.id,
                title: record.title,
                kind: record.kind,
                excerpt: "PWA upgrade preservation probe",
                recordUpdatedAt: record.updatedAt,
              },
            ],
            status: "FAILED",
            remoteJobId: null,
            attempts: 2,
            nextAttemptAt: null,
            lastError: "Preserved terminal queue fixture",
            createdAt: "2026-08-22T12:00:00.000Z",
            updatedAt: "2026-08-22T12:00:00.000Z",
            deletedAt: null,
          });
          transaction.objectStore("practiceSessions").put({
            schemaVersion: 1,
            id: "pwa-upgrade-practice-session",
            practiceId: "foundation-day1-source-rev0-voice-free",
            foundationDay: 1,
            scriptId: "QCTP-D1-SOURCE-LABELED-SCRIPT-CANDIDATE-REV0",
            scriptSha256:
              "2649ce70e5ab824dbc6b797e07082567fda2443962016e8e6c7dbe454f5ee555",
            startedAt: "2026-08-22T11:35:00.000Z",
            endedAt: "2026-08-22T12:00:00.000Z",
            elapsedMs: 1_500_000,
            completionMode: "VOICE_FREE_FALLBACK",
            supportMode: "ambient",
            sourceSequence: ["Bullard", "HeartMath", "Dispenza", "QCTP return"],
            heartMathBreath:
              "approximately five seconds in / five seconds out or comfortable; no hold",
            naturalCompletion: true,
            narrationUsed: false,
            narratedContentAcceptance: "NOT_APPLICABLE",
            stateAttainment: "NOT_ASSESSED",
            debrief: {
              status: "remind_later",
              recordId: null,
              updatedAt: "2026-08-22T12:00:00.000Z",
              remindAt: "2099-08-22T13:00:00.000Z",
              promptVersion: "RAW_OBSERVATION_REV0",
            },
            createdAt: "2026-08-22T12:00:00.000Z",
          });
          if (withBinary) {
            const binary = new Uint8Array([0, 1, 2, 3, 127, 128, 254, 255]);
            transaction.objectStore("recordings").put({
              schemaVersion: 1,
              id: "pwa-upgrade-recording",
              createdAt: "2026-08-22T12:00:00.000Z",
              updatedAt: "2026-08-22T12:00:00.000Z",
              acceptedAt: "2026-08-22T12:00:00.000Z",
              durationMs: 1_000,
              mimeType: "audio/webm",
              sizeBytes: binary.byteLength,
              localBlobRef: "pwa-upgrade-recording",
              remoteObjectRef: null,
              destinationType: "source_note",
              destinationId: record.id,
              status: "LOCAL_ONLY",
              segments: [
                {
                  id: "pwa-upgrade-segment",
                  sequence: 0,
                  startedAt: "2026-08-22T12:00:00.000Z",
                  endedAt: "2026-08-22T12:00:01.000Z",
                  durationMs: 1_000,
                  mimeType: "audio/webm",
                  sizeBytes: binary.byteLength,
                  chunkIds: ["pwa-upgrade-audio-chunk"],
                },
              ],
              transcriptionRoute: "local_only",
              provider: null,
              model: null,
              checksumSha256: "c".repeat(64),
              retentionPolicy: "keep",
              failureCode: null,
              failureMessage: null,
              deletedAt: null,
            });
            transaction.objectStore("audioChunks").put({
              schemaVersion: 1,
              id: "pwa-upgrade-audio-chunk",
              recordingId: "pwa-upgrade-recording",
              segmentId: "pwa-upgrade-segment",
              sequence: 0,
              createdAt: "2026-08-22T12:00:00.000Z",
              mimeType: "audio/webm",
              blob: new Blob([binary], { type: "audio/webm" }),
            });
            transaction.objectStore("attachments").put({
              schemaVersion: 1,
              id: "pwa-upgrade-attachment",
              parentId: record.id,
              kind: "document",
              filename: "pwa-upgrade.bin",
              mimeType: "application/octet-stream",
              sizeBytes: binary.byteLength,
              localBlobRef: "pwa-upgrade-attachment-blob",
              remoteObjectRef: null,
              checksumSha256: "d".repeat(64),
              createdAt: "2026-08-22T12:00:00.000Z",
              deletedAt: null,
            });
            transaction.objectStore("attachmentBlobs").put({
              schemaVersion: 1,
              id: "pwa-upgrade-attachment-blob",
              attachmentId: "pwa-upgrade-attachment",
              createdAt: "2026-08-22T12:00:00.000Z",
              blob: new Blob([binary, binary], {
                type: "application/octet-stream",
              }),
            });
          }
          transaction.onerror = () =>
            rejectWrite(
              transaction.error ?? new Error("QCTP fixture write failed."),
            );
          transaction.onabort = transaction.onerror;
          transaction.oncomplete = () => {
            database.close();
            resolveWrite();
          };
        };
      });
    },
    {
      record: SEEDED_RECORD,
      sentinel: LOCAL_STORAGE_SENTINEL,
      withBinary: includeBinary,
    },
  );
}

async function snapshotDatabase(page: Page): Promise<DatabaseSnapshot> {
  return page.evaluate(async (sentinel) => {
    const hashBytes = async (bytes: ArrayBuffer): Promise<string> => {
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      return [...new Uint8Array(digest)]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
    };
    const normalize = async (value: unknown): Promise<unknown> => {
      if (value instanceof Blob) {
        return {
          __binary: "Blob",
          type: value.type,
          size: value.size,
          sha256: await hashBytes(await value.arrayBuffer()),
        };
      }
      if (value instanceof ArrayBuffer) {
        return {
          __binary: "ArrayBuffer",
          size: value.byteLength,
          sha256: await hashBytes(value),
        };
      }
      if (Array.isArray(value)) {
        return Promise.all(value.map((item) => normalize(item)));
      }
      if (value !== null && typeof value === "object") {
        const normalized: Record<string, unknown> = {};
        for (const [key, item] of Object.entries(value).sort(
          ([left], [right]) => left.localeCompare(right),
        )) {
          normalized[key] = await normalize(item);
        }
        return normalized;
      }
      return value;
    };
    const hashJson = async (value: unknown): Promise<string> =>
      hashBytes(new TextEncoder().encode(JSON.stringify(value)).buffer);
    const database = await new Promise<IDBDatabase>(
      (resolveOpen, rejectOpen) => {
        const opening = indexedDB.open("qctp-rev2");
        opening.onerror = () =>
          rejectOpen(opening.error ?? new Error("QCTP snapshot open failed."));
        opening.onsuccess = () => resolveOpen(opening.result);
      },
    );
    const stores: Record<
      string,
      { count: number; sha256: string; schemaSha256: string }
    > = {};
    const storeSchemas: Record<string, unknown> = {};
    for (const storeName of [...database.objectStoreNames].sort()) {
      const { keys, schema, values } = await new Promise<{
        keys: IDBValidKey[];
        schema: unknown;
        values: unknown[];
      }>((resolveRead, rejectRead) => {
        const transaction = database.transaction(storeName, "readonly");
        const store = transaction.objectStore(storeName);
        const schema = {
          keyPath: store.keyPath,
          autoIncrement: store.autoIncrement,
          indexes: [...store.indexNames].sort().map((indexName) => {
            const index = store.index(indexName);
            return {
              name: index.name,
              keyPath: index.keyPath,
              multiEntry: index.multiEntry,
              unique: index.unique,
            };
          }),
        };
        const keysRequest = store.getAllKeys();
        const valuesRequest = store.getAll();
        transaction.onerror = () =>
          rejectRead(
            transaction.error ?? new Error(`Snapshot failed: ${storeName}`),
          );
        transaction.oncomplete = () =>
          resolveRead({
            keys: keysRequest.result,
            schema,
            values: valuesRequest.result as unknown[],
          });
      });
      const normalized = await normalize({ keys, values });
      storeSchemas[storeName] = schema;
      stores[storeName] = {
        count: values.length,
        sha256: await hashJson(normalized),
        schemaSha256: await hashJson(schema),
      };
    }
    const result = {
      version: database.version,
      stores,
      schemaSha256: await hashJson({
        databaseName: database.name,
        databaseVersion: database.version,
        stores: storeSchemas,
      }),
      localStorageSentinel: localStorage.getItem(sentinel),
    };
    database.close();
    if (result.localStorageSentinel !== "preserved") {
      throw new Error("Local-storage preservation sentinel is missing.");
    }
    return {
      version: result.version,
      stores: result.stores,
      schemaSha256: result.schemaSha256,
      aggregateSha256: await hashJson(result),
    };
  }, LOCAL_STORAGE_SENTINEL);
}

async function launchPersistentPage(
  profileRoot: string,
  origin: string,
  offline: boolean,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await chromium.launchPersistentContext(profileRoot, {
    headless: true,
    offline,
    serviceWorkers: "allow",
  });
  // Chromium persistent profiles do not consistently honor the constructor's
  // offline flag on Windows. Apply it again before the first navigation so a
  // cold launch cannot silently fall back to the loopback server.
  await context.setOffline(offline);
  const page = context.pages()[0] ?? (await context.newPage());
  if (offline) {
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.emulateNetworkConditions", {
      offline: true,
      latency: 0,
      downloadThroughput: 0,
      uploadThroughput: 0,
      connectionType: "none",
    });
  }
  await page.goto(origin, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await waitForApplication(page);
  return { context, page };
}

async function expectNetworkOriginUnavailable(page: Page): Promise<void> {
  const probe = await page.evaluate(async () => {
    try {
      await fetch(`./qctp-offline-network-probe-${Date.now()}.txt`, {
        cache: "no-store",
      });
      return "reachable";
    } catch {
      return "unavailable";
    }
  });
  expect(probe).toBe("unavailable");
}

test("same-source prompt PWA lifecycle upgrades A to B and rolls back B to A without data loss", async ({
  browserName,
}, testInfo) => {
  void browserName;
  test.skip(
    testInfo.project.metadata.engine !== "chromium",
    "The persistent cold-offline PWA lifecycle machine gate runs in Chromium.",
  );
  test.setTimeout(300_000);
  testInfo.annotations.push({
    type: "scope",
    description:
      "This is a same-source new-code PWA lifecycle regression, not F047 runtime rollback or proof of compatibility with the deployed legacy autoUpdate candidate.",
  });

  const repositoryRoot = resolve(process.cwd());
  const temporaryRoot = await mkdtemp(join(tmpdir(), "qctp-pwa-upgrade-"));
  const profileRoot = resolve(temporaryRoot, "chromium-profile");
  const server = new SwappableCandidateServer();
  let context: BrowserContext | undefined;

  try {
    const candidateA = await buildPwaCandidate(
      repositoryRoot,
      resolve(temporaryRoot, "candidate-a"),
      CANDIDATE_A_SHA,
    );
    const candidateB = await buildPwaCandidate(
      repositoryRoot,
      resolve(temporaryRoot, "candidate-b"),
      CANDIDATE_B_SHA,
    );
    expect(candidateA.serviceWorkerSha256).not.toBe(
      candidateB.serviceWorkerSha256,
    );
    expect(candidateA.applicationAssetSha256).not.toBe(
      candidateB.applicationAssetSha256,
    );

    await server.useCandidate(candidateA.root);
    const origin = await server.listen();
    const port = Number(new URL(origin).port);
    ({ context } = await launchPersistentPage(profileRoot, origin, false));
    const page = context.pages()[0] as Page;
    await ensureControlled(page);
    await expectActiveCandidate(page, candidateA);
    await seedPreservationFixture(page, true);
    const seededSnapshot = await snapshotDatabase(page);
    expect(Object.keys(seededSnapshot.stores).length).toBeGreaterThan(20);
    expect(seededSnapshot.stores.audioChunks?.count).toBe(1);
    expect(seededSnapshot.stores.attachmentBlobs?.count).toBe(1);
    expect(seededSnapshot.stores.transcriptionQueue?.count).toBe(1);
    expect(seededSnapshot.stores.mirrorRequests?.count).toBe(1);
    expect(seededSnapshot.stores.practiceSessions?.count).toBe(1);
    expect(seededSnapshot.stores.settings?.count).toBe(1);

    await page.goto(`${origin}/#/practice`, { waitUntil: "domcontentloaded" });
    await expect(
      page.getByText("OFFLINE AUDIO READY", { exact: true }),
    ).toBeVisible({ timeout: 30_000 });
    await page
      .getByRole("button", { name: "Begin voice-free practice" })
      .click();
    const timerBefore = await page.getByTestId("practice-timer").textContent();
    await expect
      .poll(() => readCriticalActivityLeaseKeys(page))
      .toHaveLength(1);

    const coordinatorPage = await context.newPage();
    await coordinatorPage.goto(origin, { waitUntil: "domcontentloaded" });
    await waitForApplication(coordinatorPage);
    await ensureControlled(coordinatorPage);
    expect(await readDomCandidate(coordinatorPage)).toBe(
      candidateA.candidateSha,
    );

    await server.useCandidate(candidateB.root);
    expect(await readNetworkCandidate(coordinatorPage, origin)).toBe(
      candidateB.candidateSha,
    );
    const stagedB = await stageServedUpdate(coordinatorPage);
    expect(stagedB.controllerUnchanged).toBe(true);
    expect(stagedB.waitingState).toBe("installed");
    expect(stagedB.observedWaitMs).toBeGreaterThanOrEqual(1_000);
    expect(await identifyWaitingCandidate(coordinatorPage)).toBe(
      candidateB.candidateSha,
    );
    expect(await readDomCandidate(page)).toBe(candidateA.candidateSha);
    expect(await readCachedCandidate(page)).toBe(candidateA.candidateSha);
    await expect
      .poll(() => page.getByTestId("practice-timer").textContent(), {
        timeout: 5_000,
      })
      .not.toBe(timerBefore);
    await expect(
      page.getByRole("button", { name: "End without completion" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Apply ready update" }),
    ).toHaveCount(0);
    expect(await snapshotDatabase(page)).toEqual(seededSnapshot);

    await expect(
      coordinatorPage.getByRole("button", { name: "Apply ready update" }),
    ).toBeVisible();
    let practiceReloads = 0;
    let coordinatorReloads = 0;
    page.on("load", () => {
      practiceReloads += 1;
    });
    coordinatorPage.on("load", () => {
      coordinatorReloads += 1;
    });
    await coordinatorPage
      .getByRole("button", { name: "Apply ready update" })
      .click();
    await expect(
      coordinatorPage.getByText(
        "The update is waiting safely while another QCTP window has active or unverified critical work.",
        { exact: true },
      ),
    ).toBeVisible();
    await expect
      .poll(() =>
        page.evaluate(async (lockName) => {
          const state = await navigator.locks.query();
          return state.held?.some((lock) => lock.name === lockName) ?? false;
        }, "qctp:pwa-update-activation:v1"),
      )
      .toBe(true);
    await coordinatorPage.evaluate((prefix) => {
      for (let index = localStorage.length - 1; index >= 0; index -= 1) {
        const key = localStorage.key(index);
        if (key?.startsWith(prefix)) localStorage.removeItem(key);
      }
    }, CRITICAL_ACTIVITY_LEASE_PREFIX);
    await coordinatorPage
      .getByRole("button", { name: "Apply ready update" })
      .click();
    await expect(
      coordinatorPage.getByText(
        "The update is waiting safely while another QCTP window has active or unverified critical work.",
        { exact: true },
      ),
    ).toBeVisible();
    await coordinatorPage.waitForTimeout(1_100);
    expect(practiceReloads).toBe(0);
    expect(coordinatorReloads).toBe(0);
    expect(
      await coordinatorPage.evaluate(async () => {
        const registration = await navigator.serviceWorker.ready;
        return registration.waiting?.state ?? null;
      }),
    ).toBe("installed");
    expect(await readDomCandidate(coordinatorPage)).toBe(
      candidateA.candidateSha,
    );
    expect(await readCachedCandidate(coordinatorPage)).toBe(
      candidateA.candidateSha,
    );
    await expect
      .poll(() => page.getByTestId("practice-timer").textContent(), {
        timeout: 5_000,
      })
      .not.toBe(timerBefore);

    await page.getByRole("button", { name: "End without completion" }).click();
    await expect(
      page.getByRole("button", { name: "Start again" }),
    ).toBeVisible();
    await expect
      .poll(() => readCriticalActivityLeaseKeys(coordinatorPage))
      .toEqual([]);
    await expect
      .poll(() =>
        coordinatorPage.evaluate(async (lockName) => {
          const state = await navigator.locks.query();
          return state.held?.some((lock) => lock.name === lockName) ?? false;
        }, "qctp:pwa-update-activation:v1"),
      )
      .toBe(false);
    const postPracticeSnapshot = await snapshotDatabase(coordinatorPage);
    await applyReadyUpdate(coordinatorPage, candidateB);
    expect(await snapshotDatabase(coordinatorPage)).toEqual(
      postPracticeSnapshot,
    );

    await context.close();
    context = undefined;
    await server.close();
    await delay(250);
    const coldB = await launchPersistentPage(profileRoot, origin, true);
    context = coldB.context;
    await expectNetworkOriginUnavailable(coldB.page);
    await expectActiveCandidate(coldB.page, candidateB);
    expect(await snapshotDatabase(coldB.page)).toEqual(postPracticeSnapshot);
    await context.close();
    context = undefined;

    await server.useCandidate(candidateA.root);
    expect(await server.listen(port)).toBe(origin);
    const rollbackOnline = await launchPersistentPage(
      profileRoot,
      origin,
      false,
    );
    context = rollbackOnline.context;
    expect(await readNetworkCandidate(rollbackOnline.page, origin)).toBe(
      candidateA.candidateSha,
    );
    expect(await readCachedCandidate(rollbackOnline.page)).toBe(
      candidateB.candidateSha,
    );
    const stagedA = await stageServedUpdate(rollbackOnline.page);
    expect(stagedA.controllerUnchanged).toBe(true);
    expect(stagedA.waitingState).toBe("installed");
    await expect(
      rollbackOnline.page.getByRole("button", { name: "Apply ready update" }),
    ).toBeVisible();
    await applyReadyUpdate(rollbackOnline.page, candidateA);
    expect(await snapshotDatabase(rollbackOnline.page)).toEqual(
      postPracticeSnapshot,
    );

    await context.close();
    context = undefined;
    await server.close();
    await delay(250);
    const coldA = await launchPersistentPage(profileRoot, origin, true);
    context = coldA.context;
    await expectNetworkOriginUnavailable(coldA.page);
    await expectActiveCandidate(coldA.page, candidateA);
    expect(await snapshotDatabase(coldA.page)).toEqual(postPracticeSnapshot);
  } finally {
    await context?.close().catch(() => undefined);
    await server.close().catch(() => undefined);
    await delay(250);
    await rm(temporaryRoot, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 200,
    });
  }
});

test("online WebKit waits for explicit apply and preserves IndexedDB across A to B", async ({
  browserName,
}, testInfo) => {
  void browserName;
  test.skip(
    testInfo.project.metadata.engine !== "webkit",
    "The online WebKit transition gate runs only in its dedicated project.",
  );
  test.setTimeout(240_000);
  const repositoryRoot = resolve(process.cwd());
  const temporaryRoot = await mkdtemp(join(tmpdir(), "qctp-pwa-webkit-"));
  const server = new SwappableCandidateServer();
  let context: BrowserContext | undefined;
  let browser: Awaited<ReturnType<typeof webkit.launch>> | undefined;
  try {
    const candidateA = await buildPwaCandidate(
      repositoryRoot,
      resolve(temporaryRoot, "candidate-a"),
      CANDIDATE_A_SHA,
    );
    const candidateB = await buildPwaCandidate(
      repositoryRoot,
      resolve(temporaryRoot, "candidate-b"),
      CANDIDATE_B_SHA,
    );
    await server.useCandidate(candidateA.root);
    const origin = await server.listen();
    browser = await webkit.launch({ headless: true });
    context = await browser.newContext({ serviceWorkers: "allow" });
    const page = await context.newPage();
    await page.goto(origin, { waitUntil: "domcontentloaded" });
    await waitForApplication(page);
    await ensureControlled(page);
    await seedPreservationFixture(page, false);
    const snapshot = await snapshotDatabase(page);
    await server.useCandidate(candidateB.root);
    expect(await readNetworkCandidate(page, origin)).toBe(
      candidateB.candidateSha,
    );
    const staged = await stageServedUpdate(page);
    expect(staged.controllerUnchanged).toBe(true);
    expect(staged.waitingState).toBe("installed");
    expect(await readCachedCandidate(page)).toBe(candidateA.candidateSha);
    await expect(
      page.getByRole("button", { name: "Apply ready update" }),
    ).toBeVisible();
    await applyReadyUpdate(page, candidateB);
    expect(await snapshotDatabase(page)).toEqual(snapshot);

    await server.useCandidate(candidateA.root);
    expect(await readNetworkCandidate(page, origin)).toBe(
      candidateA.candidateSha,
    );
    const rollback = await stageServedUpdate(page);
    expect(rollback.controllerUnchanged).toBe(true);
    expect(rollback.waitingState).toBe("installed");
    expect(await readCachedCandidate(page)).toBe(candidateB.candidateSha);
    await expect(
      page.getByRole("button", { name: "Apply ready update" }),
    ).toBeVisible();
    await applyReadyUpdate(page, candidateA);
    expect(await snapshotDatabase(page)).toEqual(snapshot);
  } finally {
    await context?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
    await server.close().catch(() => undefined);
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("WebKit cold-offline transition remains a physical iPhone hold", () => {
  test.skip(
    true,
    "Windows Playwright WebKit aborts cold-offline service-worker navigation; online WebKit is automated and physical iPhone Safari remains required for cold launch.",
  );
});

test("legacy deployed autoUpdate to prompt-mode rollback remains an emergency idle-client hold", () => {
  test.skip(
    true,
    "The deployed legacy candidate auto-activates and its older schemas can strip new fields. Close/reopen on an idle client plus physical data verification is required; this same-source PWA lifecycle test is not F047 runtime rollback.",
  );
});
