import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";

import {
  exportArchive,
  exportJson,
  importArchive,
  importJson,
} from "../../export-import";
import type { AppSettings } from "../../domain";
import { ScreenHeader } from "../components/ScreenHeader";
import { StatusBadge } from "../components/StatusBadge";
import { useQctp } from "../qctp-context";
import "../platform-styles.css";

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = "noopener";
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function dateStamp(): string {
  return new Date()
    .toISOString()
    .replaceAll(":", "-")
    .replace(/\.\d{3}Z$/, "Z");
}

function formatBytes(value: number): string {
  if (value < 1_024) return `${String(value)} B`;
  if (value < 1_024 * 1_024) return `${(value / 1_024).toFixed(1)} KiB`;
  if (value < 1_024 * 1_024 * 1_024)
    return `${(value / (1_024 * 1_024)).toFixed(1)} MiB`;
  return `${(value / (1_024 * 1_024 * 1_024)).toFixed(2)} GiB`;
}

function migrationLabel(
  status: "no_source" | "already_applied" | "migrated",
): string {
  if (status === "migrated") return "Rev1 data migrated and preserved";
  if (status === "already_applied") return "Rev1 migration already applied";
  return "No Rev1 source found on this device";
}

export function SettingsScreen() {
  const runtime = useQctp();
  const { repository, settings, migration } = runtime;
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [localGatewayToken, setLocalGatewayToken] = useState("");
  const [localGatewayBaseUrl, setLocalGatewayBaseUrl] = useState("");
  const [selectedImport, setSelectedImport] = useState<File | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [localMetrics, setLocalMetrics] = useState({
    pendingTranscriptions: 0,
    trackedBinaryBytes: 0,
    originUsageBytes: null as number | null,
    originQuotaBytes: null as number | null,
  });

  useEffect(() => {
    let disposed = false;
    const estimatePromise: Promise<StorageEstimate> = navigator.storage
      ?.estimate
      ? navigator.storage.estimate()
      : Promise.resolve({});
    void Promise.all([
      repository.listTranscriptionQueue(),
      repository.listRecordings(),
      repository.listAttachments(),
      estimatePromise,
    ])
      .then(([queue, recordings, attachments, estimate]) => {
        if (disposed) return;
        setLocalMetrics({
          pendingTranscriptions: queue.length,
          trackedBinaryBytes:
            recordings.reduce((total, item) => total + item.sizeBytes, 0) +
            attachments
              .filter((item) => item.deletedAt === null)
              .reduce((total, item) => total + item.sizeBytes, 0),
          originUsageBytes: estimate.usage ?? null,
          originQuotaBytes: estimate.quota ?? null,
        });
      })
      .catch(() => {
        // Settings remains usable if browser storage becomes unavailable after
        // boot; destructive controls never depend on an estimated byte count.
      });
    return () => {
      disposed = true;
    };
  }, [repository, runtime.revision]);

  const changeSetting = useCallback(
    async (changes: Partial<AppSettings>, success: string) => {
      setBusy("settings");
      setMessage(null);
      setError(null);
      try {
        await runtime.updateSettings(changes);
        setMessage(success);
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "The local setting could not be saved.",
        );
      } finally {
        setBusy(null);
      }
    },
    [runtime],
  );

  const connectCompanion = useCallback(async () => {
    setBusy("companion");
    setMessage(null);
    setError(null);
    try {
      const baseUrl = localGatewayBaseUrl.trim();
      if (baseUrl) {
        const parsed = new URL(baseUrl);
        if (parsed.username || parsed.password) {
          throw new Error(
            "Do not place credentials inside the PX13 gateway URL.",
          );
        }
        const loopback =
          parsed.hostname === "127.0.0.1" || parsed.hostname === "[::1]";
        if (
          parsed.protocol !== "https:" &&
          !(parsed.protocol === "http:" && loopback)
        ) {
          throw new Error(
            "Use HTTPS for a remote PX13 gateway, or exact loopback HTTP for this device.",
          );
        }
      }
      await runtime.configureLocalTranscription(localGatewayToken, baseUrl);
      setLocalGatewayToken("");
      setMessage(
        "Connected to the attested Free Local Mode transcription gateway.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The no-cost local transcription gateway is unavailable.",
      );
    } finally {
      setBusy(null);
    }
  }, [localGatewayBaseUrl, localGatewayToken, runtime]);

  const processQueue = useCallback(async () => {
    setBusy("transcription-queue");
    setMessage(null);
    setError(null);
    try {
      const result = await runtime.processTranscriptionQueue();
      setMessage(
        `Local queue processed: ${String(result.completed.length)} completed, ${String(result.failed.length)} held for retry or review.`,
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The local queue could not be processed.",
      );
    } finally {
      setBusy(null);
    }
  }, [runtime]);

  const connectMirror = useCallback(async () => {
    setBusy("mirror-connect");
    setMessage(null);
    setError(null);
    try {
      await runtime.mirror.connect();
      setMessage(
        "Local AI companion connection check completed; queued work remains available.",
      );
    } catch {
      setMessage(
        "The PX13 Local AI companion is unavailable. Requests remain safely queued on this device.",
      );
    } finally {
      setBusy(null);
    }
  }, [runtime]);

  const exportData = useCallback(
    async (format: "json" | "zip") => {
      setBusy(`export-${format}`);
      setMessage(null);
      setError(null);
      try {
        if (format === "json") {
          const json = await exportJson(repository);
          downloadBlob(
            new Blob([json], { type: "application/json" }),
            `qctp-rev2-${dateStamp()}.json`,
          );
          setMessage(
            "Validated JSON metadata export created. Use ZIP when you also need audio and attachment blobs.",
          );
        } else {
          downloadBlob(
            await exportArchive(repository),
            `qctp-rev2-complete-${dateStamp()}.zip`,
          );
          setMessage(
            "Validated complete ZIP export created with local audio and attachment blobs.",
          );
        }
      } catch (cause) {
        setError(
          cause instanceof Error
            ? cause.message
            : "The export could not be created.",
        );
      } finally {
        setBusy(null);
      }
    },
    [repository],
  );

  const chooseImport = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setSelectedImport(event.target.files?.[0] ?? null);
    setMessage(null);
    setError(null);
  }, []);

  const importData = useCallback(async () => {
    if (!selectedImport) return;
    setBusy("import");
    setMessage(null);
    setError(null);
    try {
      const lowerName = selectedImport.name.toLocaleLowerCase();
      const snapshot = lowerName.endsWith(".zip")
        ? await importArchive(repository, selectedImport, { mode: "merge" })
        : await importJson(repository, selectedImport, { mode: "merge" });
      await runtime.refresh();
      setMessage(
        `Validated and merged ${String(snapshot.records.length)} records, ${String(snapshot.recordings.length)} recordings, and ${String(snapshot.attachments.length)} attachments. Existing local data was not reset.`,
      );
      setSelectedImport(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "The import was rejected before local data changed.",
      );
    } finally {
      setBusy(null);
    }
  }, [repository, runtime, selectedImport]);

  return (
    <>
      <ScreenHeader eyebrow="Device runtime and portability" title="Settings">
        <p>
          Free Local Mode is the release baseline. Normal recording, playback,
          practice, storage, migration, and export have zero recurring API cost.
        </p>
      </ScreenHeader>

      <section className="hero-card free-local-card">
        <div className="card-heading">
          <div>
            <p className="eyebrow">Active release baseline</p>
            <h2>Free Local Mode</h2>
          </div>
          <StatusBadge status="released" />
        </div>
        <div className="metric-grid">
          <div className="metric">
            <span>Normal API cost</span>
            <strong>$0 recurring</strong>
          </div>
          <div className="metric">
            <span>Raw audio</span>
            <strong>IndexedDB</strong>
          </div>
          <div className="metric">
            <span>Transcription</span>
            <strong>PX13 local</strong>
          </div>
        </div>
        <fieldset className="runtime-options">
          <legend>Transcription route</legend>
          <label className="runtime-option active">
            <input type="radio" name="transcription-route" checked readOnly />
            <span>
              <strong>PX13 local companion</strong>
              <small>
                Whisper-compatible, loopback-only, and no metered provider.
              </small>
            </span>
          </label>
          <label className="runtime-option locked" aria-disabled="true">
            <input type="radio" name="transcription-route" disabled />
            <span>
              <strong>OpenAI paid cloud — disabled</strong>
              <small>
                Not selectable in this release. No API key is required or
                accepted by this screen.
              </small>
            </span>
          </label>
        </fieldset>
        {settings.transcriptionRoute !== "local_only" ? (
          <div className="platform-message warning" role="alert">
            <p>
              Imported settings request a non-local route. It is not selectable
              in this release.
            </p>
            <button
              className="secondary-button"
              type="button"
              disabled={busy === "settings"}
              onClick={() =>
                void changeSetting(
                  { transcriptionRoute: "local_only" },
                  "Free Local Mode restored.",
                )
              }
            >
              Restore Free Local Mode
            </button>
          </div>
        ) : null}
      </section>

      <section className="panel-card">
        <div className="card-heading">
          <div>
            <p className="eyebrow">Optional local transcription</p>
            <h2>PX13 companion</h2>
          </div>
          <span
            className={`companion-dot companion-${runtime.localTranscriptionStatus}`}
            aria-hidden="true"
          />
        </div>
        <p>{runtime.localTranscriptionMessage}</p>
        {runtime.localTranscriptionPolicy ? (
          <dl className="settings-definition-list">
            <div>
              <dt>Attested mode</dt>
              <dd>{runtime.localTranscriptionPolicy.mode}</dd>
            </div>
            <div>
              <dt>Provider</dt>
              <dd>{runtime.localTranscriptionPolicy.provider}</dd>
            </div>
            <div>
              <dt>Paid cloud enabled</dt>
              <dd>
                {runtime.localTranscriptionPolicy.paidCloudEnabled
                  ? "yes — blocked"
                  : "no"}
              </dd>
            </div>
            <div>
              <dt>Hard spend limit</dt>
              <dd>
                ${runtime.localTranscriptionPolicy.hardSpendLimitUsd.toFixed(2)}
              </dd>
            </div>
          </dl>
        ) : null}
        {runtime.localTranscriptionStatus !== "ready" ? (
          <div className="local-connect-form">
            <label className="platform-field">
              <span>PX13 gateway base URL</span>
              <input
                type="url"
                inputMode="url"
                value={localGatewayBaseUrl}
                onChange={(event) => setLocalGatewayBaseUrl(event.target.value)}
                placeholder="Blank for same-origin"
              />
              <small>
                Leave blank behind the local preview proxy. Exact loopback HTTP
                is allowed; a remote PX13 connection must use HTTPS.
              </small>
            </label>
            <label className="platform-field">
              <span>Local gateway session token</span>
              <input
                type="password"
                autoComplete="off"
                inputMode="text"
                maxLength={64}
                pattern="[A-Fa-f0-9]{64}"
                value={localGatewayToken}
                onChange={(event) => setLocalGatewayToken(event.target.value)}
                placeholder="64-character private hex token"
              />
              <small>
                This is a pairing credential for your private gateway, not a
                cloud-provider API key. QCTP exchanges it for a signed, expiring
                HttpOnly device session and never writes the token to browser
                storage. Rotating the PX13 token revokes every signed session.
              </small>
            </label>
            <button
              className="secondary-button"
              type="button"
              disabled={
                busy === "companion" ||
                !/^[A-Fa-f0-9]{64}$/u.test(localGatewayToken.trim())
              }
              onClick={() => void connectCompanion()}
            >
              {busy === "companion"
                ? "Verifying Free Local Mode…"
                : "Connect local companion"}
            </button>
          </div>
        ) : (
          <div className="platform-action-row">
            <button
              className="primary-button"
              type="button"
              disabled={busy !== null}
              onClick={() => void processQueue()}
            >
              {busy === "transcription-queue"
                ? "Processing locally…"
                : "Process accepted queue"}
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={busy !== null}
              onClick={() => void runtime.clearLocalTranscription()}
            >
              Disconnect
            </button>
          </div>
        )}
        <ol className="setup-list">
          <li>
            Run an OpenAI-compatible Whisper companion only on{" "}
            <code>127.0.0.1:8788</code>.
          </li>
          <li>
            Run the QCTP authenticated gateway on <code>127.0.0.1:8787</code>{" "}
            with provider <code>local</code> and a fresh local session token.
          </li>
          <li>
            Pair this device once and verify the gateway attests{" "}
            <code>free-local</code> before processing accepted audio. The
            protected device session survives an app close; Disconnect clears it
            when reachable and always disables automatic reuse here.
          </li>
        </ol>
        <p className="fine-print">
          An unavailable companion is a normal state, not an application
          failure. Accepted audio stays local and can be played or exported
          later.
        </p>
      </section>

      <section className="panel-card">
        <div className="card-heading">
          <div>
            <p className="eyebrow">Optional generative runtime</p>
            <h2>PX13 Local AI companion</h2>
          </div>
          <span
            className={`companion-dot companion-${runtime.mirror.connectivity}`}
            aria-hidden="true"
          />
        </div>
        <p>
          Deterministic Mirror Core stays on inside this app. The separate Local
          AI Mirror uses the same private HttpOnly PX13 device session for
          generative reflections; questions and exact source citations queue
          locally while the PX13 is unavailable.
        </p>
        <dl className="settings-definition-list">
          <div>
            <dt>Mirror Core</dt>
            <dd>{runtime.mirror.coreStatus === "ready" ? "On" : "Error"}</dd>
          </div>
          <div>
            <dt>Local AI companion</dt>
            <dd>
              {runtime.mirror.jobs.some((job) => job.status === "processing")
                ? "processing"
                : runtime.mirror.connectivity === "online"
                  ? "connected"
                  : runtime.mirror.connectivity === "checking"
                    ? "checking"
                    : "unavailable"}
            </dd>
          </div>
          <div>
            <dt>Local model/runtime</dt>
            <dd>
              {runtime.mirror.policy
                ? `${runtime.mirror.policy.provider} · ${runtime.mirror.policy.model}`
                : "Not connected"}
            </dd>
          </div>
          <div>
            <dt>Pending local Mirror analyses</dt>
            <dd>
              {
                runtime.mirror.jobs.filter((job) =>
                  [
                    "queued_local",
                    "submitted",
                    "processing",
                    "retry_wait",
                  ].includes(job.status),
                ).length
              }
            </dd>
          </div>
          <div>
            <dt>Pending local transcriptions</dt>
            <dd>{localMetrics.pendingTranscriptions}</dd>
          </div>
          <div>
            <dt>Local origin storage use</dt>
            <dd>
              {localMetrics.originUsageBytes === null
                ? "Browser estimate unavailable"
                : `${formatBytes(localMetrics.originUsageBytes)}${
                    localMetrics.originQuotaBytes === null
                      ? ""
                      : ` of ${formatBytes(localMetrics.originQuotaBytes)}`
                  }`}
            </dd>
          </div>
          <div>
            <dt>Tracked audio and attachment blobs</dt>
            <dd>{formatBytes(localMetrics.trackedBinaryBytes)}</dd>
          </div>
          <div>
            <dt>Cloud AI</dt>
            <dd>Off</dd>
          </div>
        </dl>
        <button
          className="secondary-button"
          type="button"
          disabled={
            busy === "mirror-connect" ||
            runtime.mirror.connectivity === "checking" ||
            runtime.localTranscriptionStatus !== "ready"
          }
          onClick={() => void connectMirror()}
        >
          {busy === "mirror-connect" ||
          runtime.mirror.connectivity === "checking"
            ? "Checking Local AI companion…"
            : runtime.mirror.connectivity === "online"
              ? "Synchronize Local AI Mirror"
              : "Connect Local AI companion"}
        </button>
        {runtime.localTranscriptionStatus !== "ready" ? (
          <p className="fine-print">
            Pair the shared PX13 device session in the transcription section
            first. The pairing token is never persisted; only the gateway's
            signed, expiring HttpOnly session cookie survives app closure.
          </p>
        ) : null}
        <p className="fine-print">
          Complete export controls are below. Selective and complete deletion
          controls remain beside the corresponding recordings and reflections in
          Codex and Mirror, so no data is removed merely by changing a setting.
        </p>
      </section>

      <section className="panel-card">
        <p className="eyebrow">Raw audio lifecycle</p>
        <h2>Retention</h2>
        <label className="platform-field">
          <span>Default retention policy</span>
          <select
            value={settings.audioRetention}
            disabled={busy === "settings"}
            onChange={(event) =>
              void changeSetting(
                {
                  audioRetention: event.target
                    .value as AppSettings["audioRetention"],
                },
                "Audio retention preference saved locally.",
              )
            }
          >
            <option value="keep">Keep raw audio until I delete it</option>
            <option value="delete_after_export">
              Eligible for deletion after verified export
            </option>
            <option value="manual">Decide per recording</option>
          </select>
        </label>
        <p className="fine-print">
          Changing this preference does not delete anything. There is no
          destructive reset control on this screen.
        </p>
      </section>

      <section className="panel-card">
        <p className="eyebrow">Foundation safety</p>
        <h2>Test mode</h2>
        <label className="runtime-option">
          <input
            type="checkbox"
            checked={settings.testMode}
            disabled={busy === "settings"}
            onChange={(event) =>
              void changeSetting(
                { testMode: event.target.checked },
                event.target.checked
                  ? "Test mode enabled."
                  : "Test mode disabled.",
              )
            }
          />
          <span>
            <strong>Use shortened local test timing</strong>
            <small>
              Test mode can exercise the sequencer but can never earn Day 1
              morning completion.
            </small>
          </span>
        </label>
        {settings.testMode ? (
          <p className="platform-message warning" role="status">
            TEST MODE ACTIVE — completion credit is disabled.
          </p>
        ) : null}
      </section>

      <section className="panel-card">
        <div className="card-heading">
          <div>
            <p className="eyebrow">Rev1 preservation</p>
            <h2>Migration status</h2>
          </div>
          <StatusBadge
            status={
              migration.status === "migrated" ||
              migration.status === "already_applied"
                ? "ready"
                : "reserved"
            }
          />
        </div>
        <p>
          <strong>{migrationLabel(migration.status)}</strong>
        </p>
        <dl className="settings-definition-list">
          <div>
            <dt>Imported entities</dt>
            <dd>{migration.importedEntityIds.length}</dd>
          </div>
          <div>
            <dt>Source fingerprint</dt>
            <dd>{migration.fingerprint ?? "none"}</dd>
          </div>
          <div>
            <dt>Ledger entry</dt>
            <dd>{migration.ledgerId ?? "none"}</dd>
          </div>
        </dl>
        {migration.warnings.length ? (
          <details>
            <summary>Migration warnings ({migration.warnings.length})</summary>
            <ul>
              {migration.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          </details>
        ) : null}
        <p className="fine-print">
          The Rev1 localStorage source is never deleted by migration.
        </p>
      </section>

      <section className="panel-card">
        <p className="eyebrow">Portable local data</p>
        <h2>Export</h2>
        <p>
          JSON contains validated structured metadata. Complete ZIP also
          contains raw audio chunks and attachment blobs with integrity checks.
        </p>
        <div className="platform-action-row">
          <button
            className="secondary-button"
            type="button"
            disabled={busy !== null}
            onClick={() => void exportData("json")}
          >
            {busy === "export-json" ? "Preparing JSON…" : "Export JSON"}
          </button>
          <button
            className="primary-button"
            type="button"
            disabled={busy !== null}
            onClick={() => void exportData("zip")}
          >
            {busy === "export-zip" ? "Preparing ZIP…" : "Export complete ZIP"}
          </button>
        </div>
      </section>

      <section className="panel-card">
        <p className="eyebrow">Validated merge only</p>
        <h2>Import</h2>
        <p>
          The full file and every referenced binary are validated before one
          merge transaction begins. Existing data is not cleared.
        </p>
        <label className="platform-field import-picker">
          <span>QCTP Rev2 JSON or complete ZIP</span>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.zip,application/json,application/zip"
            onChange={chooseImport}
          />
        </label>
        <button
          className="primary-button"
          type="button"
          disabled={!selectedImport || busy !== null}
          onClick={() => void importData()}
        >
          {busy === "import"
            ? "Validating and merging…"
            : selectedImport
              ? `Validate & merge ${selectedImport.name}`
              : "Choose an export first"}
        </button>
      </section>

      {error ? (
        <p className="platform-message error" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="platform-message success" role="status">
          {message}
        </p>
      ) : null}

      <section className="notice-card release-hold-card">
        <strong>Release authority: ZERO_RELEASE</strong>
        <p>
          This branch is for local/device preview. Settings cannot deploy,
          merge, enable paid transcription, or grant release authority.
        </p>
      </section>
    </>
  );
}
