import { useCallback, useEffect, useMemo, useState } from "react";

import {
  CodexRecordSchema,
  RevisionSchema,
  createEvidenceLayer,
  userProvenance,
  type CodexRecord,
  type EvidenceClass,
} from "../../domain";
import {
  RepositoryCapturePersistence,
  VoiceRecorderPanel,
  type AcceptedCapture,
} from "../../voice-capture";
import { ScreenHeader } from "../components/ScreenHeader";
import { StatusBadge } from "../components/StatusBadge";
import { useQctp } from "../qctp-context";
import "../platform-styles.css";

type LabRecordType = "lab_protocol" | "lab_result";
type DictationField = "hypothesis" | "procedure" | "controls" | "outcome";

const evidenceClasses: ReadonlyArray<{ value: EvidenceClass; label: string }> =
  [
    { value: "self_reported", label: "Self-reported" },
    { value: "observed", label: "Observed" },
    { value: "measured", label: "Measured" },
    { value: "blinded", label: "Blinded" },
    { value: "sourced", label: "Sourced" },
  ];

function stringField(record: CodexRecord, key: string): string {
  const value = record.fields[key];
  return typeof value === "string" ? value : "";
}

function numberField(record: CodexRecord, key: string): number {
  const value = record.fields[key];
  return typeof value === "number" && Number.isFinite(value) ? value : 1;
}

function formatTimestamp(timestamp: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

export function LabScreen() {
  const runtime = useQctp();
  const { repository, revision } = runtime;
  const capturePersistence = useMemo(
    () => new RepositoryCapturePersistence(repository),
    [repository],
  );
  const [records, setRecords] = useState<CodexRecord[]>([]);
  const [recordType, setRecordType] = useState<LabRecordType>("lab_protocol");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [hypothesis, setHypothesis] = useState("");
  const [procedure, setProcedure] = useState("");
  const [controls, setControls] = useState("");
  const [outcome, setOutcome] = useState("");
  const [linkedProtocolId, setLinkedProtocolId] = useState("");
  const [evidenceClass, setEvidenceClass] = useState<EvidenceClass>("observed");
  const [tagText, setTagText] = useState("");
  const [dictationField, setDictationField] = useState<DictationField | null>(
    null,
  );
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadRecords = useCallback(async () => {
    const values = await repository.listRecords({
      kinds: ["lab_protocol", "lab_result"],
    });
    setRecords(values);
  }, [repository]);

  useEffect(() => {
    let active = true;
    void repository.listRecords({ kinds: ["lab_protocol", "lab_result"] }).then(
      (values) => {
        if (active) setRecords(values);
      },
      (cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "Lab records could not be opened.",
          );
      },
    );
    return () => {
      active = false;
    };
  }, [repository, revision]);

  const protocols = records.filter((record) => record.kind === "lab_protocol");

  const resetForm = useCallback(
    (nextType: LabRecordType = recordType) => {
      setRecordType(nextType);
      setEditingId(null);
      setTitle("");
      setHypothesis("");
      setProcedure("");
      setControls("");
      setOutcome("");
      setLinkedProtocolId("");
      setEvidenceClass("observed");
      setTagText("");
      setStatus(null);
      setError(null);
    },
    [recordType],
  );

  const editRecord = useCallback((record: CodexRecord) => {
    if (record.kind !== "lab_protocol" && record.kind !== "lab_result") return;
    setRecordType(record.kind);
    setEditingId(record.id);
    setTitle(record.title);
    setHypothesis(stringField(record, "hypothesis"));
    setProcedure(stringField(record, "procedure"));
    setControls(stringField(record, "controls"));
    setOutcome(record.observation?.text ?? stringField(record, "outcome"));
    setLinkedProtocolId(stringField(record, "protocolRecordId"));
    setEvidenceClass(record.observation?.evidenceClass ?? "observed");
    setTagText(record.tags.join(", "));
    setStatus(
      `Editing version ${String(numberField(record, "version"))}. Saving creates a new revision.`,
    );
    setError(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const saveRecord = useCallback(async () => {
    setError(null);
    setStatus(null);
    if (!title.trim()) {
      setError("A concise protocol or result title is required.");
      return;
    }
    if (
      recordType === "lab_protocol" &&
      (!hypothesis.trim() || !procedure.trim())
    ) {
      setError("A protocol requires both a hypothesis and a procedure.");
      return;
    }
    if (recordType === "lab_result" && !outcome.trim()) {
      setError("A result requires a raw outcome before it can be saved.");
      return;
    }

    setSaving(true);
    try {
      const now = new Date().toISOString();
      const existing = editingId
        ? await repository.getRecord(editingId)
        : undefined;
      const id = existing?.id ?? `lab-${crypto.randomUUID()}`;
      const version = existing ? numberField(existing, "version") + 1 : 1;
      const revisionId = `revision-${crypto.randomUUID()}`;
      const tags = [
        ...new Set(
          tagText
            .split(",")
            .map((tag) => tag.trim().toLowerCase())
            .filter(Boolean),
        ),
      ];
      const protocolLink =
        recordType === "lab_result" && linkedProtocolId
          ? {
              backlinks: [
                {
                  recordId: linkedProtocolId,
                  relationship: "result-for-protocol",
                },
              ],
              sourceLinks: [
                {
                  id: `${id}:protocol-source`,
                  label: "Linked Lab protocol",
                  sourceType: "qctp_record" as const,
                  url: null,
                  citation: linkedProtocolId,
                  accessedAt: now,
                },
              ],
            }
          : { backlinks: [], sourceLinks: [] };
      const record = CodexRecordSchema.parse({
        schemaVersion: 1,
        id,
        kind: recordType,
        title: title.trim(),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        observation:
          recordType === "lab_result"
            ? createEvidenceLayer(
                `${id}:observation:v${String(version)}`,
                outcome.trim(),
                now,
                evidenceClass,
              )
            : null,
        interpretation: existing?.interpretation ?? null,
        tags,
        ...protocolLink,
        attachmentIds: existing?.attachmentIds ?? [],
        revisionIds: [...(existing?.revisionIds ?? []), revisionId],
        pathId: null,
        sessionId: null,
        fields: {
          hypothesis: hypothesis.trim(),
          procedure: procedure.trim(),
          controls: controls.trim(),
          outcome: outcome.trim(),
          evidenceClassification: evidenceClass,
          protocolRecordId:
            recordType === "lab_result" ? linkedProtocolId || null : null,
          version,
        },
        deletedAt: null,
      });
      const revisionEntry = RevisionSchema.parse({
        schemaVersion: 1,
        id: revisionId,
        entityId: id,
        entityType: "record",
        createdAt: now,
        provenance: userProvenance,
        changes: {
          operation: existing ? "updated" : "created",
          previousVersion: existing ? numberField(existing, "version") : null,
          version,
          fields: record.fields,
          evidenceLayerId: record.observation?.id ?? null,
        },
      });
      await repository.saveRevision(revisionEntry);
      await repository.saveRecord(record);
      await loadRecords();
      setEditingId(id);
      setStatus(
        `${recordType === "lab_protocol" ? "Protocol" : "Result"} version ${String(version)} saved locally with revision ${revisionId}.`,
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The Lab record could not be saved.",
      );
    } finally {
      setSaving(false);
    }
  }, [
    controls,
    editingId,
    evidenceClass,
    hypothesis,
    linkedProtocolId,
    loadRecords,
    outcome,
    procedure,
    recordType,
    repository,
    tagText,
    title,
  ]);

  const appendDictation = useCallback((field: DictationField, text: string) => {
    if (!text) return;
    const append = (current: string) =>
      current.trim() ? `${current.trimEnd()}\n${text}` : text;
    if (field === "hypothesis") setHypothesis(append);
    if (field === "procedure") setProcedure(append);
    if (field === "controls") setControls(append);
    if (field === "outcome") setOutcome(append);
  }, []);

  const acceptDictation = useCallback(
    async (capture: AcceptedCapture) => {
      const recording = await repository.getRecording(capture.recordingId);
      if (!recording)
        throw new Error(
          "The captured audio could not be found in local storage.",
        );
      const now = new Date().toISOString();
      const destinationId = editingId ?? `lab-draft-${recordType}`;
      await repository.saveRecording({
        ...recording,
        acceptedAt: now,
        updatedAt: now,
        destinationType: "codex",
        destinationId,
        status: "LOCAL_ONLY",
        transcriptionRoute: "local_only",
        retentionPolicy: runtime.settings.audioRetention,
      });
      if (capture.queueLocalTranscription) {
        await repository.enqueueTranscription(capture.recordingId, now);
      }
      const voiceRecordId = `lab-voice-${crypto.randomUUID()}`;
      await repository.saveRecord(
        CodexRecordSchema.parse({
          schemaVersion: 1,
          id: voiceRecordId,
          kind: "voice_note",
          title: capture.title,
          createdAt: now,
          updatedAt: now,
          observation: capture.manualText
            ? createEvidenceLayer(
                `${voiceRecordId}:manual-text`,
                capture.manualText,
                now,
                "self_reported",
              )
            : null,
          interpretation: null,
          tags: [...new Set(["lab-dictation", ...capture.tags])],
          backlinks: editingId
            ? [{ recordId: editingId, relationship: "field-dictation-for" }]
            : [],
          sourceLinks: [],
          attachmentIds: [],
          revisionIds: [],
          pathId: null,
          sessionId: null,
          fields: {
            voiceRecordingId: capture.recordingId,
            fieldTargetId: capture.fieldTargetId,
            destinationId,
            transcriptState: capture.queueLocalTranscription
              ? "queued-local"
              : "not-requested",
          },
          deletedAt: null,
        }),
      );
      if (dictationField) appendDictation(dictationField, capture.manualText);
      setStatus(
        "Dictation audio is safe in IndexedDB; optional manual text was appended once.",
      );
      setDictationField(null);
    },
    [
      appendDictation,
      dictationField,
      editingId,
      recordType,
      repository,
      runtime.settings.audioRetention,
    ],
  );

  const field = (
    key: DictationField,
    label: string,
    value: string,
    setValue: (value: string) => void,
    placeholder: string,
  ) => (
    <div className="platform-field" key={key}>
      <div className="platform-field-heading">
        <label htmlFor={`lab-${key}`}>{label}</label>
        <button
          className="field-dictate-button"
          type="button"
          aria-label={`Dictate ${label}`}
          onClick={() => setDictationField(key)}
        >
          <span className="mini-mic" aria-hidden="true" /> Dictate
        </button>
      </div>
      <textarea
        id={`lab-${key}`}
        value={value}
        placeholder={placeholder}
        onChange={(event) => setValue(event.target.value)}
      />
    </div>
  );

  return (
    <>
      <ScreenHeader eyebrow="Versioned personal experiments" title="Lab">
        <p>
          Define the protocol before the result. Raw outcomes stay distinct from
          interpretation and every save creates an inspectable revision.
        </p>
      </ScreenHeader>

      <section
        className="panel-card platform-editor"
        aria-labelledby="lab-editor-title"
      >
        <div className="card-heading">
          <div>
            <p className="eyebrow">
              {editingId ? "Create next revision" : "New local record"}
            </p>
            <h2 id="lab-editor-title">
              {recordType === "lab_protocol"
                ? "Experiment protocol"
                : "Experiment result"}
            </h2>
          </div>
          <StatusBadge status="ready" />
        </div>

        <div className="segmented-control" aria-label="Lab record type">
          <button
            type="button"
            className={recordType === "lab_protocol" ? "active" : undefined}
            onClick={() => resetForm("lab_protocol")}
          >
            Protocol
          </button>
          <button
            type="button"
            className={recordType === "lab_result" ? "active" : undefined}
            onClick={() => resetForm("lab_result")}
          >
            Result
          </button>
        </div>

        <div className="platform-field">
          <label htmlFor="lab-title">Title</label>
          <input
            id="lab-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="A falsifiable, searchable title"
          />
        </div>
        {recordType === "lab_result" ? (
          <div className="platform-field">
            <label htmlFor="lab-protocol-link">Linked protocol</label>
            <select
              id="lab-protocol-link"
              value={linkedProtocolId}
              onChange={(event) => setLinkedProtocolId(event.target.value)}
            >
              <option value="">No protocol selected</option>
              {protocols.map((protocol) => (
                <option key={protocol.id} value={protocol.id}>
                  {protocol.title} · v{String(numberField(protocol, "version"))}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {field(
          "hypothesis",
          "Hypothesis",
          hypothesis,
          setHypothesis,
          "What result would support or challenge the proposition?",
        )}
        {field(
          "procedure",
          "Procedure",
          procedure,
          setProcedure,
          "List the reproducible steps in order.",
        )}
        {field(
          "controls",
          "Controls",
          controls,
          setControls,
          "Describe baselines, blinding, timing, or environmental controls.",
        )}
        {field(
          "outcome",
          recordType === "lab_result"
            ? "Raw outcome"
            : "Planned outcome measure",
          outcome,
          setOutcome,
          recordType === "lab_result"
            ? "Record only what occurred before interpreting it."
            : "Define what will be observed or measured.",
        )}

        <div className="platform-form-grid">
          <div className="platform-field">
            <label htmlFor="lab-evidence-class">Evidence classification</label>
            <select
              id="lab-evidence-class"
              value={evidenceClass}
              onChange={(event) =>
                setEvidenceClass(event.target.value as EvidenceClass)
              }
            >
              {evidenceClasses.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
          <div className="platform-field">
            <label htmlFor="lab-tags">Tags</label>
            <input
              id="lab-tags"
              value={tagText}
              onChange={(event) => setTagText(event.target.value)}
              placeholder="attention, blinded, trial-01"
            />
          </div>
        </div>

        {error ? (
          <p className="platform-message error" role="alert">
            {error}
          </p>
        ) : null}
        {status ? (
          <p className="platform-message success" role="status">
            {status}
          </p>
        ) : null}
        <div className="platform-action-row">
          <button
            className="primary-button"
            type="button"
            disabled={saving}
            onClick={() => void saveRecord()}
          >
            {saving
              ? "Saving…"
              : editingId
                ? "Save next revision"
                : "Save locally"}
          </button>
          {editingId ? (
            <button
              className="secondary-button"
              type="button"
              onClick={() => resetForm(recordType)}
            >
              New record
            </button>
          ) : null}
        </div>
      </section>

      <section className="panel-card">
        <div className="card-heading">
          <h2>Protocol and result ledger</h2>
          <span className="counter">{records.length}</span>
        </div>
        {records.length === 0 ? (
          <div className="platform-empty">
            <strong>No Lab records yet.</strong>
            <p>
              Your first saved protocol will appear here with version and
              evidence metadata.
            </p>
          </div>
        ) : (
          <div className="platform-record-list">
            {records.map((record) => (
              <article className="platform-record-row" key={record.id}>
                <div>
                  <span className="platform-kind">
                    {record.kind === "lab_protocol" ? "Protocol" : "Result"} · v
                    {String(numberField(record, "version"))}
                  </span>
                  <h3>{record.title}</h3>
                  <p>
                    {record.kind === "lab_result"
                      ? record.observation?.text || "No raw outcome"
                      : stringField(record, "hypothesis") || "No hypothesis"}
                  </p>
                  <small>
                    {record.id} · {formatTimestamp(record.updatedAt)}
                  </small>
                </div>
                <button
                  className="text-button"
                  type="button"
                  onClick={() => editRecord(record)}
                >
                  Open
                </button>
              </article>
            ))}
          </div>
        )}
      </section>

      {dictationField ? (
        <div className="modal-backdrop" role="presentation">
          <section
            className="capture-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="lab-dictation-title"
          >
            <div className="sheet-handle" />
            <p className="eyebrow">Field dictation · local first</p>
            <h2 id="lab-dictation-title">Dictate {dictationField}</h2>
            <p className="fine-print">
              Audio is stored locally as its own layer. Optional manual text is
              appended once; it is not mislabeled as a provider transcript.
            </p>
            <VoiceRecorderPanel
              persistence={capturePersistence}
              mode="field"
              initialDestination="codex"
              fieldTargetId={`lab-${dictationField}`}
              localTranscriptionAvailable={
                runtime.localTranscriptionStatus === "ready"
              }
              onAccept={acceptDictation}
              onClose={() => setDictationField(null)}
            />
          </section>
        </div>
      ) : null}
    </>
  );
}
