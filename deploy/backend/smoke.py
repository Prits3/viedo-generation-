"""Smoke test of a running backend over HTTP (stdlib only).

  python deploy/backend/smoke.py http://127.0.0.1:8787
  python deploy/backend/smoke.py https://api.example.com

health -> user -> upload sample_dna.txt -> lesson job until ready -> tutor answer with citations.
"""
import json, sys, time, uuid, urllib.request, pathlib

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8787").rstrip("/")
ROOT = pathlib.Path(__file__).resolve().parents[2]


def call(method, path, body=None, key=None, raw=None, ctype="application/json"):
    data = raw if raw is not None else (json.dumps(body).encode() if body is not None else None)
    req = urllib.request.Request(BASE + path, data=data, method=method)
    if data is not None:
        req.add_header("content-type", ctype)
    if key:
        req.add_header("x-api-key", key)
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read())


def multipart(name, content):
    b = uuid.uuid4().hex
    head = f'--{b}\r\nContent-Disposition: form-data; name="file"; filename="{name}"\r\nContent-Type: text/plain\r\n\r\n'.encode()
    return head + content + f"\r\n--{b}--\r\n".encode(), f"multipart/form-data; boundary={b}"


t0 = time.time()
h = call("GET", "/health")
print("health:", h)
user = call("POST", "/users", {"name": "smoke"})
key = user.get("api_key") or user.get("key")
assert key, f"no api key in {list(user)}"
raw, ctype = multipart("sample_dna.txt", (ROOT / "sample_dna.txt").read_bytes())
res = call("POST", "/resources", raw=raw, ctype=ctype, key=key)
print("resource:", res.get("id"), res.get("status"), "sections", res.get("sections_processed"))
lesson = call("POST", "/lessons", {"resource_id": res["id"]}, key=key)
lid = lesson.get("id") or lesson.get("lesson_id")
for _ in range(60):
    got = call("GET", f"/lessons/{lid}", key=key)
    if got.get("status") in ("ready", "failed"):
        break
    time.sleep(1)
print("lesson:", lid, got.get("status"), "scenes", len(got.get("scenes") or []))
assert got.get("status") == "ready", got
ans = call("POST", f"/lessons/{lid}/tutor", {"question": "What did Chargaff find?"}, key=key)
print("tutor:", json.dumps(ans)[:400])
print(f"OK in {time.time() - t0:.1f} s")
