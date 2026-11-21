"""Generated content is validated against versioned schemas before storage."""
from _util import make_env, ready_lesson, run
from lumina import LessonService
from lumina.schemas import validate_scene, validate_question, SchemaError


def test_scene_requires_all_style_scripts():
    bad = {"title": "X", "bullets": [], "scripts": {"explainer": "hi"}, "verify": {}}
    try:
        validate_scene(bad); raise AssertionError("expected SchemaError")
    except SchemaError:
        pass


def test_question_needs_exactly_one_correct():
    two_correct = {"question": "?", "choices": [{"t": "a", "ok": True}, {"t": "b", "ok": True}]}
    try:
        validate_question(two_correct); raise AssertionError("expected SchemaError")
    except SchemaError:
        pass


def test_generated_scenes_are_valid():
    db, s, a = make_env()
    _, lid = ready_lesson(db, s, a)
    lesson = LessonService(db, s).get(a, lid)
    assert lesson["scenes"], "no scenes generated"
    for sc in lesson["scenes"]:
        validate_scene(sc)  # must not raise
        assert set(sc["scripts"]) >= {"explainer", "calm", "spill"}


if __name__ == "__main__":
    run([test_scene_requires_all_style_scripts, test_question_needs_exactly_one_correct,
         test_generated_scenes_are_valid])
