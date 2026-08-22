from __future__ import annotations

__all__ = [
    "CompanionError",
    "InferenceFailedError",
    "ModelNotAllowedError",
    "ModelUnavailableError",
    "NoSpeechDetectedError",
]


class CompanionError(Exception):
    def __init__(
        self,
        *,
        status_code: int,
        code: str,
        message: str,
        retryable: bool,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.retryable = retryable


class ModelNotAllowedError(CompanionError):
    def __init__(self, model: str) -> None:
        super().__init__(
            status_code=400,
            code="model_not_allowed",
            message=f"Local model alias '{model}' is not enabled.",
            retryable=False,
        )


class ModelUnavailableError(CompanionError):
    def __init__(self, model: str) -> None:
        super().__init__(
            status_code=503,
            code="model_unavailable",
            message=f"Local model '{model}' is not installed or could not be loaded.",
            retryable=True,
        )


class InferenceFailedError(CompanionError):
    def __init__(self) -> None:
        super().__init__(
            status_code=500,
            code="inference_failed",
            message="Local transcription failed.",
            retryable=True,
        )


class NoSpeechDetectedError(CompanionError):
    def __init__(self) -> None:
        super().__init__(
            status_code=422,
            code="no_speech_detected",
            message="No transcribable speech was detected in the audio.",
            retryable=False,
        )
