import { expect, test } from "@playwright/test";

import {
  auditPaidCloudRequests,
  createPendingVoiceFreePracticeSession,
  openQctp,
  putStore,
  readStore,
} from "./support";

test("blind audition cannot reveal route identities or evict the main offline package", async ({
  context,
  page,
}) => {
  await openQctp(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await expect
    .poll(() => page.evaluate(() => caches.keys()))
    .toEqual(
      expect.arrayContaining([expect.stringMatching(/^workbox-precache/u)]),
    );

  await page.goto("/voice-audition/");
  await expect(
    page.getByRole("heading", { level: 1, name: "Blind voice audition" }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(async () => {
        const registrations = await navigator.serviceWorker.getRegistrations();
        return registrations.some((registration) =>
          registration.scope.endsWith("/voice-audition/"),
        );
      }),
    )
    .toBe(true);

  const publicReveal = await page.request.get(
    "/voice-audition/route-reveal.json",
    { headers: { accept: "application/json" } },
  );
  const revealBody = await publicReveal.text();
  expect(revealBody).not.toMatch(/route_id|Kokoro|Piper|KittenTTS/u);
  expect(await page.evaluate(() => caches.keys())).toEqual(
    expect.arrayContaining([expect.stringMatching(/^workbox-precache/u)]),
  );

  await page.getByRole("button", { name: "B", exact: true }).click();
  await page.getByRole("button", { name: "Confirm physical choice" }).click();
  await expect(page.getByText("Saved physical choice: B")).toBeVisible();
  await expect(page.locator("body")).not.toContainText(
    /Kokoro|Piper|KittenTTS/u,
  );

  await openQctp(page);
  await page.reload();
  await context.setOffline(true);
  const support = await page.evaluate(async () => {
    // Read the immutable Workbox payload directly. Windows WebKit aborts a
    // newly issued offline navigation/fetch before its service worker can
    // answer, so physical iOS cold-launch remains a separate explicit gate.
    const response = await caches.match(
      new URL("/audio/day1-source-rev0/support-ambient-1500.mp3", location.href)
        .href,
      { ignoreSearch: true },
    );
    if (!response) return { ok: false, bytes: 0 };
    return {
      ok: response.ok,
      bytes: (await response.arrayBuffer()).byteLength,
    };
  });
  expect(support.ok).toBe(true);
  expect(support.bytes).toBe(12_000_576);
});

test("Voice-Free Day 1 presents the controlled six-phase 25:00 sequence and early exit earns nothing", async ({
  page,
}) => {
  await openQctp(page, "#/practice");
  await expect(
    page.getByRole("heading", { level: 1, name: "Voice-Free Day 1" }),
  ).toBeVisible();
  await expect(page.getByTestId("practice-timer")).toHaveText("25:00");
  await expect(
    page.getByRole("heading", { name: "Six source-grounded phases" }),
  ).toBeVisible();
  const phases = page.getByRole("list", { name: "Day 1 phase sequence" });
  await expect(phases.getByRole("listitem")).toHaveCount(6);
  await expect(phases).toContainText("HeartMath coherence");
  await expect(phases).toContainText("5:00");
  await expect(phases).toContainText("Complete return");
  await expect(
    page.getByText(/five seconds in and five seconds out/),
  ).toBeVisible();
  await expect(page.getByText(/Do not hold/)).toBeVisible();
  await expect(
    page.getByText("OFFLINE AUDIO READY", { exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Begin voice-free practice" }).click();
  await expect(
    page.getByRole("button", { name: "End without completion" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "QCTP — navigation locked during active practice",
    }),
  ).toBeDisabled();
  await expect(
    page.getByRole("navigation", { name: "Primary navigation" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "End without completion" }).click();
  await expect(page.getByRole("button", { name: "Start again" })).toBeVisible();

  const foundation = await readStore<{
    currentDay: number;
    completion: Record<string, { morning: boolean }>;
  }>(page, "foundation");
  expect(foundation[0]?.currentDay).toBe(1);
  expect(foundation[0]?.completion["1"]?.morning ?? false).toBe(false);
  expect(await readStore(page, "practiceSessions")).toEqual([]);
});

test("a pending post-session debrief resurfaces and saves typed raw evidence without state credit", async ({
  page,
}) => {
  const paidCloudRequests = auditPaidCloudRequests(page);
  await openQctp(page);
  await putStore(
    page,
    "practiceSessions",
    createPendingVoiceFreePracticeSession("e2e-practice-debrief"),
  );
  await page.reload();

  await expect(
    page.getByRole("heading", { name: "Raw observation is still open" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Finish raw observation" }).click();
  const debrief = page.locator("#post-session-debrief");
  await expect(debrief).toBeVisible();
  await expect(debrief).toBeFocused();
  await expect(debrief).toContainText("Before explaining it");
  await expect(debrief).toContainText("no interpretation or state claim");

  await debrief.getByRole("button", { name: "Type instead" }).click();
  await debrief
    .getByRole("textbox", { name: "Raw observation" })
    .fill("Warmth was directly noticeable in the center of my chest.");
  await debrief.getByRole("button", { name: "Save raw observation" }).click();
  await expect(debrief).toHaveCount(0);

  const sessions = await readStore<{
    id: string;
    stateAttainment: string;
    debrief: { status: string; recordId: string | null };
  }>(page, "practiceSessions");
  expect(sessions).toEqual([
    expect.objectContaining({
      id: "e2e-practice-debrief",
      stateAttainment: "NOT_ASSESSED",
      debrief: expect.objectContaining({
        status: "completed",
        recordId: "practice-debrief:e2e-practice-debrief",
      }),
    }),
  ]);
  const records = await readStore<{
    id: string;
    sessionId: string | null;
    interpretation: unknown;
    observation: { text: string } | null;
    fields: { captureModality?: string };
  }>(page, "records");
  expect(records).toEqual([
    expect.objectContaining({
      id: "practice-debrief:e2e-practice-debrief",
      sessionId: "e2e-practice-debrief",
      interpretation: null,
      observation: expect.objectContaining({
        text: "Warmth was directly noticeable in the center of my chest.",
      }),
      fields: expect.objectContaining({ captureModality: "typed" }),
    }),
  ]);
  expect(
    (
      await readStore<{ completion: Record<string, { morning: boolean }> }>(
        page,
        "foundation",
      )
    )[0]?.completion["1"]?.morning ?? false,
  ).toBe(false);
  expect(paidCloudRequests).toEqual([]);
});

test("Voice-Free Day 1 uses only checksum-manifested same-origin support stems", async ({
  page,
}) => {
  const forbiddenAudioRequests: string[] = [];
  page.on("request", (request) => {
    if (
      request.url().includes("resource2.heygen.ai") ||
      request.url().includes("voice-1500.mp3") ||
      request.url().includes("composite-ambient-low-1500.mp3") ||
      request.url().includes("a03-acceptance")
    ) {
      forbiddenAudioRequests.push(request.url());
    }
  });

  await openQctp(page, "#/practice");

  const manifest = await page.evaluate(async () => {
    const response = await fetch(
      "audio/day1-source-rev0/voice-free-manifest.json",
      {
        cache: "no-store",
      },
    );
    return {
      status: response.status,
      body: (await response.json()) as {
        schema: string;
        script_authority: { script_sha256: string };
        nonverbal_phase_marker: { boundaries_seconds: number[] };
        assets: Array<{
          path: string;
          bytes: number;
          sha256: string;
          duration_seconds: number;
        }>;
      },
    };
  });

  expect(manifest.status).toBe(200);
  expect(manifest.body.schema).toBe("qctp-rev3-voice-free-day1-media-v1");
  expect(manifest.body.script_authority.script_sha256).toBe(
    "2649ce70e5ab824dbc6b797e07082567fda2443962016e8e6c7dbe454f5ee555",
  );
  expect(manifest.body.nonverbal_phase_marker.boundaries_seconds).toEqual([
    180, 480, 780, 1380, 1440,
  ]);
  const supportAssets = manifest.body.assets;
  expect(supportAssets).toEqual([
    expect.objectContaining({
      path: "support-ambient-1500.mp3",
      bytes: 12_000_576,
      sha256:
        "eb32e69b73099e6b20dc2107cf836be72cdf6ca79a07d267da2f9abf95610726",
    }),
    expect.objectContaining({
      path: "support-binaural-low-a-1500.mp3",
      bytes: 12_000_576,
      sha256:
        "e592c954af517c2022f7c3e5f653591e026e6d3ff467c8afb6b78647510912fe",
    }),
    expect.objectContaining({
      path: "support-minimal-1500.mp3",
      bytes: 12_000_576,
      sha256:
        "4611a2cb65a553a9904777aaaa65bc70461fd3c325e1dfd7715bb83d6c3ca0cb",
    }),
  ]);
  expect(
    supportAssets.every(
      (asset) =>
        asset.duration_seconds === 1_500 && /^[a-f0-9]{64}$/.test(asset.sha256),
    ),
  ).toBe(true);
  expect(forbiddenAudioRequests).toEqual([]);
});

test("shortened Voice-Free test mode is marked non-credit and early exit persists no completion", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium",
    "Playwright clock verification runs once in Chromium",
  );
  await openQctp(page, "#/settings");

  const testMode = page.getByRole("checkbox", {
    name: /Use shortened local test timing/,
  });
  await testMode.click();
  await expect(testMode).toBeChecked();
  await expect(
    page.getByRole("status").filter({ hasText: "TEST MODE ACTIVE" }),
  ).toBeVisible();
  await page
    .getByRole("navigation", { name: "Primary navigation" })
    .getByRole("button", { name: "Practice", exact: true })
    .click();
  await expect(page.getByTestId("practice-timer")).toHaveText("1:30");
  await expect(page.getByText(/Verification mode is shortened/)).toBeVisible();
  await expect(
    page.getByText(/can never earn morning or state credit/),
  ).toBeVisible();

  await page.getByRole("button", { name: "Begin voice-free practice" }).click();
  await page.getByRole("button", { name: "End without completion" }).click();
  await expect(page.getByRole("button", { name: "Start again" })).toBeVisible();

  const foundation = await readStore<{
    currentDay: number;
    completion: Record<string, { morning: boolean }>;
  }>(page, "foundation");
  expect(foundation[0]?.currentDay).toBe(1);
  expect(foundation[0]?.completion["1"]?.morning ?? false).toBe(false);
  expect(await readStore(page, "practiceSessions")).toEqual([]);
});

test("REG-01 exposes nine controlled steps and holds completion on audio and artifact gates", async ({
  page,
}) => {
  await openQctp(page, "#/studio");
  await expect(
    page.getByRole("heading", { level: 1, name: "Learn to See" }),
  ).toBeVisible();

  const stepsSection = page.locator("section").filter({
    has: page.getByRole("heading", { name: "Complete all nine steps" }),
  });
  await expect(stepsSection.getByRole("checkbox")).toHaveCount(9);
  await expect(
    page.getByLabel("0 of 9 controlled steps complete"),
  ).toBeVisible();

  const requirements = page.getByRole("list", {
    name: "Completion requirements",
  });
  await expect(requirements).toContainText(
    "an accepted auto-dictation recording is required",
  );
  await expect(requirements).toContainText(
    "the auto-dictation recording must reach five minutes",
  );
  await expect(requirements).toContainText(
    "a geometry photograph or drawing is required",
  );
  await expect(
    page.getByRole("button", { name: "Complete REG-01 atomically" }),
  ).toBeDisabled();

  await page
    .getByRole("button", { name: "Record five-minute auto-dictation" })
    .click();
  await expect(page.getByText("Controlled duration: 5 minutes")).toBeVisible();
  await expect(page.getByRole("radio", { name: "10 minutes" })).toHaveCount(0);
  await expect(page.getByRole("radio", { name: "20 minutes" })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Start 5-minute Auto-Dictation" }),
  ).toBeVisible();
  await expect(page.getByTestId("recorder-clock")).toHaveText(/5:00/);
});
