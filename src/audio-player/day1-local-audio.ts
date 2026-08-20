import { DAY1_CUES } from "../foundation";

const DAY1_LOCAL_AUDIO_ROOT = "/audio/day1" as const;

function cueFileName(at: number): string {
  return `cue-${String(at).padStart(4, "0")}.mp3`;
}

export const DAY1_LOCAL_AUDIO = Object.freeze({
  voice: "Chill Brian",
  preview: `${DAY1_LOCAL_AUDIO_ROOT}/preview.mp3`,
  lesson: `${DAY1_LOCAL_AUDIO_ROOT}/lesson.mp3`,
  manifest: `${DAY1_LOCAL_AUDIO_ROOT}/manifest.json`,
  cues: Object.freeze(
    Object.fromEntries(
      DAY1_CUES.map((cue) => [
        cue.at,
        `${DAY1_LOCAL_AUDIO_ROOT}/${cueFileName(cue.at)}`,
      ]),
    ) as Readonly<Record<number, string>>,
  ),
});

export function getDay1LocalCueUrl(at: number): string {
  const url = DAY1_LOCAL_AUDIO.cues[at];
  if (!url) {
    throw new Error(`No local Day 1 audio asset exists for cue ${at}.`);
  }
  return url;
}
