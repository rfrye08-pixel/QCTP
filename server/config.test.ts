// @vitest-environment node

import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { loadServerConfig, ServerConfigError } from "./config.js";
import { createConfiguredApp } from "./index.js";

const token = "0123456789abcdef".repeat(4);

describe("server environment safety", () => {
  it("defaults to Free Local Mode without an OpenAI key or paid opt-in", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const config = loadServerConfig({ QCTP_API_TOKEN: token });
    const app = createConfiguredApp(config);

    expect(config).toMatchObject({
      transcriptionProvider: "local",
      localWhisperUrl: "http://127.0.0.1:8788/v1/audio/transcriptions",
      mirrorOllamaUrl: "http://127.0.0.1:11434",
      mirrorModel: "qwen3:8b",
      mirrorPollIntervalMs: 2_000,
      mirrorRateLimit: 1_000,
      mirrorRateWindowMs: 3_600_000,
      paidCloudEnabled: false,
      paidCloudHardSpendLimitUsd: 0,
    });
    expect(config.openAIApiKey).toBeUndefined();

    const policy = await request(app)
      .get("/api/transcriptions/policy")
      .set("Authorization", `Bearer ${token}`);
    expect(policy.status).toBe(200);
    expect(policy.body).toEqual({
      mode: "free-local",
      provider: "local-whisper",
      paidCloudEnabled: false,
      hardSpendLimitUsd: 0,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("mounts the authenticated Mirror sync surface without contacting a model", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const config = loadServerConfig({
      QCTP_API_TOKEN: token,
      QCTP_MIRROR_JOB_STORE_PATH: "test-data/mirror-jobs.json",
    });
    const app = createConfiguredApp(config);

    const unauthenticated = await request(app).get(
      "/api/mirror/jobs?requestIds=connectivity-probe",
    );
    expect(unauthenticated.status).toBe(401);
    expect(unauthenticated.body).toMatchObject({
      error: { code: "AUTH_REQUIRED", retryable: false },
    });

    const synchronized = await request(app)
      .get("/api/mirror/jobs?requestIds=connectivity-probe")
      .set("Authorization", `Bearer ${token}`);
    expect(synchronized.status).toBe(200);
    expect(synchronized.body).toEqual({ jobs: [] });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("keeps normal Mirror polling independent from the transcription upload limit", async () => {
    const config = loadServerConfig({
      QCTP_API_TOKEN: token,
      QCTP_TRANSCRIPTION_RATE_LIMIT: "1",
      QCTP_MIRROR_RATE_LIMIT: "50",
      QCTP_MIRROR_JOB_STORE_PATH: "test-data/mirror-rate-jobs.json",
    });
    const app = createConfiguredApp(config);

    for (let requestNumber = 0; requestNumber < 3; requestNumber += 1) {
      const response = await request(app)
        .get("/api/mirror/policy")
        .set("Authorization", `Bearer ${token}`);
      expect(response.status).toBe(200);
      expect(response.headers["ratelimit-limit"]).toBe("50");
    }
  });

  it("requires a protected single-user bearer token", () => {
    expect(() => loadServerConfig({})).toThrow(ServerConfigError);
    try {
      loadServerConfig({ QCTP_API_TOKEN: "short-secret-value" });
    } catch (error: unknown) {
      expect(String(error)).toContain("QCTP_API_TOKEN");
      expect(String(error)).not.toContain("short-secret-value");
    }
  });

  it("rejects copied placeholders and low-diversity token values", () => {
    for (const value of [
      "replace-with-a-random-local-token-at-least-32-characters",
      "a".repeat(64),
    ]) {
      expect(() => loadServerConfig({ QCTP_API_TOKEN: value })).toThrow(
        ServerConfigError,
      );
    }
  });

  it("rejects non-loopback local companion URLs", () => {
    expect(() =>
      loadServerConfig({
        QCTP_API_TOKEN: token,
        QCTP_LOCAL_WHISPER_URL: "http://example.com/v1/audio/transcriptions",
      }),
    ).toThrow(/QCTP_LOCAL_WHISPER_URL/);
  });

  it("rejects non-loopback local Mirror model URLs", () => {
    expect(() =>
      loadServerConfig({
        QCTP_API_TOKEN: token,
        QCTP_MIRROR_OLLAMA_URL: "https://example.com",
      }),
    ).toThrow(/QCTP_MIRROR_OLLAMA_URL/);
  });

  it("requires every paid-cloud gate and exposes the guarded budget", async () => {
    expect(() =>
      loadServerConfig({
        QCTP_API_TOKEN: token,
        QCTP_TRANSCRIPTION_PROVIDER: "openai",
      }),
    ).toThrow(
      /OPENAI_API_KEY|QCTP_ENABLE_PAID_CLOUD|QCTP_PAID_CLOUD_HARD_SPEND_LIMIT_USD/,
    );

    expect(() =>
      loadServerConfig({
        QCTP_API_TOKEN: token,
        QCTP_TRANSCRIPTION_PROVIDER: "openai",
        QCTP_ENABLE_PAID_CLOUD: "true",
        OPENAI_API_KEY: "test-openai-key-that-is-never-used",
      }),
    ).toThrow(/QCTP_PAID_CLOUD_HARD_SPEND_LIMIT_USD/);

    const config = loadServerConfig({
      QCTP_API_TOKEN: token,
      QCTP_TRANSCRIPTION_PROVIDER: "openai",
      QCTP_ENABLE_PAID_CLOUD: "true",
      QCTP_PAID_CLOUD_HARD_SPEND_LIMIT_USD: "2.5",
      OPENAI_API_KEY: "test-openai-key-that-is-never-used",
    });
    expect(config).toMatchObject({
      transcriptionProvider: "openai",
      paidCloudEnabled: true,
      paidCloudHardSpendLimitUsd: 2.5,
    });

    const app = createConfiguredApp(config);
    const policy = await request(app)
      .get("/api/transcriptions/policy")
      .set("Authorization", `Bearer ${token}`);
    expect(policy.status).toBe(200);
    expect(policy.body).toMatchObject({
      mode: "paid-cloud",
      provider: "openai",
      paidCloudEnabled: true,
      hardSpendLimitUsd: 2.5,
      spend: {
        hardLimitUsd: 2.5,
        committedUsd: 0,
        reservedUsd: 0,
        remainingUsd: 2.5,
      },
    });
    expect(
      String((policy.body as { billingWarning?: unknown }).billingWarning),
    ).toMatch(/charges/i);
  });

  it("never includes a rejected credential value in configuration errors", () => {
    const rejectedValue = "top-secret-short";
    try {
      loadServerConfig({
        QCTP_API_TOKEN: token,
        QCTP_TRANSCRIPTION_PROVIDER: "openai",
        QCTP_ENABLE_PAID_CLOUD: "true",
        QCTP_PAID_CLOUD_HARD_SPEND_LIMIT_USD: "5",
        OPENAI_API_KEY: rejectedValue,
      });
      throw new Error("Expected configuration to fail");
    } catch (error: unknown) {
      expect(String(error)).toContain("OPENAI_API_KEY");
      expect(String(error)).not.toContain(rejectedValue);
    }
  });

  it("forbids the mock provider in production", () => {
    expect(() =>
      loadServerConfig({
        NODE_ENV: "production",
        QCTP_API_TOKEN: token,
        QCTP_TRANSCRIPTION_PROVIDER: "mock",
      }),
    ).toThrow(/QCTP_TRANSCRIPTION_PROVIDER/);
  });
});