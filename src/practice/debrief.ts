import type { PracticeDebrief } from "../domain";

export const PRACTICE_DEBRIEF_PROMPT_VERSION = "RAW_OBSERVATION_REV0" as const;

export const PRACTICE_DEBRIEF_STATUSES = [
  "pending",
  "remind_later",
  "skipped",
  "completed",
] as const;

export type PracticeDebriefStatus = (typeof PRACTICE_DEBRIEF_STATUSES)[number];
export type PracticeDebriefState = PracticeDebrief;

export interface PracticeDebriefSessionRef {
  readonly id: string;
}

export interface PracticeDebriefEligibleSession extends PracticeDebriefSessionRef {
  readonly completionStatus: "completed" | "incomplete";
  readonly naturalCompletion: boolean;
  readonly testShortened: boolean;
}

export interface LinkedPracticeDebriefRecord {
  readonly id: string;
  readonly sessionId: string | null;
}

interface PracticeDebriefTransitionBase {
  readonly occurredAt: string;
}

export type PracticeDebriefTransition =
  | (PracticeDebriefTransitionBase & {
      readonly to: "pending" | "skipped";
      readonly remindAt?: never;
      readonly record?: never;
    })
  | (PracticeDebriefTransitionBase & {
      readonly to: "remind_later";
      readonly remindAt: string;
      readonly record?: never;
    })
  | (PracticeDebriefTransitionBase & {
      readonly to: "completed";
      readonly remindAt?: never;
      readonly record: LinkedPracticeDebriefRecord;
    });

export type PracticeDebriefDomainErrorCode =
  | "INELIGIBLE_INCOMPLETE"
  | "INELIGIBLE_TEST_SHORTENED"
  | "ILLEGAL_TRANSITION"
  | "INVALID_IDENTIFIER"
  | "INVALID_LINKAGE"
  | "INVALID_REMINDER"
  | "INVALID_STATE"
  | "INVALID_TIMESTAMP"
  | "STALE_TRANSITION";

export class PracticeDebriefDomainError extends Error {
  override readonly name = "PracticeDebriefDomainError";

  constructor(
    readonly code: PracticeDebriefDomainErrorCode,
    message: string,
  ) {
    super(message);
  }
}

const legalTransitions: Readonly<
  Record<PracticeDebriefStatus, readonly PracticeDebriefStatus[]>
> = {
  pending: ["remind_later", "skipped", "completed"],
  remind_later: ["pending", "remind_later", "skipped", "completed"],
  skipped: [],
  completed: [],
};

function normalizeIdentifier(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 240) {
    throw new PracticeDebriefDomainError(
      "INVALID_IDENTIFIER",
      `${label} must contain between 1 and 240 non-whitespace characters.`,
    );
  }
  return normalized;
}

function validateStoredIdentifier(value: string, label: string): string {
  const normalized = normalizeIdentifier(value, label);
  if (normalized !== value) {
    throw new PracticeDebriefDomainError(
      "INVALID_IDENTIFIER",
      `${label} must use its normalized durable value.`,
    );
  }
  return normalized;
}

function timestampMillis(value: string, label: string): number {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) {
    throw new PracticeDebriefDomainError(
      "INVALID_TIMESTAMP",
      `${label} must be a valid timestamp.`,
    );
  }
  return milliseconds;
}

function validateState(
  state: Readonly<PracticeDebriefState>,
): Readonly<PracticeDebriefState> {
  if (!PRACTICE_DEBRIEF_STATUSES.includes(state.status)) {
    throw new PracticeDebriefDomainError(
      "INVALID_STATE",
      "Debrief status is not controlled.",
    );
  }
  if (state.promptVersion !== PRACTICE_DEBRIEF_PROMPT_VERSION) {
    throw new PracticeDebriefDomainError(
      "INVALID_STATE",
      "Debrief prompt version is not controlled.",
    );
  }
  const updatedAt = timestampMillis(state.updatedAt, "Debrief update time");

  if (state.status === "completed") {
    if (state.recordId === null || state.remindAt !== null) {
      throw new PracticeDebriefDomainError(
        "INVALID_LINKAGE",
        "A completed debrief must link one record and cannot retain a reminder.",
      );
    }
    validateStoredIdentifier(state.recordId, "Debrief record ID");
  } else if (state.recordId !== null) {
    throw new PracticeDebriefDomainError(
      "INVALID_LINKAGE",
      "Only a completed debrief may link to a record.",
    );
  }

  if (state.status === "remind_later") {
    if (
      state.remindAt === null ||
      timestampMillis(state.remindAt, "Debrief reminder time") <= updatedAt
    ) {
      throw new PracticeDebriefDomainError(
        "INVALID_REMINDER",
        "A deferred debrief must resurface after its durable update time.",
      );
    }
  } else if (state.remindAt !== null) {
    throw new PracticeDebriefDomainError(
      "INVALID_REMINDER",
      "Only a deferred debrief may retain a reminder time.",
    );
  }
  return state;
}

function validateRecordLink(
  session: PracticeDebriefSessionRef,
  record: LinkedPracticeDebriefRecord,
): string {
  const sessionId = normalizeIdentifier(session.id, "Practice session ID");
  const recordId = normalizeIdentifier(record.id, "Debrief record ID");
  if (
    record.sessionId === null ||
    normalizeIdentifier(record.sessionId, "Record practice session ID") !==
      sessionId
  ) {
    throw new PracticeDebriefDomainError(
      "INVALID_LINKAGE",
      "The debrief record must link to the same practice session.",
    );
  }
  return recordId;
}

/**
 * Creates the exact nested debrief value for a natural, full practice
 * completion. Elapsed time or a shortened verification run cannot create it.
 */
export function createPendingPracticeDebrief(
  session: PracticeDebriefEligibleSession,
  occurredAt: string,
): Readonly<PracticeDebriefState> {
  if (session.testShortened) {
    throw new PracticeDebriefDomainError(
      "INELIGIBLE_TEST_SHORTENED",
      "A shortened verification session cannot create a post-session debrief.",
    );
  }
  if (session.completionStatus !== "completed" || !session.naturalCompletion) {
    throw new PracticeDebriefDomainError(
      "INELIGIBLE_INCOMPLETE",
      "A post-session debrief requires the natural full return and completion.",
    );
  }

  normalizeIdentifier(session.id, "Practice session ID");
  timestampMillis(occurredAt, "Debrief creation time");
  return Object.freeze({
    status: "pending",
    recordId: null,
    updatedAt: occurredAt,
    remindAt: null,
    promptVersion: PRACTICE_DEBRIEF_PROMPT_VERSION,
  });
}

/**
 * Advances the nested debrief without mutating it. Repeating the same durable
 * decision is idempotent; skipped and completed decisions are terminal.
 */
export function transitionPracticeDebrief(
  session: PracticeDebriefSessionRef,
  current: Readonly<PracticeDebriefState>,
  transition: PracticeDebriefTransition,
): Readonly<PracticeDebriefState> {
  normalizeIdentifier(session.id, "Practice session ID");
  validateState(current);

  const nextRecordId =
    transition.to === "completed"
      ? validateRecordLink(session, transition.record)
      : null;
  const nextRemindAt =
    transition.to === "remind_later" ? transition.remindAt : null;

  if (transition.to === current.status) {
    if (current.status === "completed" && current.recordId !== nextRecordId) {
      throw new PracticeDebriefDomainError(
        "INVALID_LINKAGE",
        "An idempotent completion cannot replace its linked record.",
      );
    }
    if (
      current.status !== "remind_later" ||
      current.remindAt === nextRemindAt
    ) {
      return current;
    }
  }

  if (!legalTransitions[current.status].includes(transition.to)) {
    throw new PracticeDebriefDomainError(
      "ILLEGAL_TRANSITION",
      `Debrief cannot transition from ${current.status} to ${transition.to}.`,
    );
  }

  const occurredAt = timestampMillis(
    transition.occurredAt,
    "Debrief transition time",
  );
  if (occurredAt < timestampMillis(current.updatedAt, "Debrief update time")) {
    throw new PracticeDebriefDomainError(
      "STALE_TRANSITION",
      "A debrief transition cannot precede the current durable state.",
    );
  }
  if (
    nextRemindAt !== null &&
    timestampMillis(nextRemindAt, "Debrief reminder time") <= occurredAt
  ) {
    throw new PracticeDebriefDomainError(
      "INVALID_REMINDER",
      "A deferred debrief must resurface after the transition time.",
    );
  }

  return Object.freeze({
    status: transition.to,
    recordId: nextRecordId,
    updatedAt: transition.occurredAt,
    remindAt: nextRemindAt,
    promptVersion: PRACTICE_DEBRIEF_PROMPT_VERSION,
  });
}

/**
 * Validates the stable container-session and completed-record relationship.
 * Pending, deferred, and skipped debriefs must not claim a linked record.
 */
export function validatePracticeDebriefLinkage(
  session: PracticeDebriefSessionRef,
  state: Readonly<PracticeDebriefState>,
  record: LinkedPracticeDebriefRecord | null,
): Readonly<PracticeDebriefState> {
  normalizeIdentifier(session.id, "Practice session ID");
  validateState(state);
  if (state.status !== "completed") {
    if (record !== null) {
      throw new PracticeDebriefDomainError(
        "INVALID_LINKAGE",
        "A non-completed debrief cannot claim a linked record.",
      );
    }
    return state;
  }
  if (
    record === null ||
    validateRecordLink(session, record) !== state.recordId
  ) {
    throw new PracticeDebriefDomainError(
      "INVALID_LINKAGE",
      "Debrief record linkage does not match its practice session.",
    );
  }
  return state;
}
