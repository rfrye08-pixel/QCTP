import { useState } from "react";

import {
  DAY1_EVENING_PRACTICE,
  DAY1_MICRO_PRACTICE,
  DAY1_WORKBOOK_PROMPTS,
} from "../../foundation";
import { FieldDictation } from "../components/FieldDictation";
import { ScreenHeader } from "../components/ScreenHeader";
import { StatusBadge } from "../components/StatusBadge";
import { useQctp } from "../qctp-context";
import type { AppRoute } from "../routes";

export function TodayOverview({
  onNavigate,
}: {
  onNavigate: (route: AppRoute) => void;
}) {
  const runtime = useQctp();
  const [answers, setAnswers] = useState<Record<string, string>>(
    () => runtime.workbook.answers["1"] ?? {},
  );
  const completion = runtime.foundation.completion["1"] ?? {
    morning: false,
    midday: false,
    evening: false,
  };
  const completedCount = Object.values(completion).filter(Boolean).length;
  const saveAnswer = async (promptId: string, value: string) => {
    setAnswers((current) => ({ ...current, [promptId]: value }));
    await runtime.updateWorkbookAnswer(1, promptId, value);
  };
  const appendAnswer = async (promptId: string, text: string) => {
    const current = answers[promptId] ?? "";
    const value = current.trim() ? `${current.trimEnd()}\n${text}` : text;
    await saveAnswer(promptId, value);
  };
  return (
    <>
      <ScreenHeader
        eyebrow="Foundation path · Week 1"
        title="Day 1 — State Control"
      >
        <p>
          Learn the adjustable controls of attention, coherence, narrow focus,
          and open awareness. This released sequence is preserved from Rev1.1.4.
        </p>
      </ScreenHeader>
      <section className="hero-card protected-card">
        <div className="card-heading">
          <div>
            <p className="eyebrow">Protected baseline</p>
            <h2>Lesson → 25-minute practice</h2>
          </div>
          <StatusBadge status="released" />
        </div>
        <div className="metric-grid">
          <div className="metric">
            <span>Guide</span>
            <strong>Chill Brian</strong>
          </div>
          <div className="metric">
            <span>Timeline</span>
            <strong>25:00 exact</strong>
          </div>
          <div className="metric">
            <span>Progression</span>
            <strong>Completion-based</strong>
          </div>
        </div>
        <button
          className="primary-button"
          type="button"
          onClick={() => onNavigate("practice")}
        >
          Begin today
        </button>
        <p className="fine-print">
          Morning completion is saved only after the full practice naturally
          reaches 0:00.
        </p>
      </section>
      <section className="panel-card">
        <div className="card-heading">
          <div>
            <p className="eyebrow">Secondary assignment</p>
            <h2>REG-01 — Learn to See</h2>
          </div>
          <StatusBadge status="ready" />
        </div>
        <p>
          Construct two equal circles, observe before interpreting, capture a
          five-minute auto-dictation, and preserve the artifact.
        </p>
        <button
          className="secondary-button"
          type="button"
          onClick={() => onNavigate("studio")}
        >
          Open Geometry Studio
        </button>
      </section>
      <section className="panel-card day1-integration">
        <p className="eyebrow">Midday integration</p>
        <h2>Five safe eyes-open micro-entries</h2>
        <ol className="instruction-list">
          {DAY1_MICRO_PRACTICE.map((instruction) => (
            <li key={instruction}>{instruction}</li>
          ))}
        </ol>
      </section>
      <section className="panel-card day1-integration">
        <p className="eyebrow">Evening · 10 minutes</p>
        <h2>Day 1 closing practice</h2>
        <ol className="instruction-list">
          {DAY1_EVENING_PRACTICE.map((instruction) => (
            <li key={instruction}>{instruction}</li>
          ))}
        </ol>
      </section>
      <section
        className="panel-card workbook-card"
        aria-labelledby="day1-workbook-title"
      >
        <p className="eyebrow">Local workbook</p>
        <h2 id="day1-workbook-title">Day 1 observations</h2>
        <p>
          These answers remain on this device and migrate from Rev1 without
          deleting the source.
        </p>
        <div className="workbook-fields">
          {DAY1_WORKBOOK_PROMPTS.map((prompt) => (
            <div className="form-field" key={prompt.id}>
              <div className="platform-field-heading">
                <label htmlFor={`workbook-${prompt.id}`}>
                  {prompt.question}
                </label>
                <FieldDictation
                  fieldTargetId={`workbook:1:${prompt.id}`}
                  destination="workbook"
                  onAppend={(text) => appendAnswer(prompt.id, text)}
                />
              </div>
              <textarea
                id={`workbook-${prompt.id}`}
                value={answers[prompt.id] ?? ""}
                onChange={(event) =>
                  setAnswers((current) => ({
                    ...current,
                    [prompt.id]: event.target.value,
                  }))
                }
                onBlur={(event) =>
                  void saveAnswer(prompt.id, event.target.value)
                }
              />
            </div>
          ))}
        </div>
      </section>
      <section className="panel-card">
        <div className="card-heading">
          <h2>Today’s components</h2>
          <span className="counter">{completedCount} / 3</span>
        </div>
        <div className="component-list">
          <div className={completion.morning ? "complete" : undefined}>
            <span className="component-dot" />
            <p>
              <strong>Morning lesson + practice</strong>
              <small>Protected Day 1 sequence</small>
            </p>
            <span>{completion.morning ? "Complete" : "Pending"}</span>
          </div>
          <div className={completion.midday ? "complete" : undefined}>
            <span className="component-dot" />
            <p>
              <strong>Midday integration</strong>
              <small>Five safe eyes-open micro-entries</small>
            </p>
            <button
              type="button"
              disabled={completion.midday}
              onClick={() => void runtime.markFoundationComponent("midday")}
            >
              {completion.midday ? "Complete" : "Mark complete"}
            </button>
          </div>
          <div className={completion.evening ? "complete" : undefined}>
            <span className="component-dot" />
            <p>
              <strong>Evening practice</strong>
              <small>Ten-minute closing practice</small>
            </p>
            <button
              type="button"
              disabled={completion.evening}
              onClick={() => void runtime.markFoundationComponent("evening")}
            >
              {completion.evening ? "Complete" : "Mark complete"}
            </button>
          </div>
        </div>
      </section>
      {runtime.foundation.currentDay > 1 ? (
        <section className="notice-card">
          <strong>Day 1 complete</strong>
          <p>
            Day 2 remains a controlled curriculum slot and has not been
            fabricated in this build.
          </p>
        </section>
      ) : null}
    </>
  );
}

const grantModules = [
  "Learn to See",
  "Circle, Vesica, and Polarity",
  "Flower and Nested Geometry",
  "Cuboctahedron and Metatron Structures",
  "Perspective and Mirror Reflections",
  "Number Origins and Mathematical Constants",
  "The Quadrivium",
  "Sound, Rhythm, and Harmonic Geometry",
  "Mirror of Consciousness",
  "24 Precepts in Daily Life",
  "Auto-Dictation and Creative Reception",
  "Personal Codex Synthesis",
] as const;

export function PathsOverview({
  onNavigate,
}: {
  onNavigate: (route: AppRoute) => void;
}) {
  return (
    <>
      <ScreenHeader eyebrow="Learning architecture" title="Paths">
        <p>
          Foundation remains primary. Source and skill tracks advance only when
          their controlled work is completed.
        </p>
      </ScreenHeader>
      <section className="panel-card path-card active-path">
        <div className="card-heading">
          <div>
            <p className="eyebrow">Primary path</p>
            <h2>112-Day Foundation</h2>
          </div>
          <StatusBadge status="released" />
        </div>
        <p>
          Day 1 is released. Days 2–112 retain their controlled module slots and
          remain intentionally unauthored.
        </p>
        <button
          className="secondary-button"
          type="button"
          onClick={() => onNavigate("today")}
        >
          Return to Day 1
        </button>
      </section>
      <section className="panel-card path-card">
        <div className="card-heading">
          <div>
            <p className="eyebrow">Source track</p>
            <h2>Robert Edward Grant</h2>
          </div>
          <span className="counter">01 / 12</span>
        </div>
        <div className="module-list">
          {grantModules.map((title, index) => (
            <div key={title} className={index === 0 ? "current" : undefined}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <p>
                <strong>{title}</strong>
                <small>
                  {index === 0
                    ? "Original QCTP MVP available"
                    : "Controlled module reserved"}
                </small>
              </p>
              <StatusBadge status={index === 0 ? "ready" : "reserved"} />
            </div>
          ))}
        </div>
        <button
          className="primary-button"
          type="button"
          onClick={() => onNavigate("studio")}
        >
          Open REG-01
        </button>
      </section>
    </>
  );
}

export function MoreOverview({
  onNavigate,
}: {
  onNavigate: (route: AppRoute) => void;
}) {
  const surfaces: Array<[AppRoute, string, string, "ready" | "experimental"]> =
    [
      [
        "lab",
        "Lab",
        "Versioned personal experiment protocols and evidence-separated logs.",
        "ready",
      ],
      [
        "codex",
        "Codex",
        "Searchable records, voice layers, artifacts, tags, and source links.",
        "ready",
      ],
      [
        "mirror",
        "Mirror / Insights",
        "Traceable reflection over preserved source evidence.",
        "experimental",
      ],
      [
        "settings",
        "Settings",
        "Audio, capture retention, transcription, migration, and portability.",
        "ready",
      ],
    ];
  return (
    <>
      <ScreenHeader eyebrow="Platform surfaces" title="More">
        <p>
          Each surface identifies what is released, ready for device testing,
          reserved, or experimental.
        </p>
      </ScreenHeader>
      <section className="surface-grid">
        {surfaces.map(([route, title, detail, status]) => (
          <button
            key={route}
            type="button"
            className="surface-card"
            onClick={() => onNavigate(route)}
          >
            <span>
              <strong>{title}</strong>
              <StatusBadge status={status} />
            </span>
            <small>{detail}</small>
            <b aria-hidden="true">Open →</b>
          </button>
        ))}
      </section>
      <section className="notice-card">
        <strong>Release control</strong>
        <p>
          Rev2 has zero release authority. This branch cannot merge or deploy
          without explicit controlled approval.
        </p>
      </section>
    </>
  );
}
