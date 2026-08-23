import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as sourceTracks from "../../source-tracks";
import type { CodexRecord } from "../../domain";
import type {
  CapabilityLevel,
  StateCapabilityRecord,
  StateId,
} from "../../state-atlas";
import { QctpContext, type QctpRuntime } from "../qctp-context";
import { CampbellTrackPanel } from "./CampbellTrackPanel";

const achievedAt = "2026-08-23T12:00:00.000Z";

function capability(
  stateId: StateId,
  level: CapabilityLevel,
): StateCapabilityRecord {
  const evidenceAttemptId = `evidence-${stateId}-${level}`;
  return {
    schemaVersion: 1,
    id: `capability-${stateId}`,
    stateId,
    level,
    achievedAt,
    evidenceAttemptIds: [evidenceAttemptId],
    transitions: [
      {
        from: null,
        to: level,
        achievedAt,
        evidenceAttemptIds: [evidenceAttemptId],
      },
    ],
    updatedAt: achievedAt,
  };
}

function runtimeFor(stateCapabilities: StateCapabilityRecord[] = []) {
  const saveRecord = vi.fn((record: CodexRecord) => {
    void record;
    return Promise.resolve();
  });
  const refresh = vi.fn(() => Promise.resolve());
  const runtime = {
    repository: { saveRecord },
    stateCapabilities,
    refresh,
  } as unknown as QctpRuntime;
  return { runtime, saveRecord, refresh };
}

function renderPanel(input?: {
  runtime?: QctpRuntime;
  onOpenStateRecipe?: (stateId: "TC-PC" | "QI") => void;
  onOpenPractice?: () => void;
}) {
  const owned = input?.runtime ? null : runtimeFor();
  const runtime = input?.runtime ?? owned!.runtime;
  const panelProps = {
    ...(input?.onOpenStateRecipe
      ? { onOpenStateRecipe: input.onOpenStateRecipe }
      : {}),
    ...(input?.onOpenPractice ? { onOpenPractice: input.onOpenPractice } : {}),
  };
  return {
    ...render(
      <QctpContext.Provider value={runtime}>
        <CampbellTrackPanel {...panelProps} />
      </QctpContext.Provider>,
    ),
    runtime,
    saveRecord: owned?.saveRecord,
    refresh: owned?.refresh,
  };
}

function moduleCard(moduleId: string): HTMLElement {
  const card = document.querySelector<HTMLElement>(
    `[data-module-id="${moduleId}"]`,
  );
  if (!card) throw new Error(`${moduleId} card did not render.`);
  return card;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("CampbellTrackPanel controlled route guard", () => {
  it("exposes only released workflows and shows exact prerequisite or authority holds", () => {
    renderPanel();

    for (const moduleId of ["TC-01", "TC-04", "TC-05"]) {
      expect(
        within(moduleCard(moduleId)).getByRole("button", {
          name: "Open controlled evidence record",
        }),
      ).toHaveClass("text-button");
      expect(
        within(moduleCard(moduleId)).getByText("Controlled scope available"),
      ).toBeVisible();
    }

    for (const moduleId of ["TC-02", "TC-06"]) {
      const card = moduleCard(moduleId);
      expect(
        within(card).getByRole("region", {
          name: `${moduleId} controlled hold`,
        }),
      ).toBeVisible();
      expect(within(card).getByText("Requires Q3 Stabilized.")).toBeVisible();
      expect(within(card).getByText("Requires Q4 Accessed.")).toBeVisible();
      expect(within(card).queryByRole("button")).toBeNull();
    }

    for (const moduleId of ["TC-03", "TC-07", "TC-08", "TC-09", "TC-10"]) {
      const card = moduleCard(moduleId);
      expect(
        within(card).getByRole("region", {
          name: `${moduleId} controlled hold`,
        }),
      ).toBeVisible();
      expect(within(card).queryByRole("button")).toBeNull();
    }

    expect(screen.queryByText("First-pass data", { exact: true })).toBeNull();
    expect(
      screen.queryByRole("button", { name: /Save controlled record locally/i }),
    ).toBeNull();
  });

  it("routes TC-02 only to TC-PC and TC-06 only to QI after both prerequisites", async () => {
    const user = userEvent.setup();
    const stateCapabilities = [
      capability("Q3", "Stabilized"),
      capability("Q4", "Accessed"),
    ];
    const { runtime } = runtimeFor(stateCapabilities);
    const onOpenStateRecipe = vi.fn();
    const legacyDay1Route = vi.fn();
    renderPanel({
      runtime,
      onOpenStateRecipe,
      onOpenPractice: legacyDay1Route,
    });

    await user.click(
      within(moduleCard("TC-02")).getByRole("button", {
        name: "Open TC-PC state recipe",
      }),
    );
    await user.click(
      within(moduleCard("TC-06")).getByRole("button", {
        name: "Open QI state recipe",
      }),
    );

    expect(onOpenStateRecipe).toHaveBeenNthCalledWith(1, "TC-PC");
    expect(onOpenStateRecipe).toHaveBeenNthCalledWith(2, "QI");
    expect(legacyDay1Route).not.toHaveBeenCalled();
  });

  it("fails closed instead of falling back to Day 1 when the exact State Atlas handoff is absent", async () => {
    const user = userEvent.setup();
    const { runtime } = runtimeFor([
      capability("Q3", "Stabilized"),
      capability("Q4", "Accessed"),
    ]);
    const legacyDay1Route = vi.fn();
    renderPanel({ runtime, onOpenPractice: legacyDay1Route });

    await user.click(
      within(moduleCard("TC-02")).getByRole("button", {
        name: "Open TC-PC state recipe",
      }),
    );

    expect(legacyDay1Route).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        /TC-PC passed its authority gate.*no exact State Atlas handoff.*No other practice was opened/i,
      ),
    ).toBeVisible();
  });

  it("saves released raw-first evidence with its canonical source-track reference", async () => {
    const user = userEvent.setup();
    const owned = runtimeFor();
    renderPanel({ runtime: owned.runtime });

    await user.click(
      within(moduleCard("TC-01")).getByRole("button", {
        name: "Open controlled evidence record",
      }),
    );
    await user.type(
      screen.getByLabelText(/Claim in neutral language/i),
      "A neutral test claim",
    );
    await user.click(
      screen.getByRole("button", {
        name: "Save controlled record locally",
      }),
    );

    await waitFor(() => expect(owned.saveRecord).toHaveBeenCalledTimes(1));
    const record = owned.saveRecord.mock.calls[0]![0];
    expect(record.contentRef).toEqual({
      authorityKey: "campbell.exercise.TC-01-POSSIBILITY-LEDGER",
      contentClass: "QCTP_ORIGINAL",
    });
    expect(record.fields).toMatchObject({
      controlledContentAuthorityKey:
        "campbell.exercise.TC-01-POSSIBILITY-LEDGER",
      sourceTrackRef: {
        trackId: "thomas-campbell",
        accessId: "TC-01",
        contentRefs: [
          {
            authorityKey: "campbell.module.TC-01",
            contentClass: "SOURCE_FAITHFUL",
          },
          {
            authorityKey: "campbell.exercise.TC-01-POSSIBILITY-LEDGER",
            contentClass: "QCTP_ORIGINAL",
          },
        ],
      },
    });
    expect(record.fields).not.toHaveProperty("contentClass");
    expect(owned.refresh).toHaveBeenCalledTimes(1);
  });

  it("rechecks SAVE immediately and performs no write when prerequisite evidence disappears", async () => {
    const user = userEvent.setup();
    const stateCapabilities = [
      capability("Q3", "Stabilized"),
      capability("Q4", "Accessed"),
    ];
    const owned = runtimeFor(stateCapabilities);
    renderPanel({ runtime: owned.runtime });

    await user.click(
      within(moduleCard("TC-02")).getByRole("button", {
        name: "Open controlled evidence record",
      }),
    );
    await user.type(
      screen.getByLabelText(/Raw sensory change/i),
      "Physical salience reduced briefly.",
    );
    stateCapabilities.splice(0, stateCapabilities.length);
    await user.click(
      screen.getByRole("button", {
        name: "Save controlled record locally",
      }),
    );

    expect(owned.saveRecord).not.toHaveBeenCalled();
    expect(
      screen.getByText(/Evidence-backed prerequisites are not yet present/i),
    ).toBeVisible();
  });

  it("rejects a mismatched source-track reference atomically", async () => {
    const user = userEvent.setup();
    const owned = runtimeFor();
    const validReference = sourceTracks.sourceTrackReferenceFor(
      "thomas-campbell",
      "TC-01",
    );
    vi.spyOn(sourceTracks, "sourceTrackReferenceFor").mockReturnValue({
      ...validReference,
      accessId: "TC-04",
    });
    renderPanel({ runtime: owned.runtime });

    await user.click(
      within(moduleCard("TC-01")).getByRole("button", {
        name: "Open controlled evidence record",
      }),
    );
    await user.type(
      screen.getByLabelText(/Claim in neutral language/i),
      "A claim that must not be saved under mismatched authority.",
    );
    await user.click(
      screen.getByRole("button", {
        name: "Save controlled record locally",
      }),
    );

    expect(owned.saveRecord).not.toHaveBeenCalled();
    expect(
      screen.getByText(/SOURCE_TRACK_REFERENCE_HOLD.*No data changed/i),
    ).toBeVisible();
  });
});
