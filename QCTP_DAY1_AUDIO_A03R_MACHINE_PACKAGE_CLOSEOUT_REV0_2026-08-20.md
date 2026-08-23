# QCTP-D1-AUDIO-A03R Machine Package Closeout — Rev0

Controlled closeout time: `2026-08-20T21:29:20-05:00`

## Result

**MACHINE PACKAGE COMPLETE / PHYSICAL IPHONE ACCEPTANCE OPEN.**

The locked 35-cue Day 1 script was rendered, integrated with continuous anti-startle support, verified, retained, and published as a five-minute non-credit device candidate.

## Delivered

- Public five-minute candidate: https://rfrye08-pixel.github.io/QCTP/device-preview/a03/
- 25-minute voice stem and Ambient, Binaural Low A, and Minimal Continuity support stems.
- Three five-minute acceptance composites.
- Continuous support, predictive markers, bed ducking, fades, source map, and no-completion-credit guard.
- Diagnostic artifact retained before the fail-closed publication gate.

## Verified

- Locked script SHA-256: `2649ce70e5ab824dbc6b797e07082567fda2443962016e8e6c7dbe454f5ee555`
- Critical-cue ASR: `PASS`, four of four cues, normalized WER `0.0`.
- Acoustic/timing/package gate: `PASS`.
- Continuous-support and clipping gates: `PASS`.
- Predictive pre-cue marker gate: `PASS`.
- Binaural left/right frequency-separation gate: `PASS`.
- Chromium playback/asset gate: `PASS`.
- WebKit iPhone-profile playback/asset gate: `PASS`.
- Workflow run ID: `32438955834`; job ID: `96645641762`.
- Diagnostic artifact ID: `9431976673`; digest: `sha256:fa1f390714faba0faacbb1a0a7f0c68184f74617bad8d294a2628306800febc0`.
- Verified package artifact ID: `9431977804`; digest: `sha256:66bbde054f659422b13f4b2d80bb119e702f1ce50dfeef9707267d54a025e5ef`.
- Gate-summary schema/result: `qctp-a03r-gate-summary-v1` / `PASS`.
- Machine schema/result: `qctp-day1-a03-machine-verification-v2` / `PASS`.

## Published file SHA-256

- `acceptance-ambient.mp3`: `cc75cb78aea097fbe2441e4db9a1319f9996884e5cbab1bca39d0386db24c7e0`
- `acceptance-binaural-low-a.mp3`: `9e4367fdf6dccba1cb7704930a36a26bb11bb9c12346920b2cb5f2a423bec3ce`
- `acceptance-minimal.mp3`: `b2d51b9215fc7332477490222556a8e77d3510482f9888477fd5101d8c0c5011`
- `critical-asr.json`: `38ac81e35703abafc6c7c788246d1faf4d544f951a0f7609f07c3abc0aff8bb4`
- `gate-summary.json`: `08499c79349b9b733cff95bb06198e16b88a4dae5e1b63912764f00b53ac5c56`
- `index.html`: `742052b67f23ae73265f48d6098a61cf57b0d1313e43eeead6cf1acb23116ea9`
- `machine-verification.json`: `4b13d81b10b9615c06082dcffb98eda0bdbd634ced51721729c9b6f7b7a18e52`
- `manifest.json`: `4add48d038c516bf9ae27c3c5468dd7fa1e4c64c3b7254572ec881e8152aa541`

## State change

`QCTP_CURRENT_STATE.json` advanced from v16 to v17. `QCTP_MACRO_DELIVERABLE_MANIFEST_REV10.json` supersedes Rev9. A03R is closed at machine-package level; A04 is active.

## Macro-deliverable delta

QCTP-R10-D06 advanced from OPEN to MACHINE_PACKAGE_COMPLETE_PHYSICAL_ACCEPTANCE_OPEN. The remaining D06 blocker is the physical iPhone content-acceptance test.

## Release authority

- Test candidate: `AUTHORIZED`.
- Physical iPhone content acceptance: `OPEN`.
- Private-runtime installation: `NOT AUTHORIZED`.
- Rev2 merge/public release: `ZERO_RELEASE`.

## Next controlled action

`QCTP-D1-AUDIO-A04` — Perform one five-minute physical iPhone Safari acceptance test with stereo headphones, starting with Binaural Low A, then report startle, voice, breathing, support-bed, marker, and return observations.
