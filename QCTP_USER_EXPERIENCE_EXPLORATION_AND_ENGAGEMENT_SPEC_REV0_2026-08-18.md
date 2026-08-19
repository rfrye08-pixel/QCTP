# QCTP User Experience, Exploration, and Engagement Specification Rev0

**Document ID:** QCTP-UX-ENGAGEMENT-REV0  
**Date:** 2026-08-18  
**Status:** CONTROLLED PRODUCT-EXPERIENCE AUTHORITY  
**Applies to:** QCTP Rev2 and later mobile/PWA interfaces, navigation, onboarding, visual language, practice player, discovery systems, voice capture, error recovery, accessibility, and engagement  
**Release impact:** specification only; no merge or deployment authority

## 1. Experience goal

QCTP shall feel like a serious personal consciousness laboratory and exploration platform—not a meditation catalog, medical intake form, generic journal, or streak game.

The desired emotional qualities are:

- curiosity;
- anticipation;
- capability;
- calm focus;
- discovery;
- depth;
- ownership;
- visible progress;
- technical trust.

The app should be exciting because the user is gaining real abilities, opening new paths, performing experiments, making artifacts, and discovering patterns—not because the interface manufactures urgency or rewards empty taps.

## 2. North-star user flow

The normal morning flow is:

`OPEN -> SEE TODAY'S MISSION -> AUDIO READY -> START -> PHONE DOWN -> PRACTICE -> VOICE DEBRIEF -> ONE INTEGRATION ACTION -> DONE`

The normal exploration flow is:

`STATE MAP -> CHOOSE PATH OR EXPEDITION -> LEARN -> PRACTICE -> CREATE OR EXPERIMENT -> RECORD -> MIRROR -> INTEGRATE`

No core flow should require navigating through settings, copying files, operating the PX13 manually, or understanding implementation architecture.

## 3. Product-experience principles

### 3.1 Instant usefulness

The first screen must load immediately and display the current usable action. Model availability, synchronization, and analytics may resolve afterward without blocking local functions.

### 3.2 One dominant action

Every primary screen has one obvious action:

- Today: `Begin Today`
- Practice: `Start Session`
- Breath Director: `Begin Selected Breath`
- Studio: `Continue Construction`
- Lab: `Start Protocol`
- Codex: `Capture`
- Mirror: `Ask Mirror`

Secondary controls remain available but visually subordinate.

### 3.3 Explain in context

QCTP shall not front-load a long onboarding lecture. It teaches controls when the user reaches the relevant feature.

### 3.4 Forgiving and recoverable

The app preserves work before processing, supports undo/restore where possible, and makes error recovery obvious. A failure must not cost a completed recording, journal entry, practice result, or experiment protocol.

### 3.5 Capability progress, not streak pressure

QCTP may show consistency and elapsed training, but the primary progress system is:

- state introduced;
- state accessed;
- state stabilized;
- state functional;
- state transferable;
- source track completed;
- experiment calibrated;
- artifact created;
- integration action completed.

No shame language, broken-streak loss, confetti inflation, or artificial scarcity.

### 3.6 Delight with restraint

Motion, sound, geometry, haptics, and visual reveals should make the app feel alive without competing with attention training. Every effect must have a state, navigation, or feedback purpose and support Reduced Motion.

## 4. Information architecture

The target product contains these logical surfaces:

1. **Today** — current mission and one-button start.
2. **State Map** — capability map, prerequisites, reliability, and next unlocks.
3. **Practice** — meditation, breath, Focus, imaginality, and guided-state player.
4. **Explore** — source tracks, skill tracks, lessons, diagrams, and expeditions.
5. **Studio** — geometry, number, harmonics, drawing, and auto-dictation.
6. **Lab** — blinded protocols, OBE, RV, psionics, dreams, and intent experiments.
7. **Codex** — searchable personal record and artifacts.
8. **Mirror** — deterministic insights and Local AI reflections with citations.
9. **Settings / System** — audio packs, PX13 status, storage, export, accessibility, and privacy.

For iPhone bottom navigation, five persistent destinations are recommended:

- Today
- Map
- Practice
- Explore
- More

`More` exposes Studio, Lab, Codex, Mirror, Insights, and Settings with recent/favorite shortcuts. If user testing proves that Capture or Mirror is used more frequently, one may replace Explore while retaining the logical architecture.

A persistent microphone Quick Capture button may float above the navigation, but it must not obscure content or primary controls.

## 5. Today screen

The Today screen is a command center, not a feed.

### 5.1 Today’s Mission card

Required content:

- day and path;
- state or skill target;
- plain-language mission title;
- total time;
- lesson time;
- practice time;
- one-sentence purpose;
- readiness status;
- dominant `Begin Today` button.

Example:

```text
DAY 8 · OPEN AWARENESS
Mission: Hold the whole field
8 min lesson · 20 min practice
Learn to include thoughts and sounds without following them.
AUDIO READY · SAFE ENVIRONMENT REQUIRED
[ Begin Today ]
```

### 5.2 Secondary assignments

Below the primary mission:

- one Breath Foundations session if due;
- one Studio/Lab assignment if active;
- one daily-life integration action;
- incomplete debrief or queued result.

The primary Foundation mission remains visually dominant.

### 5.3 Resume state

If a session was interrupted, the screen clearly offers:

- Resume valid session;
- Restart;
- End without completion.

It does not silently restart or grant credit.

## 6. State Map

The State Map is the central exciting visual system.

### 6.1 Visual concept

Use a constellation, geometric lattice, or layered field map rather than a linear checklist.

Major nodes:

- Regulation
- Coherence
- Focused Attention
- Open Monitoring
- Gap
- Point Consciousness
- Focus 10
- Focus 12
- Receiver State
- Imaginality
- OBE Threshold
- Integration

Source tracks appear as linked paths or overlays, not as claims that terms are identical.

### 6.2 Node states

Each node shows:

- Locked prerequisite
- Introduced
- Accessed
- Stabilized
- Functional
- Transferable
- Remediation recommended

Use shape/icon plus label, never color alone.

### 6.3 Tap behavior

Tapping a node opens a compact State Card:

- what the state is;
- source relationship;
- why it matters;
- current reliability;
- target markers;
- common look-alike;
- next recommended session;
- session history;
- `Train This State` button when permitted.

### 6.4 Progress reveal

New branches reveal when prerequisites pass. The reveal may use a brief geometric animation and haptic, with Reduced Motion support. The user sees a capability explanation rather than generic fireworks.

## 7. Practice cockpit

The practice screen must be simpler than the current information-dense candidate while providing stronger reliability.

### 7.1 Pre-start state

Display:

- session title;
- target state;
- duration;
- guidance tier;
- audio readiness;
- safety readiness;
- posture;
- headphones recommendation;
- `Start`.

Advanced details are one tap away.

### 7.2 Active state

When practice begins, show only:

- current phase;
- remaining time;
- optional concise cue text;
- progress arc;
- Pause;
- End;
- optional dim-screen control.

Hide navigation during a released practice to prevent accidental departure, while keeping an explicit exit.

### 7.3 Low-screen mode

A low-screen mode displays:

- near-black background;
- large time or no time, according to preference;
- small current phase;
- audio/wake status;
- large pause/end targets.

The user can choose `Audio only`, `Audio + phase`, or `Full visual`.

### 7.4 Audio reliability indicator

Before start:

- `AUDIO READY` only after local-pack and playback preflight.

During practice:

- no persistent technical clutter;
- if audio fails, timer pauses and the error occupies the primary screen.

### 7.5 Breath visuals

When Breath Director is active:

- one central orb or geometric form expands/contracts;
- inhale/exhale/hold labels are optional;
- haptics and tones are separately adjustable;
- no fast peripheral motion;
- Reduced Motion uses opacity/brightness changes rather than large movement.

## 8. Lesson experience

Every lesson supports three layers:

### Listen

A polished audio lesson suitable for headphones and eyes-free use.

### Read

A clean, scannable lesson with:

- What you are training
- Why it matters
- Exact mechanics
- What to notice
- Common errors
- Pass criteria

### Deep Dive

Optional source context, diagrams, cross-framework comparisons, evidence classification, and references.

The user is never forced to read the Deep Dive at 4:00 AM.

## 9. Voice-first capture

Voice capture must feel like a native part of every flow.

### 9.1 Post-session debrief

Immediately after practice, show:

- `Speak what happened`
- `Quick ratings`
- `Type instead`
- `Skip and remind me later`

The recording starts only after an explicit tap and audible/visual confirmation.

### 9.2 Smart routing

After recording, the app suggests:

- Raw session observation
- Dream
- OBE
- Remote viewing
- Synchronicity
- Geometry/Studio
- Mirror Journal
- Free note

The suggestion is editable and never changes the raw audio.

### 9.3 One-tap Quick Capture

The microphone button is available from all non-practice primary screens.

Long press or alternate action may start a rapid unclassified note, but a visible Stop control must remain available.

## 10. Explore and source tracks

Explore should create anticipation without becoming a content feed.

### 10.1 Track cards

Each source track card includes:

- source/teacher;
- track purpose;
- capabilities added;
- module count;
- current module;
- relationship to Foundation;
- source-faithful versus QCTP synthesis label.

Initial major tracks:

- Robert Monroe / Monroe Institute
- Thomas Campbell / My Big TOE
- Robert Edward Grant
- Theresa Bullard
- Joe Dispenza
- HeartMath
- Lynne McTaggart
- Controlled Remote Viewing
- Psionics practitioner methods

### 10.2 Expeditions

Advanced, bounded exploration packages may be presented as **Expeditions**:

- Point Consciousness Expedition
- Focus 10 Reliability Expedition
- First Blind RV Series
- Stable Inner Environment Expedition
- Dream Incubation Week
- Geometry and Harmonics Expedition
- Fear and Intent Audit

Each expedition has prerequisites, duration, outputs, and an end condition. It does not endlessly pull the user into content.

## 11. Studio experience

Studio should feel creative and tactile.

Features:

- large reference diagram;
- step-by-step mode;
- full-screen construction mode;
- sparse audio coaching;
- camera capture;
- overlay and measurement;
- auto-dictation;
- artifact gallery;
- connection to related state/source nodes.

Completion should reveal the created artifact in the Codex and State Map rather than only showing a checkbox.

## 12. Lab experience

Lab should feel like a controlled experiment console.

### Before

- question/target;
- method;
- blinding;
- duration;
- scoring plan;
- protocol lock.

### During

- low-distraction capture;
- timestamps;
- voice segments;
- sketches;
- no feedback leakage.

### After

- raw record lock;
- feedback reveal;
- side-by-side comparison;
- scoring;
- calibration update;
- interpretation and learning.

The exciting moment is the feedback reveal, but the app must preserve honest comparison and prevent post-feedback editing of raw data.

## 13. Codex experience

Codex is not a folder list. It is a personal knowledge environment.

Required views:

- Timeline
- Search
- Tags
- Source tracks
- States
- Symbols/themes
- People/relationships
- Experiments
- Artifacts
- Questions
- Revisions

A **Constellation View** may show linked records visually, provided every relation is inspectable and the view has a simple list alternative.

## 14. Mirror experience

### 14.1 Mirror Core

Show deterministic findings as evidence cards:

- repeated theme;
- count;
- date range;
- source records;
- correction/dismiss controls.

### 14.2 Local AI Mirror

The composition screen should guide the user with suggested prompts:

- “What pattern am I repeating?”
- “Compare my stated intentions with completed actions.”
- “What symbols recur across dreams and Studio work?”
- “Where did my interpretation change over time?”
- “What question should I investigate next?”

Status is explicit:

- Local Mirror online
- Queued on iPhone
- Processing on PX13
- Result ready
- Needs retry

Every generated claim links to exact source records. Accept, revise, reject, and annotate are visible without implying that the model is an authority.

## 15. Engagement system

### 15.1 Capability milestones

Examples:

- First self-generated coherence state
- Focused attention stabilized
- Open monitoring held for five minutes
- First content-light Gap interval
- Point consciousness accessed
- Focus 10 stabilized
- Ten blinded RV sessions completed
- Stable imaginality environment mapped three times
- First weekly integration loop completed

Milestones are earned by controlled criteria, not by tapping through content.

### 15.2 Weekly synthesis

At the end of each completed Foundation week, QCTP presents:

- capability delta;
- strongest state marker;
- primary blocker;
- one discovered pattern;
- one artifact or experiment;
- next week’s map reveal;
- one real-life application.

### 15.3 Discovery cards

The app may surface cards based on the user’s own records:

- “This symbol appeared three times.”
- “Your best Focus 10 access occurs before 10 PM.”
- “Appreciation is easier to generate from family memories than achievement memories.”
- “Your confidence was higher than correspondence on the last RV set.”

Every card must cite its source data and allow dismissal/correction.

### 15.4 No dark patterns

Prohibited:

- loss-framed streaks;
- false urgency;
- random rewards;
- manipulative notifications;
- infinite feeds;
- hidden paid dependencies;
- fake AI certainty;
- claiming state attainment from time spent.

## 16. Visual language

### 16.1 Core palette

- midnight/navy base;
- cyan/teal for active awareness and system readiness;
- violet for exploratory/nonordinary-state paths;
- restrained gold for integration, milestones, and high-level synthesis;
- warm neutral for warnings that are not errors;
- red only for actual safety/error conditions.

### 16.2 Geometry

Use circles, fields, lattices, portals, compass forms, and clean constructed geometry as a coherent visual system. Avoid generic chakra clip art, excessive lens flares, and dense “sacred geometry” decoration that reduces legibility.

### 16.3 Motion

Motion must communicate:

- state transition;
- progress;
- breathing cadence;
- node unlock;
- result arrival;
- successful save.

Motion is optional and respects Reduced Motion. Peripheral continuous movement is avoided during practice.

### 16.4 Haptics

Haptics may mark:

- session start;
- breath phase transition;
- major practice transition;
- recording start/stop;
- protocol lock;
- completion.

Each pattern must remain consistent and separately adjustable. No surprise haptics during deep silence unless the user enabled them.

## 17. Onboarding

Initial onboarding is limited to:

1. What QCTP is.
2. How progression works.
3. How local privacy and PX13 services work.

Then the user begins Day 1.

Permissions are requested in context:

- microphone when first recording;
- notifications after a queued result demonstrates value;
- storage persistence when needed;
- wake lock when starting practice.

Every tutorial remains available later from Help.

## 18. Errors and recovery

Error messages use this pattern:

`WHAT HAPPENED -> WHAT WAS PRESERVED -> WHAT TO DO NOW`

Example:

> Guide audio could not start. Your timer is paused at 24:58 and no completion was lost. Check the media volume, then tap Retry Audio.

Avoid implementation messages such as:

- fetch failed;
- provider missing;
- invalid token;
- service worker error;
- IndexedDB transaction aborted.

Technical details may be available under Diagnostics.

## 19. Offline and PX13 states

The user sees product language:

- `Everything needed for this practice is on your iPhone.`
- `PX13 Local Mirror is offline. Your question is queued.`
- `Transcription is waiting for the PX13. Your recording is safe.`

The app never implies that an API key is required for normal use.

## 20. Notifications

Notifications are opt-in, concise, and high value:

- scheduled lesson ready;
- queued Local Mirror result ready;
- transcription complete;
- user-selected reminder;
- experiment feedback available.

Notifications shall not include sensitive journal or Mirror content on the lock screen.

## 21. Accessibility

Requirements:

- Dynamic Type / scalable text;
- 44x44-point minimum primary targets;
- sufficient contrast;
- VoiceOver labels and logical focus order;
- captions/text for every audio instruction;
- no meaning conveyed by color alone;
- Reduced Motion mode;
- haptic and audio alternatives;
- voice-first and type-first capture;
- one-handed portrait use;
- no tiny geometry controls during primary flows.

## 22. Performance targets

- usable Today screen within two seconds on the controlled iPhone under normal local conditions;
- local navigation feels immediate;
- recording begins within one second after permission is established;
- practice Start acknowledges immediately;
- no blocking model load during local capture;
- large local operations show accurate progress;
- active practice screen avoids unnecessary rerenders and battery-heavy animation.

## 23. UX acceptance criteria

The Rev0 experience passes when:

1. a new user can begin Day 1 without entering Settings;
2. returning users can begin the current mission in one tap after readiness;
3. every major screen has one dominant action;
4. the State Map communicates prerequisites and real capability levels;
5. Practice provides audio-ready preflight and fail-closed recovery;
6. post-session voice capture requires no navigation;
7. Explore provides source and skill paths without an infinite feed;
8. Studio and Lab produce visible artifacts/evidence;
9. Codex and Mirror expose source records;
10. core functions remain useful while PX13 is offline;
11. accessibility channels are verified;
12. the interface is reviewed on physical iPhone portrait mode;
13. user testing confirms that the app feels both easier and more compelling than the current candidate.

## 24. Source register

- Apple Human Interface Guidelines — Design Principles: `https://developer.apple.com/design/human-interface-guidelines/design-principles`
- Apple Human Interface Guidelines — Accessibility: `https://developer.apple.com/design/human-interface-guidelines/accessibility/`
- Apple Human Interface Guidelines — Onboarding: `https://developer.apple.com/design/human-interface-guidelines/onboarding`
- Apple Human Interface Guidelines — Motion: `https://developer.apple.com/design/human-interface-guidelines/motion`
- Apple Human Interface Guidelines — Haptics: `https://developer.apple.com/design/human-interface-guidelines/playing-haptics`
- Apple Human Interface Guidelines — Progress Indicators: `https://developer.apple.com/design/human-interface-guidelines/progress-indicators`
- Apple Human Interface Guidelines — Generative AI transparency: `https://developer.apple.com/design/human-interface-guidelines/generative-ai`

## 25. Release status

This document authorizes design and implementation work. It does not authorize merging or deploying an updated QCTP interface.
