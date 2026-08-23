import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { ContentClassBadge } from "./ContentClassBadge";

afterEach(cleanup);

describe("ContentClassBadge", () => {
  it("shows a human label and the exact canonical class with accessible meaning", () => {
    const { container } = render(
      <ContentClassBadge
        authorityKey="foundation.day1.practice"
        scope="Day 1 practice"
      />,
    );
    const badge = container.querySelector<HTMLElement>(
      '[data-content-authority="foundation.day1.practice"]',
    );
    expect(badge).not.toBeNull();
    expect(badge).toHaveTextContent(
      "Day 1 practice: QCTP synthesis (QCTP_SYNTHESIS)",
    );
    expect(badge).toHaveAttribute("data-content-class", "QCTP_SYNTHESIS");
    expect(badge).toHaveAccessibleName(/controlled integration/i);
  });

  it("fails visibly closed without turning static holds into live regions", () => {
    const { container } = render(
      <ContentClassBadge authorityKey="missing.content" scope="Practice" />,
    );
    const badge = container.querySelector<HTMLElement>(
      '[data-content-class="HELD"]',
    );
    expect(badge).not.toBeNull();
    expect(badge).toHaveTextContent("Practice: AUTHORITY HOLD");
    expect(badge).not.toHaveAttribute("role");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
