# Lumina Learn — architecture & milestones

A product for turning a learner's own resources into personalised video lessons
with expressive narrators, contextual tutoring, games, quizzes and adaptive
follow-up. This document is the map; the code implements the first slice of it.

## Principles
- **Modular monolith first.** One deployable FastAPI app with clear module
  boundaries and an in-process background worker. No Redis/Celery/microservices
  until a measured need justifies them.
- **Core on the standard library.** Persistence is SQLite via `sqlite3`; the job
  queue is a SQLite table + a worker thread. Heavy deps (Docling, Kokoro, boto3)
  sit behind provider interfaces and are optional. This keeps the core testable
  offline and cheap to run.
- **Facts separate from presentation.** One factual outline is produced per
  source; narrator scripts are generated and *verified* against it. Changing a
  narrator reuses the outline; changing a source invalidates derived content.
- **Provenance on everything.** Each lesson records source hash, model, prompt
  version, schema version and settings, so a result is reproducible and auditable.

## The seven responsibilities → modules
| Responsibility | Module | Status in M1 |
|---|---|---|
| 1. Resources | `services.py` (ResourceService) + `providers` parsers | ✅ upload, validate, hash, parse, store sections with refs + status |
| 2. Learning content | `content.py`, `schemas.py` | ✅ outline, concepts, numbers, qualifications; versioned schema |
| 3. Lesson generation | `content.py`, `jobs.py` | ✅ scripts + verification; storyboard = scene bullets/diagram |
| 4. Media processing | `jobs.py` | ✅ async jobs, status, retries, recovery, caching; narration provider stubbed to Kokoro/fallback |
| 5. Tutoring | `services.py` (TutorService), `providers` retrieval | ✅ grounded answers w/ citations, insufficient-evidence path |
| 6. Practice & progress | `services.py` (PracticeService) | ✅ questions, attempts, introduced/practised/needs-review, resume |
| 7. Presentation | `app.py` + the frontend artifact | ✅ API; accessible client with voice/tone/pace/motion/caption/sound controls |

## Provider interfaces (`providers/base.py`)
One working implementation each in M1; alternatives are additive.

| Interface | M1 implementation | Alternatives (backlog) |
|---|---|---|
| `Parser` | `TextParser`, `PyPdfParser` | `DoclingParser` (structure/tables/refs) |
| `LLM` | `MockLLM` (offline), `BedrockLLM` | OpenAI/other via Bedrock or direct |
| `Speech` | `BrowserFallback`, `KokoroSpeech` | Chatterbox (expressive) |
| `Retriever` | `KeywordRetriever` | embedding retrieval |
| `ActivityGenerator` | `LLMActivityGenerator` | templated/game-specific |
| `Renderer` | scene storyboard (frontend plays it) | server-side MP4, PaperTalker |

Providers are chosen by config in `providers/registry.py`; app logic depends on
the interface, not the implementation.

## Data between stages
Structured and validated. `schemas.py` holds the dataclasses and
`validate_scene` / `validate_outline`; `PROMPT_VERSION` and
`SCENE_SCHEMA_VERSION` are recorded with each lesson. A stage never passes raw
model text downstream without validation.

## Open-source strategy (per-candidate, summarised)
| Project | Provides | Decision | Why |
|---|---|---|---|
| Docling | structured extraction + refs | **dependency, behind `Parser`** | MIT code; swap in without touching app logic |
| Kokoro | light TTS (Apache-2.0) | **dependency, behind `Speech`** | runs on our M5; default narration |
| Chatterbox | expressive TTS | **evaluate later** | heavier, controls vary; audition before adopting |
| PaperTalker | paper→video | **not adopted** (keep as renderer alt) | multi-model/GPU = reliability risk now |
| Open Notebook | ingestion+chat+podcast app | **patterns only, not forked** | full SurrealDB app; we keep our own thin layer |

If we ever fork one, its code stays isolated under `providers/` with our changes
documented and an upstream-sync note in BACKLOG.md.

## Milestones
- **M1 — First usable release (this slice):** upload short PDF → generate a
  narrated visual lesson → choose styles → ask grounded questions → practise →
  resume. Modular app, background worker, SQLite persistence, ownership checks,
  tests on consequential behaviour, a small eval harness.
- **M2 — Private beta:** reliability, broader document coverage, accessibility &
  onboarding passes, cost visibility per lesson, in-product feedback. Likely adds
  Postgres + object storage + a real queue when load justifies it.
- **M3 — Expansion:** full books/chapters, more resource types, richer visuals,
  more voices, better adaptation, spaced review.

## Security posture (M1)
- Every resource/lesson/asset is owned by a user; services enforce ownership on
  read and write. Tutor retrieval is scoped to the owner's resources.
- Document contents are **untrusted data**, never instructions — prompts frame
  source text as data and the app never executes model-written code.
- Secrets stay server-side (env). The client never holds a model key.
- Deletion removes a resource and its derived lessons/scenes/questions, and the
  API says so. We only claim a file format works once it actually does.
