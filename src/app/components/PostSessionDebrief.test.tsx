import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PracticeSessionSchema } from "../../domain";
import type { CapturePersistence } from "../../voice-capture";
import { PostSessionDebrief } from "./PostSessionDebrief";

const now = "2026-08-22T10:25:00.000Z";
const persistence: CapturePersistence = {
  begin: () => Promise.resolve(0),
  appendChunk: () => Promise.resolve(),
  finalize: () => Promise.resolve(new Blob()),
  recoverInterrupted: () => Promise.resolve(null),
  discard: () => Promise.resolve(),
};

function pendingSession() {
  return PracticeSessionSchema.parse({
    schemaVersion: 1,
    id: "practice-debrief-ui",
    practiceId: "foundation-day1-source-rev0-voice-free",
    foundationDay: 1,
    scriptId: "QCTP-D1-SOURCE-LABELED-SCRIPT-CANDIDATE-REV0",
    scriptSha256:
      "2649ce70e5ab824dbc6b797e07082567fda2443962016e8e6c7dbe454f5ee555",
    startedAt: "2026-08-22T10:00:00.000Z",
    endedAt: now,
    elapsedMs: 1_500_000,
    completionMode: "VOICE_FREE_FALLBACK",
    supportMode: "ambient",
    sourceSequence: ["Bullard", "HeartMath", "Dispenza", "QCTP return"],
    heartMathBreath:
      "approximately five seconds in / five seconds out or comfortable; no hold",
    naturalCompletion: true,
    narrationUsed: false,
    narratedContentAcceptance: "NOT_APPLICABLE",
    stateAttainment: "NOT_ASSESSED",
    debrief: {
      status: "pending",
      recordId: null,
      updatedAt: now,
      remindAt: null,
      promptVersion: "RAW_OBSERVATION_REV0",
    },
    createdAt: now,
  });
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("PostSessionDebrief", () => {
  it("presents raw voice first with fixed practice context", () => {
    render(
      <PostSessionDebrief
        session={pendingSession()}
        persistence={persistence}
        localTranscriptionAvailable={false}
        onAccept={() => Promise.resolve()}
        onTypeAccept={() => Promise.resolve()}
        onTransition={() => Promise.resolve()}
      />,
    );
    expect(screen.getByText(/before explaining it/i)).toBeVisible();
    expect(screen.getByText(/no interpretation or state claim/i)).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "Record raw observation" }),
    );
    expect(
      screen.queryByDisplayValue("Day 1 raw observation"),
    ).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Tags")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Destination")).not.toBeInTheDocument();
  });

  it("persists an explicit one-hour reminder without awarding anything", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(now));
    const onTransition = vi.fn(() => Promise.resolve());
    render(
      <PostSessionDebrief
        session={pendingSession()}
        persistence={persistence}
        localTranscriptionAvailable
        onAccept={() => Promise.resolve()}
        onTypeAccept={() => Promise.resolve()}
        onTransition={onTransition}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Remind me in one hour" }),
    );
    await vi.waitFor(() => expect(onTransition).toHaveBeenCalledOnce());
    expect(onTransition).toHaveBeenCalledWith({
      to: "remind_later",
      occurredAt: now,
      remindAt: "2026-08-22T11:25:00.000Z",
    });
  });

  it("resurfaces a due reminder without requiring a reload", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(now));
    const session = PracticeSessionSchema.parse({
      ...pendingSession(),
      debrief: {
        status: "remind_later",
        recordId: null,
        updatedAt: now,
        remindAt: "2026-08-22T10:25:30.000Z",
        promptVersion: "RAW_OBSERVATION_REV0",
      },
    });
    render(
      <PostSessionDebrief
        session={session}
        persistence={persistence}
        localTranscriptionAvailable={false}
        onAccept={() => Promise.resolve()}
        onTypeAccept={() => Promise.resolve()}
        onTransition={() => Promise.resolve()}
      />,
    );

    expect(screen.getByText("Saved for later")).toBeVisible();
    await act(() => vi.advanceTimersByTimeAsync(30_001));
    expect(
      screen.getByRole("button", { name: "Record raw observation" }),
    ).toBeVisible();
  });

  it("offers a typed raw fallback without introducing interpretation", async () => {
    const onTypeAccept = vi.fn(() => Promise.resolve());
    render(
      <PostSessionDebrief
        session={pendingSession()}
        persistence={persistence}
        localTranscriptionAvailable={false}
        onAccept={() => Promise.resolve()}
        onTypeAccept={onTypeAccept}
        onTransition={() => Promise.resolve()}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Type instead" }));
    fireEvent.change(screen.getByLabelText("Raw observation"), {
      target: { value: "Warmth was directly noticeable in my chest." },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Save raw observation" }),
    );
    await vi.waitFor(() => expect(onTypeAccept).toHaveBeenCalledOnce());
    expect(onTypeAccept).toHaveBeenCalledWith(
      "Warmth was directly noticeable in my chest.",
    );
    expect(screen.queryByText(/rate|attainment/i)).not.toBeInTheDocument();
  });
});
