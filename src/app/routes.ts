import { EntityIdSchema } from "../domain";

export const primaryRoutes = [
  "today",
  "paths",
  "practice",
  "studio",
  "more",
] as const;
export const secondaryRoutes = ["lab", "codex", "mirror", "settings"] as const;
export const routes = [...primaryRoutes, ...secondaryRoutes] as const;

export type AppRoute = (typeof routes)[number];

export const routeLabels: Record<AppRoute, string> = {
  today: "Today",
  paths: "Paths",
  practice: "Practice",
  studio: "Studio",
  more: "More",
  lab: "Lab",
  codex: "Codex",
  mirror: "Mirror",
  settings: "Settings",
};

export type InvalidAppLink = {
  reason: "invalid-record-id" | "malformed-path" | "unknown-route";
  requestedHash: string;
};

export type AppLocation =
  | {
      kind: "base";
      route: AppRoute;
      /** Present only when the requested hash was rejected and fell back safely. */
      invalidLink: InvalidAppLink | null;
    }
  | {
      kind: "codex-record";
      route: "codex";
      recordId: string;
      invalidLink: null;
    }
  | {
      kind: "mirror-source";
      route: "mirror";
      recordId: string;
      invalidLink: null;
    };

const LEGACY_MIRROR_SOURCE_PREFIX = "#mirror-source-";

export function isAppRoute(value: string): value is AppRoute {
  return (routes as readonly string[]).includes(value);
}

function baseLocation(
  route: AppRoute,
  invalidLink: InvalidAppLink | null = null,
): AppLocation {
  return { kind: "base", route, invalidLink };
}

function fallbackLocation(
  route: AppRoute,
  requestedHash: string,
  reason: InvalidAppLink["reason"],
): AppLocation {
  return baseLocation(route, { reason, requestedHash });
}

function encodeEntityIdSegment(recordId: string): string {
  let encoded = "";
  for (let index = 0; index < recordId.length; index += 1) {
    const codeUnit = recordId.charCodeAt(index);
    if (codeUnit >= 0xd800 && codeUnit <= 0xdbff) {
      const nextCodeUnit = recordId.charCodeAt(index + 1);
      if (nextCodeUnit >= 0xdc00 && nextCodeUnit <= 0xdfff) {
        encoded += encodeURIComponent(recordId.slice(index, index + 2));
        index += 1;
      } else {
        encoded += `%u${codeUnit.toString(16).toUpperCase().padStart(4, "0")}`;
      }
    } else if (codeUnit >= 0xdc00 && codeUnit <= 0xdfff) {
      encoded += `%u${codeUnit.toString(16).toUpperCase().padStart(4, "0")}`;
    } else {
      encoded += encodeURIComponent(recordId[index] ?? "");
    }
  }
  return encoded;
}

function decodeEntityIdSegment(encodedId: string): string | null {
  if (!encodedId) return null;

  let decodedId = "";
  try {
    const components = encodedId.split(/(%u[0-9a-fA-F]{4})/u);
    for (const component of components) {
      const escapedCodeUnit = /^%u([0-9a-fA-F]{4})$/u.exec(component);
      decodedId += escapedCodeUnit
        ? String.fromCharCode(Number.parseInt(escapedCodeUnit[1] ?? "", 16))
        : decodeURIComponent(component);
    }
  } catch {
    return null;
  }

  const result = EntityIdSchema.safeParse(decodedId);
  if (!result.success || result.data !== decodedId) return null;
  return decodedId;
}

function assertExactEntityId(recordId: string): void {
  const result = EntityIdSchema.safeParse(recordId);
  if (!result.success || result.data !== recordId) {
    throw new TypeError("Record ID must be an exact valid QCTP entity ID.");
  }
}

export function hashForCodexRecord(recordId: string): string {
  assertExactEntityId(recordId);
  return `#/codex/record/${encodeEntityIdSegment(recordId)}`;
}

export function hashForMirrorSource(recordId: string): string {
  assertExactEntityId(recordId);
  return `#/mirror/source/${encodeEntityIdSegment(recordId)}`;
}

export function hashForAppLocation(location: AppLocation): string {
  switch (location.kind) {
    case "base":
      return `#/${location.route}`;
    case "codex-record":
      return hashForCodexRecord(location.recordId);
    case "mirror-source":
      return hashForMirrorSource(location.recordId);
  }
}

export function isLegacyMirrorSourceHash(hash: string): boolean {
  return hash.startsWith(LEGACY_MIRROR_SOURCE_PREFIX);
}

export function parseAppLocation(hash: string): AppLocation {
  if (isLegacyMirrorSourceHash(hash)) {
    const recordId = decodeEntityIdSegment(
      hash.slice(LEGACY_MIRROR_SOURCE_PREFIX.length),
    );
    return recordId === null
      ? fallbackLocation("mirror", hash, "invalid-record-id")
      : {
          kind: "mirror-source",
          route: "mirror",
          recordId,
          invalidLink: null,
        };
  }

  const path = hash.replace(/^#\/?/u, "");
  if (!path) return baseLocation("today");

  const segments = path.split("/");
  const topLevel = segments[0] ?? "";

  if (segments.length === 1) {
    return isAppRoute(topLevel)
      ? baseLocation(topLevel)
      : fallbackLocation("today", hash, "unknown-route");
  }

  const fallbackRoute = isAppRoute(topLevel) ? topLevel : "today";
  const expectedRecordSegment =
    topLevel === "codex" ? "record" : topLevel === "mirror" ? "source" : null;

  if (
    expectedRecordSegment === null ||
    segments.length !== 3 ||
    segments[1] !== expectedRecordSegment
  ) {
    return fallbackLocation(
      fallbackRoute,
      hash,
      isAppRoute(topLevel) ? "malformed-path" : "unknown-route",
    );
  }

  const recordId = decodeEntityIdSegment(segments[2] ?? "");
  if (recordId === null) {
    return fallbackLocation(fallbackRoute, hash, "invalid-record-id");
  }

  return topLevel === "codex"
    ? {
        kind: "codex-record",
        route: "codex",
        recordId,
        invalidLink: null,
      }
    : {
        kind: "mirror-source",
        route: "mirror",
        recordId,
        invalidLink: null,
      };
}

export function routeFromHash(hash: string): AppRoute {
  return parseAppLocation(hash).route;
}
