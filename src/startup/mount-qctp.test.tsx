import { act, fireEvent, screen } from "@testing-library/react";
import type { Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { mountQctpApplication } from "./mount-qctp";

let container: HTMLDivElement | undefined;
let mountedRoot: Root | undefined;

afterEach(() => {
  if (mountedRoot !== undefined) {
    act(() => mountedRoot?.unmount());
  }
  container?.remove();
  container = undefined;
  mountedRoot = undefined;
});

function createStartupContainer(): HTMLDivElement {
  const element = document.createElement("div");
  element.innerHTML = "<p>Opening your practice…</p>";
  document.body.append(element);
  return element;
}

describe("mountQctpApplication", () => {
  it("renders the application and a visible warning when PWA startup throws", () => {
    container = createStartupContainer();
    const startupFailure = new Error("service worker registration failed");
    const reportError = vi.fn();
    const reload = vi.fn();

    act(() => {
      mountedRoot = mountQctpApplication({
        container: container as HTMLDivElement,
        application: <p>QCTP application rendered</p>,
        startPwaLifecycle: () => {
          throw startupFailure;
        },
        reportStartupError: reportError,
        onReload: reload,
      });
    });

    expect(screen.getByText("QCTP application rendered")).toBeInTheDocument();
    expect(
      screen.getByText("Offline package check needs attention."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Opening your practice…"),
    ).not.toBeInTheDocument();
    expect(reportError).toHaveBeenCalledWith(startupFailure);

    fireEvent.click(
      screen.getByRole("button", { name: "Reload package check" }),
    );
    expect(reload).toHaveBeenCalledOnce();
  });

  it("renders normally without a recovery warning when PWA startup succeeds", () => {
    container = createStartupContainer();
    const startPwaLifecycle = vi.fn();

    act(() => {
      mountedRoot = mountQctpApplication({
        container: container as HTMLDivElement,
        application: <p>Ready application</p>,
        startPwaLifecycle,
      });
    });

    expect(startPwaLifecycle).toHaveBeenCalledOnce();
    expect(screen.getByText("Ready application")).toBeInTheDocument();
    expect(
      screen.queryByText("Offline package check needs attention."),
    ).not.toBeInTheDocument();
  });
});
