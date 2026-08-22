from __future__ import annotations

import asyncio
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import cast

import httpx
import pytest
from fastapi import FastAPI

from qctp_local_whisper.api import create_app
from qctp_local_whisper.config import Settings
from qctp_local_whisper.contracts import (
    EngineHealth,
    TranscriptionJob,
    TranscriptionResult,
)
from qctp_local_whisper.errors import ModelUnavailableError


def wav_bytes(size: int = 96) -> bytes:
    prefix = b"RIFF" + (size - 8).to_bytes(4, "little") + b"WAVE"
    return prefix + bytes(max(0, size - len(prefix)))


@dataclass
class FakeEngine:
    jobs: list[TranscriptionJob]
    seen_bytes: bytes = b""
    seen_path: Path | None = None

    def transcribe(self, job: TranscriptionJob) -> TranscriptionResult:
        self.jobs.append(job)
        self.seen_path = job.audio_path
        self.seen_bytes = job.audio_path.read_bytes()
        return TranscriptionResult(
            text="locally transcribed",
            language=job.language or "en",
            duration_ms=1_250,
        )

    def health(self) -> EngineHealth:
        return EngineHealth(
            engine="test-whisper",
            default_model="base",
            available_models=("base",),
            loaded_models=(),
        )


class UnavailableEngine(FakeEngine):
    def transcribe(self, job: TranscriptionJob) -> TranscriptionResult:
        raise ModelUnavailableError(job.model)


class BrokenEngine(FakeEngine):
    def transcribe(self, job: TranscriptionJob) -> TranscriptionResult:
        raise RuntimeError(f"private failure for {job.audio_path}")


class AppClient:
    def __init__(self, app: FastAPI) -> None:
        self._app = app

    def __enter__(self) -> AppClient:
        return self

    def __exit__(
        self,
        _exception_type: type[BaseException] | None,
        _exception: BaseException | None,
        _traceback: object,
    ) -> None:
        return None

    def get(self, url: str) -> httpx.Response:
        return self._request("GET", url)

    def post(
        self,
        url: str,
        *,
        files: Mapping[str, tuple[str, bytes, str]] | None = None,
        data: Mapping[str, str] | None = None,
        headers: Mapping[str, str] | None = None,
    ) -> httpx.Response:
        return self._request("POST", url, files=files, data=data, headers=headers)

    def _request(
        self,
        method: str,
        url: str,
        *,
        files: Mapping[str, tuple[str, bytes, str]] | None = None,
        data: Mapping[str, str] | None = None,
        headers: Mapping[str, str] | None = None,
    ) -> httpx.Response:
        async def send() -> httpx.Response:
            transport = httpx.ASGITransport(app=self._app, raise_app_exceptions=False)
            async with httpx.AsyncClient(
                transport=transport,
                base_url="http://127.0.0.1",
            ) as client:
                return await client.request(
                    method,
                    url,
                    files=files,
                    data=data,
                    headers=headers,
                )

        return asyncio.run(send())


def client_for(settings: Settings, engine: FakeEngine) -> AppClient:
    return AppClient(
        create_app(settings, engine=engine, request_id_factory=lambda: "fixed-request")
    )


def json_object(response: httpx.Response) -> dict[str, object]:
    value = cast(object, response.json())
    assert isinstance(value, dict)
    return cast(dict[str, object], value)


def error_object(response: httpx.Response) -> dict[str, object]:
    value = json_object(response).get("error")
    assert isinstance(value, dict)
    return cast(dict[str, object], value)


def error_code(response: httpx.Response) -> object:
    return error_object(response).get("code")


def test_health_is_lazy_and_reports_local_mode(settings: Settings) -> None:
    engine = FakeEngine([])
    with client_for(settings, engine) as client:
        response = client.get("/healthz")

    assert response.status_code == 200
    assert response.headers["x-request-id"] == "fixed-request"
    assert json_object(response) == {
        "status": "ok",
        "mode": "free-local",
        "version": "0.1.0",
        "engine": "test-whisper",
        "default_model": "base",
        "model_loaded": False,
        "available_models": ["base"],
        "loaded_models": [],
    }
    assert engine.jobs == []


def test_exact_server_contract_transcribes_and_deletes_temp_audio(settings: Settings) -> None:
    engine = FakeEngine([])
    original = wav_bytes()
    with client_for(settings, engine) as client:
        response = client.post(
            "/v1/audio/transcriptions",
            files={"file": ("capture.wav", original, "audio/wav")},
            data={
                "model": "base",
                "response_format": "json",
                "language": "EN",
                "prompt": "  proper nouns  ",
            },
            headers={"X-Request-Id": "server-request-17"},
        )

    assert response.status_code == 200
    assert response.headers["x-request-id"] == "server-request-17"
    assert json_object(response) == {
        "text": "locally transcribed",
        "language": "en",
        "model": "base",
        "duration_ms": 1250,
    }
    assert engine.seen_bytes == original
    assert engine.jobs[0].language == "en"
    assert engine.jobs[0].prompt == "proper nouns"
    assert engine.seen_path is not None
    assert not engine.seen_path.exists()


def test_browser_webm_codec_content_type_is_accepted(settings: Settings) -> None:
    engine = FakeEngine([])
    webm = b"\x1aE\xdf\xa3" + bytes(80)
    with client_for(settings, engine) as client:
        response = client.post(
            "/v1/audio/transcriptions",
            files={"file": ("capture.webm", webm, "audio/webm;codecs=opus")},
            data={"model": "small", "response_format": "json"},
        )

    assert response.status_code == 200
    assert engine.jobs[0].model == "small"
    assert engine.jobs[0].language is None
    assert engine.jobs[0].prompt is None


@pytest.mark.parametrize(
    ("mime_type", "payload"),
    [
        ("audio/flac", b"fLaC" + bytes(80)),
        ("audio/ogg", b"OggS" + bytes(80)),
        ("audio/mp4", bytes(4) + b"ftyp" + b"M4A " + bytes(80)),
        ("audio/mpeg", b"ID3" + bytes(80)),
        ("audio/mp3", b"\xff\xfb" + bytes(80)),
    ],
)
def test_supported_local_audio_containers_are_accepted(
    settings: Settings,
    mime_type: str,
    payload: bytes,
) -> None:
    engine = FakeEngine([])
    with client_for(settings, engine) as client:
        response = client.post(
            "/v1/audio/transcriptions",
            files={"file": ("capture.audio", payload, mime_type)},
            data={"model": "base", "response_format": "json"},
        )

    assert response.status_code == 200
    assert engine.seen_bytes == payload


def test_oversized_audio_is_rejected_before_inference(settings: Settings) -> None:
    engine = FakeEngine([])
    oversized = wav_bytes(settings.max_upload_bytes + 1)
    with client_for(settings, engine) as client:
        response = client.post(
            "/v1/audio/transcriptions",
            files={"file": ("large.wav", oversized, "audio/wav")},
            data={"model": "base", "response_format": "json"},
        )

    assert response.status_code == 413
    assert error_code(response) == "audio_too_large"
    assert engine.jobs == []
    assert settings.temp_root is not None
    assert list(settings.temp_root.glob("*")) == []


def test_empty_and_mismatched_audio_are_rejected(settings: Settings) -> None:
    engine = FakeEngine([])
    with client_for(settings, engine) as client:
        empty = client.post(
            "/v1/audio/transcriptions",
            files={"file": ("empty.wav", b"", "audio/wav")},
            data={"model": "base", "response_format": "json"},
        )
        mismatch = client.post(
            "/v1/audio/transcriptions",
            files={"file": ("fake.wav", b"OggS" + bytes(32), "audio/wav")},
            data={"model": "base", "response_format": "json"},
        )

    assert empty.status_code == 422
    assert error_code(empty) == "empty_audio"
    assert mismatch.status_code == 415
    assert error_code(mismatch) == "audio_type_mismatch"
    assert engine.jobs == []


def test_invalid_multipart_fields_return_stable_errors(settings: Settings) -> None:
    engine = FakeEngine([])
    cases = (
        ({"model": "base", "response_format": "text"}, "invalid_response_format"),
        (
            {"model": "base", "response_format": "json", "language": "english"},
            "invalid_language",
        ),
        (
            {"model": "base", "response_format": "json", "prompt": "x" * 65},
            "invalid_prompt",
        ),
        ({"model": " ", "response_format": "json"}, "invalid_model"),
        (
            {"model": "base", "response_format": "json", "prompt": "   "},
            "accepted_blank_prompt",
        ),
    )
    with client_for(settings, engine) as client:
        responses = [
            client.post(
                "/v1/audio/transcriptions",
                files={"file": ("capture.wav", wav_bytes(), "audio/wav")},
                data=data,
            )
            for data, _code in cases
        ]

    assert [response.status_code for response in responses] == [422, 422, 422, 422, 200]
    assert [error_code(response) for response in responses[:-1]] == [
        code for _data, code in cases[:-1]
    ]
    assert json_object(responses[-1]).get("text") == "locally transcribed"
    assert engine.jobs[-1].prompt is None


def test_unsupported_declared_type_is_rejected(settings: Settings) -> None:
    engine = FakeEngine([])
    with client_for(settings, engine) as client:
        response = client.post(
            "/v1/audio/transcriptions",
            files={"file": ("capture.bin", wav_bytes(), "application/octet-stream")},
            data={"model": "base", "response_format": "json"},
        )

    assert response.status_code == 415
    assert error_code(response) == "unsupported_audio_type"
    assert engine.jobs == []


def test_missing_file_and_unknown_route_use_generic_safe_errors(settings: Settings) -> None:
    engine = FakeEngine([])
    with client_for(settings, engine) as client:
        invalid = client.post(
            "/v1/audio/transcriptions",
            data={"model": "base", "response_format": "json"},
        )
        missing = client.get("/unknown")

    assert invalid.status_code == 422
    assert error_code(invalid) == "invalid_request"
    assert missing.status_code == 404
    assert error_code(missing) == "not_found"


def test_browser_origin_is_rejected_before_audio_processing(settings: Settings) -> None:
    engine = FakeEngine([])
    with client_for(settings, engine) as client:
        response = client.post(
            "/v1/audio/transcriptions",
            files={"file": ("capture.wav", wav_bytes(), "audio/wav")},
            data={"model": "base", "response_format": "json"},
            headers={"Origin": "https://malicious.invalid"},
        )

    assert response.status_code == 403
    assert error_code(response) == "browser_origin_rejected"
    assert engine.jobs == []


def test_model_unavailable_and_unexpected_failures_are_sanitized(settings: Settings) -> None:
    with client_for(settings, UnavailableEngine([])) as unavailable_client:
        unavailable = unavailable_client.post(
            "/v1/audio/transcriptions",
            files={"file": ("capture.wav", wav_bytes(), "audio/wav")},
            data={"model": "base", "response_format": "json"},
        )
    with client_for(settings, BrokenEngine([])) as broken_client:
        broken = broken_client.post(
            "/v1/audio/transcriptions",
            files={"file": ("capture.wav", wav_bytes(), "audio/wav")},
            data={"model": "base", "response_format": "json"},
        )

    assert unavailable.status_code == 503
    assert error_code(unavailable) == "model_unavailable"
    assert error_object(unavailable).get("retryable") is True
    assert broken.status_code == 500
    assert error_object(broken) == {
        "code": "internal_error",
        "message": "The local companion could not complete the request.",
        "retryable": True,
        "requestId": "fixed-request",
    }
    assert "private failure" not in broken.text
