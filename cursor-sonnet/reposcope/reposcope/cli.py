"""Linha de comando: scan e serve."""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

from reposcope.analyzer import analyze
from reposcope.format_md import to_markdown
from reposcope.paths import ScanError, resolve_scan_path
from reposcope.server import DEFAULT_DB, PROJECT_ROOT, make_server


def _allow_root(explicit: str | None) -> Path | None:
    if explicit:
        return Path(explicit).expanduser().resolve()
    env = os.environ.get("REPOSCOPE_ROOT")
    if env:
        return Path(env).expanduser().resolve()
    return None


def _scan(args: argparse.Namespace) -> int:
    try:
        target = resolve_scan_path(args.path, _allow_root(args.root))
        result = analyze(target)
    except ScanError as exc:
        print(exc.message, file=sys.stderr)
        return 2
    text = (
        json.dumps(result, ensure_ascii=False, indent=2) + "\n"
        if args.format == "json"
        else to_markdown(result)
    )
    if args.output:
        destination = Path(args.output)
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(text, encoding="utf-8")
        return 0
    sys.stdout.write(text)
    return 0


def _serve(args: argparse.Namespace) -> int:
    allow = _allow_root(args.root) or Path.cwd().resolve()
    if not allow.is_dir():
        print("A raiz permitida não é uma pasta.", file=sys.stderr)
        return 2
    db_path = Path(args.db) if args.db else DEFAULT_DB
    try:
        httpd = make_server(args.host, args.port, allow, db_path)
    except OSError as exc:
        print(f"Não foi possível escutar em {args.host}:{args.port}. {exc}", file=sys.stderr)
        return 2
    host, port = httpd.server_address[:2]
    print(f"RepoScope em http://{host}:{port}", flush=True)
    print(f"Raiz permitida: {allow}", flush=True)
    print(f"Pasta do app: {PROJECT_ROOT}", flush=True)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nEncerrado.")
    finally:
        httpd.server_close()
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="reposcope",
        description="Mede a saúde de uma pasta de código.",
    )
    sub = parser.add_subparsers(dest="cmd", required=True)

    scan = sub.add_parser("scan", help="analisa uma pasta e imprime o relatório")
    scan.add_argument("path", help="pasta a medir")
    scan.add_argument("--format", choices=("json", "md"), required=True)
    scan.add_argument("--output", "-o", help="grava o relatório neste arquivo")
    scan.add_argument("--root", help="pasta permitida; padrão: REPOSCOPE_ROOT, se existir")
    scan.set_defaults(func=_scan)

    serve = sub.add_parser("serve", help="sobe o painel e a API locais")
    serve.add_argument("--host", default="127.0.0.1")
    serve.add_argument("--port", type=int, default=8765)
    serve.add_argument("--root", help="pasta permitida; padrão: diretório atual ou REPOSCOPE_ROOT")
    serve.add_argument("--db", help="arquivo SQLite do histórico")
    serve.set_defaults(func=_serve)
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    return args.func(args)
