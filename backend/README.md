# Lumina Learn — backend

A modular learning-video backend: upload a resource → generate a narrated visual
lesson with selectable styles → ask source-grounded questions → practise →
resume. The connected loop (interrupt, reshape, practise the exact confusion,
continue) is the product; this is the maintainable foundation under it.

- **Architecture & milestones:** [ARCHITECTURE.md](ARCHITECTURE.md)
- **Backlog:** [BACKLOG.md](BACKLOG.md)
- **Frontend:** the accessible player/tutor client (published separately as the
  Lumina Learn artifact). M2 wires it to this API — see backlog.

## Why it's shaped this way
- **Modular monolith + in-process worker.** No external broker/microservices
  until load justifies them.
- **Core on the standard library.** Persistence (SQLite), the job queue, and the
  tutor run with zero third-party deps, so the whole suite runs and passes
  offline. Heavy tools (Docling, Kokoro, boto3) sit behind provider interfaces.
- **Facts separate from presentation.** One factual outline per source; every
  narrator script is verified against it before use.
- **Provenance on every lesson:** source hash, model, prompt version, schema
  version, settings.

## Run with zero installs (offline, mock model)
```bash
cd ~/lumina-pipeline
python run_tests.py                 # 17 tests, stdlib only
python cli.py sample_dna.txt        # upload → generate → verify → tutor, end to end
```

## Run the API
```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
MODEL=mock uvicorn lumina.app:app --reload --port 8787   # or MODEL=bedrock
```
Walkthrough (mock model, no key needed):
```bash
# 1. make a user, grab the api key
curl -s localhost:8787/users -H 'content-type: application/json' -d '{"name":"me"}'
# 2. upload (returns resource id)
curl -s localhost:8787/resources -H "x-api-key: $KEY" -F file=@sample_dna.txt
# 3. generate a lesson (async job)
curl -s localhost:8787/lessons -H "x-api-key: $KEY" -H 'content-type: application/json' -d '{"resource_id":"'$RID'"}'
# 4. poll the lesson until status=ready, then ask the tutor / practise
curl -s localhost:8787/lessons/$LID -H "x-api-key: $KEY"
curl -s localhost:8787/lessons/$LID/tutor -H "x-api-key: $KEY" -H 'content-type: application/json' -d '{"question":"what did Chargaff find?"}'
```

### Environment variables
| Var | Purpose |
|---|---|
| `MODEL` | `mock` (default, offline) or `bedrock` |
| `AWS_BEARER_TOKEN_BEDROCK` | Bedrock key — **rotate the one pasted in chat**; server-side only |
| `BEDROCK_MODEL_ID`, `AWS_REGION` | model + region |
| `PARSER` | `auto` (default) / `pypdf` / `docling` / `text` |
| `SPEECH` | `fallback` (default) / `kokoro` |
| `LUMINA_DB`, `LUMINA_STORAGE` | sqlite path, upload dir |
| `ALLOWED_ORIGINS` | CORS allowlist for the frontend |

## API
| Method | Path | Does |
|---|---|---|
| POST | `/users` | create a user, returns an api key |
| POST | `/resources` | upload + parse a file (multipart) |
| GET/DELETE | `/resources/{id}` | fetch (with section refs) / delete (cascades, told honestly) |
| POST | `/lessons` | request generation (async job) |
| GET | `/lessons/{id}` | lesson + scenes + provenance |
| POST | `/lessons/{id}/tutor` | grounded answer w/ citations |
| POST | `/lessons/{id}/practice/{concept_idx}` | a source-grounded question |
| POST | `/lessons/{id}/attempt` | record result; wrong answer returns an adaptation |
| GET/PUT | `/lessons/{id}/session` | resume state |

All data-bearing routes require `x-api-key` and enforce ownership.

## Checks run (offline, reported honestly)
- `py_compile` clean across all modules.
- `run_tests.py` → **17/17** covering the consequential behaviours:
  access control, job recovery, schema validation, progress persistence,
  tutor grounding, source references + delete cascade.
- `cli.py sample_dna.txt` → full slice; verifier flags where the lossy mock
  writer drops numbers (the check working as intended).

**Not run here:** real Bedrock calls (no valid key in this environment) and
Kokoro/Docling (weights not installed). Those paths compile and are isolated
behind providers — measure real generation time/cost on your M5 and record it
(backlog item).

## Security posture
Ownership enforced in services; tutor retrieval scoped to the owner. Document
text is treated as untrusted data, never instructions; no model-written code is
executed. Secrets stay server-side. Deletion cascades and the response says so.
A file format is only advertised once it actually parses.

## Attribution
- Docling — https://github.com/docling-project/docling (MIT; model licences vary)
- Kokoro-82M — https://huggingface.co/hexgrad/Kokoro-82M (Apache-2.0)
- pypdf — https://github.com/py-pdf/pypdf (BSD)
- Chatterbox — https://github.com/resemble-ai/chatterbox (evaluate; check terms)
- Paper2Video/PaperTalker — https://github.com/showlab/Paper2Video (evaluated; not bundled)
- Open Notebook — https://github.com/lfnovo/open-notebook (patterns only; not forked)

Narrator identities are original. Celebrity references describe delivery only;
no narrator is presented as a real person.

## Demo script (the connected loop)
Upload short PDF → generate lesson → pick Traditional Explainer → switch to Spill
the Tea mid-lesson (same facts) → pause, ask a grounded question → answer a
challenge wrong → get a different explanation + a fresh question → retry → resume
with progress saved.
