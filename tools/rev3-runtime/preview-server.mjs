import { createReadStream, readFileSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, relative, resolve, sep } from "node:path";

const IDENTITY_NAME = "QCTP_REV3_RUNTIME_IDENTITY.json";

function readArgument(name, fallback) {
  const position = process.argv.indexOf(name);
  if (position === -1) return fallback;
  const value = process.argv[position + 1];
  if (!value || value.startsWith("--")) {
    throw new Error(`Missing value for ${name}.`);
  }
  return value;
}

const root = resolve(readArgument("--root", ""));
const host = readArgument("--host", "127.0.0.1");
const port = Number.parseInt(readArgument("--port", "4179"), 10);

if (host !== "127.0.0.1" && host !== "::1") {
  throw new Error(
    "The Rev3 preview server binds only to loopback. Use private Tailscale HTTPS Serve as the separate remote transport.",
  );
}
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("Preview port must be an integer from 1 through 65535.");
}

const identityPath = resolve(root, IDENTITY_NAME);
const identity = JSON.parse(readFileSync(identityPath, "utf8"));
if (
  identity.schema !== "qctp-rev3-runtime-identity-v1" ||
  identity.releaseAuthority !== "ZERO_RELEASE" ||
  identity.sourceBranch !== "qctp-platform-rev3-codex"
) {
  throw new Error(
    "The selected site does not contain a valid ZERO_RELEASE Rev3 identity.",
  );
}

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".m4a", "audio/mp4"],
  [".mp3", "audio/mpeg"],
  [".mp4", "video/mp4"],
  [".ogg", "audio/ogg"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".wav", "audio/wav"],
  [".webm", "video/webm"],
  [".webmanifest", "application/manifest+json; charset=utf-8"],
  [".woff2", "font/woff2"],
]);

const rangeMediaExtensions = new Set([
  ".m4a",
  ".mp3",
  ".mp4",
  ".ogg",
  ".wav",
  ".webm",
]);

function applySecurityHeaders(response) {
  response.setHeader("X-QCTP-Candidate-SHA", identity.candidateSha);
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader(
    "Permissions-Policy",
    "microphone=(self), camera=(), geolocation=()",
  );
  response.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; connect-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; script-src 'self'; style-src 'self' 'unsafe-inline'; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  );
}

function resolveRequestPath(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const relativePath = decoded.replace(/^\/+/, "");
  const requested = resolve(root, relativePath || "index.html");
  const boundary = `${root.endsWith(sep) ? root : `${root}${sep}`}`;
  if (requested !== root && !requested.startsWith(boundary)) {
    return null;
  }
  return requested;
}

function getCacheControl(path) {
  const noStore =
    path.endsWith("index.html") ||
    path.endsWith(IDENTITY_NAME) ||
    path.endsWith("QCTP_REV3_CONTENT_MANIFEST.json") ||
    path.endsWith("sw.js") ||
    path.endsWith(".webmanifest") ||
    path.endsWith(".json");
  if (noStore) return "no-store";

  const siteRelative = relative(root, path).split(sep).join("/");
  const isContentHashedAsset =
    /^assets\/[^/]+-[A-Za-z0-9_-]{8,}\.(?:css|js|mjs|woff2?)$/u.test(
      siteRelative,
    ) || /^workbox-[A-Za-z0-9_-]{8,}\.js$/u.test(siteRelative);
  return isContentHashedAsset
    ? "public, max-age=31536000, immutable"
    : "no-cache";
}

function parseSingleByteRange(header, size) {
  if (typeof header !== "string" || size === 0) return null;
  const match = /^bytes=(\d*)-(\d*)$/u.exec(header.trim());
  if (!match || (match[1] === "" && match[2] === "")) return null;

  if (match[1] === "") {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null;
    const start = Math.max(size - suffixLength, 0);
    return { start, end: size - 1, length: size - start };
  }

  const start = Number(match[1]);
  const requestedEnd = match[2] === "" ? size - 1 : Number(match[2]);
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(requestedEnd) ||
    start >= size ||
    requestedEnd < start
  ) {
    return null;
  }
  const end = Math.min(requestedEnd, size - 1);
  return { start, end, length: end - start + 1 };
}

function writeInternalError(response) {
  if (response.destroyed) return;
  if (response.headersSent) {
    response.destroy();
    return;
  }
  response.writeHead(500, {
    "Cache-Control": "no-store",
    "Content-Type": "text/plain; charset=utf-8",
  });
  response.end("Unable to read the requested file.");
}

function streamFile(response, path, status, headers, range) {
  const stream = createReadStream(
    path,
    range === undefined ? undefined : { start: range.start, end: range.end },
  );
  stream.once("open", () => {
    if (response.destroyed) {
      stream.destroy();
      return;
    }
    response.writeHead(status, headers);
    stream.pipe(response);
  });
  stream.on("error", () => writeInternalError(response));
  response.once("close", () => stream.destroy());
}

function handleRequest(request, response) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, {
      Allow: "GET, HEAD",
      "Cache-Control": "no-store",
    });
    response.end();
    return;
  }

  let url;
  try {
    url = new URL(request.url ?? "/", `http://${host}:${port}`);
  } catch {
    response.writeHead(400, { "Cache-Control": "no-store" });
    response.end("Invalid URL.");
    return;
  }
  if (url.pathname === "/__qctp_runtime/health") {
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
    });
    response.end(
      JSON.stringify({
        schema: "qctp-rev3-preview-health-v1",
        candidateSha: identity.candidateSha,
        releaseAuthority: identity.releaseAuthority,
      }),
    );
    return;
  }

  let path = resolveRequestPath(url.pathname);
  if (path === null) {
    response.writeHead(400, { "Cache-Control": "no-store" });
    response.end("Invalid path.");
    return;
  }

  let details;
  try {
    details = statSync(path);
    if (details.isDirectory()) {
      path = resolve(path, "index.html");
      details = statSync(path);
    }
  } catch {
    const acceptsHtml = (request.headers.accept ?? "").includes("text/html");
    if (!acceptsHtml || extname(url.pathname) !== "") {
      response.writeHead(404, { "Cache-Control": "no-store" });
      response.end("Not found.");
      return;
    }
    path = resolve(root, "index.html");
    details = statSync(path);
  }

  if (!details.isFile()) {
    response.writeHead(404, { "Cache-Control": "no-store" });
    response.end("Not found.");
    return;
  }

  const extension = extname(path).toLowerCase();
  const supportsRanges = rangeMediaExtensions.has(extension);
  const rangeHeader = request.headers.range;
  const range =
    supportsRanges && rangeHeader !== undefined
      ? parseSingleByteRange(rangeHeader, details.size)
      : undefined;
  const baseHeaders = {
    "Cache-Control": getCacheControl(path),
    "Content-Type": contentTypes.get(extension) ?? "application/octet-stream",
  };
  if (supportsRanges) {
    baseHeaders["Accept-Ranges"] = "bytes";
  }
  if (supportsRanges && rangeHeader !== undefined && range === null) {
    response.writeHead(416, {
      ...baseHeaders,
      "Content-Length": 0,
      "Content-Range": `bytes */${details.size}`,
    });
    response.end();
    return;
  }

  const status = range === undefined ? 200 : 206;
  const headers = {
    ...baseHeaders,
    "Content-Length": range === undefined ? details.size : range.length,
    ...(range === undefined
      ? {}
      : {
          "Content-Range": `bytes ${range.start}-${range.end}/${details.size}`,
        }),
  };
  if (request.method === "HEAD") {
    response.writeHead(status, headers);
    response.end();
    return;
  }
  streamFile(response, path, status, headers, range);
}

const server = createServer((request, response) => {
  applySecurityHeaders(response);
  try {
    handleRequest(request, response);
  } catch {
    writeInternalError(response);
  }
});

server.listen(port, host, () => {
  process.stdout.write(
    `${JSON.stringify({
      schema: "qctp-rev3-preview-listener-v1",
      host,
      port,
      candidateSha: identity.candidateSha,
      releaseAuthority: identity.releaseAuthority,
    })}\n`,
  );
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
