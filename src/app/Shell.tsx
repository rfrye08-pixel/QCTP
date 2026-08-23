import type { ReactNode } from "react";

import { primaryRoutes, routeLabels, type AppRoute } from "./routes";

export function Shell({
  route,
  onNavigate,
  onQuickCapture,
  foundationDay,
  practiceActive = false,
  inactiveForModal = false,
  children,
}: {
  route: AppRoute;
  onNavigate: (route: AppRoute) => void;
  onQuickCapture: (trigger: HTMLButtonElement) => void;
  foundationDay: number;
  practiceActive?: boolean;
  inactiveForModal?: boolean;
  children: ReactNode;
}) {
  const primaryRoute = primaryRoutes.includes(
    route as (typeof primaryRoutes)[number],
  )
    ? route
    : "more";

  return (
    <div
      className="app-frame"
      inert={inactiveForModal || undefined}
      aria-hidden={inactiveForModal || undefined}
    >
      <header className="app-bar">
        <button
          className="wordmark"
          type="button"
          disabled={practiceActive}
          aria-label={
            practiceActive
              ? "QCTP — navigation locked during active practice"
              : "QCTP — go to Today"
          }
          onClick={() => onNavigate("today")}
        >
          <span>QCTP</span>
          <small>Platform Rev3 candidate</small>
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

      {practiceActive ? null : (
        <button
          type="button"
          className="quick-capture-button"
          aria-label="Open Voice Capture"
          onClick={(event) => onQuickCapture(event.currentTarget)}
        >
          <span className="mic-glyph" aria-hidden="true" />
          <span>Voice Capture</span>
        </button>
      )}

      {practiceActive ? null : (
        <nav className="bottom-nav" aria-label="Primary navigation">
          {primaryRoutes.map((item) => (
            <button
              key={item}
              type="button"
              className={primaryRoute === item ? "active" : undefined}
              aria-current={primaryRoute === item ? "page" : undefined}
              onClick={() => onNavigate(item)}
            >
              <span
                className={`nav-mark nav-mark-${item}`}
                aria-hidden="true"
              />
              {routeLabels[item]}
            </button>
          ))}
        </nav>
      )}
    </div>
  );
}
