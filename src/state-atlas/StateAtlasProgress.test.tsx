import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StateAtlasProgress } from "./StateAtlasProgress";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("StateAtlasProgress", () => {
  it("shows controlled capability, guidance, and exact source labels", () => {
    render(
      <StateAtlasProgress
        capabilities={[
          { stateId: "Q1", level: "Accessed" },
          { stateId: "M-F10", level: "Stabilized" },
        ]}
        stateIds={["Q1", "M-F10", "QR"]}
      />,
    );

    expect(screen.getByText("Q1")).toBeVisible();
    expect(
      screen.getByLabelText("Controlled capability levels. Current: Accessed."),
    ).toBeVisible();
    expect(screen.getByText("Coach guidance")).toBeVisible();
    expect(screen.getByText("M-F10")).toBeVisible();
    expect(
      screen.getByLabelText(
        "Controlled capability levels. Current: Stabilized.",
      ),
    ).toBeVisible();
    expect(screen.getByText("Test guidance")).toBeVisible();
    expect(screen.getByText(/Monroe/i)).toBeVisible();
    expect(screen.getByText("Experimental protocol")).toBeVisible();
    expect(
      screen.getByText(/Elapsed practice time never advances capability/i),
    ).toBeVisible();
  });

  it("emits only explicit state selection", () => {
    const onStateSelect = vi.fn();
    render(
      <StateAtlasProgress
        capabilities={[]}
        stateIds={["Q0", "Q1"]}
        activeStateId="Q1"
        onStateSelect={onStateSelect}
      />,
    );

    expect(screen.getAllByText("Not introduced")).toHaveLength(2);
    expect(screen.getAllByText("Teach guidance")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "View Q1" }));
    expect(onStateSelect).toHaveBeenCalledWith("Q1");
    expect(onStateSelect).toHaveBeenCalledTimes(1);
  });

  it("does not advance or emit anything when time passes", () => {
    vi.useFakeTimers();
    const onStateSelect = vi.fn();
    const { container } = render(
      <StateAtlasProgress
        capabilities={[{ stateId: "Q2", level: "Introduced" }]}
        stateIds={["Q2"]}
        onStateSelect={onStateSelect}
      />,
    );
    const before = container.innerHTML;

    void act(() => vi.advanceTimersByTime(24 * 60 * 60 * 1_000));

    expect(container.innerHTML).toBe(before);
    expect(onStateSelect).not.toHaveBeenCalled();
    expect(
      screen.getByLabelText(
        "Controlled capability levels. Current: Introduced.",
      ),
    ).toBeVisible();
  });
});
