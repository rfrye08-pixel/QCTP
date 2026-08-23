import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  testMatch: "pwa-upgrade-rollback.spec.ts",
  fullyParallel: false,
  forbidOnly: true,
  workers: 1,
  retries: 0,
  timeout: 300_000,
  reporter: [["list"]],
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "pwa-upgrade-chromium",
      metadata: { engine: "chromium" },
    },
    {
      name: "pwa-upgrade-webkit-online",
      metadata: { engine: "webkit" },
    },
  ],
});
