from __future__ import annotations

import asyncio
import logging
import re
from collections.abc import Awaitable, Callable
from typing import Annotated, cast
from uuid import uuid4

from fastapi import FastAPI, File, Form, Request, UploadFile
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from starlette.exceptions import HTTPException as StarletteHttpException
from starlette.middleware.trustedhost import TrustedHostMiddleware
from starlette.responses import Response

from ._version import __version__
from .audio import stage_audio_upload
from .config import Settings
from .contracts import TranscriptionEngine, TranscriptionJob
from .engine import FasterWhisperEngine
from .errors import CompanionError

__all__ = ["create_app"]

_REQUEST_ID = re.compile(r"^[A-Za-z0-9._-]{1,128}$")
_LANGUAGE = re.compile(r"^[a-z]{2}$")
_LOGGER = logging.getLogger(__name__)


class _ErrorDetail(BaseModel):
    code: str
    message: str
    retryable: bool
    request_id: str = Field(serialization_alias="requestId")


class _ErrorResponse(BaseModel):
    error: _ErrorDetail


class _TranscriptionResponse(BaseModel):
    text: str
    language: str | None = None
    model: str
    duration_ms: int | None = None


class _HealthResponse(BaseModel):
    status: str
    mode: str
    version: str
    engine: str
    default_model: str
    model_loaded: bool
    available_models: tuple[str, ...]
    loaded_models: tuple[str, ...]


def _request_id(request: Request) -> str:
    value = cast(object, getattr(request.state, "request_id", None))
    return value if isinstance(value, str) else "unavailable"


def _error_response(
    request: Request,
    *,
    status_code: int,
    code: str,
    message: str,
    retryable: bool,
) -> JSONResponse:
    request_id = _request_id(request)
    body = _ErrorResponse(
        error=_ErrorDetail(
            code=code,
            message=message,
            retryable=retryable,
            request_id=request_id,
        )
    )
    return JSONResponse(
        status_code=status_code,
        content=body.model_dump(by_alias=True),
        headers={"X-Request-Id": request_id},
    )


def create_app(
    settings: Settings | None = None,
    *,
    engine: TranscriptionEngine | None = None,
    request_id_factory: Callable[[], str] | None = None,
) -> FastAPI:
    active_settings = settings or Settings.from_env()
    active_engine = engine or FasterWhisperEngine(active_settings)
    make_request_id = request_id_factory or (lambda: uuid4().hex)
    limiter = asyncio.Semaphore(active_settings.max_concurrent_jobs)

    app = FastAPI(
        title="QCTP Local Whisper Companion",
        version=__version__,
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )
    app.add_middleware(
        TrustedHostMiddleware,
        allowed_hosts=["127.0.0.1", "localhost", "[::1]"],
    )

    @app.middleware("http")
    async def _local_request_guard(  # pyright: ignore[reportUnusedFunction] - FastAPI callback
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        candidate = request.headers.get("x-request-id", "")
        request_id = candidate if _REQUEST_ID.fullmatch(candidate) else make_request_id()
        request.state.request_id = request_id

        # A normal server-to-companion request has no browser Origin header. Rejecting
        # one prevents a web page from using the loopback process as a CSRF target.
        if request.headers.get("origin") is not None:
            return _error_response(
                request,
                status_code=403,
                code="browser_origin_rejected",
                message="Browser-origin requests are not accepted by the local companion.",
                retryable=False,
            )

        response = await call_next(request)
        response.headers["X-Request-Id"] = request_id
        return response

    @app.exception_handler(CompanionError)
    async def _companion_error_handler(  # pyright: ignore[reportUnusedFunction] - FastAPI callback
        request: Request,
        error: CompanionError,
    ) -> JSONResponse:
        return _error_response(
            request,
            status_code=error.status_code,
            code=error.code,
            message=error.message,
            retryable=error.retryable,
        )

    @app.exception_handler(RequestValidationError)
    async def _validation_error_handler(  # pyright: ignore[reportUnusedFunction] - FastAPI callback
        request: Request,
        _error: RequestValidationError,
    ) -> JSONResponse:
        return _error_response(
            request,
            status_code=422,
            code="invalid_request",
            message="The multipart transcription request is invalid.",
            retryable=False,
        )

    @app.exception_handler(StarletteHttpException)
    async def _http_error_handler(  # pyright: ignore[reportUnusedFunction] - FastAPI callback
        request: Request,
        error: StarletteHttpException,
    ) -> JSONResponse:
        return _error_response(
            request,
            status_code=error.status_code,
            code="not_found" if error.status_code == 404 else "http_error",
            message="The requested local companion route is unavailable.",
            retryable=False,
        )

    @app.exception_handler(Exception)
    async def _unexpected_error_handler(  # pyright: ignore[reportUnusedFunction] - FastAPI callback
        request: Request,
        error: Exception,
    ) -> JSONResponse:
        _LOGGER.error(
            "Unexpected local companion failure",
            exc_info=(type(error), error, error.__traceback__),
        )
        return _error_response(
            request,
            status_code=500,
            code="internal_error",
            message="The local companion could not complete the request.",
            retryable=True,
        )

    @app.get("/healthz", response_model=_HealthResponse)
    async def _health() -> _HealthResponse:  # pyright: ignore[reportUnusedFunction] - route
        state = await asyncio.to_thread(active_engine.health)
        return _HealthResponse(
            status="ok",
            mode="free-local",
            version=__version__,
            engine=state.engine,
            default_model=state.default_model,
            model_loaded=state.default_model in state.loaded_models,
            available_models=state.available_models,
            loaded_models=state.loaded_models,
        )

    @app.post(
        "/v1/audio/transcriptions",
        response_model=_TranscriptionResponse,
        response_model_exclude_none=True,
    )
    async def _transcribe(  # pyright: ignore[reportUnusedFunction] - route
        file: Annotated[UploadFile, File()],
        model: Annotated[str, Form()],
        response_format: Annotated[str, Form()],
        language: Annotated[str | None, Form()] = None,
        prompt: Annotated[str | None, Form()] = None,
    ) -> _TranscriptionResponse:
        normalized_model = model.strip()
        if not normalized_model or len(normalized_model) > 64:
            raise CompanionError(
                status_code=422,
                code="invalid_model",
                message="The local model alias is invalid.",
                retryable=False,
            )
        if response_format != "json":
            raise CompanionError(
                status_code=422,
                code="invalid_response_format",
                message="Only response_format=json is supported.",
                retryable=False,
            )

        normalized_language = language.strip().lower() if language is not None else None
        if normalized_language is not None and _LANGUAGE.fullmatch(normalized_language) is None:
            raise CompanionError(
                status_code=422,
                code="invalid_language",
                message="Language must be a two-letter ISO-639-1 code.",
                retryable=False,
            )

        normalized_prompt = prompt.strip() if prompt is not None else None
        if normalized_prompt == "":
            normalized_prompt = None
        if normalized_prompt is not None and (
            len(normalized_prompt) > active_settings.max_prompt_chars or "\x00" in normalized_prompt
        ):
            raise CompanionError(
                status_code=422,
                code="invalid_prompt",
                message="The local transcription prompt is invalid or too long.",
                retryable=False,
            )

        async with stage_audio_upload(file, active_settings) as audio, limiter:
            result = await asyncio.to_thread(
                active_engine.transcribe,
                TranscriptionJob(
                    audio_path=audio.path,
                    model=normalized_model,
                    language=normalized_language,
                    prompt=normalized_prompt,
                ),
            )

        return _TranscriptionResponse(
            text=result.text,
            language=result.language,
            model=normalized_model,
            duration_ms=result.duration_ms,
        )

    return app
