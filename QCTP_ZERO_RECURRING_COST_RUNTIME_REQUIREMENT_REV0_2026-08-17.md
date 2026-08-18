# QCTP Zero Recurring Cost Runtime Requirement Rev0

**Document ID:** QCTP-ZERO-COST-RUNTIME-REV0  
**Date:** 2026-08-17  
**Status:** CONTROLLED PRODUCT REQUIREMENT  
**Applies to:** QCTP Platform Rev2 and later  
**User authority:** Ryan explicitly requires that normal use of QCTP not require paid tokens, API credits, or a recurring usage charge.

## 1. Governing requirement

QCTP shall provide a complete usable **Free Local Mode** that requires:

- no OpenAI API key;
- no paid transcription account;
- no paid AI-provider account;
- no per-use token charge;
- no subscription to operate the core platform;
- no automatic paid-provider calls.

The absence of `OPENAI_API_KEY` or any other provider credential is a valid normal configuration, not an error condition.

## 2. Core capabilities that must operate at zero recurring cost

The following must work without a paid API or cloud-AI credential:

- install and launch the PWA;
- Foundation lessons and pre-rendered guided-practice playback;
- exact timed silence and transition sequencing;
- workbook responses;
- local progress state;
- voice recording;
- playback of saved recordings;
- local-first audio persistence;
- quick notes and field notes;
- dreams, synchronicities, intuition, OBE, remote-viewing, and psionics logs;
- Robert Edward Grant Studio sessions;
- auto-dictation recording;
- geometry/photo capture;
- Codex storage and search;
- Mirror Journal structured entry;
- Lab protocols and results;
- JSON/data export and import;
- deterministic local statistics and pattern counts;
- offline queueing and later local processing.

## 3. Voice capture and transcription

### 3.1 Required free baseline

Voice capture must always allow Ryan to:

1. record audio;
2. stop, pause, resume, replay, append, rename, tag, and save it;
3. preserve the raw audio locally;
4. manually add or correct text later;
5. use the recording even if no transcription provider exists.

A failed or unavailable transcription service must never block recording or saving.

### 3.2 No-cost transcription path

The production architecture shall support a no-recurring-cost transcription provider. Preferred implementation order:

1. local transcription on Ryan's PX13 through a local companion service using an open-source speech-to-text engine such as Whisper-compatible local inference;
2. on-device/browser local transcription where performance and iPhone compatibility are acceptable;
3. operating-system dictation as a clearly labeled convenience fallback for field text entry, while preserving separately recorded raw audio when a source recording is required.

Local transcription may consume device compute, battery, storage, and time, but it must not incur a metered API charge.

### 3.3 Optional paid adapters

OpenAI or another paid cloud transcription adapter may exist only as an optional provider interface. It must be:

- disabled by default;
- absent from the critical path;
- impossible to invoke without explicit user opt-in;
- clearly labeled as separately billed;
- protected by server-side credentials;
- protected by a configurable hard spend limit and usage visibility;
- removable without breaking Free Local Mode.

Ryan's current controlled selection is **do not enable paid transcription**.

## 4. AI Mirror and insight generation

Free Local Mode shall provide useful non-generative capabilities such as:

- full-text search;
- tags and backlinks;
- repeated-word, symbol, person, date, and theme counts;
- time-series summaries;
- user-created filters;
- intention-to-action comparison;
- links from every insight to the underlying records.

A local-model adapter may later provide richer AI reflection using Ryan's own computer without per-use API billing.

Cloud AI reflection must be optional, disabled by default, and subject to the same explicit opt-in and spend controls as cloud transcription.

## 5. Narration

Released lesson and practice narration shall use pre-rendered, bundled, or otherwise static audio assets. Playback must not call a metered text-to-speech API at runtime.

New narration may be generated during controlled content production, but normal daily playback must not create a token or generation charge.

## 6. User interface requirements

Settings shall clearly display:

- `Mode: Free Local` as the default;
- `Paid cloud services: Off`;
- local recording/storage status;
- transcription status as `local`, `queued`, `manual`, or `unavailable` rather than presenting a missing API key as a product failure;
- any optional provider's billing warning before connection or activation.

QCTP shall never prompt Ryan to buy API credits during ordinary use.

## 7. Network and test controls

The acceptance suite shall include a Free Local Mode test that:

1. runs with no provider environment variables;
2. records and saves audio;
3. preserves and replays raw audio;
4. creates notes, Studio records, Lab records, and Codex records;
5. exports and imports all data;
6. plays the released Foundation Day 1 audio and exact 1,500-second timeline;
7. confirms no request is sent to OpenAI or another metered provider;
8. confirms no paid-provider failure blocks core use.

A release fails if a paid provider is required for normal operation.

## 8. Billing distinction

ChatGPT/Codex development usage and QCTP runtime usage are separate concerns. This requirement governs the deployed QCTP runtime. Codex may use the user's existing Codex allowance while building the software, but the resulting app must not require paid API usage during normal operation.

## 9. Release authority

This requirement supersedes any earlier preference that positioned `gpt-4o-mini-transcribe` as the default MVP transcription path.

OpenAI transcription remains an optional adapter only. **Free Local Mode is the release baseline.**
