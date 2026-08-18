import {
  RegSessionSchema,
  createEvidenceLayer,
  createInterpretationLayer,
  createReg01Session,
  type RegSession,
} from "../domain";

export const REG01_SESSION_ID = "reg-session:REG-01-A";

export const REG01_STEPS = [
  "Enter the studio state: sit upright, take three coherence breaths, soften the gaze, and observe the blank page as a field.",
  "Mark one center point. Set one compass radius and do not change it during the construction.",
  "Draw one circle slowly. Draw horizontal and vertical diameters through its center.",
  "Place the compass point on the first circle boundary and draw a second equal circle through the original center.",
  "Identify both centers, the two circle intersections, their shared chord, the overlap, and any visible construction error.",
  "Repeat the construction once on a second sheet, deliberately improving precision and reducing unnecessary body tension.",
  "Record only visible or measurable observations before adding meaning or symbolism.",
  "Complete five minutes of uninterrupted auto-dictation, then preserve the raw entry without editing it.",
  "Underline one useful sentence, choose one practical application, photograph the construction, and save the session.",
] as const;

export const REG01_PROMPT =
  "What did the act of constructing reveal that looking at a finished image would not have revealed?";

export const REG01_PRECEPT = "Observe before interpreting." as const;

export type Reg01TextField =
  | "rawObservation"
  | "interpretation"
  | "autoDictation"
  | "integrationAction"
  | "preceptReview";

export function createOrResumeReg01Session(
  existing: RegSession | undefined,
  now = new Date().toISOString(),
): RegSession {
  return RegSessionSchema.parse(
    existing ?? createReg01Session(REG01_SESSION_ID, now),
  );
}

function markInProgress(session: RegSession, now: string): RegSession {
  if (session.status === "complete") return session;
  return {
    ...session,
    status: "in_progress",
    startedAt: session.startedAt ?? now,
    updatedAt: now,
  };
}

export function setReg01Step(
  session: RegSession,
  index: number,
  complete: boolean,
  now = new Date().toISOString(),
): RegSession {
  if (session.status === "complete") return session;
  if (index < 0 || index >= REG01_STEPS.length) return session;
  const next = markInProgress(session, now);
  return RegSessionSchema.parse({
    ...next,
    steps: next.steps.map((step, stepIndex) =>
      stepIndex === index
        ? {
            ...step,
            complete,
            completedAt: complete ? (step.completedAt ?? now) : null,
          }
        : step,
    ),
  });
}

export function setReg01Text(
  session: RegSession,
  field: Reg01TextField,
  text: string,
  now = new Date().toISOString(),
  sourceIds: string[] = [],
): RegSession {
  if (session.status === "complete") return session;
  const next = markInProgress(session, now);
  if (field === "integrationAction") {
    return RegSessionSchema.parse({ ...next, integrationAction: text });
  }
  if (field === "preceptReview") {
    return RegSessionSchema.parse({
      ...next,
      precept: { ...next.precept, review: text },
    });
  }
  if (field === "rawObservation") {
    return RegSessionSchema.parse({
      ...next,
      rawObservation: text
        ? {
            ...createEvidenceLayer(
              `${next.id}:raw-observation`,
              text,
              now,
              "observed",
            ),
            capturedAt: next.rawObservation?.capturedAt ?? now,
          }
        : null,
    });
  }
  if (field === "interpretation") {
    return RegSessionSchema.parse({
      ...next,
      interpretation: text
        ? {
            ...createInterpretationLayer(
              `${next.id}:interpretation`,
              text,
              [`${next.id}:raw-observation`],
              now,
            ),
            authoredAt: next.interpretation?.authoredAt ?? now,
          }
        : null,
    });
  }
  const existingSources = next.autoDictation?.sourceIds ?? [];
  return RegSessionSchema.parse({
    ...next,
    autoDictation: text
      ? {
          ...createEvidenceLayer(`${next.id}:auto-dictation`, text, now),
          capturedAt: next.autoDictation?.capturedAt ?? now,
          provenance: next.autoDictation?.provenance ?? {
            actor: "user",
            method:
              sourceIds.length > 0
                ? "voice-capture-manual-text"
                : "direct-entry",
            provider: null,
            model: null,
          },
          sourceIds: [...new Set([...existingSources, ...sourceIds])],
        }
      : null,
  });
}

export function setReg01PreceptComplete(
  session: RegSession,
  complete: boolean,
  now = new Date().toISOString(),
): RegSession {
  if (session.status === "complete") return session;
  const next = markInProgress(session, now);
  return RegSessionSchema.parse({
    ...next,
    precept: { ...next.precept, complete },
  });
}

export function linkReg01AutoDictationRecording(
  session: RegSession,
  recordingId: string,
  durationMs: number,
  now = new Date().toISOString(),
): RegSession {
  if (session.status === "complete") return session;
  const next = markInProgress(session, now);
  return RegSessionSchema.parse({
    ...next,
    autoDictationRecordingId: recordingId,
    autoDictationDurationMs: Math.max(0, Math.round(durationMs)),
  });
}

export function addReg01Attachment(
  session: RegSession,
  attachmentId: string,
  now = new Date().toISOString(),
): RegSession {
  if (session.status === "complete") return session;
  const next = markInProgress(session, now);
  return RegSessionSchema.parse({
    ...next,
    attachmentIds: [...new Set([...next.attachmentIds, attachmentId])],
  });
}
