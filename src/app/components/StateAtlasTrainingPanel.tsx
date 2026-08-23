import { useMemo, useState } from "react";

import {
  capabilitySnapshotsFromRecords,
  evaluateCapabilityProgression,
  evaluatePrerequisites,
  getStateDefinition,
  getStatePracticeRecipe,
  recipeDurationSeconds,
  recommendedGuidanceTier,
  StateAtlasProgress,
  TRAINING_PROCESS_PHASES,
  type StateCapabilityRecord,
  type StateId,
  type StateSessionRecord,
} from "../../state-atlas";
import { useQctp } from "../qctp-context";

const coreStateIds: readonly StateId[] = [
  "Q0",
  "Q1",
  "Q2",
  "Q3",
  "Q4",
  "Q5",
  "TC-PC",
  "M-F10",
  "M-F12",
  "QR",
  "QO",
  "QI",
];

const ratingFields = [
  ["alertness", "Alertness", "0 none / 4 very clear"],
  ["effort", "Effort", "0 effortless / 4 forced"],
  ["fearAnxiety", "Fear or anxiety", "0 none / 4 severe"],
  [
    "physicalComfort",
    "Physical comfort",
    "0 severe discomfort / 4 comfortable",
  ],
  ["memoryContinuity", "Memory continuity", "0 absent / 4 complete"],
  ["guidanceDependence", "Guidance dependence", "0 none / 4 fully dependent"],
  ["airHunger", "Air hunger", "0 none / 4 severe"],
] as const;

type RatingKey = (typeof ratingFields)[number][0];

function emptyRatings(): Record<RatingKey, number | null> {
  return Object.fromEntries(ratingFields.map(([key]) => [key, null])) as Record<
    RatingKey,
    number | null
  >;
}

export function StateAtlasTrainingPanel() {
  const runtime = useQctp();
  const snapshots = useMemo(
    () => capabilitySnapshotsFromRecords(runtime.stateCapabilities),
    [runtime.stateCapabilities],
  );
  const [stateId, setStateId] = useState<StateId>("Q1");
  const definition = getStateDefinition(stateId);
  const recipe = getStatePracticeRecipe(stateId);
  const currentCapability =
    runtime.stateCapabilities.find((record) => record.stateId === stateId) ??
    null;
  const prerequisite = evaluatePrerequisites(stateId, snapshots);
  const guidance = recommendedGuidanceTier(currentCapability?.level ?? null);
  const [startedAt, setStartedAt] = useState<string | null>(null);
  const [markerScores, setMarkerScores] = useState<Record<string, number>>({});
  const [mechanicsUnderstood, setMechanicsUnderstood] = useState(false);
  const [mechanicsCorrect, setMechanicsCorrect] = useState(false);
  const [safetyStop, setSafetyStop] = useState(false);
  const [safeAndOriented, setSafeAndOriented] = useState(false);
  const [returnedSafely, setReturnedSafely] = useState(false);
  const [ratings, setRatings] = useState(emptyRatings);
  const [continuousSeconds, setContinuousSeconds] = useState(0);
  const [completedTimer, setCompletedTimer] = useState(false);
  const [soleUnusualSensation, setSoleUnusualSensation] = useState(false);
  const [recoverySeconds, setRecoverySeconds] = useState<string>("");
  const [rawObservation, setRawObservation] = useState("");
  const [interpretation, setInterpretation] = useState("");
  const [failureMode, setFailureMode] = useState("");
  const [correction, setCorrection] = useState("");
  const [functionalTask, setFunctionalTask] = useState("");
  const [functionalComplete, setFunctionalComplete] = useState(false);
  const [retainedDuringTask, setRetainedDuringTask] = useState(false);
  const [blinded, setBlinded] = useState(false);
  const [feedbackScored, setFeedbackScored] = useState(false);
  const [outcomeFeedback, setOutcomeFeedback] = useState("");
  const [coherentEpisode, setCoherentEpisode] = useState(false);
  const [stableEnoughForUse, setStableEnoughForUse] = useState(false);
  const [context, setContext] = useState(definition.permittedContexts[0]!);
  const [message, setMessage] = useState("");

  const resetEvidence = () => {
    setMarkerScores({});
    setMechanicsUnderstood(false);
    setMechanicsCorrect(false);
    setSafetyStop(false);
    setSafeAndOriented(false);
    setReturnedSafely(false);
    setRatings(emptyRatings());
    setContinuousSeconds(0);
    setCompletedTimer(false);
    setSoleUnusualSensation(false);
    setRecoverySeconds("");
    setRawObservation("");
    setInterpretation("");
    setFailureMode("");
    setCorrection("");
    setFunctionalTask("");
    setFunctionalComplete(false);
    setRetainedDuringTask(false);
    setBlinded(false);
    setFeedbackScored(false);
    setOutcomeFeedback("");
    setCoherentEpisode(false);
    setStableEnoughForUse(false);
  };

  const selectState = (next: StateId) => {
    if (startedAt) return;
    const nextDefinition = getStateDefinition(next);
    setStateId(next);
    setContext(nextDefinition.permittedContexts[0]!);
    resetEvidence();
    setMessage("");
  };

  const start = () => {
    if (!prerequisite.eligible) return;
    resetEvidence();
    setStartedAt(new Date().toISOString());
    setMessage(
      "Attempt started. Follow the controlled recipe; its timing is a container, never proof of state attainment.",
    );
  };

  const save = async () => {
    if (!startedAt) return;
    if (!rawObservation.trim()) {
      setMessage(
        "A raw observation is required before this attempt can be saved.",
      );
      return;
    }
    if (interpretation.trim() && !rawObservation.trim()) {
      setMessage("Interpretation cannot precede raw observation.");
      return;
    }
    const missingRatings = ratingFields
      .filter(([key]) => ratings[key] === null)
      .map(([, label]) => label);
    if (missingRatings.length > 0) {
      setMessage(
        `Rate the observed session before saving: ${missingRatings.join(", ")}.`,
      );
      return;
    }
    if (feedbackScored && !outcomeFeedback.trim()) {
      setMessage(
        "Scored feedback requires the actual outcome or scoring record.",
      );
      return;
    }
    if (functionalComplete && !functionalTask.trim()) {
      setMessage("Name the functional task before marking it complete.");
      return;
    }
    const endedAt = new Date().toISOString();
    const attemptId = `state-session-${crypto.randomUUID()}`;
    const baseAttempt = {
      id: attemptId,
      stateId,
      endedAt,
      guidanceTier: guidance,
      context,
      timeContext:
        new Date().getHours() < 12
          ? "morning"
          : new Date().getHours() < 18
            ? "day"
            : "evening",
      mechanicsUnderstood,
      mechanicsCorrect,
      safetyStopOccurred: safetyStop,
      safeAndOriented,
      markerScores,
      alertness: ratings.alertness!,
      effort: ratings.effort!,
      fearAnxiety: ratings.fearAnxiety!,
      physicalComfort: ratings.physicalComfort!,
      memoryContinuity: ratings.memoryContinuity!,
      guidanceDependence: ratings.guidanceDependence!,
      airHunger: ratings.airHunger!,
      recoveryTimeAfterDistractionSeconds: recoverySeconds
        ? Number(recoverySeconds)
        : null,
      elapsedSessionSeconds: Math.max(
        0,
        Math.floor((Date.parse(endedAt) - Date.parse(startedAt)) / 1_000),
      ),
      continuousTargetStateSeconds: continuousSeconds,
      completedTimer,
      soleEvidenceWasUnusualSensation: soleUnusualSensation,
      primaryFailureMode: failureMode.trim() || null,
      correctionUsed: correction.trim() || null,
      functionalTaskAttempted: functionalTask.trim() || null,
      functionalTaskCompleted: functionalComplete,
      retainedStateDuringTask: retainedDuringTask,
      rawObservation: { text: rawObservation.trim(), recordedAt: endedAt },
      interpretation: interpretation.trim()
        ? { text: interpretation.trim(), recordedAt: endedAt }
        : null,
      outcomeFeedback: outcomeFeedback.trim() || null,
      returnedSafely,
      orientedAfterReturn: safeAndOriented,
      blinded,
      feedbackScored,
      coherentEpisodeRecord: coherentEpisode,
      stableEnoughForUse,
    } as const;
    const progression = evaluateCapabilityProgression({
      stateId,
      currentLevel: currentCapability?.level ?? null,
      attempts: [...runtime.stateSessions, baseAttempt],
      capabilities: snapshots,
    });
    const session: StateSessionRecord = {
      schemaVersion: 1,
      ...baseAttempt,
      sessionRevision: `${stateId}-REV0`,
      startedAt,
      posture: "safe supported posture",
      breathMethod: null,
      capabilityBefore: currentCapability?.level ?? null,
      capabilityAfter: progression.advanced
        ? progression.recommendedLevel
        : (currentCapability?.level ?? null),
      nextPermittedSessionIds: [
        `${stateId}-${recommendedGuidanceTier(
          progression.advanced
            ? progression.recommendedLevel
            : (currentCapability?.level ?? null),
        ).toUpperCase()}`,
      ],
      saveStatus: "saved",
      updatedAt: endedAt,
    };
    await runtime.saveStateSession(session);
    if (progression.advanced && progression.recommendedLevel) {
      const transition = {
        from: currentCapability?.level ?? null,
        to: progression.recommendedLevel,
        achievedAt: endedAt,
        evidenceAttemptIds: progression.gate.evidenceAttemptIds,
      };
      const capability: StateCapabilityRecord = {
        schemaVersion: 1,
        id: currentCapability?.id ?? `state-capability-${stateId}`,
        stateId,
        level: progression.recommendedLevel,
        achievedAt: endedAt,
        evidenceAttemptIds: progression.gate.evidenceAttemptIds,
        transitions: [...(currentCapability?.transitions ?? []), transition],
        updatedAt: endedAt,
      };
      await runtime.saveStateCapability(capability);
    }
    setStartedAt(null);
    resetEvidence();
    setMessage(
      progression.advanced
        ? `Evidence saved. Controlled capability advanced to ${progression.recommendedLevel}.`
        : `Evidence saved without capability advancement: ${progression.gate.unmet.join(" ") || "current level retained."}`,
    );
  };

  return (
    <section className="panel-card state-training-panel">
      <StateAtlasProgress
        capabilities={snapshots}
        stateIds={coreStateIds}
        activeStateId={stateId}
        onStateSelect={selectState}
      />
      <article className="state-training-detail">
        <p className="eyebrow">Controlled attempt · {guidance} guidance</p>
        <h3>
          {stateId} — {definition.title}
        </h3>
        <p className="state-source-label">{definition.sourceLabel}</p>
        <p className="notice-inline">
          This is a controlled practice target, not a promise that a named state
          will occur. Follow the procedure and report presence, absence, or
          uncertainty. Elapsed time never proves attainment.
        </p>
        <details className="state-recipe" open={!startedAt}>
          <summary>
            Controlled recipe · about{" "}
            {Math.ceil(recipeDurationSeconds(recipe) / 60)} minutes
          </summary>
          <ol>
            {recipe.steps.map((step, index) => (
              <li key={`${step.phase}-${index}`}>
                <strong>
                  {step.phase} · {Math.ceil(step.durationSeconds / 60)} min
                </strong>
                <p>{step.instruction}</p>
                <small>Advance when: {step.completionCue}</small>
              </li>
            ))}
          </ol>
          <h4>Stop conditions</h4>
          <ul>
            {recipe.stopConditions.map((condition) => (
              <li key={condition}>{condition}</li>
            ))}
          </ul>
        </details>
        <div className="training-process-rail" aria-label="Training process">
          {TRAINING_PROCESS_PHASES.map((phase) => (
            <span key={phase}>{phase}</span>
          ))}
        </div>
        {!prerequisite.eligible ? (
          <div className="notice-inline">
            {prerequisite.unmet.map((hold) => (
              <p key={hold}>{hold}</p>
            ))}
          </div>
        ) : null}
        <label className="compact-field">
          Permitted context
          <select
            value={context}
            disabled={Boolean(startedAt)}
            onChange={(event) => setContext(event.target.value)}
          >
            {definition.permittedContexts.map((candidate) => (
              <option value={candidate} key={candidate}>
                {candidate.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </label>
        {startedAt ? (
          <>
            <fieldset className="state-checks">
              <legend>Mechanics and safety</legend>
              <label>
                <input
                  type="checkbox"
                  checked={mechanicsUnderstood}
                  onChange={(event) =>
                    setMechanicsUnderstood(event.target.checked)
                  }
                />
                Mechanics understood
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={mechanicsCorrect}
                  onChange={(event) =>
                    setMechanicsCorrect(event.target.checked)
                  }
                />
                Mechanics performed correctly
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={safetyStop}
                  onChange={(event) => setSafetyStop(event.target.checked)}
                />
                Safety stop occurred
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={safeAndOriented}
                  onChange={(event) => setSafeAndOriented(event.target.checked)}
                />
                Safe and oriented now
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={returnedSafely}
                  onChange={(event) => setReturnedSafely(event.target.checked)}
                />
                Full return completed
              </label>
            </fieldset>
            <fieldset className="state-marker-grid">
              <legend>Raw target markers · 0 absent / 4 clear</legend>
              {definition.targetMarkers.map((marker) => (
                <label key={marker.id}>
                  <span>{marker.label}</span>
                  <input
                    type="range"
                    min="0"
                    max="4"
                    value={markerScores[marker.id] ?? 0}
                    onChange={(event) =>
                      setMarkerScores((current) => ({
                        ...current,
                        [marker.id]: Number(event.target.value),
                      }))
                    }
                  />
                  <output>{markerScores[marker.id] ?? 0}</output>
                </label>
              ))}
            </fieldset>
            <fieldset className="state-rating-grid">
              <legend>Observed session ratings · required</legend>
              {ratingFields.map(([key, label, scale]) => (
                <label key={key}>
                  <span>{label}</span>
                  <select
                    aria-label={label}
                    value={ratings[key] ?? ""}
                    onChange={(event) =>
                      setRatings((current) => ({
                        ...current,
                        [key]:
                          event.target.value === ""
                            ? null
                            : Number(event.target.value),
                      }))
                    }
                  >
                    <option value="">Not rated</option>
                    {[0, 1, 2, 3, 4].map((score) => (
                      <option key={score} value={score}>
                        {score}
                      </option>
                    ))}
                  </select>
                  <small>{scale}</small>
                </label>
              ))}
              <label>
                <span>Recovery after distraction (seconds, optional)</span>
                <input
                  aria-label="Recovery after distraction seconds"
                  type="number"
                  min="0"
                  step="1"
                  value={recoverySeconds}
                  onChange={(event) => setRecoverySeconds(event.target.value)}
                />
              </label>
            </fieldset>
            <label className="form-field">
              Continuous target-state seconds observed
              <input
                type="number"
                min="0"
                value={continuousSeconds}
                onChange={(event) =>
                  setContinuousSeconds(Number(event.target.value))
                }
              />
              <small>
                Time is supporting evidence only; it cannot pass the gate by
                itself.
              </small>
            </label>
            <fieldset className="state-checks">
              <legend>Timing and evidence limits</legend>
              <label>
                <input
                  type="checkbox"
                  checked={completedTimer}
                  onChange={(event) => setCompletedTimer(event.target.checked)}
                />
                Completed the suggested timing container (not state proof)
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={soleUnusualSensation}
                  onChange={(event) =>
                    setSoleUnusualSensation(event.target.checked)
                  }
                />
                The only evidence was one unusual sensation
              </label>
            </fieldset>
            <label className="form-field">
              Raw observation
              <textarea
                value={rawObservation}
                onChange={(event) => setRawObservation(event.target.value)}
              />
            </label>
            <label className="form-field">
              Later interpretation
              <textarea
                value={interpretation}
                onChange={(event) => setInterpretation(event.target.value)}
              />
            </label>
            <div className="platform-form-grid">
              <label className="form-field">
                Primary failure mode
                <input
                  value={failureMode}
                  onChange={(event) => setFailureMode(event.target.value)}
                />
              </label>
              <label className="form-field">
                Correction used
                <input
                  value={correction}
                  onChange={(event) => setCorrection(event.target.value)}
                />
              </label>
              <label className="form-field">
                Functional task attempted
                <input
                  value={functionalTask}
                  onChange={(event) => setFunctionalTask(event.target.value)}
                />
              </label>
            </div>
            <fieldset className="state-checks">
              <legend>Functional controls</legend>
              {[
                ["Task completed", functionalComplete, setFunctionalComplete],
                [
                  "State retained during task",
                  retainedDuringTask,
                  setRetainedDuringTask,
                ],
                ["Target was blinded", blinded, setBlinded],
                ["Feedback was scored", feedbackScored, setFeedbackScored],
                [
                  "Coherent episode recorded",
                  coherentEpisode,
                  setCoherentEpisode,
                ],
                [
                  "Stable enough for use",
                  stableEnoughForUse,
                  setStableEnoughForUse,
                ],
              ].map(([label, checked, setter]) => (
                <label key={String(label)}>
                  <input
                    type="checkbox"
                    checked={Boolean(checked)}
                    onChange={(event) =>
                      (setter as (next: boolean) => void)(event.target.checked)
                    }
                  />
                  {String(label)}
                </label>
              ))}
            </fieldset>
            <label className="form-field">
              Outcome or scoring feedback
              <textarea
                value={outcomeFeedback}
                required={feedbackScored}
                aria-describedby="state-outcome-help"
                onChange={(event) => setOutcomeFeedback(event.target.value)}
              />
              <small id="state-outcome-help">
                Required whenever “Feedback was scored” is checked. Preserve the
                revealed target, rubric, score, correspondences, and misses; do
                not rewrite the raw observation.
              </small>
            </label>
            <button
              className="primary-button"
              type="button"
              onClick={() => void save()}
            >
              Save evidence and evaluate gate
            </button>
          </>
        ) : (
          <button
            className="primary-button"
            type="button"
            disabled={!prerequisite.eligible}
            onClick={start}
          >
            Start controlled attempt
          </button>
        )}
        {message ? <p className="save-status">{message}</p> : null}
      </article>
    </section>
  );
}
