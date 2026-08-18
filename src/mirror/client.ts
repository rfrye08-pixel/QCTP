import { z } from "zod";

import type { MirrorSourceSnapshot } from "../domain";

import { readVerifiedMirrorDeletionResponse } from "./delete-proof";

const CitationSchema = z.object({
  recordId: z.string().min(1),
  title: z.string().min(1),
  excerpt: z.string(),
});

const RemoteMirrorJobSchema = z.object({
  id: z.string().min(1),
  requestId: z.string().min(1),
  status: z.enum(["queued", "processing", "retry_wait", "complete", "failed"]),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  attempts: z.number().int().nonnegative(),
  lastError: z.string().nullable(),
  result: z
    .object({
      text: z.string(),
      model: z.string().min(1),
      citations: z.array(CitationSchema),
      createdAt: z.string().datetime(),
    })
    .nullable(),
});

const RemoteMirrorJobsSchema = z.union([
  z.array(RemoteMirrorJobSchema),
  z
    .object({ jobs: z.array(RemoteMirrorJobSchema) })
    .transform(({ jobs }) => jobs),
]);

const MirrorServicePolicySchema = z
  .object({
    mode: z.literal("free-local"),
    provider: z.string().trim().min(1).max(200),
    model: z.string().trim().min(1).max(200),
    paidCloudEnabled: z.literal(false),
    recurringApiCostUsd: z.literal(0),
  })
  .strict();

export type RemoteMirrorJob = z.infer<typeof RemoteMirrorJobSchema>;
export type MirrorServicePolicy = z.infer<typeof MirrorServicePolicySchema>;

export class MirrorConnectionError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "MirrorConnectionError";
  }
}

export interface MirrorServiceClientOptions {
  accessToken?: string;
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
}

function url(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, "")}${path}`;
}

function validateGatewayBaseUrl(value: string): string {
  if (!value) return "";
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("The PX13 gateway URL is invalid.");
  }
  const loopback = ["127.0.0.1", "localhost", "[::1]", "::1"].includes(
    parsed.hostname.toLocaleLowerCase(),
  );
  if (
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    (parsed.pathname !== "/" && parsed.pathname !== "") ||
    (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && loopback))
  ) {
    throw new Error(
      "Remote PX13 connections require HTTPS on an origin; only exact loopback may use HTTP.",
    );
  }
  return parsed.origin;
}

export class MirrorServiceClient {
  private readonly baseUrl: string;
  private readonly request: typeof globalThis.fetch;

  constructor(private readonly options: MirrorServiceClientOptions) {
    if (
      options.accessToken !== undefined &&
      options.accessToken.trim().length < 32
    ) {
      throw new Error(
        "The PX13 device token must contain at least 32 characters.",
      );
    }
    this.baseUrl = validateGatewayBaseUrl(options.baseUrl ?? "");
    this.request = options.fetch ?? globalThis.fetch.bind(globalThis);
  }

  async probe(): Promise<MirrorServicePolicy> {
    return this.send(
      "/api/mirror/policy",
      { headers: this.headers() },
      MirrorServicePolicySchema,
    );
  }

  async submit(
    requestId: string,
    prompt: string,
    sources: MirrorSourceSnapshot[],
  ): Promise<RemoteMirrorJob> {
    return this.send(
      "/api/mirror/jobs",
      {
        method: "POST",
        headers: this.headers({
          "Content-Type": "application/json",
          "Idempotency-Key": `mirror-${requestId}`,
        }),
        body: JSON.stringify({ requestId, prompt, sources }),
      },
      RemoteMirrorJobSchema,
    );
  }

  async getJob(jobId: string): Promise<RemoteMirrorJob> {
    return this.send(
      `/api/mirror/jobs/${encodeURIComponent(jobId)}`,
      {
        headers: this.headers(),
      },
      RemoteMirrorJobSchema,
    );
  }

  async syncJobs(requestIds: string[]): Promise<RemoteMirrorJob[]> {
    if (requestIds.length === 0) return [];
    const query = `?requestIds=${encodeURIComponent(requestIds.join(","))}`;
    return this.send(
      `/api/mirror/jobs${query}`,
      {
        headers: this.headers(),
      },
      RemoteMirrorJobsSchema,
    );
  }

  async retry(jobId: string): Promise<RemoteMirrorJob> {
    return this.send(
      `/api/mirror/jobs/${encodeURIComponent(jobId)}/retry`,
      {
        method: "POST",
        headers: this.headers(),
      },
      RemoteMirrorJobSchema,
    );
  }

  async deleteJob(jobId: string): Promise<"deleted" | "not_found"> {
    return this.deleteRemoteArtifact(
      `/api/mirror/jobs/${encodeURIComponent(jobId)}`,
    );
  }

  async deleteJobByRequestId(
    requestId: string,
  ): Promise<"deleted" | "not_found"> {
    return this.deleteRemoteArtifact(
      `/api/mirror/jobs/by-request/${encodeURIComponent(requestId)}`,
    );
  }

  private async deleteRemoteArtifact(
    path: string,
  ): Promise<"deleted" | "not_found"> {
    let response: Response;
    try {
      response = await this.request(url(this.baseUrl, path), {
        method: "DELETE",
        headers: this.headers(),
        redirect: "error",
        credentials: "include",
      });
    } catch {
      throw new MirrorConnectionError(
        "PX13 deletion could not be verified. The local Mirror reflection was preserved.",
        true,
      );
    }
    if (response.status === 204 || response.status === 404) {
      const verified = await readVerifiedMirrorDeletionResponse(response);
      if (verified) return verified;
      throw new MirrorConnectionError(
        "PX13 returned an unverified deletion response. The local Mirror reflection was preserved.",
        false,
      );
    }
    const retryable =
      response.status === 408 ||
      response.status === 429 ||
      response.status >= 500;
    const message =
      response.status === 401 || response.status === 403
        ? "The PX13 private connection needs to be paired again before deletion. The local reflection was preserved."
        : "PX13 deletion could not be verified. The local Mirror reflection was preserved.";
    throw new MirrorConnectionError(message, retryable);
  }

  private headers(
    additional: Record<string, string> = {},
  ): Record<string, string> {
    return {
      ...(this.options.accessToken
        ? { Authorization: `Bearer ${this.options.accessToken}` }
        : {}),
      ...additional,
    };
  }

  private async send<T>(
    path: string,
    init: RequestInit,
    schema: z.ZodType<T>,
  ): Promise<T> {
    let response: Response;
    try {
      response = await this.request(url(this.baseUrl, path), {
        ...init,
        redirect: "error",
        credentials: "include",
      });
    } catch {
      throw new MirrorConnectionError(
        "PX13 is unavailable. The Mirror request remains queued on this device.",
        true,
      );
    }
    if (!response.ok) {
      const retryable =
        response.status === 408 ||
        response.status === 429 ||
        response.status >= 500;
      const message =
        response.status === 401 || response.status === 403
          ? "The PX13 private connection needs to be paired again."
          : "PX13 could not accept the Mirror request yet; it remains queued.";
      throw new MirrorConnectionError(message, retryable);
    }
    try {
      return schema.parse(await response.json());
    } catch {
      throw new MirrorConnectionError(
        "PX13 returned an invalid Mirror job response; local sources remain intact.",
        false,
      );
    }
  }
}
