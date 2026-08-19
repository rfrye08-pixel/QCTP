import { Blob as NodeBlob } from "node:buffer";

import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";

// jsdom's Blob can lose its prototype when fake-indexeddb delegates cloning to
// Node's structuredClone implementation. That produces stored binary records
// whose `arrayBuffer()` method is missing even though real browsers preserve
// Blob identity. Use Node's standards-compatible, structured-clone-safe Blob
// for repository, export/import, transcription, and voice-capture tests.
Object.defineProperty(globalThis, "Blob", {
  configurable: true,
  writable: true,
  value: NodeBlob,
});

if (typeof window !== "undefined") {
  Object.defineProperty(window, "Blob", {
    configurable: true,
    writable: true,
    value: NodeBlob,
  });
}
