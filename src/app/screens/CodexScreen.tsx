import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

import {
  acceptSuggestedTag,
  buildDerivedNote,
  buildRecord,
  codexDestinations,
  draftFromDerivedNote,
  draftFromRecord,
  parseTags,
  type CodexDestination,
  type CodexRecordDraft,
  type DerivedNoteDraft,
} from "../../codex/workflows";
import type { QctpRepository } from "../../data";
import {
  type SourceLink,
  userProvenance,
  type CodexRecord,
  type DerivedNote,
  type RecordKind,
  type Transcript,
  type VoiceRecording,
} from "../../domain";
import { ScreenHeader } from "../components/ScreenHeader";
import { useQctp } from "../qctp-context";
import "../platform-styles.css";

interface CodexBundle {
  record: CodexRecord;
  recording: VoiceRecording | null;
  transcript: Transcript | null;
  derivedNotes: DerivedNote[];
}

interface CorrectionDraft {
  transcriptId: string;
  text: string;
}

interface ActiveRecordDraft {
  recordId: string | null;
  value: CodexRecordDraft;
}

interface DeleteSelectionDraft {
  record: boolean;
  audio: boolean;
  transcript: boolean;
  derivedNotes: boolean;
  recordingMetadata: boolean;
  confirmation: string;
}

interface UnlinkedDeleteDraft {
  recordingId: string;
  confirmation: string;
}

const emptyDeleteSelection: DeleteSelectionDraft = {
  record: false,
  audio: false,
  transcript: false,
  derivedNotes: false,
  recordingMetadata: false,
  confirmation: "",
};

const recordKindOptions: ReadonlyArray<{
  value: "all" | RecordKind;
  label: string;
}> = [
  { value: "all", label: "All record types" },
  { value: "voice_note", label: "Voice notes" },
  { value: "geometry", label: "Geometry" },
  { value: "lab_protocol", label: "Lab protocols" },
  { value: "lab_result", label: "Lab results" },
  { value: "mirror", label: "Mirror reflections" },
  { value: "dream", label: "Dreams" },
  { value: "synchronicity", label: "Synchronicities" },
  { value: "intuition", label: "Intuition" },
  { value: "obe", label: "OBE" },
  { value: "remote_viewing", label: "Remote viewing" },
  { value: "psionics", label: "Psionics" },
  { value: "source_note", label: "Source notes" },
  { value: "integration", label: "Integration" },
];

const sourceTypeOptions: ReadonlyArray<{
  value: SourceLink["sourceType"];
  label: string;
}> = [
  { value: "url", label: "Web URL" },
  { value: "book", label: "Book" },
  { value: "course", label: "Course" },
  { value: "person", label: "Person" },
  { value: "qctp_record", label: "QCTP record" },
  { value: "other", label: "Other" },
];

function makeLocalId(prefix: string): string {
  const value =
    globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  return `${prefix}-${value}`;
}

function RecordEditor({
  draft,
  mode,
  saving,
  onChange,
  onCancel,
  onSave,
}: {
  draft: CodexRecordDraft;
  mode: "create" | "edit";
  saving: boolean;
  onChange: Dispatch<SetStateAction<CodexRecordDraft>>;
  onCancel: () => void;
  onSave: () => void;
}) {
  const updateSource = (
    index: number,
    changes: Partial<CodexRecordDraft["sourceLinks"][number]>,
  ) => {
    onChange((current) => ({
      ...current,
      sourceLinks: current.sourceLinks.map((source, sourceIndex) =>
        sourceIndex === index ? { ...source, ...changes } : source,
      ),
    }));
  };

  return (
    <section className="panel-card codex-editor" aria-label={`${mode} record`}>
      <div className="card-heading">
        <div>
          <p className="eyebrow">Direct local entry</p>
          <h2>{mode === "create" ? "Create a Codex record" : "Edit record"}</h2>
        </div>
        <span className="platform-kind">local only</span>
      </div>
      <p className="muted-copy">
        Observation and interpretation are saved as distinct layers. An
        interpretation must point to raw observation evidence.
      </p>
      <div className="platform-form-grid codex-editor-grid">
        <label className="platform-field">
          <span>Title</span>
          <input
            value={draft.title}
            onChange={(event) =>
              onChange((current) => ({
                ...current,
                title: event.target.value,
              }))
            }
            autoComplete="off"
            required
          />
        </label>
        <label className="platform-field">
          <span>Kind</span>
          <select
            value={draft.kind}
            onChange={(event) =>
              onChange((current) => ({
                ...current,
                kind: event.target.value as RecordKind,
              }))
            }
          >
            {recordKindOptions
              .filter(
                (option): option is { value: RecordKind; label: string } =>
                  option.value !== "all",
              )
              .map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
          </select>
        </label>
        <label className="platform-field">
          <span>Destination</span>
          <select
            value={draft.destination}
            onChange={(event) =>
              onChange((current) => ({
                ...current,
                destination: event.target.value as CodexDestination,
              }))
            }
          >
            {codexDestinations.map((destination) => (
              <option key={destination.value} value={destination.value}>
                {destination.label}
              </option>
            ))}
          </select>
        </label>
        <label className="platform-field full-width-field">
          <span>Raw observation</span>
          <textarea
            value={draft.observation}
            onChange={(event) =>
              onChange((current) => ({
                ...current,
                observation: event.target.value,
              }))
            }
            placeholder="What was directly noticed, measured, recalled, or recorded?"
          />
          <small>
            This evidence layer stays separate from your meaning-making.
          </small>
        </label>
        <label className="platform-field full-width-field">
          <span>Optional interpretation</span>
          <textarea
            value={draft.interpretation}
            onChange={(event) =>
              onChange((current) => ({
                ...current,
                interpretation: event.target.value,
              }))
            }
            placeholder="What might the observation mean? Leave blank when uncertain."
          />
        </label>
        <label className="platform-field full-width-field">
          <span>Accepted record tags</span>
          <input
            value={draft.tags}
            onChange={(event) =>
              onChange((current) => ({ ...current, tags: event.target.value }))
            }
            placeholder="reflection, geometry, morning"
          />
          <small>
            Comma- or line-separated. Duplicates are removed on save.
          </small>
        </label>
      </div>

      <div className="codex-source-editor">
        <div className="layer-heading">
          <span>Source links</span>
          <b>{draft.sourceLinks.length}</b>
        </div>
        {draft.sourceLinks.map((source, index) => (
          <fieldset className="source-link-row" key={source.id ?? index}>
            <legend>Source {index + 1}</legend>
            <label className="platform-field">
              <span>Label</span>
              <input
                value={source.label}
                onChange={(event) =>
                  updateSource(index, { label: event.target.value })
                }
                placeholder="Field log or source title"
              />
            </label>
            <label className="platform-field">
              <span>Type</span>
              <select
                value={source.sourceType}
                onChange={(event) =>
                  updateSource(index, {
                    sourceType: event.target.value as SourceLink["sourceType"],
                  })
                }
              >
                {sourceTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="platform-field full-width-field">
              <span>URL (optional)</span>
              <input
                type="url"
                value={source.url}
                onChange={(event) =>
                  updateSource(index, { url: event.target.value })
                }
                placeholder="https://…"
              />
            </label>
            <label className="platform-field full-width-field">
              <span>Citation or locator (optional)</span>
              <input
                value={source.citation}
                onChange={(event) =>
                  updateSource(index, { citation: event.target.value })
                }
                placeholder="Page, chapter, entry, or context"
              />
            </label>
            <button
              type="button"
              className="text-button danger-text-button"
              onClick={() =>
                onChange((current) => ({
                  ...current,
                  sourceLinks: current.sourceLinks.filter(
                    (_, sourceIndex) => sourceIndex !== index,
                  ),
                }))
              }
            >
              Remove source
            </button>
          </fieldset>
        ))}
        <button
          type="button"
          className="text-button"
          onClick={() =>
            onChange((current) => ({
              ...current,
              sourceLinks: [
                ...current.sourceLinks,
                {
                  id: null,
                  label: "",
                  sourceType: "url",
                  url: "",
                  citation: "",
                  accessedAt: null,
                },
              ],
            }))
          }
        >
          Add source link
        </button>
      </div>

      <div className="platform-action-row">
        <button type="button" className="secondary-button" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="primary-button"
          disabled={saving}
          onClick={onSave}
        >
          {saving
            ? "Saving…"
            : mode === "create"
              ? "Create local record"
              : "Save record changes"}
        </button>
      </div>
    </section>
  );
}

function CleanNoteEditor({
  draft,
  saving,
  onChange,
  onCancel,
  onSave,
}: {
  draft: DerivedNoteDraft;
  saving: boolean;
  onChange: Dispatch<SetStateAction<DerivedNoteDraft>>;
  onCancel: () => void;
  onSave: () => void;
}) {
  const suggestedTags = parseTags(draft.suggestedTags);
  return (
    <div className="derived-note-editor">
      <label className="platform-field">
        <span>Clean-note title</span>
        <input
          value={draft.title}
          onChange={(event) =>
            onChange((current) => ({ ...current, title: event.target.value }))
          }
        />
      </label>
      <label className="platform-field">
        <span>Clean derived note</span>
        <textarea
          value={draft.cleanText}
          onChange={(event) =>
            onChange((current) => ({
              ...current,
              cleanText: event.target.value,
            }))
          }
          placeholder="Organize the transcript without replacing its verbatim source."
        />
      </label>
      <label className="platform-field">
        <span>Suggested tags</span>
        <input
          value={draft.suggestedTags}
          onChange={(event) =>
            onChange((current) => ({
              ...current,
              suggestedTags: event.target.value,
            }))
          }
          placeholder="Unreviewed suggestions"
        />
      </label>
      {suggestedTags.length ? (
        <div className="suggested-tag-actions" aria-label="Suggested tags">
          {suggestedTags.map((tag) => (
            <button
              type="button"
              className="text-button"
              key={tag}
              onClick={() =>
                onChange((current) => acceptSuggestedTag(current, tag))
              }
            >
              Accept “{tag}”
            </button>
          ))}
        </div>
      ) : null}
      <label className="platform-field">
        <span>Accepted tags</span>
        <input
          value={draft.acceptedTags}
          onChange={(event) =>
            onChange((current) => ({
              ...current,
              acceptedTags: event.target.value,
            }))
          }
          placeholder="Reviewed tags"
        />
      </label>
      <small>
        This note remains linked to its current transcript. The verbatim source
        cannot be edited here.
      </small>
      <div className="platform-action-row">
        <button type="button" className="secondary-button" onClick={onCancel}>
          Cancel
        </button>
        <button
          type="button"
          className="primary-button"
          disabled={saving}
          onClick={onSave}
        >
          {saving ? "Saving…" : "Save clean-note layer"}
        </button>
      </div>
    </div>
  );
}

function voiceRecordingId(record: CodexRecord): string | null {
  const canonical = record.fields.voiceRecordingId;
  if (typeof canonical === "string" && canonical) return canonical;
  const legacy = record.fields.recordingId;
  return typeof legacy === "string" && legacy ? legacy : null;
}

function formatTimestamp(timestamp: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

function formatBytes(bytes: number): string {
  if (bytes < 1_024) return `${String(bytes)} B`;
  if (bytes < 1_024 * 1_024) return `${(bytes / 1_024).toFixed(1)} KB`;
  return `${(bytes / (1_024 * 1_024)).toFixed(1)} MB`;
}

function formatDuration(milliseconds: number): string {
  const seconds = Math.round(milliseconds / 1_000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function LocalAudio({
  repository,
  recording,
}: {
  repository: QctpRepository;
  recording: VoiceRecording;
}) {
  const [source, setSource] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(
    () => () => {
      if (source) URL.revokeObjectURL(source);
    },
    [source],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const blob = await repository.assembleRecordingBlob(recording.id);
      if (source) URL.revokeObjectURL(source);
      setSource(URL.createObjectURL(blob));
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Local audio could not be assembled.",
      );
    } finally {
      setLoading(false);
    }
  }, [recording.id, repository, source]);

  return (
    <div className="local-audio">
      {source ? (
        <audio controls preload="metadata" src={source}>
          Your browser cannot play this local recording.
        </audio>
      ) : (
        <button
          className="secondary-button"
          type="button"
          disabled={loading}
          onClick={() => void load()}
        >
          {loading ? "Loading local audio…" : "Load local playback"}
        </button>
      )}
      {error ? (
        <p className="platform-message error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function CodexScreen() {
  const runtime = useQctp();
  const { repository, revision } = runtime;
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<"all" | RecordKind>("all");
  const [bundles, setBundles] = useState<CodexBundle[]>([]);
  const [unlinkedRecordings, setUnlinkedRecordings] = useState<
    VoiceRecording[]
  >([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [correctionDraft, setCorrectionDraft] =
    useState<CorrectionDraft | null>(null);
  const [activeRecordDraft, setActiveRecordDraft] =
    useState<ActiveRecordDraft | null>(null);
  const [derivedNoteDraft, setDerivedNoteDraft] =
    useState<DerivedNoteDraft | null>(null);
  const [deleteSelection, setDeleteSelection] =
    useState<DeleteSelectionDraft | null>(null);
  const [unlinkedDelete, setUnlinkedDelete] =
    useState<UnlinkedDeleteDraft | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingRecord, setSavingRecord] = useState(false);
  const [savingCorrection, setSavingCorrection] = useState(false);
  const [savingDerivedNote, setSavingDerivedNote] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deletingUnlinkedId, setDeletingUnlinkedId] = useState<string | null>(
    null,
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loadSequence = useRef(0);

  const load = useCallback(async () => {
    const sequence = loadSequence.current + 1;
    loadSequence.current = sequence;
    const recordOptions = kind === "all" ? {} : { kinds: [kind] };
    const [records, allRecords, recordings] = await Promise.all([
      query.trim()
        ? repository.searchRecords(query, recordOptions)
        : repository.listRecords(recordOptions),
      repository.listRecords(),
      repository.listRecordings(),
    ]);
    const recordingMap = new Map(
      recordings.map((recording) => [recording.id, recording]),
    );
    const nextBundles = await Promise.all(
      records.map(async (record): Promise<CodexBundle> => {
        const recordingId = voiceRecordingId(record);
        const recording = recordingId
          ? (recordingMap.get(recordingId) ?? null)
          : null;
        const transcript = recording
          ? ((await repository.getTranscriptForRecording(recording.id)) ?? null)
          : null;
        const derivedNotes = transcript
          ? await repository.getDerivedNotesForTranscript(transcript.id)
          : [];
        return { record, recording, transcript, derivedNotes };
      }),
    );
    if (sequence !== loadSequence.current) return;
    const linkedIds = new Set(
      allRecords.flatMap((record) => {
        const recordingId = voiceRecordingId(record);
        return recordingId ? [recordingId] : [];
      }),
    );
    setBundles(nextBundles);
    setUnlinkedRecordings(
      recordings.filter(
        (recording) =>
          recording.deletedAt === null && !linkedIds.has(recording.id),
      ),
    );
    setSelectedId((current) =>
      nextBundles.some((bundle) => bundle.record.id === current)
        ? current
        : (nextBundles[0]?.record.id ?? null),
    );
  }, [kind, query, repository]);

  useEffect(() => {
    let active = true;
    void Promise.resolve()
      .then(load)
      .catch((cause: unknown) => {
        if (active)
          setError(
            cause instanceof Error
              ? cause.message
              : "Codex records could not be opened.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      loadSequence.current += 1;
    };
  }, [load, revision]);

  const selected = useMemo(
    () => bundles.find((bundle) => bundle.record.id === selectedId) ?? null,
    [bundles, selectedId],
  );

  const selectRecord = useCallback((bundle: CodexBundle) => {
    setSelectedId(bundle.record.id);
    setCorrectionDraft(
      bundle.transcript
        ? {
            transcriptId: bundle.transcript.id,
            text:
              bundle.transcript.correctedText ?? bundle.transcript.originalText,
          }
        : null,
    );
    setActiveRecordDraft(null);
    setDerivedNoteDraft(null);
    setDeleteSelection(null);
    setMessage(null);
    setError(null);
  }, []);

  const setRecordDraftValue: Dispatch<SetStateAction<CodexRecordDraft>> =
    useCallback((update) => {
      setActiveRecordDraft((current) => {
        if (!current) return current;
        return {
          ...current,
          value: typeof update === "function" ? update(current.value) : update,
        };
      });
    }, []);

  const setDerivedNoteDraftValue: Dispatch<SetStateAction<DerivedNoteDraft>> =
    useCallback((update) => {
      setDerivedNoteDraft((current) => {
        if (!current) return current;
        return typeof update === "function" ? update(current) : update;
      });
    }, []);

  const saveRecordDraft = useCallback(async () => {
    if (!activeRecordDraft) return;
    setSavingRecord(true);
    setMessage(null);
    setError(null);
    try {
      const existing = activeRecordDraft.recordId
        ? ((await repository.getRecord(activeRecordDraft.recordId)) ?? null)
        : null;
      if (activeRecordDraft.recordId && !existing) {
        throw new Error("The record no longer exists in local storage.");
      }
      const record = buildRecord(
        activeRecordDraft.value,
        existing,
        new Date().toISOString(),
        makeLocalId,
      );
      await repository.saveRecord(record);
      if (!existing) {
        setQuery("");
        setKind("all");
      }
      setActiveRecordDraft(null);
      await load();
      setSelectedId(record.id);
      setMessage(
        existing
          ? "Record changes saved. Observation and interpretation remain separate layers."
          : "Local Codex record created.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The record could not be saved.",
      );
    } finally {
      setSavingRecord(false);
    }
  }, [activeRecordDraft, load, repository]);

  const saveCorrection = useCallback(async () => {
    if (!selected?.transcript) return;
    const correction =
      correctionDraft?.transcriptId === selected.transcript.id
        ? correctionDraft.text
        : (selected.transcript.correctedText ??
          selected.transcript.originalText);
    setSavingCorrection(true);
    setMessage(null);
    setError(null);
    try {
      await repository.correctTranscript(selected.transcript.id, correction, {
        ...userProvenance,
        method: "direct-transcript-correction",
      });
      await load();
      setMessage(
        "Correction saved as a separate revision. The verbatim transcript was not changed.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The transcript correction could not be saved.",
      );
    } finally {
      setSavingCorrection(false);
    }
  }, [correctionDraft, load, repository, selected]);

  const saveDerivedNoteDraft = useCallback(async () => {
    if (!selected?.transcript || !derivedNoteDraft) return;
    setSavingDerivedNote(true);
    setMessage(null);
    setError(null);
    try {
      const existing = derivedNoteDraft.id
        ? (selected.derivedNotes.find(
            (note) => note.id === derivedNoteDraft.id,
          ) ?? null)
        : null;
      if (derivedNoteDraft.id && !existing) {
        throw new Error("The clean note no longer exists in local storage.");
      }
      const note = buildDerivedNote(
        derivedNoteDraft,
        selected.transcript.id,
        existing,
        new Date().toISOString(),
        makeLocalId,
      );
      await repository.saveDerivedNote(note);
      setDerivedNoteDraft(null);
      await load();
      setMessage(
        existing
          ? "Clean-note layer and reviewed tags updated."
          : "Clean-note layer created and linked to the transcript.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The clean-note layer could not be saved.",
      );
    } finally {
      setSavingDerivedNote(false);
    }
  }, [derivedNoteDraft, load, repository, selected]);

  const performDeletion = useCallback(async () => {
    if (!selected || !deleteSelection) return;
    const recordingSelectionMade =
      deleteSelection.audio ||
      deleteSelection.transcript ||
      deleteSelection.derivedNotes ||
      deleteSelection.recordingMetadata;
    if (!deleteSelection.record && !recordingSelectionMade) {
      setError("Select at least one local layer to delete.");
      return;
    }
    if (deleteSelection.confirmation !== "DELETE") {
      setError('Type "DELETE" exactly to confirm this local deletion.');
      return;
    }
    if (recordingSelectionMade && !selected.recording) {
      setError(
        "The selected record has no local recording metadata to delete.",
      );
      return;
    }

    setDeleting(true);
    setMessage(null);
    setError(null);
    try {
      let remoteVerification: "deleted" | "not_found" | null = null;
      if (recordingSelectionMade && selected.recording) {
        const result = await runtime.deleteVoiceRecording(
          selected.recording.id,
          {
            audio: deleteSelection.audio,
            transcript: deleteSelection.transcript,
            derivedNotes: deleteSelection.derivedNotes,
            metadata: deleteSelection.recordingMetadata,
          },
        );
        remoteVerification = result.remote;
      }
      if (deleteSelection.record) {
        await repository.deleteRecord(selected.record.id);
      }
      setDeleteSelection(null);
      setDerivedNoteDraft(null);
      setActiveRecordDraft(null);
      await load();
      const remoteMessage =
        remoteVerification === null
          ? " No remote deletion was claimed or requested."
          : " The PX13 gateway verified remote cleanup before local removal.";
      setMessage(`Selected local layers deleted.${remoteMessage}`);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Deletion could not be verified, so local layers were preserved.",
      );
    } finally {
      setDeleting(false);
    }
  }, [deleteSelection, load, repository, runtime, selected]);

  const discardUnlinkedRecording = useCallback(
    async (recordingId: string) => {
      if (
        unlinkedDelete?.recordingId !== recordingId ||
        unlinkedDelete.confirmation !== "DELETE"
      ) {
        setError('Type "DELETE" exactly to discard this local recording.');
        return;
      }
      setDeletingUnlinkedId(recordingId);
      setMessage(null);
      setError(null);
      try {
        const result = await runtime.deleteVoiceRecording(recordingId, {
          audio: true,
          transcript: true,
          derivedNotes: true,
          metadata: true,
        });
        setUnlinkedDelete(null);
        await load();
        setMessage(
          result.remote === null
            ? "Unlinked local recording discarded. No remote deletion was claimed or requested."
            : "Unlinked local recording discarded after PX13 gateway cleanup verification.",
        );
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "Discard could not be verified, so the local recording was preserved.",
        );
      } finally {
        setDeletingUnlinkedId(null);
      }
    },
    [load, runtime, unlinkedDelete],
  );

  return (
    <>
      <ScreenHeader eyebrow="Searchable local knowledge" title="Codex">
        <p>
          Raw audio, verbatim transcript, correction, clean note,
          interpretation, and tags remain separate linked layers with explicit
          provenance.
        </p>
      </ScreenHeader>

      <section className="panel-card codex-controls" aria-label="Search Codex">
        <label className="platform-field">
          <span>
            Search titles, observations, interpretation, tags, and fields
          </span>
          <input
            type="search"
            value={query}
            onChange={(event) => {
              setLoading(true);
              setQuery(event.target.value);
            }}
            placeholder="Search your local Codex"
          />
        </label>
        <label className="platform-field">
          <span>Record type</span>
          <select
            value={kind}
            onChange={(event) => {
              setLoading(true);
              setKind(event.target.value as "all" | RecordKind);
            }}
          >
            {recordKindOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <button
          className="primary-button codex-create-button"
          type="button"
          onClick={() => {
            setActiveRecordDraft({
              recordId: null,
              value: draftFromRecord(),
            });
            setDerivedNoteDraft(null);
            setDeleteSelection(null);
            setMessage(null);
            setError(null);
          }}
        >
          Create manual record
        </button>
      </section>

      {activeRecordDraft ? (
        <RecordEditor
          draft={activeRecordDraft.value}
          mode={activeRecordDraft.recordId ? "edit" : "create"}
          saving={savingRecord}
          onChange={setRecordDraftValue}
          onCancel={() => setActiveRecordDraft(null)}
          onSave={() => void saveRecordDraft()}
        />
      ) : null}

      {error ? (
        <p className="platform-message error" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="platform-message success" role="status">
          {message}
        </p>
      ) : null}

      {loading ? (
        <section className="panel-card platform-empty" aria-live="polite">
          <strong>Opening the local index…</strong>
        </section>
      ) : null}
      {!loading && bundles.length === 0 ? (
        <section className="panel-card platform-empty">
          <strong>
            {query || kind !== "all"
              ? "No records match this view."
              : "Your Codex is ready for its first record."}
          </strong>
          <p>
            {query || kind !== "all"
              ? "Try a broader search or record type."
              : "Voice captures, Studio artifacts, Lab results, and direct reflections will appear here."}
          </p>
        </section>
      ) : null}

      {!loading && bundles.length > 0 ? (
        <div className="codex-layout">
          <section
            className="panel-card codex-index"
            aria-label="Codex records"
          >
            <div className="card-heading">
              <h2>Records</h2>
              <span className="counter">{bundles.length}</span>
            </div>
            <div className="platform-record-list">
              {bundles.map((bundle) => (
                <button
                  key={bundle.record.id}
                  type="button"
                  className={`codex-index-button${selectedId === bundle.record.id ? " active" : ""}`}
                  onClick={() => selectRecord(bundle)}
                >
                  <span className="platform-kind">
                    {bundle.record.kind.replaceAll("_", " ")}
                  </span>
                  <strong>{bundle.record.title}</strong>
                  <small>
                    {formatTimestamp(bundle.record.updatedAt)}
                    {bundle.recording ? " · audio" : ""}
                  </small>
                </button>
              ))}
            </div>
          </section>

          {selected ? (
            <article
              className="panel-card codex-detail"
              aria-labelledby="codex-record-title"
            >
              <p className="eyebrow">
                {selected.record.kind.replaceAll("_", " ")}
              </p>
              <div className="codex-title-row">
                <h2 id="codex-record-title">{selected.record.title}</h2>
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setActiveRecordDraft({
                      recordId: selected.record.id,
                      value: draftFromRecord(selected.record),
                    });
                    setDerivedNoteDraft(null);
                    setDeleteSelection(null);
                    setMessage(null);
                    setError(null);
                  }}
                >
                  Edit record
                </button>
              </div>
              <p className="record-id">{selected.record.id}</p>

              <section className="layer-card">
                <div className="layer-heading">
                  <span>Evidence layer</span>
                  <b>{selected.record.observation?.evidenceClass ?? "none"}</b>
                </div>
                {selected.record.observation ? (
                  <>
                    <p>
                      {selected.record.observation.text ||
                        "This evidence layer intentionally contains no text."}
                    </p>
                    <small>
                      {selected.record.observation.id} ·{" "}
                      {selected.record.observation.provenance.method}
                    </small>
                  </>
                ) : (
                  <p className="muted-copy">
                    No text evidence is attached to this record.
                  </p>
                )}
              </section>

              {selected.recording ? (
                <section className="layer-card">
                  <div className="layer-heading">
                    <span>Raw audio</span>
                    <b>{selected.recording.status.replaceAll("_", " ")}</b>
                  </div>
                  <p className="layer-metadata">
                    {formatDuration(selected.recording.durationMs)} ·{" "}
                    {formatBytes(selected.recording.sizeBytes)} ·{" "}
                    {selected.recording.mimeType}
                  </p>
                  {selected.recording.status === "DELETED" ||
                  selected.recording.sizeBytes === 0 ? (
                    <p className="platform-message warning">
                      Local audio chunks were deleted. Recording metadata is a
                      tombstone and is retained only to explain the missing
                      source.
                    </p>
                  ) : (
                    <LocalAudio
                      repository={repository}
                      recording={selected.recording}
                    />
                  )}
                  <small>
                    {selected.recording.id} ·{" "}
                    {selected.recording.status === "DELETED"
                      ? "local chunks removed"
                      : "IndexedDB source preserved"}
                  </small>
                </section>
              ) : voiceRecordingId(selected.record) ? (
                <section className="layer-card">
                  <div className="layer-heading">
                    <span>Raw audio</span>
                    <b>metadata unavailable</b>
                  </div>
                  <p className="platform-message warning">
                    This record retains a historical recording identifier, but
                    its local recording metadata is no longer present.
                  </p>
                </section>
              ) : null}

              <section className="layer-card">
                <div className="layer-heading">
                  <span>Verbatim transcript</span>
                  <b>
                    {selected.transcript ? "immutable source" : "not created"}
                  </b>
                </div>
                {selected.transcript ? (
                  <>
                    <p className="transcript-copy">
                      {selected.transcript.originalText ||
                        "The provider returned an empty text layer."}
                    </p>
                    <small>
                      {selected.transcript.provider} ·{" "}
                      {selected.transcript.model} · {selected.transcript.id}
                    </small>
                  </>
                ) : (
                  <p className="muted-copy">
                    No transcription exists. Local audio remains usable without
                    it.
                  </p>
                )}
              </section>

              {selected.transcript ? (
                <section className="layer-card">
                  <div className="layer-heading">
                    <span>Corrected transcript</span>
                    <b>{selected.transcript.corrections.length} revisions</b>
                  </div>
                  <label className="platform-field">
                    <span>Human correction</span>
                    <textarea
                      value={
                        correctionDraft?.transcriptId === selected.transcript.id
                          ? correctionDraft.text
                          : (selected.transcript.correctedText ??
                            selected.transcript.originalText)
                      }
                      onChange={(event) =>
                        setCorrectionDraft({
                          transcriptId: selected.transcript!.id,
                          text: event.target.value,
                        })
                      }
                    />
                  </label>
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={savingCorrection}
                    onClick={() => void saveCorrection()}
                  >
                    {savingCorrection
                      ? "Saving correction…"
                      : "Save correction layer"}
                  </button>
                </section>
              ) : null}

              <section className="layer-card">
                <div className="layer-heading">
                  <span>Clean notes</span>
                  <b>{selected.derivedNotes.length}</b>
                </div>
                {selected.transcript && !derivedNoteDraft ? (
                  <button
                    type="button"
                    className="text-button"
                    onClick={() =>
                      setDerivedNoteDraft(
                        draftFromDerivedNote(null, selected.record.title),
                      )
                    }
                  >
                    Create clean note
                  </button>
                ) : null}
                {derivedNoteDraft ? (
                  <CleanNoteEditor
                    draft={derivedNoteDraft}
                    saving={savingDerivedNote}
                    onChange={setDerivedNoteDraftValue}
                    onCancel={() => setDerivedNoteDraft(null)}
                    onSave={() => void saveDerivedNoteDraft()}
                  />
                ) : null}
                {selected.derivedNotes.length ? (
                  selected.derivedNotes.map((note) => (
                    <div className="derived-note" key={note.id}>
                      <strong>{note.title}</strong>
                      <p>{note.cleanText}</p>
                      <small>
                        {note.provenance.method} · accepted tags:{" "}
                        {note.acceptedTags.join(", ") || "none"}
                      </small>
                      {note.suggestedTags.length ? (
                        <small>
                          Awaiting review: {note.suggestedTags.join(", ")}
                        </small>
                      ) : null}
                      <button
                        type="button"
                        className="text-button"
                        onClick={() =>
                          setDerivedNoteDraft(
                            draftFromDerivedNote(note, selected.record.title),
                          )
                        }
                      >
                        Edit note and review tags
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="muted-copy">
                    No derived note has been created.
                  </p>
                )}
              </section>

              <section className="layer-card">
                <div className="layer-heading">
                  <span>Interpretation</span>
                  <b>
                    {selected.record.interpretation
                      ? "user-authored"
                      : "not created"}
                  </b>
                </div>
                {selected.record.interpretation ? (
                  <>
                    <p>{selected.record.interpretation.text}</p>
                    <small>
                      Based on:{" "}
                      {selected.record.interpretation.basedOnEvidenceIds.join(
                        ", ",
                      )}
                    </small>
                  </>
                ) : (
                  <p className="muted-copy">
                    No interpretation is asserted for this evidence.
                  </p>
                )}
              </section>

              <section className="layer-card compact-layer">
                <div className="layer-heading">
                  <span>Tags and links</span>
                  <b>{selected.record.tags.length}</b>
                </div>
                <div className="tag-list">
                  {selected.record.tags.length ? (
                    selected.record.tags.map((tag) => (
                      <span key={tag}>{tag}</span>
                    ))
                  ) : (
                    <em>No tags</em>
                  )}
                </div>
                {selected.record.sourceLinks.length ? (
                  <ul className="source-link-list">
                    {selected.record.sourceLinks.map((source) => (
                      <li key={source.id}>
                        {source.url ? (
                          <a href={source.url} target="_blank" rel="noreferrer">
                            {source.label}
                          </a>
                        ) : (
                          source.label
                        )}
                        {source.citation ? ` — ${source.citation}` : ""}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {selected.record.backlinks.length ? (
                  <ul>
                    {selected.record.backlinks.map((backlink) => (
                      <li key={`${backlink.recordId}:${backlink.relationship}`}>
                        {backlink.relationship}:{" "}
                        <code>{backlink.recordId}</code>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </section>

              <section className="layer-card destructive-zone">
                <div className="layer-heading">
                  <span>Selective local deletion</span>
                  <b>destructive</b>
                </div>
                <p>
                  Choose only the layers you intend to erase. The verbatim
                  transcript cannot be edited; deleting it also deletes every
                  clean note derived from it.
                </p>
                {!deleteSelection ? (
                  <button
                    type="button"
                    className="secondary-button danger-button"
                    onClick={() => {
                      setDeleteSelection({ ...emptyDeleteSelection });
                      setActiveRecordDraft(null);
                      setDerivedNoteDraft(null);
                      setMessage(null);
                      setError(null);
                    }}
                  >
                    Open deletion controls
                  </button>
                ) : (
                  <div className="deletion-confirmation" role="alertdialog">
                    <strong>
                      Delete local layers from “{selected.record.title}”
                    </strong>
                    <label className="delete-option">
                      <input
                        type="checkbox"
                        checked={deleteSelection.record}
                        onChange={(event) =>
                          setDeleteSelection((current) =>
                            current
                              ? { ...current, record: event.target.checked }
                              : current,
                          )
                        }
                      />
                      <span>
                        <b>Linked Codex record</b>
                        <small>
                          Removes the record, its local attachments and
                          revisions, and backlinks to it. The recording stack is
                          preserved unless selected below.
                        </small>
                      </span>
                    </label>
                    <label className="delete-option">
                      <input
                        type="checkbox"
                        disabled={
                          !selected.recording ||
                          selected.recording.status === "DELETED" ||
                          deleteSelection.recordingMetadata
                        }
                        checked={
                          deleteSelection.audio ||
                          deleteSelection.recordingMetadata
                        }
                        onChange={(event) =>
                          setDeleteSelection((current) =>
                            current
                              ? { ...current, audio: event.target.checked }
                              : current,
                          )
                        }
                      />
                      <span>
                        <b>Local raw audio chunks</b>
                        <small>
                          Permanently removes IndexedDB audio bytes and leaves a
                          metadata tombstone. Transcript and clean notes remain
                          unless selected.
                        </small>
                      </span>
                    </label>
                    <label className="delete-option">
                      <input
                        type="checkbox"
                        disabled={
                          !selected.transcript ||
                          deleteSelection.recordingMetadata
                        }
                        checked={
                          deleteSelection.transcript ||
                          deleteSelection.recordingMetadata
                        }
                        onChange={(event) =>
                          setDeleteSelection((current) =>
                            current
                              ? {
                                  ...current,
                                  transcript: event.target.checked,
                                }
                              : current,
                          )
                        }
                      />
                      <span>
                        <b>Verbatim and corrected transcript</b>
                        <small>
                          Permanently removes the immutable transcript, all
                          correction revisions, and every linked clean note. Raw
                          audio remains unless selected.
                        </small>
                      </span>
                    </label>
                    <label className="delete-option">
                      <input
                        type="checkbox"
                        disabled={
                          selected.derivedNotes.length === 0 ||
                          deleteSelection.transcript ||
                          deleteSelection.recordingMetadata
                        }
                        checked={
                          deleteSelection.derivedNotes ||
                          deleteSelection.transcript ||
                          deleteSelection.recordingMetadata
                        }
                        onChange={(event) =>
                          setDeleteSelection((current) =>
                            current
                              ? {
                                  ...current,
                                  derivedNotes: event.target.checked,
                                }
                              : current,
                          )
                        }
                      />
                      <span>
                        <b>All clean derived notes</b>
                        <small>
                          Removes clean text and its suggested and accepted
                          tags. The transcript and raw audio remain.
                        </small>
                      </span>
                    </label>
                    <label className="delete-option">
                      <input
                        type="checkbox"
                        disabled={!selected.recording}
                        checked={deleteSelection.recordingMetadata}
                        onChange={(event) =>
                          setDeleteSelection((current) =>
                            current
                              ? {
                                  ...current,
                                  recordingMetadata: event.target.checked,
                                }
                              : current,
                          )
                        }
                      />
                      <span>
                        <b>Entire local recording stack and metadata</b>
                        <small>
                          Removes audio, recording metadata, transcription
                          queue, transcript, corrections, and all clean notes.
                          The linked Codex record remains unless separately
                          selected.
                        </small>
                      </span>
                    </label>

                    <p className="platform-message warning">
                      If a remote audio artifact exists, the PWA must reconnect
                      to the paired PX13 gateway and verify its cleanup before
                      any selected local audio or metadata is removed. If that
                      verification fails, local data is preserved and remote
                      cleanup remains on hold.
                    </p>
                    <label className="platform-field">
                      <span>Type DELETE to confirm</span>
                      <input
                        value={deleteSelection.confirmation}
                        onChange={(event) =>
                          setDeleteSelection((current) =>
                            current
                              ? {
                                  ...current,
                                  confirmation: event.target.value,
                                }
                              : current,
                          )
                        }
                        autoComplete="off"
                      />
                    </label>
                    <div className="platform-action-row">
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => setDeleteSelection(null)}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="danger-button"
                        disabled={
                          deleting || deleteSelection.confirmation !== "DELETE"
                        }
                        onClick={() => void performDeletion()}
                      >
                        {deleting
                          ? "Verifying and deleting…"
                          : "Delete selected layers"}
                      </button>
                    </div>
                  </div>
                )}
              </section>
            </article>
          ) : null}
        </div>
      ) : null}

      {unlinkedRecordings.length ? (
        <section className="panel-card">
          <div className="card-heading">
            <div>
              <p className="eyebrow">Recovery view</p>
              <h2>Unlinked local recordings</h2>
            </div>
            <span className="counter">{unlinkedRecordings.length}</span>
          </div>
          <p className="muted-copy">
            These audio sources are preserved even though their destination
            record is missing or outside the current search result.
          </p>
          <div className="platform-record-list">
            {unlinkedRecordings.map((recording) => (
              <article className="layer-card" key={recording.id}>
                <div className="layer-heading">
                  <span>{recording.id}</span>
                  <b>{recording.status.replaceAll("_", " ")}</b>
                </div>
                <p>
                  {formatDuration(recording.durationMs)} ·{" "}
                  {formatBytes(recording.sizeBytes)}
                </p>
                <LocalAudio repository={repository} recording={recording} />
                {unlinkedDelete?.recordingId === recording.id ? (
                  <div className="orphan-delete-confirmation">
                    <p className="platform-message warning">
                      This permanently removes the recording metadata, local
                      audio chunks, queue item, transcript, and clean notes. If
                      a remote artifact exists, PX13 cleanup must be verified
                      first or all local data is preserved.
                    </p>
                    <label className="platform-field">
                      <span>Type DELETE to discard {recording.id}</span>
                      <input
                        value={unlinkedDelete.confirmation}
                        onChange={(event) =>
                          setUnlinkedDelete({
                            recordingId: recording.id,
                            confirmation: event.target.value,
                          })
                        }
                        autoComplete="off"
                      />
                    </label>
                    <div className="platform-action-row">
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => setUnlinkedDelete(null)}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="danger-button"
                        disabled={
                          deletingUnlinkedId === recording.id ||
                          unlinkedDelete.confirmation !== "DELETE"
                        }
                        onClick={() =>
                          void discardUnlinkedRecording(recording.id)
                        }
                      >
                        {deletingUnlinkedId === recording.id
                          ? "Verifying and discarding…"
                          : "Discard recording stack"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="secondary-button danger-button"
                    aria-label={`Discard ${recording.id}`}
                    onClick={() => {
                      setUnlinkedDelete({
                        recordingId: recording.id,
                        confirmation: "",
                      });
                      setMessage(null);
                      setError(null);
                    }}
                  >
                    Discard unlinked recording…
                  </button>
                )}
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
