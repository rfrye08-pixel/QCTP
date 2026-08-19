import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { deleteQctpDatabase } from "../data";

import { QctpProvider } from "./QctpProvider";
import { useQctp } from "./qctp-context";

function SessionProbe() {
  const runtime = useQctp();
  return (
    <output aria-label="device session status">
      {runtime.localTranscriptionStatus}:{runtime.mirror.connectivity}
    </output>
  );
}

function MirrorConnectionProbe() {
  const runtime = useQctp();
  return (
    <>
      <output aria-label="mirror connection status">
        {runtime.mirror.connectivity}
      </output>
      <button type="button" onClick={() => void runtime.mirror.connect()}>
        Synchronize
      </button>
    </>
  );
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  return input instanceof URL ? input.href : input.url;
}

describe("QCTP private device-session restoration", () => {
  beforeEach(async () => {
    localStorage.clear();
    await deleteQctpDatabase();
  });

  afterEach(async () => {
    cleanup();
    vi.restoreAllMocks();
    await deleteQctpDatabase();
  });

  it("reconnects after a PWA close using only the HttpOnly cookie session", async () => {
    const request = vi.fn(
      (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        void init;
        const target = requestUrl(input);
        if (target.endsWith("/api/transcriptions/policy")) {
          return Promise.resolve(
            jsonResponse({
              mode: "free-local",
              provider: "local-whisper",
              paidCloudEnabled: false,
              hardSpendLimitUsd: 0,
            }),
          );
        }
        if (target.endsWith("/api/mirror/policy")) {
          return Promise.resolve(
            jsonResponse({
              mode: "free-local",
              provider: "ollama-local",
              model: "controlled-local-model",
              paidCloudEnabled: false,
              recurringApiCostUsd: 0,
            }),
          );
        }
        return Promise.reject(new Error(`Unexpected request: ${target}`));
      },
    );
    vi.stubGlobal("fetch", request);

    const first = render(
      <QctpProvider>
        <SessionProbe />
      </QctpProvider>,
    );
    await screen.findByText("ready:online");
    first.unmount();

    render(
      <QctpProvider>
        <SessionProbe />
      </QctpProvider>,
    );
    await screen.findByText("ready:online");

    await waitFor(() => {
      expect(
        request.mock.calls.filter(([input]) =>
          requestUrl(input).endsWith("/api/transcriptions/policy"),
        ),
      ).toHaveLength(2);
    });
    expect(
      request.mock.calls.some(([input]) =>
        requestUrl(input).endsWith("/api/device-session"),
      ),
    ).toBe(false);
    for (const [, init] of request.mock.calls) {
      expect(init).toMatchObject({ credentials: "include" });
      expect(init?.headers).not.toHaveProperty("Authorization");
    }
  });

  it("keeps a healthy online indicator stable across one transient background failure", async () => {
    let mirrorPolicyCalls = 0;
    const request = vi.fn((input: RequestInfo | URL): Promise<Response> => {
      const target = requestUrl(input);
      if (target.endsWith("/api/transcriptions/policy")) {
        return Promise.resolve(
          jsonResponse({
            mode: "free-local",
            provider: "local-whisper",
            paidCloudEnabled: false,
            hardSpendLimitUsd: 0,
          }),
        );
      }
      if (target.endsWith("/api/mirror/policy")) {
        mirrorPolicyCalls += 1;
        return mirrorPolicyCalls === 1
          ? Promise.resolve(
              jsonResponse({
                mode: "free-local",
                provider: "ollama-local",
                model: "controlled-local-model",
                paidCloudEnabled: false,
                recurringApiCostUsd: 0,
              }),
            )
          : Promise.reject(new Error("transient private-network failure"));
      }
      return Promise.reject(new Error(`Unexpected request: ${target}`));
    });
    vi.stubGlobal("fetch", request);

    render(
      <QctpProvider>
        <MirrorConnectionProbe />
      </QctpProvider>,
    );
    await screen.findByText("online");

    // The online state is visible before the initial background synchronization
    // promise necessarily releases its concurrency lock. One click may
    // correctly join that in-flight run, so allow a second deliberate click
    // after a task turn rather than racing the lock.
    for (let attempt = 0; attempt < 2 && mirrorPolicyCalls < 2; attempt += 1) {
      fireEvent.click(screen.getByRole("button", { name: "Synchronize" }));
      await act(
        () => new Promise<void>((resolve) => window.setTimeout(resolve, 0)),
      );
    }

    await waitFor(() => expect(mirrorPolicyCalls).toBe(2));
    expect(screen.getByLabelText("mirror connection status")).toHaveTextContent(
      "online",
    );
  });
});
