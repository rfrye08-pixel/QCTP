# QCTP Rev3 private-runtime package

This tooling creates and verifies an immutable **private preview** package. It
does not merge, publish, configure Tailscale, enable Funnel, restart a service,
or grant release authority. Every generated identity is `ZERO_RELEASE`.

## Safety model

- Staging accepts only a clean `qctp-platform-rev3-codex` worktree whose exact
  40-character HEAD equals both the operator-supplied SHA and
  `origin/qctp-platform-rev3-codex`.
- The production distribution is built in a detached, no-hardlinks clone with
  `npm ci` and `npm run check`. The candidate root must be an explicit absolute
  path outside the source worktree.
- The package has a SHA-256 content manifest, a served identity bound to that
  manifest, and an outer SHA-256 package manifest.
- A03R files are rejected by controlled path and by hashes derived from
  `controlled-artifacts/a03r-rejected`, so renaming a rejected binary does not
  bypass the gate.
- The entry document cannot load executable or media assets from another
  origin and cannot contain a paid-provider endpoint, API-key name, or
  secret-shaped token.
- Exact preview verification starts a loopback-only Node server and downloads
  every manifested asset from that origin, checking byte counts and SHA-256.
  A provided remote origin must be private/Tailscale, HTTPS, and explicitly
  allowed.
- Install and rollback are separate commands. Both require two explicit opt-in
  switches, prepare and verify the replacement beside the live root, and retain
  the displaced tree. They do not stop or restart the gateway.

## 1. Read-only discovery

```powershell
pwsh -NoProfile -File .\tools\rev3-runtime\Discover-QctpLiveRuntime.ps1
```

Discovery inspects relevant listeners, QCTP scheduled-task launchers, direct
known roots, and loopback health. It does not create a probe file. Command-line
and task-action values are represented only by SHA-256 so credentials cannot be
printed. A discovered directory is a candidate root, not proof that it is the
served root; exact served identity is the responsibility of the preview test.

## 2. Stage the exact candidate

Run only after the Rev3 work is committed, pushed, and the worktree is clean:

```powershell
$head = (git rev-parse HEAD).Trim()
$candidateRoot = 'C:\QCTP-Rev3-Private-Candidates'
pwsh -NoProfile -File .\tools\rev3-runtime\Stage-QctpRev3Candidate.ps1 `
  -ExpectedHead $head `
  -CandidateRoot $candidateRoot
```

The immutable output is:

`C:\QCTP-Rev3-Private-Candidates\qctp-rev3-<full SHA>`

A failed isolated build is preserved under the explicit candidate root for
diagnosis. A successful build removes only its verified, uniquely prefixed
temporary directory.

## 3. Verify an isolated loopback preview

```powershell
$candidate = Join-Path $candidateRoot "qctp-rev3-$head"
pwsh -NoProfile -File .\tools\rev3-runtime\Test-QctpRev3Candidate.ps1 `
  -CandidateDirectory $candidate `
  -ExpectedHead $head
```

To verify an already installed private Tailscale HTTPS origin, use its exact
private URL and opt in to that network read:

```powershell
pwsh -NoProfile -File .\tools\rev3-runtime\Test-QctpRev3Candidate.ps1 `
  -CandidateDirectory $candidate `
  -ExpectedHead $head `
  -BaseUri 'https://px13.<private-tailnet>.ts.net/' `
  -AllowPrivateHttps
```

The built-in preview server binds only to loopback. Private iPhone access must
remain a separate Tailscale HTTPS Serve route to loopback; this package never
enables public Funnel.

## 4. Explicit private install

This is intentionally not part of staging or testing:

```powershell
pwsh -NoProfile -File .\tools\rev3-runtime\Install-QctpRev3Candidate.ps1 `
  -CandidateDirectory $candidate `
  -LiveRoot 'C:\exact\discovered\QCTP\dist' `
  -BackupRoot 'C:\QCTP-Private-Runtime-Backups' `
  -ExpectedHead $head `
  -InstallPrivatePreview `
  -ConfirmZeroRelease
```

If the exact live root is the current repository's ignored `dist`, the
additional `-AllowWorktreeDist` switch is required. Other paths inside the
source worktree are always refused. Live and backup roots must be on the same
volume so directory swaps remain rename-based and recoverable.

After installation, run the exact served-origin test. A process holding the
directory open can cause a Windows rename to fail; the script does not kill it
and restores the old location when possible.

## 5. Rollback

Use the exact backup directory printed by the install command:

```powershell
pwsh -NoProfile -File .\tools\rev3-runtime\Rollback-QctpRev3Runtime.ps1 `
  -LiveRoot 'C:\exact\discovered\QCTP\dist' `
  -BackupDirectory 'C:\QCTP-Private-Runtime-Backups\backup-<timestamp>-...' `
  -RetentionRoot 'C:\QCTP-Private-Runtime-Rollbacks' `
  -ExpectedInstalledHead $head `
  -RollbackPrivatePreview `
  -ConfirmZeroRelease
```

Rollback verifies the backup manifest, prepares the replacement beside the
live root, retains the displaced Rev3 site, and keeps the original backup.

## Tool self-test

```powershell
pwsh -NoProfile -File .\tools\rev3-runtime\Test-QctpRev3RuntimeTools.ps1
```

The self-test uses a uniquely named temporary tree. It proves manifest-tamper
rejection, A03R-path rejection, exact loopback serving, atomic install with a
recoverable backup, and rollback. It never touches a discovered or live QCTP
root.

## Holds

This package is not by itself a production or release gate. Browser/WebKit,
physical iPhone, long-practice, Windows process-interruption, Tailscale route,
and release-authority gates remain separate controlled evidence. A power loss
between the two same-volume renames may require using the retained `site`
directory manually; no script can make two Windows directory renames a single
filesystem transaction.
