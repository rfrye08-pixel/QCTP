import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("../voice-capture", () => ({
  acceptVoiceCapture: () => Promise.resolve(),
  RepositoryCapturePersistence: class {},
  VoiceRecorderPanel: () => (
    <div data-testid="field-recorder">Active recorder</div>
  ),
}));

vi.mock("../app/qctp-context", () => ({
  useQctp: () => ({
    repository: {},
    localTranscriptionStatus: "not-configured",
    refresh: () => Promise.resolve(),
    processTranscriptionQueue: () =>
      Promise.resolve({ completed: [], failed: [] }),
  }),
}));

import { FieldDictation } from "../app/components/FieldDictation";

describe("FieldDictation", () => {
  it("does not use its dictate button to unmount an open recorder", () => {
    render(
      <FieldDictation
        fieldTargetId="workbook-day-1-prompt-1"
        destination="workbook"
        onAppend={() => undefined}
      />,
    );
    const dictate = screen.getByRole("button", { name: /dictate/i });

    fireEvent.click(dictate);
    expect(screen.getByTestId("field-recorder")).toBeInTheDocument();
    fireEvent.click(dictate);
    expect(screen.getByTestId("field-recorder")).toBeInTheDocument();
    expect(dictate).toHaveAttribute("aria-expanded", "true");
  });
});
