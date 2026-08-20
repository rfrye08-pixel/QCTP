# QCTP Day 1 Guidance, Breath, and Sound Protocol — Rev1

**Document ID:** `QCTP-D1-GUIDANCE-SOUND-REV1`  
**Date:** 2026-08-20  
**Status:** `CONTROLLED CONTENT AND AUDIO DESIGN / IMPLEMENTATION AND PHYSICAL ACCEPTANCE OPEN / ZERO RELEASE`  
**Supersedes for Day 1 guidance and audio experience:** `QCTP_DAY1_HARDENING_DELTA_AND_CANDIDATE_SCRIPT_REV0_2026-08-18.md`  
**Preserves:** the controlled 25-minute phase allocation, Day 1 target capabilities, Chill Brian voice identity, local/offline audio requirement, fail-closed completion behavior, and capability-credit separation  
**Parent authorities:**

- `QCTP_TRAINING_PROTOCOL_HARDENING_AND_INSTRUCTION_STANDARD_REV0_2026-08-18.md`
- `QCTP_STATE_ATLAS_AND_CORE_MEDITATION_RECIPES_REV0_2026-08-18.md`
- `QCTP_MEDITATION_AUTHORING_AUDIO_ASSET_AND_QA_STANDARD_REV0_2026-08-18.md`
- `QCTP_BREATHWORK_AND_RESPIRATORY_CONTROL_SPEC_REV0_2026-08-17.md`
- `QCTP_DAY1_FIRST_NATURAL_SESSION_GUIDANCE_AUDIT_REV0_2026-08-20.md`

## 1. Purpose

Day 1 shall function as an instructor-led state-control training session, not as sparse spoken prose separated by unpredictable silence.

The revised session must:

1. teach Ryan exactly how to perform the physical and attentional actions;
2. coach the initial breathing pattern in real time;
3. preserve a calm, continuous auditory environment;
4. make every voice entrance predictable before speech begins;
5. reduce verbal density as the user becomes more stable;
6. distinguish practice completion from state access;
7. adapt future guidance from direct user experience;
8. remain fully local, offline-capable, and zero-recurring-cost by default.

## 2. Evidence basis and classification

### USER-REPORTED

Ryan completed the entire first natural-duration session and reported no usable breath coaching, inadequate guidance, and startle when the voice entered after silence.

### MEASURED

The controlled current cue pack contains long inter-cue silences, high narration rates, a compressed return, and no continuous sound bed or active pre-cue marker. Exact measurements are recorded in `QCTP_DAY1_FIRST_NATURAL_SESSION_GUIDANCE_AUDIT_REV0_2026-08-20.md`.

### PUBLISHED

The design draws on published work showing that:

- slow breathing near six breaths per minute and prolonged expiration can alter autonomic measures;
- a weak familiar acoustic signal before an abrupt alert can reduce measured startle and perceived aversiveness;
- binaural-beat audio has produced changes in anxiety, pain, or auditory-cortex coherence in multiple controlled studies, while the exact response varies by protocol;
- Monroe and Thomas Campbell training systems deliberately use sustained sound technologies and binaural tracks rather than isolated voice interruptions.

Representative sources:

- Komori, *The relaxation effect of prolonged expiratory breathing*, PMID `30046408`;
- Solcà et al., *Binaural beats increase interhemispheric alpha-band coherence between auditory cortices*, PMID `26541421`;
- Garcia-Argibay et al., binaural-beat meta-analysis, PMID `30073406`;
- Ingendoh et al., systematic review of oscillatory effects, PMID `37205669`;
- Swerdlow et al., prepulse and perceived intensity, PMID `17118517`;
- Kearney et al., prepulse reduction of paramedic alert startle, PMID `38164815`;
- Bach et al., rising sound intensity as a warning cue, PMID `17490992`;
- Monroe Sound Science official description;
- Thomas Campbell / My Big TOE official binaural-beat training description.

### ENGINEERING CANDIDATE

Exact sound-bed frequencies, carrier levels, cue-marker timbre, fades, and mix levels are controlled design candidates. They shall be accepted through physical-iPhone A/B testing and Ryan's state/comfort reports rather than treated as guaranteed state attainment.

## 3. Preserved Day 1 phase allocation

| Phase | Absolute time | Duration |
| --- | ---: | ---: |
| Physical Settling | 00:00–03:00 | 3:00 |
| Coherent State and Breath Induction | 03:00–08:00 | 5:00 |
| Focused Attention | 08:00–13:00 | 5:00 |
| Open Monitoring / Spatial Awareness | 13:00–23:00 | 10:00 |
| Pure Observation and Return | 23:00–25:00 | 2:00 |

Total duration remains exactly **1,500 seconds**.

## 4. Core audio architecture

### 4.1 Continuous-session rule

Day 1 shall no longer be experienced as 21 independently started voice files.

The candidate player shall use continuous 25-minute media that begins from the user's single Start action and remains authorized throughout the session.

Preferred architecture:

- **Voice stem:** one continuous 25:00 stereo-compatible file containing narration, pre-cue markers, designed silence, and return;
- **Support-bed stem:** one continuous 25:00 stereo file containing the ambient texture, optional binaural component, phase transitions, and breath rail;
- both stems start from the same user gesture and use one session clock;
- the voice stem's media time is the authoritative practice time;
- independent voice and support-bed gain controls are available;
- the player checks drift and fails closed if synchronization exceeds the controlled tolerance.

Fail-safe architecture:

- one pre-rendered 25:00 composite mix at the approved Low Support level;
- used automatically when the target browser cannot prove stable two-stem playback;
- preserves all cue timing and anti-startle behavior at the cost of separate mix control.

No required spoken cue may rely on a delayed third-party request or a fresh unauthorized media element.

### 4.2 Why a continuous bed is required

The support bed has four defined functions:

1. eliminate the perceptual jump from digital silence to a human voice;
2. provide a stable auditory reference during eyes-closed practice;
3. carry breath pacing and phase-transition information without excessive speech;
4. support the Monroe/Campbell lineage through an optional binaural component.

The bed is not decorative music. It shall contain no lyrics, melody that invites anticipation, recognizable environmental events, or sudden spatial motion.

## 5. Support-bed design

### 5.1 User modes

The Practice readiness screen shall provide:

- `OFF — voice and cue marker only`;
- `AMBIENT — continuous texture without binaural difference`;
- `BINAURAL LOW — default for Ryan's Day 1 candidate`;
- `BINAURAL MEDIUM — optional after Low is accepted`.

Binaural modes require stereo headphones. If stereo headphone use is not confirmed, QCTP switches to the matched Ambient bed rather than pretending the binaural component is active.

### 5.2 Bed content

The support bed shall combine:

- softly filtered pink/brown noise;
- a low-information harmonic drone;
- a very low-level binaural carrier pair when selected;
- slow phase changes that do not produce clicks or obvious musical events;
- the breath rail during the controlled-breath phase;
- shallow level ducking around speech.

### 5.3 Candidate binaural trajectory

The following is the first controlled Day 1 profile:

| Phase | Difference frequency | Candidate function |
| --- | ---: | --- |
| 00:00–03:00 | 10 Hz | relaxed alertness during physical settling |
| 03:00–08:00 | 8 Hz | calm coherence while preserving awareness |
| 08:00–13:00 | 10 Hz | support deliberate focused attention |
| 13:00–20:00 | 8 Hz | support broad spatial awareness |
| 20:00–23:00 | gradual 8→7 Hz | reduce analytical effort without targeting sleep |
| 23:00–24:20 | 7 Hz | support pure observation |
| 24:20–25:00 | gradual 7→10 Hz | assist reorientation and alert return |

Candidate carrier center: approximately **220 Hz**, using symmetrical left/right offsets around the center. Frequency changes crossfade or slew over at least 15–20 seconds; no phase discontinuity or click is permitted.

Capability credit is based on Ryan's observed state markers, not on the selected frequency number.

### 5.4 Level targets

Initial production targets:

- voice stem: approximately **−19 to −17 LUFS integrated**;
- true peak: no higher than **−3 dBTP**;
- Low support bed: approximately **12–15 dB below the narration's perceived level**;
- Medium support bed: approximately **8–11 dB below narration**;
- binaural carriers remain embedded below the total support-bed level and shall not sound like exposed test tones;
- cue marker remains audible above the bed but below the voice;
- segment-to-segment voice loudness variance: no more than approximately **±0.5 LU** after mastering.

The user controls voice and bed independently within bounded ranges. The app shall not allow the bed to mask instructions.

## 6. Anti-startle cue grammar

### 6.1 Predictability orientation

Before the timed session, QCTP plays a short calibration sequence:

1. three seconds of the selected support bed;
2. the exact soft cue marker;
3. one short Chill Brian sentence;
4. a volume-confirmation control.

The guide explains:

> “You will hear this same soft signal before every instruction. It means the guide is about to speak.”

The timed session cannot begin until Ryan confirms that the voice is comfortable and the marker is noticeable without being sharp.

### 6.2 Every spoken cue

For each non-opening cue:

- **T−0.90 s:** support bed begins a smooth 2.5–4 dB duck;
- **T−0.40 s:** the familiar soft marker begins;
- marker duration: approximately 200–300 ms;
- marker attack: at least 80–120 ms, with no click or sharp bell transient;
- **T−0.10 s:** marker has ended;
- **T0:** voice begins with a 200–300 ms fade-in;
- voice ends with a 350–500 ms fade-out;
- support bed returns over approximately 700–1,000 ms.

The marker shall be a quiet, stable, familiar signature—not a dramatic chime, alarm, whoosh, rising siren, or approaching spatial sound.

### 6.3 Phase transitions

Major phase changes use a 2–4 second harmonic or textural transition embedded in the bed. The transition precedes the spoken phase instruction and is learned during the preview.

No abrupt bell is permitted at 03:00, 08:00, 13:00, 23:00, or 24:20.

### 6.4 Haptics

A gentle haptic may be offered as an accessibility option. It is disabled by default for Ryan until a physical test establishes that it does not create a second startle source.

## 7. Narration production standard

### 7.1 Delivery character

Chill Brian remains the controlled voice, but the script and render must produce:

- calm, conversational coaching;
- no announcer voice;
- no mystical performance;
- no sleep-hypnosis affect unless sleep is the target;
- neutral confidence;
- deliberate pauses inside instructions;
- one executable action per sentence where practical.

### 7.2 Word-rate limits

| Cue type | Target range | Hard candidate maximum |
| --- | ---: | ---: |
| Opening orientation / teaching | 100–115 WPM | 125 WPM |
| Active induction / breath coaching | 90–110 WPM | 120 WPM |
| Deep-state reminders | 82–100 WPM | 110 WPM |
| Correction cues | 95–115 WPM | 125 WPM |
| Return / safety | 105–120 WPM | 125 WPM |

No render may retain the current 176 WPM coherence cue or 203 WPM return behavior.

### 7.3 Sentence and cue limits

- most sentences: no more than 18 spoken words;
- each sentence performs one action or one correction;
- deep-state cues should normally remain under 25 seconds;
- instructional detail belongs in the early Teach phase or pre-session orientation;
- silence remains real, but never perceptually unannounced.

## 8. Exact Day 1 breath coaching

### 8.1 Selected method

`QCTP-B1 — Foundation Resonance Breath`

- inhale: **4 seconds**;
- exhale: **6 seconds**;
- rate: **6 breaths per minute**;
- hold: **none**;
- inhale route: **nose**;
- exhale route: **nose by default**;
- volume: quiet and comfortable, approximately 60–75% of a full comfortable breath;
- controlled duration inside Day 1: approximately 03:00–07:15;
- critical transition: deliberate pacing ends and breathing becomes natural before focused attention begins.

### 8.2 Mechanical coaching

The guide must teach:

- lower ribs, side ribs, back ribs, and abdomen expand gently together;
- shoulders remain mostly quiet;
- the abdomen is not pushed outward forcefully;
- the throat remains unstrained;
- the exhale is smooth and is not squeezed empty;
- no deliberate pause is inserted after inhale or exhale;
- slow breathing does not mean large breathing.

### 8.3 Real-time breath rail

After the initial spoken demonstration, the bed carries a subtle 10-second breath cycle:

- 4-second inhale phase;
- 6-second exhale phase;
- no abrupt edge between phases;
- shallow amplitude or timbral movement rather than a loud rising sweep;
- optional quiet spoken count for the first three cycles only;
- no requirement to watch the screen.

### 8.4 Correction logic

If Ryan experiences air hunger, tension, repeated yawning, tingling, dizziness, or a large recovery-breath urge:

1. reduce breath volume;
2. change to 5 seconds in / 5 seconds out if needed;
3. return to natural breathing if discomfort remains;
4. preserve the meditation as a regulated natural-breath session rather than forcing the cadence.

At approximately 07:15, the guide explicitly ends deliberate pacing:

> “Stop following the count. Let the next breath occur by itself.”

## 9. Revised Teach-tier 25-minute script

The exact spoken copy remains subject to voice-duration QA, but the actions, order, and absolute phase boundaries are controlled by this protocol. Cue timestamps may move by no more than the tolerance required to fit the locked audio without changing phase boundaries.

Every cue after the opening uses the anti-startle marker defined in Section 6.

### Physical Settling — 00:00–03:00

#### D1-G1-000 — 00:00 — Orient

> Sit upright with both feet supported. Rest your hands. Let the spine be neutral, not rigid. Close your eyes. Feel the chair beneath you. For now, do not change the breath. Notice the state you brought into the session.

#### D1-G1-035 — 00:35 — Release face and shoulders

> Separate the teeth slightly. Let the tongue rest. Soften the forehead and the muscles around the eyes. Notice the shoulders. On the next exhale, reduce their effort by about ten percent.

#### D1-G1-070 — 01:10 — Release torso and hands

> Notice the chest, abdomen, hands, and pelvis. Do not command them to relax. Feel the effort already present. Allow one small release on each natural exhale.

#### D1-G1-110 — 01:50 — Release legs and stabilize posture

> Feel both legs and both feet. Let unnecessary effort drain downward. If the posture collapses, restore support without becoming rigid. Alert and relaxed can exist together.

#### D1-G1-150 — 02:30 — Whole-body baseline

> Include the whole body at once: contact, weight, temperature, and tension. If thought carries you away, return to one contact point, then include the whole body again.

### Coherence and Controlled Breath — 03:00–08:00

#### D1-G1-180 — 03:00 — Exact breath mechanics

> Now use a quiet paced breath. Inhale through the nose for four. One, two, three, four. Exhale smoothly for six. One, two, three, four, five, six. Do not hold. Do not fill completely. Let the lower ribs and abdomen widen gently while the shoulders stay quiet.

The breath rail begins under the end of this cue.

#### D1-G1-240 — 04:00 — Breath-volume correction

> Slow does not mean large. Keep the airflow quiet. Do not squeeze empty. If you need a recovery breath, make each paced breath smaller. Use five in and five out if four and six is uncomfortable.

#### D1-G1-280 — 04:40 — Chest attention

> Keep the gentle rhythm. Place attention at the center of the chest. Imagine the breath moving through that area while the lungs continue breathing normally.

#### D1-G1-320 — 05:20 — Generate appreciation

> Recall one specific moment that produces genuine appreciation, care, gratitude, or quiet awe. Use one scene. Notice the response in the chest, face, breathing, or eyes.

#### D1-G1-380 — 06:20 — Release the story

> Let the scene fade. Keep the body state it produced. If the feeling weakens, bring back the scene for one breath, then release the story again.

#### D1-G1-430 — 07:10 — Release breath control

> Complete this exhale. Stop following the count. Let the next breath occur by itself. Keep the appreciation state while breathing becomes natural.

The breath rail fades gradually and ends.

#### D1-G1-465 — 07:45 — Transition

> In a moment, release the emotional exercise. Attention will narrow to one natural sensation.

### Focused Attention — 08:00–13:00

#### D1-G1-480 — 08:00 — Select the object

> Place attention on the physical sensation of breathing at the nostrils. Do not change the breath. Count one complete inhale and exhale as one. Continue to ten, then return to one.

#### D1-G1-555 — 09:15 — Train recovery

> When you notice planning, memory, sound, or commentary, label the event once as captured. Return to the nostril sensation. Restart at one only if the count was lost. Recognition and return are the repetition.

#### D1-G1-630 — 10:30 — Reduce effort

> Soften the eyes and forehead. Keep the breath sensation clear without squeezing attention around it. If you are becoming sleepy, sit slightly taller and deepen one natural breath.

#### D1-G1-705 — 11:45 — Release counting

> Stop counting. Follow the beginning, middle, and end of each natural breath sensation. Notice whether a thought can begin without automatically becoming a full storyline.

#### D1-G1-750 — 12:30 — Widening transition

> Attention will widen now. You are not losing clarity. You are including more without selecting one thing.

### Open Monitoring / Spatial Awareness — 13:00–23:00

#### D1-G1-780 — 13:00 — Head volume

> Notice the three-dimensional volume occupied by the head: behind the forehead, behind the eyes, between the ears, and above the mouth. Do not picture anatomy. Notice volume.

#### D1-G1-850 — 14:10 — Surrounding space

> Include the space immediately around the head. Let sounds remain at their locations. If you are forcing the visual field to become dark, relax the eyes and include hearing.

#### D1-G1-925 — 15:25 — Whole-body volume

> Include the chest, abdomen, pelvis, arms, hands, legs, and feet together. Stop scanning one part after another. Feel the body as one volume.

#### D1-G1-1000 — 16:40 — Space around the body

> Include several inches of space around the body, then the space between you and the room boundaries. Do not create a glowing shell. Notice the space already present.

#### D1-G1-1080 — 18:00 — Room volume

> Include the entire room as one volume. Let the body remain inside that larger field. Avoid naming objects unless a practical safety need appears.

#### D1-G1-1165 — 19:25 — Auditory field

> Notice the nearest sound and the farthest sound. Then let all sounds exist together. Nothing needs to be pulled toward you or pushed away.

#### D1-G1-1250 — 20:50 — One field

> Let breath, body sensations, sounds, visual darkness, emotion, and thoughts exist in one field. A thought may appear without being followed. If you become absorbed, return to one breath for three cycles, then widen again.

#### D1-G1-1325 — 22:05 — State correction

> If effort is increasing, reduce it by half. If sleep is taking over, feel the chair and open the eyes slightly. Awareness should become broader, not absent.

#### D1-G1-1360 — 22:40 — Release active expansion

> Stop deliberately expanding. Let the full field remain by itself. No scanning, counting, or construction is required.

### Pure Observation and Return — 23:00–25:00

#### D1-G1-1380 — 23:00 — Pure observation

> Notice thoughts, sounds, sensations, and breathing without selecting one. Do not try to stop content. If a brief content-light interval occurs, do nothing to extend it.

#### D1-G1-1430 — 23:50 — Awareness cue

> Notice that experience is being known. Do not explain it. Remain alert and let the next moment arrive without preparation.

#### D1-G1-1460 — 24:20 — Begin return

> Take one slightly deeper breath. Feel the chair, both feet, and both hands. Move the fingers gently. Let the support sound become brighter as attention returns to the room.

#### D1-G1-1485 — 24:45 — Orient and open eyes

> Open the eyes. Name the room, the time of day, and what you will do next. Keep a small amount of broad awareness while ordinary activity returns.

### End — 25:00

The timer reaches 0:00 only after the complete return. Natural completion requires successful local persistence or safe queueing.

## 10. Guidance tiers

### Teach — default for the first natural session

- all cues in Section 9;
- spoken breath count for the first three controlled cycles;
- full correction support;
- support bed defaults to Binaural Low for Ryan;
- state markers explained before the timer begins.

### Coach

- all phase openings;
- one breath correction;
- one focused-attention correction;
- one open-monitoring correction;
- full return;
- fewer intermediate cues.

### Test

- opening orientation;
- breath-pattern entry and release;
- phase-transition markers;
- pure-observation entry;
- complete return;
- no teaching during the state.

### Independent

- support bed optional;
- phase markers optional;
- return cue retained by default;
- no narration unless explicitly selected.

The app may recommend a lower guidance tier only after the prerequisite capability markers are met. It shall not silently downgrade the session.

## 11. Readiness and user interface

The pre-session card shall show one compact readiness result and these essential controls:

- `Guidance: Teach / Coach / Test / Independent`;
- `Sound support: Off / Ambient / Binaural Low / Binaural Medium`;
- `Voice level`;
- `Support level`;
- `Breath pacing: voice + tone / tone / visual`;
- `Soft cue marker: On`;
- `Audio preview`;
- `Headphones: detected/confirmed`;
- `Audio pack: verified`;
- one dominant `Begin Day 1` button.

The normal navigation disappears during practice. The screen may remain near-black with current phase, time, Pause, and End.

## 12. Post-session adaptive debrief

Immediately after the return, QCTP asks Ryan to speak the raw experience first.

Then the app records:

- `Did any voice cue startle you?` 0–5;
- `Was the 4/6 breath comfortable?` 0–5;
- `Air hunger or recovery breaths?` 0–5;
- `Voice density:` too sparse / right / too frequent;
- `Voice speed:` too slow / right / too fast;
- `Support bed:` helpful / neutral / distracting;
- `Binaural sensation:` helpful / neutral / uncomfortable / not noticed;
- `Drowsiness:` 0–5;
- `Physical effort reduction:` 0–5;
- `Appreciation retained after releasing the scene:` 0–5;
- `Focused-attention recovery:` 0–5;
- `Open-monitoring stability:` 0–5;
- `Content-light interval with continuous awareness:` yes / uncertain / no.

Adaptation rules are bounded:

- startle above 1 lowers marker/voice peak and increases pre-cue prediction time;
- breath discomfort above 1 reduces volume guidance or changes the next trial to 5/5;
- voice too sparse retains Teach density;
- voice too frequent recommends Coach only after state markers pass;
- support bed distracting reduces its level or selects Ambient/Off;
- drowsiness above 3 keeps the sound profile at alpha/low-alpha and increases alertness corrections.

## 13. Capability credit

### Practice completion

Requires:

- full 1,500 seconds;
- opening and every required cue delivered;
- no unauthorized silent continuation;
- complete return;
- completion persistence saved or queued.

### Day 1 state accessed

Requires at least two:

- unnecessary physical effort clearly reduced;
- appreciation retained for at least 30 seconds after the scene was released;
- distraction recognized and attention deliberately returned;
- open monitoring held clearly for at least two minutes;
- remembered content-light interval with continuous awareness.

And:

- alertness at least 2/5;
- no unresolved breath symptom;
- no unresolved safety interruption.

Timer completion remains separate from state access.

## 14. Production and QA requirements

### Content

- every instruction physically executable;
- one primary action per sentence;
- exact breath route, count, volume, and release;
- state markers explained before practice;
- concise corrections;
- adequate return;
- no guaranteed-attainment language.

### Audio

- continuous 25:00 voice stem;
- continuous 25:00 support-bed stem;
- pre-rendered Low Support fallback mix;
- exact 1,500-second duration;
- all cue markers present;
- voice WPM within Section 7 limits;
- voice loudness and peak within Section 5 limits;
- no abrupt clip boundary;
- no cue collision;
- no digital silence in Ambient/Binaural modes;
- no live third-party request;
- exact hashes and decoded durations in manifest;
- headphone and speaker profiles separately identified.

### Automated player

- one Start action authorizes all continuous media;
- authoritative timer follows media time;
- two-stem drift remains within the controlled tolerance;
- fallback mix used when dual-stem readiness fails;
- pause/resume preserves exact media position;
- output route changes pause safely;
- failure earns no completion;
- local/offline pack verified before Start.

### Physical iPhone acceptance

At minimum:

1. preview marker is comfortable;
2. opening voice is audible and not startling;
3. the 00:35 and a late-session cue enter predictably;
4. first three coached breaths are executable without looking;
5. the 4/6 breath rail remains comfortable for four minutes;
6. support bed is audible but does not mask voice;
7. no cue produces a startle rating above 1/5;
8. no cue exceeds the accepted loudness;
9. pause/resume retains bed and voice alignment;
10. headphone route change fails closed;
11. offline run succeeds;
12. full 25-minute run succeeds;
13. voice-first debrief persists;
14. completion and state credit remain separate.

## 15. Release status

This protocol authorizes script locking, audio production, app integration, and device testing. It does not release Day 1 Guidance Rev1.

Release requires:

- exact voice script lock;
- rendered Chill Brian voice stem;
- rendered Ambient and Binaural support stems;
- checksum-controlled local pack;
- automated regression pass;
- physical-iPhone startle and breath acceptance;
- natural full-duration acceptance;
- explicit release authority.
