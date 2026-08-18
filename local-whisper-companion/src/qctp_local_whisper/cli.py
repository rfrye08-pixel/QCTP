from __future__ import annotations

import uvicorn

from .api import create_app
from .config import Settings

__all__ = ["main"]


def main() -> None:
    settings = Settings.from_env()
    uvicorn.run(
        create_app(settings),
        host=settings.bind_host,
        port=settings.port,
        log_level="info",
    )
