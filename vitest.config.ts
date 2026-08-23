import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  define: {
    __QCTP_BUILD_CANDIDATE_SHA__: JSON.stringify("a".repeat(40)),
  },
  plugins: [react()],
  resolve: {
    alias: {
      "virtual:pwa-register": fileURLToPath(
        new URL("./src/test/pwa-register-stub.ts", import.meta.url),
      ),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}", "server/**/*.test.ts"],
    reporters: ["default"],
    restoreMocks: true,
    clearMocks: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "html"],
      include: ["src/**/*.{ts,tsx}", "server/**/*.ts"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        // React view behavior is covered in the Playwright desktop/iPhone
        // projects; unit coverage measures the reusable domain/runtime core.
        "src/**/*.tsx",
        "src/test/**",
        "src/main.tsx",
        // This virtual-PWA adapter is exercised by Chromium/WebKit service-
        // worker acceptance; V8 cannot remap the unexecuted virtual import.
        "src/app/pwa-status.ts",
        "server/**/*.test.ts",
        "server/index.ts",
      ],
      thresholds: {
        lines: 85,
        functions: 85,
        statements: 85,
        branches: 75,
      },
    },
  },
});
