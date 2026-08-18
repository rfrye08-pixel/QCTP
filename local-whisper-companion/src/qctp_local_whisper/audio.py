from __future__ import annotations

import asyncio
import os
import tempfile
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import BinaryIO, cast

from fastapi import UploadFile

from .config import Settings
from .errors import CompanionError

__all__ = ["StoredAudio", "stage_audio_upload"]

_DECLARED_FORMATS = {
    "application/ogg": "ogg",
    "audio/flac": "flac",
    "audio/m4a": "mp4",
    "audio/mp3": "mp3",
    "audio/mp4": "mp4",
    "audio/mpeg": "mp3",
    "audio/ogg": "ogg",
    "audio/wav": "wav",
    "audio/webm": "webm",
    "audio/x-m4a": "mp4",
    "audio/x-wav": "wav",
    "video/mp4": "mp4",
    "video/webm": "webm",
}


@dataclass(frozen=True, kw_only=True)
class StoredAudio:
    path: Path
    size_bytes: int
    mime_type: str


def _declared_format(content_type: str | None) -> tuple[str, str]:
    normalized = (content_type or "").partition(";")[0].strip().lower()
    audio_format = _DECLARED_FORMATS.get(normalized)
    if audio_format is None:
        raise CompanionError(
            status_code=415,
            code="unsupported_audio_type",
            message="The uploaded audio type is not supported.",
            retryable=False,
        )
    return normalized, audio_format


def _detected_format(header: bytes) -> str | None:
    if len(header) >= 12 and header[:4] in {b"RIFF", b"RIFX"} and header[8:12] == b"WAVE":
        return "wav"
    if header.startswith(b"fLaC"):
        return "flac"
    if header.startswith(b"OggS"):
        return "ogg"
    if header.startswith(b"\x1aE\xdf\xa3"):
        return "webm"
    if len(header) >= 12 and header[4:8] == b"ftyp":
        return "mp4"
    if header.startswith(b"ID3") or (
        len(header) >= 2 and header[0] == 0xFF and header[1] & 0xE0 == 0xE0
    ):
        return "mp3"
    return None


def _create_temp_path(root: Path | None) -> Path:
    if root is not None:
        root.mkdir(parents=True, exist_ok=True)
    descriptor, raw_path = tempfile.mkstemp(
        dir=root,
        prefix="qctp-audio-",
        suffix=".upload",
    )
    os.close(descriptor)
    return Path(raw_path)


def _open_binary(path: Path) -> BinaryIO:
    return cast(BinaryIO, path.open("wb"))


@asynccontextmanager
async def stage_audio_upload(
    upload: UploadFile,
    settings: Settings,
) -> AsyncGenerator[StoredAudio]:
    declared_mime, expected_format = _declared_format(upload.content_type)
    if not upload.filename:
        raise CompanionError(
            status_code=422,
            code="missing_filename",
            message="The audio upload must include a filename.",
            retryable=False,
        )

    path: Path | None = None
    file_handle: BinaryIO | None = None
    try:
        path = await asyncio.to_thread(_create_temp_path, settings.temp_root)
        handle = await asyncio.to_thread(_open_binary, path)
        file_handle = handle
        total = 0
        header = bytearray()

        while chunk := await upload.read(settings.upload_chunk_bytes):
            total += len(chunk)
            if total > settings.max_upload_bytes:
                raise CompanionError(
                    status_code=413,
                    code="audio_too_large",
                    message="The audio upload exceeds the configured local size limit.",
                    retryable=False,
                )
            if len(header) < 64:
                header.extend(chunk[: 64 - len(header)])
            await asyncio.to_thread(handle.write, chunk)

        await asyncio.to_thread(handle.flush)
        await asyncio.to_thread(handle.close)
        file_handle = None

        if total == 0:
            raise CompanionError(
                status_code=422,
                code="empty_audio",
                message="The audio upload is empty.",
                retryable=False,
            )

        detected_format = _detected_format(bytes(header))
        if detected_format is None or detected_format != expected_format:
            raise CompanionError(
                status_code=415,
                code="audio_type_mismatch",
                message="The uploaded bytes do not match the declared audio type.",
                retryable=False,
            )

        yield StoredAudio(path=path, size_bytes=total, mime_type=declared_mime)
    finally:
        if file_handle is not None:
            await asyncio.to_thread(file_handle.close)
        await upload.close()
        if path is not None:
            await asyncio.to_thread(path.unlink, missing_ok=True)
