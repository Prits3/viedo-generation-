# Integration — one local app

This branch (`integration`) runs Trung's Next.js frontend and Pritika's Python
backend together as a single local application.

- **Frontend (root)** — Trung's PaperScenes player, PDF viewer, accessibility
  controls, duck mascot. Owns: player, animation, upload UX, lesson schema.
- **Backend (`backend/`)** — Pritika's FastAPI service: grounded tutor,
  generation, persistence. Owns: API, tutor grounding, jobs, storage.

## Run it (one command)
```bash
# first time only
npm install
pip install -r backend/requirements.txt

# every time
./dev.sh
```
Open **http://localhost:3000**.

- `./dev.sh` runs the backend (FastAPI, `127.0.0.1:8787`) and the frontend
  (Next.js, `localhost:3000`) together. Ctrl-C stops both.
- Default `MODEL=mock` → no key needed; the tutor returns grounded **stub**
  answers (real grounding/citations, placeholder prose).
- Real answers + real uploads:
  ```bash
  MODEL=anthropic ANTHROPIC_API_KEY=sk-ant-... ./dev.sh
  ```
  One key convention for both sides: `ANTHROPIC_API_KEY` (+ optional
  `LESSON_MODEL`, default `claude-opus-5-5`). **Rotate the key pasted in chat.**

## How they connect
`next.config.ts` proxies `/backend/*` → the FastAPI service (dev rewrite, so the
browser calls same-origin and the key stays server-side). No CORS needed.

## Shared contract (agree before deeper integration)
The piece wired now is the **contextual tutor**. The frontend already owns the
lesson schema (`src/lib/types.ts`: inventory → storyboard); the backend consumes
a passage list derived from that inventory, so no schema rewrite is needed.

**`POST /backend/tutor/adhoc`** (stateless; caller supplies grounding)
```jsonc
// request
{ "question": "How much cooler are central European cities?",
  "passages": [ { "id": "q-compare", "page_ref": "p. 1", "passage": "..." } ],
  "settings": { "scene": "Central vs Southern Europe" } }
// response
{ "grounding": "source" | "external" | "insufficient",
  "answer": "...",
  "citations": [ { "id": "q-compare", "page_ref": "p. 1" } ] }
```
`citations[].id` is an **inventory id**, so the player opens the existing PDF
viewer with `onOpenSource(id)`. `passages` is the lesson's `inventory` mapped to
`{id, page_ref, passage}` (see `src/components/TutorPanel.tsx`).

Other backend endpoints exist for the account-based flow (upload → generate →
practice → resume): `POST /resources`, `POST /lessons`, `GET /lessons/{id}`,
`POST /lessons/{id}/tutor`, `/attempt`, `/session` — all behind `x-api-key`. See
`backend/README.md`. These are the path for wiring upload/practice/resume for
*uploaded* papers (below).

## What's wired vs. owned-by-whom (honest status)
| Flow step | Status | Owner / next step |
|---|---|---|
| Upload a PDF | ✅ works (frontend's own `/api/generate`, Anthropic) | Trung |
| Watch animated narrated lesson | ✅ works (demo lesson, recorded audio) | Trung |
| **Pause & ask contextual question** | ✅ **wired this branch** (backend tutor, grounded, citations open PDF) | Pritika |
| Source citations + PDF viewer | ✅ preserved | Trung |
| Accessibility controls + duck mascot | ✅ preserved | Trung |
| Choose Traditional vs Tea storytelling | ⬜ not wired — recorded audio is single-style | Trung: style variants / browser-voice restyle; tutor already takes a `settings.narrator` |
| Practise + progress persistence | ⬜ backend ready (`PracticeService`), not surfaced for the demo lesson | Pritika: expose on uploaded lessons via the account API |
| Refresh & resume | ◐ player prefs persist (localStorage); full progress resume needs the account flow | both |

## Coordination note
These two sessions can't message each other directly. Coordination is through
this branch + a PR: Pritika's session added the backend mount, the proxy and the
tutor wiring here; Trung reviews the contract above and owns the frontend tasks
in the table. Neither `main` nor `paperscenes-prototype` was modified.
