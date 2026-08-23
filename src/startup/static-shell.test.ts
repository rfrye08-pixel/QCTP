import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const indexHtml = readFileSync(resolve(process.cwd(), "index.html"), "utf8");

describe("static QCTP startup shell", () => {
  it("provides a dark branded recovery surface before JavaScript mounts", () => {
    expect(indexHtml).toContain("background: #071017");
    expect(indexHtml).toContain('class="qctp-recovery-shell"');
    expect(indexHtml).toContain("QCTP · local-first");
    expect(indexHtml).toContain("Opening your practice…");
    expect(indexHtml).toContain('class="qctp-recovery-primary" href="./"');
    expect(indexHtml).toContain(
      "Reloading does not clear local recordings, journal entries, workbook",
    );
  });
});
