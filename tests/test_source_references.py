"""Every generated scene's page reference points at a real source section, and
deletion cascades to derived content (honest 'what happens to assets')."""
import json
from _util import make_env, ready_lesson, run
from lumina import LessonService, ResourceService


def test_scene_refs_exist_in_source():
    db, s, a = make_env()
    rid, lid = ready_lesson(db, s, a)
    source_refs = {sec["ref"] for sec in ResourceService(db, s).get(a, rid)["sections"]}
    lesson = LessonService(db, s).get(a, lid)
    for sc in lesson["scenes"]:
        assert sc["page_ref"] in source_refs, f"{sc['page_ref']} not in {source_refs}"


def test_delete_cascades_to_lessons():
    db, s, a = make_env()
    rid, lid = ready_lesson(db, s, a)
    result = ResourceService(db, s).delete(a, rid)
    assert lid in result["deleted_lessons"]
    # scenes are gone too
    assert db.query("SELECT id FROM scenes WHERE lesson_id=?", (lid,)) == []


if __name__ == "__main__":
    run([test_scene_refs_exist_in_source, test_delete_cascades_to_lessons])
