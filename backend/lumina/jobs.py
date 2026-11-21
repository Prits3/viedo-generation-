"""Background jobs on a SQLite table + a worker thread. Status is persistent,
failures retry up to max_attempts, and jobs left 'running' by a crash are
recovered on startup. No external broker in M1 (see ARCHITECTURE.md)."""
from __future__ import annotations
import json
import secrets
import threading
import time
import traceback

from .db import Database, now


def enqueue(db: Database, kind: str, payload: dict, max_attempts: int = 3) -> str:
    jid = "j_" + secrets.token_hex(6)
    db.execute("INSERT INTO jobs (id,kind,payload_json,status,attempts,max_attempts,"
               "created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)",
               (jid, kind, json.dumps(payload), "queued", 0, max_attempts, now(), now()))
    return jid


def get_job(db: Database, jid: str):
    return db.query_one("SELECT * FROM jobs WHERE id=?", (jid,))


def recover_stuck(db: Database) -> int:
    """Crash recovery: a job stuck in 'running' is requeued (or failed if it has
    no attempts left). Returns how many were recovered."""
    rows = db.query("SELECT * FROM jobs WHERE status='running'")
    for r in rows:
        if r["attempts"] < r["max_attempts"]:
            db.execute("UPDATE jobs SET status='queued', updated_at=? WHERE id=?",
                       (now(), r["id"]))
        else:
            db.execute("UPDATE jobs SET status='failed', error=?, updated_at=? WHERE id=?",
                       ("recovered-but-exhausted", now(), r["id"]))
    return len(rows)


def _claim_next(db: Database):
    row = db.query_one("SELECT * FROM jobs WHERE status='queued' ORDER BY created_at LIMIT 1")
    if not row:
        return None
    db.execute("UPDATE jobs SET status='running', attempts=attempts+1, updated_at=? WHERE id=?",
               (now(), row["id"]))
    return db.query_one("SELECT * FROM jobs WHERE id=?", (row["id"],))


def run_once(db: Database, handlers: dict) -> str | None:
    """Process at most one job. Returns final status, or None if queue empty.
    Deterministic — used directly in tests."""
    job = _claim_next(db)
    if not job:
        return None
    handler = handlers.get(job["kind"])
    try:
        if not handler:
            raise RuntimeError(f"no handler for kind '{job['kind']}'")
        handler(db, json.loads(job["payload_json"]))
        db.execute("UPDATE jobs SET status='done', error=NULL, updated_at=? WHERE id=?",
                   (now(), job["id"]))
        return "done"
    except Exception as e:  # never silently pass; record and retry or fail
        err = f"{e}\n{traceback.format_exc()[-800:]}"
        fresh = db.query_one("SELECT attempts,max_attempts FROM jobs WHERE id=?", (job["id"],))
        status = "queued" if fresh["attempts"] < fresh["max_attempts"] else "failed"
        db.execute("UPDATE jobs SET status=?, error=?, updated_at=? WHERE id=?",
                   (status, err, now(), job["id"]))
        return status


class Worker:
    """In-process worker thread. Start one per app process for M1."""
    def __init__(self, db: Database, handlers: dict, poll: float = 0.5):
        self.db, self.handlers, self.poll = db, handlers, poll
        self._stop = threading.Event()
        self._thread = None

    def start(self):
        recover_stuck(self.db)
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()

    def _loop(self):
        while not self._stop.is_set():
            if self.run_once() is None:
                time.sleep(self.poll)

    def run_once(self):
        return run_once(self.db, self.handlers)

    def stop(self):
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=2)
