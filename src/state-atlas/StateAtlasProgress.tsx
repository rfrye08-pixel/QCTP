import { useId } from "react";

import { STATE_ATLAS } from "./catalog";
import {
  CAPABILITY_LEVELS,
  recommendedGuidanceTier,
  type CapabilitySnapshot,
} from "./progression";
import type { CapabilityLevel, StateId, StateSourceClass } from "./types";

import "./state-atlas-progress.css";

export interface StateAtlasProgressProps {
  capabilities: readonly CapabilitySnapshot[];
  stateIds?: readonly StateId[];
  activeStateId?: StateId | null;
  onStateSelect?: (stateId: StateId) => void;
  className?: string;
}

const SOURCE_CLASS_LABELS: Record<StateSourceClass, string> = {
  qctp_original: "QCTP original",
  qctp_synthesis: "QCTP synthesis",
  source_specific: "Source-specific",
  experimental_protocol: "Experimental protocol",
};

function levelIndex(level: CapabilityLevel | null): number {
  return level === null ? -1 : CAPABILITY_LEVELS.indexOf(level);
}

export function StateAtlasProgress({
  capabilities,
  stateIds,
  activeStateId = null,
  onStateSelect,
  className,
}: StateAtlasProgressProps) {
  const headingId = useId();
  const requested = new Set(stateIds ?? STATE_ATLAS.map((state) => state.id));
  const definitions = STATE_ATLAS.filter((state) => requested.has(state.id));
  const levels = new Map(
    capabilities.map((capability) => [capability.stateId, capability.level]),
  );

  return (
    <section
      className={["qctp-state-progress", className].filter(Boolean).join(" ")}
      aria-labelledby={headingId}
    >
      <header className="qctp-state-progress-header">
        <p>State Atlas</p>
        <h2 id={headingId}>Capability, guidance, and source control</h2>
        <small>
          Levels move only through controlled evidence gates. Elapsed practice
          time never advances capability.
        </small>
      </header>

      <div className="qctp-state-progress-list" role="list">
        {definitions.map((definition) => {
          const level = levels.get(definition.id) ?? null;
          const guidance = recommendedGuidanceTier(level);
          const reachedIndex = levelIndex(level);
          return (
            <article
              className={`qctp-state-progress-card${activeStateId === definition.id ? " is-active" : ""}`}
              data-state-id={definition.id}
              key={definition.id}
              role="listitem"
            >
              <header>
                <div>
                  <span className="qctp-state-id">{definition.id}</span>
                  <h3>{definition.title}</h3>
                </div>
                <span className="qctp-state-guidance">{guidance} guidance</span>
              </header>

              <p className="qctp-state-source">
                <span>{SOURCE_CLASS_LABELS[definition.sourceClass]}</span>
                <strong>{definition.sourceLabel}</strong>
              </p>

              <div
                className="qctp-capability-rail"
                aria-label={`Controlled capability levels. Current: ${level ?? "Not introduced"}.`}
              >
                {CAPABILITY_LEVELS.map((candidate, index) => (
                  <span
                    className={`${index <= reachedIndex ? "is-reached" : ""}${candidate === level ? " is-current" : ""}`}
                    key={candidate}
                  >
                    <i aria-hidden="true" />
                    <small>{candidate}</small>
                  </span>
                ))}
              </div>

              <div className="qctp-state-progress-footer">
                <p>
                  Current capability:{" "}
                  <strong>{level ?? "Not introduced"}</strong>
                </p>
                {onStateSelect ? (
                  <button
                    type="button"
                    onClick={() => onStateSelect(definition.id)}
                  >
                    View {definition.id}
                  </button>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
