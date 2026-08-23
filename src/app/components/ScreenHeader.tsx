import type { ReactNode } from "react";

export function ScreenHeader({
  eyebrow,
  title,
  children,
  className = "",
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <header className={`screen-header ${className}`.trim()}>
      <p className="eyebrow">{eyebrow}</p>
      <h1>{title}</h1>
      {children ? <div className="screen-intro">{children}</div> : null}
    </header>
  );
}
