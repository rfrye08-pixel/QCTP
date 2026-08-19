# QCTP Private Runtime Updater PowerShell Parse Failure and Rev2 Correction

**Record ID:** `QCTP-UPDATER-PARSE-FAILURE-REV1-CORRECTION-REV2`  
**Date:** 2026-08-19  
**Status:** `REV1 FAILED BEFORE EXECUTION / REV2 CORRECTED PACKAGE DELIVERED / PX13 UPDATE STILL OPEN`  
**Release authority:** `ZERO RELEASE`

## Failure observed

Ryan ran the first downloadable private-runtime updater on the PX13. Windows PowerShell stopped during parsing before any repository update, build, restart, or runtime mutation occurred.

The exact reported parser error was at `QCTP_AudioPatch_Locate_And_Update.ps1:91 char:46`:

`Variable reference is not valid. ':' was not followed by a valid variable name character.`

The offending interpolation was:

```powershell
throw "Command failed with exit code $LASTEXITCODE: $Command $($Arguments -join ' ')"
```

In a double-quoted PowerShell string, the colon immediately after `$LASTEXITCODE` was parsed as part of a scoped-variable reference.

## Correction

The Rev2 updater changes the interpolation to:

```powershell
throw "Command failed with exit code $($LASTEXITCODE): $Command $($Arguments -join ' ')"
```

It also displays an explicit `QCTP updater revision: 2` banner so the corrected package is visually distinguishable from Rev1.

## Verification

- Exact offending token removed: **PASS**.
- Corrected subexpression interpolation present: **PASS**.
- Static scan for other unsafe unbraced `$name:` interpolation patterns, excluding valid scoped variables such as `$env:`: **PASS**.
- ZIP integrity test: **PASS**.
- Corrected package SHA-256: `95ea3be9d0dab614c2ab27fb4e08d2a01990f784033790c14a16024935c0c203`.
- Full execution on Ryan's PX13: **OPEN**.

## Evidence

Ryan supplied a direct screenshot of the failed command window.

- Image: `09846ae7-99ec-4397-ae85-f273a6e5aec5.png`
- Dimensions: `2048 × 1068`
- SHA-256: `caaee747ebefcf41da889724e9c609f49587a4712da76b391a72edafb49a9d96`
- ChatGPT file ID: `file_00000000194c81fdb1e999a30e386c59`
- Evidence class: `USER-PROVIDED / DIRECT PX13 SCREENSHOT`

## Process control

Future downloadable PowerShell utilities must be parser-checked for unsafe variable interpolation before delivery. In particular, variables followed immediately by `:` inside double-quoted strings must use `${name}` or `$($name)` delimiters.

## Next controlled action

Ryan shall extract the corrected Rev2 package into a new folder and run `RUN_QCTP_AUDIO_PATCH_UPDATE.cmd`. The prior extracted Rev1 folder shall not be reused.