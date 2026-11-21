"""Progress is cautious and persists (resumable). One correct answer is
'practised', not mastery; a wrong answer flags 'needs_review' and survives."""
from _util import make_env, ready_lesson, run
from lumina import PracticeService


def test_wrong_flags_review_and_persists():
    db, s, a = make_env()
    _, lid = ready_lesson(db, s, a)
    p = PracticeService(db, s)
    q = p.question(a, lid, 0)
    out = p.record(a, lid, q["question_id"], correct=False)
    assert out["progress"]["0"] == "needs_review"
    assert "adaptation" in out and out["adaptation"]["new_question"]["question_id"]
    # A fresh service instance (like a new request/session) sees the same state.
    assert PracticeService(db, s).progress(a, lid)["0"] == "needs_review"


def test_correct_is_practised_not_mastery():
    db, s, a = make_env()
    _, lid = ready_lesson(db, s, a)
    p = PracticeService(db, s)
    q = p.question(a, lid, 1)
    out = p.record(a, lid, q["question_id"], correct=True)
    assert out["progress"]["1"] == "practised"  # not "mastered"


def test_review_not_downgraded_by_later_view():
    db, s, a = make_env()
    _, lid = ready_lesson(db, s, a)
    p = PracticeService(db, s)
    q = p.question(a, lid, 2)
    p.record(a, lid, q["question_id"], correct=False)      # needs_review
    p.question(a, lid, 2)                                    # viewing again -> introduced
    assert p.progress(a, lid)["2"] == "needs_review"        # not downgraded


def test_session_resume():
    db, s, a = make_env()
    _, lid = ready_lesson(db, s, a)
    p = PracticeService(db, s)
    p.save_session(a, lid, {"scene": 2, "narrator": "calm"})
    assert PracticeService(db, s).get_session(a, lid)["scene"] == 2


if __name__ == "__main__":
    run([test_wrong_flags_review_and_persists, test_correct_is_practised_not_mastery,
         test_review_not_downgraded_by_later_view, test_session_resume])
