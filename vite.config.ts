import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
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
        navigateFallback: "index.html",
        globPatterns: ["**/*.{js,css,html,svg,png,woff2,mp3,json}"],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
      },
    }),
  ],
  server: {
    host: "127.0.0.1",
    proxy: {
      "/api": "http://127.0.0.1:8787",
    },
  },
  preview: { host: "127.0.0.1" },
});
