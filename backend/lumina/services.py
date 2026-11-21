"""Application services — the seven responsibilities, with ownership enforced on
every read and write. These are what the API (app.py), the worker (jobs) and the
tests all call."""
from __future__ import annotations
import hashlib
import json
import secrets
from pathlib import Path

from .config import Settings, settings as default_settings
from .db import Database, now
from .schemas import Source, Section, validate_question, SchemaError
from .security import require_owner, AuthError
from . import content, jobs
from .providers import registry


def _id(prefix): return prefix + "_" + secrets.token_hex(6)


# ============================ 1. Resources ====================================
class ResourceService:
    def __init__(self, db: Database, s: Settings = default_settings):
        self.db, self.s = db, s
        self.parsers = registry.get_parsers(s)
        Path(s.storage_dir).mkdir(parents=True, exist_ok=True)

    def upload(self, user_id: str, filename: str, data: bytes) -> dict:
        if len(data) > self.s.max_upload_mb * 1024 * 1024:
            raise ValueError(f"File exceeds {self.s.max_upload_mb} MB limit.")
        parser = registry.pick_parser(self.parsers, filename)  # raises if unsupported
        rid = _id("r")
        path = str(Path(self.s.storage_dir) / f"{rid}_{Path(filename).name}")
        Path(path).write_bytes(data)
        h = hashlib.sha256(data).hexdigest()
        self.db.execute(
            "INSERT INTO resources (id,user_id,filename,path,content_hash,status,"
            "extractor,created_at) VALUES (?,?,?,?,?,?,?,?)",
            (rid, user_id, filename, path, h, "uploaded", parser.name, now()))
        return self.parse(user_id, rid)

    def parse(self, user_id: str, rid: str) -> dict:
        row = require_owner(self.db, "resources", rid, user_id)
        parser = registry.pick_parser(self.parsers, row["filename"])
        try:
            source: Source = parser.parse(row["path"])
        except Exception as e:
            self.db.execute("UPDATE resources SET status=? WHERE id=?",
                            (f"parse_failed: {e}", rid))
            raise
        self.db.execute("DELETE FROM sections WHERE resource_id=?", (rid,))
        for i, sec in enumerate(source.sections):
            self.db.execute("INSERT INTO sections (id,resource_id,ord,ref,heading,text)"
                            " VALUES (?,?,?,?,?,?)",
                            (sec.id, rid, i, sec.ref, sec.heading, sec.text))
        self.db.execute("UPDATE resources SET status='parsed', extractor=?, title=? WHERE id=?",
                        (source.extractor, source.title, rid))
        return self.get(user_id, rid)

    def get(self, user_id: str, rid: str) -> dict:
        row = require_owner(self.db, "resources", rid, user_id)
        secs = self.db.query("SELECT ord,ref,heading FROM sections WHERE resource_id=? "
                             "ORDER BY ord", (rid,))
        row["sections"] = secs
        row["sections_processed"] = len(secs)
        return row

    def source_object(self, rid: str) -> Source:
        r = self.db.query_one("SELECT * FROM resources WHERE id=?", (rid,))
        rows = self.db.query("SELECT * FROM sections WHERE resource_id=? ORDER BY ord", (rid,))
        return Source(rid, r.get("title") or r["filename"], r["extractor"],
                      [Section(s["id"], s["ref"], s["heading"], s["text"]) for s in rows])

    def delete(self, user_id: str, rid: str) -> dict:
        require_owner(self.db, "resources", rid, user_id)
        lessons = self.db.query("SELECT id FROM lessons WHERE resource_id=?", (rid,))
        for L in lessons:
            self.db.execute("DELETE FROM scenes WHERE lesson_id=?", (L["id"],))
            self.db.execute("DELETE FROM questions WHERE lesson_id=?", (L["id"],))
        self.db.execute("DELETE FROM lessons WHERE resource_id=?", (rid,))
        self.db.execute("DELETE FROM sections WHERE resource_id=?", (rid,))
        row = self.db.query_one("SELECT path FROM resources WHERE id=?", (rid,))
        self.db.execute("DELETE FROM resources WHERE id=?", (rid,))
        try:
            Path(row["path"]).unlink(missing_ok=True)
        except Exception:
            pass
        # Honest about cascade: say what was removed.
        return {"deleted_resource": rid, "deleted_lessons": [L["id"] for L in lessons],
                "note": "Generated lessons, scenes and questions for this resource were removed."}


# ============================ 2/3/4. Lessons + generation job =================
class LessonService:
    def __init__(self, db: Database, s: Settings = default_settings):
        self.db, self.s = db, s

    def request(self, user_id: str, rid: str, settings_dict: dict | None = None) -> dict:
        res = require_owner(self.db, "resources", rid, user_id)
        if res["status"] != "parsed":
            raise ValueError("Resource is not parsed yet.")
        lid = _id("l")
        prov = self.s.provenance()
        self.db.execute(
            "INSERT INTO lessons (id,resource_id,user_id,status,source_hash,"
            "settings_json,provenance_json,created_at) VALUES (?,?,?,?,?,?,?,?)",
            (lid, rid, user_id, "queued", res["content_hash"],
             json.dumps(settings_dict or {}), json.dumps(prov), now()))
        jid = jobs.enqueue(self.db, "generate_lesson", {"lesson_id": lid, "user_id": user_id})
        return {"lesson_id": lid, "job_id": jid, "status": "queued", "provenance": prov}

    # ---- the job handler (runs in the worker) ----
    def generate(self, db: Database, payload: dict):
        lid = payload["lesson_id"]
        lesson = db.query_one("SELECT * FROM lessons WHERE id=?", (lid,))
        if not lesson:
            raise RuntimeError("lesson missing")
        db.execute("UPDATE lessons SET status='generating' WHERE id=?", (lid,))
        source = ResourceService(db, self.s).source_object(lesson["resource_id"])
        llm = registry.get_llm(self.s)
        result = content.build_scenes(llm, source)  # validates each scene internally
        db.execute("UPDATE lessons SET outline_json=? WHERE id=?",
                   (json.dumps(result["outline"]), lid))
        db.execute("DELETE FROM scenes WHERE lesson_id=?", (lid,))
        for sc in result["scenes"]:
            db.execute("INSERT INTO scenes (id,lesson_id,ord,data_json) VALUES (?,?,?,?)",
                       (_id("s"), lid, sc["ord"], json.dumps(sc)))
        db.execute("UPDATE lessons SET status='ready' WHERE id=?", (lid,))

    def get(self, user_id: str, lid: str) -> dict:
        lesson = require_owner(self.db, "lessons", lid, user_id)
        scenes = self.db.query("SELECT data_json FROM scenes WHERE lesson_id=? ORDER BY ord", (lid,))
        lesson["scenes"] = [json.loads(s["data_json"]) for s in scenes]
        lesson["provenance"] = json.loads(lesson.get("provenance_json") or "{}")
        return lesson

    def invalidate_for_resource(self, rid: str, new_hash: str) -> list:
        """Changing a source marks derived lessons stale rather than silently
        serving stale content."""
        affected = self.db.query("SELECT id FROM lessons WHERE resource_id=? AND source_hash!=?",
                                 (rid, new_hash))
        for L in affected:
            self.db.execute("UPDATE lessons SET stale=1 WHERE id=?", (L["id"],))
        return [L["id"] for L in affected]


# ============================ 5. Tutoring =====================================
class TutorService:
    def __init__(self, db: Database, s: Settings = default_settings):
        self.db, self.s = db, s
        self.retriever = registry.get_retriever(s)

    def answer(self, user_id: str, lid: str, question: str,
               current_concept_id: str | None = None, settings_dict: dict | None = None) -> dict:
        lesson = require_owner(self.db, "lessons", lid, user_id)  # scoped to owner
        outline = json.loads(lesson.get("outline_json") or "{}")
        passages = self.retriever.retrieve(outline, question)
        if not passages:
            # Say so rather than guessing — insufficient evidence is a real answer.
            return {"grounding": "insufficient", "answer":
                    "The source doesn't cover that. I can answer from general "
                    "knowledge if you'd like it clearly labelled.",
                    "citations": [], "passages": []}
        llm = registry.get_llm(self.s)
        sys = ("Answer using ONLY the provided passages. Preserve numbers and "
               "caveats; never turn a hypothesis into proof. If you must go beyond "
               "them, label it general knowledge. JSON: {grounding, answer}.")
        user = (f"TASK:tutor\nCONCEPT: {current_concept_id}\n"
                f"PASSAGES: {json.dumps(passages)}\nQUESTION: {question}")
        ans = llm.complete_json(sys, user)
        # Citations are derived from retrieval (deterministic), not model-asserted.
        ans["citations"] = [p["page_ref"] for p in passages]
        ans.setdefault("grounding", "source")
        ans["passages"] = passages
        return ans


# ============================ 6. Practice & progress ==========================
STATES = ("introduced", "practised", "needs_review")


class PracticeService:
    def __init__(self, db: Database, s: Settings = default_settings):
        self.db, self.s = db, s

    def _concept(self, lesson: dict, concept_idx: int) -> dict:
        outline = json.loads(lesson.get("outline_json") or "{}")
        concepts = outline.get("concepts", [])
        return concepts[concept_idx] if 0 <= concept_idx < len(concepts) else {}

    def question(self, user_id: str, lid: str, concept_idx: int) -> dict:
        lesson = require_owner(self.db, "lessons", lid, user_id)
        concept = self._concept(lesson, concept_idx)
        gen = registry.get_activity_generator(self.s, registry.get_llm(self.s))
        q = validate_question(gen.question_for(concept))  # schema-checked
        qid = _id("q")
        self.db.execute("INSERT INTO questions (id,lesson_id,concept_idx,source_ref,data_json)"
                        " VALUES (?,?,?,?,?)",
                        (qid, lid, concept_idx, concept.get("page_ref"), json.dumps(q)))
        self._set_state(user_id, lid, concept_idx, "introduced")
        return {"question_id": qid, **q, "source_ref": concept.get("page_ref")}

    def record(self, user_id: str, lid: str, question_id: str, correct: bool) -> dict:
        lesson = require_owner(self.db, "lessons", lid, user_id)
        qrow = self.db.query_one("SELECT * FROM questions WHERE id=? AND lesson_id=?",
                                 (question_id, lid))
        if not qrow:
            raise AuthError("not found")
        cidx = qrow["concept_idx"]
        self.db.execute("INSERT INTO attempts (id,user_id,lesson_id,question_id,correct,created_at)"
                        " VALUES (?,?,?,?,?,?)",
                        (_id("a"), user_id, lid, question_id, int(correct), now()))
        # One correct answer is 'practised', NOT mastery. Wrong -> needs_review.
        self._set_state(user_id, lid, cidx, "practised" if correct else "needs_review")
        out = {"correct": correct, "progress": self.progress(user_id, lid)}
        if not correct:
            out["adaptation"] = self._adapt(lesson, cidx, user_id, lid)
        return out

    def _adapt(self, lesson: dict, cidx: int, user_id: str, lid: str) -> dict:
        concept = self._concept(lesson, cidx)
        llm = registry.get_llm(self.s)
        diff = llm.complete_text(
            "Re-explain this concept a DIFFERENT way, keeping every number and "
            "caveat. Label any analogy as an analogy.",
            f"CONCEPT: {json.dumps(concept)}")
        new_q = self.question(user_id, lid, cidx)  # fresh targeted question
        return {"explanation": {"text": diff, "page_ref": concept.get("page_ref"),
                                "grounding": "source"},
                "new_question": new_q}

    def _set_state(self, user_id, lid, cidx, state):
        existing = self.db.query_one(
            "SELECT state FROM progress WHERE user_id=? AND lesson_id=? AND concept_idx=?",
            (user_id, lid, cidx))
        # Don't downgrade needs_review -> introduced on a later view.
        if existing and existing["state"] == "needs_review" and state == "introduced":
            return
        self.db.execute(
            "INSERT INTO progress (user_id,lesson_id,concept_idx,state,updated_at) "
            "VALUES (?,?,?,?,?) ON CONFLICT(user_id,lesson_id,concept_idx) "
            "DO UPDATE SET state=excluded.state, updated_at=excluded.updated_at",
            (user_id, lid, cidx, state, now()))

    def progress(self, user_id: str, lid: str) -> dict:
        rows = self.db.query("SELECT concept_idx,state FROM progress WHERE user_id=? AND lesson_id=?",
                             (user_id, lid))
        return {str(r["concept_idx"]): r["state"] for r in rows}

    def suggest_next(self, user_id: str, lid: str) -> dict:
        prog = self.progress(user_id, lid)
        for idx, st in sorted(prog.items(), key=lambda x: int(x[0])):
            if st == "needs_review":
                return {"concept_idx": int(idx), "reason": "flagged for review",
                        "note": "You can also jump anywhere you like."}
        return {"concept_idx": None, "reason": "nothing flagged for review"}

    # ---- resume ----
    def save_session(self, user_id: str, lid: str, data: dict):
        require_owner(self.db, "lessons", lid, user_id)
        self.db.execute(
            "INSERT INTO sessions (user_id,lesson_id,data_json,updated_at) VALUES (?,?,?,?) "
            "ON CONFLICT(user_id,lesson_id) DO UPDATE SET data_json=excluded.data_json,"
            " updated_at=excluded.updated_at",
            (user_id, lid, json.dumps(data), now()))

    def get_session(self, user_id: str, lid: str) -> dict:
        require_owner(self.db, "lessons", lid, user_id)
        row = self.db.query_one("SELECT data_json FROM sessions WHERE user_id=? AND lesson_id=?",
                                (user_id, lid))
        return json.loads(row["data_json"]) if row else {}


def lesson_handlers(db: Database, s: Settings = default_settings) -> dict:
    """Job-kind -> handler map for the worker."""
    svc = LessonService(db, s)
    return {"generate_lesson": svc.generate}
