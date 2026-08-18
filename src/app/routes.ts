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

export function isAppRoute(value: string): value is AppRoute {
  return (routes as readonly string[]).includes(value);
}

export function routeFromHash(hash: string): AppRoute {
  const candidate = hash.replace(/^#\/?/, "");
  return isAppRoute(candidate) ? candidate : "today";
}
