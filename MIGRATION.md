# QCTP Rev1 to Rev2 Migration

**Migration ID:** `rev1-localstorage-qctp-state`

**Rev1 source key:** `localStorage["qctp-state"]`

**Rev2 target:** IndexedDB `qctp-rev2`, database version 3

**Release status:** implementation candidate; `ZERO_RELEASE`

## Safety properties

- Migration reads Rev1 data and never deletes or edits the source localStorage value.
- The exact source JSON is stored in a local migration-ledger entry before migration is considered applied.
- A deterministic 64-bit FNV-1a fingerprint makes replay of the same source idempotent.
- Imported values pass current Zod schemas before the repository transaction.
- Unsupported or malformed subrecords create warnings when safe to skip; they do not justify inventing replacement user content.
- Rev1 and Rev2 use different storage mechanisms, so the released Rev1.1.4 runtime remains recoverable.
- A migration problem does not authorize clearing browser data. Preserve the source and export what can be read before recovery work.

## Startup sequence

1. Open IndexedDB `qctp-rev2` at the current version.
2. Initialize missing Foundation, workbook, settings, and path defaults.
3. Read `localStorage["qctp-state"]`.
4. If absent, report `no_source` and continue with Rev2 defaults.
5. If present, parse a supported wrapped `{ schema, state }` payload or an unwrapped state object.
6. Fingerprint the exact source string and look for an existing ledger row.
7. If already present, report `already_applied` without duplicating records.
8. Otherwise, validate the mapped snapshot and merge it into IndexedDB.
9. Write a ledger row containing source schema, source key, source fingerprint, exact source snapshot, imported IDs, warnings, and application time.
10. Report migration state in Settings. The original Rev1 key remains unchanged.

The application catches migration failure after defaults exist, reports the hold in Settings, and keeps the source available for diagnosis. It does not claim that a failed migration succeeded.

## Mapping

| Rev1 field               | Rev2 destination               | Rule                                                            |
| ------------------------ | ------------------------------ | --------------------------------------------------------------- |
| `currentDay`             | `foundation.currentDay`        | numeric, rounded, bounded to 1–112                              |
| `done[day]`              | `foundation.completion[day]`   | preserves morning/midday/evening booleans                       |
| `answers[day]`           | `workbook.answers[day]`        | strings preserved; other values JSON-serialized                 |
| `settings.mode`          | `settings.guidanceMode`        | guided/light/minimal only; otherwise controlled default         |
| `settings.rate`          | `settings.speechRate`          | bounded to schema range                                         |
| `settings.volume`        | `settings.voiceVolume`         | bounded to schema range                                         |
| `settings.tone`          | `settings.toneVolume`          | bounded to schema range                                         |
| `settings.timing`        | `settings.speakPhaseTiming`    | boolean or controlled default                                   |
| `settings.voice`         | `settings.selectedSystemVoice` | string preserved                                                |
| `settings.keepAwake`     | `settings.keepAwake`           | boolean preserved                                               |
| `settings.neuralVoice`   | `settings.neuralVoice`         | string preserved                                                |
| `settings.neuralEnabled` | `settings.neuralEnabled`       | boolean preserved                                               |
| `test`                   | `settings.testMode`            | boolean preserved                                               |
| `logs[]`                 | `records[]`                    | stable fingerprint/index IDs; original text becomes observation |

Legacy log type selects a controlled Codex kind where recognizable: remote viewing, psionics, OBE/Focus 10, dream, synchronicity, or intuition/reception. Unknown types become `source_note`. Migrated observations carry system provenance `rev1-localstorage-migration`, tag `legacy-rev1`, the original legacy type/day/index in fields, and no generated interpretation.

Migration always forces `settings.transcriptionRoute` to `local_only`, regardless of imported values. It does not create provider credentials, upload data, fabricate missing logs, or author Days 2–112.

## Preserved source and warnings

Each successful first application writes `migrationLedger` with:

- `migrationId = rev1-localstorage-qctp-state`;
- the Rev1 source key and detected schema label;
- the source fingerprint;
- the exact original JSON string;
- the apply timestamp;
- all imported entity IDs;
- warnings for malformed completion, answers, or log entries that could not be safely mapped.

Because the ledger contains the original local state, it can contain private journal content. It remains in the local QCTP database and is included in a structured export. Protect exports as private records.

## IndexedDB schema upgrade

Fresh Rev2 databases create all version-1 stores, the version-2 generated-Mirror stores, and the version-3 deterministic-insight feedback store. Upgrading an existing Rev2 database from IndexedDB version 1 creates:

- `mirrorRequests`, indexed by status, remote job ID, and update time;
- `mirrorResults`, uniquely indexed by request ID and remote job ID, plus creation time.
- `mirrorInsightFeedback`, uniquely indexed by insight key and additionally indexed by kind, disposition, and update time.

Existing Foundation, workbook, settings, records, recordings, binary chunks, transcripts, notes, attachments, paths, REG sessions, queues, search documents, revisions, and migration-ledger stores are not rebuilt by either upgrade.

## Export/import compatibility

The structured format is `qctp-export-v2`, schema version 2. It includes Foundation/workbook/settings, Codex records, voice metadata, transcripts, derived notes, attachments, revisions, paths, REG sessions, transcription queue, migration ledger, Mirror requests/results, and deterministic Mirror insight feedback. Older valid Rev2 exports that lack these Mirror arrays parse with empty defaults.

The complete archive format uses `qctp-archive-manifest-v1` and adds:

- raw audio chunk blobs;
- attachment blobs;
- constrained `audio/` and `attachments/` paths;
- expected byte size and SHA-256 for every binary;
- ownership checks back to recording segments or attachments.

Import rejects duplicate IDs, broken transcript/recording or note/transcript relationships, missing REG attachments/results, missing Mirror sources, citations outside the submitted source set, unsafe paths, missing binaries, size differences, checksum differences, and ownership mismatches. Validation and binary reconstruction finish before one IndexedDB import transaction begins.

The Settings UI imports in `merge` mode. Programmatic `replace` mode exists for controlled tests/recovery only; it must not be used casually because it intentionally replaces local stores.

## Operator procedure

Before first device acceptance:

1. Do not clear Safari/browser website data.
2. Confirm the released Rev1.1.4 source still opens independently.
3. Open the isolated Rev2 private preview on the same browser origin that owns the Rev1 `qctp-state` value when migration is being tested.
4. Open Settings and record migration status, imported entity count, fingerprint, ledger ID, and any warnings.
5. Compare current day, completion flags, workbook answers, settings, test state, and migrated log text with Rev1.
6. Create a complete ZIP export and retain it before destructive testing.
7. Reload Rev2 and confirm the status becomes `already_applied` without duplicate records.

If the preview uses a different origin, browser origin isolation means it cannot see the production origin's localStorage. Do not work around this by manually copying private JSON into source code. Use the controlled export/import route or a same-origin non-production migration test environment.

## Recovery

If migration is held:

1. Stop making new entries in the failing preview.
2. Preserve the original Rev1 browser data and any Rev2 export already produced.
3. Record the Settings warning and source fingerprint; do not edit the source snapshot.
4. Reproduce with a copy of the exported data in a non-production test origin.
5. Fix the migration as a new explicit schema/migration revision and add a regression fixture.
6. Re-run migration and relation/round-trip tests before any device retry.

Deleting IndexedDB or localStorage is not a recovery step unless the user has separately authorized data destruction and a verified complete export exists.

## Automated coverage

The migration and portability suites cover wrapped/unwrapped Rev1 parsing, clamping/default behavior, record-kind mapping, warnings, exact source preservation, fingerprint idempotency, IndexedDB v1-to-v3 upgrade, merge behavior, structured JSON round-trip, complete binary ZIP round-trip, checksum/path/relationship rejection, permanent Mirror purge behavior, and preservation of distinct evidence layers. Actual command results for the branch belong in `REV2_VERIFICATION.md`.
