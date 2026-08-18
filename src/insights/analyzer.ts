import type { CodexRecord, RecordKind } from "../domain";

export interface LocalInsightFilters {
  query?: string;
  fromDate?: string;
  toDate?: string;
  kinds?: readonly RecordKind[];
  tags?: readonly string[];
  themes?: readonly string[];
  symbols?: readonly string[];
  people?: readonly string[];
  practices?: readonly string[];
  sourceTracks?: readonly string[];
}

export interface CountedEvidence {
  value: string;
  count: number;
  recordIds: string[];
}

export interface LocalTimeSeriesPoint {
  date: string;
  recordIds: string[];
  recordCount: number;
  observationWordCount: number;
  interpretationWordCount: number;
}

export interface StructuredTrendPoint {
  date: string;
  values: CountedEvidence[];
}

export interface StructuredTrendViews {
  state: StructuredTrendPoint[];
  sleep: StructuredTrendPoint[];
  practice: StructuredTrendPoint[];
  outcome: StructuredTrendPoint[];
}

export interface IntentionActionOutcomeComparison {
  recordId: string;
  title: string;
  intention: string | null;
  action: string | null;
  outcome: string | null;
  sharedIntentionActionTerms: string[];
  sharedActionOutcomeTerms: string[];
  sharedIntentionOutcomeTerms: string[];
}

export interface LinkMetrics {
  backlinkCount: number;
  sourceLinkCount: number;
  recordsWithBacklinks: number;
  recordsWithSourceLinks: number;
  unresolvedBacklinkCount: number;
  selfBacklinkCount: number;
  backlinksByRelationship: CountedEvidence[];
  sourceLinksByType: CountedEvidence[];
}

export interface LocalMirrorAnalysis {
  mode: "deterministic-local";
  matchedRecordIds: string[];
  recordCount: number;
  observationWordCount: number;
  interpretationWordCount: number;
  totalWordCount: number;
  uniqueWordCount: number;
  topWords: CountedEvidence[];
  recurringTerms: CountedEvidence[];
  tags: CountedEvidence[];
  themes: CountedEvidence[];
  symbols: CountedEvidence[];
  recurringSymbols: CountedEvidence[];
  people: CountedEvidence[];
  dateReferences: CountedEvidence[];
  practices: CountedEvidence[];
  sourceTracks: CountedEvidence[];
  repeatedTriggers: CountedEvidence[];
  repeatedActions: CountedEvidence[];
  timeSeries: LocalTimeSeriesPoint[];
  trends: StructuredTrendViews;
  intentionActionOutcomes: IntentionActionOutcomeComparison[];
  links: LinkMetrics;
}

type MutableCount = { count: number; recordIds: Set<string> };
type CountMap = Map<string, MutableCount>;

const WORD_PATTERN = /[\p{L}\p{N}]+(?:['’][\p{L}\p{N}]+)*/gu;
const ISO_DATE_PATTERN = /\b\d{4}-\d{2}-\d{2}\b/g;

// This list is intentionally static. "Top words" are a transparent frequency
// count rather than a language-model classification.
const COMMON_WORDS = new Set([
  "a",
  "about",
  "after",
  "all",
  "also",
  "am",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "because",
  "been",
  "before",
  "but",
  "by",
  "can",
  "did",
  "do",
  "for",
  "from",
  "had",
  "has",
  "have",
  "he",
  "her",
  "here",
  "him",
  "his",
  "how",
  "i",
  "if",
  "in",
  "into",
  "is",
  "it",
  "its",
  "just",
  "me",
  "more",
  "my",
  "not",
  "of",
  "on",
  "or",
  "our",
  "she",
  "so",
  "that",
  "the",
  "their",
  "them",
  "then",
  "there",
  "they",
  "this",
  "to",
  "up",
  "was",
  "we",
  "were",
  "what",
  "when",
  "which",
  "with",
  "would",
  "you",
  "your",
]);

function normalize(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().trim();
}

function tokenize(value: string): string[] {
  return [...value.matchAll(WORD_PATTERN)].map((match) =>
    normalize(match[0].replaceAll("’", "'")),
  );
}

function wordTokens(value: string): string[] {
  return tokenize(value).filter((token) => /\p{L}/u.test(token));
}

function recordLayerText(record: CodexRecord): {
  observation: string;
  interpretation: string;
} {
  return {
    observation: record.observation?.text ?? "",
    interpretation: record.interpretation?.text ?? "",
  };
}

function searchableText(record: CodexRecord): string {
  let fields = "";
  try {
    fields = JSON.stringify(record.fields);
  } catch {
    // A malformed cyclic value cannot pass the persisted schema, but keeping
    // this analyzer total makes it safe for imported/in-memory callers.
  }
  return normalize(
    [
      record.title,
      record.kind,
      record.tags.join(" "),
      record.observation?.text ?? "",
      record.interpretation?.text ?? "",
      record.sourceLinks.map((source) => source.label).join(" "),
      fields,
    ].join("\n"),
  );
}

function validCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (month < 1 || month > 12 || day < 1) return false;
  return day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function filterDate(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const candidate = value.slice(0, 10);
  return validCalendarDate(candidate) ? candidate : undefined;
}

export function filterLocalInsightRecords(
  records: readonly CodexRecord[],
  filters: LocalInsightFilters = {},
): CodexRecord[] {
  const terms = tokenize(filters.query ?? "");
  const fromDate = filterDate(filters.fromDate);
  const toDate = filterDate(filters.toDate);
  const kinds = new Set(filters.kinds ?? []);
  const requiredTags = filters.tags ?? [];
  const requiredThemes = filters.themes ?? [];
  const requiredSymbols = filters.symbols ?? [];
  const requiredPeople = filters.people ?? [];
  const requiredPractices = filters.practices ?? [];
  const requiredSourceTracks = filters.sourceTracks ?? [];

  return records
    .filter((record) => record.deletedAt === null)
    .filter((record) => kinds.size === 0 || kinds.has(record.kind))
    .filter(
      (record) =>
        includesAll(record.tags, requiredTags) &&
        includesAll(recordThemes(record), requiredThemes) &&
        includesAll(recordSymbols(record), requiredSymbols) &&
        includesAll(recordPeople(record), requiredPeople) &&
        includesAll(recordPractices(record), requiredPractices) &&
        includesAll(recordSourceTracks(record), requiredSourceTracks),
    )
    .filter((record) => {
      const createdDate = record.createdAt.slice(0, 10);
      return (
        (!fromDate || createdDate >= fromDate) &&
        (!toDate || createdDate <= toDate)
      );
    })
    .filter((record) => {
      if (terms.length === 0) return true;
      const haystack = searchableText(record);
      return terms.every((term) => haystack.includes(term));
    })
    .sort(
      (left, right) =>
        right.createdAt.localeCompare(left.createdAt) ||
        left.id.localeCompare(right.id),
    );
}

function addCount(
  counts: CountMap,
  value: string,
  recordId: string,
  occurrenceCount = 1,
): void {
  const normalized = normalize(value);
  if (!normalized) return;
  const current = counts.get(normalized) ?? {
    count: 0,
    recordIds: new Set<string>(),
  };
  current.count += occurrenceCount;
  current.recordIds.add(recordId);
  counts.set(normalized, current);
}

function addUniquePerRecord(
  counts: CountMap,
  values: Iterable<string>,
  recordId: string,
): void {
  const unique = new Set([...values].map(normalize).filter(Boolean));
  for (const value of unique) addCount(counts, value, recordId);
}

function sortedCounts(counts: CountMap): CountedEvidence[] {
  return [...counts.entries()]
    .map(([value, item]) => ({
      value,
      count: item.count,
      recordIds: [...item.recordIds].sort(),
    }))
    .sort(
      (left, right) =>
        right.count - left.count || left.value.localeCompare(right.value),
    );
}

function stringFieldValues(
  record: CodexRecord,
  names: readonly string[],
): string[] {
  return names.flatMap((name) => {
    const value = record.fields[name];
    if (typeof value === "string") return value.trim() ? [value.trim()] : [];
    if (Array.isArray(value)) {
      return value.flatMap((item) =>
        typeof item === "string" && item.trim() ? [item.trim()] : [],
      );
    }
    return [];
  });
}

function prefixedTags(record: CodexRecord, prefix: string): string[] {
  const normalizedPrefix = `${normalize(prefix)}:`;
  return record.tags.flatMap((tag) => {
    const normalizedTag = normalize(tag);
    return normalizedTag.startsWith(normalizedPrefix)
      ? [normalizedTag.slice(normalizedPrefix.length).trim()]
      : [];
  });
}

function includesAll(
  candidateValues: readonly string[],
  requiredValues: readonly string[],
): boolean {
  const candidates = new Set(candidateValues.map(normalize));
  return requiredValues.every((value) => candidates.has(normalize(value)));
}

function recordThemes(record: CodexRecord): string[] {
  return [
    ...prefixedTags(record, "theme"),
    ...stringFieldValues(record, ["theme", "themes"]),
  ];
}

function recordSymbols(record: CodexRecord): string[] {
  return [
    ...prefixedTags(record, "symbol"),
    ...stringFieldValues(record, ["symbol", "symbols"]),
  ];
}

function recordPeople(record: CodexRecord): string[] {
  return [
    ...prefixedTags(record, "person"),
    ...stringFieldValues(record, ["person", "people", "persons"]),
    ...record.sourceLinks
      .filter((source) => source.sourceType === "person")
      .map((source) => source.label),
  ];
}

function recordPractices(record: CodexRecord): string[] {
  return [
    ...prefixedTags(record, "practice"),
    ...stringFieldValues(record, [
      "practice",
      "practices",
      "practiceId",
      "practiceName",
    ]),
  ];
}

function recordSourceTracks(record: CodexRecord): string[] {
  return [
    ...prefixedTags(record, "source-track"),
    ...prefixedTags(record, "source_track"),
    ...stringFieldValues(record, [
      "sourceTrack",
      "sourceTracks",
      "sourceTrackId",
      "source_track",
    ]),
  ];
}

function recordTriggers(record: CodexRecord): string[] {
  return stringFieldValues(record, ["trigger", "triggers"]);
}

function recordActions(record: CodexRecord): string[] {
  return stringFieldValues(record, ["action", "actions"]);
}

function recordStates(record: CodexRecord): string[] {
  return stringFieldValues(record, [
    "state",
    "states",
    "emotion",
    "emotionalState",
  ]);
}

function recordSleepValues(record: CodexRecord): string[] {
  const strings = stringFieldValues(record, [
    "sleep",
    "sleepHours",
    "sleepQuality",
  ]);
  const numeric = ["sleep", "sleepHours", "sleepQuality"].flatMap((name) => {
    const value = record.fields[name];
    return typeof value === "number" && Number.isFinite(value)
      ? [String(value)]
      : [];
  });
  return [...strings, ...numeric];
}

function recordOutcomes(record: CodexRecord): string[] {
  return stringFieldValues(record, ["outcome", "outcomes"]);
}

function extractDateReferences(record: CodexRecord): string[] {
  const text = `${record.observation?.text ?? ""}\n${
    record.interpretation?.text ?? ""
  }`;
  const literalDates = [...text.matchAll(ISO_DATE_PATTERN)].map(
    (match) => match[0],
  );
  const structuredDates = stringFieldValues(record, [
    "date",
    "dates",
    "eventDate",
    "eventDates",
  ]).flatMap((value) => value.match(ISO_DATE_PATTERN) ?? []);
  return [...literalDates, ...structuredDates].filter(validCalendarDate);
}

function lexicalOverlap(left: string | null, right: string | null): string[] {
  if (!left || !right) return [];
  const leftTerms = new Set(
    wordTokens(left).filter((word) => !COMMON_WORDS.has(word)),
  );
  return [
    ...new Set(
      wordTokens(right).filter(
        (word) => !COMMON_WORDS.has(word) && leftTerms.has(word),
      ),
    ),
  ].sort();
}

function optionalField(record: CodexRecord, name: string): string | null {
  const value = record.fields[name];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

type TrendMap = Map<string, CountMap>;

function addTrendValues(
  trend: TrendMap,
  date: string,
  values: readonly string[],
  recordId: string,
): void {
  if (values.length === 0) return;
  const counts = trend.get(date) ?? new Map<string, MutableCount>();
  addUniquePerRecord(counts, values, recordId);
  trend.set(date, counts);
}

function sortedTrend(trend: TrendMap): StructuredTrendPoint[] {
  return [...trend.entries()]
    .map(([date, counts]) => ({ date, values: sortedCounts(counts) }))
    .sort((left, right) => left.date.localeCompare(right.date));
}

export function analyzeLocalMirror(
  records: readonly CodexRecord[],
  filters: LocalInsightFilters = {},
): LocalMirrorAnalysis {
  const activeRecords = records.filter((record) => record.deletedAt === null);
  const allRecordIds = new Set(activeRecords.map((record) => record.id));
  const filtered = filterLocalInsightRecords(activeRecords, filters);
  const words: CountMap = new Map();
  const tags: CountMap = new Map();
  const themes: CountMap = new Map();
  const symbols: CountMap = new Map();
  const people: CountMap = new Map();
  const dateReferences: CountMap = new Map();
  const practices: CountMap = new Map();
  const sourceTracks: CountMap = new Map();
  const triggers: CountMap = new Map();
  const actions: CountMap = new Map();
  const backlinkRelationships: CountMap = new Map();
  const sourceLinkTypes: CountMap = new Map();
  const timeSeries = new Map<string, LocalTimeSeriesPoint>();
  const stateTrend: TrendMap = new Map();
  const sleepTrend: TrendMap = new Map();
  const practiceTrend: TrendMap = new Map();
  const outcomeTrend: TrendMap = new Map();
  const intentionActionOutcomes: IntentionActionOutcomeComparison[] = [];
  let observationWordCount = 0;
  let interpretationWordCount = 0;
  let backlinkCount = 0;
  let sourceLinkCount = 0;
  let recordsWithBacklinks = 0;
  let recordsWithSourceLinks = 0;
  let unresolvedBacklinkCount = 0;
  let selfBacklinkCount = 0;

  for (const record of filtered) {
    const layers = recordLayerText(record);
    const observationWords = wordTokens(layers.observation);
    const interpretationWords = wordTokens(layers.interpretation);
    observationWordCount += observationWords.length;
    interpretationWordCount += interpretationWords.length;
    for (const word of [...observationWords, ...interpretationWords]) {
      addCount(words, word, record.id);
    }

    addUniquePerRecord(tags, record.tags, record.id);
    addUniquePerRecord(themes, recordThemes(record), record.id);
    addUniquePerRecord(symbols, recordSymbols(record), record.id);
    addUniquePerRecord(people, recordPeople(record), record.id);
    addUniquePerRecord(
      dateReferences,
      extractDateReferences(record),
      record.id,
    );
    addUniquePerRecord(practices, recordPractices(record), record.id);
    addUniquePerRecord(sourceTracks, recordSourceTracks(record), record.id);
    addUniquePerRecord(triggers, recordTriggers(record), record.id);
    addUniquePerRecord(actions, recordActions(record), record.id);

    const date = record.createdAt.slice(0, 10);
    const currentTimePoint = timeSeries.get(date) ?? {
      date,
      recordIds: [],
      recordCount: 0,
      observationWordCount: 0,
      interpretationWordCount: 0,
    };
    currentTimePoint.recordCount += 1;
    currentTimePoint.recordIds.push(record.id);
    currentTimePoint.observationWordCount += observationWords.length;
    currentTimePoint.interpretationWordCount += interpretationWords.length;
    timeSeries.set(date, currentTimePoint);
    addTrendValues(stateTrend, date, recordStates(record), record.id);
    addTrendValues(sleepTrend, date, recordSleepValues(record), record.id);
    addTrendValues(practiceTrend, date, recordPractices(record), record.id);
    addTrendValues(outcomeTrend, date, recordOutcomes(record), record.id);

    backlinkCount += record.backlinks.length;
    sourceLinkCount += record.sourceLinks.length;
    if (record.backlinks.length > 0) recordsWithBacklinks += 1;
    if (record.sourceLinks.length > 0) recordsWithSourceLinks += 1;
    for (const backlink of record.backlinks) {
      addCount(backlinkRelationships, backlink.relationship, record.id);
      if (!allRecordIds.has(backlink.recordId)) unresolvedBacklinkCount += 1;
      if (backlink.recordId === record.id) selfBacklinkCount += 1;
    }
    for (const source of record.sourceLinks) {
      addCount(sourceLinkTypes, source.sourceType, record.id);
    }

    const intention = optionalField(record, "intention");
    const action = optionalField(record, "action");
    const outcome = optionalField(record, "outcome");
    if (intention || action || outcome) {
      intentionActionOutcomes.push({
        recordId: record.id,
        title: record.title,
        intention,
        action,
        outcome,
        sharedIntentionActionTerms: lexicalOverlap(intention, action),
        sharedActionOutcomeTerms: lexicalOverlap(action, outcome),
        sharedIntentionOutcomeTerms: lexicalOverlap(intention, outcome),
      });
    }
  }

  const countedWords = sortedCounts(words);
  const countedSymbols = sortedCounts(symbols);
  return {
    mode: "deterministic-local",
    matchedRecordIds: filtered.map((record) => record.id),
    recordCount: filtered.length,
    observationWordCount,
    interpretationWordCount,
    totalWordCount: observationWordCount + interpretationWordCount,
    uniqueWordCount: countedWords.length,
    topWords: countedWords
      .filter((item) => !COMMON_WORDS.has(item.value))
      .slice(0, 12),
    recurringTerms: countedWords.filter(
      (item) => !COMMON_WORDS.has(item.value) && item.count >= 2,
    ),
    tags: sortedCounts(tags),
    themes: sortedCounts(themes),
    symbols: countedSymbols,
    recurringSymbols: countedSymbols.filter((item) => item.count >= 2),
    people: sortedCounts(people),
    dateReferences: sortedCounts(dateReferences),
    practices: sortedCounts(practices),
    sourceTracks: sortedCounts(sourceTracks),
    repeatedTriggers: sortedCounts(triggers).filter((item) => item.count >= 2),
    repeatedActions: sortedCounts(actions).filter((item) => item.count >= 2),
    timeSeries: [...timeSeries.values()].sort((left, right) =>
      left.date.localeCompare(right.date),
    ),
    trends: {
      state: sortedTrend(stateTrend),
      sleep: sortedTrend(sleepTrend),
      practice: sortedTrend(practiceTrend),
      outcome: sortedTrend(outcomeTrend),
    },
    intentionActionOutcomes,
    links: {
      backlinkCount,
      sourceLinkCount,
      recordsWithBacklinks,
      recordsWithSourceLinks,
      unresolvedBacklinkCount,
      selfBacklinkCount,
      backlinksByRelationship: sortedCounts(backlinkRelationships),
      sourceLinksByType: sortedCounts(sourceLinkTypes),
    },
  };
}
