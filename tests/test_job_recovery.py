"""Jobs retry up to max_attempts then fail, and a crash ('running') is recovered."""
from _util import make_env, run
from lumina import jobs


def test_retry_then_fail():
    db, s, _ = make_env()
    calls = {"n": 0}

    def always_fails(db, payload):
        calls["n"] += 1
        raise RuntimeError("boom")

    jid = jobs.enqueue(db, "flaky", {}, max_attempts=3)
    handlers = {"flaky": always_fails}
    assert jobs.run_once(db, handlers) == "queued"   # attempt 1 -> retry
    assert jobs.run_once(db, handlers) == "queued"   # attempt 2 -> retry
    assert jobs.run_once(db, handlers) == "failed"   # attempt 3 -> failed
    assert jobs.run_once(db, handlers) is None        # nothing left to run
    assert calls["n"] == 3
    assert jobs.get_job(db, jid)["status"] == "failed"


def test_success_after_transient_failure():
    db, s, _ = make_env()
    calls = {"n": 0}

    def flaky(db, payload):
        calls["n"] += 1
        if calls["n"] < 2:
            raise RuntimeError("transient")

    jobs.enqueue(db, "flaky", {}, max_attempts=3)
    handlers = {"flaky": flaky}
    assert jobs.run_once(db, handlers) == "queued"
    assert jobs.run_once(db, handlers) == "done"


def test_crash_recovery_requeues_running():
    db, s, _ = make_env()
    jid = jobs.enqueue(db, "x", {}, max_attempts=3)
    # Simulate a crash mid-run: force the row to 'running'.
    db.execute("UPDATE jobs SET status='running' WHERE id=?", (jid,))
    recovered = jobs.recover_stuck(db)
    assert recovered == 1
    assert jobs.get_job(db, jid)["status"] == "queued"


if __name__ == "__main__":
    run([test_retry_then_fail, test_success_after_transient_failure,
         test_crash_recovery_requeues_running])
