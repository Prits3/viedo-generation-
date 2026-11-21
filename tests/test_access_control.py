"""Ownership is enforced: one user cannot read or act on another's data."""
from _util import make_env, ready_lesson, run, create_user
from lumina import ResourceService, LessonService, TutorService, PracticeService, AuthError


def test_other_user_cannot_read_resource():
    db, s, a = make_env()
    rid, lid = ready_lesson(db, s, a)
    b = create_user(db, "mallory")["id"]
    for call in (lambda: ResourceService(db, s).get(b, rid),
                 lambda: LessonService(db, s).get(b, lid),
                 lambda: TutorService(db, s).answer(b, lid, "anything")):
        try:
            call(); raise AssertionError("expected AuthError")
        except AuthError:
            pass


def test_owner_can_read():
    db, s, a = make_env()
    rid, lid = ready_lesson(db, s, a)
    assert ResourceService(db, s).get(a, rid)["id"] == rid
    assert LessonService(db, s).get(a, lid)["status"] == "ready"


def test_other_user_cannot_delete():
    db, s, a = make_env()
    rid, _ = ready_lesson(db, s, a)
    b = create_user(db, "mallory")["id"]
    try:
        ResourceService(db, s).delete(b, rid); raise AssertionError("expected AuthError")
    except AuthError:
        pass
    # still there for the owner
    assert ResourceService(db, s).get(a, rid)["id"] == rid


if __name__ == "__main__":
    run([test_other_user_cannot_read_resource, test_owner_can_read,
         test_other_user_cannot_delete])
