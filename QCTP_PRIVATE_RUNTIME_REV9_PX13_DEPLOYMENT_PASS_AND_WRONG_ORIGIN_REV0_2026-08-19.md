# QCTP Private Runtime REV9 PX13 Deployment PASS and Wrong-Origin Diagnosis — Rev0

**Record ID:** `QCTP-PX13-REV9-DEPLOY-PASS-ORIGIN-MISMATCH-REV0`  
**Date:** 2026-08-19  
**Status:** `PX13 STATIC DEPLOYMENT PASS / PRIVATE IPHONE ORIGIN NOT YET OPENED / FULL-PWA AUDIO RETEST OPEN`  
**Release authority:** `ZERO_RELEASE`

## 1. PX13 deployment result

Ryan provided direct PX13 terminal evidence showing that REV9 completed successfully against candidate:

`1d437232cc4ff696ac495f2253347a485c231f2e`

The terminal established:

- the existing private gateway on port 8787 was healthy;
- the exact static root served by port 8787 was discovered by proof;
- the live static root was confirmed as `C:\Users\nfrye\Documents\Codex\2026-08-17\execute-qctp-codex-rev2-handoff-rev0\work\QCTP\dist`;
- the verified PWA package was mirrored into that live root;
- exact served-build identity verification passed;
- `QCTP AUDIO PATCH DEPLOYMENT: PASS` was reported;
- `QCTP PRIVATE RUNTIME UPDATE: PASS` was reported.

Evidence:

- source: Ryan's direct PX13 terminal screenshot;
- image dimensions: 2048 × 1152 pixels;
- received PNG size: 563,867 bytes;
- SHA-256: `55fe787d8824340432bf7f456dba75172b99c6788123ff0306bd41d7c4d3dc22`;
- ChatGPT file ID: `file_000000006ae88230862dac5bfe61af0c`;
- evidence class: **USER-PROVIDED / DIRECT PX13 TERMINAL SCREENSHOT**.

## 2. iPhone origin mismatch

Ryan then provided an iPhone screenshot showing:

- browser origin `rfrye08-pixel.github.io`;
- visible app version `Rev 1.1.4`;
- the Rev1 navigation set `Today / Lesson / Practice / Workbook / Progress / More`;
- error text `Chill Brian audio could not load. Check the connection, then restart this section.`

This is the released public GitHub Pages Rev1.1.4 app. It is not the private PX13 Rev2 PWA updated by REV9. Therefore the displayed audio failure does not test or invalidate the REV9 private-runtime deployment.

Evidence:

- source: Ryan's direct physical-iPhone screenshot;
- image dimensions: 1179 × 2556 pixels;
- received PNG size: 425,135 bytes;
- SHA-256: `a84109620f1e8e920a5903b941d038ac24058a1490706bf50ec33938f9bde8a3`;
- ChatGPT file ID: `file_000000005fe081fd937ea54ed48e5b38`;
- evidence class: **USER-PROVIDED / DIRECT PHYSICAL-IPHONE SCREENSHOT**.

## 3. Correct origin contract

The full Rev2 app must be opened through the private Tailscale Serve HTTPS origin for machine `REOS`. The correct URL:

- ends in `.ts.net`;
- does not use `rfrye08-pixel.github.io`;
- does not append `:8787`, because port 8787 is the loopback service behind Tailscale Serve;
- does not append `/QCTP` or `/device-preview`;
- requires Tailscale to be connected on the iPhone.

The exact private tailnet DNS suffix is not stored in the controlled repository and shall not be guessed. It must be read from the PX13 using:

`"%ProgramFiles%\Tailscale\tailscale.exe" serve status`

The complete `https://...ts.net` line shown by that command is the authoritative Safari URL.

## 4. Visual identity check

The correct Rev2 PWA uses the navigation set:

`Today / Paths / Practice / Studio / More`

The old public Rev1.1.4 PWA uses:

`Today / Lesson / Practice / Workbook / Progress / More`

An iPhone screen showing `rfrye08-pixel.github.io` or `Rev 1.1.4` is not an acceptable private Rev2 test origin.

## 5. Current disposition

- REV9 PX13 static deployment: **PASS**.
- Private gateway served candidate identity: **PASS**.
- Public GitHub Pages Rev1.1.4 app: unchanged and not part of the REV9 deployment.
- Full private-PWA physical-iPhone audio retest: **OPEN** because the private `.ts.net` origin has not yet been opened in the latest evidence.
- Rev2 merge/release: **ZERO RELEASE**.

## 6. Next controlled action

On the PX13, run `"%ProgramFiles%\Tailscale\tailscale.exe" serve status`, copy the complete `https://...ts.net` line into Safari with Tailscale connected, and verify that the Rev2 navigation is visible before beginning the opening-plus-24:15 audio check.