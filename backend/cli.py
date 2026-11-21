"""End-to-end CLI over the real services, synchronously (no server needed).

  python cli.py sample_dna.txt                 # offline mock model
  MODEL=bedrock python cli.py paper.pdf         # real Bedrock (rotated key)

Exercises: create user -> upload+parse -> request lesson -> run the job inline
-> print the verification report and a grounded tutor answer.
"""
import os, sys, json, tempfile
from lumina import (Database, create_user, ResourceService, LessonService,
                    TutorService, lesson_handlers, jobs)
from lumina.config import Settings


def main():
    if len(sys.argv) < 2:
        print(__doc__); sys.exit(1)
    path = sys.argv[1]
    s = Settings()
    if s.model_backend == "mock":
        print("[info] MockModel (offline). Set MODEL=bedrock with a rotated key "
              "for real outlines/scripts.\n")
    db = Database(tempfile.mktemp(suffix=".db"))
    user = create_user(db, "cli")
    uid = user["id"]

    rsvc = ResourceService(db, s)
    res = rsvc.upload(uid, os.path.basename(path), open(path, "rb").read())
    print(f"[resource] {res['id']}  extractor={res['extractor']}  "
          f"sections={res['sections_processed']}  status={res['status']}")

    req = LessonService(db, s).request(uid, res["id"])
    print(f"[lesson] {req['lesson_id']} queued (job {req['job_id']})")
    status = jobs.run_once(db, lesson_handlers(db, s))  # run the generation job now
    print(f"[job] generate_lesson -> {status}")

    lesson = LessonService(db, s).get(uid, req["lesson_id"])
    print(f"[lesson] status={lesson['status']}  scenes={len(lesson['scenes'])}  "
          f"provenance={lesson['provenance']}")

    print("\n=== verification report ===")
    for sc in lesson["scenes"]:
        for style, rep in sc["verify"].items():
            flag = "OK " if rep["ok"] else "FLAG"
            extra = "" if rep["ok"] else f"  changed={rep['changed_numbers']}"
            print(f"  [{flag}] scene {sc['ord']} '{sc['title'][:28]}' / {style}{extra}")

    ans = TutorService(db, s).answer(uid, req["lesson_id"], "What is on the first page?")
    print(f"\n[tutor] grounding={ans['grounding']}  citations={ans['citations']}")


if __name__ == "__main__":
    main()
