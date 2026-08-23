import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useVoiceFreeDay1Session } from "./use-voice-free-day1-session";

class ControlledAudio extends EventTarget {
  src = "";
  preload = "none";
  loop = false;
  currentTime = 0;
  duration = 1_500.048;
  ended = false;
  paused = true;
  readonly load = vi.fn();

  readonly play = vi.fn(() => {
    this.paused = false;
    this.dispatchEvent(new Event("play"));
    return Promise.resolve();
  });

  readonly pause = vi.fn(() => {
    this.paused = true;
    this.dispatchEvent(new Event("pause"));
  });

  removeAttribute(name: string): void {
    if (name === "src") this.src = "";
  }
}

function installAudio(): ControlledAudio {
  const audio = new ControlledAudio();
  vi.stubGlobal(
    "Audio",
    vi.fn(function AudioMock() {
      return audio;
    }),
  );
  return audio;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Voice-Free Day 1 session", () => {
  it("uses the same-origin support track as the authoritative clock", async () => {
    const audio = installAudio();
    const { result } = renderHook(() =>
      useVoiceFreeDay1Session({ keepAwake: false }),
    );

    expect(audio.src).toMatch(
      /audio\/day1-source-rev0\/support-ambient-1500\.mp3$/,
    );
    expect(audio.preload).toBe("metadata");
    void act(() => {
      audio.dispatchEvent(new Event("loadedmetadata"));
    });
    expect(result.current.readiness).toBe("ready");

    void act(() => {
      result.current.start();
    });
    await waitFor(() => expect(result.current.status).toBe("running"));
    void act(() => {
      audio.currentTime = 480;
      audio.dispatchEvent(new Event("timeupdate"));
    });

    expect(result.current.elapsedSeconds).toBe(480);
    expect(result.current.phase.id).toBe("attention-contrast");
    expect(result.current.remainingSeconds).toBe(1_020);
  });

  it("persists a natural completion only after the complete 1,500-second return", async () => {
    const audio = installAudio();
    const onNaturalComplete = vi.fn();
    const { result } = renderHook(() =>
      useVoiceFreeDay1Session({
        keepAwake: false,
        onNaturalComplete,
      }),
    );

    void act(() => {
      audio.dispatchEvent(new Event("canplay"));
    });
    void act(() => {
      result.current.start();
    });
    await waitFor(() => expect(result.current.status).toBe("running"));
    void act(() => {
      audio.currentTime = 1_500;
      audio.ended = true;
      audio.dispatchEvent(new Event("ended"));
    });

    await waitFor(() => expect(result.current.status).toBe("completed"));
    expect(onNaturalComplete).toHaveBeenCalledOnce();
    expect(onNaturalComplete).toHaveBeenCalledWith(
      expect.objectContaining({
        elapsedMs: 1_500_000,
        supportMode: "ambient",
      }),
    );
  });

  it("never grants completion after an early user end or shortened test run", async () => {
    const earlyAudio = installAudio();
    const earlyComplete = vi.fn();
    const earlyIssue = vi.fn();
    const early = renderHook(() =>
      useVoiceFreeDay1Session({
        keepAwake: false,
        onNaturalComplete: earlyComplete,
        onAttemptIssue: earlyIssue,
      }),
    );
    void act(() => {
      earlyAudio.dispatchEvent(new Event("canplay"));
    });
    void act(() => {
      early.result.current.start();
    });
    await waitFor(() => expect(early.result.current.status).toBe("running"));
    void act(() => {
      earlyAudio.currentTime = 1_499;
      early.result.current.end();
    });
    await waitFor(() => expect(early.result.current.status).toBe("ended"));
    expect(earlyComplete).not.toHaveBeenCalled();
    expect(earlyIssue).toHaveBeenCalledWith(
      expect.objectContaining({
        code: "EARLY_USER_END",
        elapsedMs: 1_499_000,
        completionCreditGranted: false,
        stateCapabilityCreditGranted: false,
      }),
    );
    early.unmount();

    const testAudio = installAudio();
    const testComplete = vi.fn();
    const shortened = renderHook(() =>
      useVoiceFreeDay1Session({
        testMode: true,
        keepAwake: false,
        onNaturalComplete: testComplete,
      }),
    );
    void act(() => {
      testAudio.dispatchEvent(new Event("canplay"));
    });
    void act(() => {
      shortened.result.current.start();
    });
    await waitFor(() =>
      expect(shortened.result.current.status).toBe("running"),
    );
    void act(() => {
      testAudio.currentTime = 90;
      testAudio.dispatchEvent(new Event("timeupdate"));
    });

    expect(shortened.result.current.status).toBe("ended");
    expect(testComplete).not.toHaveBeenCalled();
  });

  it("fails closed and records the unresolved issue when support is not 25 minutes", async () => {
    const audio = installAudio();
    const onAttemptIssue = vi.fn();
    audio.duration = 120;
    const { result } = renderHook(() =>
      useVoiceFreeDay1Session({ keepAwake: false, onAttemptIssue }),
    );

    void act(() => {
      audio.dispatchEvent(new Event("loadedmetadata"));
    });

    expect(result.current.status).toBe("error");
    expect(result.current.readiness).toBe("error");
    expect(result.current.issue).toMatch(/failed the 25-minute duration check/);
    await waitFor(() =>
      expect(onAttemptIssue).toHaveBeenCalledWith(
        expect.objectContaining({
          code: "AUDIO_DURATION_INVALID",
          completionCreditGranted: false,
        }),
      ),
    );
  });

  it("holds completion as save-pending and exposes an explicit retry", async () => {
    const audio = installAudio();
    const onNaturalComplete = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(new Error("simulated IndexedDB interruption"))
      .mockResolvedValueOnce();
    const { result } = renderHook(() =>
      useVoiceFreeDay1Session({
        keepAwake: false,
        onNaturalComplete,
      }),
    );

    void act(() => {
      audio.dispatchEvent(new Event("canplay"));
    });
    expect(result.current.readiness).toBe("ready");
    void act(() => {
      result.current.start();
    });
    await waitFor(() => expect(result.current.status).toBe("running"));
    void act(() => {
      audio.currentTime = 1_500;
      audio.ended = true;
      audio.dispatchEvent(new Event("ended"));
    });
    await waitFor(() => expect(result.current.status).toBe("save_pending"));
    expect(result.current.issue).toMatch(/not saved yet/i);

    void act(() => result.current.retrySave());
    await waitFor(() => expect(result.current.status).toBe("completed"));
    expect(onNaturalComplete).toHaveBeenCalledTimes(2);
  });
});
