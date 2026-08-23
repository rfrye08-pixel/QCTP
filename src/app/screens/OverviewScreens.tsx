import { useEffect, useState } from "react";

import {
  DAY1_EVENING_PRACTICE,
  DAY1_MICRO_PRACTICE,
  DAY1_WORKBOOK_PROMPTS,
} from "../../foundation";
import { QuickBreathDirector } from "../../breath";
import {
  VOICE_FREE_SUPPORT_MODES,
  type VoiceFreeDay1SessionController,
  type VoiceFreeSupportMode,
} from "../../practice";
import type { PracticeSession } from "../../domain";
import { StateAtlasProgress, type StateId } from "../../state-atlas";
import {
  CONTROLLED_SOURCE_TRACK_REGISTRY,
  SOURCE_TRACK_LIFECYCLE_DETAILS,
} from "../../source-tracks";
import { deriveControlledSchedule } from "../../schedule";
import { FieldDictation } from "../components/FieldDictation";
import { ContentClassBadge } from "../components/ContentClassBadge";
import { CampbellTrackPanel } from "../components/CampbellTrackPanel";
import { BreathFoundationsPanel } from "../components/BreathFoundationsPanel";
import { StateAtlasTrainingPanel } from "../components/StateAtlasTrainingPanel";
import { applyPwaUpdate, usePwaStatus } from "../pwa-status";
import { ScreenHeader } from "../components/ScreenHeader";
import { StatusBadge } from "../components/StatusBadge";
import { VoiceFreePhasePlan } from "../components/VoiceFreePhasePlan";
import { useQctp } from "../qctp-context";
import type { AppRoute } from "../routes";

const NETWORK_OFFLINE_HINT = "qctp-network-offline-hint";

function hasNetworkOfflineHint(): boolean {
  try {
    return sessionStorage.getItem(NETWORK_OFFLINE_HINT) === "true";
  } catch {
    return false;
  }
}

function setNetworkOfflineHint(offline: boolean): void {
  try {
    if (offline) sessionStorage.setItem(NETWORK_OFFLINE_HINT, "true");
    else sessionStorage.removeItem(NETWORK_OFFLINE_HINT);
  } catch {
    // The visible state still updates even when sessionStorage is unavailable.
  }
}

export function TodayOverview({
  onNavigate,
  voiceFreeSession,
  onStartVoiceFreeDay1,
  onQuickCapture,
  unresolvedDebriefSession,
  onOpenDebrief,
}: {
  onNavigate: (route: AppRoute) => void;
  voiceFreeSession: VoiceFreeDay1SessionController;
  onStartVoiceFreeDay1: () => void;
  onQuickCapture: (trigger: HTMLButtonElement) => void;
  unresolvedDebriefSession: PracticeSession | null;
  onOpenDebrief: () => void;
}) {
  const runtime = useQctp();
  const pwaStatus = usePwaStatus();
  const [online, setOnline] = useState(
    () => navigator.onLine && !hasNetworkOfflineHint(),
  );
  const [lastPracticeSession, setLastPracticeSession] =
    useState<PracticeSession | null>(null);
  const [scheduleNow, setScheduleNow] = useState(() => new Date());
  const [answers, setAnswers] = useState<Record<string, string>>(
    () => runtime.workbook.answers["1"] ?? {},
  );
  const completion = runtime.foundation.completion["1"] ?? {
    morning: false,
    midday: false,
    evening: false,
  };
  const completedCount = Object.values(completion).filter(Boolean).length;
  const schedule = deriveControlledSchedule({
    now: scheduleNow,
    foundationDay: runtime.foundation.currentDay,
    completion,
    reminders: runtime.settings.reminderPreferences,
  });
  const laterAssignments = schedule.assignments.slice(1);
  useEffect(() => {
    const markOnline = () => {
      setNetworkOfflineHint(false);
      setOnline(true);
    };
    const markOffline = () => {
      setNetworkOfflineHint(true);
      setOnline(false);
    };
    const reconcileNetworkState = () => {
      const hintedOffline = hasNetworkOfflineHint();
      if (!navigator.onLine && !hintedOffline) markOffline();
    };
    window.addEventListener("online", markOnline);
    window.addEventListener("offline", markOffline);
    const networkReconcileInterval = window.setInterval(
      reconcileNetworkState,
      500,
    );
    reconcileNetworkState();
    return () => {
      window.removeEventListener("online", markOnline);
      window.removeEventListener("offline", markOffline);
      window.clearInterval(networkReconcileInterval);
    };
  }, []);
  useEffect(() => {
    const update = () => setScheduleNow(new Date());
    const interval = window.setInterval(update, 30_000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") update();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);
  useEffect(() => {
    let disposed = false;
    void runtime.repository.listPracticeSessions().then((sessions) => {
      if (!disposed) setLastPracticeSession(sessions[0] ?? null);
    });
    return () => {
      disposed = true;
    };
  }, [runtime.repository, runtime.revision]);
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
        className="today-screen-header"
        eyebrow="Foundation path · Week 1"
        title="Day 1 — Baseline Awareness"
      >
        <p>
          Begin the source-grounded morning sequence immediately. Narration is
          held until a new voice passes Ryan’s blind physical audition.
        </p>
      </ScreenHeader>
      <section className="hero-card protected-card morning-mission">
        <div className="card-heading">
          <div>
            <p className="eyebrow">Morning practice ready now</p>
            <h2>Voice-Free Day 1 · 25 minutes</h2>
            <ContentClassBadge
              authorityKey="foundation.day1.practice"
              scope="Day 1 practice"
            />
          </div>
          <StatusBadge status="ready" />
        </div>
        <div className="metric-grid">
          <div className="metric">
            <span>Guidance</span>
            <strong>Nonverbal</strong>
          </div>
          <div className="metric">
            <span>Timeline</span>
            <strong>25:00 exact</strong>
          </div>
          <div className="metric">
            <span>Breath</span>
            <strong>5 in / 5 out or comfortable</strong>
          </div>
        </div>
        <p className="schedule-readiness" role="status">
          <strong>Scheduled readiness: 4:00 a.m. local</strong>
          <span>{schedule.readinessLabel}</span>
        </p>
        <button
          className="primary-button"
          type="button"
          onClick={onStartVoiceFreeDay1}
          disabled={voiceFreeSession.readiness !== "ready"}
        >
          Begin Voice-Free Day 1
        </button>
        <label className="compact-field morning-support-select">
          Continuous support
          <select
            value={voiceFreeSession.supportMode}
            disabled={
              voiceFreeSession.status === "running" ||
              voiceFreeSession.status === "paused" ||
              voiceFreeSession.status === "starting" ||
              voiceFreeSession.status === "recording_issue" ||
              voiceFreeSession.status === "saving" ||
              voiceFreeSession.status === "save_pending"
            }
            onChange={(event) =>
              voiceFreeSession.setSupportMode(
                event.target.value as VoiceFreeSupportMode,
              )
            }
          >
            {Object.values(VOICE_FREE_SUPPORT_MODES).map((mode) => (
              <option key={mode.id} value={mode.id}>
                {mode.label}
              </option>
            ))}
          </select>
        </label>
        <p className="fine-print" role="status">
          {voiceFreeSession.offlinePackageReady
            ? "Selected 25-minute support is verified in the offline cache."
            : "Audio can play when ready; the selected offline support package is still being verified."}
        </p>
        <p className="fine-print">
          One tap starts the selected same-origin support track and opens the
          practice cockpit. The full return must finish before a
          VOICE_FREE_FALLBACK completion is saved. State attainment and voice
          acceptance remain separate.
        </p>
        <details className="phase-plan-details">
          <summary>Review the six source-grounded phases</summary>
          <VoiceFreePhasePlan compact />
        </details>
      </section>
      {unresolvedDebriefSession?.debrief ? (
        <section className="panel-card pending-debrief-card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">Unfinished morning follow-through</p>
              <h2>Raw observation is still open</h2>
            </div>
            <StatusBadge status="ready" />
          </div>
          <p>
            Preserve what you directly noticed before adding meaning. This is
            linked to the completed Day 1 session and cannot award state or
            capability credit.
          </p>
          {unresolvedDebriefSession.debrief.status === "remind_later" ? (
            <p className="fine-print" role="status">
              Saved for later
              {unresolvedDebriefSession.debrief.remindAt
                ? ` · due again ${new Date(
                    unresolvedDebriefSession.debrief.remindAt,
                  ).toLocaleTimeString([], {
                    hour: "numeric",
                    minute: "2-digit",
                  })}`
                : ""}
              .
            </p>
          ) : null}
          <button
            className="secondary-button"
            type="button"
            onClick={onOpenDebrief}
          >
            Finish raw observation
          </button>
        </section>
      ) : null}
      <section
        className="panel-card today-schedule-card"
        aria-labelledby="later-today-title"
      >
        <div className="card-heading">
          <div>
            <p className="eyebrow">Visible in-app schedule</p>
            <h2 id="later-today-title">Later today</h2>
          </div>
          <StatusBadge status="ready" />
        </div>
        <div className="schedule-assignment-list">
          {laterAssignments.map((assignment) => (
            <article key={assignment.id}>
              <div>
                <strong>{assignment.label}</strong>
                <small>{assignment.summary}</small>
              </div>
              <span>
                {assignment.status === "complete"
                  ? "Complete"
                  : assignment.scheduledLocalTime
                    ? assignment.status === "ready"
                      ? `Personal reminder passed · ${assignment.scheduledLocalTime}`
                      : `Personal reminder · ${assignment.scheduledLocalTime}`
                    : "Available · no source clock time"}
              </span>
            </article>
          ))}
        </div>
        <p className="fine-print">
          Device alerts are best effort while an iPhone PWA is active. Anything
          due or unfinished stays here even when iOS does not deliver an alert.
          Personal times can be set in Settings.
        </p>
      </section>
      <section className="today-status-grid" aria-label="Today readiness">
        <article>
          <span>Local use</span>
          <strong>{online ? "Device online" : "Offline-ready"}</strong>
          <small>
            {online
              ? "The local ledger remains authoritative."
              : "Practice, recording, and queued work remain available."}
          </small>
        </article>
        <article>
          <span>PX13 companion</span>
          <strong>
            {runtime.localTranscriptionStatus === "ready" &&
            runtime.mirror.connectivity === "online"
              ? "Online"
              : "Optional / queued"}
          </strong>
          <small>
            Whisper: {runtime.localTranscriptionStatus.replace("-", " ")} ·
            Mirror: {runtime.mirror.connectivity}
          </small>
        </article>
        <article>
          <span>App package</span>
          <strong>{pwaStatus.installed ? "Installed" : "PWA available"}</strong>
          <small>{pwaStatus.message}</small>
          {pwaStatus.candidateSha ? (
            <small>Candidate {pwaStatus.candidateSha.slice(0, 10)}</small>
          ) : null}
          {pwaStatus.updateStatus === "update-available" ||
          pwaStatus.updateStatus === "update-retry" ||
          pwaStatus.updateStatus === "applying-update" ? (
            <button
              className="secondary-button status-update-button"
              type="button"
              disabled={pwaStatus.updateStatus === "applying-update"}
              onClick={() => void applyPwaUpdate()}
            >
              {pwaStatus.updateStatus === "applying-update"
                ? "Opening update…"
                : pwaStatus.updateStatus === "update-retry"
                  ? "Retry ready update"
                  : "Apply ready update"}
            </button>
          ) : null}
        </article>
        <article>
          <span>Reminder delivery</span>
          <strong>
            {runtime.notifications.permission === "granted" &&
            runtime.settings.reminderPreferences.deviceNotificationsEnabled
              ? "Best effort on"
              : "Today fallback on"}
          </strong>
          <small>
            {runtime.notifications.permission === "denied"
              ? "Alerts are blocked; the in-app schedule remains reliable."
              : runtime.notifications.permission === "unsupported"
                ? "This browser cannot alert; due work stays visible here."
                : "No closed-app delivery guarantee is claimed."}
          </small>
        </article>
        <article>
          <span>Last morning result</span>
          <strong>
            {lastPracticeSession?.naturalCompletion
              ? "Full return completed"
              : "No completed session yet"}
          </strong>
          <small>
            {lastPracticeSession
              ? `${Math.round(lastPracticeSession.elapsedMs / 60_000)} minutes · ${lastPracticeSession.supportMode}`
              : "Voice-Free Day 1 is ready now."}
          </small>
        </article>
        <article>
          <span>Unresolved practice issue</span>
          <strong>
            {runtime.settings.lastVoiceFreeIssue
              ? "Needs attention"
              : "None recorded"}
          </strong>
          <small>
            {runtime.settings.lastVoiceFreeIssue?.message ??
              "A future interruption or audio failure will remain visible here until a full return is saved."}
          </small>
        </article>
      </section>
      <section className="notice-card voice-hold-card">
        <strong>Narrated Day 1 is held</strong>
        <p>
          The A03R voice was physically rejected as robotic. QCTP will not use
          it while the blind natural-voice audition remains open.
        </p>
        <a className="secondary-link" href="./voice-audition/">
          Open the blind voice audition
        </a>
      </section>
      <section className="panel-card today-voice-note">
        <div>
          <p className="eyebrow">One-tap local note</p>
          <h2>Capture what is present</h2>
          <p>
            Raw audio is saved locally first. Transcription can wait safely for
            the no-cost PX13 companion.
          </p>
        </div>
        <button
          className="secondary-button"
          type="button"
          onClick={(event) => onQuickCapture(event.currentTarget)}
        >
          Record voice note
        </button>
      </section>
      <QuickBreathDirector
        className="today-breath-director"
        preferences={runtime.breathProfile.quickDirector}
        onPreferencesChange={(preferences) =>
          void runtime.updateQuickBreathPreferences(preferences)
        }
      />
      <StateAtlasProgress
        className="today-state-atlas"
        stateIds={["Q1", "Q2", "Q3", "Q4"]}
        capabilities={runtime.stateCapabilities}
        onStateSelect={() => onNavigate("paths")}
      />
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
        <h2>At least three safe eyes-open micro-entries</h2>
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
              <small>Source-grounded Voice-Free Day 1 fallback</small>
            </p>
            <span>{completion.morning ? "Complete" : "Pending"}</span>
          </div>
          <div className={completion.midday ? "complete" : undefined}>
            <span className="component-dot" />
            <p>
              <strong>Midday integration</strong>
              <small>At least three safe eyes-open micro-entries</small>
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
  const [requestedStateId, setRequestedStateId] = useState<StateId | null>(
    null,
  );

  const openStateRecipe = (stateId: "TC-PC" | "QI") => {
    setRequestedStateId(stateId);
    document.getElementById("state-atlas-training")?.scrollIntoView({
      block: "start",
    });
  };

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
            <ContentClassBadge
              authorityKey="foundation.day1.practice"
              scope="Day 1 practice only"
            />
          </div>
          <StatusBadge status="released" />
        </div>
        <p>
          Day 1 has a source-grounded voice-free morning candidate. Narrated
          acceptance remains held. Days 2–112 retain their controlled module
          slots and remain intentionally unauthored.
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
            <ContentClassBadge
              authorityKey="source.profile.robert-edward-grant"
              scope="Grant source profile"
            />
            <ContentClassBadge
              authorityKey="grant.exercise.REG-01-A"
              scope="REG-01 exercise"
            />
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
      <BreathFoundationsPanel />
      <StateAtlasTrainingPanel
        requestedStateId={requestedStateId}
        onSelectionConsumed={() => setRequestedStateId(null)}
      />
      <CampbellTrackPanel onOpenStateRecipe={openStateRecipe} />
      <section className="panel-card controlled-source-map">
        <p className="eyebrow">Controlled source architecture</p>
        <h2>Authority and implementation stay separate</h2>
        <p>
          These source families remain labeled by their actual implementation
          status. An architecture slot is not presented as released content.
        </p>
        <div>
          {CONTROLLED_SOURCE_TRACK_REGISTRY.map((source) => (
            <article
              key={source.id}
              data-source-track={source.id}
              data-source-track-status={source.status}
            >
              <header>
                <strong>{source.label}</strong>
                <span className="source-lifecycle-badge">
                  {SOURCE_TRACK_LIFECYCLE_DETAILS[source.status].label}
                </span>
              </header>
              <p>{source.scope}</p>
              {source.profileAuthorityKey ? (
                <ContentClassBadge
                  authorityKey={source.profileAuthorityKey}
                  scope="Source profile"
                />
              ) : null}
              {source.holdReason ? (
                <p className="controlled-hold">
                  <strong>Current hold:</strong> {source.holdReason}
                </p>
              ) : null}
              <dl>
                <div>
                  <dt>Next</dt>
                  <dd>{source.nextAction}</dd>
                </div>
                <div>
                  <dt>Release authority</dt>
                  <dd>{source.releaseAuthority}</dd>
                </div>
              </dl>
              <details>
                <summary>Controlled access points</summary>
                <ul>
                  {source.accessPoints.map((access) => (
                    <li key={access.id}>
                      <strong>{access.label}</strong>
                      <span>
                        {SOURCE_TRACK_LIFECYCLE_DETAILS[access.status].label}
                      </span>
                      {access.holdReason ? (
                        <small>{access.holdReason}</small>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </details>
            </article>
          ))}
        </div>
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
          Rev3 has zero release authority. This branch cannot merge or deploy
          without explicit controlled approval.
        </p>
      </section>
    </>
  );
}
