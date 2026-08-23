import { expect, test } from "@playwright/test";

import { expectNoHorizontalOverflow, openQctp, putStore } from "./support";

const baseTime = Date.parse("2026-08-23T12:00:00.000Z");
const atMinute = (minute: number) =>
  new Date(baseTime + minute * 60_000).toISOString();
type PrerequisiteStateId = "Q1" | "Q3" | "Q4";

function evidenceSession(input: {
  readonly id: string;
  readonly stateId: PrerequisiteStateId;
  readonly startMinute: number;
  readonly endMinute: number;
  readonly markerIds: readonly [string, string];
  readonly continuousTargetStateSeconds: number;
}) {
  const endedAt = atMinute(input.endMinute);
  return {
    schemaVersion: 1,
    id: input.id,
    stateId: input.stateId,
    endedAt,
    guidanceTier: "Coach",
    context: "seated_morning",
    timeContext: "morning",
    mechanicsUnderstood: true,
    mechanicsCorrect: true,
    safetyStopOccurred: false,
    safeAndOriented: true,
    markerScores: Object.fromEntries(
      input.markerIds.map((markerId) => [markerId, 2]),
    ),
    alertness: 3,
    effort: 1,
    fearAnxiety: 0,
    physicalComfort: 3,
    memoryContinuity: 3,
    guidanceDependence: 2,
    airHunger: 0,
    recoveryTimeAfterDistractionSeconds: 5,
    elapsedSessionSeconds: (input.endMinute - input.startMinute) * 60,
    continuousTargetStateSeconds: input.continuousTargetStateSeconds,
    completedTimer: true,
    soleEvidenceWasUnusualSensation: false,
    primaryFailureMode: "capture",
    correctionUsed: "return_to_anchor",
    functionalTaskAttempted: null,
    functionalTaskCompleted: false,
    retainedStateDuringTask: false,
    rawObservation: {
      text: "Evidence-backed browser prerequisite fixture.",
      recordedAt: endedAt,
    },
    interpretation: null,
    outcomeFeedback: null,
    returnedSafely: true,
    orientedAfterReturn: true,
    blinded: false,
    feedbackScored: false,
    coherentEpisodeRecord: false,
    stableEnoughForUse: false,
    sessionRevision: `${input.stateId}-REV0`,
    startedAt: atMinute(input.startMinute),
    posture: "seated",
    breathMethod: null,
    capabilityBefore: null,
    capabilityAfter: "Introduced",
    nextPermittedSessionIds: [`${input.stateId}-TEACH`],
    saveStatus: "saved",
    updatedAt: endedAt,
  };
}

const prerequisiteSessions = [
  evidenceSession({
    id: "e2e-Q1-access",
    stateId: "Q1",
    startMinute: 0,
    endMinute: 10,
    markerIds: ["quiet_breathing", "reduced_jaw_shoulder_effort"],
    continuousTargetStateSeconds: 180,
  }),
  evidenceSession({
    id: "e2e-Q3-stable-1",
    stateId: "Q3",
    startMinute: 12,
    endMinute: 22,
    markerIds: ["capture_recognized", "return_without_argument"],
    continuousTargetStateSeconds: 600,
  }),
  evidenceSession({
    id: "e2e-Q3-stable-2",
    stateId: "Q3",
    startMinute: 23,
    endMinute: 33,
    markerIds: ["capture_recognized", "return_without_argument"],
    continuousTargetStateSeconds: 600,
  }),
  evidenceSession({
    id: "e2e-Q3-stable-3",
    stateId: "Q3",
    startMinute: 34,
    endMinute: 44,
    markerIds: ["capture_recognized", "return_without_argument"],
    continuousTargetStateSeconds: 600,
  }),
  evidenceSession({
    id: "e2e-Q4-access",
    stateId: "Q4",
    startMinute: 46,
    endMinute: 56,
    markerIds: ["broad_field", "events_included"],
    continuousTargetStateSeconds: 300,
  }),
];

const prerequisiteCapabilities = [
  {
    schemaVersion: 1,
    id: "state-capability-Q1",
    stateId: "Q1",
    level: "Accessed",
    achievedAt: atMinute(11),
    evidenceAttemptIds: ["e2e-Q1-access"],
    transitions: [
      {
        from: null,
        to: "Introduced",
        achievedAt: atMinute(10),
        evidenceAttemptIds: ["e2e-Q1-access"],
      },
      {
        from: "Introduced",
        to: "Accessed",
        achievedAt: atMinute(11),
        evidenceAttemptIds: ["e2e-Q1-access"],
      },
    ],
    updatedAt: atMinute(11),
  },
  {
    schemaVersion: 1,
    id: "state-capability-Q3",
    stateId: "Q3",
    level: "Stabilized",
    achievedAt: atMinute(45),
    evidenceAttemptIds: [
      "e2e-Q3-stable-1",
      "e2e-Q3-stable-2",
      "e2e-Q3-stable-3",
    ],
    transitions: [
      {
        from: null,
        to: "Introduced",
        achievedAt: atMinute(22),
        evidenceAttemptIds: ["e2e-Q3-stable-1"],
      },
      {
        from: "Introduced",
        to: "Accessed",
        achievedAt: atMinute(33),
        evidenceAttemptIds: ["e2e-Q3-stable-2"],
      },
      {
        from: "Accessed",
        to: "Stabilized",
        achievedAt: atMinute(45),
        evidenceAttemptIds: [
          "e2e-Q3-stable-1",
          "e2e-Q3-stable-2",
          "e2e-Q3-stable-3",
        ],
      },
    ],
    updatedAt: atMinute(45),
  },
  {
    schemaVersion: 1,
    id: "state-capability-Q4",
    stateId: "Q4",
    level: "Accessed",
    achievedAt: atMinute(57),
    evidenceAttemptIds: ["e2e-Q4-access"],
    transitions: [
      {
        from: null,
        to: "Introduced",
        achievedAt: atMinute(56),
        evidenceAttemptIds: ["e2e-Q4-access"],
      },
      {
        from: "Introduced",
        to: "Accessed",
        achievedAt: atMinute(57),
        evidenceAttemptIds: ["e2e-Q4-access"],
      },
    ],
    updatedAt: atMinute(57),
  },
] as const;

test("held source scopes expose readable requirements without runnable content", async ({
  page,
}) => {
  await openQctp(page, "#/paths");

  const tc02 = page.locator('[data-module-id="TC-02"]');
  await expect(tc02.getByText("Prerequisite hold")).toBeVisible();
  const tc02Hold = tc02.getByRole("region", {
    name: "TC-02 controlled hold",
  });
  await expect(tc02Hold.getByText("Requires Q3 Stabilized.")).toBeVisible();
  await expect(tc02Hold.getByText("Requires Q4 Accessed.")).toBeVisible();
  await expect(tc02.getByRole("button")).toHaveCount(0);

  const tc03 = page.locator('[data-module-id="TC-03"]');
  await expect(tc03.locator(".status-badge")).toHaveText("Authority hold");
  await expect(tc03.getByRole("button")).toHaveCount(0);

  for (const [trackId, label] of [
    ["mossbridge", "Architecture only"],
    ["psionics", "Record only"],
    ["lynne-mctaggart", "Deferred"],
  ] as const) {
    const track = page.locator(`[data-source-track="${trackId}"]`);
    await expect(track).toContainText(label);
    await expect(track.locator('[role="status"]')).toHaveCount(0);
  }

  await page.getByRole("button", { name: "View QR" }).click();
  const qr = page.locator('[data-source-access-id="QR"]');
  await expect(qr).toHaveAttribute(
    "data-source-read-decision",
    "PREREQUISITES_UNMET",
  );
  await expect(qr.getByRole("button", { name: /Start/u })).toHaveCount(0);
  await expect(qr.locator(".instruction-list")).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
});

test("eligible Campbell routes select only their exact State recipe and QR remains read-only", async ({
  page,
}) => {
  await openQctp(page, "#/paths");
  for (const session of prerequisiteSessions) {
    await putStore(page, "stateSessions", session);
  }
  for (const capability of prerequisiteCapabilities) {
    await putStore(page, "stateCapabilities", capability);
  }
  await page.reload();

  const tc02 = page.locator('[data-module-id="TC-02"]');
  await tc02.getByRole("button", { name: "Open TC-PC state recipe" }).click();
  const tcPc = page.locator('[data-source-access-id="TC-PC"]');
  await expect(tcPc).toHaveAttribute("data-source-read-decision", "ALLOWED");
  await expect(tcPc).toHaveAttribute("data-source-start-decision", "ALLOWED");
  await expect(
    tcPc.getByRole("heading", { name: /TC-PC — Point Consciousness/u }),
  ).toBeVisible();
  await expect(
    tcPc.getByRole("button", { name: "Start controlled attempt" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "View QR" }).click();
  const qr = page.locator('[data-source-access-id="QR"]');
  await expect(qr).toHaveAttribute("data-source-read-decision", "ALLOWED");
  await expect(qr).toHaveAttribute(
    "data-source-start-decision",
    "ACTION_NOT_PERMITTED",
  );
  await expect(
    qr.getByRole("heading", { name: "Controlled protocol start unavailable" }),
  ).toBeVisible();
  await expect(qr.getByRole("button", { name: /Start/u })).toHaveCount(0);
  await expect(qr.locator("select")).toHaveCount(0);
  await expectNoHorizontalOverflow(page);
});
