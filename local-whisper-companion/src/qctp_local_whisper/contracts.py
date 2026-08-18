from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Protocol

__all__ = [
    "EngineHealth",
    "TranscriptionEngine",
    "TranscriptionJob",
    "TranscriptionResult",
]


@dataclass(frozen=True, kw_only=True)
class TranscriptionJob:
    audio_path: Path
    model: str
    language: str | None
    prompt: str | None


@dataclass(frozen=True, kw_only=True)
class TranscriptionResult:
    text: str
    language: str | None
    duration_ms: int | None


@dataclass(frozen=True, kw_only=True)
class EngineHealth:
    engine: str
    default_model: str
    available_models: tuple[str, ...]
    loaded_models: tuple[str, ...]


class TranscriptionEngine(Protocol):
    def transcribe(self, job: TranscriptionJob) -> TranscriptionResult: ...

    def health(self) -> EngineHealth: ...
