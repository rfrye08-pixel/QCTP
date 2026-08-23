export function StartupFailureNotice({
  message,
  onReload,
}: {
  readonly message: string | null;
  readonly onReload: () => void;
}) {
  if (message === null) return null;
  return (
    <aside className="qctp-startup-alert" role="alert">
      <strong>Offline package check needs attention.</strong> {message}
      <button
        className="qctp-recovery-secondary"
        type="button"
        onClick={onReload}
      >
        Reload package check
      </button>
    </aside>
  );
}
