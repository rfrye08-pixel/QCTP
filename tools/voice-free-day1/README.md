# Rev3 P0 Voice-Free Day 1 evidence

This directory owns the deterministic support-marker build and evidence gate for
the 1,500-second Voice-Free Day 1 morning package. It does not render narration.

## Controlled build

The marker builder always extracts the three technical support beds from pinned
Rev3 commit `a2093caa714332313fa7196f3dc58a67a2d721d2`, verifies their original
SHA-256 values, and adds the same 260 ms nonverbal signal 400 ms before each
phase boundary at 180, 480, 780, 1,380, and 1,440 seconds. It does not change
timing, use a voice engine, or time-stretch media.

```powershell
& "$env:LOCALAPPDATA\QCTP\voice-audition-env\Scripts\python.exe" `
  tools/voice-free-day1/build_phase_marked_support.py
```

## Verification

Build the PWA first so the verifier can inspect the actual Workbox precache:

```powershell
npm run build
npx vitest run src/practice/voice-free-day1.evidence.test.ts `
  src/practice/voice-free-day1.test.ts `
  src/practice/use-voice-free-day1-session.test.tsx
& "$env:LOCALAPPDATA\QCTP\voice-audition-env\Scripts\python.exe" `
  tools/voice-free-day1/verify_voice_free_day1.py
node tools/voice-free-day1/verify_voice_free_day1_browser.mjs
```

The verifier checks the exact six source ranges against the five cue-part files
at the pinned main authority commit, media identity and duration, continuous
support, clipping, all five phase markers, the optional acoustic HeartMath rail,
the visual five/five-or-comfortable no-hold rail, the full-return and completion
gate, public/runtime narration exclusion, preserved A03R quarantine hashes, and
the built offline precache.

Machine PASS keeps the physical iPhone morning-mode gate open and never grants
release authority, narrated-content acceptance, or state attainment.
