import { readFile } from "node:fs/promises";

import { expect, test, type Page } from "@playwright/test";

import {
  auditPaidCloudRequests,
  expectNoHorizontalOverflow,
  forceOffline,
  openQctp,
  readStore,
} from "./support";

const CONTROLLED_SOURCE_TAGS =
  "mirror-e2e, theme:attention, symbol:circle, person:brian, practice:breathing, source-track:reg-01";

async function createProtocolSource(
  page: Page,
  title: string,
  tags = CONTROLLED_SOURCE_TAGS,
): Promise<void> {
  await page.getByRole("textbox", { name: "Title" }).fill(title);
  await page
    .getByRole("textbox", { name: "Hypothesis" })
    .fill(
      "A stable breathing cadence will reduce self-reported attentional drift.",
    );
  await page
    .getByRole("textbox", { name: "Procedure" })
    .fill(
      "Run three seated five-minute trials and record drift after each trial.",
    );
  await page
    .getByRole("textbox", { name: "Controls" })
    .fill("Same room, timer, posture, and time of day.");
  await page
    .getByRole("textbox", { name: "Planned outcome measure" })
    .fill("Record attentional drift after every breathing trial.");
  await page.getByRole("textbox", { name: "Tags" }).fill(tags);
  await page.getByRole("button", { name: "Save locally", exact: true }).click();
  await expect(page.getByRole("status")).toContainText(
    "Protocol version 1 saved locally",
  );
}

test("iPhone Mirror queues a cited generative request and retrieves it later without PX13", async ({
  context,
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "iphone-portrait",
    "Controlled iPhone/PWA client acceptance",
  );
  const paidCloudRequests = auditPaidCloudRequests(page);
  await openQctp(page, "#/lab");

  await createProtocolSource(page, "Offline source protocol");
  const sourceRecordsBefore = await readStore<unknown>(page, "records");

  await page
    .getByRole("navigation", { name: "Primary navigation" })
    .getByRole("button", { name: "More", exact: true })
    .click();
  await page.getByRole("button", { name: /^Mirror \/ Insights/ }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Mirror" }),
  ).toBeVisible();
  await expect(
    page.getByText("Local store ready", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("offline", { exact: true })).toBeVisible();

  await forceOffline(context, page);
  await page
    .getByRole("textbox", { name: "Request" })
    .fill(
      "Compare the stated hypothesis and controls, identify one tension, and cite the source record.",
    );
  await page.getByRole("checkbox", { name: /Offline source protocol/ }).check();
  await expect(page.getByText("1 cited", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Queue locally", exact: true })
    .click();

  await expect(page.getByRole("status")).toContainText(
    "safe in the local Mirror queue",
  );
  await expect(
    page.getByText("Queued on this device", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Compare the stated hypothesis and controls, identify one tension, and cite the source record.",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Result notifications" }),
  ).toBeVisible();

  const queued = await readStore<{
    id: string;
    status: string;
    prompt: string;
    sourceRecordIds: string[];
    sourceSnapshots: Array<{
      recordId: string;
      title: string;
      excerpt: string;
    }>;
    lastError: string | null;
  }>(page, "mirrorRequests");
  expect(queued).toHaveLength(1);
  expect(queued[0]).toEqual(
    expect.objectContaining({
      status: "QUEUED_LOCAL",
      lastError: null,
      sourceRecordIds: [expect.stringMatching(/^lab-/)],
    }),
  );
  expect(queued[0]?.sourceSnapshots).toEqual([
    expect.objectContaining({
      title: "Offline source protocol",
      recordId: queued[0]?.sourceRecordIds[0],
    }),
  ]);
  expect(queued[0]?.sourceSnapshots[0]?.excerpt).toContain("hypothesis");

  await page
    .getByRole("navigation", { name: "Primary navigation" })
    .getByRole("button", { name: "More", exact: true })
    .click();
  await page.getByRole("button", { name: /^Mirror \/ Insights/ }).click();
  await expect(
    page.getByText("Queued on this device", { exact: true }),
  ).toBeVisible();
  const queuedJob = page.locator(".mirror-job").filter({
    hasText:
      "Compare the stated hypothesis and controls, identify one tension, and cite the source record.",
  });
  await expect(
    queuedJob
      .locator(".job-source-ids")
      .getByText(queued[0]!.sourceRecordIds[0]!, { exact: true }),
  ).toBeVisible();
  await expectNoHorizontalOverflow(page);

  expect(paidCloudRequests).toEqual([]);
  await expect(
    page.getByRole("alert").filter({ hasText: /api.?key|openai_api_key/i }),
  ).toHaveCount(0);
  expect(
    (await page.locator("body").innerText()).toLocaleLowerCase(),
  ).not.toContain("missing api key");

  await queuedJob
    .getByRole("button", { name: "Cancel and delete request" })
    .click();
  await queuedJob
    .getByRole("button", { name: "Confirm verified cancellation" })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "local request is now tombstoned",
  );
  await expect(
    page.getByText("Result-less request", { exact: true }),
  ).toBeVisible();

  const cancelled = await readStore<{
    id: string;
    deletedAt: string | null;
    remoteJobId: string | null;
  }>(page, "mirrorRequests");
  expect(cancelled).toEqual([
    expect.objectContaining({
      id: queued[0]!.id,
      deletedAt: expect.any(String),
      remoteJobId: null,
    }),
  ]);
  expect(await readStore(page, "mirrorResults")).toEqual([]);
  expect(await readStore(page, "records")).toEqual(sourceRecordsBefore);
  expect(paidCloudRequests).toEqual([]);
});

test("Mirror Core filters exact evidence and stores dismiss, correction, and annotation separately", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium",
    "Deterministic Mirror evidence acceptance is exercised once in Chromium",
  );
  const paidCloudRequests = auditPaidCloudRequests(page);
  await openQctp(page, "#/lab");
  await createProtocolSource(page, "Deterministic source protocol");
  const sourceRecordsBefore = await readStore<unknown>(page, "records");

  await page.goto("/#/mirror");
  await expect(
    page.getByRole("heading", { level: 1, name: "Mirror" }),
  ).toBeVisible();

  const sourceOrganizer = page.locator(".mirror-source-organizer");
  const sourceFilter = sourceOrganizer.getByRole("searchbox", {
    name: "Filter local sources",
  });
  await sourceFilter.fill("no-such-controlled-source");
  await expect(
    sourceOrganizer.getByText("No source records match."),
  ).toBeVisible();
  await sourceFilter.fill("deterministic mirror-e2e");
  await expect(
    sourceOrganizer.getByRole("checkbox", {
      name: /Deterministic source protocol/,
    }),
  ).toBeVisible();

  const core = page.locator(".local-insights");
  await core.getByLabel("Text filter").fill("attentional drift");
  await core.getByLabel("Record kind").selectOption("lab_protocol");
  await core.getByLabel("Exact tag").selectOption("mirror-e2e");
  await core.getByLabel("Explicit theme").selectOption("attention");
  await core
    .locator(".local-insight-filters label")
    .filter({ hasText: /^Source track/u })
    .locator("select")
    .selectOption("reg-01");
  await expect(
    core.getByText("Matching records").locator("..").getByText("1", {
      exact: true,
    }),
  ).toBeVisible();

  const evidenceIndex = core.locator(".mirror-evidence-index");
  const sourceDrawer = evidenceIndex.locator("details").filter({
    hasText: "Deterministic source protocol",
  });
  await sourceDrawer.locator("summary").click();
  await expect(
    sourceDrawer.getByText("Observation", { exact: true }),
  ).toBeVisible();
  await expect(
    sourceDrawer.getByText("Not recorded", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    sourceDrawer.getByText("Interpretation", { exact: true }),
  ).toBeVisible();
  await expect(sourceDrawer.locator("pre")).toContainText(
    "A stable breathing cadence will reduce self-reported attentional drift.",
  );
  await expect(sourceDrawer.locator("pre")).toContainText(
    "Record attentional drift after every breathing trial.",
  );

  const displayedEvidence = core.getByLabel("Displayed evidence");
  await displayedEvidence.selectOption({ label: "Tag: mirror-e2e (1)" });
  await core
    .getByLabel("Correction")
    .fill("This tag marks the controlled browser fixture only.");
  await core.getByRole("button", { name: "Save correction" }).click();
  await expect(page.getByRole("status")).toContainText(
    "saved without changing its source records",
  );

  await core
    .getByLabel("Annotation")
    .fill("Keep this count separate from any generative interpretation.");
  await core.getByRole("button", { name: "Save annotation" }).click();
  await expect(page.getByRole("status")).toContainText(
    "saved without changing its source records",
  );
  await core.getByRole("button", { name: "Dismiss insight" }).click();
  await expect(displayedEvidence).toHaveValue("");
  await core
    .getByRole("checkbox", { name: "Show dismissed deterministic insights" })
    .check();
  await displayedEvidence.selectOption({ label: "Tag: mirror-e2e (1)" });
  await expect(
    core.locator(".insight-review-editor .layer-heading span"),
  ).toHaveText("dismissed");
  const reviewEditor = core.locator(".insight-review-editor");
  await expect(reviewEditor).toContainText(
    "This tag marks the controlled browser fixture only.",
  );
  await expect(reviewEditor).toContainText(
    "Keep this count separate from any generative interpretation.",
  );

  const feedback = await readStore<{
    disposition: string;
    correction: string | null;
    annotation: string | null;
    sourceRecordIds: string[];
    revisionHistory: Array<{ action: string }>;
  }>(page, "mirrorInsightFeedback");
  expect(feedback).toEqual([
    expect.objectContaining({
      disposition: "dismissed",
      correction: "This tag marks the controlled browser fixture only.",
      annotation:
        "Keep this count separate from any generative interpretation.",
      sourceRecordIds: [expect.stringMatching(/^lab-/)],
      revisionHistory: [
        expect.objectContaining({ action: "corrected" }),
        expect.objectContaining({ action: "annotated" }),
        expect.objectContaining({ action: "dismissed" }),
      ],
    }),
  ]);
  expect(await readStore(page, "records")).toEqual(sourceRecordsBefore);

  await page.goto("/#/settings");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export JSON" }).click(),
  ]);
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const exported = JSON.parse(await readFile(downloadPath, "utf8")) as {
    records: unknown[];
    mirrorInsightFeedback: Array<{
      disposition: string;
      revisionHistory: Array<{ action: string }>;
    }>;
  };
  expect(exported.records).toEqual(sourceRecordsBefore);
  expect(exported.mirrorInsightFeedback).toEqual([
    expect.objectContaining({
      disposition: "dismissed",
      revisionHistory: [
        expect.objectContaining({ action: "corrected" }),
        expect.objectContaining({ action: "annotated" }),
        expect.objectContaining({ action: "dismissed" }),
      ],
    }),
  ]);
  expect(paidCloudRequests).toEqual([]);
});

test("same-origin PX13 synchronization returns a cited result to the complete Mirror client", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium",
    "The local synchronization contract is exercised once in Chromium",
  );
  const paidCloudRequests = auditPaidCloudRequests(page);
  let submittedRequestId = "";
  let deletionAttempts = 0;

  await page.addInitScript(() => {
    localStorage.setItem("qctp-device-session-auto-restore-disabled", "true");
  });
  await page.route("**/api/device-session", async (route) => {
    await route.fulfill({ status: 204 });
  });

  await page.route("**/api/transcriptions/policy", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        mode: "free-local",
        provider: "local-whisper",
        paidCloudEnabled: false,
        hardSpendLimitUsd: 0,
      }),
    });
  });
  await page.route("**/api/mirror/policy", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        mode: "free-local",
        provider: "mock-local",
        model: "qwen-local-test",
        paidCloudEnabled: false,
        recurringApiCostUsd: 0,
      }),
    });
  });
  await page.route("**/api/mirror/jobs**", async (route) => {
    const now = new Date().toISOString();
    if (route.request().method() === "DELETE") {
      deletionAttempts += 1;
      if (deletionAttempts === 1) {
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "controlled deletion outage" }),
        });
      } else {
        await route.fulfill({
          status: 204,
          headers: {
            "X-Request-Id": `mirror-delete-${String(deletionAttempts)}`,
          },
        });
      }
      return;
    }
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ jobs: [] }),
      });
      return;
    }
    const request = route.request().postDataJSON() as {
      requestId: string;
      sources: Array<{ recordId: string; title: string; excerpt: string }>;
    };
    submittedRequestId = request.requestId;
    const source = request.sources[0]!;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "mirror-job-local-1",
        requestId: request.requestId,
        status: "complete",
        createdAt: now,
        updatedAt: now,
        attempts: 1,
        lastError: null,
        result: {
          text:
            `The protocol pairs a specific prediction with repeatable controls; its unresolved tension is that attentional drift remains self-reported. [source:${source.recordId}]\n` +
            `Proposed question: Which observation would reduce uncertainty? [source:${source.recordId}]\n` +
            `Proposed action: Record the next trial with an explicit attention rating. [source:${source.recordId}]`,
          model: "qwen-local-test",
          citations: [
            {
              recordId: source.recordId,
              title: source.title,
              excerpt: source.excerpt.slice(0, 120),
            },
          ],
          createdAt: now,
        },
      }),
    });
  });

  await openQctp(page, "#/lab");
  await createProtocolSource(page, "Synchronized source protocol");
  await page.goto("/#/settings");
  await expect(
    page.getByRole("heading", { level: 1, name: "Settings" }),
  ).toBeVisible();
  await page.getByLabel("Local gateway session token").fill("a".repeat(64));
  await page.getByRole("button", { name: "Connect local companion" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Connected to the attested Free Local Mode",
  );

  await page.goto("/#/mirror");
  await expect(
    page.getByRole("heading", { level: 1, name: "Mirror" }),
  ).toBeVisible();
  await expect(page.getByText("online", { exact: true })).toBeVisible();
  await page
    .getByRole("textbox", { name: "Request" })
    .fill("Evaluate the protocol tension and cite the source.");
  await page
    .getByRole("checkbox", { name: /Synchronized source protocol/ })
    .check();
  await page
    .getByRole("button", { name: "Queue & synchronize", exact: true })
    .click();

  await expect(
    page.getByText("Result synchronized", { exact: true }),
  ).toBeVisible();
  await expect(
    page
      .locator(".mirror-result > p")
      .filter({ hasText: /unresolved tension is that attentional drift/ }),
  ).toBeVisible();
  await expect(
    page
      .getByText("Citations", { exact: true })
      .locator("..")
      .getByText("Synchronized source protocol", { exact: true }),
  ).toBeVisible();
  expect(submittedRequestId).toMatch(/^mirror-request-/);

  const requests = await readStore<{ id: string; status: string }>(
    page,
    "mirrorRequests",
  );
  const results = await readStore<{
    requestId: string;
    provider: string;
    model: string;
    citations: Array<{ recordId: string; title: string }>;
  }>(page, "mirrorResults");
  expect(requests).toEqual([
    expect.objectContaining({ id: submittedRequestId, status: "COMPLETE" }),
  ]);
  expect(results).toEqual([
    expect.objectContaining({
      requestId: submittedRequestId,
      provider: "px13-local",
      model: "qwen-local-test",
      citations: [
        expect.objectContaining({ title: "Synchronized source protocol" }),
      ],
    }),
  ]);

  const sourceRecordsBeforeReview = await readStore<unknown>(page, "records");
  const job = page.locator(".mirror-job").filter({
    hasText: "Evaluate the protocol tension and cite the source.",
  });

  await job.getByRole("button", { name: "Accept", exact: true }).click();
  await expect(job.locator(".mirror-result-metadata > b")).toHaveText(
    "accepted",
  );
  await expect(job.locator(".mirror-revision-history > summary")).toContainText(
    "Revision history (2)",
  );

  await job.getByRole("button", { name: "Revise", exact: true }).click();
  await job
    .getByLabel("Reflection text")
    .fill(
      "User-corrected reflection: the protocol is repeatable, while drift is still self-reported.",
    );
  await job
    .getByLabel("Proposed question")
    .fill("Which direct observation would best complement the self-report?");
  await job
    .getByLabel("Proposed action")
    .fill("Add one blinded attention check to the next local trial.");
  await job
    .getByLabel("Your annotation")
    .fill("Revision preserves the source while narrowing the claim.");
  await job.getByRole("button", { name: "Save review" }).click();
  await expect(job.locator(".mirror-result-metadata > b")).toHaveText(
    "revised",
  );
  await expect(job.locator(".mirror-revision-history > summary")).toContainText(
    "Revision history (3)",
  );

  await job.getByRole("button", { name: "Annotate", exact: true }).click();
  await job
    .getByLabel("Your annotation")
    .fill("Reviewed on the iPhone client; no source layer was rewritten.");
  await job.getByRole("button", { name: "Save review" }).click();
  await expect(job.locator(".mirror-user-annotation")).toContainText(
    "Reviewed on the iPhone client; no source layer was rewritten.",
  );
  await expect(job.locator(".mirror-revision-history > summary")).toContainText(
    "Revision history (4)",
  );

  await job.getByRole("button", { name: "Reject", exact: true }).click();
  await expect(job.locator(".mirror-result-metadata > b")).toHaveText(
    "rejected",
  );
  const history = job.locator(".mirror-revision-history");
  await expect(history.locator(":scope > summary")).toContainText(
    "Revision history (5)",
  );
  await history.locator(":scope > summary").click();
  await expect(history.locator("ol > li")).toHaveCount(5);
  const revisedEntry = history
    .locator("ol > li")
    .filter({ hasText: /revised/ })
    .first();
  await revisedEntry.locator("summary").click();
  await expect(revisedEntry).toContainText(
    "User-corrected reflection: the protocol is repeatable",
  );
  await expect(revisedEntry).toContainText(
    "Which direct observation would best complement the self-report?",
  );
  await expect(revisedEntry).toContainText(
    "Add one blinded attention check to the next local trial.",
  );

  const reviewedResults = await readStore<{
    id: string;
    disposition: string;
    annotation: string | null;
    revisionHistory: Array<{ action: string }>;
    deletedAt: string | null;
  }>(page, "mirrorResults");
  expect(reviewedResults).toEqual([
    expect.objectContaining({
      disposition: "rejected",
      annotation:
        "Reviewed on the iPhone client; no source layer was rewritten.",
      deletedAt: null,
      revisionHistory: [
        expect.objectContaining({ action: "generated" }),
        expect.objectContaining({ action: "accepted" }),
        expect.objectContaining({ action: "revised" }),
        expect.objectContaining({ action: "annotated" }),
        expect.objectContaining({ action: "rejected" }),
      ],
    }),
  ]);
  expect(await readStore(page, "records")).toEqual(sourceRecordsBeforeReview);

  await job
    .getByRole("button", { name: "Delete generated reflection" })
    .click();
  await job.getByRole("button", { name: "Confirm verified deletion" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "local Mirror reflection was preserved",
  );
  expect(deletionAttempts).toBe(1);
  expect(
    (await readStore<{ deletedAt: string | null }>(page, "mirrorRequests"))[0]
      ?.deletedAt,
  ).toBeNull();
  expect(
    (await readStore<{ deletedAt: string | null }>(page, "mirrorResults"))[0]
      ?.deletedAt,
  ).toBeNull();
  expect(await readStore(page, "records")).toEqual(sourceRecordsBeforeReview);

  await job.getByRole("button", { name: "Confirm verified deletion" }).click();
  await expect(page.getByRole("status")).toContainText("now tombstoned");
  expect(deletionAttempts).toBe(2);
  const deletedItem = page.locator(".mirror-deleted-item").filter({
    hasText: "Evaluate the protocol tension and cite the source.",
  });
  await expect(
    deletedItem.getByText("Generated reflection pair"),
  ).toBeVisible();

  const tombstonedRequests = await readStore<{
    id: string;
    deletedAt: string | null;
  }>(page, "mirrorRequests");
  const tombstonedResults = await readStore<{
    id: string;
    deletedAt: string | null;
    revisionHistory: Array<{ action: string }>;
  }>(page, "mirrorResults");
  expect(tombstonedRequests[0]?.deletedAt).toEqual(expect.any(String));
  expect(tombstonedResults[0]?.deletedAt).toEqual(expect.any(String));
  expect(tombstonedResults[0]?.revisionHistory.at(-1)?.action).toBe("deleted");

  await page.goto("/#/settings");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export JSON" }).click(),
  ]);
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const exported = JSON.parse(await readFile(downloadPath, "utf8")) as {
    records: unknown[];
    mirrorRequests: Array<{ id: string; deletedAt: string | null }>;
    mirrorResults: Array<{
      id: string;
      deletedAt: string | null;
      revisionHistory: Array<{ action: string }>;
    }>;
  };
  expect(exported.records).toEqual(sourceRecordsBeforeReview);
  expect(exported.mirrorRequests).toEqual([
    expect.objectContaining({
      id: submittedRequestId,
      deletedAt: expect.any(String),
    }),
  ]);
  expect(exported.mirrorResults).toEqual([
    expect.objectContaining({
      id: tombstonedResults[0]!.id,
      deletedAt: expect.any(String),
      revisionHistory: expect.arrayContaining([
        expect.objectContaining({ action: "generated" }),
        expect.objectContaining({ action: "revised" }),
        expect.objectContaining({ action: "deleted" }),
      ]),
    }),
  ]);

  await page.goto("/#/mirror");
  let deletedCard = page.locator(".mirror-deleted-item").filter({
    hasText: "Evaluate the protocol tension and cite the source.",
  });
  await deletedCard
    .getByRole("button", { name: "Restore request + reflection" })
    .click();
  await expect(page.getByRole("status")).toContainText(
    "revision history were restored together",
  );
  const restoredJob = page.locator(".mirror-job").filter({
    hasText: "Evaluate the protocol tension and cite the source.",
  });
  await expect(restoredJob.locator(".mirror-result-metadata > b")).toHaveText(
    "rejected",
  );
  await expect(
    restoredJob.locator(".mirror-revision-history > summary"),
  ).toContainText("Revision history (7)");

  await restoredJob
    .getByRole("button", { name: "Delete generated reflection" })
    .click();
  await restoredJob
    .getByRole("button", { name: "Confirm verified deletion" })
    .click();
  await expect(page.getByRole("status")).toContainText("now tombstoned");
  expect(deletionAttempts).toBe(3);

  deletedCard = page.locator(".mirror-deleted-item").filter({
    hasText: "Evaluate the protocol tension and cite the source.",
  });
  const resultId = tombstonedResults[0]!.id;
  const purgeInput = deletedCard.getByLabel(
    `Permanent purge confirmation for ${resultId}`,
  );
  const purgeButton = deletedCard.getByRole("button", {
    name: "Permanently purge",
  });
  const purgePhrase = `PURGE ${resultId}`;
  await purgeInput.fill(purgePhrase.slice(0, -1));
  await expect(purgeButton).toBeDisabled();
  await purgeInput.fill(purgePhrase);
  await expect(purgeButton).toBeEnabled();
  await purgeButton.click();
  await expect(page.getByRole("status")).toContainText("permanently purged");
  expect(deletionAttempts).toBe(4);
  expect(await readStore(page, "mirrorRequests")).toEqual([]);
  expect(await readStore(page, "mirrorResults")).toEqual([]);
  expect(await readStore(page, "records")).toEqual(sourceRecordsBeforeReview);
  expect(paidCloudRequests).toEqual([]);
});
