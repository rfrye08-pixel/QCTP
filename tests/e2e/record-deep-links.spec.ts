import { expect, test, type Page } from "@playwright/test";

import {
  expectNoHorizontalOverflow,
  openQctp,
  putStore,
  readStore,
} from "./support";

const capturedAt = "2026-08-23T09:00:00.000Z";

function record(
  id: string,
  title: string,
  backlinks: Array<{ recordId: string; relationship: string }> = [],
) {
  return {
    schemaVersion: 1,
    id,
    kind: "mirror",
    title,
    createdAt: capturedAt,
    updatedAt: capturedAt,
    observation: {
      id: `${id}:observation`,
      text: `Exact observation for ${title}.`,
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
    tags: ["deep-link-e2e"],
    backlinks,
    sourceLinks: [],
    attachmentIds: [],
    revisionIds: [],
    pathId: null,
    sessionId: null,
    fields: {},
    deletedAt: null,
  };
}

async function seedLinkedRecords(page: Page): Promise<void> {
  await putStore(page, "records", record("e2e-record-b", "Deep link record B"));
  await putStore(
    page,
    "records",
    record("e2e-record-a", "Deep link record A", [
      { recordId: "e2e-record-b", relationship: "supports" },
    ]),
  );
}

test("Mirror and Codex preserve exact record navigation, history, focus, and missing holds", async ({
  page,
}) => {
  await openQctp(page);
  await seedLinkedRecords(page);
  const before = await readStore(page, "records");

  await page.goto("/#/mirror/source/e2e-record-a");
  await expect(
    page.getByRole("heading", { level: 1, name: "Mirror" }),
  ).toBeVisible();
  const mirrorRecord = page.locator("#mirror-source-e2e-record-a");
  await expect(mirrorRecord).toHaveAttribute("open", "");
  const mirrorSummary = mirrorRecord.locator("summary");
  await expect(mirrorSummary).toHaveAttribute("aria-current", "location");
  await expect(mirrorSummary).toBeFocused();
  const summaryBox = await mirrorSummary.boundingBox();
  expect(summaryBox).not.toBeNull();
  expect(summaryBox!.height).toBeGreaterThanOrEqual(44);

  const openInCodex = mirrorRecord.getByRole("link", {
    name: "Open full record in Codex",
  });
  const codexLinkBox = await openInCodex.boundingBox();
  expect(codexLinkBox).not.toBeNull();
  expect(codexLinkBox!.height).toBeGreaterThanOrEqual(44);
  await openInCodex.click();
  await expect(page).toHaveURL(/#\/codex\/record\/e2e-record-a$/u);
  await expect(
    page.getByRole("heading", { level: 1, name: "Codex" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: "Deep link record A" }),
  ).toBeVisible();
  await expect(page.locator(".codex-detail")).toBeFocused();

  await page.getByRole("searchbox", { name: /Search titles/u }).fill("none");
  await expect(
    page.getByText("Opened from link · outside current filter"),
  ).toBeVisible();
  await page.getByRole("link", { name: "e2e-record-b" }).click();
  await expect(page).toHaveURL(/#\/codex\/record\/e2e-record-b$/u);
  await expect(
    page.getByRole("heading", { level: 2, name: "Deep link record B" }),
  ).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/#\/codex\/record\/e2e-record-a$/u);
  await expect(
    page.getByRole("heading", { level: 2, name: "Deep link record A" }),
  ).toBeVisible();
  await page.goForward();
  await expect(page).toHaveURL(/#\/codex\/record\/e2e-record-b$/u);

  await page.goto("/#/mirror/source/missing-record");
  await expect(
    page.getByText("This record is unavailable on this device."),
  ).toBeVisible();
  await expect(page).toHaveURL(/#\/mirror\/source\/missing-record$/u);
  expect(await readStore(page, "records")).toEqual(before);

  await page.goto("/#mirror-source-e2e-record-a");
  await expect(page).toHaveURL(/#\/mirror\/source\/e2e-record-a$/u);
  await expect(page.locator("#mirror-source-e2e-record-a")).toHaveAttribute(
    "open",
    "",
  );
  await expectNoHorizontalOverflow(page);
});
