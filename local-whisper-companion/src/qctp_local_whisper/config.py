from __future__ import annotations

import os
import re
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path

__all__ = ["Settings", "SettingsError"]

_LOOPBACK_HOSTS = frozenset({"127.0.0.1", "localhost", "::1"})
_MODEL_ALIAS = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")
_COMPUTE_TYPE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$")


class SettingsError(ValueError):
    def __init__(self, field: str, message: str) -> None:
        super().__init__(f"Invalid {field}: {message}")
        self.field = field


def _integer(
    environment: Mapping[str, str],
    name: str,
    default: int,
    *,
    minimum: int,
    maximum: int,
) -> int:
    raw = environment.get(name, str(default)).strip()
    try:
        value = int(raw)
    except ValueError as error:
        raise SettingsError(name, "must be an integer") from error
    if not minimum <= value <= maximum:
        raise SettingsError(name, f"must be between {minimum} and {maximum}")
    return value


def _default_model_root(environment: Mapping[str, str]) -> Path:
    local_app_data = environment.get("LOCALAPPDATA", "").strip()
    if local_app_data:
        return Path(local_app_data) / "QCTP" / "whisper-models"

    xdg_data_home = environment.get("XDG_DATA_HOME", "").strip()
    if xdg_data_home:
        return Path(xdg_data_home) / "qctp" / "whisper-models"
    return Path.home() / ".local" / "share" / "qctp" / "whisper-models"


def _model_aliases(raw: str) -> tuple[str, ...]:
    aliases = tuple(part.strip() for part in raw.split(",") if part.strip())
    if not aliases:
        raise SettingsError("QCTP_LOCAL_WHISPER_MODELS", "must contain at least one alias")
    if len(set(aliases)) != len(aliases):
        raise SettingsError("QCTP_LOCAL_WHISPER_MODELS", "must not contain duplicates")
    invalid = next((alias for alias in aliases if _MODEL_ALIAS.fullmatch(alias) is None), None)
    if invalid is not None:
        raise SettingsError(
            "QCTP_LOCAL_WHISPER_MODELS",
            f"contains unsafe alias '{invalid}'",
        )
    return aliases


@dataclass(frozen=True, kw_only=True)
class Settings:
    bind_host: str
    port: int
    model_root: Path
    allowed_models: tuple[str, ...]
    default_model: str
    max_upload_bytes: int
    max_prompt_chars: int
    upload_chunk_bytes: int
    device: str
    compute_type: str
    cpu_threads: int
    max_concurrent_jobs: int
    temp_root: Path | None = None

    @classmethod
    def from_env(cls, environment: Mapping[str, str] | None = None) -> Settings:
        values = os.environ if environment is None else environment
        bind_host = values.get("QCTP_LOCAL_WHISPER_HOST", "127.0.0.1").strip().lower()
        if bind_host not in _LOOPBACK_HOSTS:
            raise SettingsError(
                "QCTP_LOCAL_WHISPER_HOST",
                "must be a loopback host (127.0.0.1, localhost, or ::1)",
            )

        allowed_models = _model_aliases(values.get("QCTP_LOCAL_WHISPER_MODELS", "base,small"))
        default_model = values.get("QCTP_LOCAL_WHISPER_DEFAULT_MODEL", "base").strip()
        if default_model not in allowed_models:
            raise SettingsError(
                "QCTP_LOCAL_WHISPER_DEFAULT_MODEL",
                "must be included in QCTP_LOCAL_WHISPER_MODELS",
            )

        configured_root = values.get("QCTP_LOCAL_WHISPER_MODEL_ROOT", "").strip()
        model_root = (
            Path(configured_root) if configured_root else _default_model_root(values)
        ).expanduser()

        device = values.get("QCTP_LOCAL_WHISPER_DEVICE", "cpu").strip().lower()
        if device not in {"auto", "cpu", "cuda"}:
            raise SettingsError("QCTP_LOCAL_WHISPER_DEVICE", "must be auto, cpu, or cuda")
        compute_type = values.get("QCTP_LOCAL_WHISPER_COMPUTE_TYPE", "int8").strip()
        if _COMPUTE_TYPE.fullmatch(compute_type) is None:
            raise SettingsError("QCTP_LOCAL_WHISPER_COMPUTE_TYPE", "contains invalid characters")

        temp_value = values.get("QCTP_LOCAL_WHISPER_TEMP_ROOT", "").strip()
        temp_root = Path(temp_value).expanduser().resolve() if temp_value else None

        return cls(
            bind_host=bind_host,
            port=_integer(
                values,
                "QCTP_LOCAL_WHISPER_PORT",
                8788,
                minimum=1,
                maximum=65_535,
            ),
            model_root=model_root.resolve(),
            allowed_models=allowed_models,
            default_model=default_model,
            max_upload_bytes=_integer(
                values,
                "QCTP_LOCAL_WHISPER_MAX_BYTES",
                25 * 1_024 * 1_024,
                minimum=1_024,
                maximum=100 * 1_024 * 1_024,
            ),
            max_prompt_chars=_integer(
                values,
                "QCTP_LOCAL_WHISPER_MAX_PROMPT_CHARS",
                4_096,
                minimum=0,
                maximum=16_384,
            ),
            upload_chunk_bytes=1_024 * 1_024,
            device=device,
            compute_type=compute_type,
            cpu_threads=_integer(
                values,
                "QCTP_LOCAL_WHISPER_CPU_THREADS",
                0,
                minimum=0,
                maximum=256,
            ),
            max_concurrent_jobs=_integer(
                values,
                "QCTP_LOCAL_WHISPER_MAX_CONCURRENT",
                1,
                minimum=1,
                maximum=4,
            ),
            temp_root=temp_root,
        )
