import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DAY1_LOCAL_AUDIO } from "../../audio-player";
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
let originalAudioContext: typeof AudioContext | undefined;

beforeEach(() => {
  originalAudio = globalThis.Audio;
  originalAudioContext = globalThis.AudioContext;
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.stubGlobal("Audio", originalAudio);
  vi.stubGlobal("AudioContext", originalAudioContext);
});

describe("PracticeScreen guide audio", () => {
  it("uses same-origin MP3 lesson and cue assets and reuses one audio element", async () => {
    const audio = fakeAudio();
    const constructor = vi.fn(function AudioMock() {
      return audio;
    });
    vi.stubGlobal("Audio", constructor);

    render(<PracticeScreen />);

    const lesson = screen.getByTestId("day1-lesson-audio");
    expect(lesson).toHaveAttribute("src", DAY1_LOCAL_AUDIO.lesson);
    expect(DAY1_LOCAL_AUDIO.lesson).toMatch(/audio\/day1\/lesson\.mp3$/);
    expect(DAY1_LOCAL_AUDIO.lesson).not.toContain("heygen.ai");

    fireEvent.click(screen.getByRole("button", { name: "Begin practice" }));

    expect(audio.play).toHaveBeenCalledTimes(1);
    expect(audio.src).toBe(DAY1_LOCAL_AUDIO.cues[0]);
    expect(audio.src).toMatch(/audio\/day1\/cue-0000\.mp3$/);
    expect(audio.src).not.toContain("heygen.ai");
    expect(constructor).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(46_000);
      await Promise.resolve();
    });

    expect(audio.play).toHaveBeenCalledTimes(2);
    expect(audio.src).toBe(DAY1_LOCAL_AUDIO.cues[45]);
    expect(audio.src).toMatch(/audio\/day1\/cue-0045\.mp3$/);
    expect(audio.src).not.toContain("heygen.ai");
    expect(constructor).toHaveBeenCalledTimes(1);
  });

  it("pauses the authoritative timer when local guide audio is blocked", async () => {
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
      screen.getByText(/Local guide audio could not start, so the timer was paused/),
    ).toBeVisible();
  });

  it("keeps accelerated verification independent of narration", () => {
    const constructor = vi.fn();
    vi.stubGlobal("Audio", constructor);

    render(<PracticeScreen testMode />);
    fireEvent.click(screen.getByRole("button", { name: "Begin practice" }));

    expect(constructor).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Pause" })).toBeVisible();
    expect(
      screen.getByText(/Verification mode can never earn morning completion/),
    ).toBeVisible();
  });

  it("starts accelerated verification when Web Audio cannot be created", () => {
    const audioContextConstructor = vi.fn(function AudioContextMock() {
      throw new Error("Web Audio unavailable");
    });
    vi.stubGlobal("AudioContext", audioContextConstructor);

    render(<PracticeScreen testMode />);
    fireEvent.click(screen.getByRole("button", { name: "Begin practice" }));

    expect(audioContextConstructor).toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Pause" })).toBeVisible();
    expect(screen.getByTestId("practice-timer")).toHaveTextContent("1:30");
  });
});
