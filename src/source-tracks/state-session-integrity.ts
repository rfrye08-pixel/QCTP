import {
  StateCapabilityRecordSchema,
  StateSessionRecordSchema,
  StateSourceTrackHoldSchema,
  type StateCapabilityRecord,
  type StateSessionRecord,
  type StateSourceTrackHold,
} from "../state-atlas/types";
import {
  SourceTrackReferenceSchema,
  evaluateSourceTrackAccess,
  getStateSourceTrackRoute,
  sourceTrackReferenceFor,
  type SourceTrackAction,
  type SourceTrackReference,
} from "./registry";

export type StateSessionSourceTrackDecisionCode =
  "NOT_APPLICABLE" | "ALLOWED" | StateSourceTrackHold["code"];

export interface StateSessionSourceTrackDecision {
  readonly allowed: boolean;
  readonly code: StateSessionSourceTrackDecisionCode;
  readonly message: string;
  readonly trackId: string | null;
  readonly accessId: string | null;
  readonly reference: SourceTrackReference | null;
}

export class StateSourceTrackIntegrityError extends Error {
  readonly code: StateSourceTrackHold["code"];

  constructor(hold: StateSourceTrackHold) {
    super(`${hold.code}: ${hold.message} No data changed.`);
    this.name = "StateSourceTrackIntegrityError";
    this.code = hold.code;
  }
}

function denied(
  code: StateSourceTrackHold["code"],
  message: string,
  trackId: string | null,
  accessId: string | null,
): StateSessionSourceTrackDecision {
  return {
    allowed: false,
    code,
    message,
    trackId,
    accessId,
    reference: null,
  };
}

function capabilitySnapshotsAt(
  capabilities: readonly StateCapabilityRecord[],
  startedAt: string,
) {
  const sessionStart = Date.parse(startedAt);
  return capabilities.flatMap((capability) => {
    const available = capability.transitions
      .filter((transition) => Date.parse(transition.achievedAt) < sessionStart)
      .sort(
        (left, right) =>
          Date.parse(left.achievedAt) - Date.parse(right.achievedAt),
      )
      .at(-1);
    return available
      ? [{ stateId: capability.stateId, level: available.to }]
      : [];
  });
}

export function evaluateStateSessionSourceTrackIntegrity(input: {
  readonly session: StateSessionRecord;
  readonly capabilities: readonly StateCapabilityRecord[];
  readonly action?: Extract<SourceTrackAction, "save" | "complete">;
}): StateSessionSourceTrackDecision {
  const session = StateSessionRecordSchema.parse(input.session);
  const capabilities = StateCapabilityRecordSchema.array()
    .parse(input.capabilities)
    .filter((capability) => !capability.sourceTrackHold);
  const route = getStateSourceTrackRoute(session.stateId);
  if (!route) {
    return session.sourceTrackRef === undefined
      ? {
          allowed: true,
          code: "NOT_APPLICABLE",
          message: "This State Atlas session has no source-track route.",
          trackId: null,
          accessId: null,
          reference: null,
        }
      : denied(
          "SOURCE_TRACK_UNEXPECTED_BINDING",
          `State ${session.stateId} does not accept a source-track binding.`,
          null,
          null,
        );
  }
  if (session.sourceTrackRef === undefined) {
    return denied(
      "SOURCE_TRACK_BINDING_REQUIRED",
      `State ${session.stateId} requires the exact ${route.trackId}.${route.accessId} source-track binding.`,
      route.trackId,
      route.accessId,
    );
  }
  const parsedReference = SourceTrackReferenceSchema.safeParse(
    session.sourceTrackRef,
  );
  if (!parsedReference.success) {
    return denied(
      "SOURCE_TRACK_BINDING_INVALID",
      `State ${session.stateId} carries an invalid source-track reference.`,
      route.trackId,
      route.accessId,
    );
  }
  const reference = parsedReference.data;
  if (
    reference.trackId !== route.trackId ||
    reference.accessId !== route.accessId
  ) {
    return denied(
      "SOURCE_TRACK_ROUTE_MISMATCH",
      `State ${session.stateId} must bind to ${route.trackId}.${route.accessId}, not ${reference.trackId}.${reference.accessId}.`,
      route.trackId,
      route.accessId,
    );
  }
  const canonicalReference = sourceTrackReferenceFor(
    route.trackId,
    route.accessId,
  );
  if (
    !session.contentRef ||
    !reference.contentRefs.some(
      (contentRef) =>
        contentRef.authorityKey === session.contentRef?.authorityKey &&
        contentRef.contentClass === session.contentRef.contentClass,
    )
  ) {
    return denied(
      "SOURCE_TRACK_PARENT_MISMATCH",
      `State ${session.stateId} does not carry the registered controlled parent for ${route.trackId}.${route.accessId}.`,
      route.trackId,
      route.accessId,
    );
  }
  const access = evaluateSourceTrackAccess({
    ...route,
    destination: "paths",
    action: input.action ?? "save",
    capabilities: capabilitySnapshotsAt(capabilities, session.startedAt),
  });
  if (!access.allowed) {
    return denied(
      "SOURCE_TRACK_ACCESS_DENIED",
      `${access.code}: ${access.message}`,
      route.trackId,
      route.accessId,
    );
  }
  return {
    allowed: true,
    code: "ALLOWED",
    message: `${route.trackId}.${route.accessId} passed the repository source-track gate.`,
    trackId: route.trackId,
    accessId: route.accessId,
    reference: canonicalReference,
  };
}

function normalizedSessionFromDecision(
  session: StateSessionRecord,
  decision: StateSessionSourceTrackDecision,
): StateSessionRecord {
  if (!decision.allowed || !decision.reference) return session;
  return StateSessionRecordSchema.parse({
    ...session,
    sourceTrackRef: decision.reference,
  });
}

function holdFromDecision(
  session: StateSessionRecord,
  decision: StateSessionSourceTrackDecision,
): StateSourceTrackHold | null {
  if (decision.allowed) return null;
  return StateSourceTrackHoldSchema.parse({
    status: "HELD",
    code: decision.code,
    stateId: session.stateId,
    trackId: decision.trackId,
    accessId: decision.accessId,
    message: decision.message,
  });
}

function withoutSessionHold(session: StateSessionRecord): StateSessionRecord {
  const next = { ...session };
  delete next.sourceTrackHold;
  return StateSessionRecordSchema.parse(next);
}

function withoutCapabilityHold(
  capability: StateCapabilityRecord,
): StateCapabilityRecord {
  const next = { ...capability };
  delete next.sourceTrackHold;
  return StateCapabilityRecordSchema.parse(next);
}

function capabilityEvidenceIds(capability: StateCapabilityRecord): string[] {
  return [
    ...new Set([
      ...capability.evidenceAttemptIds,
      ...capability.transitions.flatMap(
        (transition) => transition.evidenceAttemptIds,
      ),
    ]),
  ];
}

export interface StateSourceTrackIntegrityLedger {
  readonly sessions: StateSessionRecord[];
  readonly capabilities: StateCapabilityRecord[];
  readonly activeSessions: StateSessionRecord[];
  readonly activeCapabilities: StateCapabilityRecord[];
  readonly heldSessionIds: string[];
  readonly heldCapabilityIds: string[];
}

export function applyStateSourceTrackIntegrityLedger(input: {
  readonly sessions: readonly StateSessionRecord[];
  readonly capabilities: readonly StateCapabilityRecord[];
}): StateSourceTrackIntegrityLedger {
  const baseSessions = StateSessionRecordSchema.array()
    .parse(input.sessions)
    .map(withoutSessionHold);
  const baseCapabilities = StateCapabilityRecordSchema.array()
    .parse(input.capabilities)
    .map(withoutCapabilityHold);
  const sessionsById = new Map(
    baseSessions.map((session) => [session.id, session] as const),
  );
  let activeCapabilityIds = new Set<string>();

  for (let pass = 0; pass <= baseCapabilities.length; pass += 1) {
    const activeCapabilities = baseCapabilities.filter((capability) =>
      activeCapabilityIds.has(capability.id),
    );
    const nextActiveIds = new Set(activeCapabilityIds);
    for (const capability of baseCapabilities) {
      if (activeCapabilityIds.has(capability.id)) continue;
      const evidenceAllowed = capabilityEvidenceIds(capability).every(
        (evidenceId) => {
          const session = sessionsById.get(evidenceId);
          return (
            session?.stateId === capability.stateId &&
            evaluateStateSessionSourceTrackIntegrity({
              session,
              capabilities: activeCapabilities,
              action: "complete",
            }).allowed
          );
        },
      );
      if (evidenceAllowed) nextActiveIds.add(capability.id);
    }
    const stable =
      nextActiveIds.size === activeCapabilityIds.size &&
      [...nextActiveIds].every((id) => activeCapabilityIds.has(id));
    activeCapabilityIds = nextActiveIds;
    if (stable) break;
  }

  const activeCapabilities = baseCapabilities.filter((capability) =>
    activeCapabilityIds.has(capability.id),
  );
  const sessions = baseSessions.map((session) => {
    const decision = evaluateStateSessionSourceTrackIntegrity({
      session,
      capabilities: activeCapabilities,
      action: "save",
    });
    const normalizedSession = normalizedSessionFromDecision(session, decision);
    const hold = holdFromDecision(session, decision);
    return StateSessionRecordSchema.parse(
      hold
        ? { ...normalizedSession, sourceTrackHold: hold }
        : normalizedSession,
    );
  });
  const heldSessionIds = new Set(
    sessions.flatMap((session) =>
      session.sourceTrackHold ? [session.id] : [],
    ),
  );
  const capabilities = baseCapabilities.map((capability) => {
    if (activeCapabilityIds.has(capability.id)) return capability;
    const evidenceIds = capabilityEvidenceIds(capability);
    const heldEvidenceIds = evidenceIds.filter(
      (evidenceId) =>
        heldSessionIds.has(evidenceId) || !sessionsById.has(evidenceId),
    );
    const hold = StateSourceTrackHoldSchema.parse({
      status: "HELD",
      code: "SOURCE_TRACK_EVIDENCE_HELD",
      stateId: capability.stateId,
      trackId: getStateSourceTrackRoute(capability.stateId)?.trackId ?? null,
      accessId: getStateSourceTrackRoute(capability.stateId)?.accessId ?? null,
      message: `Capability ${capability.id} cannot be active because source-track evidence is held: ${heldEvidenceIds.join(", ") || evidenceIds.join(", ")}.`,
    });
    return StateCapabilityRecordSchema.parse({
      ...capability,
      sourceTrackHold: hold,
    });
  });
  const activeSessionValues = sessions.filter(
    (session) => !session.sourceTrackHold,
  );
  const activeCapabilityValues = capabilities.filter(
    (capability) => !capability.sourceTrackHold,
  );
  return {
    sessions,
    capabilities,
    activeSessions: activeSessionValues,
    activeCapabilities: activeCapabilityValues,
    heldSessionIds: sessions.flatMap((session) =>
      session.sourceTrackHold ? [session.id] : [],
    ),
    heldCapabilityIds: capabilities.flatMap((capability) =>
      capability.sourceTrackHold ? [capability.id] : [],
    ),
  };
}

export function assertStateSessionSourceTrackWritable(input: {
  readonly session: StateSessionRecord;
  readonly capabilities: readonly StateCapabilityRecord[];
}): StateSessionRecord {
  const session = withoutSessionHold(
    StateSessionRecordSchema.parse(input.session),
  );
  const decision = evaluateStateSessionSourceTrackIntegrity({
    session,
    capabilities: input.capabilities,
    action: "save",
  });
  const hold = holdFromDecision(session, decision);
  if (hold) throw new StateSourceTrackIntegrityError(hold);
  return normalizedSessionFromDecision(session, decision);
}
