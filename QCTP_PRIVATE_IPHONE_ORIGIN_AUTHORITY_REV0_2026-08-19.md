# QCTP Private iPhone Origin Authority — Rev0

**Record ID:** `QCTP-PRIVATE-IPHONE-ORIGIN-REV0`  
**Date:** 2026-08-19  
**Status:** `EXACT PRIVATE HTTPS ORIGIN VERIFIED FROM PX13 TAILSCALE SERVE STATUS`  
**Release authority:** `DEVICE_TEST_CANDIDATE / REV2 ZERO RELEASE`

## Exact Safari origin

`https://reos.tail6ed282.ts.net/`

This is the authoritative private iPhone origin for the PX13-hosted QCTP Rev2 PWA.

Tailscale Serve status reported:

- origin: `https://reos.tail6ed282.ts.net`;
- access: `tailnet only`;
- route: `/`;
- proxy target: `http://127.0.0.1:8787`.

## Evidence

- source: Ryan's direct PX13 Command Prompt screenshot;
- image dimensions: 2048 × 1068 pixels;
- received PNG size: 134,360 bytes;
- SHA-256: `a7b0485443e7c727231d7f4beb90e4ab489de2b00da4be6737298b8b2ad9e82b`;
- ChatGPT file ID: `file_000000007b6881fb8b9b626ffa858d0c`;
- evidence class: **USER-PROVIDED / DIRECT PX13 TERMINAL SCREENSHOT**.

## Use contract

1. Tailscale must be connected on the iPhone.
2. Open the exact URL in Safari.
3. Do not append `:8787`, `/QCTP`, or `/device-preview`.
4. Do not use `rfrye08-pixel.github.io` for Rev2 testing.
5. Confirm Rev2 navigation: `Today / Paths / Practice / Studio / More`.
6. After successful loading, add this exact origin to the iPhone Home Screen and retire the old Rev1.1.4 icon.

## Next controlled action

Open the exact private origin on the physical iPhone, confirm Rev2 navigation, then verify the opening Day 1 cue and the automatic cue at 24:15.