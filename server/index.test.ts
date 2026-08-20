import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import express from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { mountPreviewPwa } from "./index";

let distributionDirectory: string;

beforeEach(async () => {
  distributionDirectory = await mkdtemp(join(tmpdir(), "qctp-pwa-"));
  await mkdir(join(distributionDirectory, "audio", "day1"), {
    recursive: true,
  });
  await writeFile(
    join(distributionDirectory, "index.html"),
    "<!doctype html><title>QCTP test</title>",
  );
  await writeFile(
    join(distributionDirectory, "audio", "day1", "cue-0000.mp3"),
    Buffer.from([0xff, 0xfb, 0xd0, 0xc4, 0x00, 0x03, 0xc0, 0x00]),
  );
});

afterEach(async () => {
  await rm(distributionDirectory, { recursive: true, force: true });
});

describe("private PWA gateway", () => {
  it("blocks live third-party media and permits same-origin media", async () => {
    const app = express();
    mountPreviewPwa(app, distributionDirectory);

    const response = await request(app).get("/").expect(200);
    const policy = String(response.headers["content-security-policy"] ?? "");

    expect(policy).toContain("connect-src 'self'");
    expect(policy).toContain("media-src 'self' blob:");
    expect(policy).not.toContain("resource2.heygen.ai");
  });

  it("serves packaged MP3 cues with the correct media type", async () => {
    const app = express();
    mountPreviewPwa(app, distributionDirectory);

    const response = await request(app)
      .get("/audio/day1/cue-0000.mp3")
      .expect(200);

    expect(response.headers["content-type"]).toMatch(/^audio\/mpeg/);
    expect(response.body).toEqual(
      Buffer.from([0xff, 0xfb, 0xd0, 0xc4, 0x00, 0x03, 0xc0, 0x00]),
    );
  });
});
