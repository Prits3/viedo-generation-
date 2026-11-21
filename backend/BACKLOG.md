# Backlog

Ordered within each milestone; move items, don't delete history.

## M1 — First usable release (status)
- [x] Modular app: resources / content / generation / jobs / tutoring / practice / presentation
- [x] SQLite persistence + ownership on every read/write
- [x] Background worker: queue, retries, crash recovery, caching (content hash)
- [x] Provider interfaces + one impl each (Parser, LLM, Speech, Retriever, Activity, Renderer)
- [x] Shared factual outline → per-style scripts → verification (numbers deterministic)
- [x] Tutor: grounded answers w/ citations + insufficient-evidence path
- [x] Practice: introduced/practised/needs-review, adaptation on wrong answer, resume
- [x] Versioned schemas + provenance stamped per lesson
- [x] Tests on consequential behaviour (17 passing, stdlib)
- [ ] Wire the frontend artifact to the authenticated API (upload → poll job → play).
      Currently the frontend is the polished demo client; its live-tutor toggle
      targets a simpler `/api/tutor` shape. Needs: auth header, upload UI, job
      polling, `/lessons/{id}/tutor`.
- [ ] Real run on Bedrock + Kokoro on the M5; record generation time & cost/lesson.
- [ ] `python-multipart` + a manual `curl` walkthrough in README verified live.

## M2 — Private beta
- [ ] Postgres behind `db.py` + object storage behind `services` (when load needs it).
- [ ] Real queue (RQ/Celery) only if the in-process worker becomes a bottleneck.
- [ ] Embedding retrieval behind `Retriever` (keyword is M1).
- [ ] Docling parser default once validated on real papers; OCR for scanned PDFs.
- [ ] Cost meter per lesson + per-user budget caps + cancellation of running jobs.
- [ ] Accessibility + onboarding pass; in-product feedback capture.
- [ ] "Content sent to external AI providers" disclosure surfaced in the UI.
- [ ] Rate limiting + audit logging (without storing private source text).
- [ ] Eval harness expanded; track factual errors / citation support over time.

## M3 — Expansion
- [ ] Full books → chapter learning paths with per-section processing status.
- [ ] EPUB/DOCX/PPTX ingestion (only advertised once each actually works).
- [ ] More narrators; audition Chatterbox vs Kokoro on identical passages.
- [ ] Richer visuals; evaluate PaperTalker as a `Renderer` for cinematic segments
      (keep its code isolated; document fork changes + upstream-sync plan).
- [ ] Spaced review scheduling from observed attempts.

## Known limitations (today)
- Keyword retrieval; no embeddings yet.
- Model-judged half of verification needs the real model; number check is offline.
- In-process worker = single process; fine for M1, not for scale.
- `scenes.json` uses a generic bullet storyboard for arbitrary docs; the bundled
  DNA demo has bespoke SVG diagrams in the frontend.
- No OCR; scanned PDFs are rejected honestly rather than silently empty.
