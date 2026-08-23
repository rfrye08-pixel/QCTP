import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const backlogPath = resolve(
  process.cwd(),
  "QCTP_REV3_CONTROLLED_FEATURE_BACKLOG.json",
);
const backlog = JSON.parse(await readFile(backlogPath, "utf8"));
const allowedStatuses = new Set([
  "EXISTING",
  "NEEDS_HARDENING",
  "NEW",
  "BLOCKED",
  "DEFERRED",
]);
const requiredFields = [
  "feature_id",
  "name",
  "user_outcome",
  "authority_sources",
  "status",
  "dependencies",
  "implementation_package",
  "automated_acceptance_criteria",
  "physical_acceptance_criteria",
  "release_authority",
  "evidence_produced",
  "deferral",
];

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

invariant(
  backlog.schema === "qctp-rev3-controlled-feature-backlog-v1",
  "Unexpected controlled backlog schema.",
);
invariant(
  backlog.branch === "qctp-platform-rev3-codex",
  "Controlled backlog must target only qctp-platform-rev3-codex.",
);
invariant(
  backlog.global_release_authority?.release === "ZERO_RELEASE",
  "Backlog release authority must remain ZERO_RELEASE.",
);
invariant(Array.isArray(backlog.features), "features must be an array.");

const ids = new Set();
const counts = Object.fromEntries(
  [...allowedStatuses].map((status) => [status, 0]),
);
for (const feature of backlog.features) {
  for (const field of requiredFields) {
    invariant(
      Object.hasOwn(feature, field),
      `${feature.feature_id ?? "unknown feature"} is missing ${field}.`,
    );
  }
  invariant(
    /^QCTP-REV3-F\d{3}$/u.test(feature.feature_id),
    `Invalid feature ID ${feature.feature_id}.`,
  );
  invariant(
    !ids.has(feature.feature_id),
    `Duplicate feature ID ${feature.feature_id}.`,
  );
  ids.add(feature.feature_id);
  invariant(
    allowedStatuses.has(feature.status),
    `${feature.feature_id} has invalid status ${feature.status}.`,
  );
  counts[feature.status] += 1;
  invariant(
    Array.isArray(feature.authority_sources) &&
      feature.authority_sources.length > 0,
    `${feature.feature_id} needs at least one authority source.`,
  );
  invariant(
    Array.isArray(feature.automated_acceptance_criteria) &&
      feature.automated_acceptance_criteria.length > 0,
    `${feature.feature_id} needs automated acceptance criteria.`,
  );
  invariant(
    Array.isArray(feature.physical_acceptance_criteria) &&
      feature.physical_acceptance_criteria.length > 0,
    `${feature.feature_id} needs physical acceptance criteria.`,
  );
  invariant(
    typeof feature.release_authority === "string" &&
      feature.release_authority.includes("ZERO_RELEASE"),
    `${feature.feature_id} must retain ZERO_RELEASE.`,
  );
  invariant(
    Array.isArray(feature.evidence_produced),
    `${feature.feature_id} evidence_produced must be an array.`,
  );
  invariant(
    typeof feature.deferral === "object" &&
      typeof feature.deferral.next_executable_step === "string" &&
      feature.deferral.next_executable_step.length > 0,
    `${feature.feature_id} needs a next executable step.`,
  );
  if (feature.status === "BLOCKED" || feature.status === "DEFERRED") {
    invariant(
      typeof feature.deferral.reason === "string" &&
        feature.deferral.reason.length > 0,
      `${feature.feature_id} must state the exact blocking or deferral reason.`,
    );
  } else {
    invariant(
      feature.deferral.reason === null,
      `${feature.feature_id} may not claim a deferral reason unless blocked or deferred.`,
    );
  }
}

invariant(
  backlog.summary?.feature_count === backlog.features.length,
  "Declared feature_count does not match the feature array.",
);
for (const status of allowedStatuses) {
  invariant(
    backlog.summary?.[status] === counts[status],
    `Declared ${status} count does not match the feature array.`,
  );
}

const coverage = backlog.minimum_scope_coverage;
invariant(
  Array.isArray(coverage) && coverage.length === 35,
  "Exactly 35 minimum controlled scope items must be mapped.",
);
const coveredItems = new Set();
for (const item of coverage) {
  invariant(
    Number.isInteger(item.scope_item) &&
      item.scope_item >= 1 &&
      item.scope_item <= 35,
    `Invalid minimum scope item ${item.scope_item}.`,
  );
  invariant(
    !coveredItems.has(item.scope_item),
    `Duplicate minimum scope item ${item.scope_item}.`,
  );
  coveredItems.add(item.scope_item);
  invariant(
    Array.isArray(item.feature_ids) && item.feature_ids.length > 0,
    `Minimum scope item ${item.scope_item} has no feature mapping.`,
  );
  for (const featureId of item.feature_ids) {
    invariant(
      ids.has(featureId),
      `Minimum scope item ${item.scope_item} references missing ${featureId}.`,
    );
  }
}

for (let scopeItem = 1; scopeItem <= 35; scopeItem += 1) {
  invariant(
    coveredItems.has(scopeItem),
    `Minimum scope item ${scopeItem} is missing.`,
  );
}

console.log(
  JSON.stringify(
    {
      result: "PASS",
      schema: backlog.schema,
      feature_count: backlog.features.length,
      minimum_scope_items: coverage.length,
      status_counts: counts,
      release_authority: backlog.global_release_authority.release,
    },
    null,
    2,
  ),
);
