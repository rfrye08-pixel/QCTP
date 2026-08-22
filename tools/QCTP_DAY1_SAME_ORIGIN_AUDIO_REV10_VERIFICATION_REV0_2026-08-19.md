# QCTP Day 1 Same-Origin Audio REV10 Verification — Rev0

**Record ID:** `QCTP-D1-SAME-ORIGIN-AUDIO-REV10-VERIFY-REV0`  
**Date:** 2026-08-19  
**Controlled branch:** `qctp-platform-rev2-codex`  
**Verified implementation head:** `05a4b81158ca389305b2aa13854cf41ce8ce2ae5`  
**Disposition:** `ALL MACHINE GATES PASS / PX13 INSTALL AND PHYSICAL IPHONE RETEST OPEN`  
**Release authority:** `ZERO_RELEASE`

## 1. Physical failure that opened this action

Ryan opened the correct private Rev2 origin, `https://reos.tail6ed282.ts.net/`, and began Day 1 in guided mode. The opening cue did not start. The fail-closed player paused the authoritative timer at 24:49 and displayed the guide-audio blocked notice.

Evidence:

- direct physical-iPhone screenshot supplied by Ryan;
- ChatGPT file ID: `file_000000004eac81fd88a5ee03c67f709d`;
- mounted image dimensions: 1125 × 2436 pixels;
- mounted image size: 635,656 bytes;
- mounted image SHA-256: `784b64f1e6efa3066ccb71092796bc31c6ed1cc7c7399f8287cd7c284189dffd`;
- evidence class: **USER-PROVIDED / DIRECT PHYSICAL-IPHONE SCREENSHOT**.

The screenshot proves the correct private origin, correct Rev2 navigation, and fail-closed timer behavior. Ryan's report and the displayed error establish that the cue was inaudible.

## 2. Root cause

The Rev2 player had retained the protected Rev1.1.4 external source URLs as live runtime URLs:

- the lesson `<audio>` element loaded `CHILL_BRIAN_AUDIO.lesson` from `resource2.heygen.ai`;
- each practice cue assigned `cue.audioUrl` from the same external host.

The focused public diagnostic test showed that the persistent iPhone audio element could work, but it did not eliminate the full app's dependency on a third-party media origin. The correct private PWA therefore still failed whenever that external media path was rejected or unavailable.

## 3. Implemented correction

REV10 makes Day 1 playback same-origin and checksum-controlled:

- the protected source references remain frozen for lineage and regression checking;
- the lesson, preview, and all 21 cue assets are packaged under `public/audio/day1/`;
- all 23 runtime files use their true MP3 container and `.mp3` extension;
- runtime playback resolves through the PWA's own base URL rather than an external hostname;
- the lesson and cue player use the local map exclusively;
- the persistent reusable audio element and fail-closed timer remain intact;
- the service worker precaches the complete local Day 1 audio pack;
- the private gateway CSP permits only same-origin media and removes `resource2.heygen.ai`;
- every production build verifies the committed pack before Vite runs;
- the Windows updater verifies the source pack, built pack, served manifest, cue 0, cue 45, exact hashes, media type, and served build identity;
- a failed identity or media verification restores the previous private static package.

## 4. Controlled local audio pack

- schema: `qctp-day1-local-audio-pack-v2`;
- media type: `audio/mpeg`;
- file count: 23;
- total bytes: 13,340,411;
- manifest SHA-256: `63294f74eb4f5426eae3c8b42cdf89a2adb09ccae54e06c41264a528b2db40a5`;
- runtime root: same-origin `/audio/day1/`;
- lesson: `lesson.mp3`;
- opening cue: `cue-0000.mp3`;
- first delayed cue: `cue-0045.mp3`.

The pack preserves the exact downloaded audio bytes while correcting the misleading `.wav` filename extension used by the remote source URLs.

## 5. Full candidate verification

Workflow run `32321602244`, job `96284750895`:

- local audio materialization/verification: **PASS**;
- dependency installation: **PASS**, zero vulnerabilities;
- formatting: **PASS**;
- lint: **PASS**;
- TypeScript: **PASS**;
- Vitest: **43 files / 238 tests PASS**;
- coverage: 88.72% statements / 79.22% branches / 93.60% functions / 90.38% lines;
- production PWA build: **PASS**;
- PWA precache: **38 entries / 14,130.74 KiB**, including the Day 1 pack;
- Playwright: **16 passed / 6 controlled skips / 0 failed**;
- same-origin audio browser acceptance: **PASS in Chromium and iPhone portrait projects**;
- local Whisper: **44 tests PASS / 99.17% coverage**, Ruff, basedpyright, and ty pass.

Artifacts:

- local audio artifact ID `9389942037`, archive SHA-256 `7b91b22bdb8589f5ac49bc7e89212735200728393a55a1707747442792ec9e65`;
- production dist artifact ID `9389998822`, archive SHA-256 `88f7e9e3ccebb1a6f253ecdc401665b9b0f0dee830be892726566cfeacfe50cb`.

## 6. Dedicated Day 1 smoke verification

Workflow run `32321602227`, job `96284750709`:

- complete repository check: **PASS**;
- dedicated audio/sequencer boundary: **PASS**;
- packaged distribution: **PASS**.

## 7. Windows PowerShell and live-root deployment simulation

Workflow run `32321602180`, job `96284797112`, on Windows Server 2025 / Windows PowerShell 5.1:

- updater parser check: **PASS**;
- active checkout `esbuild.exe` held with an exclusive lock;
- simulated gateway kept running throughout;
- gateway static root placed outside the repository;
- isolated dependency install: **PASS**, zero vulnerabilities;
- lint/type/coverage/build: **PASS**;
- Vitest: **43 files / 238 tests PASS**;
- dedicated same-origin tests: **3 files / 9 tests PASS**;
- local source and built packs: **PASS**, exact manifest SHA-256;
- proof-based live-root discovery: **PASS**;
- in-place static deployment: **PASS**;
- exact runtime identity: **PASS**;
- served manifest schema/count/bytes/media type: **PASS**;
- served opening and 45-second cues: **PASS**, exact size and SHA-256;
- final updater result: `QCTP SAME-ORIGIN AUDIO DEPLOYMENT: PASS`;
- final workflow result: `Full Windows same-origin live-root deployment simulation: PASS`.

## 8. Current boundary

The candidate code and deployment route are machine-verified. The currently running PX13 private PWA still serves the earlier external-audio package until Ryan reruns the existing locator/updater. Therefore no physical-iPhone audio PASS is claimed for REV10 yet.

## 9. Next controlled action

Run the existing `RUN_QCTP_AUDIO_PATCH_UPDATE.cmd` from the already extracted REV3 folder. Require the `REV10` heading, `QCTP SAME-ORIGIN AUDIO DEPLOYMENT: PASS`, and `QCTP PRIVATE RUNTIME UPDATE: PASS`. Then reopen the private iPhone PWA and confirm the opening cue plus the automatic cue at 24:15.
