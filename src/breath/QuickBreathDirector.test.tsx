import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  QuickBreathDirector,
  type QuickBreathDirectorPreferences,
} from "./QuickBreathDirector";

function preferences(
  overrides: Partial<QuickBreathDirectorPreferences["director"]> = {},
): QuickBreathDirectorPreferences {
  return {
    director: {
      goal: "calm_coherence",
      context: "general",
      activation: 2,
      sleepiness: 1,
      airHungerAtRest: 0,
      availableMinutes: 5,
      posture: "seated",
      hazard: "none",
      comfortableMethodIds: [],
      ...overrides,
    },
    cues: { visualPacer: true, localTones: false, haptics: false },
  };
}

function Harness({
  initial = preferences(),
}: {
  initial?: QuickBreathDirectorPreferences;
}) {
  const [value, setValue] = useState(initial);
  return (
    <QuickBreathDirector preferences={value} onPreferencesChange={setValue} />
  );
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("QuickBreathDirector", () => {
  it("shows the deterministic method contract and explicit progression boundary", () => {
    render(<Harness />);

    expect(
      screen.getByRole("heading", { name: "Foundation Resonance Breath" }),
    ).toBeVisible();
    expect(screen.getAllByText(/4s inhale · 6s exhale/i)).toHaveLength(2);
    expect(
      screen.getByText(/Inhale: nose; exhale: nose; mouth if restrictive/i),
    ).toBeVisible();
    expect(screen.getByText(/60–75% of a maximal breath/i)).toBeVisible();
    expect(screen.getByText(/stop counting/i)).toBeVisible();
    expect(
      screen.getByText(/never advance State Atlas capability/i),
    ).toBeVisible();

    fireEvent.click(screen.getByText("Stop conditions"));
    expect(screen.getByText("Dizziness")).toBeVisible();
    expect(screen.getByText("Marked air hunger")).toBeVisible();
  });

  it("emits and applies typed goal, posture, time, safety, and cue preferences", () => {
    render(<Harness />);

    fireEvent.change(screen.getByLabelText("Goal"), {
      target: { value: "focus" },
    });
    expect(
      screen.getByRole("heading", { name: "Balanced Breath" }),
    ).toBeVisible();

    fireEvent.change(screen.getByLabelText("Posture"), {
      target: { value: "standing" },
    });
    fireEvent.change(screen.getByLabelText("Available time (minutes)"), {
      target: { value: "2" },
    });
    fireEvent.click(screen.getByLabelText("Quiet device-local phase tones"));
    expect(screen.getByLabelText("Posture")).toHaveValue("standing");
    expect(screen.getByLabelText("Available time (minutes)")).toHaveValue(2);
    expect(
      screen.getByLabelText("Quiet device-local phase tones"),
    ).toBeChecked();

    fireEvent.change(screen.getByLabelText("Safety setting"), {
      target: { value: "driving" },
    });
    expect(screen.getByText("Practice held")).toBeVisible();
    expect(screen.getByText(/blocked while driving/i)).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Start pacing" }),
    ).not.toBeInTheDocument();
  });

  it("visually paces timed phases without producing a completion award", () => {
    vi.useFakeTimers();
    render(<Harness />);

    fireEvent.click(screen.getByRole("button", { name: "Start pacing" }));
    expect(screen.getByText("Inhale gently")).toBeVisible();
    void act(() => vi.advanceTimersByTime(4_000));
    expect(screen.getByText("Exhale smoothly")).toBeVisible();
    void act(() => vi.advanceTimersByTime(6_000));
    expect(screen.getByText("Inhale gently")).toBeVisible();
    expect(screen.queryByText(/capability granted/i)).not.toBeInTheDocument();
    expect(screen.getByText(/timer completion never advance/i)).toBeVisible();
  });

  it("keeps Day 1 on the controlled five/five-or-comfortable rail", () => {
    render(
      <Harness
        initial={preferences({
          goal: "meditation_gap",
          context: "foundation_day_1",
        })}
      />,
    );

    expect(
      screen.getByRole("heading", {
        name: "Foundation Day 1 HeartMath Breath Rail",
      }),
    ).toBeVisible();
    expect(screen.getAllByText(/5s inhale · 5s exhale/i)).toHaveLength(2);
    expect(screen.getByText(/No nasal-only requirement/i)).toBeVisible();
    expect(screen.getByText(/Do not substitute QCTP-B1/i)).toBeVisible();
  });
});
