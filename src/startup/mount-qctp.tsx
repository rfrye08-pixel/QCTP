import type { ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";

import { QctpErrorBoundary } from "./QctpErrorBoundary";
import { StartupFailureNotice } from "./StartupFailureNotice";

export interface PwaLifecycleFailure {
  readonly scope: "PWA_LIFECYCLE";
  readonly message: string;
}

interface MountQctpApplicationOptions {
  readonly container: HTMLElement;
  readonly application: ReactNode;
  readonly startPwaLifecycle: () => void;
  readonly onReload?: () => void;
  readonly reportStartupError?: (error: unknown) => void;
}

function reportStartupError(error: unknown): void {
  console.error("QCTP PWA lifecycle startup failed safely.", error);
}

export function startPwaLifecycleSafely(
  start: () => void,
  reportError: (error: unknown) => void = reportStartupError,
): PwaLifecycleFailure | null {
  try {
    start();
    return null;
  } catch (error) {
    reportError(error);
    return {
      scope: "PWA_LIFECYCLE",
      message:
        "QCTP opened, but its offline app-package check could not start. Available local features and saved records remain intact.",
    };
  }
}

export function mountQctpApplication({
  container,
  application,
  startPwaLifecycle,
  onReload = () => window.location.reload(),
  reportStartupError: reportError = reportStartupError,
}: MountQctpApplicationOptions): Root {
  const pwaFailure = startPwaLifecycleSafely(startPwaLifecycle, reportError);
  const root = createRoot(container);
  root.render(
    <QctpErrorBoundary onReload={onReload}>
      <StartupFailureNotice
        message={pwaFailure?.message ?? null}
        onReload={onReload}
      />
      {application}
    </QctpErrorBoundary>,
  );
  return root;
}
