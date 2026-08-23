import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getHeartMathBreathRail,
  getVoiceFreeDay1Phase,
  getVoiceFreeSupportUrl,
  isVoiceFreeSupportCached,
  VOICE_FREE_DAY1_DURATION_SECONDS,
  VOICE_FREE_DAY1_PHASES,
  VOICE_FREE_DAY1_SCRIPT_SHA256,
  VOICE_FREE_SUPPORT_MODES,
} from "./voice-free-day1";

afterEach(() => vi.unstubAllGlobals());

describe("Voice-Free Day 1 controlled definition", () => {
  it("locks the source-grounded 1,500-second six-phase sequence", () => {
    expect(VOICE_FREE_DAY1_DURATION_SECONDS).toBe(1_500);
    expect(VOICE_FREE_DAY1_PHASES).toHaveLength(6);
    expect(VOICE_FREE_DAY1_PHASES[0]?.startSeconds).toBe(0);
    expect(VOICE_FREE_DAY1_PHASES.at(-1)?.endSeconds).toBe(1_500);
    for (let index = 1; index < VOICE_FREE_DAY1_PHASES.length; index += 1) {
      expect(VOICE_FREE_DAY1_PHASES[index]?.startSeconds).toBe(
        VOICE_FREE_DAY1_PHASES[index - 1]?.endSeconds,
      );
    }
    expect(VOICE_FREE_DAY1_SCRIPT_SHA256).toBe(
      "2649ce70e5ab824dbc6b797e07082567fda2443962016e8e6c7dbe454f5ee555",
    );
  });

  it("selects every controlled boundary without a gap", () => {
    expect(getVoiceFreeDay1Phase(0).id).toBe("settle");
    expect(getVoiceFreeDay1Phase(179.999).id).toBe("settle");
    expect(getVoiceFreeDay1Phase(180).id).toBe("coherence");
    expect(getVoiceFreeDay1Phase(480).id).toBe("attention-contrast");
    expect(getVoiceFreeDay1Phase(780).id).toBe("open-space");
    expect(getVoiceFreeDay1Phase(1_380).id).toBe("observe");
    expect(getVoiceFreeDay1Phase(1_440).id).toBe("return");
    expect(getVoiceFreeDay1Phase(1_500).id).toBe("return");
  });

  it("preserves each source method, QCTP transition, and original support layer as a canonical phase reference", () => {
    expect(
      Object.fromEntries(
        VOICE_FREE_DAY1_PHASES.map((phase) => [
          phase.id,
          phase.contentRefs.map((reference) => [
            reference.authorityKey,
            reference.contentClass,
          ]),
        ]),
      ),
    ).toEqual({
      settle: [
        ["foundation.day1.phase.baseline-observation", "QCTP_ORIGINAL"],
        ["foundation.day1.phase.bullard-contraction", "SOURCE_ENHANCED"],
        ["foundation.day1.transition.bullard-to-heartmath", "QCTP_SYNTHESIS"],
      ],
      coherence: [
        ["foundation.day1.phase.heart-coherence", "SOURCE_ENHANCED"],
        ["foundation.day1.transition.heartmath-to-dispenza", "QCTP_SYNTHESIS"],
      ],
      "attention-contrast": [
        ["foundation.day1.phase.spatial-induction", "SOURCE_ENHANCED"],
        ["foundation.day1.transition.spatial-to-open-space", "QCTP_SYNTHESIS"],
      ],
      "open-space": [
        ["foundation.day1.phase.open-spatial-awareness", "SOURCE_ENHANCED"],
        ["foundation.day1.transition.end-spatial-method", "QCTP_SYNTHESIS"],
      ],
      observe: [["foundation.day1.phase.pure-observation", "QCTP_ORIGINAL"]],
      return: [["foundation.day1.phase.return", "QCTP_ORIGINAL"]],
    });
  });

  it("provides a no-hold five-in/five-out rail only in coherence", () => {
    expect(getHeartMathBreathRail(179.9).active).toBe(false);
    expect(getHeartMathBreathRail(180)).toMatchObject({
      active: true,
      label: "Inhale",
      secondsRemainingInHalfCycle: 5,
    });
    expect(getHeartMathBreathRail(185)).toMatchObject({
      active: true,
      label: "Exhale",
      secondsRemainingInHalfCycle: 5,
    });
    expect(getHeartMathBreathRail(190).label).toBe("Inhale");
    expect(getHeartMathBreathRail(480).active).toBe(false);
  });

  it("exposes only same-origin support stems and never a narration asset", () => {
    expect(Object.keys(VOICE_FREE_SUPPORT_MODES)).toEqual([
      "ambient",
      "binaural_low_a",
      "minimal_continuity",
    ]);
    for (const mode of Object.keys(VOICE_FREE_SUPPORT_MODES) as Array<
      keyof typeof VOICE_FREE_SUPPORT_MODES
    >) {
      const support = VOICE_FREE_SUPPORT_MODES[mode];
      expect(support.fileName).toMatch(/^support-.+-1500\.mp3$/);
      expect(support.fileName).not.toContain("voice");
      expect(support.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(support.bytes).toBe(12_000_576);
      expect(getVoiceFreeSupportUrl(mode)).not.toMatch(/^https?:\/\//);
    }
  });

  it("claims offline readiness only for the complete cached binary", async () => {
    const match = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("", {
          headers: { "content-length": "12000576" },
        }),
      )
      .mockResolvedValueOnce(
        new Response("", {
          headers: { "content-length": "1200" },
        }),
      );
    vi.stubGlobal("caches", { match });

    await expect(isVoiceFreeSupportCached("ambient")).resolves.toBe(true);
    await expect(isVoiceFreeSupportCached("ambient")).resolves.toBe(false);
    expect(match).toHaveBeenCalledWith(expect.any(String), {
      ignoreSearch: true,
    });
  });
});
