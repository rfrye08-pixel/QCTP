import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const pwaTestCandidate = process.env.QCTP_PWA_TEST_CANDIDATE?.trim();
const pwaTestOutDir = process.env.QCTP_PWA_TEST_OUT_DIR?.trim();
const productionCandidateSha = process.env.QCTP_BUILD_CANDIDATE_SHA?.trim();

if ((pwaTestCandidate === undefined) !== (pwaTestOutDir === undefined)) {
  throw new Error(
    "QCTP PWA test builds require both QCTP_PWA_TEST_CANDIDATE and QCTP_PWA_TEST_OUT_DIR.",
  );
}
if (
  pwaTestCandidate !== undefined &&
  productionCandidateSha !== undefined &&
  pwaTestCandidate !== productionCandidateSha
) {
  throw new Error(
    "QCTP production and PWA test candidate SHA values must not conflict.",
  );
}
const buildCandidateSha = pwaTestCandidate ?? productionCandidateSha;
if (
  buildCandidateSha !== undefined &&
  !/^[a-f0-9]{40}$/u.test(buildCandidateSha)
) {
  throw new Error("QCTP build candidate SHA must be exactly 40 lowercase hex.");
}

function createPwaTestMarkerPlugin(candidateSha: string): Plugin {
  return {
    name: "qctp-pwa-test-candidate-marker",
    apply: "build",
    transformIndexHtml: {
      order: "pre",
      handler() {
        return [
          {
            tag: "meta",
            attrs: {
              name: "qctp-candidate-sha",
              content: candidateSha,
            },
            injectTo: "head",
          },
        ];
      },
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "qctp-pwa-candidate.json",
        source: `${JSON.stringify(
          {
            schema: "qctp-pwa-upgrade-candidate-v1",
            candidateSha,
            releaseAuthority: "ZERO_RELEASE",
          },
          null,
          2,
        )}\n`,
      });
    },
  };
}

function createPwaActivationControlPlugin(
  candidateSha: string | undefined,
): Plugin {
  const embeddedCandidate = candidateSha ?? null;
  return {
    name: "qctp-pwa-activation-control",
    apply: "build",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "qctp-sw-control.js",
        source: `(() => {
  const candidateSha = ${JSON.stringify(embeddedCandidate)};
  self.addEventListener("message", (event) => {
    const replyPort = event.ports?.[0];
    if (event.data?.type === "QCTP_IDENTIFY_WAITING_CANDIDATE") {
      replyPort?.postMessage({
        type: "QCTP_WAITING_CANDIDATE_IDENTITY",
        candidateSha,
      });
      replyPort?.close();
      return;
    }
    if (event.data?.type !== "QCTP_ACTIVATE_WAITING_CANDIDATE") return;
    try {
      void self.skipWaiting();
      replyPort?.postMessage({
        type: "QCTP_ACTIVATION_ACCEPTED",
        candidateSha,
      });
      replyPort?.close();
    } catch (error) {
      replyPort?.postMessage({
        type: "QCTP_ACTIVATION_REJECTED",
        candidateSha,
        reason: error instanceof Error ? error.message : String(error),
      });
      replyPort?.close();
    }
  });
})();
`,
      });
    },
  };
}

export default defineConfig({
  base: "./",
  define: {
    __QCTP_BUILD_CANDIDATE_SHA__: JSON.stringify(buildCandidateSha ?? ""),
  },
  plugins: [
    react(),
    createPwaActivationControlPlugin(buildCandidateSha),
    ...(buildCandidateSha === undefined
      ? []
      : [createPwaTestMarkerPlugin(buildCandidateSha)]),
    VitePWA({
      registerType: "prompt",
      includeAssets: [
        "qctp-icon-32.png",
        "qctp-icon-180.png",
        "qctp-icon-192.png",
        "qctp-icon-512.png",
      ],
      manifest: {
        id: "./",
        name: "QCTP — Quantum Consciousness Training Platform",
        short_name: "QCTP",
        description:
          "A local-first consciousness training, practice, studio, experiment, and reflection platform.",
        theme_color: "#071017",
        background_color: "#071017",
        display: "standalone",
        orientation: "portrait-primary",
        scope: "./",
        start_url: "./",
        categories: ["education", "productivity", "lifestyle"],
        icons: [
          {
            src: "qctp-icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "qctp-icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "qctp-icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        importScripts: ["qctp-sw-control.js"],
        navigateFallback: "index.html",
        globPatterns: ["**/*.{js,css,html,svg,png,woff2,mp3,json}"],
        globIgnores: [
          "a03-acceptance/**",
          "audio/day1-source-rev0/voice-1500.mp3",
          "audio/day1-source-rev0/composite-ambient-low-1500.mp3",
          "audio/day1-source-rev0/acceptance-*.mp3",
        ],
        // Each controlled support-only stem is approximately 12 MB. The
        // rejected narration and composites are explicitly ignored above.
        maximumFileSizeToCacheInBytes: 13 * 1024 * 1024,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  ...(pwaTestOutDir === undefined
    ? {}
    : {
        build: {
          outDir: pwaTestOutDir,
          emptyOutDir: true,
        },
      }),
  server: {
    host: "127.0.0.1",
    proxy: {
      "/api": "http://127.0.0.1:8787",
    },
  },
  preview: { host: "127.0.0.1" },
});
