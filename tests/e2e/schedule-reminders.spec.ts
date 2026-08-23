import { expect, test } from "@playwright/test";

import {
  auditPaidCloudRequests,
  expectNoHorizontalOverflow,
  openQctp,
} from "./support";

test("personal Day 1 reminder times survive reload without becoming source times", async ({
  page,
}) => {
  const paidCloudRequests = auditPaidCloudRequests(page);
  await openQctp(page, "#/settings");

  await expect(
    page.getByRole("heading", { name: "Reminders & availability" }),
  ).toBeVisible();
  await expect(page.getByText(/best effort—not guaranteed/u)).toBeVisible();
  const midday = page.getByLabel("Daytime integration · personal time");
  const evening = page.getByLabel("Evening close · personal time");
  await midday.fill("12:30");
  await expect(
    page.getByText("Personal reminder time saved on this device."),
  ).toBeVisible();
  await evening.fill("19:15");
  await expect(
    page.getByText("Personal reminder time saved on this device."),
  ).toBeVisible();

  await page.reload();
  await expect(midday).toHaveValue("12:30");
  await expect(evening).toHaveValue("19:15");
  await page.goto("/");
  await expect(page.getByText(/Personal reminder.*12:30/u)).toBeVisible();
  await expect(page.getByText(/Personal reminder.*19:15/u)).toBeVisible();
  await expectNoHorizontalOverflow(page);
  expect(paidCloudRequests).toEqual([]);
});

test("Today remains the reminder fallback while the network is offline", async ({
  page,
  context,
  browserName,
}) => {
  test.skip(
    browserName === "webkit",
    "Windows Playwright WebKit aborts offline navigation before its service worker handles it; physical iPhone cold-offline remains a release hold.",
  );
  const paidCloudRequests = auditPaidCloudRequests(page);
  await openQctp(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    )
    .toBe(true);
  await context.setOffline(true);
  await expect
    .poll(() =>
      page.evaluate(() => ({
        offline: !navigator.onLine,
        durableHint:
          sessionStorage.getItem("qctp-network-offline-hint") === "true",
      })),
    )
    .toEqual({ offline: true, durableHint: true });
  await page.reload({ waitUntil: "domcontentloaded" });

  await expect(
    page.getByRole("heading", { name: "Later today" }),
  ).toBeVisible();
  await expect(page.getByText("Offline-ready", { exact: true })).toBeVisible();
  await expect(
    page.getByText(/Anything due or unfinished stays here/u),
  ).toBeVisible();
  expect(paidCloudRequests).toEqual([]);
});
