import { createHash } from "node:crypto";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import process from "node:process";

const repoRoot = resolve(import.meta.dirname, "..");
const sourcePath = join(repoRoot, "src", "foundation", "day1.ts");
const outputRoot = join(repoRoot, "public", "audio", "day1");
const manifestPath = join(outputRoot, "manifest.json");
const refresh = process.argv.includes("--refresh");

const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");
const cueFileName = (at) => `cue-${String(at).padStart(4, "0")}.mp3`;

function parseSources(source) {
  const cueBlock = source.match(
    /export const CHILL_BRIAN_CUE_URLS = Object\.freeze\(\{([\s\S]*?)\}\s+as const\);/,
  );
  if (!cueBlock?.[1]) {
    throw new Error("Could not locate CHILL_BRIAN_CUE_URLS in day1.ts.");
  }

  const cues = [];
  const cuePattern = /^\s*(\d+):\s*"([^"]+)",?\s*$/gm;
  for (const match of cueBlock[1].matchAll(cuePattern)) {
    const at = Number(match[1]);
    const sourceUrl = match[2];
    if (!Number.isFinite(at) || !sourceUrl) continue;
    cues.push({
      id: `cue-${String(at).padStart(4, "0")}`,
      at,
      sourceUrl,
      relativePath: cueFileName(at),
    });
  }

  const preview = source.match(
    /preview:\s*\n?\s*"(https:\/\/resource2\.heygen\.ai\/[^"]+\.wav)"/,
  )?.[1];
  const lesson = source.match(
    /lesson:\s*\n?\s*"(https:\/\/resource2\.heygen\.ai\/[^"]+\.wav)"/,
  )?.[1];

  if (cues.length !== 21 || !preview || !lesson) {
    throw new Error(
      `Expected 21 cues plus preview and lesson; found cues=${cues.length}, preview=${Boolean(preview)}, lesson=${Boolean(lesson)}.`,
    );
  }

  return [
    { id: "preview", sourceUrl: preview, relativePath: "preview.mp3" },
    { id: "lesson", sourceUrl: lesson, relativePath: "lesson.mp3" },
    ...cues.sort((left, right) => left.at - right.at),
  ];
}

async function fileExists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function isMp3(body) {
  if (body.subarray(0, 3).toString("ascii") === "ID3") return true;
  if (body.length < 2) return false;
  return body[0] === 0xff && (body[1] & 0xe0) === 0xe0;
}

async function verifyExistingPack(entries) {
  if (refresh || !(await fileExists(manifestPath))) return false;

  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch {
    return false;
  }

  if (manifest?.schema !== "qctp-day1-local-audio-pack-v2") return false;
  if (!Array.isArray(manifest.files) || manifest.files.length !== entries.length) {
    return false;
  }

  for (const expected of entries) {
    const record = manifest.files.find((item) => item.id === expected.id);
    if (
      !record ||
      record.sourceUrl !== expected.sourceUrl ||
      record.relativePath !== expected.relativePath ||
      record.mediaType !== "audio/mpeg"
    ) {
      return false;
    }
    const path = join(outputRoot, expected.relativePath);
    if (!(await fileExists(path))) return false;
    const body = await readFile(path);
    if (
      body.length !== record.bytes ||
      sha256(body) !== record.sha256 ||
      !isMp3(body)
    ) {
      return false;
    }
  }

  console.log(
    `Verified existing local Day 1 audio pack: ${entries.length} MP3 files, ${manifest.totalBytes} bytes.`,
  );
  return true;
}

function assertAudioResponse({ response, body, sourceUrl }) {
  const contentType = response.headers.get("content-type") ?? "";
  const first12Hex = body.subarray(0, 12).toString("hex");
  const bodyStart = body.subarray(0, 80).toString("utf8").trim().toLowerCase();
  const looksLikeMarkup =
    bodyStart.startsWith("<") ||
    bodyStart.startsWith("{") ||
    bodyStart.startsWith("[");

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} while downloading ${sourceUrl}.`);
  }
  if (body.length < 512) {
    throw new Error(
      `Audio response was too small (${body.length} bytes) for ${sourceUrl}.`,
    );
  }
  if (looksLikeMarkup || contentType.startsWith("text/") || contentType.includes("json")) {
    throw new Error(
      `Non-audio response for ${sourceUrl}: content-type=${contentType || "unknown"}, first12=${first12Hex}.`,
    );
  }
  if (!isMp3(body)) {
    throw new Error(
      `Protected Chill Brian asset is not MP3 data: ${sourceUrl}; content-type=${contentType || "unknown"}; first12=${first12Hex}.`,
    );
  }

  return { contentType, first12Hex };
}

async function download(entry) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(entry.sourceUrl, {
        redirect: "follow",
        headers: {
          accept: "audio/mpeg,audio/*;q=0.9,*/*;q=0.5",
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 QCTP-Audio-Pack/2.0",
        },
      });
      const body = Buffer.from(await response.arrayBuffer());
      const inspection = assertAudioResponse({
        response,
        body,
        sourceUrl: entry.sourceUrl,
      });
      return { body, inspection };
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await new Promise((resolveDelay) =>
          setTimeout(resolveDelay, attempt * 1_000),
        );
      }
    }
  }
  throw lastError;
}

async function main() {
  const source = await readFile(sourcePath, "utf8");
  const entries = parseSources(source);
  if (await verifyExistingPack(entries)) return;

  const audioParent = dirname(outputRoot);
  await mkdir(audioParent, { recursive: true });
  const stagingRoot = join(audioParent, `.day1-staging-${process.pid}`);
  await rm(stagingRoot, { recursive: true, force: true });
  await mkdir(stagingRoot, { recursive: true });

  const files = [];
  try {
    for (const [index, entry] of entries.entries()) {
      process.stdout.write(
        `Downloading Day 1 audio ${index + 1}/${entries.length}: ${entry.id} ... `,
      );
      const { body, inspection } = await download(entry);
      const stagedPath = join(stagingRoot, entry.relativePath);
      await mkdir(dirname(stagedPath), { recursive: true });
      await writeFile(stagedPath, body);
      const record = {
        id: entry.id,
        ...(entry.at === undefined ? {} : { at: entry.at }),
        relativePath: entry.relativePath,
        runtimeUrl: `/audio/day1/${entry.relativePath}`,
        sourceUrl: entry.sourceUrl,
        mediaType: "audio/mpeg",
        bytes: body.length,
        sha256: sha256(body),
        sourceContentType: inspection.contentType,
        first12Hex: inspection.first12Hex,
      };
      files.push(record);
      console.log(`${body.length} bytes, sha256=${record.sha256.slice(0, 12)}…`);
    }

    const manifest = {
      schema: "qctp-day1-local-audio-pack-v2",
      generatedAt: new Date().toISOString(),
      source: "protected Chill Brian Rev1.1.4 remote references",
      fileCount: files.length,
      totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
      mediaType: "audio/mpeg",
      files,
    };
    await writeFile(
      join(stagingRoot, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    );

    await rm(outputRoot, { recursive: true, force: true });
    await rename(stagingRoot, outputRoot);
    console.log(
      `Created local Day 1 audio pack: ${manifest.fileCount} MP3 files, ${manifest.totalBytes} bytes.`,
    );
  } finally {
    await rm(stagingRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
