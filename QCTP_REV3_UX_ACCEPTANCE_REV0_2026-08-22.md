# QCTP Rev3 UX Acceptance — Rev0

**Result:** `AUTOMATED_WINDOWS_WEBKIT_MOBILE_PASS_PHYSICAL_IPHONE_HOLD_OPEN`
**Release authority:** `ZERO_RELEASE`

This is automated mobile-browser evidence for the Rev3 candidate. It is not a
claim that Ryan physically accepted the interface on an iPhone, completed the
25-minute practice, or selected a narration voice.

## Candidate and harness

- Branch: `qctp-platform-rev3-codex`
- HEAD at capture: `dbe7aa8341107c5b3ed2884dd73e605c17b151dd`
- Working tree at capture: clean. The exact built JS, CSS, manifest, service
  worker, and screenshot hashes are recorded in
  `QCTP_REV3_UX_ACCEPTANCE_REV0_2026-08-22.json`.
- Build command: `npm run build` — PASS, including the preserved Rev1 Day 1
  audio-pack verification of 23 MP3 files / 13,340,411 bytes.
- Preview: loopback-only Vite production preview at
  `http://127.0.0.1:4193`.
- Capture harness: Playwright WebKit 26.5 on Windows with Playwright's
  `iPhone 13` descriptor, equivalent to the repository's `iphone-portrait`
  profile.
- Viewport: 390 × 664 CSS pixels, device scale factor 3, touch/mobile enabled;
  screenshots are 1170 × 1992 pixels and are not full-page composites.
- Locale/timezone: `en-US` / `America/Chicago`.
- Raw run record:
  [`capture-run.json`](controlled-artifacts/rev3-ux/capture-run.json).

## Acceptance performed

| Surface                  | Automated assertions                                                                                                                                                       | Result | Evidence                                                                                                                                                                                           |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Today morning cockpit    | Day 1 heading, local/PX13/PWA status, narrated-voice hold, one-tap Voice-Free control enabled after local media verification, and critical controls at least 44 CSS pixels | PASS   | [`01 Today`](controlled-artifacts/rev3-ux/01-today-morning-cockpit-iphone13-webkit.png)                                                                                                            |
| Durable practice handoff | A valid unresolved early-end issue was stored locally, the page was reloaded, and Today displayed `Needs attention` plus the no-credit message                             | PASS   | [`08 durable issue`](controlled-artifacts/rev3-ux/08-today-durable-practice-issue-iphone13-webkit.png)                                                                                             |
| Voice-Free Day 1         | `25:00`, `OFFLINE AUDIO READY`, exactly six source-grounded phases, and the rejected A03R narration excluded from the UI                                                   | PASS   | [`02 Voice-Free Day 1`](controlled-artifacts/rev3-ux/02-voice-free-day1-iphone13-webkit.png)                                                                                                       |
| Paths                    | Foundation remains primary; Days 2–112 are explicitly unauthored; no horizontal overflow                                                                                   | PASS   | [`03 Paths`](controlled-artifacts/rev3-ux/03-paths-overview-iphone13-webkit.png)                                                                                                                   |
| Breath Foundations       | Seven controlled sessions render with the active-foreground, evidence-gated safety explanation                                                                             | PASS   | [`04 Breath`](controlled-artifacts/rev3-ux/04-breath-foundations-iphone13-webkit.png)                                                                                                              |
| State Atlas              | Twelve controlled states render; the UI says elapsed practice time never advances capability                                                                               | PASS   | [`05 State Atlas`](controlled-artifacts/rev3-ux/05-state-atlas-iphone13-webkit.png)                                                                                                                |
| Blind voice audition     | Physical-gate warning, identical-excerpt framing, A/B/C controls, disabled initial confirmation, no public engine identity or `route_id`, and no horizontal overflow       | PASS   | [`06 audition gate`](controlled-artifacts/rev3-ux/06-blind-voice-audition-iphone13-webkit.png), [`07 audition controls`](controlled-artifacts/rev3-ux/07-blind-voice-controls-iphone13-webkit.png) |

Across the capture run, there were no JavaScript page errors, failed
same-origin requests, paid OpenAI/Anthropic requests, or horizontal overflow.
The browser made two unauthenticated
`/api/transcriptions/policy` restore probes after clean-context loads; both
returned 401 as designed. The companion therefore failed closed, while the app
continued in local-only mode without an API-key error. Those responses are
recorded, not suppressed.

The public audition was checked both through visible text and a direct public
`route-reveal.json` probe. Neither exposed an engine identity or controlled
route mapping. The private mapping is not reproduced in this report.

## What this evidence does not prove

The following physical gates remain open:

- Actual iPhone rendering, safe areas, touch behavior, installed-PWA launch,
  the requested Home Screen icon, and cold-offline startup.
- Actual iPhone/PX13 same-network and private-remote companion behavior in this
  candidate package.
- Audible support continuity, nonverbal phase-marker perception, iPhone audio
  interruption recovery, wake-lock behavior, and a complete 25-minute morning
  session.
- Human naturalness. Ryan must physically listen blind and report only
  `A`, `B`, `C`, or `NONE` plus one observation. Automated checks cannot pass
  that gate.

No merge, deployment, voice integration, or release is authorized by this
artifact. Release authority remains **ZERO RELEASE**.
