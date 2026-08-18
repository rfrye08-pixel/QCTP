import { describe, expect, it } from "vitest";

import { createReg01Session } from "../domain";

import {
  REG01_PRECEPT,
  REG01_PROMPT,
  REG01_SESSION_ID,
  REG01_STEPS,
  addReg01Attachment,
  createOrResumeReg01Session,
  setReg01PreceptComplete,
  setReg01Step,
  setReg01Text,
} from "./reg01";

const now = "2026-08-17T12:00:00.000Z";

describe("REG-01 controlled session updates", () => {
  it("exposes only the nine controlled steps and exact prompt/precept", () => {
    expect(REG01_STEPS).toHaveLength(9);
    expect(REG01_STEPS[0]).toContain("three coherence breaths");
    expect(REG01_STEPS[8]).toContain("photograph the construction");
    expect(REG01_PROMPT).toBe(
      "What did the act of constructing reveal that looking at a finished image would not have revealed?",
    );
    expect(REG01_PRECEPT).toBe("Observe before interpreting.");
  });

  it("resumes the stable MVP session and preserves evidence layers independently", () => {
    let session = createOrResumeReg01Session(undefined, now);
    expect(session.id).toBe(REG01_SESSION_ID);

    session = setReg01Step(session, 0, true, now);
    session = setReg01Text(
      session,
      "rawObservation",
      "The shared chord is vertical.",
      now,
    );
    session = setReg01Text(
      session,
      "interpretation",
      "This may suggest balance.",
      now,
    );
    session = setReg01Text(
      session,
      "autoDictation",
      "Construction exposed my tendency to hurry.",
      now,
      ["recording-1", "voice-record:recording-1"],
    );

    expect(session.status).toBe("in_progress");
    expect(session.rawObservation?.evidenceClass).toBe("observed");
    expect(session.rawObservation?.text).toBe("The shared chord is vertical.");
    expect(session.interpretation?.text).toBe("This may suggest balance.");
    expect(session.interpretation?.basedOnEvidenceIds).toEqual([
      `${REG01_SESSION_ID}:raw-observation`,
    ]);
    expect(session.autoDictation?.sourceIds).toEqual([
      "recording-1",
      "voice-record:recording-1",
    ]);
  });

  it("updates gates without duplicating preserved attachment identifiers", () => {
    let session = createReg01Session(REG01_SESSION_ID, now);
    session = addReg01Attachment(session, "attachment-1", now);
    session = addReg01Attachment(session, "attachment-1", now);
    session = setReg01PreceptComplete(session, true, now);

    expect(session.attachmentIds).toEqual(["attachment-1"]);
    expect(session.precept.complete).toBe(true);
  });
});
