import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { access, readFile, stat } from "node:fs/promises";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { extname, resolve, sep } from "node:path";

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".mp3", "audio/mpeg"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
  [".woff2", "font/woff2"],
]);

interface CandidateMarker {
  readonly schema: "qctp-pwa-upgrade-candidate-v1";
  readonly candidateSha: string;
  readonly releaseAuthority: "ZERO_RELEASE";
}

export interface CandidateBuild {
  readonly candidateSha: string;
  readonly applicationAssetSha256: string;
  readonly markerRevision: string;
  readonly root: string;
  readonly serviceWorkerSha256: string;
}

function digest(algorithm: "md5" | "sha256", content: string): string {
  return createHash(algorithm).update(content).digest("hex");
}

export async function buildPwaCandidate(
  repositoryRoot: string,
  outputRoot: string,
  candidateSha: string,
): Promise<CandidateBuild> {
  assert.match(candidateSha, /^[a-f0-9]{40}$/u);
  const viteCli = resolve(repositoryRoot, "node_modules/vite/bin/vite.js");
  await access(viteCli);

  const output = await new Promise<string>((resolveProcess, rejectProcess) => {
    const child = spawn(process.execPath, [viteCli, "build"], {
      cwd: repositoryRoot,
      env: {
        ...process.env,
        QCTP_BUILD_CANDIDATE_SHA: candidateSha,
        QCTP_PWA_TEST_CANDIDATE: candidateSha,
        QCTP_PWA_TEST_OUT_DIR: outputRoot,
      },
      windowsHide: true,
    });
    let combined = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      combined += chunk;
    });
    child.stderr.on("data", (chunk) => {
      combined += chunk;
    });
    child.once("error", rejectProcess);
    child.once("close", (code) => {
      if (code === 0) {
        resolveProcess(combined);
        return;
      }
      rejectProcess(
        new Error(
          `VitePWA candidate ${candidateSha} failed with exit ${String(code)}.\n${combined}`,
        ),
      );
    });
  });

  const markerText = await readFile(
    resolve(outputRoot, "qctp-pwa-candidate.json"),
    "utf8",
  );
  const marker = JSON.parse(markerText) as CandidateMarker;
  assert.deepEqual(marker, {
    schema: "qctp-pwa-upgrade-candidate-v1",
    candidateSha,
    releaseAuthority: "ZERO_RELEASE",
  });
  const indexHtml = await readFile(resolve(outputRoot, "index.html"), "utf8");
  assert.match(
    indexHtml,
    new RegExp(
      `<meta[^>]+name=["']qctp-candidate-sha["'][^>]+content=["']${candidateSha}["']`,
      "u",
    ),
  );
  const applicationAssetPath = indexHtml.match(
    /<script[^>]+src=["']\.\/(assets\/index-[^"']+\.js)["']/u,
  )?.[1];
  assert.ok(
    applicationAssetPath,
    `Candidate ${candidateSha} did not emit its application JavaScript asset.`,
  );
  const applicationAsset = await readFile(
    resolve(outputRoot, applicationAssetPath),
    "utf8",
  );
  assert.match(
    applicationAsset,
    new RegExp(candidateSha, "u"),
    `Candidate ${candidateSha} identity is absent from runtime JavaScript.`,
  );
  const serviceWorker = await readFile(resolve(outputRoot, "sw.js"), "utf8");
  assert.match(
    serviceWorker,
    /qctp-pwa-candidate\.json/u,
    `Candidate ${candidateSha} marker was not included in the Workbox precache.`,
  );
  const markerRevision = digest("md5", markerText);
  assert.match(
    serviceWorker,
    new RegExp(markerRevision, "u"),
    `Candidate ${candidateSha} marker revision is absent from the precache.`,
  );
  assert.match(
    serviceWorker,
    /addEventListener\(["']message["'][\s\S]{0,800}SKIP_WAITING[\s\S]{0,800}skipWaiting\(/u,
    "Prompt-mode service worker is missing its message-driven SKIP_WAITING handler.",
  );
  assert.equal(
    serviceWorker.match(/skipWaiting\(/gu)?.length ?? 0,
    1,
    "Generated prompt-mode worker changed its standard waiting-message contract.",
  );
  assert.match(
    serviceWorker,
    /qctp-sw-control\.js/u,
    "Prompt-mode service worker does not import QCTP activation control.",
  );
  const activationControl = await readFile(
    resolve(outputRoot, "qctp-sw-control.js"),
    "utf8",
  );
  assert.match(
    activationControl,
    /QCTP_IDENTIFY_WAITING_CANDIDATE[\s\S]+QCTP_WAITING_CANDIDATE_IDENTITY[\s\S]+QCTP_ACTIVATE_WAITING_CANDIDATE[\s\S]+skipWaiting\(\)[\s\S]+QCTP_ACTIVATION_ACCEPTED/u,
    "QCTP activation control lacks its acknowledged waiting-worker contract.",
  );
  assert.match(
    activationControl,
    new RegExp(candidateSha, "u"),
    `Candidate ${candidateSha} identity is absent from activation control.`,
  );
  assert.doesNotMatch(
    `${serviceWorker}\n${activationControl}`,
    /(?:clientsClaim\s*\(|clients\.claim\s*\()/u,
    "Prompt-mode service worker must not claim an active practice client automatically.",
  );
  assert.match(
    output,
    /PWA/u,
    `Candidate ${candidateSha} was not built by VitePWA.`,
  );

  return {
    candidateSha,
    applicationAssetSha256: digest("sha256", applicationAsset),
    markerRevision,
    root: outputRoot,
    serviceWorkerSha256: digest("sha256", serviceWorker),
  };
}

function cacheControl(path: string): string {
  if (
    path.endsWith("index.html") ||
    path.endsWith("sw.js") ||
    path.endsWith("qctp-pwa-candidate.json") ||
    path.endsWith(".webmanifest")
  ) {
    return "no-store";
  }
  return /(?:^|[/\\])assets[/\\][^/\\]+-[A-Za-z0-9_-]{8,}\.[^/\\]+$/u.test(path)
    ? "public, max-age=31536000, immutable"
    : "no-cache";
}

export class SwappableCandidateServer {
  private activeRoot: string | null = null;
  private readonly server: Server;

  public constructor() {
    this.server = createServer((request, response) => {
      void this.handle(request, response).catch(() => {
        if (response.headersSent) {
          response.destroy();
          return;
        }
        response.writeHead(500, {
          "Cache-Control": "no-store",
          "Content-Type": "text/plain; charset=utf-8",
        });
        response.end("Candidate server read failure.");
      });
    });
  }

  public async useCandidate(root: string): Promise<void> {
    const candidateRoot = resolve(root);
    await Promise.all([
      access(resolve(candidateRoot, "index.html")),
      access(resolve(candidateRoot, "sw.js")),
      access(resolve(candidateRoot, "qctp-pwa-candidate.json")),
    ]);
    this.activeRoot = candidateRoot;
  }

  public async listen(port = 0): Promise<string> {
    await new Promise<void>((resolveListen, rejectListen) => {
      this.server.once("error", rejectListen);
      this.server.listen(port, "127.0.0.1", resolveListen);
    });
    const address = this.server.address();
    if (address === null || typeof address === "string") {
      throw new Error("Candidate server did not bind a TCP port.");
    }
    return `http://127.0.0.1:${address.port}`;
  }

  public async close(): Promise<void> {
    if (!this.server.listening) return;
    await new Promise<void>((resolveClose, rejectClose) => {
      this.server.close((error) =>
        error === undefined ? resolveClose() : rejectClose(error),
      );
    });
  }

  private async handle(
    request: IncomingMessage,
    response: ServerResponse,
  ): Promise<void> {
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { Allow: "GET, HEAD" });
      response.end();
      return;
    }
    const root = this.activeRoot;
    if (root === null) {
      response.writeHead(503, { "Cache-Control": "no-store" });
      response.end();
      return;
    }

    let pathname: string;
    try {
      pathname = decodeURIComponent(
        new URL(request.url ?? "/", "http://127.0.0.1").pathname,
      );
    } catch {
      response.writeHead(400, { "Cache-Control": "no-store" });
      response.end();
      return;
    }
    const relativePath = pathname.replace(/^\/+/, "") || "index.html";
    const boundary = `${root.endsWith(sep) ? root : `${root}${sep}`}`;
    let target = resolve(root, relativePath);
    if (target !== root && !target.startsWith(boundary)) {
      response.writeHead(400, { "Cache-Control": "no-store" });
      response.end();
      return;
    }

    let details;
    try {
      details = await stat(target);
      if (details.isDirectory()) {
        target = resolve(target, "index.html");
        details = await stat(target);
      }
    } catch {
      if (!(request.headers.accept ?? "").includes("text/html")) {
        response.writeHead(404, { "Cache-Control": "no-store" });
        response.end();
        return;
      }
      target = resolve(root, "index.html");
      details = await stat(target);
    }
    if (!details.isFile()) {
      response.writeHead(404, { "Cache-Control": "no-store" });
      response.end();
      return;
    }

    const body = request.method === "HEAD" ? null : await readFile(target);
    response.writeHead(200, {
      "Cache-Control": cacheControl(target),
      "Content-Length": details.size,
      "Content-Type":
        contentTypes.get(extname(target).toLowerCase()) ??
        "application/octet-stream",
      "Service-Worker-Allowed": "/",
    });
    response.end(body);
  }
}
