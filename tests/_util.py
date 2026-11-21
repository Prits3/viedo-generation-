"""Shared test setup. Stdlib only, MockLLM (offline), temp DB per test."""
import os, sys, tempfile, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
os.environ.setdefault("MODEL", "mock")

from lumina import (Database, create_user, ResourceService, LessonService,
                    PracticeService, TutorService, lesson_handlers, jobs)
from lumina.config import Settings

SAMPLE = """§1 Isolation
In 1869 Friedrich Miescher isolated nuclein from cell nuclei. It contains four bases A, T, G and C.

§2 Chargaff's rules
Within an organism %A ≈ %T and %G ≈ %C. Composition varies between species.

§3 The double helix
The helix is about 2 nm wide, roughly 10 base pairs per turn, 0.34 nm rise and 3.4 nm per turn. A pairs with T, G with C.
"""


def make_env():
    s = Settings(db_path=tempfile.mktemp(suffix=".db"),
                 storage_dir=tempfile.mkdtemp())
    db = Database(s.db_path)
    user = create_user(db, "tester")
    return db, s, user["id"]


def ready_lesson(db, s, uid, text=SAMPLE):
    f = tempfile.mktemp(suffix=".txt")
    pathlib.Path(f).write_text(text, encoding="utf-8")
    res = ResourceService(db, s).upload(uid, os.path.basename(f), open(f, "rb").read())
    req = LessonService(db, s).request(uid, res["id"])
    status = jobs.run_once(db, lesson_handlers(db, s))
    assert status == "done", f"generation failed: {status}"
    return res["id"], req["lesson_id"]


def ok(name):
    print(f"  ✓ {name}")


def run(tests):
    failures = 0
    for t in tests:
        try:
            t()
            ok(t.__name__)
        except Exception as e:
            failures += 1
            print(f"  ✗ {t.__name__}: {e}")
    if failures:
        print(f"FAILED {failures}/{len(tests)}")
        sys.exit(1)
    print(f"PASSED {len(tests)}/{len(tests)}")
