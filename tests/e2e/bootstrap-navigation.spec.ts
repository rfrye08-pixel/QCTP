import { expect, test } from "@playwright/test";

import {
  auditPaidCloudRequests,
  expectNoHorizontalOverflow,
  listStoreNames,
  openQctp,
  putStore,
  readStore,
} from "./support";

test("boots the PWA into IndexedDB-backed Free Local Mode", async ({
  browserName,
  context,
  page,
}) => {
  const paidCloudRequests = auditPaidCloudRequests(page);
  await openQctp(page);

  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Day 1 — Baseline Awareness",
    }),
  ).toBeVisible();
  await expect(page.getByText("25:00 exact", { exact: true })).toBeVisible();
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveAttribute(
    "href",
    /qctp-icon-180\.png$/u,
  );
  const iconMetadata = await page.evaluate(async () => {
    const manifestLink = document.querySelector<HTMLLinkElement>(
      'link[rel="manifest"]',
    );
    if (!manifestLink) throw new Error("PWA manifest link is missing.");
    const manifest = (await fetch(manifestLink.href).then((response) =>
      response.json(),
    )) as { icons?: Array<{ src?: string; sizes?: string; purpose?: string }> };
    return manifest.icons ?? [];
  });
  expect(iconMetadata).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        src: "qctp-icon-192.png",
        sizes: "192x192",
        purpose: "any",
      }),
      expect.objectContaining({
        src: "qctp-icon-512.png",
        sizes: "512x512",
        purpose: "maskable",
      }),
    ]),
  );

  const stores = await listStoreNames(page);
  expect(stores).toEqual(
    expect.arrayContaining([
      "settings",
      "foundation",
      "records",
      "recordings",
      "audioChunks",
      "transcriptionQueue",
      "mirrorRequests",
      "mirrorResults",
      "practiceSessions",
      "breathProfiles",
      "breathSessions",
      "stateSessions",
      "stateCapabilities",
    ]),
  );
  const settings = await readStore<{
    id: string;
    transcriptionRoute: string;
    testMode: boolean;
  }>(page, "settings");
  expect(settings).toEqual([
    expect.objectContaining({
      id: "settings",
      transcriptionRoute: "local_only",
      testMode: false,
    }),
  ]);

  await expect
    .poll(
      () =>
        page.evaluate(async () => {
          if (!("serviceWorker" in navigator)) return null;
          const ready = await navigator.serviceWorker.ready;
          return { scope: ready.scope, active: ready.active?.state ?? null };
        }),
      {
        message: "service worker reaches its activated lifecycle state",
        timeout: 15_000,
        intervals: [50, 100, 250, 500],
      },
    )
    .toEqual(expect.objectContaining({ active: "activated" }));

  await page.reload();
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Day 1 — Baseline Awareness",
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
  ).toBe(true);
  await context.setOffline(true);
  if (browserName === "webkit") {
    test.info().annotations.push({
      type: "harness limitation",
      description:
        "Playwright WebKit on Windows aborts offline navigations before its service worker handles them; physical iOS cold-launch verification remains held.",
    });
    await page
      .getByRole("navigation", { name: "Primary navigation" })
      .getByRole("button", { name: "Paths", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Paths" }),
    ).toBeVisible();
  } else {
    await page.reload();
  }
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: browserName === "webkit" ? "Paths" : "Day 1 — Baseline Awareness",
    }),
  ).toBeVisible();
  if (browserName !== "webkit") {
    await expect(page.getByText("25:00 exact", { exact: true })).toBeVisible();
  }
  expect(paidCloudRequests).toEqual([]);
});

test("Today is a mobile morning cockpit with local controls and explicit holds", async ({
  page,
}) => {
  const paidCloudRequests = auditPaidCloudRequests(page);
  await openQctp(page);

  await expect(
    page.getByRole("heading", { name: "Voice-Free Day 1 · 25 minutes" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Choose the safest useful pattern" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Capability, guidance, and source control",
    }),
  ).toBeVisible();
  await expect(page.getByText("Narrated Day 1 is held")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Open the blind voice audition" }),
  ).toHaveAttribute("href", "./voice-audition/");
  await expect(page.getByText("PX13 companion", { exact: true })).toBeVisible();
  await expect(page.getByText("App package", { exact: true })).toBeVisible();

  const [settings] = await readStore<Record<string, unknown>>(page, "settings");
  if (!settings) throw new Error("Default settings were not initialized.");
  await putStore(page, "settings", {
    ...settings,
    lastVoiceFreeIssue: {
      code: "EARLY_USER_END",
      message:
        "Practice ended before the complete return. No completion or state credit was recorded.",
      occurredAt: "2026-08-22T12:05:00.000Z",
      elapsedMs: 300_000,
      supportMode: "ambient",
      completionCreditGranted: false,
      stateCapabilityCreditGranted: false,
    },
    updatedAt: "2026-08-22T12:05:00.000Z",
  });
  await page.reload();
  await expect(
    page.getByText("Needs attention", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText(/Practice ended before the complete return/),
  ).toBeVisible();

  await page.getByRole("button", { name: "Record voice note" }).click();
  await expect(
    page.getByRole("dialog", { name: "Quick Capture" }),
  ).toBeVisible();
  expect(paidCloudRequests).toEqual([]);
});

test("Paths exposes controlled Breath, State, Grant, and Campbell work without fabricated Foundation days", async ({
  page,
}) => {
  await openQctp(page, "#/paths");
  await expect(
    page.getByRole("heading", { name: "Breath Foundations" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Thomas Campbell" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Robert Edward Grant" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Capability, guidance, and source control",
    }),
  ).toBeVisible();
  await expect(
    page.getByText(/Days 2–112.*intentionally unauthored/u),
  ).toBeVisible();
  await expect(page.getByText("TC-01", { exact: true })).toBeVisible();
  await expect(page.getByText("TC-10", { exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("bottom navigation and every released platform surface render", async ({
  page,
}) => {
  const paidCloudRequests = auditPaidCloudRequests(page);
  await openQctp(page);
  const navigation = page.getByRole("navigation", {
    name: "Primary navigation",
  });

  const primary: Array<[string, string]> = [
    ["Paths", "Paths"],
    ["Practice", "Voice-Free Day 1"],
    ["Studio", "Learn to See"],
    ["More", "More"],
    ["Today", "Day 1 — Baseline Awareness"],
  ];
  for (const [buttonName, heading] of primary) {
    await navigation
      .getByRole("button", { name: buttonName, exact: true })
      .click();
    await expect(
      page.getByRole("heading", { level: 1, name: heading }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
  }

  await navigation.getByRole("button", { name: "More", exact: true }).click();
  const secondary: Array<[string, string]> = [
    ["Lab", "Lab"],
    ["Codex", "Codex"],
    ["Mirror / Insights", "Mirror"],
    ["Settings", "Settings"],
  ];
  for (const [surfaceName, heading] of secondary) {
    await page
      .getByRole("button", { name: new RegExp(`^${surfaceName}`) })
      .click();
    await expect(
      page.getByRole("heading", { level: 1, name: heading }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await navigation.getByRole("button", { name: "More", exact: true }).click();
  }

  expect(paidCloudRequests).toEqual([]);
});

test("critical iPhone controls meet the 44px tap-target floor", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "iphone-portrait",
    "iPhone-specific geometry check",
  );
  await openQctp(page);

  const controls = [
    page.getByRole("button", { name: "Open Quick Capture" }),
    ...["Today", "Paths", "Practice", "Studio", "More"].map((name) =>
      page
        .getByRole("navigation", { name: "Primary navigation" })
        .getByRole("button", { name, exact: true }),
    ),
  ];

  for (const control of controls) {
    const box = await control.boundingBox();
    expect(box, "critical control must have a rendered box").not.toBeNull();
    expect(box!.width, "critical control width").toBeGreaterThanOrEqual(44);
    expect(box!.height, "critical control height").toBeGreaterThanOrEqual(44);
  }

  await page.getByRole("button", { name: "Open Quick Capture" }).click();
  const start = page.getByRole("button", { name: "Start recording" });
  const startBox = await start.boundingBox();
  expect(startBox).not.toBeNull();
  expect(startBox!.width).toBeGreaterThanOrEqual(44);
  expect(startBox!.height).toBeGreaterThanOrEqual(44);
  await expectNoHorizontalOverflow(page);
});
