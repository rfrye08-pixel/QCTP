from __future__ import annotations

import pytest
from fastapi import FastAPI

import qctp_local_whisper.cli as cli_module
from qctp_local_whisper.config import Settings


def test_cli_uses_validated_loopback_settings(
    settings: Settings,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: dict[str, object] = {}

    def from_env(_environment: object = None) -> Settings:
        return settings

    def run(
        app: FastAPI,
        *,
        host: str,
        port: int,
        log_level: str,
    ) -> None:
        captured.update({"app": app, "host": host, "port": port, "log_level": log_level})

    monkeypatch.setattr(cli_module.Settings, "from_env", from_env)
    monkeypatch.setattr(cli_module.uvicorn, "run", run)

    cli_module.main()

    assert isinstance(captured["app"], FastAPI)
    assert captured["host"] == "127.0.0.1"
    assert captured["port"] == 8788
    assert captured["log_level"] == "info"
