import { describe, expect, it } from "vitest";

import {
  CHILL_BRIAN_AUDIO,
  DAY1_CUES,
  DAY1_LESSON_PARAGRAPHS,
  DAY1_LESSON_TEXT,
  DAY1_LIGHT_CUE_TIMESTAMPS,
  DAY1_MINIMAL_CUE_TIMESTAMPS,
  DAY1_PRACTICE_DURATION_SECONDS,
  getDay1Cues,
} from "./day1";
import { DAY1_REV114_REGRESSION_FIXTURE } from "./day1-regression.fixture";

function canonicalHash(value: unknown): string {
  let hash = 0x811c9dc5;
  for (const character of JSON.stringify(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

describe("protected Foundation Day 1 content", () => {
  it("locks the exact released lesson paragraphs and joined narration text", () => {
    expect(DAY1_LESSON_PARAGRAPHS).toHaveLength(7);
    expect(DAY1_LESSON_TEXT).toBe(DAY1_LESSON_PARAGRAPHS.join(" "));
    expect(canonicalHash(DAY1_LESSON_PARAGRAPHS)).toBe(
      DAY1_REV114_REGRESSION_FIXTURE.lessonParagraphsFNV1a32,
    );
  });

  it("locks the exact 1,500-second timeline and all 21 cue payloads", () => {
    expect(DAY1_PRACTICE_DURATION_SECONDS).toBe(
      DAY1_REV114_REGRESSION_FIXTURE.durationSeconds,
    );
    expect(DAY1_CUES.map((cue) => cue.at)).toEqual(
      DAY1_REV114_REGRESSION_FIXTURE.cueTimestamps,
    );
    expect(DAY1_CUES.filter((cue) => cue.tone).map((cue) => cue.at)).toEqual(
      DAY1_REV114_REGRESSION_FIXTURE.toneTimestamps,
    );
    expect(
      canonicalHash(
        DAY1_CUES.map(({ at, phase, tone, text }) => ({
          at,
          phase,
          tone,
          text,
        })),
      ),
    ).toBe(DAY1_REV114_REGRESSION_FIXTURE.cueCoreFNV1a32);
  });

  it("locks the Chill Brian preview, lesson, and every cue URL", () => {
    expect(CHILL_BRIAN_AUDIO.voice).toBe("Chill Brian");
    expect(Object.keys(CHILL_BRIAN_AUDIO.cues).map(Number)).toEqual(
      DAY1_CUES.map(({ at }) => at),
    );
    expect(DAY1_CUES.map(({ at, audioUrl }) => [at, audioUrl])).toEqual(
      Object.entries(CHILL_BRIAN_AUDIO.cues).map(([at, audioUrl]) => [
        Number(at),
        audioUrl,
      ]),
    );
    expect(canonicalHash(CHILL_BRIAN_AUDIO)).toBe(
      DAY1_REV114_REGRESSION_FIXTURE.chillBrianManifestFNV1a32,
    );
  });

  it("preserves the released light and minimal cue filters", () => {
    expect(getDay1Cues("guided")).toBe(DAY1_CUES);
    expect(getDay1Cues("light").map(({ at }) => at)).toEqual(
      DAY1_LIGHT_CUE_TIMESTAMPS,
    );
    expect(getDay1Cues("minimal").map(({ at }) => at)).toEqual(
      DAY1_MINIMAL_CUE_TIMESTAMPS,
    );
  });
});
