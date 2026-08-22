import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");

async function read(relativePath) {
  return readFile(resolve(root, relativePath), "utf8");
}

async function write(relativePath, content) {
  await writeFile(resolve(root, relativePath), content, "utf8");
}

function replaceIfPresent(content, before, after) {
  return content.includes(before) ? content.replace(before, after) : content;
}

async function patchE2eCopy() {
  const path = "tests/e2e/practice-regression.spec.ts";
  let content = await read(path);
  content = replaceIfPresent(
    content,
    'page.getByText("Verification mode can never earn morning completion.")',
    "page.getByText(/Verification mode .* can never earn morning completion\\./)",
  );
  await write(path, content);
}

async function patchRuntimeCsp() {
  const path = "server/index.ts";
  let content = await read(path);
  content = replaceIfPresent(
    content,
    "default-src 'self'; connect-src 'self' https://resource2.heygen.ai; img-src 'self' data: blob:; media-src 'self' blob: https://resource2.heygen.ai; script-src 'self'; style-src 'self' 'unsafe-inline'; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    "default-src 'self'; connect-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; script-src 'self'; style-src 'self' 'unsafe-inline'; worker-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  );
  await write(path, content);
}

async function patchViteAudioPrecache() {
  const path = "vite.config.ts";
  let content = await read(path);
  content = content.replace(
    /globPatterns: \["\*\*\/\*\.\{js,css,html,svg,png,woff2(?:,mp3,json)?\}"\],/,
    'globPatterns: ["**/*.{js,css,html,svg,png,woff2,mp3,json}"],',
  );
  if (!content.includes("maximumFileSizeToCacheInBytes")) {
    content = content.replace(
      'globPatterns: ["**/*.{js,css,html,svg,png,woff2,mp3,json}"],',
      'globPatterns: ["**/*.{js,css,html,svg,png,woff2,mp3,json}"],\n        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,',
    );
  }
  await write(path, content);
}

async function patchPackageBuildGuard() {
  const path = "package.json";
  const parsed = JSON.parse(await read(path));
  parsed.scripts["audio:verify"] = "node tools/cache-day1-audio.mjs";
  parsed.scripts.prebuild = "npm run audio:verify";
  const preferred = [
    "dev",
    "server",
    "audio:verify",
    "prebuild",
    "build",
    "preview",
    "typecheck",
    "lint",
    "format",
    "format:check",
    "test",
    "test:coverage",
    "test:e2e",
    "check",
  ];
  parsed.scripts = Object.fromEntries([
    ...preferred
      .filter((key) => Object.hasOwn(parsed.scripts, key))
      .map((key) => [key, parsed.scripts[key]]),
    ...Object.entries(parsed.scripts).filter(
      ([key]) => !preferred.includes(key),
    ),
  ]);
  await write(path, `${JSON.stringify(parsed, null, 2)}\n`);
}

async function patchUpdater() {
  const path = "tools/Deploy-QctpAudioPatch.ps1";
  let content = await read(path);
  content = content.replace(
    "QCTP audio-patch deployment preflight REV9",
    "QCTP local-audio deployment preflight REV10",
  );
  content = content.replace(
    "schema = 'qctp-private-runtime-build-v5'",
    "schema = 'qctp-private-runtime-build-v6'",
  );
  content = replaceIfPresent(
    content,
    "        audio_fix_present = $true\n        isolated_staging_build = $true",
    "        audio_fix_present = $true\n        local_day1_audio_pack = $true\n        local_day1_audio_schema = 'qctp-day1-local-audio-pack-v2'\n        local_day1_audio_files = 23\n        local_day1_audio_bytes = 13340411\n        third_party_runtime_audio_required = $false\n        isolated_staging_build = $true",
  );
  content = replaceIfPresent(
    content,
    "                [string]$identity.candidate_sha -eq $ExpectedHead -and\n                [bool]$identity.audio_fix_present\n",
    "                [string]$identity.candidate_sha -eq $ExpectedHead -and\n                [bool]$identity.audio_fix_present -and\n                [bool]$identity.local_day1_audio_pack -and\n                [string]$identity.local_day1_audio_schema -eq 'qctp-day1-local-audio-pack-v2' -and\n                [int]$identity.local_day1_audio_files -eq 23 -and\n                [int64]$identity.local_day1_audio_bytes -eq 13340411 -and\n                -not [bool]$identity.third_party_runtime_audio_required\n",
  );
  content = content.replace(
    "Write-Stage 'Verifying controlled Day 1 audio inventory'",
    "Write-Stage 'Verifying controlled Day 1 source inventory'",
  );

  const marker = `    if (-not (Test-Path -LiteralPath (Join-Path $stageDist 'index.html'))) {
        throw 'The isolated build did not create dist\\index.html.'
    }
    $identityPath = Write-RuntimeIdentity -Head $head -DistDirectory $stageDist
`;
  if (
    content.includes(marker) &&
    !content.includes(
      "Verifying checksum-manifested same-origin Day 1 audio in the built PWA",
    )
  ) {
    const replacement = `    if (-not (Test-Path -LiteralPath (Join-Path $stageDist 'index.html'))) {
        throw 'The isolated build did not create dist\\index.html.'
    }

    Write-Stage 'Verifying checksum-manifested same-origin Day 1 audio in the built PWA'
    $builtAudioRoot = Join-Path $stageDist 'audio\\day1'
    $builtManifestPath = Join-Path $builtAudioRoot 'manifest.json'
    if (-not (Test-Path -LiteralPath $builtManifestPath)) {
        throw 'The production build is missing audio\\day1\\manifest.json.'
    }
    $builtManifest = Get-Content -Raw -LiteralPath $builtManifestPath | ConvertFrom-Json
    if ([string]$builtManifest.schema -ne 'qctp-day1-local-audio-pack-v2') {
        throw "Unexpected local audio schema: $($builtManifest.schema)"
    }
    if ([int]$builtManifest.fileCount -ne 23) {
        throw "Expected 23 local Day 1 audio files; manifest reports $($builtManifest.fileCount)."
    }
    if ([int64]$builtManifest.totalBytes -ne 13340411) {
        throw "Unexpected local Day 1 audio byte total: $($builtManifest.totalBytes)."
    }
    if ([string]$builtManifest.mediaType -ne 'audio/mpeg') {
        throw "Unexpected local Day 1 audio media type: $($builtManifest.mediaType)."
    }
    $builtMp3Files = @(Get-ChildItem -LiteralPath $builtAudioRoot -Filter '*.mp3' -File)
    if ($builtMp3Files.Count -ne 23) {
        throw "Expected 23 built MP3 files; found $($builtMp3Files.Count)."
    }
    foreach ($record in @($builtManifest.files)) {
        $audioPath = Join-Path $builtAudioRoot ([string]$record.relativePath)
        if (-not (Test-Path -LiteralPath $audioPath)) {
            throw "Built audio file is missing: $($record.relativePath)"
        }
        $actualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $audioPath).Hash.ToLowerInvariant()
        if ($actualHash -ne ([string]$record.sha256).ToLowerInvariant()) {
            throw "Built audio checksum mismatch: $($record.relativePath)"
        }
        if ((Get-Item -LiteralPath $audioPath).Length -ne [int64]$record.bytes) {
            throw "Built audio byte-count mismatch: $($record.relativePath)"
        }
    }
    $runtimeBundles = @(Get-ChildItem -LiteralPath $stageDist -Recurse -File -Include '*.js','*.html')
    foreach ($bundle in $runtimeBundles) {
        if ((Get-Content -Raw -LiteralPath $bundle.FullName) -match 'resource2\\.heygen\\.ai') {
            throw "The production runtime still contains a live HeyGen dependency: $($bundle.FullName)"
        }
    }
    Write-Host 'Verified 23 checksum-matched same-origin MP3 assets and zero live HeyGen runtime references.' -ForegroundColor Green

    $identityPath = Write-RuntimeIdentity -Head $head -DistDirectory $stageDist
`;
    content = content.replace(marker, replacement);
  }
  content = content
    .replace(
      "QCTP AUDIO PATCH BUILD VERIFICATION: PASS",
      "QCTP LOCAL AUDIO BUILD VERIFICATION: PASS",
    )
    .replace(
      "QCTP AUDIO PATCH DEPLOYMENT: PASS",
      "QCTP LOCAL AUDIO DEPLOYMENT: PASS",
    )
    .replace(
      "QCTP AUDIO PATCH DEPLOYMENT: FAILED",
      "QCTP LOCAL AUDIO DEPLOYMENT: FAILED",
    )
    .replace(
      "The private gateway is serving the audio-patched candidate.",
      "The private gateway is serving the checksum-verified same-origin Day 1 audio candidate.",
    );
  await write(path, content);
}

await patchE2eCopy();
await patchRuntimeCsp();
await patchViteAudioPrecache();
await patchPackageBuildGuard();
await patchUpdater();

console.log("QCTP same-origin local-audio finalization applied.");
