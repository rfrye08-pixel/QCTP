import { describe, expect, it, vi } from "vitest";

import { MirrorServiceClient } from "./client";
import type { MirrorConnectionError } from "./client";

const token = "px13-private-device-token-1234567890";

const policyResponse = (paidCloudEnabled: boolean): Response =>
  new Response(
    JSON.stringify({
      mode: "free-local",
      provider: "mock-local",
      model: "controlled-local-model",
      paidCloudEnabled,
      recurringApiCostUsd: 0,
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );

describe("Local AI Mirror policy client", () => {
  it("requires an authenticated strict Free Local attestation", async () => {
    const request = vi.fn(() => Promise.resolve(policyResponse(false)));
    const client = new MirrorServiceClient({
      accessToken: token,
      fetch: request,
    });

    await expect(client.probe()).resolves.toEqual({
      mode: "free-local",
      provider: "mock-local",
      model: "controlled-local-model",
      paidCloudEnabled: false,
      recurringApiCostUsd: 0,
    });
    expect(request).toHaveBeenCalledWith(
      "/api/mirror/policy",
      expect.objectContaining({
        headers: { Authorization: `Bearer ${token}` },
        redirect: "error",
      }),
    );
  });

  it("restores an HttpOnly device session without retaining the pairing bearer", async () => {
    const request = vi.fn(() => Promise.resolve(policyResponse(false)));
    const client = new MirrorServiceClient({ fetch: request });

    await expect(client.probe()).resolves.toMatchObject({
      mode: "free-local",
      paidCloudEnabled: false,
    });
    expect(request).toHaveBeenCalledWith(
      "/api/mirror/policy",
      expect.objectContaining({
        credentials: "include",
        headers: {},
        redirect: "error",
      }),
    );
  });

  it("rejects any policy that enables paid cloud", async () => {
    const client = new MirrorServiceClient({
      accessToken: token,
      fetch: vi.fn(() => Promise.resolve(policyResponse(true))),
    });

    await expect(client.probe()).rejects.toMatchObject({
      name: "MirrorConnectionError",
      retryable: false,
    } satisfies Partial<MirrorConnectionError>);
  });
});

describe("Local AI Mirror remote deletion client", () => {
  it.each([
    [204, "deleted"],
    [404, "not_found"],
  ] as const)(
    "maps an authenticated %i response to %s",
    async (status, expected) => {
      const request = vi.fn(() =>
        Promise.resolve(
          status === 404
            ? new Response(
                JSON.stringify({
                  error: {
                    code: "JOB_NOT_FOUND",
                    message: "The Mirror job was not found.",
                    retryable: false,
                    requestId: "gateway-request-1",
                  },
                }),
                {
                  status,
                  headers: {
                    "content-type": "application/json; charset=utf-8",
                    "x-request-id": "gateway-request-1",
                  },
                },
              )
            : new Response(null, {
                status,
                headers: { "x-request-id": "gateway-request-1" },
              }),
        ),
      );
      const client = new MirrorServiceClient({
        accessToken: token,
        fetch: request,
      });

      await expect(client.deleteJob("job-1")).resolves.toBe(expected);
      expect(request).toHaveBeenCalledWith(
        "/api/mirror/jobs/job-1",
        expect.objectContaining({
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
          redirect: "error",
        }),
      );
    },
  );

  it("deletes an uncertain submission by stable client request id", async () => {
    const request = vi.fn(() =>
      Promise.resolve(
        new Response(null, {
          status: 204,
          headers: { "x-request-id": "gateway-request-2" },
        }),
      ),
    );
    const client = new MirrorServiceClient({
      accessToken: token,
      fetch: request,
    });

    await expect(
      client.deleteJobByRequestId("request/with spaces"),
    ).resolves.toBe("deleted");
    expect(request).toHaveBeenCalledWith(
      "/api/mirror/jobs/by-request/request%2Fwith%20spaces",
      expect.objectContaining({
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
        redirect: "error",
      }),
    );
  });

  it("rejects a generic proxy 404 because it is not proof of PX13 absence", async () => {
    const client = new MirrorServiceClient({
      accessToken: token,
      fetch: vi.fn(() =>
        Promise.resolve(
          new Response("not found", {
            status: 404,
            headers: { "content-type": "text/plain" },
          }),
        ),
      ),
    });

    await expect(client.deleteJob("job-1")).rejects.toThrow(
      /unverified deletion.*preserved/i,
    );
  });

  it.each([
    ["a 204 without a QCTP request id", new Response(null, { status: 204 })],
    [
      "a 404 whose body and header request ids differ",
      new Response(
        JSON.stringify({
          error: {
            code: "JOB_NOT_FOUND",
            message: "The Mirror job was not found.",
            retryable: false,
            requestId: "body-request-id",
          },
        }),
        {
          status: 404,
          headers: {
            "content-type": "application/json",
            "x-request-id": "header-request-id",
          },
        },
      ),
    ],
  ])("preserves local data for %s", async (_label, response) => {
    const client = new MirrorServiceClient({
      accessToken: token,
      fetch: vi.fn(() => Promise.resolve(response)),
    });

    await expect(client.deleteJob("job-1")).rejects.toThrow(/preserved/i);
  });

  it("makes verification failure explicit so callers preserve local data", async () => {
    const client = new MirrorServiceClient({
      accessToken: token,
      fetch: vi.fn(() => Promise.reject(new TypeError("offline"))),
    });

    const deletion = client.deleteJob("job-1");
    await expect(deletion).rejects.toMatchObject({
      name: "MirrorConnectionError",
      retryable: true,
    } satisfies Partial<MirrorConnectionError>);
    await expect(deletion).rejects.toThrow(
      /local Mirror reflection was preserved/,
    );
  });
});
