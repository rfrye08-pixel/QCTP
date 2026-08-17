# QCTP Local AI Mirror Requirement Rev0

**Document ID:** QCTP-LOCAL-AI-MIRROR-REV0  
**Date:** 2026-08-17  
**Status:** CONTROLLED REQUIREMENT  
**Applies to:** QCTP Platform Rev2 production implementation  
**Release impact:** No change to Rev1.1.4. Rev2 remains ZERO RELEASE until this requirement and the broader acceptance suite pass.

## 1. User requirement

Ryan shall retain a real AI-assisted Mirror capability without being required to purchase OpenAI API usage or any other recurring metered AI service.

Absence of an API key shall be a valid normal configuration, not an error, degraded-account warning, or blocker to ordinary QCTP use.

## 2. Required three-layer Mirror architecture

### 2.1 Mirror Core — always local, always available

Mirror Core shall operate inside the QCTP app without an external model or paid service.

Required capabilities:

- full-text local search;
- tags, people, symbols, themes, dates, practices, and source-track filters;
- recurring-term and recurring-symbol counts;
- repeated-trigger and repeated-action detection;
- intention-versus-action comparison from structured fields;
- state, sleep, practice, and outcome trend views;
- links from every surfaced pattern to the exact underlying records;
- user-controlled dismissal, correction, acceptance, and annotation;
- no silent mutation of raw records.

Mirror Core is deterministic analysis and is part of the zero-cost release baseline.

### 2.2 Local AI Mirror — no per-use fee

QCTP shall support an optional local-model provider that runs on Ryan's PX13 or another user-owned computer rather than a paid cloud API.

Required architecture:

- provider interface independent of any one local-model runtime;
- local companion service on the PX13;
- local retrieval over QCTP records and embeddings/indexes stored under user control;
- answers cite or link the exact records used;
- raw audio, raw transcript, corrected transcript, clean note, interpretation, and later conclusions remain separate;
- local processing may be queued when the PX13 is unavailable;
- the iPhone app continues recording, searching, and using Mirror Core while local AI is offline;
- no QCTP record may be sent to an external model without explicit opt-in;
- model choice remains a benchmarked configuration decision rather than being frozen before testing Ryan's hardware.

Target Local AI Mirror functions:

- summarize a selected time window;
- compare current and earlier entries;
- identify recurring themes, symbols, people, emotional states, and behavioral loops;
- identify contradictions between stated intentions and recorded actions;
- propose one high-value question;
- propose one practical integration action;
- generate a reflection draft that Ryan may accept, revise, or reject;
- preserve provenance for every generated claim.

Local AI inference may consume local compute time, electricity, RAM, and storage, but shall not create a per-token or per-request cloud bill.

### 2.3 Cloud AI Mirror — optional only

A cloud-model adapter may exist later for convenience or higher capability, but it shall be:

- disabled by default;
- absent from the release critical path;
- clearly labeled as potentially metered;
- protected by explicit user opt-in;
- protected by configurable spending limits where the provider supports them;
- unable to activate merely because an environment variable exists;
- unable to replace or disable Mirror Core or Local AI Mirror.

## 3. Phone and laptop operating behavior

### iPhone-only state

When the PX13 local companion is unavailable, the iPhone app shall still provide:

- voice and text capture;
- raw recording playback;
- local search;
- Mirror Core pattern views;
- queued Local AI Mirror questions;
- review of previously generated local reflections;
- complete export of user records.

### PX13-available state

When the authorized local companion is reachable, QCTP may:

- transcribe queued recordings locally;
- update the local search/vector index;
- process queued Mirror questions;
- generate traceable reflection drafts;
- return results to the user's QCTP data store.

The connection method must be authenticated and must not expose the local service openly to the internet by default.

## 4. Data and evidence controls

Every AI reflection record shall contain:

- reflection ID;
- creation timestamp;
- provider type: deterministic, local model, or cloud model;
- model/runtime identifier where applicable;
- user query or requested analysis;
- exact source-record IDs;
- generated reflection text;
- one proposed question;
- one proposed action;
- user disposition: unreviewed, accepted, revised, or rejected;
- revision history;
- deletion state.

Generated reflections are derived artifacts. They may never overwrite source records or be promoted into raw observation.

## 5. Required settings

Settings shall clearly display:

- Runtime mode: Free Local;
- Mirror Core: On;
- Local AI companion: connected / unavailable / processing;
- Cloud AI: Off by default;
- pending local transcription count;
- pending local Mirror analysis count;
- local model/runtime identity when connected;
- storage use and deletion/export controls.

## 6. Acceptance criteria

The Local AI Mirror requirement passes only when:

1. Mirror Core produces useful traceable local insights with no API key and no network provider call;
2. the app remains fully usable when no PX13 companion is present;
3. a local-provider interface and mock implementation pass automated tests;
4. a real no-cost local-model path is benchmarked on Ryan's PX13 before release authority is granted for Local AI Mirror;
5. local AI results cite exact source records;
6. generated reflections can be accepted, revised, or rejected without altering raw records;
7. queued questions survive app closure and reconnect;
8. Free Local Mode tests prove no metered AI request occurs;
9. cloud AI remains disabled by default;
10. all Mirror data is included in export/import and deletion workflows.

## 7. Anti-regression controls

- Do not describe cloud AI as required for the AI Mirror.
- Do not reduce the free baseline to static journaling only.
- Do not label deterministic local analytics as model-generated AI.
- Do not claim a local model is validated before it is benchmarked on Ryan's actual hardware.
- Do not send QCTP records to a third party merely because a provider is configured.
- Do not let AI-generated interpretations replace observations, transcripts, or user conclusions.

## 8. Implementation instruction

Codex shall preserve current valid work and add this requirement to the active Rev2 architecture. It shall implement Mirror Core and the local-provider seam in the current work package where safely executable. The real local-model benchmark and installation package may remain an explicit release hold if Ryan's PX13 environment is not available to the task.
