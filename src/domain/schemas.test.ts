import { describe, expect, it } from "vitest";

import {
  CodexRecordSchema,
  MirrorResultSchema,
  QctpExportDataSchema,
  VoiceRecordingSchema,
  createDefaultSettings,
} from "./index";

const now = "2026-08-17T12:00:00.000Z";

describe("versioned domain schemas", () => {
  it("defaults to a provider-free local transcription route", () => {
    const settings = createDefaultSettings(now);
    expect(settings.transcriptionRoute).toBe("local_only");
    expect(settings.neuralVoice).toBe("chill-brian");
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
