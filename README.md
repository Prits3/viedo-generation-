# PaperScenes

Turns a research paper into a narrated, visual lesson. Built for people who find long texts hard to learn from, including neurodivergent learners: the viewer controls pace, sound, captions and motion, and every statement links to its passage in the original PDF.

Prototype for the 5k Build & Launch hackathon. Next.js (App Router) + TypeScript, pdf.js for reading and showing PDFs, Claude for live generation.

## Start

```bash
npm install
npm run dev          # http://localhost:3000
```

Production build:

```bash
npm run build
npm start
```

Requires Node 22.13 or newer (tested with Node 24).

The example lesson needs no configuration: no model call, no API key, no network. Narration, timings, figures and the PDF are in the repository.

## Environment variables

Only needed for "Upload a PDF". Set them in the shell or in `.env.local` (not committed).

| Variable | Needed | Meaning |
|---|---|---|
| `ANTHROPIC_API_KEY` | for uploads | Server-side key for live generation. Never sent to the browser. Without it the upload page says so and offers the example. |
| `LESSON_MODEL` | no | Model ID, default `claude-opus-5-5`. |
| `LESSON_EFFORT` | no | `low` (default, about 1.5 min for a 9-page paper), `medium` (more inventory entries, about 4 min), `high`. |
| `LESSON_RATE_LIMIT_MAX` | no | Generations per visitor per 10 minutes, default 4. |

## Jury walkthrough (about one minute)

1. Open the start page and click **Try an example**. Click **Play the intro**: a city street turns into a satellite view and the question appears: "Do urban trees cool every European city by the same amount?"
2. Let it run to the comparison (or click the scene chip **Central versus Southern Europe**). Central Europe 8-12 K and Southern Europe 0-4 K sit on one scale, with the note that this is surface temperature. Click **8-12 K cooler**.
3. The source view opens beside the player (below it on a phone): page 1 of the original PDF with the sentence highlighted, plus unit, comparison surface and conditions.
4. Switch to **Source index**, filter **Methods**, and click **Explanation** next to "When the satellite looks". The player jumps to chapter 2 and explains the 10:15 a.m. overpass.
5. Click chapter **3 What they found** (original Figure 1 with numbered callouts), switch on **Captions**, then **Less motion**.

Optional: scroll down to "Where each part of the paper lives" (224 inventory entries, none only in the original), or open **Upload a PDF** with a short paper.

## What is in the prototype

- **Start page** with two actions: "Try an example" and "Upload a PDF".
- **Player**: animated intro (85 s) with question, key finding and the caveat; then four chapters (research question, methods, results, limits; about 10 minutes in total). Play/pause, chapter and scene jumps, pace (0.75x to 1.5x), mute, captions, low-motion mode. The system setting `prefers-reduced-motion` is respected. Keyboard: Space, arrows, N/P, M, C.
- **Scene types**, reusable and data-driven: establishing illustration, question, comparison on one scale, flow, schematic region map, annotated original figure, points, timeline. Charts are drawn from the inventory values; illustrations and schematic drawings are labelled as such.
- **Both directions between video and paper**: click a number, callout or source tag to see the highlighted passage in the PDF; pick any entry in the source index to jump back to the scene or detail view that explains it.
- **Coverage map** under the player: which parts are in the intro, a chapter, a detail view, the source appendix, or only in the original. Detail views and the appendix keep formulas, footnotes, all 84 references, data availability and supplements (with their own "external, not checked" status) reachable.
- **Upload**: PDF with a text layer, visible states (reading, building the storyboard, checking, done, failed with the reason), and the example as a fallback when live generation is not possible.

## How coverage is made checkable

`src/lib/types.ts` defines the model: **inventory, then storyboard**.

1. The inventory lists what the paper contains: per entry a stable ID, type, page, verbatim quote, plain statement, and for numbers the unit, what it measures and the comparison conditions, plus the planned place and a check status.
2. The storyboard only references inventory IDs. Each spoken sentence carries its sources, or is marked as a transition without scientific content.
3. `src/lib/coverage.ts` checks both directions at runtime: every entry has a reachable place, every sentence has a source.

For the demo paper, `npm run verify:demo` compares the inventory with the PDF: every quote must be found on its stated page, coverage must hold in both directions, on-screen numbers must match the cited entry, each page needs entries, and the reference list must be continuous. It writes `src/data/demo/verification.json`. The app shows **Fully checked** only when that report passed. Current state: 222 of 222 quotes found, 224 entries on 11 pages, 1 entry marked unclear (a figure cross-reference in the paper), 4 external supplements not checked.

Uploaded papers never get that label. They show "Automatically generated", the number of quotes that were found in the PDF text, and per entry one of: quote found (automatic), unclear, not checked, external.

## Upload pipeline and limits

`POST /api/generate` (`src/app/api/generate/route.ts`):

1. Reads the PDF with pdf.js on the server, page by page. Pages with fewer than 200 characters count as unreadable and are reported.
2. One model call (`src/lib/generate.ts`) with structured output (`src/lib/lesson-schema.ts`). The output is validated with zod before anything is rendered.
3. `src/lib/assemble.ts` searches every quote in the PDF text, compares numbers with their quote, removes unknown references and moves unused entries into detail views.

The PDF text is passed to the model as data inside the user message. The model has no tools, its output is limited to the lesson schema, and the system prompt tells it to treat instructions inside the document as content. The API key stays on the server.

Limits (`src/lib/limits.ts`), chosen for a hackathon demo:

| Limit | Value |
|---|---|
| File size | 15 MB |
| Pages | 40 |
| Extracted text | 200,000 characters; longer papers are rejected, nothing is cut silently |
| Minimum text | 1,500 characters, otherwise "scan without text layer" |
| Generations | 4 per visitor per 10 minutes, 2 at the same time per server |
| Model call | 5 minutes, 48,000 output tokens |

Rate limits are held in memory and reset when the server restarts. Refusals by a safety filter use the API's server-side fallback (`fallbacks: "default"`); if the request is still declined, the upload shows that as the reason.

## Scripts

| Command | Purpose |
|---|---|
| `npm run verify:demo` | Checks the demo lesson against the PDF and writes the verification report. |
| `npm run e2e -- http://localhost:3000` | Browser check of the jury walkthrough on desktop and phone, keyboard, reduced motion (Playwright). Add `--errors <dir>` for broken/scanned PDFs and `--upload <pdf>` for one real generation (costs tokens). |
| `node scripts/check-upload-failures.mjs <pdf>` | Missing key, provider rate limit (mock provider) and the server's own rate limit. Needs `npm run build` first. |
| `npm run narration` | Rebuilds the demo narration with Piper and ffmpeg (`PIPER_EXE`, `PIPER_VOICE`, `FFMPEG_EXE`). Only needed after changing the script. |
| `node scripts/render-pages.mjs <pdf> <outDir> [scale] [crops.json]` | Renders PDF pages or figure crops to images. |
| `node scripts/build-demo-references.mjs` | Extracts the reference list of the demo paper from the PDF. |

Playwright uses its own Chromium if installed (`npx playwright install chromium`), otherwise an installed Edge or Chrome.

## What still needs a person for other PDFs

- **Statements.** The automatic check proves that a quote exists on a page, not that the plain-language sentence renders it correctly. Entries marked "unclear" need a look at the original.
- **Figures, tables and formulas.** The upload path reads text only. Figures are inventoried through their captions and linked to their page; they are not cropped, described from the image, or animated. Numbers that only appear inside a figure are missed.
- **Scans** are rejected (no OCR). Pages without text in an otherwise readable PDF are listed as unreadable and not covered.
- **Voice.** Uploaded papers use the browser's speech synthesis when the browser has a voice, otherwise captions only. Only the demo has recorded narration.
- **References** of uploaded papers are linked to their page, not listed one by one.
- **Layout.** Two-column PDFs with unusual reading order, hyphenation or formulas can make a quote unfindable; it is then shown as "unclear" with the page.

## Sources and licences

- Demo paper: Schwaab, J., Meier, R., Mussetti, G., Seneviratne, S., Bürgi, C. & Davin, E. L. *The role of urban trees in reducing land surface temperatures in European cities.* Nat. Commun. 12, 6763 (2021). https://doi.org/10.1038/s41467-021-26768-w. Open access under CC BY 4.0. The PDF in `public/demo/` is unchanged; the figures `public/demo/fig*.png` are cropped from it.
- Narration: generated offline with Piper and the `en_US-ljspeech-high` voice (trained on the public-domain LJ Speech data set).
- The city and satellite illustration, the region layout and the day timeline are our own schematic drawings and are labelled as illustrations in the player.

## Notes for the team

- TypeScript and Next.js were chosen because the brief asked for them when the repository is empty.
- `AGENTS.md` is written by `next dev` (Next.js 16 notes for coding agents).
