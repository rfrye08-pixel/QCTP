# QCTP Private Runtime Updater Range-Header Failure and REV4 Recovery — Rev0

**Record ID:** `QCTP-PX13-UPDATER-RANGE-HEADER-REV0`  
**Date:** 2026-08-19  
**Status:** `FAILED BEFORE INSTALL/BUILD/RESTART / REMOTE DEPLOYMENT CORE CORRECTED / SAME REV3 LAUNCHER MAY BE RERUN`  
**Release authority:** `ZERO RELEASE`

## 1. User-observed failure

Ryan ran the extracted REV3 private-runtime updater on the PX13. The updater successfully:

- located the existing QCTP checkout;
- preserved the divergent local line in `qctp-local-preserved-20260819-054112`;
- created a portable recovery bundle under `Documents\QCTP Recovery Backups`;
- aligned the controlled local candidate branch to GitHub;
- entered the repository deployment preflight.

The deployment then stopped while checking the Day 1 neural-audio URLs. Windows PowerShell rejected this use of `Invoke-WebRequest`:

`-Headers @{ Range = 'bytes=0-1023' }`

The exact error was:

`The 'Range' header must be modified using the appropriate property or method. Parameter name: name`

## 2. Evidence

- source: Ryan's PX13 terminal screenshot supplied in the active QCTP continuation thread;
- image dimensions: 2048 × 1068 pixels;
- received PNG size: 526,133 bytes;
- SHA-256: `43c7ca5b8062281bcff7f63c77f7145de8fdc99fdcba45bb5e371c9e02da6765`;
- ChatGPT file ID: `file_000000009bf882308b2cfb7b81ca6625`;
- evidence class: **USER-PROVIDED / DIRECT PX13 TERMINAL SCREENSHOT**.

## 3. Mutation boundary

The failure occurred before:

- `npm ci`;
- formatting, lint, type, coverage, or production build;
- the dedicated iPhone audio tests;
- browser tests;
- gateway stop or restart;
- replacement of the private `dist` package.

The private PX13 runtime therefore remains on its previous build. The controlled checkout is aligned and the earlier divergent local work remains preserved.

## 4. Root cause

Windows PowerShell 5.1 treats `Range` as a restricted web-request header when supplied through the generic `-Headers` hashtable. The request was rejected by PowerShell before the remote WAV asset could be evaluated. This was a deployment-script compatibility defect, not evidence that the Chill Brian asset was unavailable.

## 5. Corrective implementation

The candidate branch now routes deployment through `tools/Deploy-QctpAudioPatchRev4.ps1`.

REV4:

1. performs a normal HTTPS GET into a unique temporary file instead of setting a restricted Range header;
2. verifies that the downloaded object is nonempty and has `RIFF` / `WAVE` header identity;
3. deletes the temporary file after each check;
4. remains compatible with Windows PowerShell 5.1;
5. preserves the existing complete verification, build, restart, and health-check sequence;
6. refuses to deploy unless the checkout already matches the controlled remote branch.

The stable entrypoint `tools/Deploy-QctpAudioPatch.ps1` is now a wrapper for the REV4 core.

Controlled branch head after correction:

`c8e110942c291360d60838223c3e81ab425cc79e`

## 6. User route

No new ZIP is required. The existing extracted REV3 locator/updater will fetch the corrected remote branch on its next run, align the local checkout, and invoke REV4 automatically.

## 7. Acceptance

The private runtime update passes only when the same REV3 launcher reports:

`QCTP PRIVATE RUNTIME UPDATE: PASS`

After that, the full private QCTP PWA must audibly play the opening Day 1 cue and the automatic cue at 24:15 on Ryan's physical iPhone.

## 8. Next controlled action

Close the failed command window and rerun `RUN_QCTP_AUDIO_PATCH_UPDATE.cmd` from the already extracted REV3 folder. No new download or extraction is required.
