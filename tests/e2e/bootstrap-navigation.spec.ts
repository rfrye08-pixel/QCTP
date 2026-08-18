import { expect, test } from "@playwright/test";

import {
  auditPaidCloudRequests,
  expectNoHorizontalOverflow,
  listStoreNames,
  openQctp,
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
    page.getByRole("heading", { level: 1, name: "Day 1 — State Control" }),
  ).toBeVisible();
  await expect(page.getByText("25:00 exact", { exact: true })).toBeVisible();
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);

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
    page.getByRole("heading", { level: 1, name: "Day 1 — State Control" }),
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
      name: browserName === "webkit" ? "Paths" : "Day 1 — State Control",
    }),
  ).toBeVisible();
  if (browserName !== "webkit") {
    await expect(page.getByText("25:00 exact", { exact: true })).toBeVisible();
  }
  expect(paidCloudRequests).toEqual([]);
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
    ["Practice", "State Control"],
    ["Studio", "Learn to See"],
    ["More", "More"],
    ["Today", "Day 1 — State Control"],
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
