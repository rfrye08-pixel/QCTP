import { useMemo, useState } from "react";

import { contentRefFor } from "../../controlled-content";
import { CodexRecordSchema } from "../../domain";
import {
  evaluateSourceTrackAccess,
  getCampbellExercise,
  sourceTrackReferenceFor,
  SOURCE_TRACK_LIFECYCLE_DETAILS,
  THOMAS_CAMPBELL_MODULES,
  type SourceTrackAccessDecision,
  type SourceExerciseField,
} from "../../source-tracks";
import type { StateId } from "../../state-atlas";
import { FieldDictation } from "./FieldDictation";
import { ContentClassBadge } from "./ContentClassBadge";
import { useQctp } from "../qctp-context";

const CAMPBELL_TRACK_ID = "thomas-campbell" as const;

const stateRecipeByModule = {
  "TC-02": "TC-PC",
  "TC-06": "QI",
} as const satisfies Partial<Record<string, StateId>>;

type CampbellStateRecipeId =
  (typeof stateRecipeByModule)[keyof typeof stateRecipeByModule];

function stateRecipeForModule(moduleId: string): CampbellStateRecipeId | null {
  return (
    stateRecipeByModule[moduleId as keyof typeof stateRecipeByModule] ?? null
  );
}

function holdText(decision: SourceTrackAccessDecision): string {
  return [
    decision.message,
    ...decision.unmetPrerequisites,
    `Next: ${decision.nextAction}`,
  ].join(" ");
}

function CampbellAccessBadge({
  decision,
}: {
  decision: SourceTrackAccessDecision;
}) {
  const lifecycle = decision.accessPoint?.status ?? "BLOCKED";
  const heldForPrerequisite = decision.code === "PREREQUISITES_UNMET";
  const label = decision.allowed
    ? lifecycle === "PREREQUISITE"
      ? "Prerequisites met"
      : "Controlled scope available"
    : heldForPrerequisite
      ? "Prerequisite hold"
      : SOURCE_TRACK_LIFECYCLE_DETAILS[lifecycle].label;
  const style = decision.allowed
    ? "ready"
    : heldForPrerequisite
      ? "in-progress"
      : "reserved";

  return <span className={`status-badge status-${style}`}>{label}</span>;
}

function localId(prefix: string): string {
  const random = globalThis.crypto?.randomUUID?.();
  return `${prefix}-${random ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

function layerText(
  fields: readonly SourceExerciseField[],
  values: Record<string, string>,
  layer: SourceExerciseField["layer"],
): string {
  return fields
    .filter((field) => field.layer === layer && values[field.id]?.trim())
    .map((field) => `${field.label}: ${values[field.id]!.trim()}`)
    .join("\n\n");
}

export function CampbellTrackPanel({
  onOpenStateRecipe,
}: {
  onOpenStateRecipe?: (stateId: CampbellStateRecipeId) => void;
  /** @deprecated Kept temporarily so an older Paths caller cannot reopen Day 1. */
  onOpenPractice?: () => void;
}) {
  const runtime = useQctp();
  const [activeModuleId, setActiveModuleId] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const accessByModule = useMemo(
    () =>
      new Map(
        THOMAS_CAMPBELL_MODULES.map((module) => [
          module.id,
          evaluateSourceTrackAccess({
            trackId: CAMPBELL_TRACK_ID,
            accessId: module.id,
            destination: "paths",
            action: "read",
            capabilities: runtime.stateCapabilities,
          }),
        ]),
      ),
    [runtime.stateCapabilities],
  );
  const activeModule = useMemo(
    () =>
      activeModuleId
        ? (THOMAS_CAMPBELL_MODULES.find(
            (module) => module.id === activeModuleId,
          ) ?? null)
        : null,
    [activeModuleId],
  );
  const activeAccess = activeModule
    ? (accessByModule.get(activeModule.id) ?? null)
    : null;
  const exercise = useMemo(() => {
    if (!activeModule?.exerciseId || !activeAccess?.allowed) return null;
    const candidate = getCampbellExercise(activeModule.exerciseId);
    return candidate?.moduleId === activeModule.id ? candidate : null;
  }, [activeAccess, activeModule]);

  const openExercise = (moduleId: string) => {
    const module = THOMAS_CAMPBELL_MODULES.find(
      (candidate) => candidate.id === moduleId,
    );
    const decision = evaluateSourceTrackAccess({
      trackId: CAMPBELL_TRACK_ID,
      accessId: moduleId,
      destination: "paths",
      action: "read",
      capabilities: runtime.stateCapabilities,
    });
    const candidate = module?.exerciseId
      ? getCampbellExercise(module.exerciseId)
      : null;
    if (!decision.allowed || !module || candidate?.moduleId !== module.id) {
      setActiveModuleId(null);
      setValues({});
      setMessage(
        decision.allowed
          ? "Controlled Campbell exercise mismatch. No content was opened."
          : holdText(decision),
      );
      return;
    }
    setActiveModuleId(module.id);
    setValues({});
    setMessage("");
  };

  const openStateRecipe = (moduleId: string) => {
    const stateId = stateRecipeForModule(moduleId);
    if (!stateId) {
      setMessage("No controlled State Atlas route exists for this module.");
      return;
    }
    const moduleDecision = evaluateSourceTrackAccess({
      trackId: CAMPBELL_TRACK_ID,
      accessId: moduleId,
      destination: "paths",
      action: "read",
      capabilities: runtime.stateCapabilities,
    });
    const recipeDecision = evaluateSourceTrackAccess({
      trackId: CAMPBELL_TRACK_ID,
      accessId: stateId,
      destination: "paths",
      action: "start",
      capabilities: runtime.stateCapabilities,
    });
    if (!moduleDecision.allowed || !recipeDecision.allowed) {
      setMessage(
        holdText(moduleDecision.allowed ? recipeDecision : moduleDecision),
      );
      return;
    }
    if (!onOpenStateRecipe) {
      setMessage(
        `${stateId} passed its authority gate, but this screen has no exact State Atlas handoff. No other practice was opened.`,
      );
      return;
    }
    setMessage("");
    onOpenStateRecipe(stateId);
  };

  const updateField = (fieldId: string, value: string) => {
    setValues((current) => ({ ...current, [fieldId]: value }));
  };

  const appendField = (fieldId: string, text: string) => {
    const current = values[fieldId] ?? "";
    updateField(
      fieldId,
      current.trim() ? `${current.trimEnd()}\n${text}` : text,
    );
  };

  const saveExercise = async () => {
    if (!exercise || !activeModule) {
      setMessage("Controlled Campbell exercise mismatch. No data changed.");
      return;
    }
    const authorizeSave = () =>
      evaluateSourceTrackAccess({
        trackId: CAMPBELL_TRACK_ID,
        accessId: activeModule.id,
        destination: "paths",
        action: "save",
        capabilities: runtime.stateCapabilities,
      });
    const initialDecision = authorizeSave();
    if (!initialDecision.allowed) {
      setMessage(holdText(initialDecision));
      return;
    }
    const rawText = layerText(exercise.fields, values, "raw");
    const interpretationText = layerText(
      exercise.fields,
      values,
      "interpretation",
    );
    if (!rawText) {
      setMessage("Record at least one raw observation before interpretation.");
      return;
    }
    setSaving(true);
    setMessage("");
    try {
      const sourceTrackReference = sourceTrackReferenceFor(
        CAMPBELL_TRACK_ID,
        activeModule.id,
      );
      const exerciseAuthorityKey = `campbell.exercise.${exercise.id}`;
      if (
        sourceTrackReference.accessId !== activeModule.id ||
        !sourceTrackReference.contentRefs.some(
          (reference) => reference.authorityKey === exerciseAuthorityKey,
        )
      ) {
        throw new Error(
          "SOURCE_TRACK_REFERENCE_HOLD: Campbell authority mismatch. No data changed.",
        );
      }
      const now = new Date().toISOString();
      const observationId = localId("tc-observation");
      const record = CodexRecordSchema.parse({
        schemaVersion: 1,
        id: localId("tc-record"),
        kind: "source_note",
        title: `${exercise.moduleId} — ${exercise.title}`,
        createdAt: now,
        updatedAt: now,
        observation: {
          id: observationId,
          text: rawText,
          capturedAt: now,
          evidenceClass: "self_reported",
          provenance: { actor: "user", method: exercise.id },
          sourceIds: ["thomas-campbell-public-source"],
        },
        interpretation: interpretationText
          ? {
              id: localId("tc-interpretation"),
              text: interpretationText,
              authoredAt: now,
              provenance: {
                actor: "user",
                method: `${exercise.id}-later-interpretation`,
              },
              basedOnEvidenceIds: [observationId],
            }
          : null,
        tags: [
          "thomas-campbell",
          exercise.moduleId.toLowerCase(),
          "qctp-original",
        ],
        backlinks: [],
        sourceLinks: [
          {
            id: "thomas-campbell-public-source",
            label: "My Big TOE — public source set",
            sourceType: "url",
            url: "https://www.my-big-toe.com/",
            citation:
              "Source concept only; this record uses an original QCTP exercise.",
            accessedAt: null,
          },
        ],
        attachmentIds: [],
        revisionIds: [],
        pathId: "thomas-campbell",
        sessionId: null,
        contentRef: contentRefFor(exerciseAuthorityKey),
        fields: {
          sourceTrack: "thomas-campbell",
          sourceTrackRef: sourceTrackReference,
          moduleId: exercise.moduleId,
          exerciseId: exercise.id,
          controlledContentAuthorityKey: exerciseAuthorityKey,
          sourceConcept: exercise.sourceConcept,
          structuredFields: values,
          completionGate: exercise.completionGate,
          stateCapabilityCreditGranted: false,
          rawObservationLockedBeforeInterpretation: true,
        },
        deletedAt: null,
      });
      const finalDecision = authorizeSave();
      if (!finalDecision.allowed) {
        setMessage(holdText(finalDecision));
        return;
      }
      await runtime.repository.saveRecord(record);
      await runtime.refresh();
      setValues({});
      setMessage(
        "Saved locally with raw observation and interpretation preserved as separate layers.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="panel-card path-card source-track-panel">
      <div className="card-heading">
        <div>
          <p className="eyebrow">Controlled source track</p>
          <h2>Thomas Campbell</h2>
          <ContentClassBadge
            authorityKey="source.profile.thomas-campbell"
            scope="Campbell source profile"
          />
        </div>
        <span className="counter">05 / 10 MVP exercises</span>
      </div>
      <p>
        Source-specific concepts remain attributed. Every practice here is an
        original QCTP exercise; paid scripts, audio, and course text are not
        reproduced.
      </p>
      <div className="source-module-list" role="list">
        {THOMAS_CAMPBELL_MODULES.map((module) => {
          const decision = accessByModule.get(module.id)!;
          const stateRecipeId = stateRecipeForModule(module.id);
          const requirements =
            decision.accessPoint?.prerequisites.map((group) => group.label) ??
            module.prerequisites;
          return (
            <article key={module.id} role="listitem" data-module-id={module.id}>
              <header>
                <span>{module.id}</span>
                <div>
                  <h3>{module.title}</h3>
                  <small>{module.sourceLabel}</small>
                  <ContentClassBadge
                    authorityKey={`campbell.module.${module.id}`}
                    scope="Source summary"
                  />
                </div>
                <CampbellAccessBadge decision={decision} />
              </header>
              <p>{module.objective}</p>
              <dl>
                <div>
                  <dt>Prerequisites</dt>
                  <dd>
                    {requirements.length ? requirements.join(" ") : "None"}
                  </dd>
                </div>
                <div>
                  <dt>Evidence gate</dt>
                  <dd>{module.capabilityOutput}</dd>
                </div>
              </dl>
              {decision.allowed && module.exerciseId ? (
                <div className="platform-action-row">
                  {stateRecipeId ? (
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => openStateRecipe(module.id)}
                    >
                      Open {stateRecipeId} state recipe
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => openExercise(module.id)}
                  >
                    Open controlled evidence record
                  </button>
                </div>
              ) : (
                <div
                  className="controlled-hold"
                  role="region"
                  aria-label={`${module.id} controlled hold`}
                >
                  <strong>{decision.message}</strong>
                  {decision.unmetPrerequisites.map((requirement) => (
                    <span key={requirement}>{requirement}</span>
                  ))}
                  <span>Next: {decision.nextAction}</span>
                </div>
              )}
            </article>
          );
        })}
      </div>

      {exercise ? (
        <section className="source-exercise" aria-live="polite">
          <p className="eyebrow">{exercise.moduleId} · QCTP original</p>
          <h3>{exercise.title}</h3>
          <ContentClassBadge
            authorityKey={`campbell.exercise.${exercise.id}`}
            scope="QCTP exercise"
          />
          <ol className="instruction-list">
            {exercise.instructions.map((instruction) => (
              <li key={instruction}>{instruction}</li>
            ))}
          </ol>
          {stateRecipeForModule(exercise.moduleId) ? (
            <button
              type="button"
              className="secondary-button"
              onClick={() => openStateRecipe(exercise.moduleId)}
            >
              Open {stateRecipeForModule(exercise.moduleId)} state recipe
            </button>
          ) : null}
          <div className="source-exercise-fields">
            {exercise.fields.map((field) => (
              <div className="form-field" key={field.id}>
                <div className="platform-field-heading">
                  <label htmlFor={`${exercise.id}-${field.id}`}>
                    {field.label}
                    <small>
                      {field.layer === "raw"
                        ? "Raw observation"
                        : "Later interpretation"}
                    </small>
                  </label>
                  <FieldDictation
                    fieldTargetId={`${exercise.id}:${field.id}`}
                    destination="source_note"
                    onAppend={(text) => appendField(field.id, text)}
                  />
                </div>
                {field.input === "number" ? (
                  <input
                    id={`${exercise.id}-${field.id}`}
                    type="number"
                    min="0"
                    max="100"
                    value={values[field.id] ?? ""}
                    onChange={(event) =>
                      updateField(field.id, event.target.value)
                    }
                  />
                ) : (
                  <textarea
                    id={`${exercise.id}-${field.id}`}
                    value={values[field.id] ?? ""}
                    onChange={(event) =>
                      updateField(field.id, event.target.value)
                    }
                  />
                )}
              </div>
            ))}
          </div>
          <div className="source-exercise-gate">
            <strong>Completion gate</strong>
            <p>{exercise.completionGate}</p>
          </div>
          {exercise.safety.map((item) => (
            <p className="notice-inline" key={item}>
              {item}
            </p>
          ))}
          <div className="platform-action-row">
            <button
              className="primary-button"
              type="button"
              disabled={saving}
              onClick={() => void saveExercise()}
            >
              {saving ? "Saving locally…" : "Save controlled record locally"}
            </button>
            <button
              className="secondary-button"
              type="button"
              onClick={() => setActiveModuleId(null)}
            >
              Close exercise
            </button>
          </div>
          {message ? <p className="save-status">{message}</p> : null}
        </section>
      ) : activeModuleId ? (
        <p className="controlled-hold" role="status">
          {activeAccess ? holdText(activeAccess) : "No data changed."}
        </p>
      ) : null}
      {!exercise && !activeModuleId && message ? (
        <p className="save-status" role="status">
          {message}
        </p>
      ) : null}
    </section>
  );
}
