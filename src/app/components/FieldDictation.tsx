import { useCallback, useMemo, useState } from "react";

import {
  acceptVoiceCapture,
  RepositoryCapturePersistence,
  VoiceRecorderPanel,
  type AcceptedCapture,
  type CaptureDestination,
} from "../../voice-capture";
import { useQctp } from "../qctp-context";

export interface FieldDictationProps {
  fieldTargetId: string;
  destination: CaptureDestination;
  onAppend(text: string): Promise<void> | void;
}

export function FieldDictation(props: FieldDictationProps) {
  const { fieldTargetId, destination } = props;
  const runtime = useQctp();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const persistence = useMemo(
    () => new RepositoryCapturePersistence(runtime.repository),
    [runtime.repository],
  );

  const accept = useCallback(
    async (capture: AcceptedCapture) => {
      await acceptVoiceCapture(runtime.repository, {
        ...capture,
        destination,
        fieldTargetId,
      });
      if (capture.manualText) {
        await props.onAppend(capture.manualText);
        setStatus(
          "Accepted manual text appended once. Raw audio remains separately linked.",
        );
      } else {
        setStatus(
          capture.queueLocalTranscription
            ? "Raw audio accepted. The local transcript is queued and remains linked to this field."
            : "Raw audio accepted and linked. Add manual text or connect local transcription later.",
        );
      }
      await runtime.refresh();
      if (
        capture.queueLocalTranscription &&
        runtime.localTranscriptionStatus === "ready"
      ) {
        void runtime.processTranscriptionQueue();
      }
      setOpen(false);
    },
    [destination, fieldTargetId, props, runtime],
  );

  return (
    <div className="field-dictation">
      <button
        className="field-dictate-button"
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <span className="mini-mic" aria-hidden="true" /> Dictate
      </button>
      {open ? (
        <div className="field-recorder-shell">
          <VoiceRecorderPanel
            persistence={persistence}
            mode="field"
            initialDestination={destination}
            fieldTargetId={fieldTargetId}
            localTranscriptionAvailable={
              runtime.localTranscriptionStatus === "ready"
            }
            onAccept={accept}
            onClose={() => setOpen(false)}
          />
        </div>
      ) : null}
      {status ? (
        <small className="field-dictation-status" role="status">
          {status}
        </small>
      ) : null}
    </div>
  );
}
