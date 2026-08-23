import { expect, test } from "@playwright/test";

import {
  auditPaidCloudRequests,
  expectNoHorizontalOverflow,
  listStoreNames,
  openQctp,
  putStore,
  readStore,
} from "./support";

test("a failed app bundle leaves a visible non-destructive recovery screen", async ({
  page,
}) => {
  await page.route(/\/assets\/.*\.js$/u, (route) => route.abort());
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Opening your practice…" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Reload QCTP" })).toHaveAttribute(
    "href",
    "./",
  );
  await expect(
    page.getByText(/does not clear local recordings, journal entries/i),
  ).toBeVisible();
  const background = await page
    .locator("body")
    .evaluate((body) => getComputedStyle(body).backgroundImage);
  expect(background).toContain("radial-gradient");
});

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
}, testInfo) => {
  const paidCloudRequests = auditPaidCloudRequests(page);
  await openQctp(page);

  await expect(
    page.getByRole("heading", { name: "Voice-Free Day 1 · 25 minutes" }),
  ).toBeVisible();
  await expect(
    page.getByText("Scheduled readiness: 4:00 a.m. local"),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Later today" }),
  ).toBeVisible();
  await expect(
    page.getByText("Available · no source clock time", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText(/Anything due or unfinished stays here/u),
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

  if (testInfo.project.name === "iphone-portrait") {
    const begin = page.getByRole("button", { name: "Begin Voice-Free Day 1" });
    const [box, viewport] = await Promise.all([
      begin.boundingBox(),
      page.evaluate(() => ({ height: window.innerHeight })),
    ]);
    expect(box).not.toBeNull();
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
  }

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

test("canonical content classes remain visible, authority-keyed, and mobile-safe", async ({
  page,
}) => {
  await openQctp(page);
  const capturedAt = "2026-08-23T06:30:00.000Z";
  await putStore(page, "records", {
    schemaVersion: 1,
    id: "e2e-user-evidence-controlled-tool",
    kind: "mirror",
    title: "Ryan's REG observation",
    createdAt: capturedAt,
    updatedAt: capturedAt,
    observation: {
      id: "e2e-user-evidence-controlled-tool:observation",
      text: "I noticed the two circles crossed at two points.",
      capturedAt,
      evidenceClass: "self_reported",
      provenance: {
        actor: "user",
        method: "manual_entry",
        provider: null,
        model: null,
      },
      sourceIds: [],
    },
    interpretation: null,
    tags: ["e2e-controlled-tool-origin"],
    backlinks: [],
    sourceLinks: [],
    attachmentIds: [],
    revisionIds: [],
    pathId: "reg-path",
    sessionId: null,
    contentRef: {
      authorityKey: "grant.exercise.REG-01-A",
      contentClass: "QCTP_ORIGINAL",
    },
    fields: {
      controlledContentAuthorityKey: "grant.exercise.REG-01-A",
      contentClass: "qctp_original",
      surface: "mirror",
      userVisibleNote: "Kept as user evidence.",
    },
    deletedAt: null,
  });
  await putStore(page, "records", {
    schemaVersion: 1,
    id: "e2e-held-legacy-content",
    kind: "source_note",
    title: "Legacy held Campbell observation",
    createdAt: capturedAt,
    updatedAt: capturedAt,
    observation: null,
    interpretation: null,
    tags: ["e2e-controlled-hold"],
    backlinks: [],
    sourceLinks: [],
    attachmentIds: [],
    revisionIds: [],
    pathId: "thomas-campbell",
    sessionId: null,
    fields: {
      sourceTrack: "thomas-campbell",
      exerciseId: "TC-01-POSSIBILITY-LEDGER",
      contentClass: "mystery_class",
      userVisibleNote: "Preserve this held observation.",
    },
    deletedAt: null,
  });
  await page.reload();
  await expect(
    page.locator(
      '[data-content-authority="foundation.day1.practice"][data-content-class="QCTP_SYNTHESIS"]',
    ),
  ).toBeVisible();

  await page
    .getByRole("navigation", { name: "Primary navigation" })
    .getByRole("button", { name: "Paths", exact: true })
    .click();
  await page
    .getByRole("button", { name: /BREATH-04.*Cyclic Sighing/u })
    .click();
  await expect(
    page.locator(
      '[data-content-authority="breath.method.QCTP-B2"][data-content-class="SOURCE_ENHANCED"]',
    ),
  ).toBeVisible();
  for (const [contentClass, humanLabel] of [
    ["SOURCE_FAITHFUL", "Source faithful"],
    ["SOURCE_ENHANCED", "Source enhanced"],
    ["QCTP_SYNTHESIS", "QCTP synthesis"],
    ["QCTP_ORIGINAL", "QCTP original"],
  ] as const) {
    const badge = page
      .locator(`[data-content-class="${contentClass}"]`)
      .first();
    await expect(badge).toBeVisible();
    await expect(badge).toContainText(humanLabel);
    await expect(badge).toContainText(contentClass);
    const fontSizes = await badge.evaluate((element) => [
      Number.parseFloat(getComputedStyle(element).fontSize),
      ...Array.from(
        element.querySelectorAll(
          ".content-class-meaning, .content-class-token",
        ),
        (part) => Number.parseFloat(getComputedStyle(part).fontSize),
      ),
    ]);
    expect(Math.min(...fontSizes)).toBeGreaterThanOrEqual(12);
  }
  await expect(
    page.locator(
      '[data-content-authority="campbell.module.TC-03"][data-content-class="HELD"]',
    ),
  ).toContainText("AUTHORITY HOLD");
  await expectNoHorizontalOverflow(page);

  const navigation = page.getByRole("navigation", {
    name: "Primary navigation",
  });
  await navigation
    .getByRole("button", { name: "Practice", exact: true })
    .click();
  await expect(
    page
      .locator(".screen-header")
      .locator('[data-content-class="QCTP_SYNTHESIS"]'),
  ).toBeVisible();
  await navigation.getByRole("button", { name: "Studio", exact: true }).click();
  await expect(
    page
      .locator(".screen-header")
      .locator('[data-content-class="QCTP_ORIGINAL"]'),
  ).toBeVisible();

  await navigation.getByRole("button", { name: "More", exact: true }).click();
  for (const [surface, authorityKey] of [
    ["Lab", "workflow.lab"],
    ["Codex", "workflow.codex"],
    ["Mirror / Insights", "workflow.mirror"],
  ] as const) {
    await page.getByRole("button", { name: new RegExp(`^${surface}`) }).click();
    await expect(
      page
        .locator(".screen-header")
        .locator(
          `[data-content-authority="${authorityKey}"][data-content-class="QCTP_ORIGINAL"]`,
        ),
    ).toBeVisible();
    if (authorityKey === "workflow.mirror") {
      const userEvidence = page
        .locator(".mirror-evidence-index details")
        .filter({ hasText: "Ryan's REG observation" });
      await userEvidence.locator("summary").click();
      await expect(
        userEvidence.getByText("Observation", { exact: true }),
      ).toBeVisible();
      await expect(userEvidence).toContainText(
        "I noticed the two circles crossed at two points.",
      );
      const toolOrigin = userEvidence.locator(
        '[data-originating-controlled-tool="grant.exercise.REG-01-A"]',
      );
      await expect(toolOrigin).toContainText(
        "Template/tool class: QCTP original (QCTP_ORIGINAL)",
      );
      await expect(toolOrigin).toContainText(
        "Your observation, interpretation, and result remain user evidence.",
      );
      const userFields = userEvidence.locator(
        ".user-record-structured-fields pre",
      );
      await expect(userFields).toContainText('"surface": "mirror"');
      await expect(userFields).toContainText(
        '"userVisibleNote": "Kept as user evidence."',
      );
      await expect(userFields).not.toContainText("contentClass");
      await expect(userFields).not.toContainText(
        "controlledContentAuthorityKey",
      );
      await expect(userEvidence.locator(".content-class-badge")).toHaveCount(0);

      const heldEvidence = page
        .locator(".mirror-evidence-index details")
        .filter({ hasText: "Legacy held Campbell observation" });
      await heldEvidence.locator("summary").click();
      const recoveryHold = heldEvidence.locator(
        '[data-controlled-content-hold="UNMAPPED_LEGACY_CONTENT_CLASS"]',
      );
      await expect(recoveryHold).toContainText(
        "campbell.exercise.TC-01-POSSIBILITY-LEDGER",
      );
      await expect(recoveryHold).toContainText("Original value: mystery_class");
      await expect(recoveryHold).toContainText(
        "Recovery export remains available. Editing and validated import stay blocked",
      );
      await expect(recoveryHold).toContainText("No data was changed.");
      await expect(recoveryHold.locator('[role="status"]')).toHaveCount(0);
      await expect(heldEvidence.locator(".content-class-badge")).toHaveCount(0);
      await expect(
        heldEvidence.locator(".user-record-structured-fields pre"),
      ).not.toContainText("mystery_class");
    }
    await expectNoHorizontalOverflow(page);
    await navigation.getByRole("button", { name: "More", exact: true }).click();
  }
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
