from __future__ import annotations

from pathlib import Path

import pytest

from qctp_local_whisper.config import Settings, SettingsError


def test_defaults_are_loopback_local_and_match_server_models(tmp_path: Path) -> None:
    settings = Settings.from_env({"LOCALAPPDATA": str(tmp_path)})

    assert settings.bind_host == "127.0.0.1"
    assert settings.port == 8788
    assert settings.model_root == (tmp_path / "QCTP" / "whisper-models").resolve()
    assert settings.allowed_models == ("base", "small")
    assert settings.default_model == "base"
    assert settings.max_upload_bytes == 25 * 1_024 * 1_024
    assert settings.max_prompt_chars == 4_096
    assert settings.device == "cpu"
    assert settings.compute_type == "int8"
    assert settings.max_concurrent_jobs == 1


def test_explicit_local_configuration_is_normalized(tmp_path: Path) -> None:
    model_root = tmp_path / "model root"
    temp_root = tmp_path / "temp root"
    settings = Settings.from_env(
        {
            "QCTP_LOCAL_WHISPER_HOST": "LOCALHOST",
            "QCTP_LOCAL_WHISPER_PORT": "9876",
            "QCTP_LOCAL_WHISPER_MODEL_ROOT": str(model_root),
            "QCTP_LOCAL_WHISPER_MODELS": "tiny,base",
            "QCTP_LOCAL_WHISPER_DEFAULT_MODEL": "tiny",
            "QCTP_LOCAL_WHISPER_MAX_BYTES": "4096",
            "QCTP_LOCAL_WHISPER_MAX_PROMPT_CHARS": "0",
            "QCTP_LOCAL_WHISPER_DEVICE": "AUTO",
            "QCTP_LOCAL_WHISPER_COMPUTE_TYPE": "float16",
            "QCTP_LOCAL_WHISPER_CPU_THREADS": "8",
            "QCTP_LOCAL_WHISPER_MAX_CONCURRENT": "2",
            "QCTP_LOCAL_WHISPER_TEMP_ROOT": str(temp_root),
        }
    )

    assert settings.bind_host == "localhost"
    assert settings.port == 9876
    assert settings.model_root == model_root.resolve()
    assert settings.allowed_models == ("tiny", "base")
    assert settings.default_model == "tiny"
    assert settings.max_upload_bytes == 4_096
    assert settings.max_prompt_chars == 0
    assert settings.device == "auto"
    assert settings.compute_type == "float16"
    assert settings.cpu_threads == 8
    assert settings.max_concurrent_jobs == 2
    assert settings.temp_root == temp_root.resolve()


@pytest.mark.parametrize(
    ("environment", "field"),
    [
        ({"QCTP_LOCAL_WHISPER_HOST": "0.0.0.0"}, "QCTP_LOCAL_WHISPER_HOST"),
        ({"QCTP_LOCAL_WHISPER_MODELS": ""}, "QCTP_LOCAL_WHISPER_MODELS"),
        ({"QCTP_LOCAL_WHISPER_MODELS": "base,base"}, "QCTP_LOCAL_WHISPER_MODELS"),
        ({"QCTP_LOCAL_WHISPER_MODELS": "../base"}, "QCTP_LOCAL_WHISPER_MODELS"),
        (
            {"QCTP_LOCAL_WHISPER_MODELS": "small", "QCTP_LOCAL_WHISPER_DEFAULT_MODEL": "base"},
            "QCTP_LOCAL_WHISPER_DEFAULT_MODEL",
        ),
        ({"QCTP_LOCAL_WHISPER_DEVICE": "remote"}, "QCTP_LOCAL_WHISPER_DEVICE"),
        ({"QCTP_LOCAL_WHISPER_COMPUTE_TYPE": "int8;run"}, "QCTP_LOCAL_WHISPER_COMPUTE_TYPE"),
        ({"QCTP_LOCAL_WHISPER_PORT": "not-a-number"}, "QCTP_LOCAL_WHISPER_PORT"),
        ({"QCTP_LOCAL_WHISPER_PORT": "0"}, "QCTP_LOCAL_WHISPER_PORT"),
        ({"QCTP_LOCAL_WHISPER_MAX_BYTES": "512"}, "QCTP_LOCAL_WHISPER_MAX_BYTES"),
        ({"QCTP_LOCAL_WHISPER_CPU_THREADS": "257"}, "QCTP_LOCAL_WHISPER_CPU_THREADS"),
        ({"QCTP_LOCAL_WHISPER_MAX_CONCURRENT": "5"}, "QCTP_LOCAL_WHISPER_MAX_CONCURRENT"),
    ],
)
def test_invalid_configuration_fails_closed(
    environment: dict[str, str],
    field: str,
) -> None:
    with pytest.raises(SettingsError) as captured:
        Settings.from_env(environment)

    assert captured.value.field == field


def test_xdg_path_is_used_without_windows_app_data(tmp_path: Path) -> None:
    settings = Settings.from_env({"XDG_DATA_HOME": str(tmp_path)})
    assert settings.model_root == (tmp_path / "qctp" / "whisper-models").resolve()
