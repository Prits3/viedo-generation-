"""SQLite persistence. A thin repository: schema DDL + a small query helper.
No ORM — stdlib only, so the core runs and tests offline. Swapping to Postgres
later is a driver change behind this boundary (see BACKLOG.md)."""
from __future__ import annotations
import sqlite3
import time

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, name TEXT, api_key TEXT UNIQUE, created_at REAL
);
CREATE TABLE IF NOT EXISTS resources (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, filename TEXT, path TEXT,
  content_hash TEXT, status TEXT, extractor TEXT, title TEXT, created_at REAL
);
CREATE TABLE IF NOT EXISTS sections (
  id TEXT PRIMARY KEY, resource_id TEXT NOT NULL, ord INTEGER,
  ref TEXT, heading TEXT, text TEXT
);
CREATE TABLE IF NOT EXISTS lessons (
  id TEXT PRIMARY KEY, resource_id TEXT NOT NULL, user_id TEXT NOT NULL,
  status TEXT, source_hash TEXT, settings_json TEXT, provenance_json TEXT,
  outline_json TEXT, stale INTEGER DEFAULT 0, created_at REAL
);
CREATE TABLE IF NOT EXISTS scenes (
  id TEXT PRIMARY KEY, lesson_id TEXT NOT NULL, ord INTEGER, data_json TEXT
);
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY, kind TEXT, payload_json TEXT, status TEXT,
  attempts INTEGER DEFAULT 0, max_attempts INTEGER DEFAULT 3,
  error TEXT, created_at REAL, updated_at REAL
);
CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY, lesson_id TEXT NOT NULL, concept_idx INTEGER,
  source_ref TEXT, data_json TEXT
);
CREATE TABLE IF NOT EXISTS attempts (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, lesson_id TEXT NOT NULL,
  question_id TEXT, correct INTEGER, created_at REAL
);
CREATE TABLE IF NOT EXISTS progress (
  user_id TEXT NOT NULL, lesson_id TEXT NOT NULL, concept_idx INTEGER,
  state TEXT, updated_at REAL,
  PRIMARY KEY (user_id, lesson_id, concept_idx)
);
CREATE TABLE IF NOT EXISTS sessions (
  user_id TEXT NOT NULL, lesson_id TEXT NOT NULL, data_json TEXT, updated_at REAL,
  PRIMARY KEY (user_id, lesson_id)
);
"""


class Database:
    def __init__(self, path: str = "lumina.db"):
        self.path = path
        self.conn = sqlite3.connect(path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.conn.execute("PRAGMA journal_mode=WAL")
        self.conn.execute("PRAGMA foreign_keys=ON")
        self._lock_init()

    def _lock_init(self):
        self.conn.executescript(SCHEMA)
        self.conn.commit()

    def execute(self, sql: str, params: tuple = ()):
        cur = self.conn.execute(sql, params)
        self.conn.commit()
        return cur

    def query(self, sql: str, params: tuple = ()) -> list:
        return [dict(r) for r in self.conn.execute(sql, params).fetchall()]

    def query_one(self, sql: str, params: tuple = ()):
        r = self.conn.execute(sql, params).fetchone()
        return dict(r) if r else None

    def close(self):
        self.conn.close()


def now() -> float:
    return time.time()
