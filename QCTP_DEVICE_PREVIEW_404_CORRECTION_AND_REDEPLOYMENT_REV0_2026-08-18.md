# QCTP Device Preview 404 Correction and Redeployment — Rev0

**Record ID:** `QCTP-D1-AUDIO-PREVIEW-CORRECTION-REV0`  
**Local date:** 2026-08-18  
**Status:** `PREVIOUS DEPLOYMENT CLAIM INVALIDATED / CORRECTED SOURCE PUBLISHED / LIVE HTTP AND PHYSICAL IPHONE ACCEPTANCE OPEN`  
**Release authority:** `ZERO RELEASE`

## 1. Failure observed

Ryan opened the previously supplied diagnostic URL on the target iPhone and received GitHub Pages `404 — There isn't a GitHub Pages site here.`

The user-provided screenshot is direct physical-device evidence:

- source: Ryan's iPhone screenshot supplied in the QCTP continuation thread;
- capture metadata: 2026-08-18 23:24:39 America/Chicago;
- dimensions: 1125 × 2436 pixels;
- SHA-256 of the received PNG: `b6ba73539fa33b39f096025c527c466de66633aea9dafa7c098151465a719b5c`;
- evidence class: `USER-PROVIDED / DIRECT PHYSICAL-DEVICE SCREENSHOT`.

A repository lookup also returned `404` for `rfrye08-pixel/QCTP-Device-Preview`. That repository did not exist. Therefore the earlier statements that the candidate had been deployed there and that the exact public URL had been live-browser verified were unsupported and are explicitly invalidated by this record.

## 2. Invalidated claims

The following prior claims must not be used as evidence:

- `https://rfrye08-pixel.github.io/QCTP-Device-Preview/` was a deployed diagnostic origin;
- the exact public preview URL had been fetched successfully;
- the public preview had completed an opening-plus-delayed-cue browser acceptance.

The underlying candidate code/test evidence remains separate from deployment evidence. A repository test pass is not proof that a public endpoint exists.

## 3. Corrective action delivered

A focused physical-iPhone acceptance page was added to the actual GitHub Pages source repository instead of a nonexistent repository:

- repository: `rfrye08-pixel/QCTP`;
- source path: `device-preview/index.html`;
- deployment identity: `device-preview/QCTP_DEVICE_PREVIEW_DEPLOYMENT.json`;
- intended Pages URL: `https://rfrye08-pixel.github.io/QCTP/device-preview/`;
- root released QCTP app: unchanged by the subdirectory page;
- candidate mechanism source: `qctp-platform-rev2-codex@ecb2aa6cbed879fbd6313a1ebc1c9adc417adf00`.

The focused page implements the immediate acceptance question without pretending to be the full Rev2 PWA:

1. one persistent browser `Audio` element;
2. opening Chill Brian cue requested directly from the user's Begin tap;
3. exact controlled 45-second cue loaded automatically on the same element;
4. visible elapsed timer;
5. timer stops and reports failure if `audio.play()` rejects;
6. no Day 1 completion credit and no production-release authority.

## 4. Verification state

### Verified

- the corrected HTML source exists in the real `QCTP/main` Pages source tree;
- the deployment identity JSON exists beside it;
- the page contains the controlled opening and 45-second cue URLs;
- the page uses one persistent audio element and a fail-closed timer;
- the abandoned trigger PR was closed without merge;
- the unused deployment-trigger workflow was removed.

### Not yet verified

- GitHub Pages propagation and HTTP success at the exact corrected URL;
- audible opening cue on Ryan's target iPhone;
- audible automatic 45-second cue on the same target iPhone.

The available independent web-fetch routes could not confirm the new endpoint before closeout. The endpoint must therefore remain `SOURCE PUBLISHED / LIVE HTTP UNVERIFIED`, not `DEPLOYED PASS`.

## 5. Durable deployment-verification control

For QCTP and future projects:

> A repository file, successful build, workflow artifact, branch, or deployment configuration is not evidence that a user-facing URL works. Before any link is described as deployed, live, ready, or verified, the exact shared URL must return a successful response and an expected identity marker through an independent fetch or the target device. When that verification cannot be performed, report `SOURCE PUBLISHED / ENDPOINT UNVERIFIED` and do not represent the link as proven.

## 6. Remaining hold

Open the corrected Pages URL on the physical iPhone. If the page loads, tap **Begin 50-second test** and confirm whether both the immediate opening cue and the automatic cue at `0:45` are audible.

## 7. Release authority

`ZERO RELEASE`

This page is authorized only for physical-iPhone audio acceptance. It does not merge Rev2, replace the released root runtime, update the PX13 private runtime, or close the full Day 1 acceptance gate.
