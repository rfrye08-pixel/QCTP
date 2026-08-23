import { VOICE_FREE_DAY1_PHASES } from "../../practice";

function phaseTime(seconds: number): string {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(
    seconds % 60,
  ).padStart(2, "0")}`;
}

export function VoiceFreePhasePlan({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`voice-free-phase-plan${compact ? " compact" : ""}`}
      role="list"
      aria-label="Day 1 phase sequence"
    >
      {VOICE_FREE_DAY1_PHASES.map((phase, index) => (
        <article key={phase.id} role="listitem">
          <div className="phase-plan-index" aria-hidden="true">
            {index + 1}
          </div>
          <div>
            <p className="phase-plan-time">
              {phaseTime(phase.startSeconds)}–{phaseTime(phase.endSeconds)}
            </p>
            <h3>{phase.title}</h3>
            <small>{phase.sourceLabel}</small>
            {compact ? null : <p>{phase.readOnceInstruction}</p>}
          </div>
        </article>
      ))}
    </div>
  );
}
