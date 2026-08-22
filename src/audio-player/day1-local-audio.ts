import { DAY1_CUES } from "../foundation";

const qctpBaseUrl = import.meta.env.BASE_URL.endsWith("/")
  ? import.meta.env.BASE_URL
  : `${import.meta.env.BASE_URL}/`;
const DAY1_LOCAL_AUDIO_ROOT = `${qctpBaseUrl}audio/day1`;

function audioAsset(fileName: string): string {
  return `${DAY1_LOCAL_AUDIO_ROOT}/${fileName}`;
}

function cueFileName(at: number): string {
  return `cue-${String(at).padStart(4, "0")}.mp3`;
}

export const DAY1_LOCAL_AUDIO = Object.freeze({
  voice: "Chill Brian",
  preview: audioAsset("preview.mp3"),
  lesson: audioAsset("lesson.mp3"),
  manifest: audioAsset("manifest.json"),
  cues: Object.freeze(
    Object.fromEntries(
      DAY1_CUES.map((cue) => [cue.at, audioAsset(cueFileName(cue.at))]),
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
