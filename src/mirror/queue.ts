import type { QctpRepository } from "../data";
import {
  MirrorRequestSchema,
  MirrorResultSchema,
  type CodexRecord,
  type MirrorRequest,
  type MirrorResult,
} from "../domain";

import {
  MirrorConnectionError,
  type MirrorServiceClient,
  type RemoteMirrorJob,
} from "./client";

function sourceExcerpt(record: CodexRecord): string {
  let fields: string;
  try {
    fields = JSON.stringify(record.fields);
  } catch {
    fields = "[unserializable structured fields]";
  }
  const bounded = (value: string) => value.slice(0, 1_250) || "(none)";
  return [
    `[Observation]\n${bounded(record.observation?.text ?? "")}`,
    `[Interpretation]\n${bounded(record.interpretation?.text ?? "")}`,
    `[Structured fields]\n${bounded(fields)}`,
  ].join("\n\n");
}

export function extractExplicitMirrorProposals(text: string): {
  proposedQuestion: string | null;
  proposedAction: string | null;
} {
  const extract = (label: "question" | "action"): string | null => {
    const pattern = new RegExp(
      `^\\s*Proposed ${label}:\\s*(\\S.*)\\s*$`,
      "gimu",
    );
    const matches = [...text.matchAll(pattern)];
    if (matches.length !== 1) return null;
    const value = matches[0]?.[1]?.trim() ?? "";
    return value ? value.slice(0, 8_000) : null;
  };
  return {
    proposedQuestion: extract("question"),
    proposedAction: extract("action"),
  };
}

const SOURCE_MARKER_PATTERN = /\[source:([A-Za-z0-9][A-Za-z0-9._:-]{0,127})\]/g;

function validateResultCitationMarkers(
  text: string,
  citationIds: readonly string[],
): void {
  const markerIds = [
    ...new Set(
      [...text.matchAll(SOURCE_MARKER_PATTERN)].flatMap((match) =>
        match[1] ? [match[1]] : [],
      ),
    ),
  ];
  if (markerIds.length === 0 || !sameStringSet(markerIds, citationIds)) {
    throw new MirrorConnectionError(
      "PX13 returned a Local AI reflection whose source markers did not match its declared citations. The result was held from the local Codex.",
      false,
    );
  }
}

function sameStringSet(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === new Set(right).size &&
    left.every((value) => right.includes(value)) &&
    right.every((value) => left.includes(value))
  );
}

export async function enqueueMirrorRequest(
  repository: QctpRepository,
  input: { prompt: string; sourceRecordIds: string[] },
  now = new Date().toISOString(),
): Promise<MirrorRequest> {
  const uniqueIds = [...new Set(input.sourceRecordIds)];
  const records = await Promise.all(
    uniqueIds.map((id) => repository.getRecord(id)),
  );
  if (records.some((record) => !record))
    throw new Error("One or more selected source records no longer exist.");
  const sources = records.filter((record): record is CodexRecord =>
    Boolean(record),
  );
  const request = MirrorRequestSchema.parse({
    schemaVersion: 1,
    id: `mirror-request-${crypto.randomUUID()}`,
    prompt: input.prompt,
    sourceRecordIds: uniqueIds,
    sourceSnapshots: sources.map((record) => ({
      recordId: record.id,
      title: record.title,
      kind: record.kind,
      excerpt: sourceExcerpt(record),
      recordUpdatedAt: record.updatedAt,
    })),
    status: "QUEUED_LOCAL",
    remoteJobId: null,
    attempts: 0,
    nextAttemptAt: null,
    lastError: null,
    createdAt: now,
    updatedAt: now,
  });
  return repository.saveMirrorRequest(request);
}

function localStatus(job: RemoteMirrorJob): MirrorRequest["status"] {
  switch (job.status) {
    case "queued":
      return "QUEUED_PX13";
    case "processing":
      return "PROCESSING";
    case "retry_wait":
      return "RETRY_WAIT";
    case "complete":
      return "COMPLETE";
    case "failed":
      return "FAILED";
  }
}

async function applyRemoteJob(
  repository: QctpRepository,
  request: MirrorRequest,
  job: RemoteMirrorJob,
): Promise<MirrorResult | null> {
  if (job.requestId !== request.id)
    throw new Error("PX13 returned a mismatched Mirror request.");
  const citedIds =
    job.result?.citations.map((citation) => citation.recordId) ?? [];
  if (citedIds.some((id) => !request.sourceRecordIds.includes(id))) {
    throw new Error(
      "PX13 returned a citation outside the submitted source set.",
    );
  }
  if (
    job.result?.citations.some((citation) => {
      const source = request.sourceSnapshots.find(
        (candidate) => candidate.recordId === citation.recordId,
      );
      return (
        !source ||
        source.title !== citation.title ||
        !source.excerpt.includes(citation.excerpt)
      );
    })
  ) {
    throw new Error(
      "PX13 returned citation text that was not present in the submitted source snapshot.",
    );
  }
  if (job.status === "complete" && job.result) {
    const proposals = extractExplicitMirrorProposals(job.result.text);
    if (!proposals.proposedQuestion || !proposals.proposedAction) {
      throw new MirrorConnectionError(
        "PX13 returned a Local AI reflection without exactly one proposed question and action. The incomplete result was held from the local Codex.",
        false,
      );
    }
    validateResultCitationMarkers(job.result.text, citedIds);
    const result = MirrorResultSchema.parse({
      schemaVersion: 1,
      id: `mirror-result:${request.id}`,
      requestId: request.id,
      remoteJobId: job.id,
      text: job.result.text,
      citations: job.result.citations,
      providerType: "local_model",
      provider: "px13-local",
      model: job.result.model,
      query: request.prompt,
      sourceRecordIds: request.sourceRecordIds,
      proposedQuestion: proposals.proposedQuestion,
      proposedAction: proposals.proposedAction,
      disposition: "unreviewed",
      revisionHistory: [
        {
          id: `mirror-revision-${crypto.randomUUID()}`,
          createdAt: job.result.createdAt,
          action: "generated",
          disposition: "unreviewed",
          text: job.result.text,
          proposedQuestion: proposals.proposedQuestion,
          proposedAction: proposals.proposedAction,
          annotation: null,
        },
      ],
      annotation: null,
      createdAt: job.result.createdAt,
      deletedAt: null,
    });
    return repository.saveMirrorResult(result);
  }
  await repository.saveMirrorRequest(
    MirrorRequestSchema.parse({
      ...request,
      status: localStatus(job),
      remoteJobId: job.id,
      attempts: Math.max(request.attempts, job.attempts),
      nextAttemptAt: null,
      lastError: job.lastError,
      updatedAt: job.updatedAt,
    }),
  );
  return null;
}

export interface MirrorSyncResult {
  completedRequestIds: string[];
  queuedRequestIds: string[];
}

export async function synchronizeMirrorRequests(
  repository: QctpRepository,
  client: MirrorServiceClient,
): Promise<MirrorSyncResult> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { completedRequestIds: [], queuedRequestIds: [] };
  }
  const requests = await repository.listMirrorRequests();
  const completedRequestIds: string[] = [];
  const queuedRequestIds: string[] = [];
  for (const request of requests) {
    if (request.status === "COMPLETE" || request.status === "FAILED") continue;
    if (
      request.status === "RETRY_WAIT" &&
      request.nextAttemptAt &&
      new Date(request.nextAttemptAt) > new Date()
    )
      continue;
    try {
      let job: RemoteMirrorJob;
      let activeRequest = request;
      if (request.remoteJobId) {
        job = await client.getJob(request.remoteJobId);
        if (
          request.status === "SUBMITTING" &&
          (job.status === "failed" || job.status === "retry_wait")
        ) {
          job = await client.retry(request.remoteJobId);
        }
      } else {
        activeRequest = await repository.saveMirrorRequest(
          MirrorRequestSchema.parse({
            ...request,
            status: "SUBMITTING",
            attempts: request.attempts + 1,
            updatedAt: new Date().toISOString(),
          }),
        );
        job = await client.submit(
          request.id,
          request.prompt,
          request.sourceSnapshots,
        );
      }
      const result = await applyRemoteJob(repository, activeRequest, job);
      if (result) completedRequestIds.push(request.id);
      else queuedRequestIds.push(request.id);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "PX13 is unavailable; the request remains queued.";
      const retryable =
        error instanceof MirrorConnectionError ? error.retryable : true;
      await repository.saveMirrorRequest(
        MirrorRequestSchema.parse({
          ...request,
          status: retryable ? "RETRY_WAIT" : "FAILED",
          attempts: request.attempts + 1,
          nextAttemptAt: retryable
            ? new Date(Date.now() + 30_000).toISOString()
            : null,
          lastError: message,
          updatedAt: new Date().toISOString(),
        }),
      );
      queuedRequestIds.push(request.id);
    }
  }
  return { completedRequestIds, queuedRequestIds };
}
