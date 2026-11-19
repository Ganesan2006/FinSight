"""Compatibility ASGI entry point for launchers configured with ``server:app``.

Run Uvicorn from the SMS service directory so the ``app`` package is importable.
The canonical entry point remains ``app.main:app``.
"""

from app.main import app

__all__ = ["app"]
