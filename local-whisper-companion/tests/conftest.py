from __future__ import annotations

import socket
from collections.abc import Iterator
from pathlib import Path

import pytest

from qctp_local_whisper.config import Settings


@pytest.fixture(autouse=True)
def block_network(monkeypatch: pytest.MonkeyPatch) -> None:
    def blocked_connection(*_args: object, **_kwargs: object) -> None:
        raise AssertionError("Network access is forbidden in companion tests")

    monkeypatch.setattr(socket, "create_connection", blocked_connection)


@pytest.fixture
def settings(tmp_path: Path) -> Iterator[Settings]:
    model_root = tmp_path / "models"
    temp_root = tmp_path / "uploads"
    yield Settings(
        bind_host="127.0.0.1",
        port=8788,
        model_root=model_root,
        allowed_models=("base", "small"),
        default_model="base",
        max_upload_bytes=2_048,
        max_prompt_chars=64,
        upload_chunk_bytes=128,
        device="cpu",
        compute_type="int8",
        cpu_threads=0,
        max_concurrent_jobs=1,
        temp_root=temp_root,
    )
