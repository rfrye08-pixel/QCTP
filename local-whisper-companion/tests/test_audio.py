from __future__ import annotations

import asyncio
from io import BytesIO

import pytest
from fastapi import UploadFile
from starlette.datastructures import Headers

from qctp_local_whisper.audio import stage_audio_upload
from qctp_local_whisper.config import Settings
from qctp_local_whisper.errors import CompanionError


def test_upload_requires_supported_declared_type(settings: Settings) -> None:
    upload = UploadFile(
        BytesIO(b"plain text"),
        filename="note.txt",
        headers=Headers({"content-type": "text/plain"}),
    )

    async def stage() -> None:
        async with stage_audio_upload(upload, settings):
            raise AssertionError("unsupported input must not be staged")

    with pytest.raises(CompanionError) as captured:
        asyncio.run(stage())

    assert captured.value.status_code == 415
    assert captured.value.code == "unsupported_audio_type"


def test_upload_requires_filename(settings: Settings) -> None:
    upload = UploadFile(
        BytesIO(b"RIFF" + bytes(4) + b"WAVE" + bytes(20)),
        filename=None,
        headers=Headers({"content-type": "audio/wav"}),
    )

    async def stage() -> None:
        async with stage_audio_upload(upload, settings):
            raise AssertionError("unnamed input must not be staged")

    with pytest.raises(CompanionError) as captured:
        asyncio.run(stage())

    assert captured.value.status_code == 422
    assert captured.value.code == "missing_filename"
