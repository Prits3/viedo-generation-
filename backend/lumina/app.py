"""FastAPI presentation layer — a thin shell over the services. Auth is a
per-user API key in the X-API-Key header; the model key never leaves the server.

  MODEL=mock uvicorn lumina.app:app --reload --port 8787
"""
from __future__ import annotations
from fastapi import FastAPI, Header, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .config import settings
from .db import Database
from .security import authenticate, create_user, AuthError
from .services import (ResourceService, LessonService, TutorService,
                       PracticeService, lesson_handlers, answer_adhoc)
from . import jobs

db = Database(settings.db_path)
worker = jobs.Worker(db, lesson_handlers(db, settings))

app = FastAPI(title="Lumina Learn")
app.add_middleware(CORSMiddleware, allow_origins=settings.allowed_origins.split(","),
                   allow_methods=["*"], allow_headers=["*"])


@app.on_event("startup")
def _startup():
    worker.start()  # also runs crash recovery


def uid(x_api_key: str | None) -> str:
    try:
        return authenticate(db, x_api_key)
    except AuthError as e:
        raise HTTPException(401, str(e))


def guard(fn):
    try:
        return fn()
    except AuthError:
        raise HTTPException(404, "not found")
    except ValueError as e:
        raise HTTPException(400, str(e))


@app.get("/health")
def health():
    return {"ok": True, "model": settings.model_backend, **settings.provenance()}


class AdhocTutorReq(BaseModel):
    question: str
    passages: list = []          # [{id, page_ref, passage}] — e.g. a lesson's inventory
    settings: dict | None = None


@app.post("/tutor/adhoc")
def tutor_adhoc(body: AdhocTutorReq):
    """Stateless grounded tutor the Next.js player calls via the dev proxy.
    No account needed: the caller supplies the passages (their own lesson)."""
    if not body.question.strip():
        raise HTTPException(400, "question required")
    return answer_adhoc(settings, body.question, body.passages, body.settings)


class NewUser(BaseModel):
    name: str


@app.post("/users")
def new_user(body: NewUser):
    return create_user(db, body.name)


@app.post("/resources")
async def upload(file: UploadFile = File(...), x_api_key: str = Header(None)):
    user = uid(x_api_key)
    data = await file.read()
    return guard(lambda: ResourceService(db, settings).upload(user, file.filename, data))


@app.get("/resources/{rid}")
def get_resource(rid: str, x_api_key: str = Header(None)):
    user = uid(x_api_key)
    return guard(lambda: ResourceService(db, settings).get(user, rid))


@app.delete("/resources/{rid}")
def delete_resource(rid: str, x_api_key: str = Header(None)):
    user = uid(x_api_key)
    return guard(lambda: ResourceService(db, settings).delete(user, rid))


class LessonReq(BaseModel):
    resource_id: str
    settings: dict | None = None


@app.post("/lessons")
def make_lesson(body: LessonReq, x_api_key: str = Header(None)):
    user = uid(x_api_key)
    return guard(lambda: LessonService(db, settings).request(user, body.resource_id, body.settings))


@app.get("/lessons/{lid}")
def get_lesson(lid: str, x_api_key: str = Header(None)):
    user = uid(x_api_key)
    return guard(lambda: LessonService(db, settings).get(user, lid))


class TutorReq(BaseModel):
    question: str
    concept_id: str | None = None
    settings: dict | None = None


@app.post("/lessons/{lid}/tutor")
def tutor(lid: str, body: TutorReq, x_api_key: str = Header(None)):
    user = uid(x_api_key)
    return guard(lambda: TutorService(db, settings).answer(
        user, lid, body.question, body.concept_id, body.settings))


@app.post("/lessons/{lid}/practice/{concept_idx}")
def practice_question(lid: str, concept_idx: int, x_api_key: str = Header(None)):
    user = uid(x_api_key)
    return guard(lambda: PracticeService(db, settings).question(user, lid, concept_idx))


class AttemptReq(BaseModel):
    question_id: str
    correct: bool


@app.post("/lessons/{lid}/attempt")
def attempt(lid: str, body: AttemptReq, x_api_key: str = Header(None)):
    user = uid(x_api_key)
    return guard(lambda: PracticeService(db, settings).record(
        user, lid, body.question_id, body.correct))


@app.get("/lessons/{lid}/session")
def get_session(lid: str, x_api_key: str = Header(None)):
    user = uid(x_api_key)
    return guard(lambda: PracticeService(db, settings).get_session(user, lid))


class SessionReq(BaseModel):
    data: dict


@app.put("/lessons/{lid}/session")
def save_session(lid: str, body: SessionReq, x_api_key: str = Header(None)):
    user = uid(x_api_key)
    guard(lambda: PracticeService(db, settings).save_session(user, lid, body.data))
    return {"saved": True}
