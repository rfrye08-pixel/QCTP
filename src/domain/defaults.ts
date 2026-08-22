import type {
  AppSettings,
  EvidenceLayer,
  FoundationState,
  InterpretationLayer,
  PathState,
  RegSession,
  WorkbookState,
} from "./schemas";

export type Clock = () => string;

export const systemProvenance = {
  actor: "system",
  method: "qctp-rev2",
  provider: null,
  model: null,
} as const;

export const userProvenance = {
  actor: "user",
  method: "direct-entry",
  provider: null,
  model: null,
} as const;

export function createDefaultFoundationState(
  now = new Date().toISOString(),
): FoundationState {
  return {
    schemaVersion: 1,
    id: "foundation",
    currentDay: 1,
    dayCount: 112,
    authoredDays: [1],
    completion: {},
    updatedAt: now,
  };
}

export function createDefaultWorkbookState(
  now = new Date().toISOString(),
): WorkbookState {
  return {
    schemaVersion: 1,
    id: "workbook",
    answers: {},
    updatedAt: now,
  };
}

export function createDefaultSettings(
  now = new Date().toISOString(),
): AppSettings {
  return {
    schemaVersion: 1,
    id: "settings",
    guidanceMode: "guided",
    speechRate: 0.9,
    voiceVolume: 1,
    toneVolume: 0.35,
    speakPhaseTiming: false,
    selectedSystemVoice: "",
    keepAwake: true,
    testMode: false,
    neuralVoice: "chill-brian",
    neuralEnabled: true,
    transcriptionRoute: "local_only",
    audioRetention: "keep",
    updatedAt: now,
  };
}

export function createDefaultPathStates(
  now = new Date().toISOString(),
): PathState[] {
  return [
    {
      schemaVersion: 1,
      id: "foundation-path",
      pathType: "foundation",
      title: "112-Day Foundation",
      currentModule: 1,
      totalModules: 112,
      completedModuleIds: [],
      releasedModuleIds: ["FOUNDATION-DAY-01"],
      active: true,
      updatedAt: now,
    },
    {
      schemaVersion: 1,
      id: "reg-path",
      pathType: "source",
      title: "Robert Edward Grant",
      currentModule: 1,
      totalModules: 12,
      completedModuleIds: [],
      releasedModuleIds: ["REG-01-A"],
      active: true,
      updatedAt: now,
    },
  ];
}

export function createReg01Session(
  id: string,
  now = new Date().toISOString(),
): RegSession {
  return {
    schemaVersion: 1,
    id,
    moduleId: "REG-01-A",
    status: "not_started",
    startedAt: null,
    completedAt: null,
    steps: Array.from({ length: 9 }, (_, index) => ({
      id: `REG-01-STEP-0${index + 1}` as `REG-01-STEP-0${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`,
      complete: false,
      completedAt: null,
    })),
    rawObservation: null,
    interpretation: null,
    autoDictation: null,
    autoDictationRecordingId: null,
    autoDictationDurationMs: 0,
    integrationAction: "",
    precept: {
      id: "observe-before-interpreting",
      text: "Observe before interpreting.",
      complete: false,
      review: "",
    },
    attachmentIds: [],
    resultingRecordIds: null,
    updatedAt: now,
  };
}

export function createEvidenceLayer(
  id: string,
  text: string,
  capturedAt = new Date().toISOString(),
  evidenceClass: EvidenceLayer["evidenceClass"] = "self_reported",
): EvidenceLayer {
  return {
    id,
    text,
    capturedAt,
    evidenceClass,
    provenance: userProvenance,
    sourceIds: [],
  };
}

export function createInterpretationLayer(
  id: string,
  text: string,
  basedOnEvidenceIds: string[],
  authoredAt = new Date().toISOString(),
): InterpretationLayer {
  return {
    id,
    text,
    authoredAt,
    provenance: userProvenance,
    basedOnEvidenceIds,
  };
}
