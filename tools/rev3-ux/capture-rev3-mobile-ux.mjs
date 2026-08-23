import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { devices, webkit } from "playwright";

const baseUrl = process.env.QCTP_UX_BASE_URL ?? "http://127.0.0.1:4193";
const outputDirectory = path.resolve("controlled-artifacts", "rev3-ux");
const iphone = devices["iPhone 13"];

if (!iphone)
  throw new Error("Playwright's iPhone 13 descriptor is unavailable.");

await mkdir(outputDirectory, { recursive: true });

const browser = await webkit.launch();
const context = await browser.newContext({
  ...iphone,
  locale: "en-US",
  timezoneId: "America/Chicago",
  serviceWorkers: "allow",
});
const page = await context.newPage();
const pageErrors = [];
const consoleErrors = [];
const httpErrors = [];
const paidCloudRequests = [];
const failedSameOriginRequests = [];

page.on("pageerror", (error) => pageErrors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") {
    consoleErrors.push({
      location: message.location(),
      text: message.text(),
    });
  }
});
page.on("response", (response) => {
  if (response.status() >= 400) {
    httpErrors.push({ status: response.status(), url: response.url() });
  }
});
page.on("request", (request) => {
  const hostname = new URL(request.url()).hostname.toLowerCase();
  if (
    hostname === "api.openai.com" ||
    hostname.endsWith(".openai.com") ||
    hostname === "api.anthropic.com" ||
    hostname.endsWith(".anthropic.com")
  ) {
    paidCloudRequests.push({ method: request.method(), url: request.url() });
  }
});
page.on("requestfailed", (request) => {
  if (new URL(request.url()).origin === new URL(baseUrl).origin) {
    failedSameOriginRequests.push({
      error: request.failure()?.errorText ?? "unknown",
      method: request.method(),
      url: request.url(),
    });
  }
});

async function assertVisible(selector, label) {
  const locator = page.locator(selector);
  await locator.waitFor({ state: "visible", timeout: 15_000 });
  if ((await locator.count()) < 1) {
    throw new Error(`${label} was not rendered.`);
  }
}

async function assertText(text, label = text) {
  const locator = page.getByText(text, { exact: false }).first();
  await locator.waitFor({ state: "visible", timeout: 15_000 });
  if ((await locator.count()) < 1) {
    throw new Error(`${label} was not rendered.`);
  }
}

async function assertNoHorizontalOverflow() {
  const overflow = await page.evaluate(() => ({
    body: document.body.scrollWidth - document.documentElement.clientWidth,
    document:
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  }));
  if (overflow.body !== 0 || overflow.document !== 0) {
    throw new Error(
      `Horizontal overflow detected: ${JSON.stringify(overflow)}`,
    );
  }
}

async function waitForEnabled(locator, label) {
  await locator.waitFor({ state: "visible", timeout: 15_000 });
  const deadline = Date.now() + 15_000;
  while (await locator.isDisabled()) {
    if (Date.now() >= deadline) {
      throw new Error(`${label} remained disabled after 15 seconds.`);
    }
    await page.waitForTimeout(100);
  }
}

async function capture(filename) {
  await page.screenshot({
    path: path.join(outputDirectory, filename),
    fullPage: false,
  });
}

async function openApp(hash = "") {
  await page.goto(`${baseUrl}/${hash}`, { waitUntil: "domcontentloaded" });
  await assertVisible("h1", "screen heading");
  await assertVisible(
    'nav[aria-label="Primary navigation"]',
    "primary navigation",
  );
  await assertNoHorizontalOverflow();
}

async function persistRepresentativePracticeIssue() {
  await page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const openRequest = indexedDB.open("qctp-rev2");
        openRequest.onerror = () =>
          reject(openRequest.error ?? new Error("Unable to open QCTP data."));
        openRequest.onsuccess = () => {
          const database = openRequest.result;
          const transaction = database.transaction("settings", "readwrite");
          const store = transaction.objectStore("settings");
          const readRequest = store.get("settings");
          readRequest.onerror = () =>
            reject(
              readRequest.error ?? new Error("Unable to read QCTP settings."),
            );
          readRequest.onsuccess = () => {
            store.put({
              ...readRequest.result,
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
          };
          transaction.onerror = () =>
            reject(
              transaction.error ?? new Error("Unable to update QCTP settings."),
            );
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
        };
      }),
  );
}

try {
  await openApp();
  await assertText("Day 1 — Baseline Awareness");
  await assertText("Voice-Free Day 1 · 25 minutes");
  await assertText("Narrated Day 1 is held");
  await waitForEnabled(
    page.getByRole("button", { name: "Begin Voice-Free Day 1" }),
    "The one-tap Voice-Free Day 1 control",
  );
  const criticalControls = [
    page.getByRole("button", { name: "Open Quick Capture" }),
    ...["Today", "Paths", "Practice", "Studio", "More"].map((name) =>
      page
        .getByRole("navigation", { name: "Primary navigation" })
        .getByRole("button", { name, exact: true }),
    ),
  ];
  for (const control of criticalControls) {
    const box = await control.boundingBox();
    if (!box || box.width < 44 || box.height < 44) {
      throw new Error(
        `A critical mobile control missed the 44 CSS-pixel tap floor: ${JSON.stringify(box)}`,
      );
    }
  }
  await capture("01-today-morning-cockpit-iphone13-webkit.png");

  await persistRepresentativePracticeIssue();
  await page.reload({ waitUntil: "domcontentloaded" });
  await assertText("Needs attention");
  await assertText("Practice ended before the complete return");
  const issueLabel = page.getByText("Unresolved practice issue", {
    exact: true,
  });
  await issueLabel.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -48));
  await assertNoHorizontalOverflow();
  await capture("08-today-durable-practice-issue-iphone13-webkit.png");

  await openApp("#/practice");
  await assertText("Voice-Free Day 1");
  await assertText("25:00");
  await assertText("OFFLINE AUDIO READY");
  await assertText("Six source-grounded phases");
  if (
    (await page
      .locator('[aria-label="Day 1 phase sequence"] [role="listitem"]')
      .count()) !== 6
  ) {
    throw new Error("Voice-Free Day 1 did not render exactly six phases.");
  }
  await capture("02-voice-free-day1-iphone13-webkit.png");

  await openApp("#/paths");
  await assertText("Paths");
  await assertText("112-Day Foundation");
  await assertText("Days 2–112 retain their controlled module slots");
  await capture("03-paths-overview-iphone13-webkit.png");

  const breathHeading = page.getByRole("heading", {
    name: "Breath Foundations",
  });
  await breathHeading.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -48));
  await assertText("Seven source-controlled sessions teach mechanics");
  if ((await page.locator(".breath-foundation-tabs button").count()) !== 7) {
    throw new Error("Breath Foundations did not render seven sessions.");
  }
  await assertNoHorizontalOverflow();
  await capture("04-breath-foundations-iphone13-webkit.png");

  const stateHeading = page.getByRole("heading", {
    name: "Capability, guidance, and source control",
  });
  await stateHeading.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -48));
  await assertText("Elapsed practice time never advances capability");
  if ((await page.locator(".qctp-state-progress-card").count()) !== 12) {
    throw new Error("State Atlas did not render the twelve controlled states.");
  }
  await assertNoHorizontalOverflow();
  await capture("05-state-atlas-iphone13-webkit.png");

  await page.goto(`${baseUrl}/voice-audition/`, {
    waitUntil: "domcontentloaded",
  });
  await assertText("Blind voice audition");
  await assertText("One fair comparison");
  await assertText("VOICE TEST ONLY — NOT A MEDITATION");
  await assertNoHorizontalOverflow();
  const auditionText = await page.locator("body").innerText();
  if (/Kokoro|Piper|KittenTTS|route_id/u.test(auditionText)) {
    throw new Error("The public audition exposed a route identity.");
  }
  const revealProbe = await page.request.get(
    `${baseUrl}/voice-audition/route-reveal.json`,
  );
  const revealProbeBody = await revealProbe.text();
  if (/Kokoro|Piper|KittenTTS|route_id/u.test(revealProbeBody)) {
    throw new Error("The public route-reveal probe exposed a route identity.");
  }
  await capture("06-blind-voice-audition-iphone13-webkit.png");

  const listenHeading = page.getByRole("heading", { name: "1. Listen" });
  await listenHeading.scrollIntoViewIfNeeded();
  await page.evaluate(() => window.scrollBy(0, -48));
  for (const label of ["A", "B", "C"]) {
    await page.getByRole("button", { name: label, exact: true }).waitFor({
      state: "visible",
    });
  }
  const confirmButton = page.getByRole("button", {
    name: "Confirm physical choice",
  });
  if (!(await confirmButton.isDisabled())) {
    throw new Error("The blind audition confirmation began enabled.");
  }
  await assertNoHorizontalOverflow();
  await capture("07-blind-voice-controls-iphone13-webkit.png");

  if (pageErrors.length > 0) {
    throw new Error(`Page errors were captured: ${JSON.stringify(pageErrors)}`);
  }
  if (paidCloudRequests.length > 0) {
    throw new Error(
      `Paid-cloud requests were captured: ${JSON.stringify(paidCloudRequests)}`,
    );
  }

  const evidence = {
    schema: "qctp-rev3-mobile-ux-capture-v1",
    generated_at: new Date().toISOString(),
    base_url: baseUrl,
    runner: {
      engine: "Playwright WebKit on Windows",
      browser_version: browser.version(),
      descriptor: "iPhone 13",
      viewport_css_pixels: iphone.viewport,
      device_scale_factor: iphone.deviceScaleFactor,
      is_mobile: iphone.isMobile,
      has_touch: iphone.hasTouch,
    },
    assertions: {
      today_morning_cockpit: "PASS",
      today_durable_practice_issue_after_reload: "PASS",
      voice_free_day1: "PASS",
      paths_overview: "PASS",
      breath_foundations: "PASS",
      state_atlas: "PASS",
      blind_audition_mapping_secrecy: "PASS",
      critical_tap_targets_44_css_px: "PASS",
      horizontal_overflow: "PASS",
      paid_cloud_request_audit: "PASS",
      page_error_audit: "PASS",
    },
    observations: {
      console_errors: consoleErrors,
      http_errors: httpErrors,
      failed_same_origin_requests: failedSameOriginRequests,
      paid_cloud_requests: paidCloudRequests,
      page_errors: pageErrors,
    },
    screenshots: [
      "01-today-morning-cockpit-iphone13-webkit.png",
      "02-voice-free-day1-iphone13-webkit.png",
      "03-paths-overview-iphone13-webkit.png",
      "04-breath-foundations-iphone13-webkit.png",
      "05-state-atlas-iphone13-webkit.png",
      "06-blind-voice-audition-iphone13-webkit.png",
      "07-blind-voice-controls-iphone13-webkit.png",
      "08-today-durable-practice-issue-iphone13-webkit.png",
    ],
    physical_acceptance: "NOT_PERFORMED",
    release_authority: "ZERO_RELEASE",
  };
  await writeFile(
    path.join(outputDirectory, "capture-run.json"),
    `${JSON.stringify(evidence, null, 2)}\n`,
    "utf8",
  );
} finally {
  await context.close();
  await browser.close();
}
