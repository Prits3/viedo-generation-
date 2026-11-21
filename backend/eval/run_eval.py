"""Run the eval set and print operational metrics. Offline with MODEL=mock;
set MODEL=bedrock for real numbers (generation time/cost). Honest: with the mock
model, verification flags reflect the lossy mock writer, not a real model.

  python eval/run_eval.py
"""
import os, sys, json, time, tempfile, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
os.environ.setdefault("MODEL", "mock")

from lumina import (Database, create_user, ResourceService, LessonService,
                    TutorService, lesson_handlers, jobs)
from lumina.config import Settings

ROOT = pathlib.Path(__file__).resolve().parents[1]


def main():
    spec = json.loads((ROOT / "eval" / "eval_set.json").read_text())
    s = Settings(db_path=tempfile.mktemp(suffix=".db"), storage_dir=tempfile.mkdtemp())
    db = Database(s.db_path)
    uid = create_user(db, "eval")["id"]

    print(f"model={s.model_backend}\n")
    for doc in spec["documents"]:
        path = ROOT / doc["path"]
        res = ResourceService(db, s).upload(uid, path.name, path.read_bytes())
        t0 = time.time()
        req = LessonService(db, s).request(uid, res["id"])
        jobs.run_once(db, lesson_handlers(db, s))
        gen_s = time.time() - t0
        lesson = LessonService(db, s).get(uid, req["lesson_id"])

        scenes = lesson["scenes"]
        total = sum(len(sc["verify"]) for sc in scenes)
        flagged = sum(1 for sc in scenes for r in sc["verify"].values() if not r["ok"])
        valid_refs = {c["page_ref"] for c in json.loads(lesson["outline_json"])["concepts"]}

        cite_ok = cite_total = grounding_ok = 0
        tsvc = TutorService(db, s)
        for item in doc["questions"]:
            a = tsvc.answer(uid, req["lesson_id"], item["q"])
            grounding_ok += (a["grounding"] == item["expect"]
                             or (item["expect"] == "source" and a["grounding"] == "external"))
            if a["citations"]:
                cite_total += 1
                cite_ok += all(c in valid_refs for c in a["citations"])

        print(f"[{doc['id']}] sections={res['sections_processed']} scenes={len(scenes)} "
              f"gen={gen_s:.3f}s")
        print(f"   verification: {total-flagged}/{total} style-scripts clean "
              f"({flagged} flagged)")
        print(f"   grounding match: {grounding_ok}/{len(doc['questions'])} questions")
        print(f"   citation support: {cite_ok}/{cite_total} answers cite only real refs")
        print(f"   provenance: {lesson['provenance']}\n")
    print("Note: with MODEL=mock, verification flags come from the lossy mock "
          "writer. Run MODEL=bedrock for real factual-error / cost numbers.")


if __name__ == "__main__":
    main()
