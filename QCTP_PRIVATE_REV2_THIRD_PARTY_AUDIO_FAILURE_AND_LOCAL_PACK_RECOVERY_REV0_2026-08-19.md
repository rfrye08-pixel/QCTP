# QCTP Private Rev2 Third-Party Audio Failure and Local-Pack Recovery — Rev0

**Record ID:** `QCTP-PRIVATE-REV2-LOCAL-AUDIO-RECOVERY-REV0`  
**Date:** 2026-08-19  
**Status:** `CORRECT PRIVATE ORIGIN FAILURE CONFIRMED / SAME-ORIGIN LOCAL AUDIO MACHINE AND WINDOWS GATES PASS / PX13 DEPLOYMENT OPEN`  
**Release authority:** `ZERO_RELEASE`

## 1. Physical-iPhone observation

Ryan opened the correct private Rev2 origin:

`https://reos.tail6ed282.ts.net/`

The physical-iPhone screen showed the Rev2 navigation set:

`Today / Paths / Practice / Studio / More`

The Day 1 opening cue did not play. The fail-closed player paused the authoritative timer near 24:49 and displayed the blocked-guide-audio notice rather than continuing silently.

Evidence:

- source: Ryan's direct physical-iPhone screenshot in the active QCTP thread;
- conversation file ID: `file_000000004eac81fd88a5ee03c67f709d`;
- mounted evidence path: `/mnt/data/E0FFCDD1-DFB0-43E8-8829-23A8FBD8BB9C.png`;
- evidence class: **USER-PROVIDED / DIRECT PHYSICAL-IPHONE SCREENSHOT**.

Disposition:

- correct private origin: **PASS**;
- Rev2 interface identity: **PASS**;
- fail-closed timer behavior: **PASS**;
- live third-party opening narration: **FAIL**;
- interrupted session completion credit: **NONE**.

## 2. Root cause

The deployed Rev2 player still assigned the protected `resource2.heygen.ai` URLs directly to the lesson and cue audio elements. The persistent iPhone audio-element correction removed one class of media-authorization failure, but the full meditation remained dependent on a live third-party origin during every session.

The third-party runtime dependency was therefore removed instead of adding another retry or connection workaround.

## 3. Same-origin Day 1 audio package

The controlled recovery packages the protected Chill Brian Day 1 set inside the QCTP PWA:

- one lesson narration;
- one voice preview;
- 21 timed practice cues;
- 23 total audio files;
- 13,340,411 total audio bytes;
- true media format: MP3 / `audio/mpeg`;
- SHA-256 recorded and verified for every file;
- manifest schema: `qctp-day1-local-audio-pack-v2`;
- runtime root: `/audio/day1/`;
- stale MP3-under-WAV naming removed;
- live HeyGen browser dependency removed;
- lesson and cue playback routed through the same private QCTP origin;
- Day 1 local files included in the PWA service-worker precache.

The protected source URLs remain only as provenance and regeneration authority. They are not used by the meditation runtime.

## 4. Machine verification

Controlling candidate evidence:

`QCTP_LOCAL_AUDIO_MACHINE_VERIFICATION_REV0.json` on `qctp-platform-rev2-codex`

The machine gate is created only after all of the following pass:

- exact dependency installation;
- formatting and lint;
- TypeScript build;
- full Vitest coverage suite;
- production PWA build;
- Chromium and iPhone-portrait Playwright suite;
- local Whisper pytest, ruff, basedpyright, and ty gates;
- 23 source MP3 checksum checks;
- 23 built MP3 checksum checks;
- no stale WAV files;
- no `resource2.heygen.ai` reference in built JavaScript or HTML;
- service-worker precache includes the lesson, opening cue, delayed cue, final cue, and manifest;
- lesson and practice source use the same-origin audio map.

Disposition: **MACHINE VERIFICATION PASS**.

## 5. Windows deployment verification

Controlling Windows evidence:

`QCTP_LOCAL_AUDIO_WINDOWS_VERIFICATION_REV0.json` on `qctp-platform-rev2-codex`

The Windows gate verifies the actual deployment architecture under the adverse conditions that previously caused PX13 failures:

- Windows PowerShell parser pass;
- active `esbuild.exe` held with an exclusive lock;
- private gateway kept running throughout;
- live static root located outside the repository assumption;
- isolated staging build;
- proof-based live-root discovery;
- in-place static mirror;
- exact served-build identity;
- served local-audio manifest;
- opening local MP3 returned through the gateway;
- automatic 45-second local MP3 returned through the gateway;
- rollback contract retained;
- no third-party runtime audio required.

Disposition: **WINDOWS LIVE-ROOT DEPLOYMENT SIMULATION PASS**.

## 6. Deployment contract

The existing extracted REV3 locator/updater remains the user entrypoint. It fetches the current candidate branch automatically; no new ZIP, Codex usage, administrator action, or manual branch selection is required.

The verified deployment core identifies itself as:

`QCTP local-audio deployment preflight REV10`

A valid PX13 installation must end with both:

- `QCTP LOCAL AUDIO DEPLOYMENT: PASS`
- `QCTP PRIVATE RUNTIME UPDATE: PASS`

The updater rejects the deployment unless the built package contains the exact 23-file checksum manifest, contains no live HeyGen runtime dependency, and port 8787 serves the exact local-audio candidate identity.

## 7. Remaining physical acceptance

After PX13 deployment:

1. fully close the private QCTP Home Screen app on the iPhone;
2. reopen `https://reos.tail6ed282.ts.net/` with Tailscale connected;
3. begin Day 1;
4. confirm the opening narration is audible;
5. confirm the automatic cue at 24:15 is audible;
6. end the diagnostic session after the second cue.

A full natural 1,500-second Day 1 acceptance remains a later release gate.

## 8. Release authority

- same-origin local-audio package: `PX13_DEVICE_TEST_CANDIDATE`;
- Rev2 merge: `ZERO_RELEASE`;
- public production release: `ZERO_RELEASE`;
- paid cloud services: `NOT_AUTHORIZED`.

## 9. Next controlled action

Run the existing `RUN_QCTP_AUDIO_PATCH_UPDATE.cmd` from the extracted REV3 updater folder, require the REV10 heading and both final PASS lines, then perform the physical-iPhone opening-plus-24:15 local-audio check.