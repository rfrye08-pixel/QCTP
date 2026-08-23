import { describe, expect, it } from "vitest";

import {
  AppSettingsSchema,
  CodexRecordSchema,
  MirrorResultSchema,
  PracticeSessionSchema,
  QctpExportDataSchema,
  RecoverableCodexRecordSchema,
  RegSessionSchema,
  VoiceRecordingSchema,
  createReg01Session,
  createDefaultSettings,
} from "./index";

const now = "2026-08-17T12:00:00.000Z";

describe("versioned domain schemas", () => {
  it("defaults to a provider-free local transcription route", () => {
    const settings = createDefaultSettings(now);
    expect(settings.transcriptionRoute).toBe("local_only");
    expect(settings.neuralVoice).toBe("chill-brian");
    expect(settings.lastVoiceFreeIssue).toBeNull();
    expect(settings.reminderPreferences).toEqual({
      deviceNotificationsEnabled: false,
      middayLocalTime: null,
      eveningLocalTime: null,
      highestObservedProgramDate: null,
      receipts: [],
      lastNotificationAt: null,
    });
  });

  it("upgrades pre-Rev3 settings without inventing a practice issue", () => {
    const legacy: Partial<ReturnType<typeof createDefaultSettings>> = {
      ...createDefaultSettings(now),
    };
    delete legacy.lastVoiceFreeIssue;
    delete legacy.reminderPreferences;
    expect(AppSettingsSchema.parse(legacy).lastVoiceFreeIssue).toBeNull();
    expect(AppSettingsSchema.parse(legacy).reminderPreferences).toEqual({
      deviceNotificationsEnabled: false,
      middayLocalTime: null,
      eveningLocalTime: null,
      highestObservedProgramDate: null,
      receipts: [],
      lastNotificationAt: null,
    });
  });

  it("rejects malformed local reminder times", () => {
    const settings = createDefaultSettings(now);
    expect(() =>
      AppSettingsSchema.parse({
        ...settings,
        reminderPreferences: {
          ...settings.reminderPreferences,
          middayLocalTime: "25:90",
        },
      }),
    ).toThrow();
  });

  it("upgrades existing practice sessions with a null debrief and validates completed links", () => {
    const legacy = {
      schemaVersion: 1,
      id: "practice-legacy",
      practiceId: "foundation-day1-source-rev0-voice-free",
      foundationDay: 1,
      scriptId: "QCTP-D1-SOURCE-LABELED-SCRIPT-CANDIDATE-REV0",
      scriptSha256:
        "2649ce70e5ab824dbc6b797e07082567fda2443962016e8e6c7dbe454f5ee555",
      startedAt: now,
      endedAt: now,
      elapsedMs: 1_500_000,
      completionMode: "VOICE_FREE_FALLBACK",
      supportMode: "ambient",
      sourceSequence: ["Bullard", "HeartMath", "Dispenza", "QCTP return"],
      heartMathBreath:
        "approximately five seconds in / five seconds out or comfortable; no hold",
      naturalCompletion: true,
      narrationUsed: false,
      narratedContentAcceptance: "NOT_APPLICABLE",
      stateAttainment: "NOT_ASSESSED",
      createdAt: now,
    };
    const migrated = PracticeSessionSchema.parse(legacy);
    expect(migrated.debrief).toBeNull();
    expect(migrated.contentRef).toEqual({
      authorityKey: "foundation.day1.practice",
      contentClass: "QCTP_SYNTHESIS",
    });
    expect(
      PracticeSessionSchema.parse({
        ...legacy,
        debrief: {
          status: "completed",
          recordId: "voice-record:debrief-one",
          updatedAt: now,
          remindAt: null,
          promptVersion: "RAW_OBSERVATION_REV0",
        },
      }).debrief,
    ).toMatchObject({
      status: "completed",
      recordId: "voice-record:debrief-one",
    });
    expect(() =>
      PracticeSessionSchema.parse({
        ...legacy,
        debrief: {
          status: "completed",
          recordId: null,
          updatedAt: now,
          remindAt: null,
          promptVersion: "RAW_OBSERVATION_REV0",
        },
      }),
    ).toThrow("must link its raw observation record");
    expect(() =>
      PracticeSessionSchema.parse({
        ...legacy,
        contentRef: {
          authorityKey: "grant.exercise.REG-01-A",
          contentClass: "QCTP_ORIGINAL",
        },
      }),
    ).toThrow(/CONTROLLED_CONTENT_PARENT_MISMATCH/u);
  });

  it("rejects a registered but foreign controlled identity on REG-01", () => {
    expect(() =>
      RegSessionSchema.parse({
        ...createReg01Session("reg-parent-mismatch", now),
        contentRef: {
          authorityKey: "foundation.day1.practice",
          contentClass: "QCTP_SYNTHESIS",
        },
      }),
    ).toThrow(/CONTROLLED_CONTENT_PARENT_MISMATCH/u);
  });

  it("keeps observation evidence and interpretation as separately identified layers", () => {
    const record = CodexRecordSchema.parse({
      schemaVersion: 1,
      id: "record-1",
      kind: "geometry",
      title: "Two circles",
      createdAt: now,
      updatedAt: now,
      observation: {
        id: "evidence-1",
        text: "The shared chord is vertical.",
        capturedAt: now,
        evidenceClass: "observed",
        provenance: {
          actor: "user",
          method: "direct-entry",
          provider: null,
          model: null,
        },
        sourceIds: [],
      },
      interpretation: {
        id: "interpretation-1",
        text: "The overlap suggests a relationship.",
        authoredAt: now,
        provenance: {
          actor: "user",
          method: "direct-entry",
          provider: null,
          model: null,
        },
        basedOnEvidenceIds: ["evidence-1"],
      },
      tags: [],
      backlinks: [],
      sourceLinks: [],
      attachmentIds: [],
      revisionIds: [],
      pathId: "reg-path",
      sessionId: "reg-session-1",
      fields: {},
      deletedAt: null,
    });

    expect(record.observation?.id).not.toBe(record.interpretation?.id);
    expect(record.interpretation?.basedOnEvidenceIds).toEqual(["evidence-1"]);
    const protocolLinked = CodexRecordSchema.parse({
      ...record,
      contentRef: {
        authorityKey: "grant.exercise.REG-01-A",
        contentClass: "QCTP_ORIGINAL",
      },
      fields: {
        controlledContentAuthorityKey: "grant.exercise.REG-01-A",
      },
    });
    expect(protocolLinked.observation?.provenance.actor).toBe("user");
    expect(() =>
      CodexRecordSchema.parse({
        ...protocolLinked,
        fields: {
          ...protocolLinked.fields,
          controlledContentAuthorityKey: "foundation.day1.practice",
        },
      }),
    ).toThrow(/CONTROLLED_CONTENT_PARENT_MISMATCH/u);
  });

  it("exposes an unknown trusted legacy class as a recoverable read hold while strict saves reject it", () => {
    const legacy = {
      schemaVersion: 1,
      id: "legacy-held-record",
      kind: "source_note",
      title: "Legacy held record",
      createdAt: now,
      updatedAt: now,
      observation: null,
      interpretation: null,
      tags: [],
      backlinks: [],
      sourceLinks: [],
      attachmentIds: [],
      revisionIds: [],
      pathId: "thomas-campbell",
      sessionId: null,
      fields: {
        sourceTrack: "thomas-campbell",
        exerciseId: "TC-01-POSSIBILITY-LEDGER",
        contentClass: "mystery_class",
      },
      deletedAt: null,
    };
    expect(RecoverableCodexRecordSchema.parse(legacy)).toMatchObject({
      fields: { contentClass: "mystery_class" },
      controlledContentHold: {
        status: "HELD",
        code: "UNMAPPED_LEGACY_CONTENT_CLASS",
        rawValue: "mystery_class",
      },
    });
    expect(() => CodexRecordSchema.parse(legacy)).toThrow(
      /UNMAPPED_LEGACY_CONTENT_CLASS.*No data changed/u,
    );
  });

  it("requires every supported Codex and Lab record to use a current schema version", () => {
    const old = {
      schemaVersion: 0,
      id: "old",
      kind: "dream",
      title: "Old record",
      createdAt: now,
      updatedAt: now,
    };
    expect(() => CodexRecordSchema.parse(old)).toThrow();
    expect(() =>
      QctpExportDataSchema.parse({
        schema: "qctp-export-v2",
        schemaVersion: 1,
      }),
    ).toThrow();
  });

  it("represents local-only recordings without a provider or secret-bearing configuration", () => {
    const recording = VoiceRecordingSchema.parse({
      schemaVersion: 1,
      id: "recording-1",
      createdAt: now,
      updatedAt: now,
      acceptedAt: null,
      durationMs: 0,
      mimeType: "audio/webm",
      sizeBytes: 0,
      localBlobRef: "recording-1",
      remoteObjectRef: null,
      destinationType: "unclassified",
      destinationId: null,
      status: "LOCAL_ONLY",
      segments: [],
      transcriptionRoute: "local_only",
      provider: null,
      model: null,
      checksumSha256: null,
      retentionPolicy: "keep",
      failureCode: null,
      failureMessage: null,
      deletedAt: null,
    });
    expect(recording.transcriptionRoute).toBe("local_only");
    expect(recording.provider).toBeNull();
  });

  it("upgrades legacy local Mirror results with safe review defaults", () => {
    const result = MirrorResultSchema.parse({
      schemaVersion: 1,
      id: "legacy-result",
      requestId: "legacy-request",
      remoteJobId: "legacy-job",
      text: "Legacy generated reflection.",
      citations: [],
      provider: "px13-local",
      model: "legacy-local-model",
      createdAt: now,
    });

    expect(result).toMatchObject({
      providerType: "local_model",
      query: "",
      sourceRecordIds: [],
      proposedQuestion: null,
      proposedAction: null,
      disposition: "unreviewed",
      revisionHistory: [],
      annotation: null,
      deletedAt: null,
    });
  });
});
