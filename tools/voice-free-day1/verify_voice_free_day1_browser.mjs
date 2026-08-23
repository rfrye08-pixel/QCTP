#!/usr/bin/env node

import {
  createReadStream,
  existsSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import process from "node:process";

import { chromium, devices, webkit } from "@playwright/test";

const repo = resolve(process.argv[2] ?? process.cwd());
const dist = join(repo, "dist");
const output = join(
  repo,
  "QCTP_REV3_VOICE_FREE_DAY1_BROWSER_VERIFICATION_REV0_2026-08-22.json",
);
const manifest = JSON.parse(
  readFileSync(
    join(repo, "public/audio/day1-source-rev0/voice-free-manifest.json"),
    "utf8",
  ),
);

if (!existsSync(join(dist, "index.html")) || !existsSync(join(dist, "sw.js"))) {
  throw new Error("dist is missing; run the controlled Vite build first");
}

const mime = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mp3": "audio/mpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
  ".woff2": "font/woff2",
};

function serveFile(request, response, filePath) {
  const stats = statSync(filePath);
  const range = request.headers.range;
  response.setHeader(
    "Content-Type",
    mime[extname(filePath)] ?? "application/octet-stream",
  );
  response.setHeader("Accept-Ranges", "bytes");
  response.setHeader("Cache-Control", "no-store");
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match) {
      response.writeHead(416);
      response.end();
      return;
    }
    const start = match[1] ? Number(match[1]) : 0;
    const end = match[2]
      ? Math.min(Number(match[2]), stats.size - 1)
      : stats.size - 1;
    response.writeHead(206, {
      "Content-Range": `bytes ${start}-${end}/${stats.size}`,
      "Content-Length": end - start + 1,
    });
    createReadStream(filePath, { start, end }).pipe(response);
    return;
  }
  response.writeHead(200, { "Content-Length": stats.size });
  if (request.method === "HEAD") response.end();
  else createReadStream(filePath).pipe(response);
}

const server = createServer((request, response) => {
  const requestPath = decodeURIComponent(
    new URL(request.url, "http://localhost").pathname,
  );
  const relative =
    requestPath === "/" ? "index.html" : requestPath.replace(/^\/+/, "");
  const candidate = resolve(dist, normalize(relative));
  if (
    !candidate.startsWith(`${resolve(dist)}\\`) &&
    candidate !== resolve(dist, "index.html")
  ) {
    response.writeHead(403);
    response.end();
    return;
  }
  const filePath =
    existsSync(candidate) && statSync(candidate).isFile()
      ? candidate
      : join(dist, "index.html");
  serveFile(request, response, filePath);
});

await new Promise((resolveListen) =>
  server.listen(0, "127.0.0.1", resolveListen),
);
const address = server.address();
const baseUrl = `http://127.0.0.1:${address.port}`;

const routes = [
  { id: "chromium", browserType: chromium, context: devices["Desktop Chrome"] },
  { id: "iphone-webkit", browserType: webkit, context: devices["iPhone 13"] },
];
const results = [];

try {
  for (const route of routes) {
    const browser = await route.browserType.launch({ headless: true });
    const context = await browser.newContext(route.context);
    const page = await context.newPage();
    const requests = [];
    const failures = [];
    page.on("request", (request) => requests.push(request.url()));
    page.on("requestfailed", (request) =>
      failures.push({
        url: request.url(),
        error: request.failure()?.errorText ?? "unknown",
      }),
    );
    const checks = [];
    const check = (id, condition, evidence) => {
      checks.push({ id, result: condition ? "PASS" : "FAIL", evidence });
      if (!condition)
        throw new Error(`${route.id}:${id}:${JSON.stringify(evidence)}`);
    };

    try {
      await page.goto(`${baseUrl}/#/practice`, { waitUntil: "networkidle" });
      await page
        .getByRole("heading", { level: 1, name: "Voice-Free Day 1" })
        .waitFor();
      const phaseCount = await page
        .getByRole("list", { name: "Day 1 phase sequence" })
        .getByRole("listitem")
        .count();
      check("six_phase_mobile_ui", phaseCount === 6, { phaseCount });
      check(
        "twenty_five_minute_clock",
        (await page.getByTestId("practice-timer").textContent()) === "25:00",
        { timer: await page.getByTestId("practice-timer").textContent() },
      );

      await page.evaluate(async () => {
        await navigator.serviceWorker.ready;
        if (!navigator.serviceWorker.controller) {
          await new Promise((resolveController) =>
            navigator.serviceWorker.addEventListener(
              "controllerchange",
              resolveController,
              {
                once: true,
              },
            ),
          );
        }
      });
      if (
        !(await page.evaluate(() =>
          Boolean(navigator.serviceWorker.controller),
        ))
      ) {
        await page.reload({ waitUntil: "networkidle" });
      }

      const cacheEvidence = await page.evaluate(async () => {
        const names = await caches.keys();
        const urls = [];
        for (const name of names) {
          const cache = await caches.open(name);
          urls.push(
            ...(await cache.keys()).map(
              (request) => new URL(request.url).pathname,
            ),
          );
        }
        return { names, urls: [...new Set(urls)].sort() };
      });
      const requiredCachePaths = [
        "/audio/day1-source-rev0/voice-free-manifest.json",
        ...manifest.assets.map(
          (asset) => `/audio/day1-source-rev0/${asset.path}`,
        ),
      ];
      check(
        "service_worker_precaches_support_package",
        requiredCachePaths.every((path) => cacheEvidence.urls.includes(path)),
        { cacheNames: cacheEvidence.names, requiredCachePaths },
      );
      check(
        "service_worker_excludes_rejected_a03r",
        !cacheEvidence.urls.some(
          (path) =>
            path.includes("a03-acceptance") ||
            path.endsWith("/voice-1500.mp3") ||
            path.endsWith("/composite-ambient-low-1500.mp3") ||
            path.endsWith("/audio/day1-source-rev0/manifest.json"),
        ),
        {
          rejectedMatches: cacheEvidence.urls.filter((path) =>
            path.includes("a03"),
          ),
        },
      );

      await context.setOffline(true);
      // Playwright WebKit on Windows currently throws an internal navigation
      // error for context-offline reloads even when its Service Worker cache is
      // populated. Chromium performs the full cold reload; iPhone WebKit proves
      // offline retrieval from the active PWA client and the populated cache.
      if (route.id === "chromium") {
        await page.reload({ waitUntil: "domcontentloaded" });
        await page
          .getByRole("heading", { level: 1, name: "Voice-Free Day 1" })
          .waitFor();
      }
      const offlineFetch = await page.evaluate(async (runtimeFetch) => {
        const path = "audio/day1-source-rev0/voice-free-manifest.json";
        const absolute = `${location.origin}/${path}`;
        const response = runtimeFetch
          ? await fetch(path)
          : await caches.match(absolute, { ignoreSearch: true });
        if (!response)
          return {
            ok: false,
            schema: null,
            assetCount: 0,
            route: "cache-miss",
          };
        const body = await response.json();
        return {
          ok: response.ok,
          schema: body.schema,
          assetCount: body.assets.length,
          route: runtimeFetch ? "service-worker-fetch" : "cache-api",
        };
      }, route.id === "chromium");
      check(
        route.id === "chromium"
          ? "offline_reload_and_service_worker_manifest_retrieval"
          : "offline_cache_api_manifest_retrieval_windows_harness",
        offlineFetch.ok &&
          offlineFetch.schema === "qctp-rev3-voice-free-day1-media-v1" &&
          offlineFetch.assetCount === 3,
        offlineFetch,
      );
      const offlineSupportMatches = await page.evaluate(
        async (paths) => {
          const matches = [];
          for (const path of paths) {
            const absolute = `${location.origin}/${path.replace(/^\/+/, "")}`;
            const response = await caches.match(absolute, {
              ignoreSearch: true,
            });
            matches.push({
              path,
              cached: Boolean(response),
              size: response
                ? Number(response.headers.get("content-length")) ||
                  (await response.clone().arrayBuffer()).byteLength
                : null,
            });
          }
          return matches;
        },
        manifest.assets.map((asset) => `audio/day1-source-rev0/${asset.path}`),
      );
      check(
        "offline_support_binary_retrieval",
        offlineSupportMatches.every(
          (record) => record.cached && record.size === 12_000_576,
        ),
        offlineSupportMatches,
      );
      await context.setOffline(false);

      const externalRequests = requests.filter(
        (url) => !url.startsWith(baseUrl),
      );
      const rejectedRequests = requests.filter(
        (url) =>
          url.includes("a03-acceptance") ||
          url.includes("voice-1500.mp3") ||
          url.includes("composite-ambient-low-1500.mp3") ||
          url.includes("resource2.heygen.ai"),
      );
      check("same_origin_only", externalRequests.length === 0, {
        externalRequests,
      });
      check("no_rejected_narration_requests", rejectedRequests.length === 0, {
        rejectedRequests,
      });
      const unexpectedFailures = failures.filter(
        (failure) =>
          !failure.error.includes("ERR_INTERNET_DISCONNECTED") &&
          !failure.error.includes("ERR_ABORTED"),
      );
      check("no_unexpected_request_failures", unexpectedFailures.length === 0, {
        unexpectedFailures,
      });
      results.push({
        route: route.id,
        result: "PASS",
        checks,
        request_count: requests.length,
        cache_entry_count: cacheEvidence.urls.length,
      });
    } catch (error) {
      results.push({
        route: route.id,
        result: "FAIL",
        error: error instanceof Error ? error.message : String(error),
        checks,
        failures,
      });
    } finally {
      await context.close();
      await browser.close();
    }
  }
} finally {
  await new Promise((resolveClose) => server.close(resolveClose));
}

const passed = results.every((result) => result.result === "PASS");
const report = {
  schema: "qctp-rev3-voice-free-day1-browser-verification-v1",
  verified_at: new Date().toISOString(),
  result: passed ? "PASS" : "FAIL",
  status: passed
    ? "BROWSER_MACHINE_PASS_WEBKIT_COLD_OFFLINE_PHYSICAL_HOLD_OPEN"
    : "BROWSER_GATE_FAILED",
  release_authority: "ZERO_RELEASE",
  package_id: manifest.package_id,
  routes: results,
  physical_gate: {
    voice_free_morning_mode: "OPEN",
    iphone_webkit_cold_offline_launch: "OPEN_PHYSICAL_DEVICE",
    windows_webkit_harness_limitation:
      "Context-offline navigation is aborted before service-worker handling; performed Cache API retrieval is not labeled a cold reload.",
    browser_automation_substitutes_for_physical_use: false,
  },
};
writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(
  JSON.stringify(
    {
      result: report.result,
      output,
      routes: results.map((route) => ({
        route: route.route,
        result: route.result,
      })),
    },
    null,
    2,
  ),
);
process.exitCode = passed ? 0 : 1;
