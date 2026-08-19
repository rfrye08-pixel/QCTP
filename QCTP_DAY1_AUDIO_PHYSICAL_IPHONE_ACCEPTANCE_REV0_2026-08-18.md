# QCTP Day 1 Audio Physical-iPhone Acceptance — Rev0

**Record ID:** `QCTP-D1-AUDIO-PHYSICAL-IPHONE-ACCEPTANCE-REV0`  
**Acceptance time:** 2026-08-18T23:52:42-05:00  
**Target:** Ryan's physical iPhone  
**Acceptance page:** `https://rfrye08-pixel.github.io/QCTP/device-preview/`  
**Release authority:** `ZERO RELEASE`

## 1. Result

**PASS — both controlled cues were audible on the target physical iPhone.**

Ryan completed the focused 50-second test and explicitly reported:

> Both cues were audible

The accepted events were:

1. the opening Chill Brian cue started audibly from the user's **Begin 50-second test** action;
2. the second controlled cue started audibly and automatically at 45 seconds without another tap;
3. the page remained loaded through test completion.

## 2. Evidence

### User report

- provenance: direct statement from Ryan in the active QCTP continuation thread;
- statement: `Both cues were audible`;
- evidence class: **USER-REPORTED PHYSICAL-DEVICE ACCEPTANCE**.

### Supporting screenshot

- supplied by Ryan from the same physical-iPhone test;
- visible result: corrected QCTP Day 1 audio-check page loaded and displayed `Test complete. Report whether the opening cue and the automatic 0:45 cue were both audible.`;
- image dimensions: 1125 × 2436 pixels;
- received PNG size: 994,234 bytes;
- SHA-256: `bb8d517df0713522eb8bed732bd016c68a1c27dab621d3b8148888f64287f38b`;
- ChatGPT file ID: `file_00000000fdac81fda3b27450d8421a56`;
- evidence class: **USER-PROVIDED / DIRECT PHYSICAL-DEVICE SCREENSHOT SUPPORT**.

The screenshot proves the corrected endpoint loaded and the test reached completion. Audibility is established by Ryan's direct report, not inferred from pixels.

## 3. Acceptance closed

This closes the focused physical-iPhone acceptance for the corrected audio mechanism:

- exact corrected public endpoint loaded: **PASS**;
- opening cue audible: **PASS**;
- delayed 45-second cue audible automatically: **PASS**;
- persistent single-audio-element mechanism on target iPhone: **FUNCTIONALLY ACCEPTED FOR OPENING/DELAYED-CUE TEST**.

## 4. What this does not close

This focused page is not the full private Rev2 runtime. This result does not by itself prove:

- that the older PX13-served `dist` has been replaced;
- that the complete private PWA now contains the patch;
- background/lock-screen/Bluetooth-route behavior;
- the complete natural 1,500-second Day 1 session;
- Rev1 migration, remaining device lifecycle, or full release acceptance;
- Rev2 merge or production release.

## 5. Required continuation

The corrected candidate must now be pulled, built, and restarted on the PX13 private runtime. After that update, the opening and 45-second cues must be checked once in the full private QCTP PWA before the original practice-blocking regression is considered closed in the actual runtime.

## 6. Release authority

`ZERO RELEASE`

The focused device test passes, but PR #2 remains draft and unmerged. The released root Rev1.1.4 app and the private PX13 runtime remain under their existing authority until separately updated and accepted.
