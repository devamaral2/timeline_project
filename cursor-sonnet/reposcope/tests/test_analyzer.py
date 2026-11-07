"""Testes do analisador."""

from __future__ import annotations

import os
import subprocess
import sys
import unittest
from pathlib import Path
from tempfile import TemporaryDirectory

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from reposcope.analyzer import analyze  # noqa: E402
from reposcope.paths import ScanError, resolve_scan_path  # noqa: E402


def _commit(repo: Path, name: str, when: str, message: str) -> None:
    env = os.environ.copy()
    env.update(
        {
            "GIT_AUTHOR_NAME": name,
            "GIT_AUTHOR_EMAIL": "dev@example.com",
            "GIT_COMMITTER_NAME": name,
            "GIT_COMMITTER_EMAIL": "dev@example.com",
            "GIT_AUTHOR_DATE": when,
            "GIT_COMMITTER_DATE": when,
        }
    )
    subprocess.run(["git", "add", "-A"], cwd=repo, check=True, env=env)
    subprocess.run(["git", "commit", "-m", message], cwd=repo, check=True, env=env)


class AnalyzerTests(unittest.TestCase):
    def test_lines_by_language(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "app.py").write_text("a = 1\nb = 2\n\n", encoding="utf-8")
            (root / "web.js").write_text("const n = 1;\n", encoding="utf-8")
            result = analyze(root)
            languages = {row["language"]: row for row in result["by_language"]}
            self.assertEqual(languages["Python"]["files"], 1)
            self.assertEqual(languages["Python"]["lines"], 3)
            self.assertEqual(languages["JavaScript"]["lines"], 1)
            self.assertEqual(result["files"], 2)
            self.assertEqual(result["total_lines"], 4)
            self.assertEqual(
                sum(row["files"] for row in result["by_language"]),
                result["files"],
            )

    def test_largest_files_are_top_ten(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            for size in range(1, 16):
                (root / f"f{size:02d}.txt").write_bytes(b"x" * size)
            result = analyze(root)
            self.assertEqual(len(result["largest"]), 10)
            self.assertEqual(result["largest"][0]["path"], "f15.txt")
            self.assertEqual(result["largest"][0]["bytes"], 15)
            names = {row["path"] for row in result["largest"]}
            self.assertNotIn("f05.txt", names)

    def test_finds_todo_fixme_hack_and_skips_binary(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "app.py").write_text(
                "x = 1\n# TODO: fechar o ciclo\n# FIXME: margem\n",
                encoding="utf-8",
            )
            (root / "util.js").write_text("// HACK: atalho de leitura\n", encoding="utf-8")
            (root / "blob.bin").write_bytes(b"TODO\0FIXME")
            result = analyze(root)
            kinds = {(row["path"], row["line"], row["kind"]) for row in result["todos"]}
            self.assertIn(("app.py", 2, "TODO"), kinds)
            self.assertIn(("app.py", 3, "FIXME"), kinds)
            self.assertIn(("util.js", 1, "HACK"), kinds)
            self.assertFalse(any(row["path"] == "blob.bin" for row in result["todos"]))

    def test_skips_vendor_directories(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            vendor = root / "src" / "vendor" / "node_modules" / "leftpad"
            vendor.mkdir(parents=True)
            (vendor / "index.js").write_text("// TODO: nao contar\n", encoding="utf-8")
            venv = root / "venv" / "lib"
            venv.mkdir(parents=True)
            (venv / "sitecustomize.py").write_text("# FIXME: nao contar\n", encoding="utf-8")
            git_dir = root / ".git"
            git_dir.mkdir()
            (git_dir / "config").write_text("TODO no git\n", encoding="utf-8")
            (root / "app.py").write_text("print('ok')\n", encoding="utf-8")
            result = analyze(root)
            self.assertEqual(result["files"], 1)
            self.assertEqual(result["todos"], [])

    def test_respects_gitignore_and_negation(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / ".gitignore").write_text("*.secret\n!keep.secret\nignored/\n", encoding="utf-8")
            (root / "a.secret").write_text("TODO: escondido\n", encoding="utf-8")
            (root / "keep.secret").write_text("TODO: visivel\n", encoding="utf-8")
            nested = root / "ignored"
            nested.mkdir()
            (nested / "note.txt").write_text("FIXME: pasta ignorada\n", encoding="utf-8")
            (root / "app.py").write_text("x = 1\n", encoding="utf-8")
            result = analyze(root)
            paths = {row["path"] for row in result["todos"]}
            files = {row["path"] for row in result["largest"]}
            self.assertIn("keep.secret", paths)
            self.assertNotIn("a.secret", files)
            self.assertNotIn("ignored/note.txt", files)
            self.assertIn("app.py", files)

    def test_git_degrades_without_repository(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "app.py").write_text("x = 1\n", encoding="utf-8")
            result = analyze(root)
            self.assertFalse(result["git"]["available"])
            self.assertEqual(result["git"]["reason"], "não é um repositório git")
            self.assertEqual(result["git"]["weeks"], [])
            self.assertEqual(result["files"], 1)

    def test_git_weeks_and_authors(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            subprocess.run(["git", "init"], cwd=root, check=True, capture_output=True)
            (root / "a.txt").write_text("um\n", encoding="utf-8")
            _commit(root, "Ada Martins", "2026-10-20T10:00:00", "primeiro")
            (root / "b.txt").write_text("dois\n", encoding="utf-8")
            _commit(root, "Ada Martins", "2026-10-27T10:00:00", "segundo")
            (root / "c.txt").write_text("tres\n", encoding="utf-8")
            _commit(root, "Bruno Klein", "2026-11-02T10:00:00", "terceiro")
            result = analyze(root)
            self.assertTrue(result["git"]["available"])
            self.assertEqual(len(result["git"]["weeks"]), 12)
            self.assertGreaterEqual(sum(week["commits"] for week in result["git"]["weeks"]), 3)
            self.assertEqual(result["git"]["authors"][0]["name"], "Ada Martins")
            self.assertEqual(result["git"]["authors"][0]["commits"], 2)
            self.assertEqual(result["git"]["authors"][1]["name"], "Bruno Klein")

    def test_symlink_outside_root_is_not_read(self) -> None:
        with TemporaryDirectory() as tmp:
            base = Path(tmp)
            root = base / "projeto"
            outside = base / "fora"
            root.mkdir()
            outside.mkdir()
            (outside / "segredo.py").write_text("# TODO: vazou\n", encoding="utf-8")
            (root / "atalho.py").symlink_to(outside / "segredo.py")
            (root / "pasta").symlink_to(outside)
            (root / "ok.py").write_text("x = 1\n", encoding="utf-8")
            result = analyze(root)
            self.assertEqual([row["path"] for row in result["largest"]], ["ok.py"])
            self.assertEqual(result["todos"], [])

    def test_resolve_rejects_traversal_missing_and_file(self) -> None:
        with TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "proj").mkdir()
            (root / "proj" / "a.py").write_text("x = 1\n", encoding="utf-8")
            self.assertEqual(resolve_scan_path("proj", root), (root / "proj").resolve())
            outside = resolve_error("missing_path", None, root)
            self.assertEqual(outside, "missing_path")
            self.assertEqual(resolve_error("outside_root", "../", root), "outside_root")
            self.assertEqual(resolve_error("outside_root", "/etc", root), "outside_root")
            self.assertEqual(resolve_error("not_found", "nao-existe", root), "not_found")
            self.assertEqual(resolve_error("not_directory", "proj/a.py", root), "not_directory")


def resolve_error(expected: str, raw: str | None, root: Path) -> str:
    with unittest.TestCase().assertRaises(ScanError) as caught:
        resolve_scan_path(raw, root)
    assert caught.exception.code == expected
    return caught.exception.code


if __name__ == "__main__":
    unittest.main()
