from __future__ import annotations

import importlib
import importlib.util
import threading
from collections.abc import Callable, Iterable
from pathlib import Path
from typing import Protocol, cast

from .config import Settings
from .contracts import EngineHealth, TranscriptionJob, TranscriptionResult
from .errors import (
    CompanionError,
    InferenceFailedError,
    ModelNotAllowedError,
    ModelUnavailableError,
    NoSpeechDetectedError,
)

__all__ = ["FasterWhisperEngine", "ModelManager"]


class _WhisperSegment(Protocol):
    @property
    def text(self) -> str: ...


class _WhisperInfo(Protocol):
    @property
    def language(self) -> str: ...

    @property
    def duration(self) -> float: ...


class _WhisperModel(Protocol):
    def transcribe(
        self,
        audio: str,
        *,
        language: str | None,
        initial_prompt: str | None,
        vad_filter: bool,
    ) -> tuple[Iterable[_WhisperSegment], _WhisperInfo]: ...


class _WhisperConstructor(Protocol):
    def __call__(
        self,
        model_size_or_path: str,
        *,
        device: str,
        compute_type: str,
        cpu_threads: int,
        local_files_only: bool,
    ) -> _WhisperModel: ...


ModelFactory = Callable[[Path, Settings], _WhisperModel]


def _local_model_factory(model_path: Path, settings: Settings) -> _WhisperModel:
    if importlib.util.find_spec("faster_whisper") is None:
        raise ModelUnavailableError(model_path.name)

    module = importlib.import_module("faster_whisper")
    constructor_value = cast(object, getattr(module, "WhisperModel", None))
    if not callable(constructor_value):
        raise ModelUnavailableError(model_path.name)

    # This is the single dynamic dependency boundary. The local Protocol documents
    # and checks every constructor/method member the companion relies on.
    constructor = cast(_WhisperConstructor, constructor_value)
    return constructor(
        str(model_path),
        device=settings.device,
        compute_type=settings.compute_type,
        cpu_threads=settings.cpu_threads,
        local_files_only=True,
    )


class ModelManager:
    def __init__(
        self,
        settings: Settings,
        *,
        factory: ModelFactory | None = None,
    ) -> None:
        self._settings = settings
        self._factory = factory or _local_model_factory
        self._models: dict[str, _WhisperModel] = {}
        self._lock = threading.RLock()

    def _model_path(self, model: str) -> Path:
        if model not in self._settings.allowed_models:
            raise ModelNotAllowedError(model)

        root = self._settings.model_root.resolve()
        model_path = (root / model).resolve()
        try:
            model_path.relative_to(root)
        except ValueError as error:
            raise ModelNotAllowedError(model) from error
        if not model_path.is_dir():
            raise ModelUnavailableError(model)
        return model_path

    def get(self, model: str) -> _WhisperModel:
        model_path = self._model_path(model)
        with self._lock:
            existing = self._models.get(model)
            if existing is not None:
                return existing
            try:
                loaded = self._factory(model_path, self._settings)
            except CompanionError:
                raise
            except Exception as error:
                raise ModelUnavailableError(model) from error
            self._models[model] = loaded
            return loaded

    def available_models(self) -> tuple[str, ...]:
        return tuple(
            model
            for model in self._settings.allowed_models
            if (self._settings.model_root / model).is_dir()
        )

    def loaded_models(self) -> tuple[str, ...]:
        with self._lock:
            return tuple(model for model in self._settings.allowed_models if model in self._models)


class FasterWhisperEngine:
    def __init__(self, settings: Settings, *, manager: ModelManager | None = None) -> None:
        self._settings = settings
        self._manager = manager or ModelManager(settings)

    def transcribe(self, job: TranscriptionJob) -> TranscriptionResult:
        try:
            model = self._manager.get(job.model)
            segments, information = model.transcribe(
                str(job.audio_path),
                language=job.language,
                initial_prompt=job.prompt,
                vad_filter=True,
            )
            text = " ".join(content for segment in segments if (content := segment.text.strip()))
        except CompanionError:
            raise
        except Exception as error:
            raise InferenceFailedError from error

        if not text:
            raise NoSpeechDetectedError

        detected_language = information.language.strip().lower() or job.language
        duration_ms = max(0, round(information.duration * 1_000))
        return TranscriptionResult(
            text=text,
            language=detected_language,
            duration_ms=duration_ms,
        )

    def health(self) -> EngineHealth:
        return EngineHealth(
            engine="faster-whisper",
            default_model=self._settings.default_model,
            available_models=self._manager.available_models(),
            loaded_models=self._manager.loaded_models(),
        )
