# QCTP Private Runtime Updater False PASS and Audio-Signature Failure — Rev0

**Record ID:** `QCTP-PX13-UPDATER-FALSE-PASS-REV0`  
**Date:** 2026-08-19  
**Status:** `FAILED BEFORE INSTALL/BUILD/RESTART / FALSE PASS INVALIDATED / REV5 WINDOWS-VERIFIED`  
**Release authority:** `ZERO RELEASE`

## 1. User-observed failure

Ryan reran the existing REV3 private-runtime locator/updater on the PX13 after the restricted-Range-header correction.

The locator successfully:

- fetched the controlled candidate;
- aligned the local candidate branch to `c8e110942c291360d60838223c3e81ab425cc79e`;
- entered `QCTP audio-patch deployment preflight REV4`.

The inner deployment script then failed during its external neural-audio byte-signature check:

`Downloaded response is not a RIFF/WAVE asset (header: ???? / ?).`

Despite that inner failure, the outer locator incorrectly printed:

`QCTP PRIVATE RUNTIME UPDATE: PASS`

and

`QCTP updater finished successfully.`

That green PASS is invalid. The inner deployment explicitly failed.

## 2. Evidence

- source: Ryan's PX13 terminal screenshot supplied in the active QCTP continuation thread;
- image dimensions: 2048 × 1068 pixels;
- received PNG size: 454,124 bytes;
- SHA-256: `2f4d8c91302349e8e8372dcd9d179823a6beb0aa040f1598c7aac8aa2894d61b`;
- ChatGPT file ID: `file_000000007d8881fb9e3c387c4d787a0f`;
- evidence class: **USER-PROVIDED / DIRECT PX13 TERMINAL SCREENSHOT**.

## 3. Mutation boundary

The deployment failed before:

- `npm ci`;
- lint, typecheck, coverage, or production build;
- dedicated iPhone audio regression tests;
- gateway stop or restart;
- private runtime replacement;
- runtime build-identity verification.

Therefore the PX13 private QCTP runtime remained on its prior build. The controlled checkout alignment and previously created recovery branch/bundle remain valid.

## 4. Root causes

### 4.1 Invalid external byte-signature gate

The deployment treated a strict `RIFF` / `WAVE` signature from a Windows PowerShell download as a release-blocking requirement for every provider URL. That is not a reliable deployment gate for the provider response path and contradicted stronger available evidence: the same opening and delayed cue mechanism had already played audibly on Ryan's physical iPhone.

The correct controls are:

- verify the controlled audio inventory is present in the source definition;
- preserve the target-iPhone acceptance evidence;
- make runtime playback fail closed if a cue cannot start;
- do not block a local build on a provider-byte-format probe that is not the actual target playback path.

### 4.2 Child exit-code propagation failure

The stable deployment entrypoint was a PowerShell wrapper that invoked another script but did not explicitly propagate that child script's nonzero exit status. The child printed `FAILED`, while the outer updater received a successful process exit and printed a false PASS.

This violated the QCTP fail-closed requirement.

## 5. REV5 corrective implementation

The controlled candidate now uses `tools/Deploy-QctpAudioPatch.ps1` as a direct REV5 deployment implementation rather than a nested wrapper.

REV5:

1. validates the controlled Day 1 audio-reference inventory without external byte-signature probing;
2. runs `npm ci`;
3. runs Windows-safe lint, typecheck, coverage, and production-build gates;
4. runs the dedicated Day 1 audio regression tests;
5. writes `dist/QCTP_PRIVATE_RUNTIME_BUILD.json` containing the exact candidate SHA;
6. restarts the private gateway;
7. verifies `/health`, the PWA root, and the exact served build identity;
8. returns a real nonzero process exit on any failure;
9. prints PASS only after the new build is proven to be the build served by port 8787.

Controlled branch head:

`882dc26bffa49eef3647ed78ffc22b230f4f2852`

## 6. Windows verification performed before another PX13 attempt

A dedicated Windows PowerShell GitHub Actions gate was added and executed against REV5.

- workflow: `QCTP Windows updater verification`;
- workflow run ID: `32248851370`;
- job ID: `96055205805`;
- runner: Windows Server 2025 / Windows PowerShell;
- PowerShell parse: **PASS**;
- `npm ci`: **PASS**, zero vulnerabilities;
- ESLint: **PASS**;
- TypeScript: **PASS**;
- Vitest coverage: **41 files / 233 tests PASS**;
- coverage: 88.77% statements / 79.23% branches / 93.71% functions / 90.42% lines;
- production Vite/PWA build: **PASS**;
- dedicated `PracticeScreen` audio tests: **4 PASS**;
- runtime identity artifact creation: **PASS**;
- final result: `QCTP AUDIO PATCH BUILD VERIFICATION: PASS`.

The Day 1 audio-smoke workflow also passed for the same candidate commit.

## 7. User route

No new ZIP is required. The already extracted REV3 locator/updater remains the correct locator and preservation layer. On its next run it will fetch head `882dc26...`, align the checkout, and invoke the direct REV5 script.

The expected line is:

`QCTP audio-patch deployment preflight REV5`

A successful deployment must show both:

- `QCTP AUDIO PATCH DEPLOYMENT: PASS`
- `QCTP PRIVATE RUNTIME UPDATE: PASS`

## 8. Acceptance still required

After the true deployment PASS:

1. fully close the QCTP Home Screen app on the iPhone;
2. reopen the full private QCTP PWA;
3. begin Day 1;
4. confirm the opening cue is audible;
5. confirm the automatic cue at 24:15 is audible;
6. end without completion after the second cue.

## 9. Next controlled action

Close the false-PASS terminal window and rerun `RUN_QCTP_AUDIO_PATCH_UPDATE.cmd` from the already extracted REV3 folder. No new download or extraction is required.
