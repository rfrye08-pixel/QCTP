# QCTP Day 1 Audio-Patch Deployment

This candidate includes the physical-iPhone Day 1 guide-audio correction.

## One-step PX13 deployment

From the local QCTP repository, double-click:

`DEPLOY_QCTP_AUDIO_PATCH.cmd`

The wrapper invokes `tools/Deploy-QctpAudioPatch.ps1`, which:

1. refuses a dirty worktree;
2. synchronizes `qctp-platform-rev2-codex` using fast-forward-only Git operations;
3. verifies that the required iPhone audio-fix commit is present;
4. checks all controlled Day 1 neural-audio assets;
5. runs the repository verification/build gates and the dedicated audio regression tests;
6. runs the browser acceptance suite in Chromium and WebKit;
7. refreshes the existing private QCTP runtime when an approved scheduled task is discoverable, or leaves an already-running gateway in place to serve the rebuilt `dist` files;
8. verifies the loopback health and PWA endpoints.

## Accelerated verification behavior

The 90-second diagnostic sequence uses local tone markers and never requests the external Chill Brian cue files. It remains deterministic, works without a neural-audio connection, and cannot earn Day 1 completion. The real 25-minute mode remains fail-closed: if required guide narration cannot start, its authoritative timer pauses.

## Physical-iPhone acceptance

After the script reports `QCTP AUDIO PATCH DEPLOYMENT: PASS`:

1. fully close the installed QCTP Home Screen app;
2. reopen it;
3. select **Practice** and tap **Begin practice**;
4. confirm the opening Chill Brian cue is audible immediately;
5. leave the screen open and confirm the second cue plays automatically at `24:15`;
6. choose **End without completion** after that second cue.

This 50-second check closes the immediate audio regression only. It does not grant natural Day 1 completion or Rev2 release authority.
