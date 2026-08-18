import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";

if (!Blob.prototype.arrayBuffer) {
  Object.defineProperty(Blob.prototype, "arrayBuffer", {
    configurable: true,
    value(this: Blob): Promise<ArrayBuffer> {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.addEventListener(
          "load",
          () => resolve(reader.result as ArrayBuffer),
          { once: true },
        );
        reader.addEventListener(
          "error",
          () =>
            reject(reader.error ?? new Error("Unable to read Blob as bytes.")),
          { once: true },
        );
        reader.readAsArrayBuffer(this);
      });
    },
  });
}

if (!Blob.prototype.text) {
  Object.defineProperty(Blob.prototype, "text", {
    configurable: true,
    value(this: Blob): Promise<string> {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.addEventListener(
          "load",
          () => {
            if (typeof reader.result === "string") {
              resolve(reader.result);
              return;
            }
            reject(new Error("FileReader returned a non-text result."));
          },
          { once: true },
        );
        reader.addEventListener(
          "error",
          () =>
            reject(reader.error ?? new Error("Unable to read Blob as text.")),
          { once: true },
        );
        reader.readAsText(this);
      });
    },
  });
}
