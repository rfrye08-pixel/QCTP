import { expect, test } from "@playwright/test";

import {
  auditPaidCloudRequests,
  advanceFakeRecorderTime,
  createPendingVoiceFreePracticeSession,
  expectNoHorizontalOverflow,
  forceOffline,
  indexedDbBlobRoundTripSupported,
  installFakeMicrophone,
  mediaTestState,
  openQctp,
  putStore,
  readAudioChunkFacts,
  readStore,
} from "./support";

test("global timed controls are accessible before permission on mobile", async ({
  page,
}) => {
  await installFakeMicrophone(page);
  await openQctp(page);
  const trigger = page.getByRole("button", { name: "Open Voice Capture" });
  await trigger.click();

  const dialog = page.getByRole("dialog", { name: "Voice Capture" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toBeFocused();
  await expect(page.locator(".app-frame")).toHaveAttribute("inert", "");
  await expect(page.locator(".app-frame")).toHaveAttribute(
    "aria-hidden",
    "true",
  );
  expect((await mediaTestState(page)).getUserMediaCalls).toBe(0);
  await dialog.getByRole("radio", { name: /Timed Auto-Dictation/u }).check();

  for (const minutes of [5, 10, 20] as const) {
    await dialog
      .getByRole("radio", { name: `${String(minutes)} minutes` })
      .check();
    await expect(
      dialog.getByRole("button", {
        name: `Start ${String(minutes)}-minute Auto-Dictation`,
      }),
    ).toBeVisible();
  }
  await expect(dialog.getByRole("status")).toHaveCount(1);
  await expect(dialog.getByRole("timer")).toHaveAccessibleName(
    "20 minutes 0 seconds remaining",
  );
  const touchTargetHeights = await dialog
    .locator(".capture-mode-picker label, .duration-picker label")
    .evaluateAll((labels) =>
      labels.map((label) => label.getBoundingClientRect().height),
    );
  expect(touchTargetHeights).toHaveLength(5);
  expect(touchTargetHeights.every((height) => height >= 44)).toBe(true);
  await expectNoHorizontalOverflow(page);

  // Playback exists only after Blob-backed capture (unsupported by this
  // Windows WebKit harness). Inject the same native focus target so both
  // engines still verify that the modal trap includes audio controls.
  await dialog.evaluate((element) => {
    const playback = document.createElement("audio");
    playback.controls = true;
    playback.setAttribute("aria-label", "Captured audio playback probe");
    element.append(playback);
  });
  const playbackProbe = dialog.getByLabel("Captured audio playback probe");
  await playbackProbe.focus();
  await page.keyboard.press("Tab");
  await expect(
    dialog.getByRole("radio", { name: /Quick voice note/u }),
  ).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(playbackProbe).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
  expect((await mediaTestState(page)).getUserMediaCalls).toBe(0);
});

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
  await page.getByRole("button", { name: "Open Voice Capture" }).click();
  await expect(
    page.getByRole("dialog", { name: "Voice Capture" }),
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
    .getByRole("dialog", { name: "Voice Capture" })
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
  ).toBeEnabled();
  await expect(
    page.getByRole("checkbox", {
      name: /Queue no-cost local PX13 transcription/,
    }),
  ).not.toBeChecked();
  await page.getByRole("button", { name: "Save locally", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Voice Capture" }),
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

for (const minutes of [5, 10, 20] as const) {
  test(`${String(minutes)}-minute global Auto-Dictation stops at its local limit and queues without cloud`, async ({
    context,
    page,
  }) => {
    await installFakeMicrophone(page);
    const paidCloudRequests = auditPaidCloudRequests(page);
    await openQctp(page);
    test.skip(
      !(await indexedDbBlobRoundTripSupported(page)),
      "This Playwright WebKit runtime cannot structured-clone Blob data into IndexedDB; validate capture on physical iOS Safari.",
    );

    await page.getByRole("button", { name: "Open Voice Capture" }).click();
    const dialog = page.getByRole("dialog", { name: "Voice Capture" });
    await dialog.getByRole("radio", { name: /Timed Auto-Dictation/u }).check();
    await dialog
      .getByRole("radio", { name: `${String(minutes)} minutes` })
      .check();
    await expect(
      dialog.getByRole("button", {
        name: `Start ${String(minutes)}-minute Auto-Dictation`,
      }),
    ).toBeVisible();
    expect((await mediaTestState(page)).getUserMediaCalls).toBe(0);

    await forceOffline(context, page);
    await dialog
      .getByRole("button", {
        name: `Start ${String(minutes)}-minute Auto-Dictation`,
      })
      .click();
    await expect(dialog.getByRole("button", { name: "Stop" })).toBeVisible();
    await expect(dialog.getByLabel("Title")).toHaveCount(0);
    await expect(dialog.getByLabel("Destination")).toHaveCount(0);

    await advanceFakeRecorderTime(page, minutes * 60_000);
    await expect(dialog.getByText(/Timer complete/u)).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: "Append segment" }),
    ).toHaveCount(0);
    const playback = dialog.locator("audio");
    await expect(playback).toBeVisible();
    await expect(playback).toHaveAttribute("src", /^blob:/u);
    await expect(
      dialog.getByRole("checkbox", {
        name: /Queue no-cost local PX13 transcription/u,
      }),
    ).toBeChecked();
    await dialog.getByRole("button", { name: "Save locally & queue" }).click();
    await expect(dialog).toBeHidden();

    expect(
      await readStore<{
        captureMode: string | null;
        requestedDurationMs: number | null;
        captureContext: unknown;
        completedByDurationLimit: boolean | null;
        durationMs: number;
        provider: string | null;
        model: string | null;
      }>(page, "recordings"),
    ).toEqual([
      expect.objectContaining({
        captureMode: "auto-dictation",
        requestedDurationMs: minutes * 60_000,
        captureContext: { type: "global" },
        completedByDurationLimit: true,
        durationMs: minutes * 60_000,
        provider: null,
        model: null,
      }),
    ]);
    expect(
      await readStore<{
        kind: string;
        interpretation: unknown;
        fields: Record<string, unknown>;
      }>(page, "records"),
    ).toEqual([
      expect.objectContaining({
        kind: "auto_dictation",
        interpretation: null,
        fields: expect.objectContaining({
          captureMode: "auto-dictation",
          requestedDurationMinutes: minutes,
          actualDurationMs: minutes * 60_000,
          completedByDurationLimit: true,
        }),
      }),
    ]);
    expect(await readStore(page, "transcriptionQueue")).toHaveLength(1);
    expect((await mediaTestState(page)).trackStops).toBeGreaterThan(0);
    expect(paidCloudRequests).toEqual([]);
    await expect(
      page.getByRole("alert").filter({ hasText: /api.?key/iu }),
    ).toHaveCount(0);
  });
}

test("a voice-first practice debrief accepts offline audio and queues PX13 transcription locally", async ({
  context,
  page,
}) => {
  await installFakeMicrophone(page);
  const paidCloudRequests = auditPaidCloudRequests(page);
  await openQctp(page);
  test.skip(
    !(await indexedDbBlobRoundTripSupported(page)),
    "This Playwright WebKit runtime cannot structured-clone Blob data into IndexedDB; validate capture on physical iOS Safari.",
  );
  await putStore(
    page,
    "practiceSessions",
    createPendingVoiceFreePracticeSession("e2e-voice-debrief"),
  );
  await page.reload();
  await page.getByRole("button", { name: "Finish raw observation" }).click();
  const debrief = page.locator("#post-session-debrief");
  await expect(debrief).toBeVisible();
  await forceOffline(context, page);

  await debrief.getByRole("button", { name: "Record raw observation" }).click();
  await debrief.getByRole("button", { name: "Start recording" }).click();
  await expect(
    debrief.getByText("Recording — audio is being stored locally"),
  ).toBeVisible();
  await page.waitForTimeout(120);
  await debrief.getByRole("button", { name: "Stop", exact: true }).click();
  const queue = debrief.getByRole("checkbox", {
    name: /Queue no-cost local PX13 transcription/,
  });
  await expect(queue).toBeEnabled();
  await expect(queue).toBeChecked();
  await debrief
    .getByRole("textbox", { name: "Optional typed raw observation" })
    .fill("Breathing felt smoother and my shoulders released.");
  await debrief.getByRole("button", { name: "Save locally & queue" }).click();
  await expect(debrief).toHaveCount(0);

  const chunks = await readAudioChunkFacts(page);
  expect(chunks.length).toBeGreaterThan(0);
  expect(chunks.every((chunk) => chunk.type === "audio/webm")).toBe(true);
  expect(await readStore(page, "transcriptionQueue")).toHaveLength(1);
  expect(
    await readStore<{
      status: string;
      acceptedAt: string | null;
      destinationId: string | null;
    }>(page, "recordings"),
  ).toEqual([
    expect.objectContaining({
      status: "TRANSCRIPTION_QUEUED",
      destinationId: "e2e-voice-debrief",
    }),
  ]);
  expect(
    await readStore<{
      sessionId: string | null;
      interpretation: unknown;
      fields: { captureModality?: string; voiceRecordingId?: string };
    }>(page, "records"),
  ).toEqual([
    expect.objectContaining({
      sessionId: "e2e-voice-debrief",
      interpretation: null,
      fields: expect.objectContaining({
        captureModality: "voice",
      }),
    }),
  ]);
  expect(
    await readStore<{ debrief: { status: string; recordId: string | null } }>(
      page,
      "practiceSessions",
    ),
  ).toEqual([
    expect.objectContaining({
      debrief: expect.objectContaining({
        status: "completed",
        recordId: expect.stringMatching(/^voice-record:/u),
      }),
    }),
  ]);
  expect(paidCloudRequests).toEqual([]);
  await expect(
    page.getByRole("alert").filter({ hasText: /api.?key/i }),
  ).toHaveCount(0);
});
