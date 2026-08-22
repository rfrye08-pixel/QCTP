# QCTP Local Whisper Companion

This package is the Free Local Mode transcription process for QCTP. It accepts audio only on a
loopback interface and runs a locally provisioned CTranslate2 Whisper model through
`faster-whisper`. It contains no cloud client, API key handling, telemetry, or model downloader.

## Install and run

Use Python 3.11, 3.12, or 3.13. From this directory:

```powershell
uv sync --extra dev
uv run qctp-local-whisper
```

The default address is `http://127.0.0.1:8788`. The process refuses a non-loopback bind address.
QCTP's server calls:

```text
POST /v1/audio/transcriptions
multipart: file, model, response_format=json, language?, prompt?
```

`GET /healthz` reports process health and installed/loaded model aliases without loading a model.

## Provision local models

The companion intentionally never downloads a model. During controlled machine setup, place an
already obtained and verified CTranslate2 model directory at:

```text
%LOCALAPPDATA%\QCTP\whisper-models\base
%LOCALAPPDATA%\QCTP\whisper-models\small
```

`base` is the normal model and `small` is the high-accuracy model expected by the QCTP server.
Until a requested directory exists, the API returns `503 model_unavailable`; recording, local
audio saving, playback, and manual transcription remain usable in QCTP.

## Configuration

| Variable                              | Default                              | Constraint                                 |
| ------------------------------------- | ------------------------------------ | ------------------------------------------ |
| `QCTP_LOCAL_WHISPER_HOST`             | `127.0.0.1`                          | `127.0.0.1`, `localhost`, or `::1` only    |
| `QCTP_LOCAL_WHISPER_PORT`             | `8788`                               | `1`–`65535`                                |
| `QCTP_LOCAL_WHISPER_MODEL_ROOT`       | `%LOCALAPPDATA%\QCTP\whisper-models` | Local directory                            |
| `QCTP_LOCAL_WHISPER_MODELS`           | `base,small`                         | Comma-separated safe aliases               |
| `QCTP_LOCAL_WHISPER_DEFAULT_MODEL`    | `base`                               | Must be in the alias list                  |
| `QCTP_LOCAL_WHISPER_MAX_BYTES`        | `26214400`                           | Maximum decoded upload size, up to 100 MiB |
| `QCTP_LOCAL_WHISPER_MAX_PROMPT_CHARS` | `4096`                               | `0`–`16384`                                |
| `QCTP_LOCAL_WHISPER_DEVICE`           | `cpu`                                | `cpu`, `cuda`, or `auto`                   |
| `QCTP_LOCAL_WHISPER_COMPUTE_TYPE`     | `int8`                               | Passed to the local engine                 |
| `QCTP_LOCAL_WHISPER_CPU_THREADS`      | `0`                                  | `0` lets CTranslate2 choose                |
| `QCTP_LOCAL_WHISPER_MAX_CONCURRENT`   | `1`                                  | `1`–`4` local inference jobs               |

Do not expose this process through a reverse proxy or bind it to a LAN address. The QCTP server
also validates that its configured companion URL is unauthenticated loopback HTTP.

## Verify without a model

The deterministic suite injects a fake inference engine and blocks network access. It does not
download or execute a model:

```powershell
uv run --extra dev pytest --cov --cov-branch
uv run --extra dev ruff check .
uv run --extra dev ruff format --check .
uv run --extra dev basedpyright
uv run --extra dev ty check
```
