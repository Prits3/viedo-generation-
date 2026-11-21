"""Tutor grounding: answers cite retrieved passages; off-source questions return
'insufficient' with no citations rather than guessing."""
from _util import make_env, ready_lesson, run
from lumina import TutorService, LessonService


def test_off_source_is_insufficient():
    db, s, a = make_env()
    _, lid = ready_lesson(db, s, a)
    ans = TutorService(db, s).answer(a, lid, "What is the capital of France?")
    assert ans["grounding"] == "insufficient"
    assert ans["citations"] == []


def test_on_source_cites_real_refs():
    db, s, a = make_env()
    _, lid = ready_lesson(db, s, a)
    # valid source refs for this lesson
    outline = __import__("json").loads(LessonService(db, s).get(a, lid)["outline_json"])
    valid_refs = {c["page_ref"] for c in outline["concepts"]}
    ans = TutorService(db, s).answer(a, lid, "Tell me about Chargaff and base pairing")
    assert ans["grounding"] in ("source", "external")
    assert ans["citations"], "expected at least one citation"
    for ref in ans["citations"]:
        assert ref in valid_refs, f"citation {ref} not a real source ref"


if __name__ == "__main__":
    run([test_off_source_is_insufficient, test_on_source_cites_real_refs])
