import { z } from "zod";

export const CURRENT_DOMAIN_VERSION = 1 as const;
export const CURRENT_EXPORT_VERSION = 2 as const;

export const EntityIdSchema = z.string().trim().min(1).max(240);
export const IsoDateTimeSchema = z.string().datetime({ offset: true });
export const TagSchema = z.string().trim().min(1).max(80);

export const EvidenceClassSchema = z.enum([
  "self_reported",
  "observed",
  "measured",
  "blinded",
  "sourced",
  "derived",
]);

export const ProvenanceSchema = z.object({
  actor: z.enum(["user", "system", "provider"]),
  method: z.string().trim().min(1),
  provider: z.string().trim().min(1).nullable().default(null),
  model: z.string().trim().min(1).nullable().default(null),
});

export const SourceLinkSchema = z.object({
  id: EntityIdSchema,
  label: z.string().trim().min(1),
  sourceType: z.enum([
    "url",
    "book",
    "course",
    "person",
    "qctp_record",
    "other",
  ]),
  url: z.string().url().nullable().default(null),
  citation: z.string().trim().nullable().default(null),
  accessedAt: IsoDateTimeSchema.nullable().default(null),
});

export const EvidenceLayerSchema = z.object({
  id: EntityIdSchema,
  text: z.string(),
  capturedAt: IsoDateTimeSchema,
  evidenceClass: EvidenceClassSchema,
  provenance: ProvenanceSchema,
  sourceIds: z.array(EntityIdSchema).default([]),
});

export const InterpretationLayerSchema = z.object({
  id: EntityIdSchema,
  text: z.string(),
  authoredAt: IsoDateTimeSchema,
  provenance: ProvenanceSchema,
  basedOnEvidenceIds: z.array(EntityIdSchema).min(1),
});

export const BacklinkSchema = z.object({
  recordId: EntityIdSchema,
  relationship: z.string().trim().min(1).max(120),
});

export const RevisionSchema = z.object({
  schemaVersion: z.literal(CURRENT_DOMAIN_VERSION),
  id: EntityIdSchema,
  entityId: EntityIdSchema,
  entityType: z.enum([
    "record",
    "transcript",
    "derived_note",
    "reg_session",
    "path",
    "foundation",
    "workbook",
    "settings",
  ]),
  createdAt: IsoDateTimeSchema,
  provenance: ProvenanceSchema,
  changes: z.record(z.string(), z.unknown()),
});

export const AttachmentKindSchema = z.enum([
  "audio",
  "image",
  "document",
  "drawing",
  "other",
]);

export const AttachmentSchema = z.object({
  schemaVersion: z.literal(CURRENT_DOMAIN_VERSION),
  id: EntityIdSchema,
  parentId: EntityIdSchema,
  kind: AttachmentKindSchema,
  filename: z.string().trim().min(1),
  mimeType: z.string().trim().min(1),
  sizeBytes: z.number().int().nonnegative(),
  localBlobRef: EntityIdSchema,
  remoteObjectRef: z.string().trim().min(1).nullable().default(null),
  checksumSha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/i)
    .nullable()
    .default(null),
  createdAt: IsoDateTimeSchema,
  deletedAt: IsoDateTimeSchema.nullable().default(null),
});

export const RecordKindSchema = z.enum([
  "geometry",
  "voice_note",
  "auto_dictation",
  "dream",
  "obe",
  "remote_viewing",
  "psionics",
  "synchronicity",
  "intuition",
  "mirror",
  "source_note",
  "lab_protocol",
  "lab_result",
  "integration",
]);

export const CodexRecordSchema = z.object({
  schemaVersion: z.literal(CURRENT_DOMAIN_VERSION),
  id: EntityIdSchema,
  kind: RecordKindSchema,
  title: z.string().trim().min(1),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
  observation: EvidenceLayerSchema.nullable().default(null),
  interpretation: InterpretationLayerSchema.nullable().default(null),
  tags: z.array(TagSchema).default([]),
  backlinks: z.array(BacklinkSchema).default([]),
  sourceLinks: z.array(SourceLinkSchema).default([]),
  attachmentIds: z.array(EntityIdSchema).default([]),
  revisionIds: z.array(EntityIdSchema).default([]),
  pathId: EntityIdSchema.nullable().default(null),
  sessionId: EntityIdSchema.nullable().default(null),
  fields: z.record(z.string(), z.unknown()).default({}),
  deletedAt: IsoDateTimeSchema.nullable().default(null),
});

export const DayCompletionSchema = z.object({
  morning: z.boolean().default(false),
  midday: z.boolean().default(false),
  evening: z.boolean().default(false),
});

export const FoundationStateSchema = z.object({
  schemaVersion: z.literal(CURRENT_DOMAIN_VERSION),
  id: z.literal("foundation"),
  currentDay: z.number().int().min(1).max(112),
  dayCount: z.literal(112),
  authoredDays: z.tuple([z.literal(1)]),
  completion: z.record(z.string(), DayCompletionSchema),
  updatedAt: IsoDateTimeSchema,
});

export const WorkbookStateSchema = z.object({
  schemaVersion: z.literal(CURRENT_DOMAIN_VERSION),
  id: z.literal("workbook"),
  answers: z.record(z.string(), z.record(z.string(), z.string())),
  updatedAt: IsoDateTimeSchema,
});

export const AppSettingsSchema = z.object({
  schemaVersion: z.literal(CURRENT_DOMAIN_VERSION),
  id: z.literal("settings"),
  guidanceMode: z.enum(["guided", "light", "minimal"]),
  speechRate: z.number().min(0.5).max(2),
  voiceVolume: z.number().min(0).max(1),
  toneVolume: z.number().min(0).max(1),
  speakPhaseTiming: z.boolean(),
  selectedSystemVoice: z.string(),
  keepAwake: z.boolean(),
  testMode: z.boolean(),
  neuralVoice: z.string(),
  neuralEnabled: z.boolean(),
  transcriptionRoute: z.enum(["local_only", "server_openai", "server_custom"]),
  audioRetention: z.enum(["keep", "delete_after_export", "manual"]),
  updatedAt: IsoDateTimeSchema,
});

export const VoiceDestinationSchema = z.enum([
  "unclassified",
  "today_workbook",
  "codex",
  "dream",
  "synchronicity",
  "intuition",
  "obe",
  "remote_viewing",
  "psionics",
  "studio_geometry",
  "mirror",
  "source_note",
  "integration",
  "question",
]);

export const RecordingStatusSchema = z.enum([
  "CAPTURING",
  "PAUSED",
  "LOCAL_ONLY",
  "TRANSCRIPTION_QUEUED",
  "UPLOADING",
  "TRANSCRIBING",
  "TRANSCRIBED",
  "TRANSCRIPTION_FAILED",
  "DELETION_PENDING",
  "DELETED",
]);

export const RecordingSegmentSchema = z.object({
  id: EntityIdSchema,
  sequence: z.number().int().nonnegative(),
  startedAt: IsoDateTimeSchema,
  endedAt: IsoDateTimeSchema,
  durationMs: z.number().int().nonnegative(),
  mimeType: z.string().trim().min(1),
  sizeBytes: z.number().int().nonnegative(),
  chunkIds: z.array(EntityIdSchema),
});

export const VoiceRecordingSchema = z.object({
  schemaVersion: z.literal(CURRENT_DOMAIN_VERSION),
  id: EntityIdSchema,
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
  acceptedAt: IsoDateTimeSchema.nullable().default(null),
  durationMs: z.number().int().nonnegative(),
  mimeType: z.string().trim().min(1),
  sizeBytes: z.number().int().nonnegative(),
  localBlobRef: EntityIdSchema,
  remoteObjectRef: z.string().trim().min(1).nullable().default(null),
  destinationType: VoiceDestinationSchema,
  destinationId: EntityIdSchema.nullable().default(null),
  status: RecordingStatusSchema,
  segments: z.array(RecordingSegmentSchema),
  transcriptionRoute: z.enum(["local_only", "server_openai", "server_custom"]),
  provider: z.string().trim().min(1).nullable().default(null),
  model: z.string().trim().min(1).nullable().default(null),
  checksumSha256: z
    .string()
    .regex(/^[a-f0-9]{64}$/i)
    .nullable()
    .default(null),
  retentionPolicy: z.enum(["keep", "delete_after_export", "manual"]),
  failureCode: z.string().trim().min(1).nullable().default(null),
  failureMessage: z.string().trim().min(1).nullable().default(null),
  deletedAt: IsoDateTimeSchema.nullable().default(null),
});

export const TranscriptTimestampSchema = z.object({
  startMs: z.number().int().nonnegative(),
  endMs: z.number().int().nonnegative(),
  text: z.string(),
});

export const TranscriptCorrectionSchema = z.object({
  id: EntityIdSchema,
  text: z.string(),
  correctedAt: IsoDateTimeSchema,
  provenance: ProvenanceSchema,
});

export const TranscriptSchema = z.object({
  schemaVersion: z.literal(CURRENT_DOMAIN_VERSION),
  id: EntityIdSchema,
  recordingId: EntityIdSchema,
  provider: z.string().trim().min(1),
  model: z.string().trim().min(1),
  language: z.string().trim().min(1),
  originalText: z.string(),
  correctedText: z.string().nullable().default(null),
  corrections: z.array(TranscriptCorrectionSchema).default([]),
  timestamps: z.array(TranscriptTimestampSchema).default([]),
  confidenceMetadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: IsoDateTimeSchema,
  correctedAt: IsoDateTimeSchema.nullable().default(null),
});

export const DerivedNoteSchema = z.object({
  schemaVersion: z.literal(CURRENT_DOMAIN_VERSION),
  id: EntityIdSchema,
  transcriptId: EntityIdSchema,
  title: z.string().trim().min(1),
  cleanText: z.string(),
  suggestedTags: z.array(TagSchema).default([]),
  acceptedTags: z.array(TagSchema).default([]),
  questions: z.array(z.string()).default([]),
  actionItems: z.array(z.string()).default([]),
  provenance: ProvenanceSchema,
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});

export const TranscriptionQueueItemSchema = z.object({
  schemaVersion: z.literal(CURRENT_DOMAIN_VERSION),
  id: EntityIdSchema,
  recordingId: EntityIdSchema,
  status: z.enum(["QUEUED", "PROCESSING", "RETRY_WAIT", "FAILED"]),
  attempts: z.number().int().nonnegative(),
  nextAttemptAt: IsoDateTimeSchema.nullable().default(null),
  lastError: z.string().nullable().default(null),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});

export const PathStateSchema = z.object({
  schemaVersion: z.literal(CURRENT_DOMAIN_VERSION),
  id: EntityIdSchema,
  pathType: z.enum(["foundation", "source", "skill"]),
  title: z.string().trim().min(1),
  currentModule: z.number().int().min(1),
  totalModules: z.number().int().min(1),
  completedModuleIds: z.array(EntityIdSchema),
  releasedModuleIds: z.array(EntityIdSchema),
  active: z.boolean(),
  updatedAt: IsoDateTimeSchema,
});

export const RegStepSchema = z.object({
  id: z.string().regex(/^REG-01-STEP-0[1-9]$/),
  complete: z.boolean(),
  completedAt: IsoDateTimeSchema.nullable().default(null),
});

export const RegSessionSchema = z.object({
  schemaVersion: z.literal(CURRENT_DOMAIN_VERSION),
  id: EntityIdSchema,
  moduleId: z.literal("REG-01-A"),
  status: z.enum(["not_started", "in_progress", "complete"]),
  startedAt: IsoDateTimeSchema.nullable().default(null),
  completedAt: IsoDateTimeSchema.nullable().default(null),
  steps: z.array(RegStepSchema).length(9),
  rawObservation: EvidenceLayerSchema.nullable().default(null),
  interpretation: InterpretationLayerSchema.nullable().default(null),
  autoDictation: EvidenceLayerSchema.nullable().default(null),
  autoDictationRecordingId: EntityIdSchema.nullable().default(null),
  autoDictationDurationMs: z.number().int().nonnegative().default(0),
  integrationAction: z.string(),
  precept: z.object({
    id: z.literal("observe-before-interpreting"),
    text: z.literal("Observe before interpreting."),
    complete: z.boolean(),
    review: z.string(),
  }),
  attachmentIds: z.array(EntityIdSchema),
  resultingRecordIds: z
    .object({
      studio: EntityIdSchema,
      codex: EntityIdSchema,
      mirror: EntityIdSchema,
    })
    .nullable()
    .default(null),
  updatedAt: IsoDateTimeSchema,
});

export const MigrationLedgerEntrySchema = z.object({
  schemaVersion: z.literal(CURRENT_DOMAIN_VERSION),
  id: EntityIdSchema,
  migrationId: z.literal("rev1-localstorage-qctp-state"),
  sourceKey: z.string().min(1),
  sourceSchema: z.string(),
  sourceFingerprint: z.string().regex(/^[a-f0-9]{16}$/),
  sourceSnapshotJson: z.string(),
  appliedAt: IsoDateTimeSchema,
  importedEntityIds: z.array(EntityIdSchema),
  warnings: z.array(z.string()),
});

export const SearchDocumentSchema = z.object({
  recordId: EntityIdSchema,
  kind: RecordKindSchema,
  title: z.string(),
  text: z.string(),
  normalizedText: z.string(),
  tags: z.array(TagSchema),
  updatedAt: IsoDateTimeSchema,
});

export const MirrorJobStatusSchema = z.enum([
  "QUEUED_LOCAL",
  "SUBMITTING",
  "QUEUED_PX13",
  "PROCESSING",
  "RETRY_WAIT",
  "COMPLETE",
  "FAILED",
]);

export const MirrorSourceSnapshotSchema = z.object({
  recordId: EntityIdSchema,
  title: z.string().trim().min(1),
  kind: RecordKindSchema,
  excerpt: z.string(),
  recordUpdatedAt: IsoDateTimeSchema,
});

export const MirrorRequestSchema = z.object({
  schemaVersion: z.literal(CURRENT_DOMAIN_VERSION),
  id: EntityIdSchema,
  prompt: z.string().trim().min(1).max(8_000),
  sourceRecordIds: z.array(EntityIdSchema).min(1).max(24),
  sourceSnapshots: z.array(MirrorSourceSnapshotSchema).min(1).max(24),
  status: MirrorJobStatusSchema,
  remoteJobId: EntityIdSchema.nullable().default(null),
  attempts: z.number().int().nonnegative(),
  nextAttemptAt: IsoDateTimeSchema.nullable().default(null),
  lastError: z.string().nullable().default(null),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
  deletedAt: IsoDateTimeSchema.nullable().default(null),
});

export const MirrorCitationSchema = z.object({
  recordId: EntityIdSchema,
  title: z.string().trim().min(1),
  excerpt: z.string(),
});

export const MirrorProviderTypeSchema = z.enum([
  "deterministic",
  "local_model",
  "cloud_model",
]);

export const MirrorDispositionSchema = z.enum([
  "unreviewed",
  "accepted",
  "revised",
  "rejected",
]);

export const MirrorResultRevisionActionSchema = z.enum([
  "generated",
  "accepted",
  "revised",
  "rejected",
  "annotated",
  "deleted",
  "restored",
]);

export const MirrorResultRevisionSchema = z.object({
  id: EntityIdSchema,
  createdAt: IsoDateTimeSchema,
  action: MirrorResultRevisionActionSchema,
  disposition: MirrorDispositionSchema,
  text: z.string().max(50_000),
  proposedQuestion: z.string().trim().min(1).max(8_000).nullable(),
  proposedAction: z.string().trim().min(1).max(8_000).nullable(),
  annotation: z.string().trim().min(1).max(12_000).nullable(),
});

export const MirrorResultSchema = z.object({
  schemaVersion: z.literal(CURRENT_DOMAIN_VERSION),
  id: EntityIdSchema,
  requestId: EntityIdSchema,
  remoteJobId: EntityIdSchema,
  text: z.string().max(50_000),
  citations: z.array(MirrorCitationSchema),
  providerType: MirrorProviderTypeSchema.default("local_model"),
  provider: z.string().trim().min(1).max(200),
  model: z.string().trim().min(1),
  query: z.string().max(8_000).default(""),
  sourceRecordIds: z.array(EntityIdSchema).max(24).default([]),
  // Null is accepted only so pre-authority local exports can still migrate.
  // New synchronized reflections are held before persistence unless both
  // proposal fields are present exactly once.
  proposedQuestion: z
    .string()
    .trim()
    .min(1)
    .max(8_000)
    .nullable()
    .default(null),
  proposedAction: z.string().trim().min(1).max(8_000).nullable().default(null),
  disposition: MirrorDispositionSchema.default("unreviewed"),
  revisionHistory: z.array(MirrorResultRevisionSchema).default([]),
  annotation: z.string().trim().min(1).max(12_000).nullable().default(null),
  createdAt: IsoDateTimeSchema,
  deletedAt: IsoDateTimeSchema.nullable().default(null),
});

export const MirrorInsightKindSchema = z.enum([
  "term",
  "tag",
  "theme",
  "symbol",
  "person",
  "date",
  "practice",
  "source_track",
  "repeated_trigger",
  "repeated_action",
  "state_trend",
  "sleep_trend",
  "practice_trend",
  "outcome_trend",
  "link_pattern",
]);

export const MirrorInsightDispositionSchema = z.enum([
  "unreviewed",
  "accepted",
  "corrected",
  "dismissed",
]);

export const MirrorInsightReviewActionSchema = z.enum([
  "accepted",
  "corrected",
  "dismissed",
  "annotated",
]);

export const MirrorInsightFeedbackRevisionActionSchema = z.union([
  MirrorInsightReviewActionSchema,
  z.literal("deleted"),
  z.literal("restored"),
]);

export const MirrorInsightFeedbackRevisionSchema = z.object({
  id: EntityIdSchema,
  createdAt: IsoDateTimeSchema,
  action: MirrorInsightFeedbackRevisionActionSchema,
  disposition: MirrorInsightDispositionSchema,
  correction: z.string().trim().min(1).max(8_000).nullable(),
  annotation: z.string().trim().min(1).max(12_000).nullable(),
  sourceRecordIds: z.array(EntityIdSchema).min(1),
});

export const MirrorInsightFeedbackSchema = z.object({
  schemaVersion: z.literal(CURRENT_DOMAIN_VERSION),
  id: EntityIdSchema,
  insightKey: z.string().trim().min(1).max(500),
  kind: MirrorInsightKindSchema,
  label: z.string().trim().min(1).max(500),
  sourceRecordIds: z.array(EntityIdSchema).min(1),
  disposition: MirrorInsightDispositionSchema,
  correction: z.string().trim().min(1).max(8_000).nullable().default(null),
  annotation: z.string().trim().min(1).max(12_000).nullable().default(null),
  revisionHistory: z.array(MirrorInsightFeedbackRevisionSchema).default([]),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
  deletedAt: IsoDateTimeSchema.nullable().default(null),
});

export const QctpExportDataSchema = z.object({
  schema: z.literal("qctp-export-v2"),
  schemaVersion: z.literal(CURRENT_EXPORT_VERSION),
  exportedAt: IsoDateTimeSchema,
  foundation: FoundationStateSchema.nullable(),
  workbook: WorkbookStateSchema.nullable(),
  settings: AppSettingsSchema.nullable(),
  records: z.array(CodexRecordSchema),
  recordings: z.array(VoiceRecordingSchema),
  transcripts: z.array(TranscriptSchema),
  derivedNotes: z.array(DerivedNoteSchema),
  attachments: z.array(AttachmentSchema),
  revisions: z.array(RevisionSchema),
  paths: z.array(PathStateSchema),
  regSessions: z.array(RegSessionSchema),
  transcriptionQueue: z.array(TranscriptionQueueItemSchema),
  migrationLedger: z.array(MigrationLedgerEntrySchema),
  mirrorRequests: z.array(MirrorRequestSchema).default([]),
  mirrorResults: z.array(MirrorResultSchema).default([]),
  mirrorInsightFeedback: z.array(MirrorInsightFeedbackSchema).default([]),
});

export const ArchiveBinaryEntrySchema = z.object({
  id: EntityIdSchema,
  ownerId: EntityIdSchema,
  path: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  checksumSha256: z.string().regex(/^[a-f0-9]{64}$/i),
});

export const ArchiveManifestSchema = z.object({
  schema: z.literal("qctp-archive-manifest-v1"),
  archiveVersion: z.literal(1),
  createdAt: IsoDateTimeSchema,
  dataPath: z.literal("qctp-data.json"),
  audio: z.array(ArchiveBinaryEntrySchema),
  attachments: z.array(ArchiveBinaryEntrySchema),
});

export type EvidenceClass = z.infer<typeof EvidenceClassSchema>;
export type Provenance = z.infer<typeof ProvenanceSchema>;
export type SourceLink = z.infer<typeof SourceLinkSchema>;
export type EvidenceLayer = z.infer<typeof EvidenceLayerSchema>;
export type InterpretationLayer = z.infer<typeof InterpretationLayerSchema>;
export type Backlink = z.infer<typeof BacklinkSchema>;
export type Revision = z.infer<typeof RevisionSchema>;
export type Attachment = z.infer<typeof AttachmentSchema>;
export type RecordKind = z.infer<typeof RecordKindSchema>;
export type CodexRecord = z.infer<typeof CodexRecordSchema>;
export type DayCompletion = z.infer<typeof DayCompletionSchema>;
export type FoundationState = z.infer<typeof FoundationStateSchema>;
export type WorkbookState = z.infer<typeof WorkbookStateSchema>;
export type AppSettings = z.infer<typeof AppSettingsSchema>;
export type VoiceDestination = z.infer<typeof VoiceDestinationSchema>;
export type RecordingStatus = z.infer<typeof RecordingStatusSchema>;
export type RecordingSegment = z.infer<typeof RecordingSegmentSchema>;
export type VoiceRecording = z.infer<typeof VoiceRecordingSchema>;
export type Transcript = z.infer<typeof TranscriptSchema>;
export type TranscriptCorrection = z.infer<typeof TranscriptCorrectionSchema>;
export type DerivedNote = z.infer<typeof DerivedNoteSchema>;
export type TranscriptionQueueItem = z.infer<
  typeof TranscriptionQueueItemSchema
>;
export type PathState = z.infer<typeof PathStateSchema>;
export type RegSession = z.infer<typeof RegSessionSchema>;
export type MigrationLedgerEntry = z.infer<typeof MigrationLedgerEntrySchema>;
export type SearchDocument = z.infer<typeof SearchDocumentSchema>;
export type MirrorJobStatus = z.infer<typeof MirrorJobStatusSchema>;
export type MirrorSourceSnapshot = z.infer<typeof MirrorSourceSnapshotSchema>;
export type MirrorRequest = z.infer<typeof MirrorRequestSchema>;
export type MirrorCitation = z.infer<typeof MirrorCitationSchema>;
export type MirrorProviderType = z.infer<typeof MirrorProviderTypeSchema>;
export type MirrorDisposition = z.infer<typeof MirrorDispositionSchema>;
export type MirrorResultRevisionAction = z.infer<
  typeof MirrorResultRevisionActionSchema
>;
export type MirrorResultRevision = z.infer<typeof MirrorResultRevisionSchema>;
export type MirrorResult = z.infer<typeof MirrorResultSchema>;
export type MirrorInsightKind = z.infer<typeof MirrorInsightKindSchema>;
export type MirrorInsightDisposition = z.infer<
  typeof MirrorInsightDispositionSchema
>;
export type MirrorInsightReviewAction = z.infer<
  typeof MirrorInsightReviewActionSchema
>;
export type MirrorInsightFeedbackRevisionAction = z.infer<
  typeof MirrorInsightFeedbackRevisionActionSchema
>;
export type MirrorInsightFeedbackRevision = z.infer<
  typeof MirrorInsightFeedbackRevisionSchema
>;
export type MirrorInsightFeedback = z.infer<typeof MirrorInsightFeedbackSchema>;
export type QctpExportData = z.infer<typeof QctpExportDataSchema>;
export type ArchiveBinaryEntry = z.infer<typeof ArchiveBinaryEntrySchema>;
export type ArchiveManifest = z.infer<typeof ArchiveManifestSchema>;
