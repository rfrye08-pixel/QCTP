import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";

import { getReg01CompletionIssues, RegCompletionError } from "../../data";
import {
  AttachmentSchema,
  type Attachment,
  type RegSession,
} from "../../domain";
import {
  REG01_PRECEPT,
  REG01_PROMPT,
  REG01_SESSION_ID,
  REG01_STEPS,
  addReg01Attachment,
  createOrResumeReg01Session,
  linkReg01AutoDictationRecording,
  setReg01PreceptComplete,
  setReg01Step,
  setReg01Text,
  type Reg01TextField,
} from "../../reg/reg01";
import {
  RepositoryCapturePersistence,
  VoiceRecorderPanel,
  acceptVoiceCapture,
  type AcceptedCapture,
} from "../../voice-capture";
import { ScreenHeader } from "../components/ScreenHeader";
import { StatusBadge } from "../components/StatusBadge";
import { useQctp } from "../qctp-context";

import "../studio-styles.css";

type SaveState = "idle" | "saving" | "saved" | "error";

function makeLocalId(prefix: string): string {
  const random =
    globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  return `${prefix}-${random}`;
}

function formatSavedAt(value: string | null): string {
  if (!value) return "Not completed";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function GeometryReference() {
  return (
    <svg
      className="studio-geometry"
      viewBox="0 0 600 360"
      role="img"
      aria-labelledby="reg-geometry-title reg-geometry-description"
    >
      <title id="reg-geometry-title">Two equal intersecting circles</title>
      <desc id="reg-geometry-description">
        Two circles share the same radius. Each center rests on the other
        circle, with a vertical shared chord through the two intersection
        points.
      </desc>
      <rect width="600" height="360" rx="24" fill="#09101a" />
      <line x1="60" y1="180" x2="540" y2="180" className="studio-axis" />
      <line x1="240" y1="38" x2="240" y2="322" className="studio-axis" />
      <circle
        cx="240"
        cy="180"
        r="120"
        className="studio-circle studio-circle-a"
      />
      <circle
        cx="360"
        cy="180"
        r="120"
        className="studio-circle studio-circle-b"
      />
      <line x1="300" y1="76" x2="300" y2="284" className="studio-chord" />
      <circle cx="240" cy="180" r="6" className="studio-point studio-point-a" />
      <circle cx="360" cy="180" r="6" className="studio-point studio-point-b" />
      <circle cx="300" cy="76" r="6" className="studio-point studio-point-i" />
      <circle cx="300" cy="284" r="6" className="studio-point studio-point-i" />
      <text x="216" y="211" className="studio-label">
        A
      </text>
      <text x="374" y="211" className="studio-label">
        B
      </text>
      <text x="312" y="67" className="studio-intersection-label">
        intersection
      </text>
      <text x="312" y="307" className="studio-intersection-label">
        intersection
      </text>
    </svg>
  );
}

export function StudioScreen() {
  const runtime = useQctp();
  const { repository } = runtime;
  const [session, setSession] = useState<RegSession | null>(null);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [artifactKind, setArtifactKind] = useState<"image" | "drawing">(
    "image",
  );
  const [recorderOpen, setRecorderOpen] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [completionBusy, setCompletionBusy] = useState(false);
  const sessionRef = useRef<RegSession | null>(null);
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
  const saveSerialRef = useRef(0);
  const persistence = useMemo(
    () => new RepositoryCapturePersistence(repository),
    [repository],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const stored = await repository.getRegSession(REG01_SESSION_ID);
        const resumed = createOrResumeReg01Session(stored);
        if (!stored) await repository.saveRegSession(resumed);
        const storedAttachments = await repository.listAttachments(resumed.id);
        if (cancelled) return;
        sessionRef.current = resumed;
        setSession(resumed);
        setAttachments(
          storedAttachments.filter(
            (attachment) =>
              resumed.attachmentIds.includes(attachment.id) &&
              (attachment.kind === "image" || attachment.kind === "drawing"),
          ),
        );
        setSaveState("saved");
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "REG-01 could not be opened from local storage.",
          );
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [repository]);

  useEffect(() => {
    const latest = attachments.at(-1);
    if (!latest || typeof URL.createObjectURL !== "function") {
      return undefined;
    }
    let cancelled = false;
    let nextUrl: string | null = null;
    void repository
      .getAttachmentBlob(latest.id)
      .then((blob) => {
        if (!blob || cancelled) return;
        try {
          nextUrl = URL.createObjectURL(blob);
          setPreviewUrl(nextUrl);
        } catch {
          // Blob storage remains authoritative when a runtime cannot create preview URLs.
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (nextUrl) URL.revokeObjectURL(nextUrl);
    };
  }, [attachments, repository]);

  const commitSession = useCallback(
    (next: RegSession) => {
      sessionRef.current = next;
      setSession(next);
      setSaveState("saving");
      setError(null);
      const serial = saveSerialRef.current + 1;
      saveSerialRef.current = serial;
      const save = saveChainRef.current
        .catch(() => undefined)
        .then(async () => {
          await repository.saveRegSession(next);
        });
      saveChainRef.current = save;
      void save
        .then(() => {
          if (saveSerialRef.current === serial) setSaveState("saved");
        })
        .catch((saveError) => {
          if (saveSerialRef.current === serial) setSaveState("error");
          setError(
            saveError instanceof Error
              ? saveError.message
              : "This change could not be written to local storage.",
          );
        });
    },
    [repository],
  );

  const changeText = useCallback(
    (field: Reg01TextField, value: string) => {
      const current = sessionRef.current;
      if (!current || current.status === "complete") return;
      commitSession(setReg01Text(current, field, value));
    },
    [commitSession],
  );

  const changeStep = useCallback(
    (index: number, complete: boolean) => {
      const current = sessionRef.current;
      if (!current || current.status === "complete") return;
      commitSession(setReg01Step(current, index, complete));
    },
    [commitSession],
  );

  const changePrecept = useCallback(
    (complete: boolean) => {
      const current = sessionRef.current;
      if (!current || current.status === "complete") return;
      commitSession(setReg01PreceptComplete(current, complete));
    },
    [commitSession],
  );

  const acceptDictation = useCallback(
    async (capture: AcceptedCapture) => {
      const current = sessionRef.current;
      if (!current)
        throw new Error("The REG-01 session has not finished loading.");
      const accepted = await acceptVoiceCapture(repository, {
        ...capture,
        title: "REG-01-A five-minute auto-dictation",
        destination: "studio",
        tags: [...new Set([...capture.tags, "reg-01", "auto-dictation"])],
        fieldTargetId: current.id,
      });
      const linked = linkReg01AutoDictationRecording(
        current,
        capture.recordingId,
        capture.durationMs,
      );
      if (capture.manualText.trim()) {
        commitSession(
          setReg01Text(linked, "autoDictation", capture.manualText, undefined, [
            capture.recordingId,
            accepted.record.id,
          ]),
        );
        setNotice(
          "Raw audio and its accepted manual text were linked to this session.",
        );
      } else {
        commitSession(linked);
        setNotice(
          "Raw audio was linked to this session. Add the raw text below now or after local transcription.",
        );
      }
      await runtime.refresh();
    },
    [commitSession, repository, runtime],
  );

  const addArtifact = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      const current = sessionRef.current;
      if (!file || !current || current.status === "complete") return;
      if (!file.type.startsWith("image/")) {
        setError(
          "Choose an image file containing the photographed or drawn construction.",
        );
        return;
      }
      setAttachmentBusy(true);
      setError(null);
      try {
        const now = new Date().toISOString();
        const id = makeLocalId("reg-artifact");
        const attachment = AttachmentSchema.parse({
          schemaVersion: 1,
          id,
          parentId: current.id,
          kind: artifactKind,
          filename: file.name || `reg-01-${artifactKind}`,
          mimeType: file.type,
          sizeBytes: file.size,
          localBlobRef: `${id}:blob`,
          remoteObjectRef: null,
          checksumSha256: null,
          createdAt: now,
          deletedAt: null,
        });
        await repository.saveAttachment(attachment, file);
        setAttachments((values) => [...values, attachment]);
        commitSession(addReg01Attachment(current, attachment.id, now));
        setNotice(
          `${artifactKind === "image" ? "Photograph" : "Drawing"} saved as a local IndexedDB Blob.`,
        );
      } catch (attachmentError) {
        setError(
          attachmentError instanceof Error
            ? attachmentError.message
            : "The artifact could not be stored locally.",
        );
      } finally {
        setAttachmentBusy(false);
      }
    },
    [artifactKind, commitSession, repository],
  );

  const completeSession = useCallback(async () => {
    const current = sessionRef.current;
    if (!current || current.status === "complete") return;
    setCompletionBusy(true);
    setError(null);
    setNotice(null);
    try {
      await saveChainRef.current;
      const result = await repository.completeReg01(current.id);
      sessionRef.current = result.session;
      setSession(result.session);
      setSaveState("saved");
      setNotice(
        "REG-01 completed atomically across Studio, Codex, Mirror, and the Grant path.",
      );
      await runtime.refresh();
    } catch (completionError) {
      if (completionError instanceof RegCompletionError) {
        setError(completionError.issues.join(". "));
      } else {
        setError(
          completionError instanceof Error
            ? completionError.message
            : "REG-01 completion could not be committed.",
        );
      }
    } finally {
      setCompletionBusy(false);
    }
  }, [repository, runtime]);

  if (!session) {
    return (
      <section className="panel-card studio-loading" aria-live="polite">
        <p className="eyebrow">Geometry Studio · REG-01-A</p>
        <h1>{error ? "Studio held" : "Opening the local session…"}</h1>
        {error ? (
          <p role="alert">{error}</p>
        ) : (
          <p>Restoring steps, evidence, and artifacts from IndexedDB.</p>
        )}
      </section>
    );
  }

  const complete = session.status === "complete";
  const locked = complete || completionBusy;
  const checkedSteps = session.steps.filter((step) => step.complete).length;
  const issues = getReg01CompletionIssues(session);
  const artifactReady = attachments.some(
    (attachment) =>
      attachment.kind === "image" || attachment.kind === "drawing",
  );
  const readinessIssues = artifactReady
    ? issues
    : [
        ...issues.filter((issue) => !issue.includes("photograph or drawing")),
        "a geometry photograph or drawing is required",
      ];
  const ready = readinessIssues.length === 0;
  const readyForCommit = ready && !recorderOpen && !attachmentBusy;
  const latestAttachment = attachments.at(-1);

  return (
    <div className="studio-screen">
      <ScreenHeader eyebrow="Geometry Studio · REG-01-A" title="Learn to See">
        <p>
          Construct two equal circles by hand, preserve observation before
          interpretation, and carry one verified insight into daily life.
        </p>
      </ScreenHeader>

      <section className="panel-card studio-intro">
        <div className="card-heading">
          <div>
            <p className="eyebrow">Original QCTP exercise</p>
            <h2>Eyes-open studio · 35 minutes</h2>
          </div>
          {complete ? (
            <span className="status-badge studio-status-complete">
              Complete
            </span>
          ) : (
            <StatusBadge status="in-progress" />
          )}
        </div>
        <p>
          Inspired by Robert Edward Grant’s public geometry-learning framework.
          This does not reproduce a paid lesson, worksheet, image, or
          proprietary prompt.
        </p>
        <div className="studio-safety">
          Use only while seated at a safe desk or work surface. Do not combine
          this exercise with driving, tools, machinery, ladders, or other
          hazardous activity.
        </div>
        <div
          className="studio-progress"
          aria-label={`${checkedSteps} of 9 controlled steps complete`}
        >
          <span
            style={{ width: `${(checkedSteps / REG01_STEPS.length) * 100}%` }}
          />
        </div>
        <p className="studio-save-state" aria-live="polite">
          {complete
            ? `Completed ${formatSavedAt(session.completedAt)}`
            : saveState === "saving"
              ? "Saving locally…"
              : saveState === "error"
                ? "Local save needs attention."
                : `${checkedSteps} of 9 steps · progress saved on this device`}
        </p>
      </section>

      <section className="panel-card studio-reference">
        <p className="eyebrow">Reference construction</p>
        <h2>Two equal circles</h2>
        <GeometryReference />
        <p className="fine-print">
          Keep one compass radius unchanged. Place the second center on the
          first circle’s boundary so each circle passes through the other’s
          center.
        </p>
      </section>

      <section className="panel-card" aria-labelledby="reg-steps-heading">
        <div className="card-heading">
          <div>
            <p className="eyebrow">Controlled session sequence</p>
            <h2 id="reg-steps-heading">Complete all nine steps</h2>
          </div>
          <span className="counter">{checkedSteps} / 9</span>
        </div>
        <div className="studio-steps">
          {REG01_STEPS.map((step, index) => (
            <label
              className={`studio-step${session.steps[index]?.complete ? " is-complete" : ""}`}
              key={session.steps[index]?.id ?? step}
            >
              <input
                type="checkbox"
                checked={session.steps[index]?.complete ?? false}
                disabled={locked}
                onChange={(event) => changeStep(index, event.target.checked)}
              />
              <span className="studio-step-number" aria-hidden="true">
                {index + 1}
              </span>
              <span>{step}</span>
            </label>
          ))}
        </div>
      </section>

      <section
        className="panel-card studio-evidence"
        aria-labelledby="reg-observation-heading"
      >
        <p className="eyebrow">Evidence layer 1 · raw observation</p>
        <h2 id="reg-observation-heading">Describe before interpreting</h2>
        <p>
          Record only visible, measurable, or bodily facts: line quality,
          symmetry, spacing, intersections, construction error, body tension,
          and attention changes.
        </p>
        <label>
          Raw observation <span aria-hidden="true">*</span>
          <textarea
            value={session.rawObservation?.text ?? ""}
            disabled={locked}
            onChange={(event) =>
              changeText("rawObservation", event.target.value)
            }
            placeholder="Example: The shared chord is vertical; the upper intersection is darker than the lower…"
            rows={6}
          />
        </label>
        <div className="studio-layer-separator" aria-hidden="true" />
        <p className="eyebrow">Evidence layer 2 · optional interpretation</p>
        <label>
          Meaning, symbolism, hypotheses, or associations
          <textarea
            value={session.interpretation?.text ?? ""}
            disabled={locked}
            onChange={(event) =>
              changeText("interpretation", event.target.value)
            }
            placeholder="Optional. Keep meaning-making separate from what was directly observed."
            rows={5}
          />
        </label>
      </section>

      <section
        className="panel-card studio-auto-dictation"
        aria-labelledby="reg-dictation-heading"
      >
        <p className="eyebrow">Evidence layer 3 · five-minute auto-dictation</p>
        <h2 id="reg-dictation-heading">{REG01_PROMPT}</h2>
        <p>
          Speak continuously for five minutes without organizing or editing. Raw
          audio is written to IndexedDB as it arrives and remains useful even
          without transcription.
        </p>
        {!complete && !recorderOpen ? (
          <button
            className="primary-button"
            type="button"
            disabled={locked}
            onClick={() => setRecorderOpen(true)}
          >
            Record five-minute auto-dictation
          </button>
        ) : null}
        {!complete && recorderOpen ? (
          <div className="studio-recorder-shell">
            <p className="studio-recorder-note">
              Use the default 5-minute duration for REG-01-A.
            </p>
            <VoiceRecorderPanel
              persistence={persistence}
              mode="auto-dictation"
              allowPause={false}
              allowAppend={false}
              initialDestination="studio"
              fieldTargetId={session.id}
              localTranscriptionAvailable={
                runtime.localTranscriptionStatus === "ready"
              }
              onAccept={acceptDictation}
              onClose={() => setRecorderOpen(false)}
            />
          </div>
        ) : null}
        <label className="studio-manual-fallback">
          Raw auto-dictation text <span aria-hidden="true">*</span>
          <textarea
            value={session.autoDictation?.text ?? ""}
            disabled={locked}
            onChange={(event) =>
              changeText("autoDictation", event.target.value)
            }
            placeholder="Enter the raw words here, or paste the verbatim output after no-cost local transcription. Do not clean or interpret this layer."
            rows={7}
          />
          <small>
            Manual entry is the offline fallback. It does not replace or alter
            an accepted raw audio recording.
          </small>
        </label>
      </section>

      <section
        className="panel-card studio-artifact"
        aria-labelledby="reg-artifact-heading"
      >
        <p className="eyebrow">Artifact capture</p>
        <h2 id="reg-artifact-heading">Preserve the construction</h2>
        <p>
          Photograph the paper or upload an image of a drawing. The original
          file is stored as a Blob in IndexedDB—never as Base64 or localStorage
          text.
        </p>
        {previewUrl && latestAttachment ? (
          <figure>
            <img
              src={previewUrl}
              alt="Latest saved REG-01 geometry construction"
            />
            <figcaption>{latestAttachment.filename} · saved locally</figcaption>
          </figure>
        ) : latestAttachment ? (
          <p className="studio-artifact-saved">
            ✓ {latestAttachment.filename} is saved locally.
          </p>
        ) : null}
        {!complete ? (
          <div className="studio-upload-controls">
            <fieldset>
              <legend>Artifact type</legend>
              <label>
                <input
                  type="radio"
                  name="artifact-kind"
                  value="image"
                  checked={artifactKind === "image"}
                  disabled={locked}
                  onChange={() => setArtifactKind("image")}
                />
                Photograph
              </label>
              <label>
                <input
                  type="radio"
                  name="artifact-kind"
                  value="drawing"
                  checked={artifactKind === "drawing"}
                  disabled={locked}
                  onChange={() => setArtifactKind("drawing")}
                />
                Drawing image
              </label>
            </fieldset>
            <label className="studio-upload-button">
              {attachmentBusy
                ? "Saving artifact…"
                : "Photograph or choose image"}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                disabled={locked || attachmentBusy}
                onChange={(event) => void addArtifact(event)}
              />
            </label>
          </div>
        ) : null}
        <p className="fine-print">
          {attachments.length === 0
            ? "A photograph or drawing is required for completion."
            : `${attachments.length} original artifact${attachments.length === 1 ? "" : "s"} preserved for this session.`}
        </p>
      </section>

      <section
        className="panel-card studio-integration"
        aria-labelledby="reg-integration-heading"
      >
        <p className="eyebrow">Integration · precept</p>
        <h2 id="reg-integration-heading">{REG01_PRECEPT}</h2>
        <label>
          One practical daily-life application <span aria-hidden="true">*</span>
          <textarea
            value={session.integrationAction}
            disabled={locked}
            onChange={(event) =>
              changeText("integrationAction", event.target.value)
            }
            placeholder="Today I will pause and name what I directly observed before explaining another person’s intent."
            rows={4}
          />
        </label>
        <label className="studio-precept-check">
          <input
            type="checkbox"
            checked={session.precept.complete}
            disabled={locked}
            onChange={(event) => changePrecept(event.target.checked)}
          />
          <span>
            I practiced “{REG01_PRECEPT}” in at least one real situation.
          </span>
        </label>
        <label>
          Later review (optional; preserved with the precept)
          <textarea
            value={session.precept.review}
            disabled={locked}
            onChange={(event) =>
              changeText("preceptReview", event.target.value)
            }
            placeholder="What changed when observation came first?"
            rows={3}
          />
        </label>
      </section>

      <section
        className="panel-card studio-completion"
        aria-labelledby="reg-completion-heading"
      >
        <div className="card-heading">
          <div>
            <p className="eyebrow">Atomic completion</p>
            <h2 id="reg-completion-heading">Preserve the trace</h2>
          </div>
          {complete ? (
            <span className="status-badge studio-status-complete">
              Complete
            </span>
          ) : (
            <StatusBadge status={readyForCommit ? "ready" : "in-progress"} />
          )}
        </div>
        {complete && session.resultingRecordIds ? (
          <div className="studio-trace" aria-label="Created traceable records">
            <p>
              <strong>Studio geometry</strong>
              <code>{session.resultingRecordIds.studio}</code>
            </p>
            <p>
              <strong>Codex auto-dictation</strong>
              <code>{session.resultingRecordIds.codex}</code>
            </p>
            <p>
              <strong>Mirror reflection</strong>
              <code>{session.resultingRecordIds.mirror}</code>
            </p>
            <p>
              <strong>Grant path</strong>
              <code>REG-01-A complete</code>
            </p>
          </div>
        ) : (
          <ul className="studio-readiness" aria-label="Completion requirements">
            {readinessIssues.length > 0 ? (
              readinessIssues.map((issue) => <li key={issue}>{issue}</li>)
            ) : (
              <li className="is-ready">
                All controlled evidence is ready for one atomic commit.
              </li>
            )}
          </ul>
        )}
        {notice ? (
          <p className="studio-notice" role="status">
            {notice}
          </p>
        ) : null}
        {error ? (
          <p className="studio-error" role="alert">
            {error}
          </p>
        ) : null}
        {!complete ? (
          <button
            className="primary-button"
            type="button"
            disabled={
              !readyForCommit || completionBusy || saveState === "saving"
            }
            onClick={() => void completeSession()}
          >
            {completionBusy
              ? "Committing REG-01…"
              : "Complete REG-01 atomically"}
          </button>
        ) : null}
        <p className="fine-print">
          Completion creates linked Studio, Codex, and Mirror records and
          advances only the controlled Grant path. It does not release or invent
          a later module.
        </p>
      </section>
    </div>
  );
}
