import {
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getStateDefinition,
  type CapabilityLevel,
  type StateCapabilityRecord,
  type StateId,
} from "../../state-atlas";
import { QctpContext, type QctpRuntime } from "../qctp-context";
import {
  StateAtlasTrainingPanel,
  type StateAtlasTrainingPanelProps,
} from "./StateAtlasTrainingPanel";

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

function runtimeFor(
  stateCapabilities: readonly StateCapabilityRecord[],
  stateCapabilityHolds: readonly StateCapabilityRecord[] = [],
): QctpRuntime {
  return {
    stateCapabilities: [...stateCapabilities],
    stateCapabilityHolds: [...stateCapabilityHolds],
    stateSessions: [],
    saveStateSession: vi.fn(() => Promise.resolve()),
    saveStateCapability: vi.fn(() => Promise.resolve()),
  } as unknown as QctpRuntime;
}

function panelWith(
  stateCapabilities: readonly StateCapabilityRecord[],
  props: StateAtlasTrainingPanelProps = {},
  stateCapabilityHolds: readonly StateCapabilityRecord[] = [],
) {
  return (
    <QctpContext.Provider
      value={runtimeFor(stateCapabilities, stateCapabilityHolds)}
    >
      <StateAtlasTrainingPanel {...props} />
    </QctpContext.Provider>
  );
}

function activeDetail(): HTMLElement {
  const detail = document.querySelector<HTMLElement>(".state-training-detail");
  if (!detail) throw new Error("State Atlas detail did not render.");
  return detail;
}

function expectHeld(
  stateId: StateId,
  expectedRequirements: readonly string[],
): void {
  const detail = activeDetail();
  const definition = getStateDefinition(stateId);
  expect(
    within(detail).getByRole("heading", {
      name: `${stateId} — ${definition.title}`,
    }),
  ).toBeVisible();
  expect(within(detail).getByText(definition.sourceLabel)).toBeVisible();

  const hold = within(detail).getByRole("region", {
    name: "Controlled practice unavailable",
  });
  expect(hold).toBeVisible();
  expect(hold).not.toHaveAttribute("aria-live");
  expect(hold.querySelector('[role="status"]')).toBeNull();
  for (const requirement of expectedRequirements) {
    expect(within(hold).getByText(requirement)).toBeVisible();
  }

  expect(detail.querySelector(".state-recipe")).toBeNull();
  expect(detail.querySelector(".training-process-rail")).toBeNull();
  expect(within(detail).queryByLabelText("Permitted context")).toBeNull();
  expect(
    within(detail).queryByRole("button", {
      name: "Start controlled attempt",
    }),
  ).toBeNull();
  expect(
    within(detail).queryByRole("button", {
      name: "Save evidence and evaluate gate",
    }),
  ).toBeNull();
  expect(within(detail).queryByText(/Controlled recipe · about/u)).toBeNull();
}

function expectRunnable(stateId: StateId): void {
  const detail = activeDetail();
  const definition = getStateDefinition(stateId);
  expect(
    within(detail).getByRole("heading", {
      name: `${stateId} — ${definition.title}`,
    }),
  ).toBeVisible();
  expect(
    within(detail).queryByRole("region", {
      name: "Controlled practice unavailable",
    }),
  ).toBeNull();
  expect(detail.querySelector(".state-recipe")).not.toBeNull();
  expect(detail.querySelector(".training-process-rail")).not.toBeNull();
  expect(within(detail).getByLabelText("Permitted context")).toBeVisible();
  expect(
    within(detail).getByRole("button", {
      name: "Start controlled attempt",
    }),
  ).toBeEnabled();
}

function expectSourceRoute(
  trackId: string,
  accessId: StateId,
  readDecision: "ALLOWED" | "PREREQUISITES_UNMET",
  startDecision: "ALLOWED" | "ACTION_NOT_PERMITTED" | "PREREQUISITES_UNMET",
): void {
  const detail = activeDetail();
  expect(detail).toHaveAttribute("data-source-track-id", trackId);
  expect(detail).toHaveAttribute("data-source-access-id", accessId);
  expect(detail).toHaveAttribute("data-source-read-decision", readDecision);
  expect(detail).toHaveAttribute("data-source-start-decision", startDecision);
}

function expectReadableProtocolWithoutExecution(stateId: StateId): void {
  const detail = activeDetail();
  const definition = getStateDefinition(stateId);
  expect(
    within(detail).getByRole("heading", {
      name: `${stateId} — ${definition.title}`,
    }),
  ).toBeVisible();
  expect(detail.querySelector(".state-recipe")).not.toBeNull();
  expect(detail.querySelector(".training-process-rail")).not.toBeNull();
  expect(
    within(detail).getByRole("region", {
      name: "Controlled protocol start unavailable",
    }),
  ).toBeVisible();
  expect(within(detail).queryByLabelText("Permitted context")).toBeNull();
  expect(
    within(detail).queryByRole("button", {
      name: "Start controlled attempt",
    }),
  ).toBeNull();
  expect(
    within(detail).queryByRole("button", {
      name: "Save evidence and evaluate gate",
    }),
  ).toBeNull();
  expect(detail.querySelector("input, select, textarea")).toBeNull();
  expect(detail.querySelector('[role="status"]')).toBeNull();
  expect(detail.querySelector("[aria-live]")).toBeNull();
}

interface PrerequisiteCase {
  stateId: StateId;
  sourceTrackId: string | null;
  emptyRequirements: readonly string[];
  partialCapabilities: readonly StateCapabilityRecord[];
  partialRequirements: readonly string[];
  exactCapabilities: readonly StateCapabilityRecord[];
}

const prerequisiteCases: readonly PrerequisiteCase[] = [
  {
    stateId: "TC-PC",
    sourceTrackId: "thomas-campbell",
    emptyRequirements: ["Requires Q3 Stabilized.", "Requires Q4 Accessed."],
    partialCapabilities: [capability("Q3", "Stabilized")],
    partialRequirements: ["Requires Q4 Accessed."],
    exactCapabilities: [
      capability("Q3", "Stabilized"),
      capability("Q4", "Accessed"),
    ],
  },
  {
    stateId: "M-F10",
    sourceTrackId: "monroe-buhlman",
    emptyRequirements: ["Requires Q1 Stabilized.", "Requires Q3 Stabilized."],
    partialCapabilities: [capability("Q1", "Stabilized")],
    partialRequirements: ["Requires Q3 Stabilized."],
    exactCapabilities: [
      capability("Q1", "Stabilized"),
      capability("Q3", "Stabilized"),
    ],
  },
  {
    stateId: "M-F12",
    sourceTrackId: "monroe-buhlman",
    emptyRequirements: ["Requires M-F10 Stabilized."],
    partialCapabilities: [capability("M-F10", "Accessed")],
    partialRequirements: ["Requires M-F10 Stabilized."],
    exactCapabilities: [capability("M-F10", "Stabilized")],
  },
  {
    stateId: "QR",
    sourceTrackId: "remote-viewing",
    emptyRequirements: [
      "Requires Q3 Stabilized.",
      "Requires Q4 Accessed or TC-PC Accessed.",
    ],
    partialCapabilities: [capability("Q3", "Stabilized")],
    partialRequirements: ["Requires Q4 Accessed or TC-PC Accessed."],
    exactCapabilities: [
      capability("Q3", "Stabilized"),
      capability("Q4", "Accessed"),
    ],
  },
  {
    stateId: "QO",
    sourceTrackId: "monroe-buhlman",
    emptyRequirements: ["Requires M-F10 Stabilized."],
    partialCapabilities: [capability("M-F10", "Accessed")],
    partialRequirements: ["Requires M-F10 Stabilized."],
    exactCapabilities: [capability("M-F10", "Stabilized")],
  },
  {
    stateId: "QI",
    sourceTrackId: "thomas-campbell",
    emptyRequirements: ["Requires Q3 Stabilized.", "Requires Q4 Accessed."],
    partialCapabilities: [capability("Q3", "Stabilized")],
    partialRequirements: ["Requires Q4 Accessed."],
    exactCapabilities: [
      capability("Q3", "Stabilized"),
      capability("Q4", "Accessed"),
    ],
  },
  {
    stateId: "Q2",
    sourceTrackId: null,
    emptyRequirements: ["Requires Q1 Accessed."],
    partialCapabilities: [capability("Q1", "Introduced")],
    partialRequirements: ["Requires Q1 Accessed."],
    exactCapabilities: [capability("Q1", "Accessed")],
  },
] as const;

afterEach(() => cleanup());

describe("StateAtlasTrainingPanel prerequisite guard", () => {
  it("preserves the runnable Q1 behavior without capability prerequisites", () => {
    render(panelWith([]));
    expectRunnable("Q1");
  });

  it.each(prerequisiteCases)(
    "keeps $stateId closed for empty and partial capabilities, then opens on the exact gate",
    async ({
      stateId,
      sourceTrackId,
      emptyRequirements,
      partialCapabilities,
      partialRequirements,
      exactCapabilities,
    }) => {
      const user = userEvent.setup();
      const view = render(panelWith([]));
      await user.click(screen.getByRole("button", { name: `View ${stateId}` }));
      expectHeld(stateId, emptyRequirements);
      if (sourceTrackId) {
        expectSourceRoute(
          sourceTrackId,
          stateId,
          "PREREQUISITES_UNMET",
          stateId === "QR" ? "ACTION_NOT_PERMITTED" : "PREREQUISITES_UNMET",
        );
      }

      view.rerender(panelWith(partialCapabilities));
      expectHeld(stateId, partialRequirements);
      if (sourceTrackId) {
        expectSourceRoute(
          sourceTrackId,
          stateId,
          "PREREQUISITES_UNMET",
          stateId === "QR" ? "ACTION_NOT_PERMITTED" : "PREREQUISITES_UNMET",
        );
      }

      view.rerender(panelWith(exactCapabilities));
      if (stateId === "QR") {
        expectReadableProtocolWithoutExecution(stateId);
        expectSourceRoute(
          "remote-viewing",
          "QR",
          "ALLOWED",
          "ACTION_NOT_PERMITTED",
        );
      } else {
        expectRunnable(stateId);
        if (sourceTrackId) {
          expectSourceRoute(sourceTrackId, stateId, "ALLOWED", "ALLOWED");
        }
      }
    },
  );

  it("selects an exact requested source recipe once and preserves the Q1 default", async () => {
    const user = userEvent.setup();
    const onSelectionConsumed = vi.fn();
    const exactCapabilities = [
      capability("Q3", "Stabilized"),
      capability("Q4", "Accessed"),
    ];
    const view = render(panelWith(exactCapabilities));
    expectRunnable("Q1");

    view.rerender(
      panelWith(exactCapabilities, {
        requestedStateId: "QI",
        onSelectionConsumed,
      }),
    );
    await waitFor(() => expectRunnable("QI"));
    expectSourceRoute("thomas-campbell", "QI", "ALLOWED", "ALLOWED");
    expect(onSelectionConsumed).toHaveBeenCalledWith("QI");
    expect(onSelectionConsumed).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "View Q1" }));
    expectRunnable("Q1");
  });

  it("ignores an external source-recipe request during an active attempt", async () => {
    const user = userEvent.setup();
    const onSelectionConsumed = vi.fn();
    const exactCapabilities = [
      capability("Q3", "Stabilized"),
      capability("Q4", "Accessed"),
    ];
    const view = render(panelWith(exactCapabilities));
    await user.click(
      screen.getByRole("button", { name: "Start controlled attempt" }),
    );

    view.rerender(
      panelWith(exactCapabilities, {
        requestedStateId: "QI",
        onSelectionConsumed,
      }),
    );
    expect(
      within(activeDetail()).getByRole("heading", {
        name: "Q1 — Regulated Body and Breath",
      }),
    ).toBeVisible();
    expect(onSelectionConsumed).not.toHaveBeenCalled();
  });

  it("shows a preserved capability hold without treating it as progression", async () => {
    const held = {
      ...capability("M-F10", "Stabilized"),
      sourceTrackHold: {
        status: "HELD" as const,
        code: "SOURCE_TRACK_EVIDENCE_HELD" as const,
        stateId: "M-F10" as const,
        trackId: "monroe-buhlman",
        accessId: "M-F10",
        message: "The source session binding did not pass.",
      },
    };
    render(panelWith([], { requestedStateId: "M-F10" }, [held]));

    await waitFor(() =>
      expect(
        screen.getByRole("heading", {
          name: "Source-track capability credit withheld",
        }),
      ).toBeVisible(),
    );
    expect(screen.getByText("capability-M-F10")).toBeVisible();
    expect(screen.getByText(/capability claim preserved/u)).toBeVisible();
    const heldStateCard = document.querySelector('[data-state-id="M-F10"]');
    expect(heldStateCard).toBeInstanceOf(HTMLElement);
    expect(
      within(heldStateCard as HTMLElement).getByLabelText(
        "Controlled capability levels. Current: Not introduced.",
      ),
    ).toBeVisible();
  });

  it("keeps QR write methods unreachable after the read gate passes", async () => {
    const user = userEvent.setup();
    const saveStateSession = vi.fn(() => Promise.resolve());
    const saveStateCapability = vi.fn(() => Promise.resolve());
    const runtime = {
      ...runtimeFor([
        capability("Q3", "Stabilized"),
        capability("Q4", "Accessed"),
      ]),
      saveStateSession,
      saveStateCapability,
    };
    render(
      <QctpContext.Provider value={runtime}>
        <StateAtlasTrainingPanel />
      </QctpContext.Provider>,
    );
    await user.click(screen.getByRole("button", { name: "View QR" }));

    expectReadableProtocolWithoutExecution("QR");
    expect(saveStateSession).not.toHaveBeenCalled();
    expect(saveStateCapability).not.toHaveBeenCalled();
  });
});
