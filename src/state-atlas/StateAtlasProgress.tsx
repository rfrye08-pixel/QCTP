import { useId } from "react";

import { STATE_ATLAS } from "./catalog";
import {
  CAPABILITY_LEVELS,
  recommendedGuidanceTier,
  type CapabilitySnapshot,
} from "./progression";
import type { CapabilityLevel, StateId } from "./types";
import { ContentClassBadge } from "../app/components/ContentClassBadge";

import "./state-atlas-progress.css";

const relationshipLabels = {
  qctp: "QCTP-authored recipe",
  source_informed: "Source-informed recipe",
  source_specific_target: "Source-specific target",
  experimental_protocol: "Experimental protocol",
} as const;

export interface StateAtlasProgressProps {
  capabilities: readonly (CapabilitySnapshot & {
    readonly sourceTrackHold?: unknown;
  })[];
  stateIds?: readonly StateId[];
  activeStateId?: StateId | null;
  onStateSelect?: (stateId: StateId) => void;
  className?: string;
}

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
    capabilities
      .filter((capability) => !capability.sourceTrackHold)
      .map((capability) => [capability.stateId, capability.level]),
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
                <ContentClassBadge
                  authorityKey={definition.recipeContentRef.authorityKey}
                  scope="Runnable state recipe"
                />
                {definition.sourceTargetContentRef ? (
                  <ContentClassBadge
                    authorityKey={
                      definition.sourceTargetContentRef.authorityKey
                    }
                    scope="Source-specific target term"
                  />
                ) : null}
                <strong>{definition.sourceLabel}</strong>
                <small>
                  {relationshipLabels[definition.sourceRelationship]}
                </small>
                {definition.sourceTargetContentRef ? (
                  <small>
                    The source-faithful target label identifies the intended
                    markers; it does not establish attainment.
                  </small>
                ) : null}
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
