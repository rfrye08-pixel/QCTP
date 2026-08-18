from __future__ import annotations

import importlib.machinery
from dataclasses import dataclass, replace
from pathlib import Path
from types import ModuleType

import pytest

import qctp_local_whisper.engine as engine_module
from qctp_local_whisper.config import Settings
from qctp_local_whisper.contracts import TranscriptionJob
from qctp_local_whisper.engine import FasterWhisperEngine, ModelManager
from qctp_local_whisper.errors import (
    InferenceFailedError,
    ModelNotAllowedError,
    ModelUnavailableError,
    NoSpeechDetectedError,
)


@dataclass(frozen=True)
class Segment:
    text: str


@dataclass(frozen=True)
class Info:
    language: str
    duration: float


class FakeModel:
    def __init__(
        self,
        segments: tuple[Segment, ...] = (Segment(" local "), Segment(" transcript ")),
        *,
        information: Info | None = None,
        failure: Exception | None = None,
    ) -> None:
        self.segments = segments
        self.information = information or Info("EN", 1.234)
        self.failure = failure
        self.calls: list[tuple[str, str | None, str | None, bool]] = []

    def transcribe(
        self,
        audio: str,
        *,
        language: str | None,
        initial_prompt: str | None,
        vad_filter: bool,
    ) -> tuple[tuple[Segment, ...], Info]:
        self.calls.append((audio, language, initial_prompt, vad_filter))
        if self.failure is not None:
            raise self.failure
        return self.segments, self.information


class FakeFasterWhisperModule(ModuleType):
    WhisperModel: object


def install_model_directory(settings: Settings, model: str = "base") -> Path:
    model_path = settings.model_root / model
    model_path.mkdir(parents=True)
    return model_path


def test_model_manager_loads_lazily_once_and_reports_state(settings: Settings) -> None:
    model_path = install_model_directory(settings)
    model = FakeModel()
    calls: list[Path] = []

    def factory(path: Path, _settings: Settings) -> FakeModel:
        calls.append(path)
        return model

    manager = ModelManager(settings, factory=factory)

    assert manager.available_models() == ("base",)
    assert manager.loaded_models() == ()
    assert manager.get("base") is model
    assert manager.get("base") is model
    assert calls == [model_path.resolve()]
    assert manager.loaded_models() == ("base",)


def test_model_manager_rejects_unapproved_and_missing_models(settings: Settings) -> None:
    manager = ModelManager(settings, factory=lambda _path, _settings: FakeModel())

    with pytest.raises(ModelNotAllowedError):
        manager.get("../remote")
    with pytest.raises(ModelUnavailableError):
        manager.get("base")


def test_model_manager_rejects_alias_that_escapes_root_even_if_manually_constructed(
    settings: Settings,
) -> None:
    unsafe_settings = replace(
        settings,
        allowed_models=("../outside",),
        default_model="../outside",
    )
    with pytest.raises(ModelNotAllowedError):
        ModelManager(unsafe_settings, factory=lambda _path, _settings: FakeModel()).get(
            "../outside"
        )


def test_model_factory_failure_is_sanitized(settings: Settings) -> None:
    install_model_directory(settings)

    def broken_factory(_path: Path, _settings: Settings) -> FakeModel:
        raise RuntimeError("native loader details")

    manager = ModelManager(settings, factory=broken_factory)
    with pytest.raises(ModelUnavailableError) as captured:
        manager.get("base")

    assert "native loader details" not in str(captured.value)


def test_missing_faster_whisper_dependency_is_actionable_and_local(
    settings: Settings,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    install_model_directory(settings)

    def missing_spec(_name: str) -> None:
        return None

    monkeypatch.setattr(engine_module.importlib.util, "find_spec", missing_spec)
    with pytest.raises(ModelUnavailableError):
        ModelManager(settings).get("base")


def test_default_factory_uses_local_path_and_disables_downloads(
    settings: Settings,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    model_path = install_model_directory(settings)
    expected_model = FakeModel()
    captured: dict[str, object] = {}
    fake_module = FakeFasterWhisperModule("faster_whisper")

    def constructor(path: str, **options: object) -> FakeModel:
        captured["path"] = path
        captured.update(options)
        return expected_model

    fake_module.WhisperModel = constructor

    def module_spec(_name: str) -> importlib.machinery.ModuleSpec:
        return importlib.machinery.ModuleSpec("faster_whisper", loader=None)

    def import_module(_name: str) -> ModuleType:
        return fake_module

    monkeypatch.setattr(engine_module.importlib.util, "find_spec", module_spec)
    monkeypatch.setattr(engine_module.importlib, "import_module", import_module)

    loaded = ModelManager(settings).get("base")

    assert loaded is expected_model
    assert captured == {
        "path": str(model_path.resolve()),
        "device": "cpu",
        "compute_type": "int8",
        "cpu_threads": 0,
        "local_files_only": True,
    }


def test_default_factory_rejects_missing_constructor(
    settings: Settings,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    install_model_directory(settings)
    fake_module = ModuleType("faster_whisper")

    def module_spec(_name: str) -> importlib.machinery.ModuleSpec:
        return importlib.machinery.ModuleSpec("faster_whisper", loader=None)

    def import_module(_name: str) -> ModuleType:
        return fake_module

    monkeypatch.setattr(engine_module.importlib.util, "find_spec", module_spec)
    monkeypatch.setattr(engine_module.importlib, "import_module", import_module)

    with pytest.raises(ModelUnavailableError):
        ModelManager(settings).get("base")


def test_engine_transcribes_with_explicit_local_options(settings: Settings, tmp_path: Path) -> None:
    install_model_directory(settings)
    model = FakeModel()
    manager = ModelManager(settings, factory=lambda _path, _settings: model)
    engine = FasterWhisperEngine(settings, manager=manager)
    audio_path = tmp_path / "voice.wav"
    audio_path.write_bytes(b"local test fixture")

    result = engine.transcribe(
        TranscriptionJob(
            audio_path=audio_path,
            model="base",
            language=None,
            prompt="QCTP",
        )
    )

    assert result.text == "local transcript"
    assert result.language == "en"
    assert result.duration_ms == 1_234
    assert model.calls == [(str(audio_path), None, "QCTP", True)]
    assert engine.health().loaded_models == ("base",)


def test_engine_uses_requested_language_when_detector_returns_blank(
    settings: Settings,
    tmp_path: Path,
) -> None:
    install_model_directory(settings)
    model = FakeModel(information=Info("", -1.0))
    engine = FasterWhisperEngine(
        settings,
        manager=ModelManager(settings, factory=lambda _path, _settings: model),
    )

    result = engine.transcribe(
        TranscriptionJob(
            audio_path=tmp_path / "voice.wav",
            model="base",
            language="es",
            prompt=None,
        )
    )

    assert result.language == "es"
    assert result.duration_ms == 0


def test_engine_distinguishes_no_speech_and_inference_failure(
    settings: Settings,
    tmp_path: Path,
) -> None:
    install_model_directory(settings)
    job = TranscriptionJob(
        audio_path=tmp_path / "voice.wav",
        model="base",
        language=None,
        prompt=None,
    )
    silent_engine = FasterWhisperEngine(
        settings,
        manager=ModelManager(
            settings,
            factory=lambda _path, _settings: FakeModel(segments=()),
        ),
    )
    broken_engine = FasterWhisperEngine(
        settings,
        manager=ModelManager(
            settings,
            factory=lambda _path, _settings: FakeModel(failure=RuntimeError("native failure")),
        ),
    )

    with pytest.raises(NoSpeechDetectedError):
        silent_engine.transcribe(job)
    with pytest.raises(InferenceFailedError) as captured:
        broken_engine.transcribe(job)

    assert "native failure" not in str(captured.value)


def test_engine_preserves_model_configuration_errors(settings: Settings, tmp_path: Path) -> None:
    engine = FasterWhisperEngine(settings)
    with pytest.raises(ModelUnavailableError):
        engine.transcribe(
            TranscriptionJob(
                audio_path=tmp_path / "voice.wav",
                model="base",
                language=None,
                prompt=None,
            )
        )
