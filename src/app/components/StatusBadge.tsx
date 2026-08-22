export type LifecycleStatus =
  "released" | "ready" | "in-progress" | "reserved" | "experimental";

const labels: Record<LifecycleStatus, string> = {
  released: "Released",
  ready: "Ready",
  "in-progress": "In progress",
  reserved: "Reserved",
  experimental: "Experimental",
};

export function StatusBadge({ status }: { status: LifecycleStatus }) {
  return (
    <span className={`status-badge status-${status}`}>{labels[status]}</span>
  );
}
