"""Varredura de uma pasta: linhas, tamanho, marcas e git."""

from __future__ import annotations

import os
import re
import subprocess
from collections import Counter, defaultdict
from datetime import datetime, timedelta
from pathlib import Path

SKIP_DIRS = {
    ".git",
    ".hg",
    ".svn",
    ".venv",
    "__pycache__",
    "build",
    "coverage",
    "dist",
    "node_modules",
    "venv",
}

LANG = {
    ".bash": "Shell",
    ".c": "C",
    ".cc": "C++",
    ".cjs": "JavaScript",
    ".cpp": "C++",
    ".cs": "C#",
    ".css": "CSS",
    ".dart": "Dart",
    ".go": "Go",
    ".h": "C/C++ header",
    ".hpp": "C++ header",
    ".html": "HTML",
    ".java": "Java",
    ".js": "JavaScript",
    ".json": "JSON",
    ".jsx": "JavaScript",
    ".kt": "Kotlin",
    ".kts": "Kotlin",
    ".lua": "Lua",
    ".md": "Markdown",
    ".mjs": "JavaScript",
    ".php": "PHP",
    ".py": "Python",
    ".rb": "Ruby",
    ".rs": "Rust",
    ".scss": "SCSS",
    ".sh": "Shell",
    ".sql": "SQL",
    ".swift": "Swift",
    ".toml": "TOML",
    ".ts": "TypeScript",
    ".tsx": "TypeScript",
    ".txt": "Texto",
    ".xml": "XML",
    ".yaml": "YAML",
    ".yml": "YAML",
    ".zig": "Zig",
}

MARK_RE = re.compile(r"\b(TODO|FIXME|HACK)\b", re.IGNORECASE)
MAX_READ = 1_000_000


def language_for(path: Path) -> str:
    ext = path.suffix.lower()
    if ext in LANG:
        return LANG[ext]
    if ext:
        return ext[1:].upper()
    return "sem extensão"


def _glob_to_re(pattern: str) -> re.Pattern[str]:
    anchored = pattern.startswith("/")
    if anchored:
        pattern = pattern[1:]
    parts: list[str] = []
    i = 0
    while i < len(pattern):
        if pattern.startswith("**/", i):
            parts.append("(?:.*/)?")
            i += 3
            continue
        if pattern.startswith("**", i):
            parts.append(".*")
            i += 2
            continue
        char = pattern[i]
        if char == "*":
            parts.append("[^/]*")
        elif char == "?":
            parts.append("[^/]")
        else:
            parts.append(re.escape(char))
        i += 1
    body = "".join(parts)
    if anchored or "/" in pattern:
        expr = f"^{body}$"
    else:
        expr = f"(?:^|.*/){body}$"
    return re.compile(expr)


class IgnoreRules:
    def __init__(self) -> None:
        self.rules: list[tuple[Path, re.Pattern[str], bool, bool]] = []

    def add_file(self, gitignore: Path) -> None:
        base = gitignore.parent
        try:
            text = gitignore.read_text(encoding="utf-8", errors="replace")
        except OSError:
            return
        for raw in text.splitlines():
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            neg = line.startswith("!")
            if neg:
                line = line[1:]
            dir_only = line.endswith("/")
            if dir_only:
                line = line[:-1]
            if not line:
                continue
            self.rules.append((base, _glob_to_re(line), neg, dir_only))

    def ignored(self, path: Path, is_dir: bool) -> bool:
        matched = False
        for base, pattern, neg, dir_only in self.rules:
            if dir_only and not is_dir:
                continue
            try:
                rel = path.resolve().relative_to(base.resolve()).as_posix()
            except (ValueError, OSError):
                continue
            if rel == ".":
                continue
            if pattern.search(rel):
                matched = not neg
        return matched


def _read_lines(path: Path) -> tuple[int, list[str], bool]:
    try:
        size = path.stat().st_size
    except OSError:
        return 0, [], True
    try:
        with path.open("rb") as handle:
            chunk = handle.read(min(size, MAX_READ))
    except OSError:
        return size, [], True
    if b"\0" in chunk[:8192]:
        return size, [], True
    text = chunk.decode("utf-8", errors="replace")
    return size, text.splitlines(), False


def _week_buckets(now: datetime) -> tuple[list[dict], datetime]:
    monday = (now - timedelta(days=now.weekday())).replace(
        hour=0, minute=0, second=0, microsecond=0
    )
    buckets: list[dict] = []
    for offset in range(11, -1, -1):
        start = monday - timedelta(weeks=offset)
        year, week, _day = start.isocalendar()
        buckets.append(
            {
                "week": f"{year}-W{week:02d}",
                "start": start.date().isoformat(),
                "commits": 0,
            }
        )
    return buckets, monday - timedelta(weeks=11)


def git_stats(root: Path) -> dict:
    empty = {"available": False, "reason": "git indisponível", "weeks": [], "authors": []}
    try:
        probe = subprocess.run(
            ["git", "-C", str(root), "rev-parse", "--is-inside-work-tree"],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return empty
    if probe.returncode != 0 or probe.stdout.strip() != "true":
        return {
            "available": False,
            "reason": "não é um repositório git",
            "weeks": [],
            "authors": [],
        }

    now = datetime.now().astimezone()
    weeks, since = _week_buckets(now)
    try:
        log = subprocess.run(
            [
                "git",
                "-C",
                str(root),
                "log",
                f"--since={since.strftime('%Y-%m-%d %H:%M:%S')}",
                "--pretty=format:%aI%x09%an",
            ],
            capture_output=True,
            text=True,
            timeout=20,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired):
        return empty
    if log.returncode != 0:
        return {
            "available": False,
            "reason": (log.stderr or "git log falhou").strip()[:240],
            "weeks": [],
            "authors": [],
        }

    index = {row["start"]: row for row in weeks}
    authors: Counter[str] = Counter()
    for line in log.stdout.splitlines():
        if "\t" not in line:
            continue
        raw_date, name = line.split("\t", 1)
        name = name.strip() or "(sem nome)"
        try:
            when = datetime.fromisoformat(raw_date.replace("Z", "+00:00"))
        except ValueError:
            continue
        if when.tzinfo is None:
            when = when.replace(tzinfo=now.tzinfo)
        when = when.astimezone(now.tzinfo)
        commit_monday = (when - timedelta(days=when.weekday())).replace(
            hour=0, minute=0, second=0, microsecond=0
        )
        bucket = index.get(commit_monday.date().isoformat())
        if bucket is None:
            continue
        bucket["commits"] += 1
        authors[name] += 1

    top = sorted(authors.items(), key=lambda item: (-item[1], item[0]))[:5]
    return {
        "available": True,
        "reason": "",
        "weeks": weeks,
        "authors": [{"name": name, "commits": count} for name, count in top],
    }


def analyze(root: Path) -> dict:
    root = Path(root).resolve()
    rules = IgnoreRules()
    grouped: dict[str, dict[str, int]] = defaultdict(lambda: {"files": 0, "lines": 0})
    largest: list[dict] = []
    todos: list[dict] = []
    file_count = 0
    total_lines = 0

    for dirpath, dirnames, filenames in os.walk(root, followlinks=False):
        current = Path(dirpath)
        gitignore = current / ".gitignore"
        if gitignore.is_file() and not gitignore.is_symlink():
            rules.add_file(gitignore)

        kept_dirs: list[str] = []
        for name in dirnames:
            directory = current / name
            if name in SKIP_DIRS or directory.is_symlink() or rules.ignored(directory, True):
                continue
            kept_dirs.append(name)
        dirnames[:] = kept_dirs

        for name in filenames:
            path = current / name
            if path.is_symlink() or rules.ignored(path, False):
                continue
            try:
                if not path.is_file():
                    continue
            except OSError:
                continue
            size, lines, binary = _read_lines(path)
            rel = path.relative_to(root).as_posix()
            language = language_for(path)
            line_count = 0 if binary else len(lines)
            grouped[language]["files"] += 1
            grouped[language]["lines"] += line_count
            file_count += 1
            total_lines += line_count
            largest.append({"path": rel, "bytes": size, "lines": line_count})
            if binary:
                continue
            for number, text in enumerate(lines, start=1):
                for match in MARK_RE.finditer(text):
                    todos.append(
                        {
                            "path": rel,
                            "line": number,
                            "kind": match.group(1).upper(),
                            "text": text.strip()[:240],
                        }
                    )

    by_language = [
        {"language": name, "files": data["files"], "lines": data["lines"]}
        for name, data in grouped.items()
    ]
    by_language.sort(key=lambda row: (-row["lines"], row["language"]))
    largest.sort(key=lambda row: (-row["bytes"], row["path"]))
    todos.sort(key=lambda row: (row["path"], row["line"], row["kind"]))

    return {
        "path": str(root),
        "scanned_at": datetime.now().astimezone().isoformat(timespec="seconds"),
        "files": file_count,
        "total_lines": total_lines,
        "by_language": by_language,
        "largest": largest[:10],
        "todos": todos,
        "git": git_stats(root),
    }
