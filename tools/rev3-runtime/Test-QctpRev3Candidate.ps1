[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$CandidateDirectory,

    [Parameter(Mandatory = $true)]
    [ValidatePattern('^[0-9a-fA-F]{40}$')]
    [string]$ExpectedHead,

    [string]$BaseUri,

    [switch]$AllowPrivateHttps,

    [string]$EvidencePath
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

. (Join-Path $PSScriptRoot 'QctpRev3Runtime.Common.ps1')

function Get-QctpByteSha256 {
    param([Parameter(Mandatory = $true)][byte[]]$Bytes)

    $algorithm = [Security.Cryptography.SHA256]::Create()
    try {
        return ([BitConverter]::ToString($algorithm.ComputeHash($Bytes))).Replace('-', '').ToLowerInvariant()
    }
    finally {
        $algorithm.Dispose()
    }
}

function ConvertTo-QctpUrlPath {
    param([Parameter(Mandatory = $true)][string]$RelativePath)

    return (($RelativePath.Replace('\', '/') -split '/') | ForEach-Object {
        [Uri]::EscapeDataString($_)
    }) -join '/'
}

function Test-QctpPrivateHost {
    param([Parameter(Mandatory = $true)][Uri]$Uri)

    if ($Uri.IsLoopback) {
        return $true
    }
    if ($Uri.Host.EndsWith('.ts.net', [StringComparison]::OrdinalIgnoreCase)) {
        return $true
    }

    [Net.IPAddress]$address = $null
    if ([Net.IPAddress]::TryParse($Uri.Host, [ref]$address) -and $address.AddressFamily -eq 'InterNetwork') {
        $bytes = $address.GetAddressBytes()
        if ($bytes[0] -eq 10 -or $bytes[0] -eq 127) { return $true }
        if ($bytes[0] -eq 192 -and $bytes[1] -eq 168) { return $true }
        if ($bytes[0] -eq 172 -and $bytes[1] -ge 16 -and $bytes[1] -le 31) { return $true }
        if ($bytes[0] -eq 100 -and $bytes[1] -ge 64 -and $bytes[1] -le 127) { return $true }
    }
    return $false
}

function Get-QctpFreeLoopbackPort {
    $listener = New-Object Net.Sockets.TcpListener([Net.IPAddress]::Loopback, 0)
    try {
        $listener.Start()
        return ([Net.IPEndPoint]$listener.LocalEndpoint).Port
    }
    finally {
        $listener.Stop()
    }
}

function Get-QctpHttpBytes {
    param(
        [Parameter(Mandatory = $true)][Net.Http.HttpClient]$Client,
        [Parameter(Mandatory = $true)][Uri]$Uri
    )

    $response = $Client.GetAsync($Uri).GetAwaiter().GetResult()
    try {
        if (-not $response.IsSuccessStatusCode) {
            throw "HTTP $([int]$response.StatusCode) while verifying $Uri"
        }
        return ,($response.Content.ReadAsByteArrayAsync().GetAwaiter().GetResult())
    }
    finally {
        $response.Dispose()
    }
}

$candidate = Resolve-QctpAbsolutePath -Path $CandidateDirectory -MustExist
$repoRoot = Resolve-QctpAbsolutePath -Path (Join-Path $PSScriptRoot '..\..') -MustExist
$rejectedHashes = Get-QctpRejectedA03Hashes -RepositoryRoot $repoRoot
$identity = Assert-QctpRev3CandidatePackage `
    -CandidateDirectory $candidate `
    -ExpectedHead $ExpectedHead `
    -RejectedHashes $rejectedHashes
$site = Join-Path $candidate 'site'

$managedPreview = [string]::IsNullOrWhiteSpace($BaseUri)
$previewProcess = $null
$stdoutPath = $null
$stderrPath = $null

try {
    if ($managedPreview) {
        $port = Get-QctpFreeLoopbackPort
        $BaseUri = "http://127.0.0.1:$port/"
        $serverPath = Join-Path $PSScriptRoot 'preview-server.mjs'
        $node = (Get-Command node -ErrorAction Stop).Source
        $nonce = [Guid]::NewGuid().ToString('N')
        $stdoutPath = Join-Path ([IO.Path]::GetTempPath()) "qctp-rev3-preview-$nonce.stdout.log"
        $stderrPath = Join-Path ([IO.Path]::GetTempPath()) "qctp-rev3-preview-$nonce.stderr.log"
        $arguments = @(
            "`"$serverPath`"",
            '--root',
            "`"$site`"",
            '--host',
            '127.0.0.1',
            '--port',
            [string]$port,
            '--candidate-sha',
            $ExpectedHead.ToLowerInvariant()
        )
        $previewProcess = Start-Process `
            -FilePath $node `
            -ArgumentList $arguments `
            -RedirectStandardOutput $stdoutPath `
            -RedirectStandardError $stderrPath `
            -WindowStyle Hidden `
            -PassThru
    }

    $base = [Uri]$BaseUri
    if (-not $base.AbsoluteUri.EndsWith('/')) {
        $base = [Uri]"$($base.AbsoluteUri)/"
    }
    if (-not (Test-QctpPrivateHost -Uri $base)) {
        throw "Candidate verification is restricted to loopback, private-network, or Tailscale HTTPS hosts."
    }
    if (-not $base.IsLoopback) {
        if ($base.Scheme -ne 'https' -or -not $AllowPrivateHttps) {
            throw "Non-loopback verification requires HTTPS and the explicit -AllowPrivateHttps switch."
        }
    }

    $handler = New-Object Net.Http.HttpClientHandler
    $handler.UseProxy = $false
    $client = New-Object Net.Http.HttpClient($handler)
    $client.Timeout = [TimeSpan]::FromMinutes(3)
    $client.DefaultRequestHeaders.CacheControl = New-Object Net.Http.Headers.CacheControlHeaderValue
    $client.DefaultRequestHeaders.CacheControl.NoCache = $true
    $client.DefaultRequestHeaders.CacheControl.NoStore = $true
    try {
        if ($managedPreview) {
            $healthUri = [Uri]::new($base, '__qctp_runtime/health')
            $ready = $false
            for ($attempt = 1; $attempt -le 40; $attempt += 1) {
                if ($previewProcess.HasExited) {
                    $stderr = if (Test-Path -LiteralPath $stderrPath) {
                        Get-Content -LiteralPath $stderrPath -Raw
                    }
                    else { '' }
                    throw "The isolated preview exited before verification. $stderr"
                }
                try {
                    $healthBytes = Get-QctpHttpBytes -Client $client -Uri $healthUri
                    $health = [Text.Encoding]::UTF8.GetString($healthBytes) | ConvertFrom-Json
                    if ([string]$health.candidateSha -eq $ExpectedHead.ToLowerInvariant()) {
                        $ready = $true
                        break
                    }
                }
                catch { }
                Start-Sleep -Milliseconds 250
            }
            if (-not $ready) {
                throw "The isolated loopback preview did not become ready."
            }
        }

        $identityUri = [Uri]::new($base, $script:QctpRev3IdentityName)
        $servedIdentityBytes = Get-QctpHttpBytes -Client $client -Uri $identityUri
        $servedIdentity = [Text.Encoding]::UTF8.GetString($servedIdentityBytes) | ConvertFrom-Json
        if (
            [string]$servedIdentity.schema -ne 'qctp-rev3-runtime-identity-v1' -or
            [string]$servedIdentity.candidateSha -ne $ExpectedHead.ToLowerInvariant() -or
            [string]$servedIdentity.sourceBranch -ne $script:QctpRev3Branch -or
            [string]$servedIdentity.releaseAuthority -ne 'ZERO_RELEASE'
        ) {
            throw "The served runtime identity is not the exact ZERO_RELEASE Rev3 candidate."
        }
        $diskIdentityHash = Get-QctpSha256 -Path (Join-Path $site $script:QctpRev3IdentityName)
        if ((Get-QctpByteSha256 -Bytes $servedIdentityBytes) -ne $diskIdentityHash) {
            throw "The served identity bytes differ from the staged candidate identity."
        }

        $contentManifestUri = [Uri]::new($base, $script:QctpRev3ContentManifestName)
        $servedManifestBytes = Get-QctpHttpBytes -Client $client -Uri $contentManifestUri
        $servedManifestHash = Get-QctpByteSha256 -Bytes $servedManifestBytes
        if ($servedManifestHash -ne ([string]$servedIdentity.contentManifestSha256).ToLowerInvariant()) {
            throw "The served content manifest does not match the served candidate identity."
        }
        $servedManifest = [Text.Encoding]::UTF8.GetString($servedManifestBytes) | ConvertFrom-Json

        $verifiedFiles = 0
        $verifiedBytes = [int64]0
        foreach ($record in @($servedManifest.files)) {
            $urlPath = ConvertTo-QctpUrlPath -RelativePath ([string]$record.path)
            $assetUri = [Uri]::new($base, $urlPath)
            $bytes = Get-QctpHttpBytes -Client $client -Uri $assetUri
            if ($bytes.LongLength -ne [int64]$record.bytes) {
                throw "Served byte-count mismatch: $($record.path)"
            }
            if ((Get-QctpByteSha256 -Bytes $bytes) -ne ([string]$record.sha256).ToLowerInvariant()) {
                throw "Served SHA-256 mismatch: $($record.path)"
            }
            $verifiedFiles += 1
            $verifiedBytes += $bytes.LongLength
        }
        if (
            $verifiedFiles -ne [int]$servedManifest.fileCount -or
            $verifiedBytes -ne [int64]$servedManifest.totalBytes
        ) {
            throw "Served runtime totals differ from the content manifest."
        }
    }
    finally {
        $client.Dispose()
        $handler.Dispose()
    }

    $result = [ordered]@{
        schema = 'qctp-rev3-runtime-preview-verification-v1'
        result = 'PASS'
        candidateSha = $ExpectedHead.ToLowerInvariant()
        sourceBranch = $script:QctpRev3Branch
        baseUri = $base.AbsoluteUri
        managedLoopbackPreview = $managedPreview
        exactIdentity = $true
        contentManifestSha256 = [string]$identity.contentManifestSha256
        verifiedFileCount = $verifiedFiles
        verifiedBytes = $verifiedBytes
        a03rRejectedAssetsPresent = $false
        externalMediaCriticalPath = $false
        paidApiKeyRequired = $false
        releaseAuthority = 'ZERO_RELEASE'
        verifiedAt = (Get-Date).ToUniversalTime().ToString('o')
    }
    if (-not [string]::IsNullOrWhiteSpace($EvidencePath)) {
        $evidence = Resolve-QctpAbsolutePath -Path $EvidencePath
        Write-QctpJsonFile -Value $result -Path $evidence
    }

    Write-Host ''
    Write-Host 'QCTP REV3 EXACT PRIVATE PREVIEW: PASS' -ForegroundColor Green
    Write-Host "Candidate SHA: $ExpectedHead"
    Write-Host "Verified origin: $($base.AbsoluteUri)"
    Write-Host "Verified files: $verifiedFiles"
    Write-Host "Verified bytes: $verifiedBytes"
    Write-Host 'Release authority: ZERO_RELEASE'
    $result | ConvertTo-Json -Depth 5
}
finally {
    if ($null -ne $previewProcess -and -not $previewProcess.HasExited) {
        Stop-Process -Id $previewProcess.Id -Force -ErrorAction SilentlyContinue
        $previewProcess.WaitForExit(5000) | Out-Null
    }
    foreach ($log in @($stdoutPath, $stderrPath)) {
        if (-not [string]::IsNullOrWhiteSpace($log) -and (Test-Path -LiteralPath $log -PathType Leaf)) {
            Remove-Item -LiteralPath $log -Force
        }
    }
}
