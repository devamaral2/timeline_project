"""API local e arquivos do painel."""

from __future__ import annotations

import json
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

from reposcope.analyzer import analyze
from reposcope.paths import ScanError, resolve_scan_path
from reposcope.store import list_scans, save_scan

PROJECT_ROOT = Path(__file__).resolve().parents[1]
STATIC_ROOT = PROJECT_ROOT / "static"
DEFAULT_DB = PROJECT_ROOT / "data" / "history.sqlite"

CONTENT_TYPES = {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".svg": "image/svg+xml",
}


class RepoHandler(BaseHTTPRequestHandler):
    server_version = "RepoScope/1.0"

    def log_message(self, fmt: str, *args) -> None:
        if getattr(self.server, "quiet", False):
            return
        super().log_message(fmt, *args)

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        try:
            if parsed.path == "/api/health":
                self._json(200, {"ok": True})
                return
            if parsed.path == "/api/history":
                self._json(200, {"scans": list_scans(self.server.db_path)})
                return
            if parsed.path == "/api/scan":
                raw = parse_qs(parsed.query).get("path", [None])[0]
                target = resolve_scan_path(raw, self.server.allow_root)
                result = analyze(target)
                save_scan(self.server.db_path, result)
                self._json(200, result)
                return
            self._static(parsed.path)
        except ScanError as exc:
            self._json(exc.status, {"error": exc.message, "code": exc.code})
        except Exception:
            traceback.print_exc()
            self._json(500, {"error": "Falha ao medir a pasta.", "code": "internal"})

    def _static(self, url_path: str) -> None:
        rel = unquote(url_path).lstrip("/") or "index.html"
        if rel.endswith("/"):
            rel += "index.html"
        target = (STATIC_ROOT / rel).resolve()
        if not target.is_relative_to(STATIC_ROOT.resolve()) or not target.is_file():
            self._json(404, {"error": "Não encontrado.", "code": "not_found"})
            return
        body = target.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", CONTENT_TYPES.get(target.suffix, "application/octet-stream"))
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(body)

    def _json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)


class RepoServer(ThreadingHTTPServer):
    allow_reuse_address = True


def make_server(
    host: str,
    port: int,
    allow_root: Path,
    db_path: Path,
    quiet: bool = False,
) -> RepoServer:
    httpd = RepoServer((host, port), RepoHandler)
    httpd.allow_root = allow_root.resolve()
    httpd.db_path = db_path
    httpd.quiet = quiet
    return httpd
