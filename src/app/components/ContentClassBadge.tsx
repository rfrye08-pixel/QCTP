import { Fragment } from "react";

import {
  CONTROLLED_CONTENT_CLASS_DETAILS,
  getControlledContent,
  type ControlledContentClass,
} from "../../controlled-content";

function CanonicalClassToken({
  contentClass,
}: {
  contentClass: ControlledContentClass;
}) {
  const segments = contentClass.split("_");
  return segments.map((segment, index) => (
    <Fragment key={`${segment}-${String(index)}`}>
      {segment}
      {index < segments.length - 1 ? (
        <>
          _<wbr />
        </>
      ) : null}
    </Fragment>
  ));
}

export function ContentClassBadge({
  authorityKey,
  scope,
}: {
  authorityKey: string;
  scope: string;
}) {
  const controlled = getControlledContent(authorityKey);
  if (!controlled) {
    return (
      <span
        className="content-class-badge content-class-hold"
        data-content-authority={authorityKey}
        data-content-class="HELD"
        aria-label={`${scope}. Controlled content authority hold.`}
      >
        <span className="content-class-meaning">{scope}: AUTHORITY HOLD</span>
      </span>
    );
  }
  const details = CONTROLLED_CONTENT_CLASS_DETAILS[controlled.contentClass];
  return (
    <span
      className="content-class-badge"
      data-content-authority={authorityKey}
      data-content-class={controlled.contentClass}
      aria-label={`${scope}. Content class: ${controlled.contentClass}. ${details.description}`}
      title={`${details.label}: ${details.description}`}
    >
      <span className="content-class-meaning">
        {scope}: {details.label}
      </span>
      <span className="content-class-token">
        {" "}
        (<CanonicalClassToken contentClass={controlled.contentClass} />)
      </span>
    </span>
  );
}
