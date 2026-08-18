import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  CodexRecord,
  MirrorInsightFeedback,
  MirrorInsightKind,
  MirrorInsightReviewAction,
  MirrorRequest,
  MirrorResult,
  RecordKind,
} from "../../domain";
import {
  analyzeLocalMirror,
  buildMirrorJournalRecord,
  type CountedEvidence,
  type LocalMirrorAnalysis,
  type MirrorJournalFields,
  type StructuredTrendPoint,
} from "../../insights";
import {
  RepositoryCapturePersistence,
  VoiceRecorderPanel,
  acceptVoiceCapture,
  type AcceptedCapture,
} from "../../voice-capture";
import { ScreenHeader } from "../components/ScreenHeader";
import { StatusBadge } from "../components/StatusBadge";
import { useQctp, type MirrorClientJob } from "../qctp-context";
import "../platform-styles.css";

const statusLabels: Record<MirrorClientJob["status"], string> = {
  queued_local: "Queued on this device",
  submitted: "Submitted to PX13",
  processing: "Local AI Mirror is working",
  complete: "Result synchronized",
  retry_wait: "Waiting to retry",
  failed: "Needs a manual retry",
};

const EMPTY_JOURNAL_FIELDS: MirrorJournalFields = {
  event: "",
  emotion: "",
  judgment: "",
  qualityOrValue: "",
  selfReflection: "",
  alternativeResponse: "",
  action: "",
  outcome: "",
};

interface ReflectionReviewDraft {
  resultId: string;
  mode: "revised" | "annotated";
  text: string;
  proposedQuestion: string;
  proposedAction: string;
  annotation: string;
}

interface ReviewableInsight {
  key: string;
  kind: MirrorInsightKind;
  label: string;
  sourceRecordIds: string[];
}

function recordAnchorId(recordId: string): string {
  return `mirror-source-${encodeURIComponent(recordId)}`;
}

function RecordLinks({ recordIds }: { recordIds: readonly string[] }) {
  return (
    <span className="insight-record-links">
      {[...new Set(recordIds)].sort().map((recordId) => (
        <a
          key={recordId}
          href={`#${recordAnchorId(recordId)}`}
          onClick={() => {
            const target = document.getElementById(recordAnchorId(recordId));
            if (target instanceof HTMLDetailsElement) target.open = true;
          }}
        >
          {recordId}
        </a>
      ))}
    </span>
  );
}

function EvidenceCountList({
  emptyLabel,
  feedbackByKey,
  items,
  kind,
  scope,
  showDismissed = false,
}: {
  emptyLabel: string;
  feedbackByKey?: ReadonlyMap<string, MirrorInsightFeedback>;
  items: readonly CountedEvidence[];
  kind?: MirrorInsightKind;
  scope?: string;
  showDismissed?: boolean;
}) {
  const visibleItems = items.filter((item) => {
    if (!kind || !scope || showDismissed) return true;
    return (
      feedbackByKey?.get(stableInsightKey(kind, scope, item.value))
        ?.disposition !== "dismissed"
    );
  });
  if (visibleItems.length === 0)
    return <p className="muted-copy">{emptyLabel}</p>;
  return (
    <div className="insight-count-list">
      {visibleItems.slice(0, 12).map((item) => {
        const feedback =
          kind && scope
            ? feedbackByKey?.get(stableInsightKey(kind, scope, item.value))
            : undefined;
        return (
          <details
            key={item.value}
            className={
              feedback?.disposition === "dismissed" ? "dismissed" : undefined
            }
          >
            <summary title={`${item.recordIds.length} source record(s)`}>
              {item.value} <b>{item.count}</b>
              {feedback ? <em>{feedback.disposition}</em> : null}
            </summary>
            <RecordLinks recordIds={item.recordIds} />
            {feedback?.correction ? (
              <p>
                <strong>Correction:</strong> {feedback.correction}
              </p>
            ) : null}
            {feedback?.annotation ? (
              <p>
                <strong>Annotation:</strong> {feedback.annotation}
              </p>
            ) : null}
          </details>
        );
      })}
    </div>
  );
}

function stableInsightKey(
  kind: MirrorInsightKind,
  scope: string,
  value: string,
): string {
  const identity = `${kind}\u0000${scope}\u0000${value}`;
  let hash = 2_166_136_261;
  for (let index = 0; index < identity.length; index += 1) {
    hash ^= identity.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return `${kind}:${scope}:${encodeURIComponent(value).slice(0, 300)}:${(
    hash >>> 0
  ).toString(36)}`;
}

function reviewableInsights(
  analysis: LocalMirrorAnalysis,
): ReviewableInsight[] {
  const insights: ReviewableInsight[] = [];
  const addCounts = (
    kind: MirrorInsightKind,
    scope: string,
    label: string,
    items: readonly CountedEvidence[],
  ) => {
    for (const item of items) {
      insights.push({
        key: stableInsightKey(kind, scope, item.value),
        kind,
        label: `${label}: ${item.value} (${item.count})`,
        sourceRecordIds: item.recordIds,
      });
    }
  };
  const addTrend = (
    kind: MirrorInsightKind,
    scope: string,
    label: string,
    points: readonly StructuredTrendPoint[],
  ) => {
    for (const point of points) {
      addCounts(
        kind,
        `${scope}:${point.date}`,
        `${label} · ${point.date}`,
        point.values,
      );
    }
  };

  addCounts("term", "recurring", "Recurring term", analysis.recurringTerms);
  addCounts("tag", "tag", "Tag", analysis.tags);
  addCounts("theme", "theme", "Theme", analysis.themes);
  addCounts(
    "symbol",
    "recurring",
    "Recurring symbol",
    analysis.recurringSymbols,
  );
  addCounts("person", "person", "Person reference", analysis.people);
  addCounts("date", "date", "Date reference", analysis.dateReferences);
  addCounts("practice", "practice", "Practice", analysis.practices);
  addCounts(
    "source_track",
    "source-track",
    "Source track",
    analysis.sourceTracks,
  );
  addCounts(
    "repeated_trigger",
    "trigger",
    "Repeated trigger",
    analysis.repeatedTriggers,
  );
  addCounts(
    "repeated_action",
    "action",
    "Repeated action",
    analysis.repeatedActions,
  );
  addTrend("state_trend", "state", "State evidence", analysis.trends.state);
  addTrend("sleep_trend", "sleep", "Sleep evidence", analysis.trends.sleep);
  addTrend(
    "practice_trend",
    "practice",
    "Practice evidence",
    analysis.trends.practice,
  );
  addTrend(
    "outcome_trend",
    "outcome",
    "Outcome evidence",
    analysis.trends.outcome,
  );
  addCounts(
    "link_pattern",
    "backlink-relationship",
    "Backlink relationship",
    analysis.links.backlinksByRelationship,
  );
  addCounts(
    "link_pattern",
    "source-link-type",
    "Source link type",
    analysis.links.sourceLinksByType,
  );

  return [
    ...new Map(insights.map((insight) => [insight.key, insight])).values(),
  ];
}

function TrendEvidenceList({
  emptyLabel,
  feedbackByKey,
  kind,
  points,
  scope,
  showDismissed,
}: {
  emptyLabel: string;
  feedbackByKey: ReadonlyMap<string, MirrorInsightFeedback>;
  kind: MirrorInsightKind;
  points: readonly StructuredTrendPoint[];
  scope: string;
  showDismissed: boolean;
}) {
  if (points.length === 0) return <p className="muted-copy">{emptyLabel}</p>;
  return (
    <div className="insight-trend-list">
      {points.slice(-14).map((point) => (
        <article key={point.date}>
          <time>{point.date}</time>
          <EvidenceCountList
            items={point.values}
            emptyLabel={emptyLabel}
            feedbackByKey={feedbackByKey}
            kind={kind}
            scope={`${scope}:${point.date}`}
            showDismissed={showDismissed}
          />
        </article>
      ))}
    </div>
  );
}

function formatTimestamp(timestamp: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

function sourceExcerpt(record: CodexRecord): string {
  const source =
    record.observation?.text ??
    record.interpretation?.text ??
    (typeof record.fields.summary === "string" ? record.fields.summary : "");
  const normalized = source.replaceAll(/\s+/g, " ").trim();
  if (!normalized) return "Structured record available; no text excerpt.";
  return normalized.length > 180 ? `${normalized.slice(0, 177)}…` : normalized;
}

function jobGuidance(job: MirrorClientJob): string {
  if (job.status === "queued_local") {
    return "Safe in the local queue. It will submit when the PX13 Local AI companion reconnects.";
  }
  if (job.status === "retry_wait") {
    return "The local request and citations are preserved. Automatic retry remains available.";
  }
  if (job.status === "failed") {
    return "The local request is preserved. Retry when the Local AI companion is available.";
  }
  if (job.status === "submitted" || job.status === "processing") {
    return "You may leave this screen; the result can be retrieved later.";
  }
  return "The result was synchronized with its cited source records.";
}

function hasDisplayableCitations(job: MirrorClientJob): boolean {
  return (
    job.resultCitations.length > 0 &&
    job.resultCitations.every((citation) =>
      job.sourceRecordIds.includes(citation.recordId),
    )
  );
}

function createMirrorJournalId(): string {
  const random = globalThis.crypto?.randomUUID?.();
  return `mirror-journal-${random ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

function purgePhrase(id: string): string {
  return `PURGE ${id}`;
}

export function MirrorScreen() {
  const runtime = useQctp();
  const { repository, revision, mirror } = runtime;
  const capturePersistence = useMemo(
    () => new RepositoryCapturePersistence(repository),
    [repository],
  );
  const [records, setRecords] = useState<CodexRecord[]>([]);
  const [sourceQuery, setSourceQuery] = useState("");
  const [selectedSourceIds, setSelectedSourceIds] = useState<string[]>([]);
  const [insightQuery, setInsightQuery] = useState("");
  const [insightFromDate, setInsightFromDate] = useState("");
  const [insightToDate, setInsightToDate] = useState("");
  const [insightKind, setInsightKind] = useState<RecordKind | "">("");
  const [insightTag, setInsightTag] = useState("");
  const [insightTheme, setInsightTheme] = useState("");
  const [insightSymbol, setInsightSymbol] = useState("");
  const [insightPerson, setInsightPerson] = useState("");
  const [insightPractice, setInsightPractice] = useState("");
  const [insightSourceTrack, setInsightSourceTrack] = useState("");
  const [insightFeedback, setInsightFeedback] = useState<
    MirrorInsightFeedback[]
  >([]);
  const [deletedRequests, setDeletedRequests] = useState<MirrorRequest[]>([]);
  const [deletedResults, setDeletedResults] = useState<MirrorResult[]>([]);
  const [deletedInsightFeedback, setDeletedInsightFeedback] = useState<
    MirrorInsightFeedback[]
  >([]);
  const [showDismissedInsights, setShowDismissedInsights] = useState(false);
  const [selectedInsightKey, setSelectedInsightKey] = useState("");
  const [insightCorrection, setInsightCorrection] = useState("");
  const [insightAnnotation, setInsightAnnotation] = useState("");
  const [journalTitle, setJournalTitle] = useState("");
  const [journalTags, setJournalTags] = useState("");
  const [journalFields, setJournalFields] = useState<MirrorJournalFields>({
    ...EMPTY_JOURNAL_FIELDS,
  });
  const [journalSourceIds, setJournalSourceIds] = useState<string[]>([]);
  const [reflectionReview, setReflectionReview] =
    useState<ReflectionReviewDraft | null>(null);
  const [deleteConfirmationId, setDeleteConfirmationId] = useState<
    string | null
  >(null);
  const [purgeConfirmations, setPurgeConfirmations] = useState<
    Record<string, string>
  >({});
  const [prompt, setPrompt] = useState("");
  const [dictating, setDictating] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void Promise.all([
      repository.listRecords(),
      repository.listMirrorInsightFeedback(),
      repository.listMirrorRequests(undefined, { includeDeleted: true }),
      repository.listMirrorResults({ includeDeleted: true }),
      repository.listMirrorInsightFeedback({ includeDeleted: true }),
    ]).then(
      ([
        recordValues,
        feedbackValues,
        requestValues,
        resultValues,
        allFeedbackValues,
      ]) => {
        if (active) {
          setRecords(recordValues);
          setInsightFeedback(feedbackValues);
          setDeletedRequests(
            requestValues.filter((request) => request.deletedAt !== null),
          );
          setDeletedResults(
            resultValues.filter((result) => result.deletedAt !== null),
          );
          setDeletedInsightFeedback(
            allFeedbackValues.filter((feedback) => feedback.deletedAt !== null),
          );
        }
      },
      () => {
        if (active) {
          setError(
            "Local Mirror sources could not be opened. No queued request was changed.",
          );
        }
      },
    );
    return () => {
      active = false;
    };
  }, [repository, revision]);

  const refreshDeletedItems = useCallback(async () => {
    const [requestValues, resultValues, feedbackValues] = await Promise.all([
      repository.listMirrorRequests(undefined, { includeDeleted: true }),
      repository.listMirrorResults({ includeDeleted: true }),
      repository.listMirrorInsightFeedback({ includeDeleted: true }),
    ]);
    setDeletedRequests(
      requestValues.filter((request) => request.deletedAt !== null),
    );
    setDeletedResults(
      resultValues.filter((result) => result.deletedAt !== null),
    );
    setDeletedInsightFeedback(
      feedbackValues.filter((feedback) => feedback.deletedAt !== null),
    );
  }, [repository]);

  const visibleSources = useMemo(() => {
    const terms = sourceQuery.toLocaleLowerCase().split(/\s+/).filter(Boolean);
    return records.filter((record) => {
      if (terms.length === 0) return true;
      const text = [
        record.title,
        record.kind,
        record.tags.join(" "),
        sourceExcerpt(record),
      ]
        .join(" ")
        .toLocaleLowerCase();
      return terms.every((term) => text.includes(term));
    });
  }, [records, sourceQuery]);

  const selectedSources = useMemo(() => {
    const byId = new Map(records.map((record) => [record.id, record]));
    return selectedSourceIds.flatMap((id) => {
      const record = byId.get(id);
      return record ? [record] : [];
    });
  }, [records, selectedSourceIds]);

  const journalSources = useMemo(() => {
    const byId = new Map(records.map((record) => [record.id, record]));
    return journalSourceIds.flatMap((id) => {
      const record = byId.get(id);
      return record ? [record] : [];
    });
  }, [journalSourceIds, records]);

  const recordKinds = useMemo(
    () => [...new Set(records.map((record) => record.kind))].sort(),
    [records],
  );

  const unfilteredInsights = useMemo(
    () => analyzeLocalMirror(records),
    [records],
  );

  const localInsights = useMemo(
    () =>
      analyzeLocalMirror(records, {
        query: insightQuery,
        fromDate: insightFromDate,
        toDate: insightToDate,
        kinds: insightKind ? [insightKind] : [],
        tags: insightTag ? [insightTag] : [],
        themes: insightTheme ? [insightTheme] : [],
        symbols: insightSymbol ? [insightSymbol] : [],
        people: insightPerson ? [insightPerson] : [],
        practices: insightPractice ? [insightPractice] : [],
        sourceTracks: insightSourceTrack ? [insightSourceTrack] : [],
      }),
    [
      records,
      insightQuery,
      insightFromDate,
      insightToDate,
      insightKind,
      insightTag,
      insightTheme,
      insightSymbol,
      insightPerson,
      insightPractice,
      insightSourceTrack,
    ],
  );

  const reviewableLocalInsights = useMemo(
    () => reviewableInsights(localInsights),
    [localInsights],
  );
  const insightFeedbackByKey = useMemo(
    () => new Map(insightFeedback.map((item) => [item.insightKey, item])),
    [insightFeedback],
  );
  const visibleReviewableLocalInsights = useMemo(
    () =>
      reviewableLocalInsights.filter(
        (insight) =>
          showDismissedInsights ||
          insightFeedbackByKey.get(insight.key)?.disposition !== "dismissed",
      ),
    [insightFeedbackByKey, reviewableLocalInsights, showDismissedInsights],
  );
  const selectedLocalInsight = useMemo(
    () =>
      visibleReviewableLocalInsights.find(
        (insight) => insight.key === selectedInsightKey,
      ) ?? null,
    [selectedInsightKey, visibleReviewableLocalInsights],
  );
  const selectedInsightFeedback = useMemo(
    () =>
      insightFeedback.find(
        (feedback) => feedback.insightKey === selectedInsightKey,
      ) ?? null,
    [insightFeedback, selectedInsightKey],
  );

  const jobs = useMemo(
    () =>
      [...mirror.jobs].sort((left, right) =>
        right.updatedAt.localeCompare(left.updatedAt),
      ),
    [mirror.jobs],
  );
  const deletedResultByRequest = useMemo(
    () => new Map(deletedResults.map((result) => [result.requestId, result])),
    [deletedResults],
  );
  const deletedItemCount =
    deletedRequests.length + deletedInsightFeedback.length;

  const toggleSource = useCallback((recordId: string) => {
    setSelectedSourceIds((current) =>
      current.includes(recordId)
        ? current.filter((id) => id !== recordId)
        : [...current, recordId],
    );
  }, []);

  const enqueue = useCallback(async () => {
    setMessage(null);
    setError(null);
    if (!prompt.trim()) {
      setError("Ask a specific question for Local AI Mirror.");
      return;
    }
    if (selectedSourceIds.length === 0) {
      setError(
        "Select at least one local source record so the result can be cited.",
      );
      return;
    }
    setBusy("enqueue");
    try {
      const requestId = await mirror.enqueue({
        prompt: prompt.trim(),
        sourceRecordIds: selectedSourceIds,
      });
      setPrompt("");
      setSelectedSourceIds([]);
      setMessage(
        `Request ${requestId} is safe in the local Mirror queue. You can leave and retrieve the cited result later.`,
      );
    } catch {
      setError(
        "Local AI Mirror could not queue this request. Your selected source records remain unchanged.",
      );
    } finally {
      setBusy(null);
    }
  }, [mirror, prompt, selectedSourceIds]);

  const connect = useCallback(async () => {
    setBusy("connect");
    setMessage(null);
    setError(null);
    try {
      await mirror.connect();
      setMessage(
        "PX13 Local AI connection check completed. Local Mirror state is synchronized when available.",
      );
    } catch {
      setMessage(
        "The PX13 Local AI companion is not available right now. Requests remain organized and queued on this device.",
      );
    } finally {
      setBusy(null);
    }
  }, [mirror]);

  const retry = useCallback(
    async (jobId: string) => {
      setBusy(`retry:${jobId}`);
      setMessage(null);
      setError(null);
      try {
        await mirror.retry(jobId);
        setMessage(
          `Request ${jobId} returned to the local synchronization queue.`,
        );
      } catch {
        setError(
          "The request remains preserved locally but could not be moved to retry yet.",
        );
      } finally {
        setBusy(null);
      }
    },
    [mirror],
  );

  const requestNotifications = useCallback(async () => {
    setBusy("notifications");
    setMessage(null);
    try {
      await mirror.requestNotifications();
      setMessage(
        "Notification preference updated. Results always remain available in the request ledger.",
      );
    } catch {
      setMessage(
        "Notification permission was not changed. Results remain available in the local request ledger.",
      );
    } finally {
      setBusy(null);
    }
  }, [mirror]);

  const acceptDictation = useCallback(
    async (capture: AcceptedCapture) => {
      await acceptVoiceCapture(repository, {
        ...capture,
        destination: "codex",
        fieldTargetId: "mirror-request-prompt",
      });
      if (capture.manualText) {
        setPrompt((current) =>
          current.trim()
            ? `${current.trimEnd()}\n${capture.manualText}`
            : capture.manualText,
        );
      }
      setMessage(
        "Prompt dictation is safe in IndexedDB; optional manual text was appended once.",
      );
      setDictating(false);
    },
    [repository],
  );

  const saveJournal = useCallback(async () => {
    setMessage(null);
    setError(null);
    if (!journalFields.event.trim()) {
      setError(
        "Record the event as raw observation before saving the journal.",
      );
      return;
    }
    setBusy("journal");
    try {
      const now = new Date().toISOString();
      const id = createMirrorJournalId();
      const sourceById = new Map(records.map((record) => [record.id, record]));
      const record = buildMirrorJournalRecord({
        id,
        title: journalTitle,
        createdAt: now,
        fields: journalFields,
        tags: journalTags.split(/[,\n]/).map((tag) => tag.trim()),
        sourceRecords: journalSourceIds.flatMap((sourceId) => {
          const source = sourceById.get(sourceId);
          return source ? [source] : [];
        }),
      });
      await repository.saveRecord(record);
      setRecords((current) => [
        record,
        ...current.filter((candidate) => candidate.id !== record.id),
      ]);
      setJournalTitle("");
      setJournalTags("");
      setJournalFields({ ...EMPTY_JOURNAL_FIELDS });
      setJournalSourceIds([]);
      setMessage(
        "Mirror Journal saved locally with raw observation, reflection, fields, tags, and source links kept distinct.",
      );
    } catch {
      setError(
        "The Mirror Journal was not saved. Existing local records were not changed.",
      );
    } finally {
      setBusy(null);
    }
  }, [
    journalFields,
    journalSourceIds,
    journalTags,
    journalTitle,
    records,
    repository,
  ]);

  const selectLocalInsight = useCallback(
    (insightKey: string) => {
      setSelectedInsightKey(insightKey);
      const feedback = insightFeedback.find(
        (candidate) => candidate.insightKey === insightKey,
      );
      setInsightCorrection(feedback?.correction ?? "");
      setInsightAnnotation(feedback?.annotation ?? "");
    },
    [insightFeedback],
  );

  const reviewLocalInsight = useCallback(
    async (action: MirrorInsightReviewAction) => {
      if (!selectedLocalInsight) return;
      setMessage(null);
      setError(null);
      setBusy(`insight:${selectedLocalInsight.key}`);
      try {
        const feedback = await repository.reviewMirrorInsight({
          insightKey: selectedLocalInsight.key,
          kind: selectedLocalInsight.kind,
          label: selectedLocalInsight.label,
          sourceRecordIds: selectedLocalInsight.sourceRecordIds,
          action,
          ...(action === "corrected"
            ? { correction: insightCorrection.trim() }
            : {}),
          ...(action === "annotated"
            ? { annotation: insightAnnotation.trim() }
            : {}),
        });
        setInsightFeedback((current) => [
          feedback,
          ...current.filter((item) => item.id !== feedback.id),
        ]);
        setInsightCorrection(feedback.correction ?? "");
        setInsightAnnotation(feedback.annotation ?? "");
        setMessage(
          "Your deterministic insight review was saved without changing its source records.",
        );
      } catch (reviewError) {
        setError(
          reviewError instanceof Error
            ? reviewError.message
            : "The deterministic insight review was not saved.",
        );
      } finally {
        setBusy(null);
      }
    },
    [insightAnnotation, insightCorrection, repository, selectedLocalInsight],
  );

  const deleteLocalInsightReview = useCallback(async () => {
    if (!selectedInsightFeedback) return;
    const confirmationId = `insight:${selectedInsightFeedback.id}`;
    if (deleteConfirmationId !== confirmationId) {
      setDeleteConfirmationId(confirmationId);
      return;
    }
    setBusy(confirmationId);
    setMessage(null);
    setError(null);
    try {
      await repository.deleteMirrorInsightFeedback(selectedInsightFeedback.id);
      setInsightFeedback((current) =>
        current.filter((item) => item.id !== selectedInsightFeedback.id),
      );
      setSelectedInsightKey("");
      setInsightCorrection("");
      setInsightAnnotation("");
      setDeleteConfirmationId(null);
      await refreshDeletedItems();
      setMessage(
        "The deterministic insight review is tombstoned. Its exact evidence links remain available for restore or separately confirmed purge.",
      );
    } catch (deletionError) {
      setError(
        deletionError instanceof Error
          ? deletionError.message
          : "The deterministic insight review was preserved because deletion failed.",
      );
    } finally {
      setBusy(null);
    }
  }, [
    deleteConfirmationId,
    refreshDeletedItems,
    repository,
    selectedInsightFeedback,
  ]);

  const beginReflectionReview = useCallback(
    (job: MirrorClientJob, mode: ReflectionReviewDraft["mode"]) => {
      if (!job.resultId || !job.resultText) return;
      setReflectionReview({
        resultId: job.resultId,
        mode,
        text: job.resultText,
        proposedQuestion: job.resultProposedQuestion ?? "",
        proposedAction: job.resultProposedAction ?? "",
        annotation: job.resultAnnotation ?? "",
      });
    },
    [],
  );

  const saveReflectionReview = useCallback(
    async (job: MirrorClientJob, action: "accepted" | "rejected" | "draft") => {
      if (!job.resultId) return;
      setMessage(null);
      setError(null);
      setBusy(`review:${job.resultId}`);
      try {
        if (action === "accepted" || action === "rejected") {
          await repository.reviewMirrorResult(job.resultId, { action });
        } else if (
          reflectionReview?.resultId === job.resultId &&
          reflectionReview.mode === "revised"
        ) {
          await repository.reviewMirrorResult(job.resultId, {
            action: "revised",
            text: reflectionReview.text,
            proposedQuestion: reflectionReview.proposedQuestion || null,
            proposedAction: reflectionReview.proposedAction || null,
            annotation: reflectionReview.annotation || null,
          });
        } else if (reflectionReview?.resultId === job.resultId) {
          await repository.reviewMirrorResult(job.resultId, {
            action: "annotated",
            annotation: reflectionReview.annotation,
          });
        }
        setReflectionReview(null);
        await mirror.refresh();
        setMessage(
          action === "draft"
            ? "Your Local AI reflection review was saved without changing any source record."
            : `The generated reflection was ${action} without changing any source record.`,
        );
      } catch (reviewError) {
        setError(
          reviewError instanceof Error
            ? reviewError.message
            : "The generated reflection review was not saved.",
        );
      } finally {
        setBusy(null);
      }
    },
    [mirror, reflectionReview, repository],
  );

  const deleteReflection = useCallback(
    async (job: MirrorClientJob) => {
      if (!job.resultId) return;
      if (deleteConfirmationId !== job.id) {
        setDeleteConfirmationId(job.id);
        return;
      }
      setMessage(null);
      setError(null);
      setBusy(`delete:${job.id}`);
      try {
        await mirror.deleteReflection({
          requestId: job.id,
          resultId: job.resultId,
          remoteJobId: job.remoteJobId,
        });
        await refreshDeletedItems();
        setDeleteConfirmationId(null);
        setReflectionReview(null);
        setMessage(
          "Remote deletion was verified when required; the local request and reflection are now tombstoned.",
        );
      } catch (deletionError) {
        setError(
          deletionError instanceof Error
            ? deletionError.message
            : "Deletion could not be verified, so local Mirror data was preserved.",
        );
      } finally {
        setBusy(null);
      }
    },
    [deleteConfirmationId, mirror, refreshDeletedItems],
  );

  const deletePendingRequest = useCallback(
    async (job: MirrorClientJob) => {
      if (job.resultId) return;
      if (deleteConfirmationId !== job.id) {
        setDeleteConfirmationId(job.id);
        return;
      }
      setMessage(null);
      setError(null);
      setBusy(`delete:${job.id}`);
      try {
        await mirror.deleteRequest({
          requestId: job.id,
          remoteJobId: job.remoteJobId,
        });
        await refreshDeletedItems();
        setDeleteConfirmationId(null);
        setMessage(
          "Remote cancellation was verified when required; the local request is now tombstoned.",
        );
      } catch (deletionError) {
        setError(
          deletionError instanceof Error
            ? deletionError.message
            : "Cancellation could not be verified, so the local request was preserved.",
        );
      } finally {
        setBusy(null);
      }
    },
    [deleteConfirmationId, mirror, refreshDeletedItems],
  );

  const restoreDeletedRequest = useCallback(
    async (request: MirrorRequest) => {
      setBusy(`restore:${request.id}`);
      setMessage(null);
      setError(null);
      try {
        await mirror.restoreRequest(request.id);
        await refreshDeletedItems();
        setMessage(
          "The request and its exact source snapshots were restored to the local queue.",
        );
      } catch (restoreError) {
        setError(
          restoreError instanceof Error
            ? restoreError.message
            : "The deleted request could not be restored.",
        );
      } finally {
        setBusy(null);
      }
    },
    [mirror, refreshDeletedItems],
  );

  const restoreDeletedReflection = useCallback(
    async (request: MirrorRequest, result: MirrorResult) => {
      setBusy(`restore:${request.id}`);
      setMessage(null);
      setError(null);
      try {
        await mirror.restoreReflection({
          requestId: request.id,
          resultId: result.id,
        });
        await refreshDeletedItems();
        setMessage(
          "The generated reflection, request, citations, and revision history were restored together.",
        );
      } catch (restoreError) {
        setError(
          restoreError instanceof Error
            ? restoreError.message
            : "The deleted reflection pair could not be restored.",
        );
      } finally {
        setBusy(null);
      }
    },
    [mirror, refreshDeletedItems],
  );

  const restoreDeletedInsight = useCallback(
    async (feedback: MirrorInsightFeedback) => {
      setBusy(`restore:${feedback.id}`);
      setMessage(null);
      setError(null);
      try {
        const restored = await repository.restoreMirrorInsightFeedback(
          feedback.id,
        );
        setInsightFeedback((current) => [
          restored,
          ...current.filter((item) => item.id !== restored.id),
        ]);
        await refreshDeletedItems();
        setMessage(
          "The deterministic insight review and its exact evidence links were restored.",
        );
      } catch (restoreError) {
        setError(
          restoreError instanceof Error
            ? restoreError.message
            : "The deleted insight review could not be restored.",
        );
      } finally {
        setBusy(null);
      }
    },
    [refreshDeletedItems, repository],
  );

  const purgeDeletedRequest = useCallback(
    async (request: MirrorRequest) => {
      const key = `request:${request.id}`;
      if (purgeConfirmations[key] !== purgePhrase(request.id)) {
        setError(`Type ${purgePhrase(request.id)} to permanently purge.`);
        return;
      }
      setBusy(`purge:${request.id}`);
      setMessage(null);
      setError(null);
      try {
        await mirror.purgeRequest({
          requestId: request.id,
          remoteJobId: request.remoteJobId,
        });
        setPurgeConfirmations((current) => ({ ...current, [key]: "" }));
        await refreshDeletedItems();
        setMessage(
          "Remote absence was verified when required; the local request and source snapshots were permanently purged.",
        );
      } catch (purgeError) {
        setError(
          purgeError instanceof Error
            ? purgeError.message
            : "Permanent purge could not be verified, so the deleted request was preserved.",
        );
      } finally {
        setBusy(null);
      }
    },
    [mirror, purgeConfirmations, refreshDeletedItems],
  );

  const purgeDeletedReflection = useCallback(
    async (request: MirrorRequest, result: MirrorResult) => {
      const key = `reflection:${result.id}`;
      if (purgeConfirmations[key] !== purgePhrase(result.id)) {
        setError(`Type ${purgePhrase(result.id)} to permanently purge.`);
        return;
      }
      setBusy(`purge:${result.id}`);
      setMessage(null);
      setError(null);
      try {
        await mirror.purgeReflection({
          requestId: request.id,
          resultId: result.id,
          remoteJobId: request.remoteJobId,
        });
        setPurgeConfirmations((current) => ({ ...current, [key]: "" }));
        await refreshDeletedItems();
        setMessage(
          "Remote absence was verified; the paired request, generated result, citations, and revision history were permanently purged.",
        );
      } catch (purgeError) {
        setError(
          purgeError instanceof Error
            ? purgeError.message
            : "Permanent purge could not be verified, so the deleted reflection pair was preserved.",
        );
      } finally {
        setBusy(null);
      }
    },
    [mirror, purgeConfirmations, refreshDeletedItems],
  );

  const purgeDeletedInsight = useCallback(
    async (feedback: MirrorInsightFeedback) => {
      const key = `insight:${feedback.id}`;
      if (purgeConfirmations[key] !== purgePhrase(feedback.id)) {
        setError(`Type ${purgePhrase(feedback.id)} to permanently purge.`);
        return;
      }
      setBusy(`purge:${feedback.id}`);
      setMessage(null);
      setError(null);
      try {
        await repository.purgeMirrorInsightFeedback(feedback.id);
        setPurgeConfirmations((current) => ({ ...current, [key]: "" }));
        await refreshDeletedItems();
        setMessage(
          "The deterministic insight review and its review history were permanently purged. Source records were not changed.",
        );
      } catch (purgeError) {
        setError(
          purgeError instanceof Error
            ? purgeError.message
            : "Permanent purge failed, so the deleted insight review was preserved.",
        );
      } finally {
        setBusy(null);
      }
    },
    [purgeConfirmations, refreshDeletedItems, repository],
  );

  return (
    <>
      <ScreenHeader eyebrow="Local reflection and intelligence" title="Mirror">
        <p>
          Journal and inspect transparent local patterns on this device, or
          compose grounded generative requests that synchronize with PX13 when
          it is available.
        </p>
      </ScreenHeader>

      <section className="hero-card mirror-core-card">
        <div className="card-heading">
          <div>
            <p className="eyebrow">Generative companion client</p>
            <h2>Local AI Mirror</h2>
          </div>
          <StatusBadge
            status={mirror.connectivity === "online" ? "ready" : "in-progress"}
          />
        </div>
        <div className="metric-grid">
          <div className="metric">
            <span>iPhone client</span>
            <strong>
              {mirror.coreStatus === "ready"
                ? "Local store ready"
                : "Needs attention"}
            </strong>
          </div>
          <div className="metric">
            <span>PX13 companion</span>
            <strong>{mirror.connectivity}</strong>
          </div>
          <div className="metric">
            <span>Requests</span>
            <strong>{jobs.length}</strong>
          </div>
        </div>
        <div className="platform-action-row">
          <button
            className="primary-button"
            type="button"
            disabled={busy === "connect" || mirror.connectivity === "checking"}
            onClick={() => void connect()}
          >
            {busy === "connect" || mirror.connectivity === "checking"
              ? "Checking PX13…"
              : mirror.connectivity === "online"
                ? "Synchronize now"
                : "Connect Local AI companion"}
          </button>
          <button
            className="secondary-button"
            type="button"
            onClick={() => void mirror.refresh()}
          >
            Refresh local ledger
          </button>
        </div>
        <p className="fine-print">
          Offline is a supported state. Prompt, source IDs, status, and any
          prior result remain in IndexedDB; connection problems never become a
          credential requirement.
        </p>
      </section>

      <section
        className="panel-card mirror-journal"
        aria-labelledby="mirror-journal-title"
      >
        <div className="card-heading">
          <div>
            <p className="eyebrow">Structured local evidence</p>
            <h2 id="mirror-journal-title">Mirror Journal</h2>
          </div>
          <StatusBadge status="ready" />
        </div>
        <p>
          The event is stored as raw self-reported observation. Reflection is a
          separate interpretation layer; every remaining answer stays in its
          named field.
        </p>
        <div className="mirror-journal-grid">
          <label className="platform-field mirror-journal-wide">
            <span>Title (optional)</span>
            <input
              value={journalTitle}
              maxLength={180}
              onChange={(event) => setJournalTitle(event.target.value)}
              placeholder="A concise name for this reflection"
            />
          </label>
          <label className="platform-field mirror-journal-wide">
            <span>Event · raw observation *</span>
            <textarea
              value={journalFields.event}
              maxLength={12_000}
              onChange={(event) =>
                setJournalFields((current) => ({
                  ...current,
                  event: event.target.value,
                }))
              }
              placeholder="What happened? Record only what you directly remember observing."
            />
          </label>
          <label className="platform-field">
            <span>Emotion</span>
            <input
              value={journalFields.emotion}
              maxLength={500}
              onChange={(event) =>
                setJournalFields((current) => ({
                  ...current,
                  emotion: event.target.value,
                }))
              }
              placeholder="What did you feel?"
            />
          </label>
          <label className="platform-field">
            <span>Quality / value</span>
            <input
              value={journalFields.qualityOrValue}
              maxLength={500}
              onChange={(event) =>
                setJournalFields((current) => ({
                  ...current,
                  qualityOrValue: event.target.value,
                }))
              }
              placeholder="What value was present or absent?"
            />
          </label>
          <label className="platform-field">
            <span>Judgment</span>
            <textarea
              value={journalFields.judgment}
              maxLength={4_000}
              onChange={(event) =>
                setJournalFields((current) => ({
                  ...current,
                  judgment: event.target.value,
                }))
              }
              placeholder="What judgment did you notice?"
            />
          </label>
          <label className="platform-field">
            <span>Self-reflection</span>
            <textarea
              value={journalFields.selfReflection}
              maxLength={4_000}
              onChange={(event) =>
                setJournalFields((current) => ({
                  ...current,
                  selfReflection: event.target.value,
                }))
              }
              placeholder="What do you notice about your part?"
            />
          </label>
          <label className="platform-field">
            <span>Alternative response</span>
            <textarea
              value={journalFields.alternativeResponse}
              maxLength={4_000}
              onChange={(event) =>
                setJournalFields((current) => ({
                  ...current,
                  alternativeResponse: event.target.value,
                }))
              }
              placeholder="What response could you choose next time?"
            />
          </label>
          <label className="platform-field">
            <span>Action</span>
            <textarea
              value={journalFields.action}
              maxLength={4_000}
              onChange={(event) =>
                setJournalFields((current) => ({
                  ...current,
                  action: event.target.value,
                }))
              }
              placeholder="What action did you take?"
            />
          </label>
          <label className="platform-field">
            <span>Outcome</span>
            <textarea
              value={journalFields.outcome}
              maxLength={4_000}
              onChange={(event) =>
                setJournalFields((current) => ({
                  ...current,
                  outcome: event.target.value,
                }))
              }
              placeholder="What outcome was actually observed?"
            />
          </label>
          <label className="platform-field">
            <span>Tags</span>
            <input
              value={journalTags}
              onChange={(event) => setJournalTags(event.target.value)}
              placeholder="work, patience, theme:communication"
            />
            <small>
              Separate tags with commas. “mirror-journal” is added
              automatically.
            </small>
          </label>
          <label className="platform-field">
            <span>Traceable source record</span>
            <select
              value=""
              onChange={(event) => {
                const sourceId = event.target.value;
                if (sourceId) {
                  setJournalSourceIds((current) =>
                    current.includes(sourceId)
                      ? current
                      : [...current, sourceId],
                  );
                }
              }}
            >
              <option value="">Add an existing record…</option>
              {records
                .filter((record) => !journalSourceIds.includes(record.id))
                .map((record) => (
                  <option key={record.id} value={record.id}>
                    {record.title}
                  </option>
                ))}
            </select>
          </label>
        </div>
        {journalSources.length > 0 ? (
          <div
            className="selected-source-tray"
            aria-label="Journal source records"
          >
            {journalSources.map((record) => (
              <button
                type="button"
                key={record.id}
                aria-label={`Remove ${record.title}`}
                onClick={() =>
                  setJournalSourceIds((current) =>
                    current.filter((sourceId) => sourceId !== record.id),
                  )
                }
              >
                <span>{record.title}</span>
                <b aria-hidden="true">×</b>
              </button>
            ))}
          </div>
        ) : null}
        <button
          className="primary-button"
          type="button"
          disabled={busy === "journal"}
          onClick={() => void saveJournal()}
        >
          {busy === "journal"
            ? "Saving in IndexedDB…"
            : "Save Mirror Journal locally"}
        </button>
      </section>

      <section
        className="panel-card local-insights"
        aria-labelledby="local-insights-title"
      >
        <div className="card-heading">
          <div>
            <p className="eyebrow">Deterministic local · not generative</p>
            <h2 id="local-insights-title">Mirror Core Insights</h2>
          </div>
          <span className="counter">No PX13 required</span>
        </div>
        <p>
          Counts come only from the filtered Codex records below. Themes,
          symbols, and people appear only when explicitly tagged, structured, or
          linked; comparisons are exact lexical overlap, not an inferred
          meaning.
        </p>
        <div className="local-insight-filters">
          <label className="platform-field local-insight-query">
            <span>Text filter</span>
            <input
              type="search"
              value={insightQuery}
              onChange={(event) => setInsightQuery(event.target.value)}
              placeholder="All terms must appear in the record"
            />
          </label>
          <label className="platform-field">
            <span>From</span>
            <input
              type="date"
              value={insightFromDate}
              onChange={(event) => setInsightFromDate(event.target.value)}
            />
          </label>
          <label className="platform-field">
            <span>Through</span>
            <input
              type="date"
              value={insightToDate}
              onChange={(event) => setInsightToDate(event.target.value)}
            />
          </label>
          <label className="platform-field">
            <span>Record kind</span>
            <select
              value={insightKind}
              onChange={(event) =>
                setInsightKind(event.target.value as RecordKind | "")
              }
            >
              <option value="">All kinds</option>
              {recordKinds.map((kind) => (
                <option key={kind} value={kind}>
                  {kind.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </label>
          <label className="platform-field">
            <span>Exact tag</span>
            <select
              value={insightTag}
              onChange={(event) => setInsightTag(event.target.value)}
            >
              <option value="">All tags</option>
              {unfilteredInsights.tags.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.value}
                </option>
              ))}
            </select>
          </label>
          <label className="platform-field">
            <span>Explicit theme</span>
            <select
              value={insightTheme}
              onChange={(event) => setInsightTheme(event.target.value)}
            >
              <option value="">All themes</option>
              {unfilteredInsights.themes.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.value}
                </option>
              ))}
            </select>
          </label>
          <label className="platform-field">
            <span>Explicit symbol</span>
            <select
              value={insightSymbol}
              onChange={(event) => setInsightSymbol(event.target.value)}
            >
              <option value="">All symbols</option>
              {unfilteredInsights.symbols.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.value}
                </option>
              ))}
            </select>
          </label>
          <label className="platform-field">
            <span>Explicit person</span>
            <select
              value={insightPerson}
              onChange={(event) => setInsightPerson(event.target.value)}
            >
              <option value="">All people</option>
              {unfilteredInsights.people.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.value}
                </option>
              ))}
            </select>
          </label>
          <label className="platform-field">
            <span>Practice</span>
            <select
              value={insightPractice}
              onChange={(event) => setInsightPractice(event.target.value)}
            >
              <option value="">All practices</option>
              {unfilteredInsights.practices.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.value}
                </option>
              ))}
            </select>
          </label>
          <label className="platform-field">
            <span>Source track</span>
            <select
              value={insightSourceTrack}
              onChange={(event) => setInsightSourceTrack(event.target.value)}
            >
              <option value="">All source tracks</option>
              {unfilteredInsights.sourceTracks.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.value}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="insight-dismissed-toggle">
          <input
            type="checkbox"
            checked={showDismissedInsights}
            onChange={(event) => setShowDismissedInsights(event.target.checked)}
          />
          <span>Show dismissed deterministic insights</span>
        </label>
        <div className="metric-grid local-insight-metrics">
          <div className="metric">
            <span>Matching records</span>
            <strong>{localInsights.recordCount}</strong>
          </div>
          <div className="metric">
            <span>Layer words</span>
            <strong>{localInsights.totalWordCount}</strong>
          </div>
          <div className="metric">
            <span>Links</span>
            <strong>
              {localInsights.links.backlinkCount +
                localInsights.links.sourceLinkCount}
            </strong>
          </div>
        </div>
        <div className="local-insight-groups">
          <article className="local-insight-group">
            <h3>Frequent words</h3>
            <p>Observation + interpretation; fixed common-word list removed.</p>
            <EvidenceCountList
              items={localInsights.topWords}
              emptyLabel="No layer text in this filter."
              feedbackByKey={insightFeedbackByKey}
              kind="term"
              scope="recurring"
              showDismissed={showDismissedInsights}
            />
            <strong>Recurring terms (2+ occurrences)</strong>
            <EvidenceCountList
              items={localInsights.recurringTerms}
              emptyLabel="No recurring non-common terms in this filter."
              feedbackByKey={insightFeedbackByKey}
              kind="term"
              scope="recurring"
              showDismissed={showDismissedInsights}
            />
          </article>
          <article className="local-insight-group">
            <h3>Tags</h3>
            <p>One count per tag per record.</p>
            <EvidenceCountList
              items={localInsights.tags}
              emptyLabel="No tags in this filter."
              feedbackByKey={insightFeedbackByKey}
              kind="tag"
              scope="tag"
              showDismissed={showDismissedInsights}
            />
          </article>
          <article className="local-insight-group">
            <h3>Explicit themes</h3>
            <p>Only theme fields and tags beginning “theme:”.</p>
            <EvidenceCountList
              items={localInsights.themes}
              emptyLabel="No explicit themes recorded."
              feedbackByKey={insightFeedbackByKey}
              kind="theme"
              scope="theme"
              showDismissed={showDismissedInsights}
            />
          </article>
          <article className="local-insight-group">
            <h3>Explicit references</h3>
            <p>
              Structured/tagged symbols and people; literal valid ISO dates.
            </p>
            <strong>Symbols</strong>
            <EvidenceCountList
              items={localInsights.symbols}
              emptyLabel="No explicit symbols recorded."
              feedbackByKey={insightFeedbackByKey}
              kind="symbol"
              scope="recurring"
              showDismissed={showDismissedInsights}
            />
            <strong>Recurring symbols (2+ records/occurrences)</strong>
            <EvidenceCountList
              items={localInsights.recurringSymbols}
              emptyLabel="No recurring explicit symbols recorded."
              feedbackByKey={insightFeedbackByKey}
              kind="symbol"
              scope="recurring"
              showDismissed={showDismissedInsights}
            />
            <strong>People</strong>
            <EvidenceCountList
              items={localInsights.people}
              emptyLabel="No explicit people recorded."
              feedbackByKey={insightFeedbackByKey}
              kind="person"
              scope="person"
              showDismissed={showDismissedInsights}
            />
            <strong>Date references</strong>
            <EvidenceCountList
              items={localInsights.dateReferences}
              emptyLabel="No explicit ISO dates recorded."
              feedbackByKey={insightFeedbackByKey}
              kind="date"
              scope="date"
              showDismissed={showDismissedInsights}
            />
          </article>
          <article className="local-insight-group">
            <h3>Practice and source track</h3>
            <p>
              Exact structured fields or prefixed tags; no inferred assignment.
            </p>
            <strong>Practices</strong>
            <EvidenceCountList
              items={localInsights.practices}
              emptyLabel="No explicit practices recorded."
              feedbackByKey={insightFeedbackByKey}
              kind="practice"
              scope="practice"
              showDismissed={showDismissedInsights}
            />
            <strong>Source tracks</strong>
            <EvidenceCountList
              items={localInsights.sourceTracks}
              emptyLabel="No explicit source tracks recorded."
              feedbackByKey={insightFeedbackByKey}
              kind="source_track"
              scope="source-track"
              showDismissed={showDismissedInsights}
            />
          </article>
          <article className="local-insight-group">
            <h3>Repeated trigger and action evidence</h3>
            <p>Only exact structured values occurring at least twice.</p>
            <strong>Triggers</strong>
            <EvidenceCountList
              items={localInsights.repeatedTriggers}
              emptyLabel="No repeated structured triggers recorded."
              feedbackByKey={insightFeedbackByKey}
              kind="repeated_trigger"
              scope="trigger"
              showDismissed={showDismissedInsights}
            />
            <strong>Actions</strong>
            <EvidenceCountList
              items={localInsights.repeatedActions}
              emptyLabel="No repeated structured actions recorded."
              feedbackByKey={insightFeedbackByKey}
              kind="repeated_action"
              scope="action"
              showDismissed={showDismissedInsights}
            />
          </article>
        </div>

        <article className="local-insight-group local-insight-wide">
          <h3>Record time series</h3>
          <p>
            UTC creation day, with separately counted observation and
            interpretation words. Only days containing evidence are shown.
          </p>
          {localInsights.timeSeries.length === 0 ? (
            <p className="muted-copy">No dates in this filter.</p>
          ) : (
            <div className="insight-time-series">
              {localInsights.timeSeries.slice(-14).map((point) => (
                <div key={point.date}>
                  <time>{point.date}</time>
                  <span>{point.recordCount} record(s)</span>
                  <span>{point.observationWordCount} observation words</span>
                  <span>
                    {point.interpretationWordCount} interpretation words
                  </span>
                  <RecordLinks recordIds={point.recordIds} />
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="local-insight-group local-insight-wide">
          <h3>Structured evidence over time</h3>
          <p>
            Exact values grouped by UTC record date. These are evidence counts,
            not causal or predictive claims.
          </p>
          <div className="insight-trend-grid">
            <section>
              <strong>State / emotion</strong>
              <TrendEvidenceList
                points={localInsights.trends.state}
                emptyLabel="No structured state evidence."
                feedbackByKey={insightFeedbackByKey}
                kind="state_trend"
                scope="state"
                showDismissed={showDismissedInsights}
              />
            </section>
            <section>
              <strong>Sleep</strong>
              <TrendEvidenceList
                points={localInsights.trends.sleep}
                emptyLabel="No structured sleep evidence."
                feedbackByKey={insightFeedbackByKey}
                kind="sleep_trend"
                scope="sleep"
                showDismissed={showDismissedInsights}
              />
            </section>
            <section>
              <strong>Practice</strong>
              <TrendEvidenceList
                points={localInsights.trends.practice}
                emptyLabel="No structured practice evidence."
                feedbackByKey={insightFeedbackByKey}
                kind="practice_trend"
                scope="practice"
                showDismissed={showDismissedInsights}
              />
            </section>
            <section>
              <strong>Outcome</strong>
              <TrendEvidenceList
                points={localInsights.trends.outcome}
                emptyLabel="No structured outcome evidence."
                feedbackByKey={insightFeedbackByKey}
                kind="outcome_trend"
                scope="outcome"
                showDismissed={showDismissedInsights}
              />
            </section>
          </div>
        </article>

        <article className="local-insight-group local-insight-wide">
          <h3>Intention / action / outcome</h3>
          <p>
            Structured fields are shown verbatim. “Shared” means the exact same
            non-common word appears in both fields; it is not a semantic score.
          </p>
          {localInsights.intentionActionOutcomes.length === 0 ? (
            <p className="muted-copy">
              No structured intention, action, or outcome fields.
            </p>
          ) : (
            <div className="insight-comparison-list">
              {localInsights.intentionActionOutcomes
                .slice(0, 12)
                .map((comparison) => (
                  <article key={comparison.recordId}>
                    <b>{comparison.title}</b>
                    <RecordLinks recordIds={[comparison.recordId]} />
                    <dl>
                      <div>
                        <dt>Intention</dt>
                        <dd>{comparison.intention ?? "Not recorded"}</dd>
                      </div>
                      <div>
                        <dt>Action</dt>
                        <dd>{comparison.action ?? "Not recorded"}</dd>
                      </div>
                      <div>
                        <dt>Outcome</dt>
                        <dd>{comparison.outcome ?? "Not recorded"}</dd>
                      </div>
                      <div>
                        <dt>Shared terms</dt>
                        <dd>
                          intention↔action:{" "}
                          {comparison.sharedIntentionActionTerms.join(", ") ||
                            "none"}
                          ; action↔outcome:{" "}
                          {comparison.sharedActionOutcomeTerms.join(", ") ||
                            "none"}
                          ; intention↔outcome:{" "}
                          {comparison.sharedIntentionOutcomeTerms.join(", ") ||
                            "none"}
                        </dd>
                      </div>
                    </dl>
                  </article>
                ))}
            </div>
          )}
        </article>

        <article className="local-insight-group local-insight-wide">
          <h3>Backlinks and source links</h3>
          <div className="insight-link-summary">
            <span>{localInsights.links.backlinkCount} backlinks</span>
            <span>{localInsights.links.sourceLinkCount} source links</span>
            <span>
              {localInsights.links.recordsWithBacklinks} records with backlinks
            </span>
            <span>
              {localInsights.links.recordsWithSourceLinks} records with sources
            </span>
            <span>
              {localInsights.links.unresolvedBacklinkCount} unresolved backlink
              IDs
            </span>
            <span>{localInsights.links.selfBacklinkCount} self-links</span>
          </div>
          <RecordLinks recordIds={localInsights.matchedRecordIds} />
          <strong>Backlink relationships</strong>
          <EvidenceCountList
            items={localInsights.links.backlinksByRelationship}
            emptyLabel="No backlink relationships in this filter."
            feedbackByKey={insightFeedbackByKey}
            kind="link_pattern"
            scope="backlink-relationship"
            showDismissed={showDismissedInsights}
          />
          <strong>Source link types</strong>
          <EvidenceCountList
            items={localInsights.links.sourceLinksByType}
            emptyLabel="No source-link types in this filter."
            feedbackByKey={insightFeedbackByKey}
            kind="link_pattern"
            scope="source-link-type"
            showDismissed={showDismissedInsights}
          />
          <p className="fine-print">
            Unresolved means the backlink ID does not exist anywhere in the
            current non-deleted local Codex, even when the target is outside the
            active filter.
          </p>
        </article>

        <article className="local-insight-group local-insight-wide insight-review-panel">
          <h3>Review a deterministic insight</h3>
          <p>
            Accept, dismiss, correct, or annotate a displayed count. Your review
            is stored separately with exact source IDs and never rewrites the
            underlying Codex records.
          </p>
          {visibleReviewableLocalInsights.length === 0 ? (
            <p className="muted-copy">
              No reviewable deterministic evidence in this filter.
            </p>
          ) : (
            <>
              <label className="platform-field">
                <span>Displayed evidence</span>
                <select
                  value={selectedInsightKey}
                  onChange={(event) => selectLocalInsight(event.target.value)}
                >
                  <option value="">Choose an insight…</option>
                  {visibleReviewableLocalInsights.map((insight) => (
                    <option key={insight.key} value={insight.key}>
                      {insight.label}
                    </option>
                  ))}
                </select>
              </label>
              {selectedLocalInsight ? (
                <div className="insight-review-editor">
                  <div className="layer-heading">
                    <span>
                      {selectedInsightFeedback?.disposition ?? "unreviewed"}
                    </span>
                    <b>{selectedLocalInsight.kind.replaceAll("_", " ")}</b>
                  </div>
                  <strong>{selectedLocalInsight.label}</strong>
                  <RecordLinks
                    recordIds={selectedLocalInsight.sourceRecordIds}
                  />
                  {selectedInsightFeedback?.correction ? (
                    <p>
                      <b>Your correction:</b>{" "}
                      {selectedInsightFeedback.correction}
                    </p>
                  ) : null}
                  {selectedInsightFeedback?.annotation ? (
                    <p>
                      <b>Your annotation:</b>{" "}
                      {selectedInsightFeedback.annotation}
                    </p>
                  ) : null}
                  <label className="platform-field">
                    <span>Correction</span>
                    <textarea
                      value={insightCorrection}
                      maxLength={8_000}
                      onChange={(event) =>
                        setInsightCorrection(event.target.value)
                      }
                      placeholder="State your corrected reading without changing the source evidence."
                    />
                  </label>
                  <label className="platform-field">
                    <span>Annotation</span>
                    <textarea
                      value={insightAnnotation}
                      maxLength={12_000}
                      onChange={(event) =>
                        setInsightAnnotation(event.target.value)
                      }
                      placeholder="Add context that should travel with this insight."
                    />
                  </label>
                  <div className="platform-action-row">
                    <button
                      className="secondary-button"
                      type="button"
                      disabled={busy === `insight:${selectedLocalInsight.key}`}
                      onClick={() => void reviewLocalInsight("accepted")}
                    >
                      Accept count
                    </button>
                    <button
                      className="secondary-button"
                      type="button"
                      disabled={
                        busy === `insight:${selectedLocalInsight.key}` ||
                        !insightCorrection.trim()
                      }
                      onClick={() => void reviewLocalInsight("corrected")}
                    >
                      Save correction
                    </button>
                    <button
                      className="secondary-button"
                      type="button"
                      disabled={
                        busy === `insight:${selectedLocalInsight.key}` ||
                        !insightAnnotation.trim()
                      }
                      onClick={() => void reviewLocalInsight("annotated")}
                    >
                      Save annotation
                    </button>
                    <button
                      className="danger-button"
                      type="button"
                      disabled={busy === `insight:${selectedLocalInsight.key}`}
                      onClick={() => void reviewLocalInsight("dismissed")}
                    >
                      Dismiss insight
                    </button>
                    {selectedInsightFeedback ? (
                      <button
                        className="danger-button"
                        type="button"
                        disabled={
                          busy === `insight:${selectedInsightFeedback.id}`
                        }
                        onClick={() => void deleteLocalInsightReview()}
                      >
                        {deleteConfirmationId ===
                        `insight:${selectedInsightFeedback.id}`
                          ? "Confirm move to deleted items"
                          : "Delete saved review"}
                      </button>
                    ) : null}
                  </div>
                  {selectedInsightFeedback &&
                  deleteConfirmationId ===
                    `insight:${selectedInsightFeedback.id}` ? (
                    <p className="platform-message warning">
                      This keeps the review, history, and source IDs in deleted
                      items until you restore it or separately type-confirm a
                      permanent purge.
                    </p>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </article>

        <article className="local-insight-group local-insight-wide mirror-evidence-index">
          <h3>Exact underlying records</h3>
          <p>
            Pattern and citation links open these read-only local records. Raw
            observation, interpretation, structured fields, and links remain
            visibly separate.
          </p>
          {records.map((record) => (
            <details key={record.id} id={recordAnchorId(record.id)}>
              <summary>
                <b>{record.title}</b> · {record.kind.replaceAll("_", " ")} ·{" "}
                <code>{record.id}</code>
              </summary>
              <dl>
                <div>
                  <dt>Observation</dt>
                  <dd>{record.observation?.text ?? "Not recorded"}</dd>
                </div>
                <div>
                  <dt>Interpretation</dt>
                  <dd>{record.interpretation?.text ?? "Not recorded"}</dd>
                </div>
                <div>
                  <dt>Tags</dt>
                  <dd>{record.tags.join(", ") || "None"}</dd>
                </div>
                <div>
                  <dt>Structured fields</dt>
                  <dd>
                    <pre>{JSON.stringify(record.fields, null, 2)}</pre>
                  </dd>
                </div>
                <div>
                  <dt>Backlinks</dt>
                  <dd>
                    {record.backlinks
                      .map((link) => `${link.relationship}: ${link.recordId}`)
                      .join("; ") || "None"}
                  </dd>
                </div>
                <div>
                  <dt>Source links</dt>
                  <dd>
                    {record.sourceLinks
                      .map((link) => `${link.sourceType}: ${link.label}`)
                      .join("; ") || "None"}
                  </dd>
                </div>
              </dl>
            </details>
          ))}
        </article>
      </section>

      <section
        className="panel-card mirror-composer"
        aria-labelledby="mirror-compose-title"
      >
        <div className="card-heading">
          <div>
            <p className="eyebrow">Offline-capable request</p>
            <h2 id="mirror-compose-title">Ask from your evidence</h2>
          </div>
          <span className="counter">{selectedSourceIds.length} cited</span>
        </div>
        <div className="platform-field">
          <div className="platform-field-heading">
            <label htmlFor="mirror-prompt">Request</label>
            <button
              className="field-dictate-button"
              type="button"
              onClick={() => setDictating(true)}
            >
              <span className="mini-mic" aria-hidden="true" /> Dictate
            </button>
          </div>
          <textarea
            id="mirror-prompt"
            value={prompt}
            maxLength={8_000}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Compare these observations. Identify tensions, recurring constraints, and a grounded next question. Cite every claim."
          />
          <small>{prompt.length.toLocaleString()} / 8,000 characters</small>
        </div>

        {selectedSources.length ? (
          <div
            className="selected-source-tray"
            aria-label="Selected Mirror sources"
          >
            {selectedSources.map((record) => (
              <button
                type="button"
                key={record.id}
                onClick={() => toggleSource(record.id)}
                aria-label={`Remove ${record.title}`}
              >
                <span>{record.title}</span>
                <b aria-hidden="true">×</b>
              </button>
            ))}
          </div>
        ) : (
          <p className="platform-message warning">
            Select one or more source records below. Mirror cannot generate an
            uncited request.
          </p>
        )}

        <button
          className="primary-button"
          type="button"
          disabled={busy === "enqueue"}
          onClick={() => void enqueue()}
        >
          {busy === "enqueue"
            ? "Saving to local queue…"
            : mirror.connectivity === "online"
              ? "Queue & synchronize"
              : "Queue locally"}
        </button>
      </section>

      <section className="panel-card mirror-source-organizer">
        <div className="card-heading">
          <div>
            <p className="eyebrow">Local AI evidence selection</p>
            <h2>Source organizer</h2>
          </div>
          <span className="counter">{records.length}</span>
        </div>
        <p>
          Organize the next request even while PX13 is unavailable. Selecting a
          record stores its stable ID with the request—not a loose pasted claim.
        </p>
        <label className="platform-field">
          <span>Filter local sources</span>
          <input
            type="search"
            value={sourceQuery}
            onChange={(event) => setSourceQuery(event.target.value)}
            placeholder="Title, type, tag, or evidence text"
          />
        </label>
        {visibleSources.length === 0 ? (
          <div className="platform-empty">
            <strong>No source records match.</strong>
            <p>
              Capture a Codex, Studio, Lab, or voice record, or broaden the
              filter.
            </p>
          </div>
        ) : (
          <div className="mirror-source-list">
            {visibleSources.map((record) => {
              const selected = selectedSourceIds.includes(record.id);
              return (
                <label
                  className={`mirror-source${selected ? " selected" : ""}`}
                  key={record.id}
                >
                  <input
                    type="checkbox"
                    checked={selected}
                    disabled={!selected && selectedSourceIds.length >= 24}
                    onChange={() => toggleSource(record.id)}
                  />
                  <span>
                    <b>{record.title}</b>
                    <small>
                      {record.kind.replaceAll("_", " ")} · {record.id}
                    </small>
                    <em>{sourceExcerpt(record)}</em>
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </section>

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

      <section className="panel-card mirror-jobs">
        <div className="card-heading">
          <div>
            <p className="eyebrow">Persistent local ledger</p>
            <h2>Requests and results</h2>
          </div>
          <span className="counter">{jobs.length}</span>
        </div>
        {jobs.length === 0 ? (
          <div className="platform-empty">
            <strong>No Mirror requests yet.</strong>
            <p>
              Your first request can be queued even when this device is offline.
            </p>
          </div>
        ) : (
          <div className="mirror-job-list">
            {jobs.map((job) => (
              <article className={`mirror-job job-${job.status}`} key={job.id}>
                <div className="layer-heading">
                  <span>{statusLabels[job.status]}</span>
                  <b>{formatTimestamp(job.updatedAt)}</b>
                </div>
                <h3>{job.prompt}</h3>
                <p className="job-guidance">{jobGuidance(job)}</p>
                <div className="job-source-ids">
                  <strong>Requested sources</strong>
                  <RecordLinks recordIds={job.sourceRecordIds} />
                </div>
                {job.resultText && hasDisplayableCitations(job) ? (
                  <section className="mirror-result">
                    <p className="eyebrow">Synchronized Local AI result</p>
                    <div className="mirror-result-metadata">
                      <span>
                        {job.resultProviderType?.replaceAll("_", " ") ??
                          "legacy provider"}
                      </span>
                      <span>
                        {job.resultProvider ?? "unknown runtime"} ·{" "}
                        {job.resultModel ?? "unknown model"}
                      </span>
                      <b>{job.resultDisposition ?? "unreviewed"}</b>
                    </div>
                    <p>{job.resultText}</p>
                    <div className="mirror-proposals">
                      <article>
                        <strong>Proposed question</strong>
                        <p>
                          {job.resultProposedQuestion ??
                            "This legacy reflection did not include a separate proposed question."}
                        </p>
                      </article>
                      <article>
                        <strong>Proposed action</strong>
                        <p>
                          {job.resultProposedAction ??
                            "This legacy reflection did not include a separate proposed action."}
                        </p>
                      </article>
                    </div>
                    {job.resultAnnotation ? (
                      <p className="mirror-user-annotation">
                        <strong>Your annotation</strong>
                        {job.resultAnnotation}
                      </p>
                    ) : null}
                    <div className="mirror-review-actions">
                      <button
                        className="secondary-button"
                        type="button"
                        disabled={busy === `review:${job.resultId}`}
                        onClick={() =>
                          void saveReflectionReview(job, "accepted")
                        }
                      >
                        Accept
                      </button>
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => beginReflectionReview(job, "revised")}
                      >
                        Revise
                      </button>
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() => beginReflectionReview(job, "annotated")}
                      >
                        Annotate
                      </button>
                      <button
                        className="secondary-button"
                        type="button"
                        disabled={busy === `review:${job.resultId}`}
                        onClick={() =>
                          void saveReflectionReview(job, "rejected")
                        }
                      >
                        Reject
                      </button>
                    </div>
                    {reflectionReview?.resultId === job.resultId ? (
                      <div className="mirror-review-editor">
                        <p className="eyebrow">
                          {reflectionReview.mode === "revised"
                            ? "User revision"
                            : "User annotation"}
                        </p>
                        {reflectionReview.mode === "revised" ? (
                          <>
                            <label className="platform-field">
                              <span>Reflection text</span>
                              <textarea
                                value={reflectionReview.text}
                                onChange={(event) =>
                                  setReflectionReview((current) =>
                                    current
                                      ? { ...current, text: event.target.value }
                                      : current,
                                  )
                                }
                              />
                            </label>
                            <label className="platform-field">
                              <span>Proposed question</span>
                              <textarea
                                value={reflectionReview.proposedQuestion}
                                onChange={(event) =>
                                  setReflectionReview((current) =>
                                    current
                                      ? {
                                          ...current,
                                          proposedQuestion: event.target.value,
                                        }
                                      : current,
                                  )
                                }
                              />
                            </label>
                            <label className="platform-field">
                              <span>Proposed action</span>
                              <textarea
                                value={reflectionReview.proposedAction}
                                onChange={(event) =>
                                  setReflectionReview((current) =>
                                    current
                                      ? {
                                          ...current,
                                          proposedAction: event.target.value,
                                        }
                                      : current,
                                  )
                                }
                              />
                            </label>
                          </>
                        ) : null}
                        <label className="platform-field">
                          <span>Your annotation</span>
                          <textarea
                            value={reflectionReview.annotation}
                            onChange={(event) =>
                              setReflectionReview((current) =>
                                current
                                  ? {
                                      ...current,
                                      annotation: event.target.value,
                                    }
                                  : current,
                              )
                            }
                          />
                        </label>
                        <div className="platform-action-row">
                          <button
                            className="primary-button"
                            type="button"
                            disabled={
                              busy === `review:${job.resultId}` ||
                              (reflectionReview.mode === "revised" &&
                                (!reflectionReview.text.trim() ||
                                  !reflectionReview.proposedQuestion.trim() ||
                                  !reflectionReview.proposedAction.trim())) ||
                              (reflectionReview.mode === "annotated" &&
                                !reflectionReview.annotation.trim())
                            }
                            onClick={() =>
                              void saveReflectionReview(job, "draft")
                            }
                          >
                            Save review
                          </button>
                          <button
                            className="secondary-button"
                            type="button"
                            onClick={() => setReflectionReview(null)}
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : null}
                    <details className="mirror-revision-history">
                      <summary>
                        Revision history ({job.resultRevisionCount})
                      </summary>
                      {job.resultRevisionHistory.length === 0 ? (
                        <p>
                          Legacy result: history begins with the first user
                          review.
                        </p>
                      ) : (
                        <ol>
                          {job.resultRevisionHistory.map((revision) => (
                            <li key={revision.id}>
                              <details>
                                <summary>
                                  <b>{revision.action}</b> ·{" "}
                                  {revision.disposition} ·{" "}
                                  <time>
                                    {formatTimestamp(revision.createdAt)}
                                  </time>
                                </summary>
                                <dl>
                                  <div>
                                    <dt>Reflection text</dt>
                                    <dd>{revision.text}</dd>
                                  </div>
                                  <div>
                                    <dt>Proposed question</dt>
                                    <dd>
                                      {revision.proposedQuestion ??
                                        "Not present in this legacy revision"}
                                    </dd>
                                  </div>
                                  <div>
                                    <dt>Proposed action</dt>
                                    <dd>
                                      {revision.proposedAction ??
                                        "Not present in this legacy revision"}
                                    </dd>
                                  </div>
                                  <div>
                                    <dt>Annotation</dt>
                                    <dd>
                                      {revision.annotation ?? "No annotation"}
                                    </dd>
                                  </div>
                                </dl>
                              </details>
                            </li>
                          ))}
                        </ol>
                      )}
                    </details>
                    <div className="mirror-citations">
                      <strong>Citations</strong>
                      {job.resultCitations.map((citation) => (
                        <article key={`${job.id}:${citation.recordId}`}>
                          <span>{citation.title}</span>
                          <RecordLinks recordIds={[citation.recordId]} />
                          <p>{citation.excerpt}</p>
                        </article>
                      ))}
                    </div>
                    <div className="mirror-delete-controls">
                      {deleteConfirmationId === job.id ? (
                        <p className="platform-message warning">
                          This first verifies deletion from the PX13 job store.
                          If PX13 cannot confirm, all local data is preserved.
                        </p>
                      ) : null}
                      <button
                        className="secondary-button danger-button"
                        type="button"
                        disabled={busy === `delete:${job.id}`}
                        onClick={() => void deleteReflection(job)}
                      >
                        {busy === `delete:${job.id}`
                          ? "Verifying deletion…"
                          : deleteConfirmationId === job.id
                            ? "Confirm verified deletion"
                            : "Delete generated reflection"}
                      </button>
                      {deleteConfirmationId === job.id ? (
                        <button
                          className="text-button"
                          type="button"
                          onClick={() => setDeleteConfirmationId(null)}
                        >
                          Cancel deletion
                        </button>
                      ) : null}
                    </div>
                  </section>
                ) : null}
                {job.resultText && !hasDisplayableCitations(job) ? (
                  <p className="platform-message warning" role="status">
                    A result arrived without a valid citation to the requested
                    source set, so Mirror is holding it from display.
                  </p>
                ) : null}
                {!job.resultId ? (
                  <div className="mirror-delete-controls">
                    {deleteConfirmationId === job.id ? (
                      <p className="platform-message warning">
                        Canceling first verifies deletion from the PX13 job
                        store when submitted. If PX13 cannot confirm, the local
                        prompt and source snapshots remain preserved.
                      </p>
                    ) : null}
                    <button
                      className="secondary-button danger-button"
                      type="button"
                      disabled={busy === `delete:${job.id}`}
                      onClick={() => void deletePendingRequest(job)}
                    >
                      {busy === `delete:${job.id}`
                        ? "Verifying cancellation…"
                        : deleteConfirmationId === job.id
                          ? "Confirm verified cancellation"
                          : "Cancel and delete request"}
                    </button>
                    {deleteConfirmationId === job.id ? (
                      <button
                        className="text-button"
                        type="button"
                        onClick={() => setDeleteConfirmationId(null)}
                      >
                        Keep request
                      </button>
                    ) : null}
                  </div>
                ) : null}
                {job.status === "retry_wait" || job.status === "failed" ? (
                  <button
                    className="secondary-button"
                    type="button"
                    disabled={busy === `retry:${job.id}`}
                    onClick={() => void retry(job.id)}
                  >
                    {busy === `retry:${job.id}`
                      ? "Returning to queue…"
                      : "Retry safely"}
                  </button>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>

      <section
        className="panel-card mirror-deleted-items"
        aria-labelledby="mirror-deleted-items-title"
      >
        <div className="card-heading">
          <div>
            <p className="eyebrow">User-controlled lifecycle</p>
            <h2 id="mirror-deleted-items-title">Deleted Mirror items</h2>
          </div>
          <span className="counter">{deletedItemCount}</span>
        </div>
        <p>
          Tombstones remain in local export and can be restored. Permanent purge
          is separate, requires the exact typed phrase shown, and removes
          provenance relations so source records can later be deleted. A
          submitted PX13 artifact is never purged locally unless authenticated
          remote deletion or exact absence is verified again.
        </p>
        {deletedItemCount === 0 ? (
          <div className="platform-empty">
            <strong>No deleted Mirror items.</strong>
            <p>
              Deleted requests, reflections, and insight reviews appear here.
            </p>
          </div>
        ) : (
          <div className="mirror-deleted-list">
            {deletedRequests.map((request) => {
              const result = deletedResultByRequest.get(request.id);
              const itemId = result?.id ?? request.id;
              const key = result
                ? `reflection:${result.id}`
                : `request:${request.id}`;
              const phrase = purgePhrase(itemId);
              return (
                <article className="mirror-deleted-item" key={request.id}>
                  <div className="layer-heading">
                    <span>
                      {result
                        ? "Generated reflection pair"
                        : "Result-less request"}
                    </span>
                    <b>
                      Deleted{" "}
                      {formatTimestamp(request.deletedAt ?? request.updatedAt)}
                    </b>
                  </div>
                  <h3>{request.prompt}</h3>
                  <p className="fine-print">
                    Request {request.id}
                    {request.remoteJobId
                      ? ` · PX13 job ${request.remoteJobId}`
                      : request.attempts > 0
                        ? " · submission outcome requires request-ID verification"
                        : " · never submitted to PX13"}
                  </p>
                  <details>
                    <summary>
                      Exact source snapshots ({request.sourceSnapshots.length})
                    </summary>
                    <div className="mirror-deleted-snapshots">
                      {request.sourceSnapshots.map((snapshot) => (
                        <article key={snapshot.recordId}>
                          <b>{snapshot.title}</b>
                          <small>
                            {snapshot.kind.replaceAll("_", " ")} ·{" "}
                            {snapshot.recordId} · source updated{" "}
                            {formatTimestamp(snapshot.recordUpdatedAt)}
                          </small>
                          <p>{snapshot.excerpt}</p>
                        </article>
                      ))}
                    </div>
                  </details>
                  {result ? (
                    <details>
                      <summary>
                        Generated result and complete revision history (
                        {result.revisionHistory.length})
                      </summary>
                      <div className="mirror-deleted-result">
                        <p>{result.text}</p>
                        <p>
                          <b>Question:</b>{" "}
                          {result.proposedQuestion ?? "Legacy none"}
                        </p>
                        <p>
                          <b>Action:</b>{" "}
                          {result.proposedAction ?? "Legacy none"}
                        </p>
                        <p>
                          <b>Provider:</b>{" "}
                          {result.providerType.replaceAll("_", " ")} ·{" "}
                          {result.provider} · {result.model}
                        </p>
                        <strong>Citations</strong>
                        {result.citations.map((citation) => (
                          <p key={`${result.id}:${citation.recordId}`}>
                            {citation.title} · {citation.recordId}:{" "}
                            {citation.excerpt}
                          </p>
                        ))}
                        <ol>
                          {result.revisionHistory.map((revision) => (
                            <li key={revision.id}>
                              {revision.action} · {revision.disposition} ·{" "}
                              {formatTimestamp(revision.createdAt)}
                            </li>
                          ))}
                        </ol>
                      </div>
                    </details>
                  ) : null}
                  <div className="platform-action-row">
                    <button
                      className="secondary-button"
                      type="button"
                      disabled={busy === `restore:${request.id}`}
                      onClick={() =>
                        result
                          ? void restoreDeletedReflection(request, result)
                          : void restoreDeletedRequest(request)
                      }
                    >
                      {busy === `restore:${request.id}`
                        ? "Restoring…"
                        : result
                          ? "Restore request + reflection"
                          : "Restore to local queue"}
                    </button>
                  </div>
                  <div className="mirror-purge-control">
                    <label className="platform-field">
                      <span>
                        Type <code>{phrase}</code> to permanently purge
                      </span>
                      <input
                        aria-label={`Permanent purge confirmation for ${itemId}`}
                        autoComplete="off"
                        spellCheck={false}
                        value={purgeConfirmations[key] ?? ""}
                        onChange={(event) =>
                          setPurgeConfirmations((current) => ({
                            ...current,
                            [key]: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <button
                      className="danger-button"
                      type="button"
                      disabled={
                        busy === `purge:${itemId}` ||
                        purgeConfirmations[key] !== phrase
                      }
                      onClick={() =>
                        result
                          ? void purgeDeletedReflection(request, result)
                          : void purgeDeletedRequest(request)
                      }
                    >
                      {busy === `purge:${itemId}`
                        ? "Verifying and purging…"
                        : "Permanently purge"}
                    </button>
                  </div>
                </article>
              );
            })}
            {deletedInsightFeedback.map((feedback) => {
              const key = `insight:${feedback.id}`;
              const phrase = purgePhrase(feedback.id);
              return (
                <article className="mirror-deleted-item" key={feedback.id}>
                  <div className="layer-heading">
                    <span>Deterministic insight review</span>
                    <b>
                      Deleted{" "}
                      {formatTimestamp(
                        feedback.deletedAt ?? feedback.updatedAt,
                      )}
                    </b>
                  </div>
                  <h3>{feedback.label}</h3>
                  <p>
                    {feedback.kind.replaceAll("_", " ")} ·{" "}
                    {feedback.disposition}
                  </p>
                  {feedback.correction ? (
                    <p>
                      <b>Correction:</b> {feedback.correction}
                    </p>
                  ) : null}
                  {feedback.annotation ? (
                    <p>
                      <b>Annotation:</b> {feedback.annotation}
                    </p>
                  ) : null}
                  <RecordLinks recordIds={feedback.sourceRecordIds} />
                  <details>
                    <summary>
                      Review history ({feedback.revisionHistory.length})
                    </summary>
                    <ol>
                      {feedback.revisionHistory.map((revision) => (
                        <li key={revision.id}>
                          {revision.action} · {revision.disposition} ·{" "}
                          {formatTimestamp(revision.createdAt)} · sources{" "}
                          {revision.sourceRecordIds.join(", ")}
                        </li>
                      ))}
                    </ol>
                  </details>
                  <div className="platform-action-row">
                    <button
                      className="secondary-button"
                      type="button"
                      disabled={busy === `restore:${feedback.id}`}
                      onClick={() => void restoreDeletedInsight(feedback)}
                    >
                      {busy === `restore:${feedback.id}`
                        ? "Restoring…"
                        : "Restore insight review"}
                    </button>
                  </div>
                  <div className="mirror-purge-control">
                    <label className="platform-field">
                      <span>
                        Type <code>{phrase}</code> to permanently purge
                      </span>
                      <input
                        aria-label={`Permanent purge confirmation for ${feedback.id}`}
                        autoComplete="off"
                        spellCheck={false}
                        value={purgeConfirmations[key] ?? ""}
                        onChange={(event) =>
                          setPurgeConfirmations((current) => ({
                            ...current,
                            [key]: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <button
                      className="danger-button"
                      type="button"
                      disabled={
                        busy === `purge:${feedback.id}` ||
                        purgeConfirmations[key] !== phrase
                      }
                      onClick={() => void purgeDeletedInsight(feedback)}
                    >
                      {busy === `purge:${feedback.id}`
                        ? "Purging…"
                        : "Permanently purge review"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="panel-card mirror-notifications">
        <p className="eyebrow">Return later</p>
        <h2>Result notifications</h2>
        {mirror.notificationPermission === "granted" ? (
          <p>
            Notifications are enabled. Every result also remains in the local
            ledger above.
          </p>
        ) : mirror.notificationPermission === "unsupported" ? (
          <p>
            This browser does not expose notifications. Results remain available
            here after synchronization.
          </p>
        ) : mirror.notificationPermission === "denied" ? (
          <p>
            Notifications are blocked by the browser. This does not affect
            queueing, generation, or later retrieval.
          </p>
        ) : (
          <>
            <p>
              Opt in to a device notification when a queued PX13 result
              synchronizes.
            </p>
            <button
              className="secondary-button"
              type="button"
              disabled={busy === "notifications"}
              onClick={() => void requestNotifications()}
            >
              {busy === "notifications"
                ? "Requesting…"
                : "Enable result notifications"}
            </button>
          </>
        )}
      </section>

      {dictating ? (
        <div className="modal-backdrop" role="presentation">
          <section
            className="capture-sheet"
            role="dialog"
            aria-modal="true"
            aria-labelledby="mirror-dictation-title"
          >
            <div className="sheet-handle" />
            <p className="eyebrow">Request dictation · local first</p>
            <h2 id="mirror-dictation-title">Dictate Mirror prompt</h2>
            <VoiceRecorderPanel
              persistence={capturePersistence}
              mode="field"
              initialDestination="codex"
              fieldTargetId="mirror-request-prompt"
              localTranscriptionAvailable={
                runtime.localTranscriptionStatus === "ready"
              }
              onAccept={acceptDictation}
              onClose={() => setDictating(false)}
            />
          </section>
        </div>
      ) : null}
    </>
  );
}
