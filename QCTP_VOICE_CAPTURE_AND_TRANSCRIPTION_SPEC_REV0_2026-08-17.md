# QCTP Voice Capture and Transcription Specification Rev0

**Document ID:** QCTP-VOICE-CAPTURE-REV0  
**Date:** 2026-08-17  
**Status:** CONTROLLED REQUIREMENT  
**Applies to:** QCTP Platform Rev2 implementation  
**Release impact:** No change to released Rev1.1.4 until implemented and verified on an isolated branch.

## 1. User need

Ryan must be able to capture thoughts faster than typing. Voice capture is a core platform input method, not a convenience feature.

The system shall support spoken capture for:

- daily workbook responses;
- free notes;
- dreams;
- synchronicities;
- intuition and receptive impressions;
- OBE reports;
- remote-viewing session notes;
- psionics observations;
- geometry and Studio reflections;
- auto-dictation;
- Mirror Journal entries;
- source notes;
- integration actions;
- questions for later research.

## 2. Product principle

Voice capture must preserve the complete information chain:

`RAW AUDIO -> VERBATIM TRANSCRIPT -> OPTIONAL CLEAN NOTE -> USER INTERPRETATION -> TAGS/LINKS`

No derived layer may silently overwrite a weaker or earlier source layer.

## 3. Required capture modes

### 3.1 Quick Capture

A globally available microphone control accessible from every primary app surface.

Flow:

1. tap microphone;
2. recording starts after an audible and visual cue;
3. speak freely;
4. tap stop;
5. review audio and draft transcript;
6. choose destination or accept the inferred destination;
7. save.

Target start latency: under one second after permission has previously been granted.

### 3.2 Field Dictation

A microphone button beside any text field. Dictation appends to that specific field rather than creating a separate note.

Examples:

- append to a dream description;
- answer one workbook prompt;
- add a geometry observation;
- add a Mirror Journal reflection.

### 3.3 Auto-Dictation Session

A timed five-, ten-, or twenty-minute recording mode.

Requirements:

- no editing while capture is active;
- visible elapsed/remaining time;
- pause and resume;
- optional sparse transition tone;
- raw audio preserved;
- verbatim transcript preserved;
- later analysis is a separate action.

### 3.4 Experiment Voice Log

A rapid low-screen-interaction mode for OBE, dream, remote-viewing, intuition, and other time-sensitive recall.

Requirements:

- one-tap record from the relevant session screen;
- timestamped segments;
- no forced classification before speaking;
- later separation into raw observation, interpretation, confidence, and feedback.

## 4. Recording controls

Every recorder shall provide:

- Start;
- Stop;
- Pause;
- Resume;
- Cancel with confirmation;
- elapsed time;
- input-level indication or waveform;
- playback before save;
- delete and re-record;
- append another segment;
- save while transcription is pending;
- clear recording-state indication.

The interface must remain usable on iPhone portrait mode with large tap targets.

## 5. Audio and transcript preservation

### 5.1 Raw audio

The original recording is a source artifact.

Store:

- unique ID;
- creation timestamp;
- duration;
- MIME type;
- byte size;
- destination context;
- recording segments;
- upload/transcription state;
- checksum when persisted remotely;
- user deletion state.

Raw audio shall not be stored as Base64 in localStorage.

For local-first operation, use IndexedDB or equivalent binary-capable storage. For durable cross-device operation, use authenticated object storage.

### 5.2 Verbatim transcript

The first transcription result is preserved as an immutable source layer except for explicit correction metadata.

The user may correct obvious recognition errors, but the system shall retain:

- original transcript;
- corrected transcript;
- correction timestamp;
- correction provenance.

### 5.3 Clean note

The user may request a derived note that:

- removes filler words;
- adds punctuation;
- groups related thoughts;
- creates a title;
- extracts proposed tags;
- identifies questions and action items.

The clean note must link to the raw audio and verbatim transcript and must never replace them.

## 6. Transcription architecture

Browser speech-synthesis or browser speech-recognition APIs are not the controlled production path for durable notes.

The controlled architecture is:

1. iPhone/PWA records audio using MediaRecorder or an equivalent supported capture API;
2. audio is stored locally immediately so a network interruption does not destroy the note;
3. an authenticated backend accepts the audio upload;
4. the backend calls a configured speech-to-text provider;
5. the transcript returns to the app and is linked to the recording;
6. local queued recordings retry automatically when connectivity returns.

No provider API key may be embedded in client-side JavaScript or shipped in the PWA bundle.

## 7. Initial OpenAI transcription route

The preferred MVP route is server-side OpenAI transcription:

- default cost-efficient model: `gpt-4o-mini-transcribe`;
- higher-accuracy selectable route: `gpt-4o-transcribe`;
- future low-latency live mode: Realtime transcription;
- diarization only when a recording intentionally includes multiple speakers.

The provider interface must remain replaceable so QCTP is not hard-coupled to one transcription service.

## 8. Backend requirement

GitHub Pages alone cannot securely hold an OpenAI API key or provide authenticated private storage.

Production voice capture therefore requires a backend or serverless layer with:

- secret management;
- authenticated transcription endpoint;
- request-size and duration limits;
- rate limiting;
- abuse protection;
- structured error responses;
- resumable or retryable upload strategy;
- storage lifecycle controls;
- deletion endpoint;
- usage and cost telemetry.

The selected hosting stack must support a private single-user deployment first and a multi-user migration path later.

## 9. Privacy and user control

The app shall make recording state unmistakable.

Required controls:

- microphone permission requested only after an explicit user action;
- no background recording without visible indication;
- user can delete raw audio and all derived records;
- user can choose audio-retention policy;
- user can export raw audio, transcript, and metadata;
- transcript processing status is visible;
- provider and processing route are recorded;
- private notes are not used as public content.

## 10. Destination and tagging

After recording, QCTP should infer but not force a destination.

Possible destinations:

- Today / workbook;
- Codex free note;
- Dream;
- Synchronicity;
- Intuition;
- OBE;
- Remote Viewing;
- Psionics;
- Studio / geometry;
- Mirror;
- Source note;
- Integration action;
- Question queue.

The user can change the destination before or after saving.

Suggested tags may be generated from the transcript, but tags require user acceptance or later editable review.

## 11. Offline behavior

When offline:

- recording must still work;
- raw audio must save locally;
- the note appears with `TRANSCRIPTION_QUEUED` status;
- the user can replay, rename, tag, and delete it;
- upload retries when online;
- no recording is marked transcribed until a transcript is actually returned and saved.

## 12. Voice capture data entities

### `voice_recording`

- `id`
- `created_at`
- `updated_at`
- `duration_ms`
- `mime_type`
- `size_bytes`
- `local_blob_ref`
- `remote_object_ref`
- `destination_type`
- `destination_id`
- `status`
- `segments`
- `provider`
- `checksum`
- `retention_policy`

### `transcript`

- `id`
- `recording_id`
- `provider`
- `model`
- `language`
- `original_text`
- `corrected_text`
- `timestamps`
- `confidence_metadata`
- `created_at`
- `corrected_at`

### `derived_note`

- `id`
- `transcript_id`
- `title`
- `clean_text`
- `suggested_tags`
- `accepted_tags`
- `questions`
- `action_items`
- `created_at`
- `updated_at`

## 13. Acceptance tests

Voice capture is not releasable until all applicable tests pass:

1. iPhone PWA records at least a ten-minute note without truncation.
2. Pause and resume preserve one coherent record.
3. Cancel deletes the unsaved capture.
4. App interruption does not silently lose a stopped recording.
5. Offline recording queues and transcribes after reconnection.
6. Raw audio, verbatim transcript, and clean note remain distinct.
7. Field Dictation appends to the correct destination field.
8. Global Quick Capture creates a recoverable unclassified note when no destination is chosen.
9. Microphone permission denial produces a clear recovery path.
10. No API key exists in frontend source or network-visible static configuration.
11. Transcription errors do not delete the audio.
12. User deletion removes local and remote artifacts according to the selected policy.
13. Export contains recording metadata, transcript, clean note, and links to exported audio files.
14. Existing Foundation Day 1 playback and progress data remain unchanged.
15. The app is usable with one hand on an iPhone.

## 14. Non-goals for first release

The first release does not require:

- multi-speaker meeting transcription;
- continuous passive listening;
- always-on wake-word activation;
- automatic psychological conclusions;
- deletion of raw audio immediately after transcription;
- perfect live word-by-word captions.

## 15. Release authority

This specification authorizes implementation and testing on an isolated Codex branch. It does not authorize deployment over the current Rev1.1.4 release.
