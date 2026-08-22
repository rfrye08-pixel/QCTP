import type { ReactNode } from "react";

import { primaryRoutes, routeLabels, type AppRoute } from "./routes";

export function Shell({
  route,
  onNavigate,
  onQuickCapture,
  foundationDay,
  children,
}: {
  route: AppRoute;
  onNavigate: (route: AppRoute) => void;
  onQuickCapture: () => void;
  foundationDay: number;
  children: ReactNode;
}) {
  const primaryRoute = primaryRoutes.includes(
    route as (typeof primaryRoutes)[number],
  )
    ? route
    : "more";

  return (
    <div className="app-frame">
      <header className="app-bar">
        <button
          className="wordmark"
          type="button"
          onClick={() => onNavigate("today")}
        >
          <span>QCTP</span>
          <small>Platform Rev2</small>
        </button>
        <div className="day-marker">
          <span>Foundation</span>
          <strong>
            Day {foundationDay}
            {foundationDay > 1 ? " · Reserved" : ""}
          </strong>
        </div>
      </header>

      <main id="main-content" className="page-content">
        {children}
      </main>

      <button
        type="button"
        className="quick-capture-button"
        aria-label="Open Quick Capture"
        onClick={onQuickCapture}
      >
        <span className="mic-glyph" aria-hidden="true" />
        <span>Quick Capture</span>
      </button>

      <nav className="bottom-nav" aria-label="Primary navigation">
        {primaryRoutes.map((item) => (
          <button
            key={item}
            type="button"
            className={primaryRoute === item ? "active" : undefined}
            aria-current={primaryRoute === item ? "page" : undefined}
            onClick={() => onNavigate(item)}
          >
            <span className={`nav-mark nav-mark-${item}`} aria-hidden="true" />
            {routeLabels[item]}
          </button>
        ))}
      </nav>
    </div>
  );
}
