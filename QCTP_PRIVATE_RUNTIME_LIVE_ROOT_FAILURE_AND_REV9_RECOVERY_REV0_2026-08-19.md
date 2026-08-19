# QCTP Private Runtime Live-Root Failure and REV9 Recovery — Rev0

**Record ID:** `QCTP-PX13-LIVE-ROOT-REV9-RECOVERY-REV0`  
**Date:** 2026-08-19  
**Status:** `REV7 PX13 DEPLOYMENT FAILED SAFE / REV9 FULL WINDOWS LIVE-ROOT SIMULATION PASS / PX13 RERUN OPEN`  
**Release authority:** `ZERO_RELEASE`

## 1. User-observed REV7 result

Ryan ran the existing private-runtime locator/updater after the isolated-staging correction. The updater successfully:

- aligned the controlled candidate branch;
- built in an isolated temporary clone;
- passed the complete Node verification suite;
- passed the four dedicated Day 1 audio tests;
- created a staged production `dist` package and exact build-identity record;
- confirmed the existing private gateway was healthy.

It then mirrored the staged `dist` into the checkout directory it assumed was live. Port 8787 did not serve the expected candidate identity, so the updater restored the prior `dist` package and returned failure.

## 2. Evidence

- source: Ryan's direct PX13 terminal screenshot in the active QCTP thread;
- image dimensions: 2048 × 1068 pixels;
- received PNG size: 450,151 bytes;
- SHA-256: `7e9fc689041c16571fe41316599d2722b9804b564b56c4b8044bff87c684a508`;
- ChatGPT file ID: `file_00000000d16481fdb5bef7ee1cc8a5df`;
- evidence class: **USER-PROVIDED / DIRECT PX13 TERMINAL SCREENSHOT**.

## 3. Mutation boundary

The staged build and tests passed, but served-identity verification failed. The updater restored the previous static package before returning failure. Therefore:

- no unverified candidate remained installed;
- the private gateway remained available;
- the full private PWA remained on its prior runtime;
- the Day 1 audio patch was not yet accepted in the private PWA.

## 4. Root cause

The QCTP gateway serves `dist` relative to the process working directory. The repository located by the updater was not necessarily the exact static root used by the running port-8787 gateway. Replacing `<located-repository>\dist` therefore did not prove that the live gateway was serving the replacement.

The first live-root probe also contained a PowerShell interpolation defect: the dynamically generated filename was placed immediately before the query delimiter without an explicit `$()` boundary. That caused the request path to differ from the probe filename.

## 5. REV9 architecture

REV9 replaces repository-path assumption with proof:

1. build and verify in a disposable isolated clone;
2. leave the running gateway and active `node_modules` untouched;
3. enumerate plausible QCTP static roots from the controlled checkout, listener command line, an optional explicit hint, and QCTP folders under the user profile;
4. write a unique no-BOM JSON probe to each candidate root;
5. request that exact filename with an explicitly delimited PowerShell interpolation expression;
6. select only the directory whose unique token is returned by port 8787;
7. back up that confirmed live root;
8. mirror the verified `dist` package in place;
9. verify the exact served candidate SHA and audio-fix flag;
10. restore the prior live static package on any failed identity check;
11. report PASS only after the live gateway serves the new identity.

Controlled candidate commit:

`1d437232cc4ff696ac495f2253347a485c231f2e`

## 6. Full Windows live-root deployment simulation

REV9 was tested on Windows Server 2025 / Windows PowerShell with all relevant adverse conditions active:

- the simulated gateway served a `dist` directory outside the repository;
- the active checkout's `esbuild.exe` was held with an exclusive lock;
- the gateway remained alive for the entire updater execution;
- the updater built in an isolated clone;
- live-root discovery had to identify the alternate directory by proof;
- static deployment had to occur in place;
- the exact served candidate identity had to change before PASS.

Evidence:

- workflow: `QCTP Windows updater verification`;
- workflow run ID: `32310120082`;
- job ID: `96251209634`;
- PowerShell parse: **PASS**;
- active-runtime dependency installation: **PASS**, zero vulnerabilities;
- isolated dependency installation: **PASS**, zero vulnerabilities;
- lint: **PASS**;
- typecheck: **PASS**;
- Vitest: **41 files / 233 tests PASS**;
- coverage: 88.77% statements / 79.23% branches / 93.71% functions / 90.42% lines;
- production PWA build: **PASS**;
- dedicated Day 1 audio tests: **4 PASS**;
- alternate live static root discovery: **PASS**;
- in-place static deployment: **PASS**;
- exact served candidate identity: **PASS**;
- final updater result: `QCTP AUDIO PATCH DEPLOYMENT: PASS`;
- final workflow result: **PASS**.

## 7. User route

No new ZIP or extraction is required. The already extracted REV3 locator remains the preservation and branch-alignment entrypoint. On the next run it will fetch REV9 automatically.

Expected heading:

`QCTP audio-patch deployment preflight REV9`

A valid PX13 deployment must show both:

- `QCTP AUDIO PATCH DEPLOYMENT: PASS`
- `QCTP PRIVATE RUNTIME UPDATE: PASS`

After those lines, close and reopen the iPhone Home Screen app and verify the opening cue plus the automatic cue at 24:15.

## 8. Next controlled action

Ryan reruns `RUN_QCTP_AUDIO_PATCH_UPDATE.cmd` from the already extracted REV3 folder. No Codex credits, administrator action, or new download are required.