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
      relativePath: `cue-${String(at).padStart(4, "0")}.wav`,
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
    { id: "preview", sourceUrl: preview, relativePath: "preview.wav" },
    { id: "lesson", sourceUrl: lesson, relativePath: "lesson.wav" },
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

async function verifyExistingPack(entries) {
  if (refresh || !(await fileExists(manifestPath))) return false;

  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch {
    return false;
  }

  if (manifest?.schema !== "qctp-day1-local-audio-pack-v1") return false;
  if (!Array.isArray(manifest.files) || manifest.files.length !== entries.length) {
    return false;
  }

  for (const expected of entries) {
    const record = manifest.files.find((item) => item.id === expected.id);
    if (
      !record ||
      record.sourceUrl !== expected.sourceUrl ||
      record.relativePath !== expected.relativePath
    ) {
      return false;
    }
    const path = join(outputRoot, expected.relativePath);
    if (!(await fileExists(path))) return false;
    const body = await readFile(path);
    if (body.length !== record.bytes || sha256(body) !== record.sha256) {
      return false;
    }
  }

  console.log(
    `Verified existing local Day 1 audio pack: ${entries.length} files, ${manifest.totalBytes} bytes.`,
  );
  return true;
}

function assertAudioResponse({ response, body, sourceUrl }) {
  const contentType = response.headers.get("content-type") ?? "";
  const first12 = body.subarray(0, 12);
  const first12Hex = first12.toString("hex");
  const isRiffWave =
    first12.subarray(0, 4).toString("ascii") === "RIFF" &&
    first12.subarray(8, 12).toString("ascii") === "WAVE";
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
  if (!isRiffWave && !contentType.startsWith("audio/")) {
    throw new Error(
      `Unrecognized audio response for ${sourceUrl}: content-type=${contentType || "unknown"}, first12=${first12Hex}.`,
    );
  }

  return { contentType, first12Hex, isRiffWave };
}

async function download(entry) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(entry.sourceUrl, {
        redirect: "follow",
        headers: {
          accept: "audio/wav,audio/*;q=0.9,*/*;q=0.5",
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 QCTP-Audio-Pack/1.0",
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

  await mkdir(outputRoot, { recursive: true });
  const stagingRoot = join(outputRoot, `.staging-${process.pid}`);
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
        bytes: body.length,
        sha256: sha256(body),
        contentType: inspection.contentType,
        first12Hex: inspection.first12Hex,
        riffWave: inspection.isRiffWave,
      };
      files.push(record);
      console.log(`${body.length} bytes, sha256=${record.sha256.slice(0, 12)}…`);
    }

    for (const record of files) {
      const destination = join(outputRoot, record.relativePath);
      await rm(destination, { force: true });
      await rename(join(stagingRoot, record.relativePath), destination);
    }

    const manifest = {
      schema: "qctp-day1-local-audio-pack-v1",
      generatedAt: new Date().toISOString(),
      source: "protected Chill Brian Rev1.1.4 remote references",
      fileCount: files.length,
      totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
      files,
    };
    await writeFile(
      manifestPath,
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8",
    );
    console.log(
      `Created local Day 1 audio pack: ${manifest.fileCount} files, ${manifest.totalBytes} bytes.`,
    );
  } finally {
    await rm(stagingRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
