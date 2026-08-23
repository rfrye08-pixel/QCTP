import { useMemo, useState } from "react";

import { CodexRecordSchema } from "../../domain";
import {
  getCampbellExercise,
  THOMAS_CAMPBELL_MODULES,
  type SourceExerciseField,
} from "../../source-tracks";
import { FieldDictation } from "./FieldDictation";
import { StatusBadge } from "./StatusBadge";
import { useQctp } from "../qctp-context";

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
  onOpenPractice,
}: {
  onOpenPractice: () => void;
}) {
  const runtime = useQctp();
  const [activeExerciseId, setActiveExerciseId] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const exercise = useMemo(
    () => (activeExerciseId ? getCampbellExercise(activeExerciseId) : null),
    [activeExerciseId],
  );

  const openExercise = (exerciseId: string) => {
    setActiveExerciseId(exerciseId);
    setValues({});
    setMessage("");
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
    if (!exercise) return;
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
        fields: {
          sourceTrack: "thomas-campbell",
          moduleId: exercise.moduleId,
          exerciseId: exercise.id,
          sourceConcept: exercise.sourceConcept,
          contentClass: exercise.contentClass,
          structuredFields: values,
          completionGate: exercise.completionGate,
          stateCapabilityCreditGranted: false,
          rawObservationLockedBeforeInterpretation: true,
        },
        deletedAt: null,
      });
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
        </div>
        <span className="counter">05 / 10 MVP exercises</span>
      </div>
      <p>
        Source-specific concepts remain attributed. Every practice here is an
        original QCTP exercise; paid scripts, audio, and course text are not
        reproduced.
      </p>
      <div className="source-module-list" role="list">
        {THOMAS_CAMPBELL_MODULES.map((module) => (
          <article key={module.id} role="listitem">
            <header>
              <span>{module.id}</span>
              <div>
                <h3>{module.title}</h3>
                <small>{module.sourceLabel}</small>
              </div>
              <StatusBadge
                status={
                  module.status === "ready"
                    ? "ready"
                    : module.status === "prerequisite"
                      ? "in-progress"
                      : "reserved"
                }
              />
            </header>
            <p>{module.objective}</p>
            <dl>
              <div>
                <dt>Prerequisites</dt>
                <dd>
                  {module.prerequisites.length
                    ? module.prerequisites.join(" · ")
                    : "None"}
                </dd>
              </div>
              <div>
                <dt>Evidence gate</dt>
                <dd>{module.capabilityOutput}</dd>
              </div>
            </dl>
            {module.exerciseId ? (
              <button
                type="button"
                className="text-button"
                onClick={() => openExercise(module.exerciseId!)}
              >
                Open controlled exercise
              </button>
            ) : (
              <small className="controlled-hold">
                Controlled metadata only; implementation remains held.
              </small>
            )}
          </article>
        ))}
      </div>

      {exercise ? (
        <section className="source-exercise" aria-live="polite">
          <p className="eyebrow">{exercise.moduleId} · QCTP original</p>
          <h3>{exercise.title}</h3>
          <ol className="instruction-list">
            {exercise.instructions.map((instruction) => (
              <li key={instruction}>{instruction}</li>
            ))}
          </ol>
          {exercise.moduleId === "TC-02" ? (
            <button
              type="button"
              className="secondary-button"
              onClick={onOpenPractice}
            >
              Open controlled Practice
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
              onClick={() => setActiveExerciseId(null)}
            >
              Close exercise
            </button>
          </div>
          {message ? <p className="save-status">{message}</p> : null}
        </section>
      ) : null}
    </section>
  );
}
