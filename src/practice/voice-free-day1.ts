import {
  contentRefFor,
  type ControlledContentRef,
} from "../controlled-content";

export const VOICE_FREE_DAY1_PRACTICE_ID =
  "foundation-day1-source-rev0-voice-free" as const;
export const VOICE_FREE_DAY1_SCRIPT_ID =
  "QCTP-D1-SOURCE-LABELED-SCRIPT-CANDIDATE-REV0" as const;
export const VOICE_FREE_DAY1_SCRIPT_SHA256 =
  "2649ce70e5ab824dbc6b797e07082567fda2443962016e8e6c7dbe454f5ee555" as const;
export const VOICE_FREE_DAY1_DURATION_SECONDS = 1_500 as const;
export const VOICE_FREE_DAY1_TEST_DURATION_SECONDS = 90 as const;

export type VoiceFreeSupportMode =
  "ambient" | "binaural_low_a" | "minimal_continuity";

export interface VoiceFreeSupportDefinition {
  readonly id: VoiceFreeSupportMode;
  readonly label: string;
  readonly description: string;
  readonly fileName: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly binaural: boolean;
  readonly headphonesRequired: boolean;
}

export interface VoiceFreeDay1Phase {
  readonly id:
    | "settle"
    | "coherence"
    | "attention-contrast"
    | "open-space"
    | "observe"
    | "return";
  readonly title: string;
  readonly startSeconds: number;
  readonly endSeconds: number;
  readonly sourceLabel: string;
  readonly contentRefs: readonly Readonly<ControlledContentRef>[];
  readonly readOnceInstruction: string;
  readonly markerAtStart: boolean;
}

const qctpBaseUrl = import.meta.env.BASE_URL.endsWith("/")
  ? import.meta.env.BASE_URL
  : `${import.meta.env.BASE_URL}/`;
const SUPPORT_ROOT = `${qctpBaseUrl}audio/day1-source-rev0`;

function controlledRefs(
  ...authorityKeys: string[]
): readonly Readonly<ControlledContentRef>[] {
  return Object.freeze(
    authorityKeys.map((authorityKey) =>
      Object.freeze(contentRefFor(authorityKey)),
    ),
  );
}

export const VOICE_FREE_SUPPORT_MODES: Readonly<
  Record<VoiceFreeSupportMode, Readonly<VoiceFreeSupportDefinition>>
> = Object.freeze({
  ambient: Object.freeze({
    id: "ambient",
    label: "Ambient",
    description: "Low-information continuity without a binaural difference.",
    fileName: "support-ambient-1500.mp3",
    sha256: "eb32e69b73099e6b20dc2107cf836be72cdf6ca79a07d267da2f9abf95610726",
    bytes: 12_000_576,
    binaural: false,
    headphonesRequired: false,
  }),
  binaural_low_a: Object.freeze({
    id: "binaural_low_a",
    label: "Binaural Low",
    description:
      "Optional low-level 8 Hz QCTP support candidate; headphones required.",
    fileName: "support-binaural-low-a-1500.mp3",
    sha256: "e592c954af517c2022f7c3e5f653591e026e6d3ff467c8afb6b78647510912fe",
    bytes: 12_000_576,
    binaural: true,
    headphonesRequired: true,
  }),
  minimal_continuity: Object.freeze({
    id: "minimal_continuity",
    label: "Minimal",
    description: "The quietest continuous floor with nonverbal markers.",
    fileName: "support-minimal-1500.mp3",
    sha256: "4611a2cb65a553a9904777aaaa65bc70461fd3c325e1dfd7715bb83d6c3ca0cb",
    bytes: 12_000_576,
    binaural: false,
    headphonesRequired: false,
  }),
});

export const VOICE_FREE_DAY1_PHASES: readonly Readonly<VoiceFreeDay1Phase>[] =
  Object.freeze([
    Object.freeze({
      id: "settle",
      title: "Settle and notice",
      startSeconds: 0,
      endSeconds: 180,
      sourceLabel: "Bullard + QCTP baseline support",
      contentRefs: controlledRefs(
        "foundation.day1.phase.baseline-observation",
        "foundation.day1.phase.bullard-contraction",
        "foundation.day1.transition.bullard-to-heartmath",
      ),
      readOnceInstruction:
        "Notice your starting mind, emotion, natural breath, and body effort. Locate one clear contraction without searching for a story. Allow a small release if the body is ready, and invite acceptance, gratitude, peace, or care into any space that opens.",
      markerAtStart: false,
    }),
    Object.freeze({
      id: "coherence",
      title: "HeartMath coherence",
      startSeconds: 180,
      endSeconds: 480,
      sourceLabel: "HeartMath Quick Coherence",
      contentRefs: controlledRefs(
        "foundation.day1.phase.heart-coherence",
        "foundation.day1.transition.heartmath-to-dispenza",
      ),
      readOnceInstruction:
        "Place attention in the heart area. Breathe about five seconds in and five seconds out, or use a comfortable rhythm. Do not hold. Make a sincere attempt to feel appreciation, care, calm, or ease. Comfort controls the pace.",
      markerAtStart: true,
    }),
    Object.freeze({
      id: "attention-contrast",
      title: "Body area and space",
      startSeconds: 480,
      endSeconds: 780,
      sourceLabel: "Dispenza spatial-attention induction",
      contentRefs: controlledRefs(
        "foundation.day1.phase.spatial-induction",
        "foundation.day1.transition.spatial-to-open-space",
      ),
      readOnceInstruction:
        "Release deliberate breath timing. Sense the volume between the ears, then the space around the head. Continue through the torso and whole body. Compare narrow attention with sensing the space around each area; do not construct a visual scene.",
      markerAtStart: true,
    }),
    Object.freeze({
      id: "open-space",
      title: "Open spatial awareness",
      startSeconds: 780,
      endSeconds: 1_380,
      sourceLabel: "Dispenza broad spatial attention + QCTP transition",
      contentRefs: controlledRefs(
        "foundation.day1.phase.open-spatial-awareness",
        "foundation.day1.transition.end-spatial-method",
      ),
      readOnceInstruction:
        "Sense the space surrounding the whole body and the room as one volume. Include sounds in the same field without following them. If attention is captured, return to one body-area-and-space reference, then reopen. Near the end, stop deliberately widening and notice what remains.",
      markerAtStart: true,
    }),
    Object.freeze({
      id: "observe",
      title: "Pure observation",
      startSeconds: 1_380,
      endSeconds: 1_440,
      sourceLabel: "QCTP observation support",
      contentRefs: controlledRefs("foundation.day1.phase.pure-observation"),
      readOnceInstruction:
        "Release breath control, emotional generation, and spatial induction. Observe the mind, body, emotion, natural breath, and sense of space without grading the experience.",
      markerAtStart: true,
    }),
    Object.freeze({
      id: "return",
      title: "Complete return",
      startSeconds: 1_440,
      endSeconds: 1_500,
      sourceLabel: "QCTP return support",
      contentRefs: controlledRefs("foundation.day1.phase.return"),
      readOnceInstruction:
        "Feel the feet, chair, hands, and natural breath. Re-establish the room, time of day, and next action. Move gently, open the eyes, and carry one useful quality into ordinary activity. Stand only when fully oriented.",
      markerAtStart: true,
    }),
  ]);

export function getVoiceFreeSupportUrl(mode: VoiceFreeSupportMode): string {
  return `${SUPPORT_ROOT}/${VOICE_FREE_SUPPORT_MODES[mode].fileName}`;
}

export function getVoiceFreeManifestUrl(): string {
  return `${SUPPORT_ROOT}/voice-free-manifest.json`;
}

export async function isVoiceFreeSupportCached(
  mode: VoiceFreeSupportMode,
): Promise<boolean> {
  if (!("caches" in globalThis) || typeof location === "undefined")
    return false;
  const support = VOICE_FREE_SUPPORT_MODES[mode];
  const url = new URL(getVoiceFreeSupportUrl(mode), location.href).href;
  // Workbox revisions precached URLs with a query parameter. The exact body
  // still has to match the controlled byte count, but the lookup must ignore
  // that internal revision query to find the same-origin asset.
  const response = await caches.match(url, { ignoreSearch: true });
  if (!response?.ok) return false;
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > 0) {
    return contentLength === support.bytes;
  }
  return (await response.blob()).size === support.bytes;
}

export function getVoiceFreeDay1Phase(
  elapsedSeconds: number,
): Readonly<VoiceFreeDay1Phase> {
  const clamped = Math.min(
    Math.max(0, elapsedSeconds),
    VOICE_FREE_DAY1_DURATION_SECONDS - Number.EPSILON,
  );
  return (
    VOICE_FREE_DAY1_PHASES.find(
      (phase) => clamped >= phase.startSeconds && clamped < phase.endSeconds,
    ) ?? VOICE_FREE_DAY1_PHASES[VOICE_FREE_DAY1_PHASES.length - 1]!
  );
}

export interface HeartMathBreathRailState {
  readonly active: boolean;
  readonly label: "Inhale" | "Exhale" | "Natural breath";
  readonly cycleProgress: number;
  readonly phaseProgress: number;
  readonly secondsRemainingInHalfCycle: number | null;
}

export function getHeartMathBreathRail(
  elapsedSeconds: number,
): Readonly<HeartMathBreathRailState> {
  if (elapsedSeconds < 180 || elapsedSeconds >= 480) {
    return Object.freeze({
      active: false,
      label: "Natural breath",
      cycleProgress: 0,
      phaseProgress: 0,
      secondsRemainingInHalfCycle: null,
    });
  }

  const withinCycle = (elapsedSeconds - 180) % 10;
  const inhaling = withinCycle < 5;
  const withinHalf = inhaling ? withinCycle : withinCycle - 5;
  return Object.freeze({
    active: true,
    label: inhaling ? "Inhale" : "Exhale",
    cycleProgress: withinCycle / 10,
    phaseProgress: withinHalf / 5,
    secondsRemainingInHalfCycle: 5 - withinHalf,
  });
}

export function formatPracticeSeconds(seconds: number): string {
  const wholeSeconds = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(wholeSeconds / 60)}:${String(wholeSeconds % 60).padStart(2, "0")}`;
}
