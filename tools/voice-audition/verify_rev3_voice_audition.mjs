#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { chromium, webkit, devices } from "@playwright/test";

const baseUrl = process.env.QCTP_VOICE_AUDITION_URL || "http://127.0.0.1:4182/";
const outputPath =
  process.env.QCTP_VOICE_AUDITION_BROWSER_RECORD ||
  "public/voice-audition/browser-verification.json";
const cases = [
  ["chromium-desktop", chromium, {}],
  ["webkit-iphone", webkit, { ...devices["iPhone 14"] }],
];
const results = {};
let packageHashes = null;

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function assertPublicManifestIsBlind(manifest, name) {
  const forbiddenSampleFields = [
    "route_id",
    "engine_family",
    "engine_version",
    "model_id",
    "model_revision",
    "voice",
    "model_files",
    "segments",
  ];
  for (const sample of manifest.samples || []) {
    const exposed = forbiddenSampleFields.filter((field) => field in sample);
    if (exposed.length) {
      throw new Error(
        `${name}: public sample ${sample.sample_code} exposes private fields: ${exposed.join(", ")}`,
      );
    }
  }
  if (
    Object.keys(manifest.randomization || {}).some((key) =>
      key.toLowerCase().includes("seed"),
    )
  ) {
    throw new Error(`${name}: public manifest exposes blind-seed material`);
  }
}

for (const [name, browserType, contextOptions] of cases) {
  const browser = await browserType.launch({ headless: true });
  try {
    const context = await browser.newContext(contextOptions);
    const page = await context.newPage();
    const consoleErrors = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    await page.goto(baseUrl, { waitUntil: "networkidle" });
    const body = await page.textContent("body");
    for (const marker of [
      "VOICE TEST ONLY",
      "NOT A MEDITATION",
      "NO COMPLETION CREDIT",
      "Opening",
      "Five in / five out",
      "Spatial attention",
      "Complete return",
      "A, B, C, or NONE",
    ]) {
      if (!body.includes(marker))
        throw new Error(`${name}: page marker missing: ${marker}`);
    }
    for (const forbidden of [
      "Piper",
      "Kokoro",
      "KittenTTS",
      "Chatterbox",
      "Chill Brian",
      "HeyGen",
    ]) {
      if (body.includes(forbidden))
        throw new Error(
          `${name}: identity exposed before selection: ${forbidden}`,
        );
    }
    const privateRoute = await page.request.get(
      new URL("route-reveal.json", baseUrl).toString(),
    );
    if (privateRoute.ok())
      throw new Error(
        `${name}: private route assignment is publicly fetchable`,
      );

    const returnHref = await page
      .getByRole("link", { name: "Return to QCTP" })
      .getAttribute("href");
    const returnTarget = new URL(returnHref, baseUrl);
    const expectedReturnTarget = new URL("../", baseUrl);
    if (
      returnHref !== "../" ||
      returnTarget.origin !== new URL(baseUrl).origin ||
      returnTarget.href !== expectedReturnTarget.href
    ) {
      throw new Error(
        `${name}: return link is not the same-origin QCTP parent (${returnHref})`,
      );
    }

    for (const file of [
      "sample-a.mp3",
      "sample-b.mp3",
      "sample-c.mp3",
      "manifest.json",
      "audition-script.json",
      "cue-grounding.json",
      "sw.js",
      "manifest.webmanifest",
    ]) {
      const response = await page.request.get(
        new URL(file, baseUrl).toString(),
      );
      if (!response.ok())
        throw new Error(`${name}: ${file} HTTP ${response.status()}`);
    }
    const manifestResponse = await page.request.get(
      new URL("manifest.json", baseUrl).toString(),
    );
    const manifestBytes = await manifestResponse.body();
    const manifest = JSON.parse(manifestBytes.toString("utf8"));
    assertPublicManifestIsBlind(manifest, name);
    const buildRecordResponse = await page.request.get(
      new URL("build-record.json", baseUrl).toString(),
    );
    if (!buildRecordResponse.ok())
      throw new Error(
        `${name}: build-record.json HTTP ${buildRecordResponse.status()}`,
      );
    const buildRecordBytes = await buildRecordResponse.body();
    const currentHashes = {
      manifest_sha256: sha256(manifestBytes),
      build_record_sha256: sha256(buildRecordBytes),
    };
    if (
      packageHashes &&
      JSON.stringify(packageHashes) !== JSON.stringify(currentHashes)
    ) {
      throw new Error(`${name}: public package changed between browser cases`);
    }
    packageHashes = currentHashes;
    const canPlayMp3 = await page.evaluate(() =>
      document.createElement("audio").canPlayType("audio/mpeg"),
    );
    if (!canPlayMp3)
      throw new Error(`${name}: browser does not report MP3 playback support`);
    await page.getByRole("button", { name: "Play Sample B" }).click();
    const source = await page.locator("#player").getAttribute("src");
    if (source !== "sample-b.mp3")
      throw new Error(`${name}: Sample B source was not wired relatively`);
    await page.getByRole("button", { name: "B", exact: true }).click();
    await page.getByRole("button", { name: "Confirm physical choice" }).click();
    await page.getByText("Saved physical choice: B").waitFor();
    const afterSelection = await page.textContent("body");
    for (const identity of ["Piper", "Kokoro", "KittenTTS"]) {
      if (afterSelection.includes(identity))
        throw new Error(
          `${name}: identity exposed after local choice but before controlled reporting: ${identity}`,
        );
    }
    const localSelection = await page.evaluate(() =>
      localStorage.getItem("qctp.rev3.voiceAuditionSelection.v1"),
    );
    if (!localSelection || JSON.parse(localSelection).choice !== "B")
      throw new Error(`${name}: choice not stored locally`);
    await page.reload({ waitUntil: "networkidle" });
    await page.getByText("Saved physical choice: B").waitFor();
    const persistedSelection = await page.evaluate(() =>
      localStorage.getItem("qctp.rev3.voiceAuditionSelection.v1"),
    );
    if (!persistedSelection || JSON.parse(persistedSelection).choice !== "B")
      throw new Error(`${name}: choice did not survive a full page reload`);
    const afterReload = await page.textContent("body");
    for (const identity of ["Piper", "Kokoro", "KittenTTS"]) {
      if (afterReload.includes(identity))
        throw new Error(
          `${name}: identity exposed after persisted choice reload: ${identity}`,
        );
    }
    if (consoleErrors.length)
      throw new Error(`${name}: console errors: ${consoleErrors.join(" | ")}`);
    results[name] = {
      result: "PASS",
      mp3_support: canPlayMp3,
      relative_source: source,
      pre_selection_identity_hidden: true,
      blind_mapping_preserved_after_selection: true,
      public_route_assignment_absent: true,
      local_selection_persisted: true,
      local_selection_persisted_after_reload: true,
      same_origin_qctp_return: returnTarget.href,
    };
  } finally {
    await browser.close();
  }
}

// Chromium additionally proves the package reloads with networking disabled after
// service-worker installation. WebKit's UI/codec path is covered above.
const browser = await chromium.launch({ headless: true });
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  const parentUrl = new URL("../", baseUrl).toString();
  await page.goto(parentUrl, { waitUntil: "domcontentloaded" });
  const normalCacheNames = [
    "workbox-precache-v2-qctp-normal-app-integrity",
    "workbox-runtime-qctp-normal-app-integrity",
  ];
  const staleAuditionCache = "qctp-rev3-voice-audition-stale-integrity";
  await page.evaluate(
    async ({ normalCacheNames, staleAuditionCache }) => {
      await Promise.all(
        [...normalCacheNames, staleAuditionCache].map((name) =>
          caches.open(name),
        ),
      );
    },
    { normalCacheNames, staleAuditionCache },
  );
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(async () => {
    const cache = await caches.open("qctp-rev3-voice-audition-v2");
    return Boolean(await cache.match("sample-a.mp3"));
  });
  await page.waitForFunction(
    async ({ normalCacheNames, staleAuditionCache }) => {
      const names = await caches.keys();
      return (
        normalCacheNames.every((name) => names.includes(name)) &&
        !names.includes(staleAuditionCache)
      );
    },
    { normalCacheNames, staleAuditionCache },
  );
  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  const offlineMedia = await page.evaluate(async () => {
    const response = await fetch("sample-c.mp3", { cache: "no-store" });
    return {
      ok: response.ok,
      status: response.status,
      bytes: (await response.arrayBuffer()).byteLength,
    };
  });
  if (!offlineMedia.ok || offlineMedia.bytes === 0) {
    throw new Error(
      `chromium-offline: sample-c.mp3 unavailable (${offlineMedia.status}, ${offlineMedia.bytes} bytes)`,
    );
  }
  const offlineGrounding = await page.evaluate(async () => {
    const response = await fetch("cue-grounding.json", { cache: "no-store" });
    const body = await response.json();
    return { ok: response.ok, status: response.status, result: body.result };
  });
  if (!offlineGrounding.ok || offlineGrounding.result !== "PASS") {
    throw new Error(
      `chromium-offline: cue grounding unavailable (${offlineGrounding.status}, ${offlineGrounding.result})`,
    );
  }
  results["chromium-offline"] = {
    result: "PASS",
    service_worker_cached_media: true,
    service_worker_cached_grounding: true,
    normal_workbox_caches_preserved: true,
    stale_audition_cache_removed: true,
  };
} finally {
  await browser.close();
}

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(
  outputPath,
  `${JSON.stringify(
    {
      schema: "qctp-rev3-blind-natural-voice-browser-verification-v1",
      result: "PASS",
      base_url: baseUrl,
      ...packageHashes,
      public_route_assignment_absent: true,
      cases: results,
      naturalness_gate: "OPEN_PHYSICAL_RYAN_SELECTION",
      release_authority: "ZERO_RELEASE",
    },
    null,
    2,
  )}\n`,
);
console.log(JSON.stringify(results, null, 2));
