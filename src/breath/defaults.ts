import { BreathProfileSchema, type BreathProfile } from "./types";

export function normalizeBreathProfile(value: unknown): BreathProfile {
  const parsed = BreathProfileSchema.parse(value);
  return BreathProfileSchema.parse({
    ...parsed,
    accessibility: {
      visualPacer: parsed.quickDirector.cues.visualPacer,
      audioTones: parsed.quickDirector.cues.localTones,
      haptics: parsed.quickDirector.cues.haptics,
      dimScreen: parsed.accessibility.dimScreen,
      silentPacing: parsed.accessibility.silentPacing,
    },
    quickDirector: {
      ...parsed.quickDirector,
      director: {
        ...parsed.quickDirector.director,
        comfortableMethodIds: parsed.comfortableMethodIds,
      },
    },
  });
}

export function createDefaultBreathProfile(
  now = new Date().toISOString(),
): BreathProfile {
  return normalizeBreathProfile({
    schemaVersion: 1,
    id: "breath-profile",
    calmMethod: "QCTP-B1",
    focusMethod: "QCTP-B3",
    sleepMethod: "QCTP-B1",
    acuteResetMethod: "physiological_sigh_then_QCTP-B1",
    // Comfort is evidence from calibration or use, not a default claim.
    comfortableMethodIds: [],
    calibrationTrials: [],
    accessibility: {
      visualPacer: true,
      audioTones: true,
      haptics: true,
      dimScreen: false,
      silentPacing: false,
    },
    quickDirector: {
      director: {
        goal: "calm_coherence",
        context: "general",
        activation: 2,
        sleepiness: 1,
        airHungerAtRest: 0,
        availableMinutes: 5,
        posture: "seated",
        hazard: "none",
        comfortableMethodIds: [],
      },
      cues: {
        visualPacer: true,
        localTones: true,
        haptics: true,
      },
    },
    createdAt: now,
    updatedAt: now,
  });
}
