# QCTP Private Runtime Updater esbuild Lock and REV7 Recovery — Rev0

**Record ID:** `QCTP-PX13-UPDATER-ESBUILD-LOCK-REV0`  
**Date:** 2026-08-19  
**Status:** `PX13 DEPLOYMENT FAILED BEFORE BUILD/STATIC SWAP / REV7 WINDOWS-VERIFIED WITH ACTIVE ESBUILD LOCK`  
**Release authority:** `ZERO RELEASE`

## 1. User-observed failure

Ryan reran the private-runtime updater after REV5 had passed the dedicated Windows build gate. The locator aligned the PX13 checkout to the controlled branch and entered the REV5 deployment script.

`npm ci` then stopped with Windows error `EPERM -4048` while attempting to unlink:

`node_modules\@esbuild\win32-x64\esbuild.exe`

The file was in use by the already-running QCTP Node/tsx gateway process. This was not a source-code, audio, or package-integrity failure.

## 2. Evidence

- source: Ryan's PX13 terminal screenshot in the active QCTP continuation thread;
- image dimensions: 2048 × 1068 pixels;
- received PNG size: 490,160 bytes;
- SHA-256: `4f61c8cc443b70730dc41d847c9295e1ee2a988c45a7d65abe8684f5f7647d09`;
- ChatGPT file ID: `file_00000000e5d88230b2c4e52f3b955b19`;
- evidence class: **USER-PROVIDED / DIRECT PX13 TERMINAL SCREENSHOT**.

## 3. Mutation boundary

The run stopped during dependency installation, before:

- lint, typecheck, coverage, or production build;
- dedicated audio regression tests;
- creation or installation of a new `dist` package;
- gateway restart;
- exact served-build identity acceptance.

The private QCTP gateway continued serving its previous runtime. The failed `npm ci` may have partially removed files from the active untracked `node_modules` tree, so REV7 deliberately avoids restarting or modifying that running gateway during the audio-only recovery.

## 4. Root cause

REV5 ran `npm ci` directly in the active runtime checkout. Windows correctly prevented npm from deleting the executable currently held open by the running gateway. Stopping the gateway before dependency installation would have created an avoidable outage and would have depended on the potentially partial active `node_modules` tree to restart.

## 5. REV7 architecture

REV7 separates build-time state from the running private runtime:

1. verify the active branch is clean and aligned to the controlled GitHub candidate;
2. create a disposable local clone under the Windows temporary directory;
3. run `npm ci`, lint, typecheck, coverage, production build, and dedicated audio tests only inside that isolated clone;
4. write the exact candidate identity into the staged `dist` package;
5. leave the running gateway and active `node_modules` untouched;
6. atomically replace only the static `dist` directory;
7. verify `/health`, the PWA root, and the exact served candidate identity;
8. restore the prior `dist` package if identity verification fails;
9. report PASS only after the running gateway serves the staged candidate identity.

Candidate head containing REV7:

`1e8bd74ffaa1758258fbfc91001af1a1bfc1260b`

## 6. Windows lock-specific verification

A dedicated Windows Server 2025 / Windows PowerShell workflow intentionally opened the active checkout path below with exclusive sharing disabled:

`node_modules\@esbuild\win32-x64\esbuild.exe`

While that file remained locked, REV7 completed its isolated build verification.

- workflow: `QCTP Windows updater verification`;
- workflow run ID: `32304223366`;
- job ID: `96233548675`;
- PowerShell parse: **PASS**;
- active esbuild path held with `FileShare.None`: **PASS**;
- isolated `npm ci`: **PASS**, zero vulnerabilities;
- lint: **PASS**;
- typecheck: **PASS**;
- Vitest coverage: **41 files / 233 tests PASS**;
- coverage: 88.77% statements / 79.23% branches / 93.71% functions / 90.42% lines;
- production PWA build: **PASS**;
- dedicated Day 1 audio tests: **4 PASS**;
- staged runtime identity: **PASS**;
- final result: `QCTP AUDIO PATCH BUILD VERIFICATION: PASS`.

The Day 1 audio-smoke workflow also passed for the same candidate head.

## 7. User route

No new ZIP is required. The already extracted REV3 locator remains the correct preservation and branch-alignment layer. On the next run it will fetch REV7 and invoke it automatically.

Expected heading:

`QCTP audio-patch deployment preflight REV7`

A valid completion requires both:

- `QCTP AUDIO PATCH DEPLOYMENT: PASS`
- `QCTP PRIVATE RUNTIME UPDATE: PASS`

## 8. Remaining acceptance

After true deployment PASS, close and reopen the iPhone Home Screen app and confirm the opening Day 1 cue and the automatic cue at 24:15 are audible in the full private PWA.

## 9. Next controlled action

Rerun `RUN_QCTP_AUDIO_PATCH_UPDATE.cmd` from the already extracted REV3 folder. No new download, extraction, Codex usage, or administrator action is required.
