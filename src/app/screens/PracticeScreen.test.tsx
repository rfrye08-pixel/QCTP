import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PracticeScreen } from "./PracticeScreen";

interface FakeAudioElement {
  src: string;
  preload: string;
  volume: number;
  currentTime: number;
  ended: boolean;
  paused: boolean;
  play: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  load: ReturnType<typeof vi.fn>;
  removeAttribute: ReturnType<typeof vi.fn>;
}

function fakeAudio(
  playResult: "resolve" | "reject" = "resolve",
): FakeAudioElement {
  const audio = {} as FakeAudioElement;
  const play = vi.fn((): Promise<void> => {
    if (playResult === "reject") {
      return Promise.reject(
        new DOMException("Playback blocked", "NotAllowedError"),
      );
    }
    audio.paused = false;
    return Promise.resolve();
  });

  Object.assign(audio, {
    src: "",
    preload: "none",
    volume: 1,
    currentTime: 0,
    ended: false,
    paused: true,
    play,
    pause: vi.fn(() => {
      audio.paused = true;
    }),
    load: vi.fn(),
    removeAttribute: vi.fn((name: string) => {
      if (name === "src") audio.src = "";
    }),
  } satisfies FakeAudioElement);
  return audio;
}

let originalAudio: typeof Audio;

beforeEach(() => {
  originalAudio = globalThis.Audio;
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.stubGlobal("Audio", originalAudio);
});

describe("PracticeScreen guide audio", () => {
  it("reuses one authorized audio element across delayed cues", async () => {
    const audio = fakeAudio();
    const constructor = vi.fn(function AudioMock() {
      return audio;
    });
    vi.stubGlobal("Audio", constructor);

    render(<PracticeScreen />);
    fireEvent.click(screen.getByRole("button", { name: "Begin practice" }));

    expect(audio.play).toHaveBeenCalledTimes(1);
    expect(constructor).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(46_000);
      await Promise.resolve();
    });

    expect(audio.play).toHaveBeenCalledTimes(2);
    expect(constructor).toHaveBeenCalledTimes(1);
  });

  it("pauses the authoritative timer when guide audio is blocked", async () => {
    const audio = fakeAudio("reject");
    const constructor = vi.fn(function AudioMock() {
      return audio;
    });
    vi.stubGlobal("Audio", constructor);

    render(<PracticeScreen />);
    fireEvent.click(screen.getByRole("button", { name: "Begin practice" }));

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByRole("button", { name: "Resume" })).toBeVisible();
    expect(
      screen.getByText(/Guide audio could not start, so the timer was paused/),
    ).toBeVisible();
  });
});
