"""Resolução de caminho com barreira contra path traversal."""

from __future__ import annotations

import os
from pathlib import Path


class ScanError(Exception):
    def __init__(self, code: str, message: str, status: int) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status = status


def resolve_scan_path(raw: str | None, allow_root: Path | None) -> Path:
    if raw is None or not str(raw).strip():
        raise ScanError("missing_path", "Informe o caminho a analisar.", 400)
    text = str(raw).strip()
    if "\x00" in text or len(text) > 4096:
        raise ScanError("invalid_path", "Caminho inválido.", 400)

    candidate = Path(text).expanduser()
    base = Path(allow_root).resolve() if allow_root is not None else Path.cwd()
    if not candidate.is_absolute():
        candidate = base / candidate
    try:
        resolved = candidate.resolve(strict=False)
    except OSError as exc:
        raise ScanError("invalid_path", "Caminho inválido.", 400) from exc

    if allow_root is not None and not resolved.is_relative_to(base):
        raise ScanError(
            "outside_root",
            "Caminho fora da pasta permitida.",
            403,
        )
    if not resolved.exists():
        raise ScanError("not_found", "Caminho inexistente.", 404)
    if not resolved.is_dir():
        raise ScanError("not_directory", "O caminho precisa ser uma pasta.", 400)
    if not os.access(resolved, os.R_OK | os.X_OK):
        raise ScanError("forbidden", "Sem permissão para ler essa pasta.", 403)
    return resolved
