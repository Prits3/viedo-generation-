"""Authentication + ownership. M1 uses per-user API keys; swap for OAuth/session
later behind `authenticate`. Ownership is enforced in services, not here, but
these helpers make the checks uniform and auditable."""
from __future__ import annotations
import secrets
from .db import Database, now


class AuthError(Exception):
    """Raised when a request is unauthenticated or accesses another user's data."""


def create_user(db: Database, name: str) -> dict:
    uid = "u_" + secrets.token_hex(6)
    key = "lk_" + secrets.token_urlsafe(24)
    db.execute("INSERT INTO users (id,name,api_key,created_at) VALUES (?,?,?,?)",
               (uid, name, key, now()))
    return {"id": uid, "name": name, "api_key": key}


def authenticate(db: Database, api_key: str | None) -> str:
    """Returns user_id or raises AuthError. Never leaks which part failed."""
    if not api_key:
        raise AuthError("missing credentials")
    row = db.query_one("SELECT id FROM users WHERE api_key=?", (api_key,))
    if not row:
        raise AuthError("invalid credentials")
    return row["id"]


def require_owner(db: Database, table: str, obj_id: str, user_id: str) -> dict:
    """Load a row and confirm the caller owns it. Raises AuthError otherwise.
    Same error for 'not found' and 'not yours' so existence isn't disclosed."""
    if table not in ("resources", "lessons"):
        raise ValueError("ownership only defined for resources/lessons")
    row = db.query_one(f"SELECT * FROM {table} WHERE id=?", (obj_id,))
    if not row or row.get("user_id") != user_id:
        raise AuthError("not found")
    return row
