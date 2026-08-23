# Rev3 mobile UX evidence capture

This harness captures the Rev3 candidate mobile surfaces with Playwright WebKit on
Windows using Playwright's `iPhone 13` device descriptor. It is automated
browser evidence, not physical iPhone acceptance.

From the repository root:

1. Run `npm run build`.
2. Serve the built package on a loopback preview URL, for example
   `npx vite preview --host 127.0.0.1 --port 4193`.
3. Run
   `QCTP_UX_BASE_URL=http://127.0.0.1:4193 node tools/rev3-ux/capture-rev3-mobile-ux.mjs`
   (`$env:QCTP_UX_BASE_URL=...` in PowerShell).

The harness fails on horizontal overflow, a missing 44-CSS-pixel critical tap
target, page errors, paid-cloud requests, or any public blind-audition route
identity. It saves screenshots and `capture-run.json` under
`controlled-artifacts/rev3-ux/`.

An unauthenticated `/api/transcriptions/policy` response is recorded rather
than hidden. In a clean browser context this is the companion's fail-closed
session-restore probe; the UI must remain usable in local-only mode. Physical
iPhone rendering, touch, safe-area, audio, cold-offline, and installed-PWA
checks remain separate holds.

Release authority remains **ZERO RELEASE**.
