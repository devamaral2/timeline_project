"""Testes da API e da CLI."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import threading
import unittest
import urllib.error
import urllib.request
from pathlib import Path
from tempfile import TemporaryDirectory

PROJECT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT))

from reposcope.server import make_server  # noqa: E402


class ApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.project = self.root / "proj"
        self.project.mkdir()
        (self.project / "app.py").write_text("# TODO: medir\nprint('ok')\n", encoding="utf-8")
        self.db = self.root / "history.sqlite"
        self.httpd = make_server("127.0.0.1", 0, self.root, self.db, quiet=True)
        self.thread = threading.Thread(target=self.httpd.serve_forever, daemon=True)
        self.thread.start()
        host, port = self.httpd.server_address[:2]
        self.base = f"http://{host}:{port}"

    def tearDown(self) -> None:
        self.httpd.shutdown()
        self.httpd.server_close()
        self.tmp.cleanup()

    def _get(self, path: str) -> tuple[int, dict]:
        request = urllib.request.Request(self.base + path)
        try:
            with urllib.request.urlopen(request) as response:
                return response.status, json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as exc:
            try:
                return exc.code, json.loads(exc.read().decode("utf-8"))
            finally:
                exc.close()

    def test_health(self) -> None:
        status, body = self._get("/api/health")
        self.assertEqual(status, 200)
        self.assertTrue(body["ok"])

    def test_scan_and_history(self) -> None:
        status, body = self._get("/api/scan?path=proj")
        self.assertEqual(status, 200)
        self.assertEqual(body["files"], 1)
        self.assertEqual(body["todos"][0]["kind"], "TODO")
        self.assertTrue(body["path"].endswith("/proj"))
        status, history = self._get("/api/history")
        self.assertEqual(status, 200)
        self.assertEqual(len(history["scans"]), 1)
        self.assertEqual(history["scans"][0]["todo_count"], 1)
        self.assertEqual(history["scans"][0]["files"], 1)

    def test_rejects_traversal_missing_and_blank(self) -> None:
        status, body = self._get("/api/scan?path=../")
        self.assertEqual(status, 403)
        self.assertEqual(body["code"], "outside_root")
        status, body = self._get("/api/scan?path=/etc")
        self.assertEqual(status, 403)
        self.assertEqual(body["code"], "outside_root")
        status, body = self._get("/api/scan?path=nao-existe")
        self.assertEqual(status, 404)
        self.assertEqual(body["code"], "not_found")
        status, body = self._get("/api/scan")
        self.assertEqual(status, 400)
        self.assertEqual(body["code"], "missing_path")
        status, body = self._get("/api/scan?path=proj/app.py")
        self.assertEqual(status, 400)
        self.assertEqual(body["code"], "not_directory")

    def test_static_page_and_static_escape(self) -> None:
        with urllib.request.urlopen(self.base + "/") as response:
            html = response.read().decode("utf-8")
            self.assertEqual(response.status, 200)
        self.assertIn("RepoScope", html)
        status, body = self._get("/../reposcope/cli.py")
        self.assertEqual(status, 404)
        self.assertEqual(body["code"], "not_found")


class CliTests(unittest.TestCase):
    def test_json_md_and_output_file(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            project = root / "proj"
            project.mkdir()
            (project / "app.py").write_text("# FIXME: borda\n", encoding="utf-8")
            env = os.environ.copy()
            env.pop("REPOSCOPE_ROOT", None)
            json_run = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "reposcope",
                    "scan",
                    "proj",
                    "--format",
                    "json",
                    "--root",
                    str(root),
                ],
                cwd=PROJECT,
                capture_output=True,
                text=True,
                env=env,
                check=False,
            )
            self.assertEqual(json_run.returncode, 0, json_run.stderr)
            payload = json.loads(json_run.stdout)
            self.assertEqual(payload["todos"][0]["kind"], "FIXME")

            md_run = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "reposcope",
                    "scan",
                    str(project),
                    "--format",
                    "md",
                    "--root",
                    str(root),
                ],
                cwd=PROJECT,
                capture_output=True,
                text=True,
                env=env,
                check=False,
            )
            self.assertEqual(md_run.returncode, 0, md_run.stderr)
            self.assertIn("# RepoScope", md_run.stdout)
            self.assertIn("FIXME", md_run.stdout)

            destination = root / "saida.md"
            file_run = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "reposcope",
                    "scan",
                    "proj",
                    "--format",
                    "md",
                    "--root",
                    str(root),
                    "--output",
                    str(destination),
                ],
                cwd=PROJECT,
                capture_output=True,
                text=True,
                env=env,
                check=False,
            )
            self.assertEqual(file_run.returncode, 0, file_run.stderr)
            self.assertEqual(file_run.stdout, "")
            self.assertIn("FIXME", destination.read_text(encoding="utf-8"))

            missing = subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "reposcope",
                    "scan",
                    "ausente",
                    "--format",
                    "json",
                    "--root",
                    str(root),
                ],
                cwd=PROJECT,
                capture_output=True,
                text=True,
                env=env,
                check=False,
            )
            self.assertEqual(missing.returncode, 2)
            self.assertIn("inexistente", missing.stderr)


if __name__ == "__main__":
    unittest.main()
