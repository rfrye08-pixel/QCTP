# QCTP Day 1 Private-iPhone External-Audio Failure and Same-Origin REV10 Recovery — Rev0

**Record ID:** `QCTP-D1-PRIVATE-IPHONE-EXTERNAL-AUDIO-FAILURE-REV10-RECOVERY-REV0`  
**Date:** 2026-08-19  
**Status:** `CORRECT PRIVATE ORIGIN FAILURE CONFIRMED / REV10 ALL MACHINE GATES PASS / PX13 INSTALL AND PHYSICAL RETEST OPEN`  
**Release authority:** `ZERO_RELEASE`

## 1. Correct-origin physical failure

Ryan opened the private Rev2 PWA at:

`https://reos.tail6ed282.ts.net/`

The iPhone screen showed the Rev2 navigation `Today / Paths / Practice / Studio / More`. In guided Day 1, the opening cue did not become audible. The fail-closed player paused the authoritative timer at 24:49 and displayed the guide-audio blocked notice.

Evidence:

- source: Ryan's direct physical-iPhone screenshot and direct report in the active QCTP thread;
- ChatGPT file ID: `file_000000004eac81fd88a5ee03c67f709d`;
- mounted image dimensions: 1125 × 2436 pixels;
- mounted image size: 635,656 bytes;
- mounted image SHA-256: `784b64f1e6efa3066ccb71092796bc31c6ed1cc7c7399f8287cd7c284189dffd`;
- evidence class: **USER-PROVIDED / DIRECT PHYSICAL-IPHONE SCREENSHOT AND REPORT**.

The evidence closes the earlier wrong-origin ambiguity. This was a genuine failure of the private Rev2 PWA, not the public Rev1.1.4 site.

## 2. Failure boundary

The fail-closed behavior worked correctly:

- the timer did not continue silently;
- no morning completion was earned;
- the session remained incomplete;
- the previously deployed private app remained otherwise available.

## 3. Root cause

The protected Rev1.1.4 source references were correctly preserved for regression lineage, but Rev2 had incorrectly continued using them as live runtime media URLs:

- lesson playback used the external `resource2.heygen.ai` lesson URL;
- practice playback assigned each external `cue.audioUrl` to the reusable audio element.

The focused public device test had proved that the persistent iPhone audio-element mechanism could work. It had not removed the full private app's dependency on a third-party media origin. That external dependency was the remaining system-level failure.

## 4. REV10 correction

Controlled candidate branch:

`qctp-platform-rev2-codex`

Current candidate head:

`86de3a1a4dad034615afb198f7fd90a7e2056e49`

REV10 implements the permanent route:

- the protected external URLs remain frozen only as source-lineage records;
- lesson, preview, and all 21 practice cues are committed under `public/audio/day1/`;
- all 23 runtime assets use their true MP3 container and `.mp3` extension;
- all runtime playback resolves from the PWA's own origin;
- the lesson and practice player contain no live third-party audio address;
- the persistent reusable audio element remains;
- playback rejection still pauses the authoritative timer;
- the complete Day 1 audio pack is precached by the PWA service worker;
- every production build verifies the pack before building;
- the private gateway CSP allows same-origin media and removes `resource2.heygen.ai`;
- the updater verifies the source pack, built pack, manifest, MP3 framing, exact hashes, served identity, opening cue, and 45-second cue;
- any failed served-identity or media verification restores the previous static package.

## 5. Controlled local Day 1 pack

- schema: `qctp-day1-local-audio-pack-v2`;
- media type: `audio/mpeg`;
- file count: 23;
- total bytes: 13,340,411;
- manifest SHA-256: `63294f74eb4f5426eae3c8b42cdf89a2adb09ccae54e06c41264a528b2db40a5`;
- runtime root: same-origin `/audio/day1/`;
- lesson: `lesson.mp3`;
- opening cue: `cue-0000.mp3`;
- automatic 45-second cue: `cue-0045.mp3`.

## 6. Exact-head verification

All three final gates ran against candidate head `86de3a1a4dad034615afb198f7fd90a7e2056e49`.

### 6.1 Full candidate gate

- workflow run: `32322451181`;
- job: `96287184044`;
- result: **PASS**;
- local audio materialization and export: **PASS**;
- dependency installation: **PASS**, zero vulnerabilities;
- formatting, lint, and TypeScript: **PASS**;
- Vitest: **43 files / 238 tests PASS**;
- production PWA build: **PASS**;
- service-worker audio precache: **PASS**;
- Playwright: **16 passed / 6 controlled skips / 0 failed**;
- physical-profile same-origin audio contract: **PASS in Chromium and iPhone portrait projects**;
- local Whisper: **44 tests PASS / 99.17% coverage**, Ruff, basedpyright, and ty pass.

Artifacts:

- exact-head local audio archive: artifact `9390224954`, SHA-256 `c37161efa3f238073b2a063e477c3fa5014d0ea78fa2dd8f8594dd2540a2c9a1`;
- exact-head PWA distribution: artifact `9390273418`, SHA-256 `6b5f7200d02b5902007b7739f905ca98d9db7232e5f96dbbdcb7cda3e174a24a`.

### 6.2 Day 1 audio smoke gate

- workflow run: `32322451214`;
- job: `96287156046`;
- result: **PASS**;
- complete repository check: **PASS**;
- dedicated audio/sequencer boundary: **PASS**;
- packaged PWA distribution: **PASS**.

### 6.3 Windows updater gate

- workflow run: `32322451183`;
- job: `96287155892`;
- result: **PASS**;
- Windows Server 2025 / Windows PowerShell parser: **PASS**;
- active `esbuild.exe` exclusive-lock simulation: **PASS**;
- running gateway with static root outside the repository: **PASS**;
- isolated dependency install and build: **PASS**;
- source and built local-audio pack verification: **PASS**;
- proof-based live-root discovery: **PASS**;
- in-place deployment: **PASS**;
- exact served build identity: **PASS**;
- served manifest, media type, byte count, and hashes: **PASS**;
- served opening and 45-second cue exact-byte verification: **PASS**;
- rollback contract: **PASS**;
- final result: `QCTP SAME-ORIGIN AUDIO DEPLOYMENT: PASS` and `Full Windows same-origin live-root deployment simulation: PASS`.

## 7. Current runtime boundary

The machine-verified REV10 candidate is not yet installed on Ryan's PX13. The private PWA currently serves the earlier Rev9 static package that still dereferences external audio. Therefore:

- REV10 machine verification: **PASS**;
- REV10 PX13 installation: **OPEN**;
- REV10 physical-iPhone opening cue: **OPEN**;
- REV10 physical-iPhone automatic 24:15 cue: **OPEN**;
- natural 1,500-second Day 1 completion: **OPEN**;
- public merge/release: **ZERO RELEASE**.

## 8. User route

No new ZIP, Codex usage, administrator action, or manual Git operation is required. The already extracted REV3 locator remains the entrypoint and fetches the current controlled branch.

Required terminal markers:

- `QCTP same-origin audio deployment preflight REV10`;
- `QCTP SAME-ORIGIN AUDIO DEPLOYMENT: PASS`;
- `QCTP PRIVATE RUNTIME UPDATE: PASS`.

After PASS, the private PWA must visibly state that its narration is same-origin and checksum-verified before the physical cue test begins.

## 9. Next controlled action

Ryan reruns `RUN_QCTP_AUDIO_PATCH_UPDATE.cmd` from the already extracted REV3 folder, then reopens `https://reos.tail6ed282.ts.net/` and confirms the opening cue plus the automatic cue at 24:15.