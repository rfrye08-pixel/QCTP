import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface RegistrationCallbacks {
  onRegisteredSW?: (
    swUrl: string,
    registration: ServiceWorkerRegistration | undefined,
  ) => void;
  onOfflineReady?: () => void;
  onNeedRefresh?: () => void;
  onNeedReload?: () => void;
  onRegisterError?: () => void;
}

class FakeServiceWorker extends EventTarget {
  readonly postMessage =
    vi.fn<(message: unknown, transfer?: readonly Transferable[]) => void>();

  constructor(public state: ServiceWorkerState) {
    super();
  }
}

class FakeServiceWorkerRegistration extends EventTarget {
  constructor(
    public active: FakeServiceWorker | null,
    public waiting: FakeServiceWorker | null,
  ) {
    super();
  }
}

const pwaMock = vi.hoisted(() => ({
  callbacks: null as RegistrationCallbacks | null,
  registration: null as ServiceWorkerRegistration | null,
  replacement: null as ServiceWorker | null,
  update: vi.fn<(reloadPage?: boolean) => Promise<void>>(),
  register: vi.fn((callbacks: RegistrationCallbacks) => {
    pwaMock.callbacks = callbacks;
    callbacks.onRegisteredSW?.("/sw.js", pwaMock.registration ?? undefined);
    return pwaMock.update;
  }),
}));

vi.mock("virtual:pwa-register", () => ({ registerSW: pwaMock.register }));

beforeEach(() => {
  vi.resetModules();
  const previousActive = new FakeServiceWorker("activated");
  const replacement = new FakeServiceWorker("installed");
  const registration = new FakeServiceWorkerRegistration(
    previousActive,
    replacement,
  );
  pwaMock.callbacks = null;
  pwaMock.registration = registration as unknown as ServiceWorkerRegistration;
  pwaMock.replacement = replacement as unknown as ServiceWorker;
  pwaMock.register.mockClear();
  pwaMock.update.mockReset();
  replacement.postMessage.mockImplementation((_message, transfer) => {
    const replyPort = transfer?.[0] as MessagePort | undefined;
    replyPort?.postMessage({
      type: "QCTP_ACTIVATION_ACCEPTED",
      candidateSha: "b".repeat(40),
    });
    replacement.state = "activating";
    replacement.dispatchEvent(new Event("statechange"));
    registration.active = replacement;
    registration.waiting = null;
    replacement.state = "activated";
    replacement.dispatchEvent(new Event("statechange"));
  });
  document.head
    .querySelectorAll('meta[name="qctp-candidate-sha"]')
    .forEach((element) => element.remove());
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("controlled PWA lifecycle", () => {
  it("waits for an explicit update action and preserves exact candidate identity", async () => {
    const marker = document.createElement("meta");
    marker.name = "qctp-candidate-sha";
    marker.content = "a".repeat(40);
    document.head.append(marker);
    const lifecycle = await import("./pwa-status");

    function Probe() {
      const status = lifecycle.usePwaStatus();
      return (
        <output>
          {status.updateStatus}|{status.message}|{status.candidateSha}
        </output>
      );
    }

    lifecycle.startPwaLifecycle();
    render(<Probe />);
    act(() => pwaMock.callbacks?.onNeedRefresh?.());
    const replacement = pwaMock.replacement as unknown as FakeServiceWorker;
    expect(
      screen.getByText(/update-available\|an update is ready/i),
    ).toHaveTextContent("a".repeat(40));
    expect(replacement.postMessage).not.toHaveBeenCalled();

    let applied = false;
    await act(async () => {
      applied = await lifecycle.applyPwaUpdate();
    });
    expect(applied).toBe(true);
    expect(replacement.postMessage).toHaveBeenCalledWith(
      { type: "QCTP_ACTIVATE_WAITING_CANDIDATE" },
      [expect.any(MessagePort)],
    );
    expect(pwaMock.update).not.toHaveBeenCalled();
    expect(screen.getByText(/applying-update/i)).toHaveTextContent(
      /opening the verified update/i,
    );
  });

  it("keeps a waiting package retryable after an activation failure", async () => {
    const replacement = pwaMock.replacement as unknown as FakeServiceWorker;
    replacement.postMessage.mockImplementationOnce(() => {
      throw new Error("activation failed");
    });
    const lifecycle = await import("./pwa-status");

    function Probe() {
      const status = lifecycle.usePwaStatus();
      return (
        <output>
          {status.updateStatus}|{status.message}
        </output>
      );
    }

    lifecycle.startPwaLifecycle();
    render(<Probe />);
    act(() => pwaMock.callbacks?.onNeedRefresh?.());
    await act(() => lifecycle.applyPwaUpdate());

    expect(
      screen.getByText(/update-retry\|the update is still ready/i),
    ).toHaveTextContent(/local data remain available/i);

    let retried = false;
    await act(async () => {
      retried = await lifecycle.applyPwaUpdate();
    });
    expect(retried).toBe(true);
  });

  it("keeps a ready update waiting while critical practice work is active", async () => {
    const safety = await import("./pwa-update-safety");
    const lifecycle = await import("./pwa-status");

    function Probe() {
      const status = lifecycle.usePwaStatus();
      return (
        <output>
          {status.updateStatus}|{status.message}
        </output>
      );
    }

    safety.markPwaCriticalActivityActive("foundation-day1-practice");
    try {
      lifecycle.startPwaLifecycle();
      render(<Probe />);
      act(() => pwaMock.callbacks?.onNeedRefresh?.());
      let applied = true;
      await act(async () => {
        applied = await lifecycle.applyPwaUpdate();
      });

      expect(applied).toBe(false);
      expect(
        (pwaMock.replacement as unknown as FakeServiceWorker).postMessage,
      ).not.toHaveBeenCalled();
      expect(screen.getByText(/update-available/i)).toHaveTextContent(
        /waiting safely while this QCTP window finishes active work/i,
      );
    } finally {
      safety.markPwaCriticalActivityIdle("foundation-day1-practice");
    }
  });

  it("keeps the current package available when activation times out", async () => {
    vi.useFakeTimers();
    const replacement = pwaMock.replacement as unknown as FakeServiceWorker;
    replacement.postMessage.mockImplementationOnce(() => undefined);
    const lifecycle = await import("./pwa-status");

    function Probe() {
      const status = lifecycle.usePwaStatus();
      return (
        <output>
          {status.updateStatus}|{status.message}
        </output>
      );
    }

    lifecycle.startPwaLifecycle();
    render(<Probe />);
    act(() => pwaMock.callbacks?.onNeedRefresh?.());
    let applied = true;
    await act(async () => {
      const applying = lifecycle.applyPwaUpdate();
      await vi.advanceTimersByTimeAsync(15_100);
      applied = await applying;
    });

    expect(applied).toBe(false);
    expect(
      screen.getByText(/update-retry\|the update is still ready/i),
    ).toHaveTextContent(/local data remain available/i);
  });

  it("does not present malformed build metadata as a controlled candidate", async () => {
    const marker = document.createElement("meta");
    marker.name = "qctp-candidate-sha";
    marker.content = "not-a-controlled-sha";
    document.head.append(marker);
    const lifecycle = await import("./pwa-status");

    function Probe() {
      const status = lifecycle.usePwaStatus();
      return <output>{status.candidateSha ?? "unidentified"}</output>;
    }

    render(<Probe />);
    expect(screen.getByText("unidentified")).toBeInTheDocument();
  });
});
