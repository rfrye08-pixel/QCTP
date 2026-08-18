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
