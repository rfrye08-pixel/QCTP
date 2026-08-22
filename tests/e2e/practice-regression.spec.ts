import { expect, test } from "@playwright/test";

import { openQctp, readStore } from "./support";

test("Day 1 presents the exact 25:00 sequence and early exit earns nothing", async ({
  page,
}) => {
  await openQctp(page, "#/practice");
  await expect(
    page.getByRole("heading", { level: 1, name: "State Control" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "25:00 exact" }),
  ).toBeVisible();
  await expect(page.getByTestId("practice-timer")).toHaveText("25:00");

  await page.getByRole("button", { name: "Begin practice" }).click();
  await expect(
    page.getByRole("button", { name: "End without completion" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "End without completion" }).click();
  await expect(page.getByRole("button", { name: "Start again" })).toBeVisible();

  const foundation = await readStore<{
    currentDay: number;
    completion: Record<string, { morning: boolean }>;
  }>(page, "foundation");
  expect(foundation[0]?.currentDay).toBe(1);
  expect(foundation[0]?.completion["1"]?.morning ?? false).toBe(false);
});

test("Day 1 narration is a checksum-manifested same-origin MP3 pack", async ({
  page,
}) => {
  const thirdPartyAudioRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("resource2.heygen.ai")) {
      thirdPartyAudioRequests.push(request.url());
    }
  });

  await openQctp(page, "#/practice");

  await expect(page.getByTestId("day1-lesson-audio")).toHaveAttribute(
    "src",
    /audio\/day1\/lesson\.mp3$/,
  );

  const manifest = await page.evaluate(async () => {
    const response = await fetch("audio/day1/manifest.json", {
      cache: "no-store",
    });
    return {
      status: response.status,
      body: (await response.json()) as {
        schema: string;
        fileCount: number;
        totalBytes: number;
        mediaType: string;
        files: Array<{
          relativePath: string;
          mediaType: string;
          sha256: string;
        }>;
      },
    };
  });

  expect(manifest.status).toBe(200);
  expect(manifest.body.schema).toBe("qctp-day1-local-audio-pack-v2");
  expect(manifest.body.fileCount).toBe(23);
  expect(manifest.body.totalBytes).toBe(13_340_411);
  expect(manifest.body.mediaType).toBe("audio/mpeg");
  expect(manifest.body.files).toHaveLength(23);
  expect(
    manifest.body.files.every(
      (file) =>
        file.relativePath.endsWith(".mp3") &&
        file.mediaType === "audio/mpeg" &&
        /^[a-f0-9]{64}$/.test(file.sha256),
    ),
  ).toBe(true);
  expect(thirdPartyAudioRequests).toEqual([]);
});

test("shortened test mode completes its timer but cannot earn Day 1 credit", async ({
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
  await expect(
    page.getByRole("heading", { name: "90-second verification" }),
  ).toBeVisible();
  await expect(
    page.getByText("Verification mode can never earn morning completion."),
  ).toBeVisible();

  await page.clock.install();
  await page.getByRole("button", { name: "Begin practice" }).click();
  await page.clock.runFor(91_000);
  await expect(page.getByRole("button", { name: "Start again" })).toBeVisible();
  await expect(page.getByTestId("practice-timer")).toHaveText("0:00");

  const foundation = await readStore<{
    currentDay: number;
    completion: Record<string, { morning: boolean }>;
  }>(page, "foundation");
  expect(foundation[0]?.currentDay).toBe(1);
  expect(foundation[0]?.completion["1"]?.morning ?? false).toBe(false);
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
  await expect(
    page.getByRole("group", { name: "Auto-Dictation duration" }),
  ).toBeVisible();
  await expect(page.getByRole("radio", { name: "5 minutes" })).toBeChecked();
  await expect(page.getByTestId("recorder-clock")).toHaveText(/5:00/);
});
