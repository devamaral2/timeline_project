"""Histórico de análises em SQLite."""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path


def _connect(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS scans (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            path TEXT NOT NULL,
            created_at TEXT NOT NULL,
            files INTEGER NOT NULL,
            total_lines INTEGER NOT NULL,
            todo_count INTEGER NOT NULL,
            payload TEXT NOT NULL
        )
        """
    )
    return conn


def save_scan(db_path: Path, result: dict) -> int:
    conn = _connect(db_path)
    try:
        cur = conn.execute(
            """
            INSERT INTO scans (path, created_at, files, total_lines, todo_count, payload)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                result["path"],
                result["scanned_at"],
                result["files"],
                result["total_lines"],
                len(result["todos"]),
                json.dumps(result, ensure_ascii=False),
            ),
        )
        conn.commit()
        return int(cur.lastrowid)
    finally:
        conn.close()


def list_scans(db_path: Path, limit: int = 20) -> list[dict]:
    if not db_path.exists():
        return []
    conn = _connect(db_path)
    try:
        rows = conn.execute(
            """
            SELECT id, path, created_at, files, total_lines, todo_count
            FROM scans
            ORDER BY id DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
    finally:
        conn.close()
    return [
        {
            "id": row[0],
            "path": row[1],
            "created_at": row[2],
            "files": row[3],
            "total_lines": row[4],
            "todo_count": row[5],
        }
        for row in rows
    ]
