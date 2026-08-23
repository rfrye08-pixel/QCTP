import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createQctpRepository, deleteQctpDatabase } from "../../data";
import { QctpProvider } from "../QctpProvider";
import { LabScreen } from "./LabScreen";

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

describe("Lab controlled source-track boundary", () => {
  it("keeps remote viewing held and saves psionics only as user evidence", async () => {
    const user = userEvent.setup();
    render(
      <QctpProvider>
        <LabScreen />
      </QctpProvider>,
    );

    await screen.findByRole("heading", { name: "Lab" });
    const remoteViewingHold = screen
      .getByText("Remote-viewing protocol hold")
      .closest("div");
    expect(remoteViewingHold).toHaveAttribute(
      "data-source-track-status",
      "EXPERIMENTAL_PROTOCOL",
    );
    expect(remoteViewingHold).toHaveTextContent(/generic Lab cannot start it/u);

    await user.selectOptions(
      screen.getByLabelText("Controlled source scope"),
      "psionics-record",
    );
    expect(screen.getByText("Record only").closest("div")).toHaveAttribute(
      "data-source-track-status",
      "RECORD_ONLY",
    );
    expect(
      screen.queryByRole("button", { name: /^Protocol$/u }),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Procedure")).not.toBeInTheDocument();

    await user.type(
      screen.getByLabelText("Title"),
      "Uninterpreted personal observation",
    );
    await user.type(
      screen.getByLabelText("Controls"),
      "Recorded the timestamp and ordinary environmental conditions.",
    );
    await user.type(
      screen.getByLabelText("Raw outcome"),
      "I noticed a brief image before opening the envelope.",
    );
    await user.click(screen.getByRole("button", { name: "Save locally" }));
    await screen.findByText(/Result version 1 saved locally/u);

    const repository = await createQctpRepository();
    try {
      const records = await repository.listRecords({ kinds: ["lab_result"] });
      expect(records).toHaveLength(1);
      expect(records[0]).toMatchObject({
        contentRef: {
          authorityKey: "workflow.lab",
          contentClass: "QCTP_ORIGINAL",
        },
        fields: {
          sourceScope: "USER_EVIDENCE_ONLY",
          sourcePracticeProvided: false,
          sourceTrackRef: {
            trackId: "psionics",
            accessId: "record",
            accessStatus: "RECORD_ONLY",
          },
        },
      });
      expect(records[0]!.tags).toEqual(
        expect.arrayContaining(["psionics", "record-only", "user-evidence"]),
      );
    } finally {
      repository.close();
    }
  }, 10_000);
});
