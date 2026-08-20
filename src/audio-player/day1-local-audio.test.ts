import { describe, expect, it } from "vitest";

import { DAY1_CUES } from "../foundation";
import { DAY1_LOCAL_AUDIO, getDay1LocalCueUrl } from "./day1-local-audio";

const isExternal = (value: string): boolean => /^https?:\/\//i.test(value);

describe("Day 1 local audio map", () => {
  it("maps the lesson, preview, manifest, and all 21 cues to local MP3 assets", () => {
    expect(DAY1_LOCAL_AUDIO.voice).toBe("Chill Brian");
    expect(DAY1_LOCAL_AUDIO.lesson).toMatch(/audio\/day1\/lesson\.mp3$/);
    expect(DAY1_LOCAL_AUDIO.preview).toMatch(/audio\/day1\/preview\.mp3$/);
    expect(DAY1_LOCAL_AUDIO.manifest).toMatch(/audio\/day1\/manifest\.json$/);

    const timestamps = Object.keys(DAY1_LOCAL_AUDIO.cues).map(Number);
    expect(timestamps).toEqual(DAY1_CUES.map((cue) => cue.at));

    for (const cue of DAY1_CUES) {
      const url = getDay1LocalCueUrl(cue.at);
      expect(url).toMatch(
        new RegExp(`audio/day1/cue-${String(cue.at).padStart(4, "0")}\\.mp3$`),
      );
      expect(isExternal(url)).toBe(false);
    }
  });

  it("contains no live third-party runtime address", () => {
    const runtimeUrls = [
      DAY1_LOCAL_AUDIO.preview,
      DAY1_LOCAL_AUDIO.lesson,
      DAY1_LOCAL_AUDIO.manifest,
      ...Object.values(DAY1_LOCAL_AUDIO.cues),
    ];

    expect(runtimeUrls).toHaveLength(24);
    expect(runtimeUrls.every((url) => !isExternal(url))).toBe(true);
    expect(runtimeUrls.join(" ")).not.toContain("resource2.heygen.ai");
  });

  it("fails closed when an unknown cue timestamp is requested", () => {
    expect(() => getDay1LocalCueUrl(999_999)).toThrow(
      "No local Day 1 audio asset exists for cue 999999.",
    );
  });
});
