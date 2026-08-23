import { createHash } from "node:crypto";
import {
  closeSync,
  createReadStream,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readdirSync,
  readSync,
} from "node:fs";
import { createServer } from "node:http";
import { basename, dirname, extname, resolve, sep } from "node:path";

const IDENTITY_NAME = "QCTP_REV3_RUNTIME_IDENTITY.json";
const CONTENT_MANIFEST_NAME = "QCTP_REV3_CONTENT_MANIFEST.json";

class RuntimeIntegrityError extends Error {}

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
const requestedCandidateSha = readArgument("--candidate-sha", "")
  .trim()
  .toLowerCase();

if (host !== "127.0.0.1" && host !== "::1") {
  throw new Error(
    "The Rev3 preview server binds only to loopback. Use private Tailscale HTTPS Serve as the separate remote transport.",
  );
}
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("Preview port must be an integer from 1 through 65535.");
}
if (
  requestedCandidateSha !== "" &&
  !/^[0-9a-f]{40}$/u.test(requestedCandidateSha)
) {
  throw new Error("The expected preview candidate SHA is invalid.");
}

const identityPath = resolve(root, IDENTITY_NAME);
const contentManifestPath = resolve(root, CONTENT_MANIFEST_NAME);

function sha256File(path) {
  const hash = createHash("sha256");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  const descriptor = openSync(path, "r");
  try {
    let bytesRead;
    do {
      bytesRead = readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytesRead > 0) hash.update(buffer.subarray(0, bytesRead));
    } while (bytesRead > 0);
  } finally {
    closeSync(descriptor);
  }
  return hash.digest("hex");
}

function signatureFromStats(details) {
  return {
    dev: details.dev.toString(),
    ino: details.ino.toString(),
    size: details.size.toString(),
    mtimeNs: details.mtimeNs.toString(),
    ctimeNs: details.ctimeNs.toString(),
  };
}

function getFileSignature(path) {
  const details = lstatSync(path, { bigint: true });
  if (!details.isFile() || details.isSymbolicLink()) {
    throw new RuntimeIntegrityError(
      `Runtime path is not a regular file: ${path}`,
    );
  }
  return signatureFromStats(details);
}

function signaturesEqual(left, right) {
  return Object.keys(left).every((key) => left[key] === right[key]);
}

function normalizeManifestPath(value) {
  if (
    typeof value !== "string" ||
    value === "" ||
    value.startsWith("/") ||
    value.includes("\\") ||
    value.includes("\0")
  ) {
    throw new Error("The content manifest contains an invalid path.");
  }
  const segments = value.split("/");
  if (
    segments.some(
      (segment) => segment === "" || segment === "." || segment === "..",
    )
  ) {
    throw new Error(
      "The content manifest contains a path traversal or empty segment.",
    );
  }
  return segments.join("/");
}

function resolveManifestPath(relativePath) {
  const target = resolve(root, ...relativePath.split("/"));
  const boundary = root.endsWith(sep) ? root : `${root}${sep}`;
  if (!target.startsWith(boundary)) {
    throw new Error(
      "The content manifest path escapes the immutable site root.",
    );
  }
  return target;
}

function enumerateRuntimeFiles(directory, prefix = "") {
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) {
      throw new Error(
        `Symbolic links are not allowed in the runtime site: ${entry.name}`,
      );
    }
    const relativePath = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    const absolutePath = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...enumerateRuntimeFiles(absolutePath, relativePath));
    } else if (entry.isFile()) {
      files.push(relativePath);
    } else {
      throw new Error(`Unsupported runtime filesystem entry: ${relativePath}`);
    }
  }
  return files;
}

function parseControlledIdentity(bytes) {
  const current = JSON.parse(bytes.toString("utf8"));
  if (
    current.schema !== "qctp-rev3-runtime-identity-v1" ||
    current.releaseAuthority !== "ZERO_RELEASE" ||
    current.sourceBranch !== "qctp-platform-rev3-codex" ||
    current.packageKind !== "PRIVATE_PREVIEW_CANDIDATE" ||
    current.contentManifestPath !== `/${CONTENT_MANIFEST_NAME}` ||
    typeof current.candidateSha !== "string" ||
    !/^[0-9a-f]{40}$/u.test(current.candidateSha) ||
    typeof current.contentManifestSha256 !== "string" ||
    !/^[0-9a-f]{64}$/u.test(current.contentManifestSha256) ||
    !Number.isSafeInteger(current.contentFileCount) ||
    current.contentFileCount < 1 ||
    !Number.isSafeInteger(current.contentTotalBytes) ||
    current.contentTotalBytes < 1 ||
    current.publicDeploymentAuthorized !== false ||
    current.installRequiresExplicitOptIn !== true
  ) {
    throw new Error(
      "The selected site does not contain a complete ZERO_RELEASE Rev3 identity.",
    );
  }
  return current;
}

function loadIntegrityEnvelope() {
  const identityBytes = readFileSync(identityPath);
  const identity = parseControlledIdentity(identityBytes);
  const expectedCandidateSha =
    requestedCandidateSha === ""
      ? identity.candidateSha
      : requestedCandidateSha;
  if (identity.candidateSha !== expectedCandidateSha) {
    throw new Error(
      "The selected site identity does not match the expected preview candidate.",
    );
  }
  if (
    basename(root).toLowerCase() !== "site" ||
    basename(dirname(root)).toLowerCase() !==
      `qctp-rev3-${expectedCandidateSha}`
  ) {
    throw new Error(
      "The preview root must be the site directory inside the exact immutable qctp-rev3-<candidate-sha> package.",
    );
  }

  const manifestBytes = readFileSync(contentManifestPath);
  const manifestHash = createHash("sha256").update(manifestBytes).digest("hex");
  if (manifestHash !== identity.contentManifestSha256) {
    throw new Error(
      "The runtime content manifest does not match its identity hash.",
    );
  }
  const manifest = JSON.parse(manifestBytes.toString("utf8"));
  if (
    manifest.schema !== "qctp-rev3-runtime-content-manifest-v1" ||
    manifest.hashAlgorithm !== "SHA-256" ||
    manifest.candidateSha !== expectedCandidateSha ||
    !Number.isSafeInteger(manifest.fileCount) ||
    !Number.isSafeInteger(manifest.totalBytes) ||
    !Array.isArray(manifest.files) ||
    manifest.files.length !== manifest.fileCount ||
    manifest.fileCount !== identity.contentFileCount ||
    manifest.totalBytes !== identity.contentTotalBytes
  ) {
    throw new Error(
      "The runtime content manifest is incomplete or inconsistent.",
    );
  }

  const files = new Map();
  let totalBytes = 0;
  for (const source of manifest.files) {
    const relativePath = normalizeManifestPath(source.path);
    const key = relativePath.toLowerCase();
    if (
      files.has(key) ||
      !Number.isSafeInteger(source.bytes) ||
      source.bytes < 0 ||
      typeof source.sha256 !== "string" ||
      !/^[0-9a-f]{64}$/u.test(source.sha256)
    ) {
      throw new Error(
        `Invalid or duplicate runtime manifest entry: ${relativePath}`,
      );
    }
    const absolutePath = resolveManifestPath(relativePath);
    const signature = getFileSignature(absolutePath);
    if (
      Number(signature.size) !== source.bytes ||
      sha256File(absolutePath) !== source.sha256
    ) {
      throw new Error(
        `Runtime file failed its startup integrity gate: ${relativePath}`,
      );
    }
    files.set(key, {
      relativePath,
      absolutePath,
      bytes: source.bytes,
      sha256: source.sha256,
      signature,
    });
    totalBytes += source.bytes;
  }
  if (totalBytes !== manifest.totalBytes) {
    throw new Error("The runtime content manifest byte total is incorrect.");
  }

  const metadata = [
    {
      relativePath: IDENTITY_NAME,
      absolutePath: identityPath,
      bytes: identityBytes.length,
      sha256: createHash("sha256").update(identityBytes).digest("hex"),
      signature: getFileSignature(identityPath),
    },
    {
      relativePath: CONTENT_MANIFEST_NAME,
      absolutePath: contentManifestPath,
      bytes: manifestBytes.length,
      sha256: manifestHash,
      signature: getFileSignature(contentManifestPath),
    },
  ];
  for (const record of metadata) {
    const key = record.relativePath.toLowerCase();
    if (files.has(key))
      throw new Error(`Reserved runtime path is manifested: ${key}`);
    files.set(key, record);
  }

  const actualFiles = enumerateRuntimeFiles(root)
    .map((path) => path.toLowerCase())
    .sort();
  const expectedFiles = [...files.keys()].sort();
  if (
    actualFiles.length !== expectedFiles.length ||
    actualFiles.some((path, index) => path !== expectedFiles[index])
  ) {
    throw new Error(
      "The immutable runtime root contains unmanifested or missing files.",
    );
  }

  return {
    identity,
    expectedCandidateSha,
    files,
    identityRecord: files.get(IDENTITY_NAME.toLowerCase()),
    manifestRecord: files.get(CONTENT_MANIFEST_NAME.toLowerCase()),
  };
}

const integrity = loadIntegrityEnvelope();
let integrityInvalidated = false;
let integrityFailureMessage = "";

function assertRecordUnchanged(record) {
  const current = getFileSignature(record.absolutePath);
  if (!signaturesEqual(current, record.signature)) {
    throw new RuntimeIntegrityError(
      `Runtime file changed after startup: ${record.relativePath}`,
    );
  }
}

function assertControlFilesUnchanged() {
  if (integrityInvalidated) {
    throw new RuntimeIntegrityError(integrityFailureMessage);
  }
  assertRecordUnchanged(integrity.identityRecord);
  assertRecordUnchanged(integrity.manifestRecord);
  if (
    sha256File(identityPath) !== integrity.identityRecord.sha256 ||
    sha256File(contentManifestPath) !== integrity.manifestRecord.sha256
  ) {
    throw new RuntimeIntegrityError(
      "The runtime identity or content manifest changed after startup.",
    );
  }
}

function latchIntegrityFailure(error) {
  if (!integrityInvalidated) {
    integrityInvalidated = true;
    integrityFailureMessage =
      error instanceof Error ? error.message : "Runtime integrity changed.";
    process.stderr.write(
      `${JSON.stringify({
        schema: "qctp-rev3-preview-integrity-failure-v1",
        candidateSha: integrity.expectedCandidateSha,
        message: integrityFailureMessage,
        releaseAuthority: "ZERO_RELEASE",
      })}\n`,
    );
  }
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
  response.setHeader("X-QCTP-Candidate-SHA", integrity.identity.candidateSha);
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

function resolveRequestRecord(pathname, acceptsHtml) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return { invalid: true };
  }
  if (decoded.includes("\\") || decoded.includes("\0"))
    return { invalid: true };
  const relativePath = decoded.replace(/^\/+|\/+$/gu, "");
  const segments = relativePath === "" ? [] : relativePath.split("/");
  if (
    segments.some(
      (segment) => segment === "" || segment === "." || segment === "..",
    )
  ) {
    return { invalid: true };
  }

  const requestedPath =
    segments.length === 0 ? "index.html" : segments.join("/");
  const direct = integrity.files.get(requestedPath.toLowerCase());
  if (direct !== undefined) return { record: direct };
  const directoryIndex = integrity.files.get(
    `${requestedPath}/index.html`.toLowerCase(),
  );
  if (directoryIndex !== undefined) return { record: directoryIndex };
  if (acceptsHtml && extname(requestedPath) === "") {
    return { record: integrity.files.get("index.html") };
  }
  return { record: undefined };
}

function getCacheControl(record) {
  const path = record.relativePath;
  const noStore =
    path.endsWith("index.html") ||
    path.endsWith(IDENTITY_NAME) ||
    path.endsWith(CONTENT_MANIFEST_NAME) ||
    path.endsWith("sw.js") ||
    path.endsWith(".webmanifest") ||
    path.endsWith(".json");
  if (noStore) return "no-store";

  const isContentHashedAsset =
    /^assets\/[^/]+-[A-Za-z0-9_-]{8,}\.(?:css|js|mjs|woff2?)$/u.test(path) ||
    /^workbox-[A-Za-z0-9_-]{8,}\.js$/u.test(path);
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

function writeIntegrityFailure(response) {
  if (response.destroyed) return;
  if (response.headersSent) {
    response.destroy();
    return;
  }
  response.removeHeader("X-QCTP-Candidate-SHA");
  response.setHeader(
    "X-QCTP-Expected-Candidate-SHA",
    integrity.expectedCandidateSha,
  );
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.writeHead(503, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(
    JSON.stringify({
      schema: "qctp-rev3-preview-integrity-failure-v1",
      status: "restart_required",
      expectedCandidateSha: integrity.expectedCandidateSha,
      releaseAuthority: "ZERO_RELEASE",
    }),
  );
}

function openVerifiedRecord(record) {
  assertRecordUnchanged(record);
  const descriptor = openSync(record.absolutePath, "r");
  try {
    const openedSignature = signatureFromStats(
      fstatSync(descriptor, { bigint: true }),
    );
    if (!signaturesEqual(openedSignature, record.signature)) {
      throw new RuntimeIntegrityError(
        `Runtime file changed while opening: ${record.relativePath}`,
      );
    }
    return descriptor;
  } catch (error) {
    closeSync(descriptor);
    throw error;
  }
}

function streamRecord(response, record, status, headers, range) {
  const descriptor = openVerifiedRecord(record);
  const stream = createReadStream(record.absolutePath, {
    fd: descriptor,
    autoClose: true,
    ...(range === undefined ? {} : { start: range.start, end: range.end }),
  });
  response.writeHead(status, headers);
  stream.pipe(response);
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
        candidateSha: integrity.identity.candidateSha,
        immutablePackageVerified: true,
        releaseAuthority: integrity.identity.releaseAuthority,
      }),
    );
    return;
  }

  const resolved = resolveRequestRecord(
    url.pathname,
    (request.headers.accept ?? "").includes("text/html"),
  );
  if (resolved.invalid === true) {
    response.writeHead(400, { "Cache-Control": "no-store" });
    response.end("Invalid path.");
    return;
  }
  const record = resolved.record;
  if (record === undefined) {
    response.writeHead(404, { "Cache-Control": "no-store" });
    response.end("Not found.");
    return;
  }
  assertRecordUnchanged(record);

  const extension = extname(record.relativePath).toLowerCase();
  const supportsRanges = rangeMediaExtensions.has(extension);
  const rangeHeader = request.headers.range;
  const range =
    supportsRanges && rangeHeader !== undefined
      ? parseSingleByteRange(rangeHeader, record.bytes)
      : undefined;
  const baseHeaders = {
    "Cache-Control": getCacheControl(record),
    "Content-Type": contentTypes.get(extension) ?? "application/octet-stream",
  };
  if (supportsRanges) baseHeaders["Accept-Ranges"] = "bytes";
  if (supportsRanges && rangeHeader !== undefined && range === null) {
    response.writeHead(416, {
      ...baseHeaders,
      "Content-Length": 0,
      "Content-Range": `bytes */${record.bytes}`,
    });
    response.end();
    return;
  }

  const status = range === undefined ? 200 : 206;
  const headers = {
    ...baseHeaders,
    "Content-Length": range === undefined ? record.bytes : range.length,
    ...(range === undefined
      ? {}
      : {
          "Content-Range": `bytes ${range.start}-${range.end}/${record.bytes}`,
        }),
  };
  if (request.method === "HEAD") {
    response.writeHead(status, headers);
    response.end();
    return;
  }
  streamRecord(response, record, status, headers, range);
}

const server = createServer((request, response) => {
  try {
    assertControlFilesUnchanged();
    applySecurityHeaders(response);
    handleRequest(request, response);
  } catch (error) {
    if (error instanceof RuntimeIntegrityError || integrityInvalidated) {
      latchIntegrityFailure(error);
      writeIntegrityFailure(response);
      return;
    }
    writeInternalError(response);
  }
});

server.listen(port, host, () => {
  process.stdout.write(
    `${JSON.stringify({
      schema: "qctp-rev3-preview-listener-v1",
      host,
      port,
      candidateSha: integrity.identity.candidateSha,
      immutablePackageVerified: true,
      releaseAuthority: integrity.identity.releaseAuthority,
    })}\n`,
  );
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
