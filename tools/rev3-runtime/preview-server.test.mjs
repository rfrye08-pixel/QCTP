import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { connect, createServer as createNetServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import test, { after, before } from "node:test";

const previewServerPath = fileURLToPath(
  new URL("./preview-server.mjs", import.meta.url),
);
const mediaBody = Buffer.from("0123456789abcdef", "utf8");
const candidateA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const candidateB = "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
const identityName = "QCTP_REV3_RUNTIME_IDENTITY.json";
const manifestName = "QCTP_REV3_CONTENT_MANIFEST.json";

let tempRoot;
let candidateRoot;
let siteRoot;
let port;
let serverProcess;
let serverStderr = "";

async function reservePort() {
  const probe = createNetServer();
  await new Promise((resolve, reject) => {
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", resolve);
  });
  const address = probe.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");
  const reservedPort = address.port;
  await new Promise((resolve, reject) =>
    probe.close((error) => (error === undefined ? resolve() : reject(error))),
  );
  return reservedPort;
}

async function writeFixture(root, relativePath, content) {
  const target = join(root, relativePath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, content);
}

async function enumerateFiles(root, prefix = "") {
  const files = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const relativePath = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      files.push(
        ...(await enumerateFiles(join(root, entry.name), relativePath)),
      );
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }
  return files.sort();
}

async function writeControlledMetadata(root, candidateSha) {
  const contentPaths = (await enumerateFiles(root)).filter(
    (path) => path !== identityName && path !== manifestName,
  );
  const files = [];
  let totalBytes = 0;
  for (const path of contentPaths) {
    const bytes = await readFile(join(root, ...path.split("/")));
    files.push({
      path,
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
    totalBytes += bytes.length;
  }
  const manifestBytes = Buffer.from(
    JSON.stringify({
      schema: "qctp-rev3-runtime-content-manifest-v1",
      hashAlgorithm: "SHA-256",
      candidateSha,
      fileCount: files.length,
      totalBytes,
      files,
    }),
  );
  await writeFixture(root, manifestName, manifestBytes);
  await writeFixture(
    root,
    identityName,
    JSON.stringify({
      schema: "qctp-rev3-runtime-identity-v1",
      candidateSha,
      sourceBranch: "qctp-platform-rev3-codex",
      packageKind: "PRIVATE_PREVIEW_CANDIDATE",
      releaseAuthority: "ZERO_RELEASE",
      contentManifestPath: `/${manifestName}`,
      contentManifestSha256: createHash("sha256")
        .update(manifestBytes)
        .digest("hex"),
      contentFileCount: files.length,
      contentTotalBytes: totalBytes,
      installRequiresExplicitOptIn: true,
      publicDeploymentAuthorized: false,
    }),
  );
}

async function writeCompleteSite(root, candidateSha) {
  await mkdir(root, { recursive: true });
  await Promise.all([
    writeFixture(root, "index.html", "<!doctype html><title>QCTP</title>"),
    writeFixture(root, "sw.js", "self.addEventListener('fetch', () => {});"),
    writeFixture(root, "manifest.webmanifest", "{}"),
    writeFixture(root, "assets/app-0123456789abcdef.js", "export {};"),
    writeFixture(root, "assets/app.js", "export {};"),
    writeFixture(root, "audio/day-1.mp3", mediaBody),
    writeFixture(
      root,
      "qctp-icon-180.png",
      Buffer.from([0x89, 0x50, 0x4e, 0x47]),
    ),
    writeFixture(root, "voice-audition/sample-a.mp3", mediaBody),
  ]);
  await writeControlledMetadata(root, candidateSha);
}

async function resetExactSite() {
  await rm(siteRoot, { recursive: true, force: true });
  await writeCompleteSite(siteRoot, candidateA);
}

async function startServer() {
  serverStderr = "";
  serverProcess = spawn(
    process.execPath,
    [
      previewServerPath,
      "--root",
      siteRoot,
      "--host",
      "127.0.0.1",
      "--port",
      String(port),
      "--candidate-sha",
      candidateA,
    ],
    { windowsHide: true },
  );
  serverProcess.stderr.setEncoding("utf8");
  serverProcess.stderr.on("data", (chunk) => {
    serverStderr += chunk;
  });

  await new Promise((resolve, reject) => {
    let stdout = "";
    let settled = false;
    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(new Error(`Preview server did not start. ${serverStderr}`));
    }, 5_000);

    serverProcess.stdout.setEncoding("utf8");
    serverProcess.stdout.on("data", (chunk) => {
      stdout += chunk;
      for (const line of stdout.split(/\r?\n/u)) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);
          if (event.schema !== "qctp-rev3-preview-listener-v1") continue;
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          resolve();
          return;
        } catch {
          // Wait for the complete JSON line.
        }
      }
    });
    serverProcess.once("exit", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(
        new Error(
          `Preview server exited before listening (${String(code)}). ${serverStderr}`,
        ),
      );
    });
  });
}

async function stopServer() {
  if (serverProcess?.exitCode === null) {
    const exited = new Promise((resolve) =>
      serverProcess.once("exit", resolve),
    );
    serverProcess.kill();
    await Promise.race([exited, delay(3_000)]);
    if (serverProcess.exitCode === null) serverProcess.kill("SIGKILL");
  }
  serverProcess = undefined;
}

async function restartWithExactSite() {
  await stopServer();
  await resetExactSite();
  await startServer();
}

function request(path, init) {
  return fetch(`http://127.0.0.1:${port}${path}`, init);
}

function rawHttpRequest(requestTarget) {
  return new Promise((resolve, reject) => {
    const socket = connect({ host: "127.0.0.1", port }, () => {
      socket.write(
        `GET ${requestTarget} HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nConnection: close\r\n\r\n`,
      );
    });
    let response = "";
    socket.setEncoding("latin1");
    socket.setTimeout(3_000, () => {
      socket.destroy(new Error("Raw HTTP request timed out."));
    });
    socket.on("data", (chunk) => {
      response += chunk;
    });
    socket.once("end", () => resolve(response));
    socket.once("error", reject);
  });
}

async function assertIntegrityFailure(response) {
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("x-qctp-candidate-sha"), null);
  assert.equal(
    response.headers.get("x-qctp-expected-candidate-sha"),
    candidateA,
  );
  assert.deepEqual(await response.json(), {
    schema: "qctp-rev3-preview-integrity-failure-v1",
    status: "restart_required",
    expectedCandidateSha: candidateA,
    releaseAuthority: "ZERO_RELEASE",
  });
}

before(async () => {
  tempRoot = await mkdtemp(join(tmpdir(), "qctp-rev3-preview-server-"));
  candidateRoot = join(tempRoot, `qctp-rev3-${candidateA}`);
  siteRoot = join(candidateRoot, "site");
  port = await reservePort();
  await writeCompleteSite(siteRoot, candidateA);
  await startServer();
});

after(async () => {
  await stopServer();
  if (tempRoot) await rm(tempRoot, { recursive: true, force: true });
});

test("malformed escaped paths return 400 without killing the server", async () => {
  const rawResponse = await rawHttpRequest("/%");
  assert.match(rawResponse, /^HTTP\/1\.1 400 /u);

  const health = await request("/__qctp_runtime/health");
  assert.equal(health.status, 200, serverStderr);
  assert.equal(serverProcess.exitCode, null, serverStderr);
  assert.equal((await health.json()).immutablePackageVerified, true);
});

test("static media supports one bounded byte range", async () => {
  const response = await request("/audio/day-1.mp3", {
    headers: { Range: "bytes=2-5" },
  });
  assert.equal(response.status, 206);
  assert.equal(response.headers.get("accept-ranges"), "bytes");
  assert.equal(response.headers.get("content-range"), "bytes 2-5/16");
  assert.equal(response.headers.get("content-length"), "4");
  assert.equal(Buffer.from(await response.arrayBuffer()).toString(), "2345");

  const suffixHead = await request("/audio/day-1.mp3", {
    method: "HEAD",
    headers: { Range: "bytes=-4" },
  });
  assert.equal(suffixHead.status, 206);
  assert.equal(suffixHead.headers.get("content-range"), "bytes 12-15/16");
  assert.equal(suffixHead.headers.get("content-length"), "4");
  assert.equal(await suffixHead.text(), "");
});

test("unsatisfiable and multiple media ranges return 416", async () => {
  for (const range of ["bytes=99-120", "bytes=0-1,3-4"]) {
    const response = await request("/audio/day-1.mp3", {
      headers: { Range: range },
    });
    assert.equal(response.status, 416);
    assert.equal(response.headers.get("accept-ranges"), "bytes");
    assert.equal(response.headers.get("content-range"), "bytes */16");
    assert.equal(response.headers.get("content-length"), "0");
    assert.equal(await response.text(), "");
  }
});

test("only content-hashed build assets receive immutable caching", async () => {
  const expectations = [
    ["/assets/app-0123456789abcdef.js", "public, max-age=31536000, immutable"],
    ["/assets/app.js", "no-cache"],
    ["/audio/day-1.mp3", "no-cache"],
    ["/qctp-icon-180.png", "no-cache"],
    ["/voice-audition/sample-a.mp3", "no-cache"],
    ["/index.html", "no-store"],
    ["/sw.js", "no-store"],
    ["/manifest.webmanifest", "no-store"],
    [`/${identityName}`, "no-store"],
    [`/${manifestName}`, "no-store"],
  ];

  for (const [path, expected] of expectations) {
    const response = await request(path, { method: "HEAD" });
    assert.equal(response.status, 200, path);
    assert.equal(response.headers.get("cache-control"), expected, path);
  }
});

test("unmanifested files are never served", async () => {
  await writeFixture(siteRoot, "unmanifested.txt", "not controlled");
  try {
    const response = await request("/unmanifested.txt");
    assert.equal(response.status, 404);
    assert.equal(await response.text(), "Not found.");
  } finally {
    await rm(join(siteRoot, "unmanifested.txt"), { force: true });
  }
});

test("same-identity asset tampering latches 503 until a verified restart", async () => {
  await writeFixture(siteRoot, "assets/app.js", "export const changed = true;");
  await assertIntegrityFailure(await request("/assets/app.js"));
  await writeFixture(siteRoot, "assets/app.js", "export {};");
  await assertIntegrityFailure(await request("/__qctp_runtime/health"));

  await restartWithExactSite();
  const recovered = await request("/__qctp_runtime/health");
  assert.equal(recovered.status, 200);
  assert.equal(recovered.headers.get("x-qctp-candidate-sha"), candidateA);
});

test("content-manifest tampering latches 503 until a verified restart", async () => {
  await writeFixture(siteRoot, manifestName, "{}");
  await assertIntegrityFailure(await request("/__qctp_runtime/health"));

  await restartWithExactSite();
  assert.equal((await request("/__qctp_runtime/health")).status, 200);
});

test("a full root swap fails closed and cannot recover without restart", async () => {
  const replacement = join(candidateRoot, "replacement-site");
  const displaced = join(candidateRoot, "displaced-site");
  const rejected = join(candidateRoot, "rejected-site");
  await writeCompleteSite(replacement, candidateB);
  await rename(siteRoot, displaced);
  await rename(replacement, siteRoot);
  await assertIntegrityFailure(await request("/__qctp_runtime/health"));

  await rename(siteRoot, rejected);
  await rename(displaced, siteRoot);
  await assertIntegrityFailure(await request("/__qctp_runtime/health"));

  await stopServer();
  await rm(rejected, { recursive: true, force: true });
  await startServer();
  const recovered = await request("/__qctp_runtime/health");
  assert.equal(recovered.status, 200);
  assert.equal(recovered.headers.get("x-qctp-candidate-sha"), candidateA);

  const identityDetails = await stat(join(siteRoot, identityName));
  assert.equal(identityDetails.isFile(), true);
});
