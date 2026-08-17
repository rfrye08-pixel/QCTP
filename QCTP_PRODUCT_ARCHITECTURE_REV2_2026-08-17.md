# QCTP Product Architecture Rev2

**Document ID:** QCTP-PRODUCT-ARCH-REV2  
**Date:** 2026-08-17  
**Status:** CONTROLLED PRODUCT DIRECTION  
**Runtime impact:** None to the released Rev1.1.4 Day 1 flow until a Rev2 branch passes regression testing.

## 1. Scope decision

QCTP is expanded from a meditation companion into the **Quantum Consciousness Training Platform**.

The guided meditation player remains a critical subsystem, but it is no longer the product definition. The product exists to help Ryan:

1. learn competing and complementary consciousness frameworks;
2. train repeatable state-control and perceptual skills;
3. perform hands-on geometry, number, sound, symbolic, and creative work;
4. run structured personal experiments;
5. capture dreams, OBE, remote-viewing, psionics, synchronicity, intuition, and embodiment observations;
6. use AI as a reflective mirror over his own longitudinal records;
7. convert insight into daily behavior, creative work, and real-world action.

The 112-day program remains the **Foundation Path**. It is preserved rather than replaced.

## 2. Product north star

One mobile-first platform should carry a user through the complete loop:

`LEARN -> PRACTICE -> CREATE -> EXPERIMENT -> RECORD -> REFLECT -> INTEGRATE -> REPEAT`

The app should not merely play audio. It should function as a personal consciousness-development workspace, research notebook, practice sequencer, geometry studio, experiment lab, and long-term pattern map.

## 3. Product identity

**Name:** QCTP  
**Expanded meaning:** Quantum Consciousness Training Platform  
**Foundation curriculum:** Quantum Consciousness Training Program — 112 days  
**Primary user:** Ryan  
**Design tone:** serious, technical, contemplative, visual, non-kitschy, non-gamified.

## 4. Controlled product pillars

### 4.1 Learn

Structured lessons, source profiles, glossaries, diagrams, timelines, cross-framework comparisons, and linked source material.

Each lesson record should contain:

- source/teacher;
- exact topic;
- extracted practice;
- prerequisites;
- required materials;
- duration;
- related QCTP skills;
- original source reference;
- user notes;
- completion state.

### 4.2 Practice

The existing timed audio engine plus eyes-open and embodied exercises:

- coherence;
- Gap/open awareness;
- intention and future-state work;
- energy-center work;
- Focus 10 and OBE induction;
- remote-viewing preparation;
- psionics sensitivity and construct training;
- dream incubation;
- walking and living-in-the-field exercises.

### 4.3 Studio

A hands-on creative and analytical workspace:

- philosophical and meditative geometry;
- compass-and-straightedge constructions;
- geometric overlays and measurement;
- number-pattern exploration;
- harmonic/music-ratio exploration;
- symbol study;
- auto-dictation;
- sketches, photographs, annotations, and generated diagrams.

### 4.4 Lab

A controlled personal-experiment environment:

- blind remote-viewing targets and feedback;
- sender/receiver trials;
- RNG intention trials;
- psychometry sessions;
- OBE target-verification trials;
- dream-incubation questions;
- synchronicity and pattern logging;
- protocol locking before results;
- session scoring and longitudinal calibration.

### 4.5 Mirror

An AI-assisted reflection system grounded in Ryan's own records.

Mirror should:

- identify recurring themes, symbols, triggers, emotional states, people, decisions, and outcomes;
- surface contradictions between intention and action;
- compare current entries with earlier entries;
- ask concise high-value questions;
- distinguish observation from interpretation;
- never silently rewrite source records;
- preserve user control and exportability.

Mirror is not a generic chatbot and should not become an authority that replaces Ryan's judgement.

### 4.6 Codex

Ryan's personal, searchable body of work:

- daily journals;
- drawings;
- source notes;
- experiments;
- dreams;
- synchronicities;
- insights;
- precepts;
- personal symbols;
- questions;
- conclusions and later revisions.

Records should support tags, backlinks, source links, date/time, module, evidence class, attachments, and revisions.

### 4.7 Integrate

Every insight must have a route into lived behavior:

- one congruent action;
- one state-interruption target;
- one service or kindness action;
- one relationship application;
- one creative or technical application;
- one review question.

### 4.8 Insights

Longitudinal views rather than superficial streaks:

- state-access speed;
- Gap depth;
- attention recovery;
- dream recall;
- OBE-state indicators;
- RV descriptor calibration;
- psionics construct stability;
- repeated symbols and themes;
- intention-to-action consistency;
- practice adherence;
- correlations across sleep, mood, practice, and outcomes.

## 5. Information architecture

The target mobile navigation is:

1. **Today** — exact current lesson, practice, action, and unfinished components.
2. **Paths** — Foundation Path plus source-specific and skill-specific tracks.
3. **Practice** — audio and timed practice player.
4. **Studio** — geometry, number, sound, art, and auto-dictation tools.
5. **Lab** — blind protocols and experiment sessions.
6. **Codex** — journal, drawings, logs, source notes, and search.
7. **Mirror / Insights** — AI reflection and longitudinal pattern views.

On small screens, lower-frequency surfaces may live under More, but the product model must remain intact.

## 6. Curriculum architecture

### 6.1 Foundation Path — preserved

The controlled 112-day sequence remains authoritative:

- attention and coherence;
- open awareness and Gap;
- elevated emotion;
- intention and embodiment;
- energy centers;
- OBE/Focus 10;
- remote viewing;
- psionics;
- intuition/dreams/creative reception;
- group intention;
- living in the field.

### 6.2 Source Tracks

Source Tracks organize methods without turning one teacher into the entire platform. Initial tracks:

- Theresa Bullard;
- Joe Dispenza;
- HeartMath;
- Lynne McTaggart;
- Monroe Institute / William Buhlman;
- Controlled Remote Viewing sources;
- psionics practitioner methods;
- Robert Edward Grant.

### 6.3 Skill Tracks

- State Control
- Gap / Open Awareness
- Intention / Embodiment
- Energy Centers
- OBE
- Remote Viewing
- Psionics
- Dreams
- Geometry
- Number and Harmonics
- Mirror / Shadow Integration
- Creative Reception
- Group Practice

### 6.4 Parallel-load rule

The 4:00 AM Foundation lesson remains the primary daily progression. Eyes-open desk work, geometry drawing, number exploration, and longer creative exercises should be scheduled as secondary studio sessions rather than forced into the meditation block.

## 7. Robert Edward Grant integration role

Robert Edward Grant's work enters QCTP as a major source track because it adds capabilities not present in a meditation-only product:

- polymathic learning through the Quadrivium;
- meditative geometry drawing;
- number and mathematical-constant study;
- geometry/music/consciousness synthesis;
- mirror and shadow-oriented self-observation;
- auto-dictation and creative reception;
- daily precept integration;
- symbolic pattern recognition;
- AI-as-mirror product concepts.

The detailed track is controlled by `QCTP_ROBERT_EDWARD_GRANT_INTEGRATION_REV0_2026-08-17.md`.

## 8. Data architecture requirements

Every user-generated record should remain exportable as structured JSON. Core entities:

- `training_day`
- `lesson`
- `practice_session`
- `studio_session`
- `geometry_construction`
- `source_note`
- `auto_dictation_entry`
- `experiment_protocol`
- `experiment_result`
- `dream_entry`
- `synchronicity_entry`
- `mirror_reflection`
- `integration_action`
- `artifact_attachment`

Raw observations must remain separable from interpretations and later conclusions.

## 9. Non-goals and anti-regression guards

QCTP must not become:

- only a meditation player;
- a generic wellness tracker;
- a feed of inspirational content;
- a streak/confetti habit app;
- an unstructured chatbot;
- a copy of one teacher's paid course;
- a system that advances the curriculum merely because the calendar changed;
- a system that overwrites raw observations with AI interpretation;
- a release that breaks the verified Day 1 lesson/practice flow.

## 10. Release strategy

### Phase A — Platform shell

- Introduce Paths, Studio, Lab, Codex, and Mirror/Insights architecture.
- Preserve the existing Today, Practice, Workbook, and Progress data.
- Perform regression tests against Rev1.1.4 Day 1.

### Phase B — Robert Edward Grant MVP

- Source library and track map.
- First original QCTP geometry session.
- Precept/mirror prompt system.
- Auto-dictation timer and capture.
- Drawing/photo attachment record.

### Phase C — Interactive Studio

- SVG geometry canvas.
- Compass/straightedge construction steps.
- ratio/angle measurement;
- number and harmonic explorers.

### Phase D — Mirror and Codex

- searchable longitudinal records;
- backlinks and tags;
- pattern detection;
- AI reflection with source preservation.

### Phase E — Full Lab

- target generator;
- blinded feedback;
- protocol templates;
- scoring and calibration dashboards.

## 11. Acceptance criteria for Rev2 shell

Rev2 shell may not merge to the released branch until:

1. the complete Rev1.1.4 Day 1 one-button flow still works;
2. exact 25-minute timing remains unchanged;
3. Chill Brian remains the controlled production guide;
4. current local data migrates without loss;
5. navigation fits iPhone portrait mode;
6. all new sections clearly distinguish released content from reserved placeholders;
7. JSON export/import covers new entities;
8. no paid third-party course content is reproduced;
9. the current release candidate remains recoverable.

## 12. Configuration decision

This document changes the product direction but does **not** grant release authority to a new runtime. Rev1.1.4 remains the released limited-use baseline until the isolated Rev2 implementation passes its acceptance tests.
