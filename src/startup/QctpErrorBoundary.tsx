import { Component, Fragment, type ErrorInfo, type ReactNode } from "react";

interface QctpErrorBoundaryProps {
  readonly children: ReactNode;
  readonly onReload?: () => void;
}

interface QctpErrorBoundaryState {
  readonly failed: boolean;
  readonly retryKey: number;
}

function reloadQctp(): void {
  window.location.reload();
}

export class QctpErrorBoundary extends Component<
  QctpErrorBoundaryProps,
  QctpErrorBoundaryState
> {
  public override state: QctpErrorBoundaryState = {
    failed: false,
    retryKey: 0,
  };

  public static getDerivedStateFromError(): Partial<QctpErrorBoundaryState> {
    return { failed: true };
  }

  public override componentDidCatch(error: unknown, details: ErrorInfo): void {
    console.error("QCTP top-level render failed safely.", error, details);
  }

  private readonly retry = (): void => {
    this.setState((current) => ({
      failed: false,
      retryKey: current.retryKey + 1,
    }));
  };

  private readonly reload = (): void => {
    (this.props.onReload ?? reloadQctp)();
  };

  public override render(): ReactNode {
    if (this.state.failed) {
      return (
        <main className="qctp-recovery-shell" role="alert">
          <section
            className="qctp-recovery-card"
            aria-labelledby="qctp-recovery-title"
          >
            <div className="qctp-recovery-mark" aria-hidden="true">
              <span>Q</span>
            </div>
            <p className="qctp-recovery-eyebrow">QCTP · safe recovery</p>
            <h1 id="qctp-recovery-title">The app paused safely.</h1>
            <p className="qctp-recovery-copy">
              QCTP could not finish drawing this screen. Try the screen again,
              or reload the local app package.
            </p>
            <div className="qctp-recovery-actions">
              <button
                className="qctp-recovery-primary"
                type="button"
                onClick={this.retry}
              >
                Try again
              </button>
              <button
                className="qctp-recovery-secondary"
                type="button"
                onClick={this.reload}
              >
                Reload QCTP
              </button>
            </div>
            <p className="qctp-recovery-note">
              Neither action clears local recordings, journal entries, workbook
              answers, or queued requests.
            </p>
          </section>
        </main>
      );
    }

    return <Fragment key={this.state.retryKey}>{this.props.children}</Fragment>;
  }
}
