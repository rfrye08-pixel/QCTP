import {
  CONTROLLED_CONTENT_CLASS_DETAILS,
  getControlledContent,
} from "../../controlled-content";
import type { CodexRecord } from "../../domain";
import {
  SOURCE_TRACK_LIFECYCLE_DETAILS,
  SourceTrackReferenceSchema,
} from "../../source-tracks";

const CONTROLLED_COMPATIBILITY_FIELD_KEYS = new Set([
  "contentClass",
  "controlledContentAuthorityKey",
]);

function visibleUserRecordFields(
  fields: Readonly<Record<string, unknown>>,
  hasControlledSourceTrackReference: boolean,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(fields).filter(
      ([key]) =>
        !CONTROLLED_COMPATIBILITY_FIELD_KEYS.has(key) &&
        !(hasControlledSourceTrackReference && key === "sourceTrackRef"),
    ),
  );
}

export function UserRecordStructuredFields({
  record,
}: {
  record: Pick<CodexRecord, "contentRef" | "controlledContentHold" | "fields">;
}) {
  const controlled = record.contentRef
    ? getControlledContent(record.contentRef.authorityKey)
    : null;
  const classDetails = record.contentRef
    ? CONTROLLED_CONTENT_CLASS_DETAILS[record.contentRef.contentClass]
    : null;
  const parsedSourceTrackReference = SourceTrackReferenceSchema.safeParse(
    record.fields.sourceTrackRef,
  );
  const sourceTrackReference =
    parsedSourceTrackReference.success &&
    record.contentRef &&
    parsedSourceTrackReference.data.contentRefs.some(
      (contentRef) =>
        contentRef.authorityKey === record.contentRef?.authorityKey &&
        contentRef.contentClass === record.contentRef.contentClass,
    )
      ? parsedSourceTrackReference.data
      : null;
  const visibleFields = visibleUserRecordFields(
    record.fields,
    sourceTrackReference !== null,
  );

  return (
    <>
      {record.controlledContentHold ? (
        <div
          className="record-controlled-content-hold"
          data-controlled-content-hold={record.controlledContentHold.code}
        >
          <dt>Controlled-content recovery hold</dt>
          <dd>
            <strong>Authority mapping required</strong>
            <span>
              Authority:{" "}
              <code>{record.controlledContentHold.authorityKey}</code>
            </span>
            <span>
              Original value:{" "}
              <code>{record.controlledContentHold.rawValue}</code>
            </span>
            <span className="record-controlled-content-hold-note">
              Recovery export remains available. Editing and validated import
              stay blocked until this value has a controlled mapping. No data
              was changed.
            </span>
          </dd>
        </div>
      ) : null}
      {record.contentRef ? (
        <div className="record-template-origin">
          <dt>Originating template / tool</dt>
          <dd
            data-originating-controlled-tool={record.contentRef.authorityKey}
            data-template-tool-class={record.contentRef.contentClass}
          >
            <strong>
              {controlled?.title ?? record.contentRef.authorityKey}
            </strong>
            <span className="record-template-origin-class">
              Template/tool class: {classDetails?.label ?? "Controlled content"}{" "}
              (<code>{record.contentRef.contentClass}</code>)
            </span>
            <span className="record-template-origin-note">
              This controlled class belongs to the QCTP template or tool that
              prompted the record. Your observation, interpretation, and result
              remain user evidence.
            </span>
          </dd>
        </div>
      ) : null}
      {sourceTrackReference ? (
        <div
          className="record-source-track-origin"
          data-source-track-origin={sourceTrackReference.trackId}
          data-source-track-access={sourceTrackReference.accessId}
        >
          <dt>Controlled source-track origin</dt>
          <dd>
            <strong>{sourceTrackReference.trackLabel}</strong>
            <span>{sourceTrackReference.accessLabel}</span>
            <span>
              Lifecycle:{" "}
              {
                SOURCE_TRACK_LIFECYCLE_DETAILS[
                  sourceTrackReference.accessStatus
                ].label
              }
            </span>
            <span className="record-template-origin-note">
              This registry binding identifies the controlled tool scope. Your
              observation, interpretation, and result remain user evidence.
            </span>
          </dd>
        </div>
      ) : null}
      <div className="user-record-structured-fields">
        <dt>Structured fields</dt>
        <dd>
          <pre>{JSON.stringify(visibleFields, null, 2)}</pre>
        </dd>
      </div>
    </>
  );
}
