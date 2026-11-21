"""Run the whole suite with the stdlib (no pytest needed): python run_tests.py"""
import subprocess, sys, pathlib

TESTS = ["test_access_control", "test_job_recovery", "test_schema_validation",
         "test_progress", "test_tutor_grounding", "test_source_references"]
d = pathlib.Path(__file__).parent / "tests"
fail = 0
for t in TESTS:
    print(f"== {t} ==")
    r = subprocess.run([sys.executable, str(d / f"{t}.py")])
    fail += (r.returncode != 0)
print("\nALL PASSED" if not fail else f"\n{fail} FILE(S) FAILED")
sys.exit(1 if fail else 0)
