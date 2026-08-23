import { describe, expect, it } from "vitest";

import {
  PRACTICE_DEBRIEF_PROMPT_VERSION,
  PracticeDebriefDomainError,
  createPendingPracticeDebrief,
  transitionPracticeDebrief,
  validatePracticeDebriefLinkage,
  type LinkedPracticeDebriefRecord,
  type PracticeDebriefEligibleSession,
  type PracticeDebriefState,
} from "./debrief";

const session: PracticeDebriefEligibleSession = {
  id: "practice-day1-1",
  completionStatus: "completed",
  naturalCompletion: true,
  testShortened: false,
};
const createdAt = "2026-08-22T10:25:00.000Z";
const record: LinkedPracticeDebriefRecord = {
  id: "voice-record:debrief-1",
  sessionId: session.id,
};

function pending(): Readonly<PracticeDebriefState> {
  return createPendingPracticeDebrief(session, createdAt);
}

function expectDomainError(
  operation: () => unknown,
  code: PracticeDebriefDomainError["code"],
): void {
  try {
    operation();
    throw new Error("Expected a PracticeDebriefDomainError.");
  } catch (error) {
    expect(error).toBeInstanceOf(PracticeDebriefDomainError);
    expect((error as PracticeDebriefDomainError).code).toBe(code);
  }
}

describe("practice debrief domain", () => {
  it("creates the exact immutable nested pending value after natural completion", () => {
    const state = pending();

    expect(state).toEqual({
      status: "pending",
      recordId: null,
      updatedAt: createdAt,
      remindAt: null,
      promptVersion: PRACTICE_DEBRIEF_PROMPT_VERSION,
    });
    expect(state).not.toHaveProperty("practiceSessionId");
    expect(state).not.toHaveProperty("createdAt");
    expect(Object.isFrozen(state)).toBe(true);
  });

  it("prohibits creation for incomplete, timer-only, and shortened test sessions", () => {
    expectDomainError(
      () =>
        createPendingPracticeDebrief(
          {
            ...session,
            id: "practice-incomplete",
            completionStatus: "incomplete",
            naturalCompletion: false,
          },
          createdAt,
        ),
      "INELIGIBLE_INCOMPLETE",
    );
    expectDomainError(
      () =>
        createPendingPracticeDebrief(
          {
            ...session,
            id: "practice-timer-only",
            naturalCompletion: false,
          },
          createdAt,
        ),
      "INELIGIBLE_INCOMPLETE",
    );
    expectDomainError(
      () =>
        createPendingPracticeDebrief(
          {
            ...session,
            id: "practice-short-test",
            testShortened: true,
          },
          createdAt,
        ),
      "INELIGIBLE_TEST_SHORTENED",
    );
  });

  it("supports pending, remind-later, reopened, and completed transitions", () => {
    const deferred = transitionPracticeDebrief(session, pending(), {
      to: "remind_later",
      occurredAt: "2026-08-22T10:26:00.000Z",
      remindAt: "2026-08-22T11:00:00.000Z",
    });
    const reopened = transitionPracticeDebrief(session, deferred, {
      to: "pending",
      occurredAt: "2026-08-22T11:00:00.000Z",
    });
    const completed = transitionPracticeDebrief(session, reopened, {
      to: "completed",
      record,
      occurredAt: "2026-08-22T11:03:00.000Z",
    });

    expect(deferred).toMatchObject({
      status: "remind_later",
      remindAt: "2026-08-22T11:00:00.000Z",
    });
    expect(reopened).toMatchObject({ status: "pending", remindAt: null });
    expect(completed).toMatchObject({
      status: "completed",
      recordId: record.id,
      remindAt: null,
    });
    expect(Object.isFrozen(completed)).toBe(true);
  });

  it("is idempotent and only reschedules a reminder when its time changes", () => {
    const deferred = transitionPracticeDebrief(session, pending(), {
      to: "remind_later",
      occurredAt: "2026-08-22T10:26:00.000Z",
      remindAt: "2026-08-22T11:00:00.000Z",
    });
    expect(
      transitionPracticeDebrief(session, deferred, {
        to: "remind_later",
        occurredAt: "2026-08-22T10:27:00.000Z",
        remindAt: "2026-08-22T11:00:00.000Z",
      }),
    ).toBe(deferred);

    const rescheduled = transitionPracticeDebrief(session, deferred, {
      to: "remind_later",
      occurredAt: "2026-08-22T10:27:00.000Z",
      remindAt: "2026-08-22T12:00:00.000Z",
    });
    expect(rescheduled).toMatchObject({
      status: "remind_later",
      updatedAt: "2026-08-22T10:27:00.000Z",
      remindAt: "2026-08-22T12:00:00.000Z",
    });

    const completed = transitionPracticeDebrief(session, rescheduled, {
      to: "completed",
      record,
      occurredAt: "2026-08-22T10:28:00.000Z",
    });
    expect(
      transitionPracticeDebrief(session, completed, {
        to: "completed",
        record,
        occurredAt: "2026-08-22T12:00:00.000Z",
      }),
    ).toBe(completed);

    expectDomainError(
      () =>
        transitionPracticeDebrief(session, completed, {
          to: "completed",
          record: { ...record, id: "voice-record:replacement" },
          occurredAt: "2026-08-22T12:00:00.000Z",
        }),
      "INVALID_LINKAGE",
    );
  });

  it("makes skipped and completed decisions terminal", () => {
    const skipped = transitionPracticeDebrief(session, pending(), {
      to: "skipped",
      occurredAt: "2026-08-22T10:26:00.000Z",
    });
    expectDomainError(
      () =>
        transitionPracticeDebrief(session, skipped, {
          to: "completed",
          record,
          occurredAt: "2026-08-22T10:27:00.000Z",
        }),
      "ILLEGAL_TRANSITION",
    );

    const completed = transitionPracticeDebrief(session, pending(), {
      to: "completed",
      record,
      occurredAt: "2026-08-22T10:27:00.000Z",
    });
    expectDomainError(
      () =>
        transitionPracticeDebrief(session, completed, {
          to: "remind_later",
          occurredAt: "2026-08-22T10:28:00.000Z",
          remindAt: "2026-08-22T11:00:00.000Z",
        }),
      "ILLEGAL_TRANSITION",
    );
  });

  it("validates the stable practice-session and record relationship", () => {
    const completed = transitionPracticeDebrief(session, pending(), {
      to: "completed",
      record,
      occurredAt: "2026-08-22T10:27:00.000Z",
    });
    expect(validatePracticeDebriefLinkage(session, completed, record)).toBe(
      completed,
    );
    expectDomainError(
      () =>
        validatePracticeDebriefLinkage(session, completed, {
          ...record,
          id: "voice-record:other",
        }),
      "INVALID_LINKAGE",
    );
    expectDomainError(
      () =>
        validatePracticeDebriefLinkage(session, completed, {
          ...record,
          sessionId: "practice-other",
        }),
      "INVALID_LINKAGE",
    );
    expectDomainError(
      () => validatePracticeDebriefLinkage(session, pending(), record),
      "INVALID_LINKAGE",
    );
  });

  it("rejects stale decisions and invalid reminder times", () => {
    const deferred = transitionPracticeDebrief(session, pending(), {
      to: "remind_later",
      occurredAt: "2026-08-22T10:30:00.000Z",
      remindAt: "2026-08-22T11:00:00.000Z",
    });
    expectDomainError(
      () =>
        transitionPracticeDebrief(session, deferred, {
          to: "pending",
          occurredAt: "2026-08-22T10:29:00.000Z",
        }),
      "STALE_TRANSITION",
    );
    expectDomainError(
      () =>
        transitionPracticeDebrief(session, pending(), {
          to: "remind_later",
          occurredAt: "2026-08-22T10:26:00.000Z",
          remindAt: "2026-08-22T10:26:00.000Z",
        }),
      "INVALID_REMINDER",
    );
  });
});
