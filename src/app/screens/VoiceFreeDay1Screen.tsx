import {
  formatPracticeSeconds,
  VOICE_FREE_SUPPORT_MODES,
  type VoiceFreeDay1SessionController,
  type VoiceFreeSupportMode,
} from "../../practice";
import { ScreenHeader } from "../components/ScreenHeader";
import { StatusBadge } from "../components/StatusBadge";
import { VoiceFreePhasePlan } from "../components/VoiceFreePhasePlan";

export function VoiceFreeDay1Screen({
  session,
}: {
  session: VoiceFreeDay1SessionController;
}) {
  const active =
    session.status === "running" ||
    session.status === "paused" ||
    session.status === "starting" ||
    session.status === "recording_issue" ||
    session.status === "saving" ||
    session.status === "save_pending";
  const selectedSupport = VOICE_FREE_SUPPORT_MODES[session.supportMode];

  return (
    <>
      <ScreenHeader
        eyebrow="Foundation · Day 1 · Morning continuity"
        title="Voice-Free Day 1"
      >
        <p>
          The locked Bullard → HeartMath → Dispenza → QCTP return sequence,
          guided by continuous nonverbal support. The rejected A03R narration is
          not used.
        </p>
      </ScreenHeader>

      <section className="panel-card voice-free-readiness">
        <div className="card-heading">
          <div>
            <p className="eyebrow">Read once, then close your eyes</p>
            <h2>Six source-grounded phases</h2>
          </div>
          <StatusBadge
            status={session.readiness === "ready" ? "ready" : "experimental"}
          />
        </div>
        <VoiceFreePhasePlan />
      </section>

      <section className="hero-card voice-free-player">
        <div className="card-heading">
          <div>
            <p className="eyebrow">Continuous local support</p>
            <h2>{session.phase.title}</h2>
          </div>
          <span className={`local-readiness ${session.readiness}`}>
            {session.readiness === "ready"
              ? session.offlinePackageReady
                ? "OFFLINE AUDIO READY"
                : "AUDIO READY · OFFLINE PACK INSTALLING"
              : session.readiness === "error"
                ? "AUDIO BLOCKED"
                : "CHECKING LOCAL AUDIO"}
          </span>
        </div>

        <div className="voice-free-stage" aria-live="polite">
          <p className="phase-source">{session.phase.sourceLabel}</p>
          <strong className="voice-free-timer" data-testid="practice-timer">
            {formatPracticeSeconds(session.remainingSeconds)}
          </strong>
          <p>{session.phase.readOnceInstruction}</p>

          {session.breathRail.active ? (
            <div
              className={`breath-rail ${session.breathRail.label.toLowerCase()}`}
              role="img"
              aria-label={`${session.breathRail.label} gently for about five seconds, or use a comfortable rhythm. No hold.`}
            >
              <div
                className="breath-orb"
                style={{
                  transform: `scale(${0.72 + session.breathRail.phaseProgress * 0.28})`,
                }}
              />
              <strong>{session.breathRail.label}</strong>
              <small>About 5 seconds · comfortable rhythm · no hold</small>
            </div>
          ) : null}
        </div>

        <div
          className="timeline"
          aria-label={`${Math.round(session.progress * 100)} percent complete`}
        >
          <div style={{ width: `${session.progress * 100}%` }} />
        </div>

        <label className="compact-field">
          Support mode
          <select
            value={session.supportMode}
            disabled={active}
            onChange={(event) =>
              session.setSupportMode(event.target.value as VoiceFreeSupportMode)
            }
          >
            {Object.values(VOICE_FREE_SUPPORT_MODES).map((mode) => (
              <option key={mode.id} value={mode.id}>
                {mode.label}
              </option>
            ))}
          </select>
        </label>
        <p className="fine-print">
          {selectedSupport.description}
          {selectedSupport.headphonesRequired
            ? " Use stereo headphones for this mode."
            : " Headphones are optional."}
        </p>

        <div className="practice-controls">
          {session.status === "save_pending" ? (
            <button
              className="primary-button"
              type="button"
              onClick={session.retrySave}
            >
              Retry local save
            </button>
          ) : session.status === "saving" ||
            session.status === "recording_issue" ? (
            <button className="primary-button" type="button" disabled>
              {session.status === "saving"
                ? "Saving local record…"
                : "Recording unresolved issue…"}
            </button>
          ) : session.status === "idle" ||
            session.status === "ended" ||
            session.status === "completed" ||
            session.status === "error" ? (
            <button
              className="primary-button"
              type="button"
              onClick={session.start}
              disabled={session.readiness !== "ready"}
            >
              {session.status === "idle"
                ? "Begin voice-free practice"
                : "Start again"}
            </button>
          ) : session.status === "running" ? (
            <button
              className="primary-button"
              type="button"
              onClick={session.pause}
            >
              Pause
            </button>
          ) : (
            <button
              className="primary-button"
              type="button"
              onClick={session.resume}
              disabled={session.status === "starting"}
            >
              {session.status === "starting" ? "Starting…" : "Resume"}
            </button>
          )}
          {active &&
          session.status !== "saving" &&
          session.status !== "recording_issue" &&
          session.status !== "save_pending" ? (
            <button
              className="secondary-button"
              type="button"
              onClick={session.end}
            >
              End without completion
            </button>
          ) : null}
        </div>

        {session.testMode ? (
          <p className="notice-inline">
            Verification mode is shortened and can never earn morning or state
            credit.
          </p>
        ) : null}
        {session.status === "completed" ? (
          <p className="save-status" role="status">
            Full return complete. Saved locally as VOICE_FREE_FALLBACK;
            narration acceptance and state attainment remain separate.
          </p>
        ) : null}
        {session.status === "saving" ? (
          <p className="save-status" role="status">
            Full return complete. Saving the practice and Foundation evidence
            together…
          </p>
        ) : null}
        {session.status === "recording_issue" ? (
          <p className="save-status" role="status">
            Ending safely. Preserving the unresolved issue without completion or
            state credit…
          </p>
        ) : null}
        {session.issue ? (
          <p className="recorder-error" role="alert">
            {session.issue}
          </p>
        ) : null}
      </section>
    </>
  );
}
