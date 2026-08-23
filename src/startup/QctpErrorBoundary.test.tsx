import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { QctpErrorBoundary } from "./QctpErrorBoundary";

const PRESERVED_KEY = "qctp-startup-recovery-test";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.removeItem(PRESERVED_KEY);
});

describe("QctpErrorBoundary", () => {
  it("shows safe retry and reload actions without clearing local data", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const reload = vi.fn();
    localStorage.setItem(PRESERVED_KEY, "preserved");

    function BrokenScreen(): never {
      throw new Error("intentional render failure");
    }

    render(
      <QctpErrorBoundary onReload={reload}>
        <BrokenScreen />
      </QctpErrorBoundary>,
    );

    expect(
      screen.getByRole("heading", { name: "The app paused safely." }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Reload QCTP" }));

    expect(reload).toHaveBeenCalledOnce();
    expect(localStorage.getItem(PRESERVED_KEY)).toBe("preserved");
  });

  it("remounts its children when the user retries", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    localStorage.setItem(PRESERVED_KEY, "preserved");
    let shouldFail = true;

    function UnstableScreen(): ReactNode {
      if (shouldFail) throw new Error("first render fails");
      return <p>Recovered screen</p>;
    }

    render(
      <QctpErrorBoundary>
        <UnstableScreen />
      </QctpErrorBoundary>,
    );
    shouldFail = false;
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(screen.getByText("Recovered screen")).toBeInTheDocument();
    expect(localStorage.getItem(PRESERVED_KEY)).toBe("preserved");
  });
});
