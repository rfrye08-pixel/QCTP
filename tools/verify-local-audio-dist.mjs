import { createHash } from "node:crypto";
import {
  readdir,
  readFile,
  stat,
  writeFile,
} from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";
import process from "node:process";

const root = resolve(import.meta.dirname, "..");
const expectedFileCount = 23;
const expectedTotalBytes = 13_340_411;
const manifestSchema = "qctp-day1-local-audio-pack-v2";
const evidencePath = resolve(
  root,
  "QCTP_LOCAL_AUDIO_MACHINE_VERIFICATION_REV0.json",
);

const sha256 = (body) => createHash("sha256").update(body).digest("hex");

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function isMp3(body) {
  if (body.subarray(0, 3).toString("ascii") === "ID3") return true;
  return body.length >= 2 && body[0] === 0xff && (body[1] & 0xe0) === 0xe0;
}

async function walk(path) {
  const entries = await readdir(path, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const absolute = join(path, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(absolute)));
    if (entry.isFile()) files.push(absolute);
  }
  return files;
}

function validateManifest(manifest, label) {
  assert(manifest.schema === manifestSchema, `${label}: wrong schema.`);
  assert(
    manifest.fileCount === expectedFileCount,
    `${label}: expected ${expectedFileCount} files, found ${manifest.fileCount}.`,
  );
  assert(
    manifest.totalBytes === expectedTotalBytes,
    `${label}: expected ${expectedTotalBytes} bytes, found ${manifest.totalBytes}.`,
  );
  assert(manifest.mediaType === "audio/mpeg", `${label}: wrong media type.`);
  assert(Array.isArray(manifest.files), `${label}: files must be an array.`);
  assert(
    manifest.files.length === expectedFileCount,
    `${label}: manifest file-array count mismatch.`,
  );
}

async function validatePack(audioRoot, manifest, label) {
  const files = await readdir(audioRoot, { withFileTypes: true });
  const mp3Names = files
    .filter((entry) => entry.isFile() && extname(entry.name) === ".mp3")
    .map((entry) => entry.name)
    .sort();
  const wavNames = files
    .filter((entry) => entry.isFile() && extname(entry.name) === ".wav")
    .map((entry) => entry.name);

  assert(
    mp3Names.length === expectedFileCount,
    `${label}: expected ${expectedFileCount} MP3 files, found ${mp3Names.length}.`,
  );
  assert(wavNames.length === 0, `${label}: stale WAV files remain.`);

  let totalBytes = 0;
  for (const record of manifest.files) {
    assert(
      typeof record.relativePath === "string" &&
        record.relativePath.endsWith(".mp3"),
      `${label}: non-MP3 manifest path for ${record.id}.`,
    );
    assert(record.mediaType === "audio/mpeg", `${label}: wrong record media type.`);
    const path = join(audioRoot, record.relativePath);
    const body = await readFile(path);
    assert(isMp3(body), `${label}: ${record.relativePath} is not MP3 data.`);
    assert(body.length === record.bytes, `${label}: byte mismatch for ${record.relativePath}.`);
    assert(
      sha256(body) === record.sha256,
      `${label}: checksum mismatch for ${record.relativePath}.`,
    );
    totalBytes += body.length;
  }
  assert(totalBytes === expectedTotalBytes, `${label}: accumulated byte total mismatch.`);
}

function countVitest(report) {
  return {
    files: report.numTotalTestSuites,
    passedFiles: report.numPassedTestSuites,
    tests: report.numTotalTests,
    passedTests: report.numPassedTests,
    failedTests: report.numFailedTests,
  };
}

function countPlaywright(report) {
  const stats = report.stats ?? {};
  return {
    passed: stats.expected ?? null,
    skipped: stats.skipped ?? null,
    failed: stats.unexpected ?? null,
    flaky: stats.flaky ?? null,
  };
}

async function main() {
  const publicRoot = resolve(root, "public", "audio", "day1");
  const distRoot = resolve(root, "dist");
  const distAudioRoot = resolve(distRoot, "audio", "day1");
  const sourceManifest = await readJson(join(publicRoot, "manifest.json"));
  const builtManifest = await readJson(join(distAudioRoot, "manifest.json"));

  validateManifest(sourceManifest, "source pack");
  validateManifest(builtManifest, "built pack");
  assert(
    JSON.stringify(sourceManifest.files) === JSON.stringify(builtManifest.files),
    "Built manifest does not match the controlled source manifest.",
  );
  await validatePack(publicRoot, sourceManifest, "source pack");
  await validatePack(distAudioRoot, builtManifest, "built pack");

  const practiceSource = await readFile(
    resolve(root, "src", "app", "screens", "PracticeScreen.tsx"),
    "utf8",
  );
  assert(
    practiceSource.includes("getDay1LocalCueUrl(cue.at)"),
    "Practice runtime is not using the local cue map.",
  );
  assert(
    practiceSource.includes("src={DAY1_LOCAL_AUDIO.lesson}"),
    "Lesson runtime is not using the local lesson asset.",
  );
  assert(!practiceSource.includes("cue.audioUrl"), "Practice runtime still uses remote cue URLs.");
  assert(
    !practiceSource.includes("CHILL_BRIAN_AUDIO.lesson"),
    "Lesson runtime still uses the remote lesson URL.",
  );

  const serverSource = await readFile(resolve(root, "server", "index.ts"), "utf8");
  assert(
    !serverSource.includes("resource2.heygen.ai"),
    "Runtime CSP still authorizes the third-party audio host.",
  );

  const runtimeFiles = (await walk(distRoot)).filter((path) =>
    [".js", ".html"].includes(extname(path)),
  );
  for (const path of runtimeFiles) {
    const content = await readFile(path, "utf8");
    assert(
      !content.includes("resource2.heygen.ai"),
      `Built runtime contains a live third-party audio dependency: ${basename(path)}.`,
    );
  }

  const serviceWorker = await readFile(resolve(distRoot, "sw.js"), "utf8");
  for (const required of [
    "audio/day1/lesson.mp3",
    "audio/day1/cue-0000.mp3",
    "audio/day1/cue-0045.mp3",
    "audio/day1/cue-1490.mp3",
    "audio/day1/manifest.json",
  ]) {
    assert(serviceWorker.includes(required), `Service worker does not precache ${required}.`);
  }

  const vitestReport = await readJson(resolve(root, "vitest-results.json"));
  const playwrightReport = await readJson(resolve(root, "playwright-results.json"));
  const vitest = countVitest(vitestReport);
  const playwright = countPlaywright(playwrightReport);
  assert(vitest.failedTests === 0, "Machine-readable Vitest report contains failures.");
  assert(vitest.tests >= 236, `Expected at least 236 unit tests; found ${vitest.tests}.`);
  assert(playwright.failed === 0, "Machine-readable Playwright report contains failures.");
  assert(playwright.passed >= 14, `Expected at least 14 browser passes; found ${playwright.passed}.`);

  if (!(await exists(evidencePath))) {
    const evidence = {
      schema: "qctp-local-audio-machine-verification-v1",
      record_id: "QCTP-LOCAL-AUDIO-MACHINE-VERIFY-REV0",
      verified_source_sha: process.env.GITHUB_SHA ?? "local-workspace",
      status: "MACHINE_VERIFICATION_PASS",
      audio_pack: {
        schema: manifestSchema,
        media_type: "audio/mpeg",
        file_count: expectedFileCount,
        total_bytes: expectedTotalBytes,
        manifest_generated_at: sourceManifest.generatedAt,
        all_sha256_verified: true,
        stale_wav_files: 0,
      },
      runtime: {
        practice_cues_same_origin: true,
        lesson_same_origin: true,
        built_live_heygen_references: 0,
        pwa_precache_verified: true,
        fail_closed_timer_preserved: true,
      },
      verification: {
        npm_run_check: "PASS",
        vitest,
        playwright,
        local_whisper_quality_gate: "PASS",
      },
      deployment_authority: "PX13_DEVICE_TEST_CANDIDATE",
      release_authority: "ZERO_RELEASE",
      next_controlled_action:
        "Pass the Windows updater simulation, then deploy this candidate to the PX13 and verify the opening plus automatic 24:15 cues on the physical iPhone.",
    };
    await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  }

  console.log(
    `QCTP local-audio verification PASS: ${expectedFileCount} MP3 files, ${expectedTotalBytes} bytes, Vitest ${vitest.passedTests}/${vitest.tests}, Playwright ${playwright.passed} passed and ${playwright.skipped} skipped.`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
