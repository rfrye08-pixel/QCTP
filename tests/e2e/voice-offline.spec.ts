import { expect, test } from "@playwright/test";

import {
  auditPaidCloudRequests,
  forceOffline,
  indexedDbBlobRoundTripSupported,
  installFakeMicrophone,
  mediaTestState,
  openQctp,
  readAudioChunkFacts,
  readStore,
} from "./support";

test("permission waits for Start and offline chunks remain playable in IndexedDB", async ({
  context,
  page,
}) => {
  const browserErrors: string[] = [];
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await installFakeMicrophone(page);
  const paidCloudRequests = auditPaidCloudRequests(page);
  await openQctp(page);
  test.skip(
    !(await indexedDbBlobRoundTripSupported(page)),
    "This Playwright WebKit runtime cannot structured-clone Blob data into IndexedDB; validate capture on physical iOS Safari.",
  );

  expect((await mediaTestState(page)).getUserMediaCalls).toBe(0);
  await page.getByRole("button", { name: "Open Quick Capture" }).click();
  await expect(
    page.getByRole("dialog", { name: "Quick Capture" }),
  ).toBeVisible();
  expect((await mediaTestState(page)).getUserMediaCalls).toBe(0);

  await forceOffline(context, page);
  await page.getByRole("button", { name: "Start recording" }).click();
  await expect(
    page.getByText("Recording — audio is being stored locally"),
  ).toBeVisible();
  expect((await mediaTestState(page)).getUserMediaCalls).toBe(1);

  await page.waitForTimeout(120);
  await page.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(
    page.getByText("Stopped — locally safe and ready to review"),
  ).toBeVisible();
  expect(browserErrors).toEqual([]);
  const playback = page
    .getByRole("dialog", { name: "Quick Capture" })
    .locator("audio");
  await expect(playback).toBeVisible();
  await expect(playback).toHaveAttribute("src", /^blob:/);
  await playback.evaluate((element: HTMLAudioElement) => element.play());
  expect((await mediaTestState(page)).playbackCalls).toBe(1);

  const chunksBeforeAccept = await readAudioChunkFacts(page);
  expect(chunksBeforeAccept.length).toBeGreaterThan(0);
  expect(chunksBeforeAccept.every((chunk) => chunk.size > 0)).toBe(true);
  expect(chunksBeforeAccept.every((chunk) => chunk.type === "audio/webm")).toBe(
    true,
  );

  await page.getByRole("textbox", { name: "Title" }).fill("Offline quick note");
  await page
    .getByRole("textbox", { name: "Manual text or correction (optional)" })
    .fill(
      "A locally preserved observation captured while the network was unavailable.",
    );
  await expect(
    page.getByRole("checkbox", {
      name: /Queue no-cost local PX13 transcription/,
    }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Save locally", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Quick Capture" }),
  ).toBeHidden();

  const recordings = await readStore<{
    id: string;
    status: string;
    acceptedAt: string | null;
    provider: string | null;
    model: string | null;
  }>(page, "recordings");
  expect(recordings).toHaveLength(1);
  expect(recordings[0]).toEqual(
    expect.objectContaining({
      status: "LOCAL_ONLY",
      provider: null,
      model: null,
    }),
  );
  expect(recordings[0]?.acceptedAt).not.toBeNull();
  expect(await readStore(page, "transcriptionQueue")).toEqual([]);
  expect(await readStore<{ title: string }>(page, "records")).toEqual([
    expect.objectContaining({ title: "Offline quick note" }),
  ]);
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage).some((key) =>
        /data:audio|base64/i.test(localStorage.getItem(key) ?? ""),
      ),
    ),
  ).toBe(false);
  expect((await mediaTestState(page)).trackStops).toBeGreaterThan(0);
  expect(paidCloudRequests).toEqual([]);
  await expect(
    page.getByRole("alert").filter({ hasText: /api.?key/i }),
  ).toHaveCount(0);
});
