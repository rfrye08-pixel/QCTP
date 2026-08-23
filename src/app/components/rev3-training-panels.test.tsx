import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createQctpRepository, deleteQctpDatabase } from "../../data";
import { QctpProvider } from "../QctpProvider";
import { BreathFoundationsPanel } from "./BreathFoundationsPanel";
import { StateAtlasTrainingPanel } from "./StateAtlasTrainingPanel";

function renderPanel(panel: ReactNode) {
  return render(<QctpProvider>{panel}</QctpProvider>);
}

beforeEach(async () => {
  localStorage.clear();
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.reject(new Error("PX13 intentionally offline"))),
  );
  await deleteQctpDatabase();
});

afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  await deleteQctpDatabase();
});

describe("Rev3 controlled training panels", () => {
  it("durably preserves an early-safe-stop Breath session without completion credit", async () => {
    const user = userEvent.setup();
    renderPanel(<BreathFoundationsPanel />);
    await screen.findByRole("heading", { name: "Breath Foundations" });
    await user.click(
      screen.getByRole("button", { name: "Start controlled session" }),
    );
    await screen.findByText(/session saved as in progress/i);
    await user.click(
      screen.getByRole("button", { name: "Stop safely and preserve" }),
    );
    await screen.findByText(/stopped session preserved/i);
    const repository = await createQctpRepository();
    try {
      const sessions = await repository.listBreathSessions();
      expect(sessions).toHaveLength(1);
      expect(sessions[0]).toMatchObject({
        foundationSessionId: "BREATH-01",
        status: "stopped",
        stateCapabilityCreditGranted: false,
      });
    } finally {
      repository.close();
    }
  });

  it("advances only an evidence-backed State introduction and stores raw first", async () => {
    const user = userEvent.setup();
    renderPanel(<StateAtlasTrainingPanel />);
    await screen.findByRole("heading", {
      name: "Capability, guidance, and source control",
    });
    await user.click(
      screen.getByRole("button", { name: "Start controlled attempt" }),
    );
    await user.click(screen.getByLabelText("Mechanics understood"));
    await user.click(screen.getByLabelText("Mechanics performed correctly"));
    await user.click(screen.getByLabelText("Safe and oriented now"));
    await user.click(screen.getByLabelText("Full return completed"));
    fireEvent.change(screen.getByLabelText("Raw observation"), {
      target: {
        value:
          "Breathing quieted and jaw effort reduced; orientation stayed clear.",
      },
    });
    await user.click(
      screen.getByRole("button", {
        name: "Save evidence and evaluate gate",
      }),
    );
    await screen.findByText(/rate the observed session before saving/i);
    for (const [label, score] of [
      ["Alertness", "3"],
      ["Effort", "1"],
      ["Fear or anxiety", "0"],
      ["Physical comfort", "3"],
      ["Memory continuity", "3"],
      ["Guidance dependence", "4"],
      ["Air hunger", "0"],
    ] as const) {
      await user.selectOptions(screen.getByLabelText(label), score);
    }
    await user.click(
      screen.getByRole("button", {
        name: "Save evidence and evaluate gate",
      }),
    );
    await screen.findByText(/controlled capability advanced to Introduced/i);
    const repository = await createQctpRepository();
    try {
      const [sessions, capabilities] = await Promise.all([
        repository.listStateSessions(),
        repository.listStateCapabilities(),
      ]);
      expect(sessions).toHaveLength(1);
      expect(sessions[0]).toMatchObject({
        stateId: "Q1",
        completedTimer: false,
        capabilityBefore: null,
        capabilityAfter: "Introduced",
        alertness: 3,
        effort: 1,
        fearAnxiety: 0,
        physicalComfort: 3,
        memoryContinuity: 3,
        guidanceDependence: 4,
        airHunger: 0,
      });
      expect(sessions[0]?.rawObservation?.text).toContain("Breathing quieted");
      expect(capabilities).toEqual([
        expect.objectContaining({ stateId: "Q1", level: "Introduced" }),
      ]);
    } finally {
      repository.close();
    }
  });
});
