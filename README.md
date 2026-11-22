# PaperScenes / Lumina Learn

Turns a research paper, another PDF or a pasted text into a narrated, visual lesson that plays in the browser. Built for people who find long texts hard to learn from, including neurodivergent learners: the viewer controls pace, sound, captions and motion, a small robot duck guides every lesson, and every statement links to its passage in the original.

Prototype for the 5k Build & Launch hackathon. The repository has two parts that share the same idea (facts first, presentation second, every claim traceable):

| Part | Where | What it is |
|---|---|---|
| **Web app** (this section) | `src/`, `public/`, `scripts/` | Next.js player, the offline demo lesson, and the generation pipeline (PDF or text to a stored, playable lesson) |
| **Backend** ([below](#backend-lumina-learn)) | `lumina/`, `cli.py`, `tests/`, `eval/` | Python service with accounts, a job queue, tutor and practice questions |

Both read the same Bedrock variables (`AWS_BEARER_TOKEN_BEDROCK`, `AWS_REGION`, `BEDROCK_MODEL_ID`). What the web app took over from the backend is listed under [How the two parts fit together](#how-the-two-parts-fit-together).

## Start the web app

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

Three finished shorts (from a Word file, a PowerPoint file and a text) are bundled in `showcase/lessons/`, each with its recorded narration, its exported vertical MP4 and its post text. They are read-only, listed as "Example · with video" and open without a model call. Your own lessons go to the lesson store; an ID in both places is served from the store.

## Deploy on Vercel

The repository deploys as a normal Next.js project (framework preset Next.js, no build settings to change, Node 22 or newer). What works where:

| | Vercel | Local or a VPS (`npm run build && npm start`) |
|---|---|---|
| Example lesson, the three example shorts, their MP4 download | yes | yes |
| Generate a short or lesson | only with a model key set (below); browser voice, no Piper | yes, with Piper voice if installed |
| Generated lessons | kept in `/tmp` of one function instance: temporary, may be gone on the next visit | kept in `.data/lessons` |
| Lesson list on the start page | examples only (no accounts, so visitors would see each other's lessons) | all lessons on the server |
| Export a new MP4 | no (needs ffmpeg and a headless browser); the page says so | yes |

Steps: import the GitHub repository at vercel.com/new and deploy the branch that contains this code (set it as the Production Branch under Settings → Git if it is not `main`). Without environment variables the site shows the examples and the upload page explains that live generation is not configured. To allow generation, set `AWS_BEARER_TOKEN_BEDROCK` (and optionally `AWS_REGION`, `BEDROCK_MODEL_*`) under Settings → Environment Variables. Before you do that on a public URL: the rate limit is in memory per instance, so set a spending limit on the model account. A custom domain is added under Settings → Domains; Vercel then shows the DNS records to enter at the registrar.

## Configuration

Only needed for "Make a lesson" (upload a PDF or paste a text). Set the variables in the shell or in `.env.local` (not committed). Keys are read on the server only; the app shows whether a key is present, never the key.

| Variable | Needed | Meaning |
|---|---|---|
| `AWS_BEARER_TOKEN_BEDROCK` | for generation with Bedrock | Bedrock API key. When it is set, Bedrock is the default provider. |
| `AWS_REGION` | no | Bedrock region, default `us-east-1`. |
| `BEDROCK_MODEL_FAST` | no | Model for the inventory and for repairing single scenes. Default `zai.glm-4.7-flash`. |
| `BEDROCK_MODEL_STRONG` | no | Model for storyboard, narration, the claim check and directions for the duck. Default `mistral.mistral-large-3-675b-instruct`. |
| `BEDROCK_MODEL_VISION` | no | Model that reads original figures and tables. Default: the strong model (it accepts images). |
| `BEDROCK_MODEL_ID` | no | One model for all three roles (the minimal configuration; same variable as the backend). |
| `ANTHROPIC_API_KEY` | for the direct Anthropic option | Used when Bedrock is not configured, or when "Anthropic API (direct)" is chosen on the page. |
| `LESSON_PROVIDER` | no | `bedrock` or `anthropic`: forces the default provider. |
| `LESSON_MODEL`, `LESSON_MODEL_FAST` | no | Anthropic models, default `claude-opus-5-5` and `claude-haiku-5-5`. |
| `LESSON_EFFORT` | no | Anthropic only: `low` (default), `medium`, `high`. |
| `PIPER_EXE`, `PIPER_VOICE`, `FFMPEG_EXE` | for recorded narration | Local Piper voice. Default voice file `.cache/voices/en_US-ljspeech-high.onnx`. Without Piper, generated lessons use the browser voice or captions. |
| `LESSON_STORE_DIR` | no | Where generated lessons are stored. Default `.data/lessons` (not committed); on Vercel `/tmp/lessons`. |
| `LESSON_SHOWCASE_DIR` | no | Bundled read-only example lessons. Default `showcase/lessons`. |
| `LESSON_LIST_ALL` | no | `1` lists every stored lesson on the start page also on Vercel (only for a private deployment). |
| `LESSON_FIGURES` | no | `off` skips the vision step. |
| `LESSON_RATE_LIMIT_MAX` | no | Generations per visitor per 10 minutes, default 4. |

## Jury walkthrough (about one minute)

1. Open the start page and click **Try an example**. Click **Play the intro**: the robot duck stands on a hot street and looks up, the camera follows its gaze to a satellite view, then comes back down and only the surfaces a satellite measures light up (roofs, road, treetops).
2. In the comparison (or click the scene chip **Central versus Southern Europe**) the duck points at each value as it is spoken: Central Europe 8-12 K and Southern Europe 0-4 K on one scale. Click **8-12 K cooler** while it plays.
3. The scene pauses and the source view opens beside the player (below it on a phone): page 1 of the original PDF with the sentence highlighted. Click **Close and continue watching**: the scene goes on from the same moment.
4. Switch to **Source index**, filter **Methods**, and click **Explanation** next to "When the satellite looks". The player jumps to chapter 2.
5. Click chapter **3 What they found** (original Figure 1 with numbered callouts), switch on **Captions**, then **Less motion**: the duck still takes its pose for each sentence, without movement in between.

Second minute, to show that it is a framework and not one hand-made video: open **Upload a PDF**, switch to **Paste text**, paste `sample_dna.txt` and generate. About two minutes later the same player, voice and duck tell a different kind of story (milestones on a line instead of a methods chapter), and a click on a sentence shows the original paragraph. Lessons that were already generated are listed on the start page and open without any model call.

## The pipeline

One path for every input (`src/lib/pipeline.ts`):

```
input -> source blocks -> content inventory -> storyboard -> checked scenes -> figures -> voice -> lesson file -> player
```

| Step | What happens | Model |
|---|---|---|
| Source blocks | A PDF becomes one block per page (pdf.js), a pasted text one block per paragraph. Everything later only sees numbered blocks; the UI calls them "p. 3" or "§3". (`src/lib/source.ts`) | none |
| Content inventory | Every statement, number, figure, table and formula with an exact quote and its block. Long sources are split and inventoried in parallel. The app, not the model, assigns the IDs. Each quote is then searched in the source. | fast |
| Storyboard | Scenes built only from inventory entries: narration, scene types, chapter structure, and what the duck and the camera do for each sentence. The storyboard chooses the structure that fits the content. | strong |
| Check | Deterministic: every sentence has a source; every number spoken or shown occurs in the cited passage. Model-judged: is each sentence supported by the passages it cites. A scene that fails is regenerated on its own (once); if it still fails it stays, visibly flagged. (`src/lib/check.ts`) | strong (judge), fast (repair) |
| Figures | PDF only: up to two original figures or tables are located through the PDF text layer (caption or header row), cropped from the rendered page, and described by the vision model. Sentences with numbers that are not in the page text are dropped. (`src/lib/figures.ts`) | vision |
| Voice | Piper records each scene with the same voice as the example and returns the timing of every sentence. | none (local) |
| Lesson file | Validated against the format and stored. | none |

**Lesson format** (`src/lib/lesson-file.ts`): `paperscenes.lesson`, version 2. One JSON file with chapters and scenes of approved types, narration text, timed captions, the inventory with sources, asset references, and per scene a list of timed actions on three tracks (`mascot`, `camera`, `graphic`). It also records provenance: source hash, provider, model per role, prompt version, voice, and for every model call the model, duration, tokens and estimated cost. The model output is limited to schemas (`src/lib/lesson-schema.ts`); the renderer only interprets values from the lesson file, and source text is passed to the models as data.

**Same file, same playback.** The player derives the whole picture from the actions at or before the current time (`src/lib/actions.ts`), so pause, seek, chapter jump and pace always show the same state, and audio, captions, gestures and graphics stay together. Opening a stored lesson (`/lesson/<id>`) loads that file and its audio; no model is called.

**Resume and single-scene regeneration.** Each step writes a checkpoint (`.data/lessons/<id>/`). A run that was stopped or failed continues after its last finished step. "Regenerate this scene" in the player rewrites one scene, records only that scene's narration again and saves a new revision; other scenes and their audio are untouched.

**Scene types.** For generated lessons: question, statement (one idea, optional analogy labelled "Analogy, not a finding"), points, flow, milestones, comparison on one shared scale, and annotated original figure. The example additionally uses a hand-drawn establishing scene, a schematic region map and a day timeline.

**The robot duck** (`src/components/Duck.tsx`) is one SVG character built from layers (body, wing, head, eye, eyelid, beak, antenna). Actions: enter, look, lean, point, wow, listen. It stands in a lane the scene layout keeps free; when an action names an element, head, eye and wing turn towards that element's real position on screen. The browser check verifies in every scene that it covers no value, caption or source button.

## Short mode and dropped files

**Short ("Highlights")** is the default on the upload page; **Full lesson** is the other choice. A short is 45 to 90 seconds: a hook (a question the source answers), the most important points, one takeaway, in 5 to 7 sparse scenes. It is a normal `paperscenes.lesson` v2 file and plays in the same player. All of its scenes are in the intro and it has no chapters; `provenance.mode` and `lesson.meta.mode` say `"short"` (files without the field are full lessons).

What differs from the full pipeline (`src/lib/short.ts`, `buildShortStoryboard` in `src/lib/generate.ts`):

- The storyboard is offered only the most important inventory entries (at most 24: quote found in the source, results and conclusions first, numbers preferred), not the whole inventory.
- A short is only ever cut, never padded. A sentence that fails the number check or the claim check is removed when its scene still stands without it; otherwise the scene is rewritten once (at most 2 rewrites per short, by the strong model) and compared with its passages again; a point that still fails is left out. Every cut is listed in the lesson's notes.
- If the checks leave less than about 45 seconds, the storyboard is written once more with the failed sentences as feedback, and the longer result is kept.
- No figure step. After narration the recorded length is measured, and a short over 90 seconds loses sentences or a point.

**Files** can be dropped anywhere on the upload page or chosen in the box: `.pdf`, `.docx`, `.pptx`, `.txt`, `.md`. Word and PowerPoint files are read without any extra package (`src/lib/zip.ts`, `src/lib/office.ts`): a Word file becomes one block per paragraph, with headings attached to the paragraph after them; a PowerPoint file becomes one block per slide, so "§4" is slide 4. Only text is read: no pictures, charts, speaker notes, comments, headers or footers. A wrong kind of file, a damaged archive, a password-protected file and a file with too little text each get their own message.

`npm run check:inputs` tests the readers and the short-mode rules offline (no model, no server). `npm run check:shorts -- <lesson id>` (or `-- --all`) measures finished shorts in the store: scene count, length, sources, number check, recorded mode.

## Export a video

A stored lesson can be exported as an MP4 for TikTok, Reels or Shorts: 1080 x 1920 (or 1920 x 1080), H.264 + AAC, 30 fps, with the narration, large captions, a source label for every sentence ("Source: p. 3"), an "AI-generated" label and an end card that names the source. No model is called.

```bash
npm run build && npm start                       # the exporter draws the frames with the running app
node scripts/export-video.mjs <lessonId> [--format vertical|landscape] [--max-seconds N] [--base http://localhost:3000]
node scripts/check-export.mjs <lessonId> [same options]   # streams, frame count, length, sound and captions on one clock
```

The result is `.data/lessons/<id>/export/<format>.mp4` with `caption.txt` (post text) beside it; in the app, the player of a stored lesson has **Export video** with progress and download. `--max-seconds` ends the video after the last sentence that fits (file `<format>-<N>s.mp4`), `--from-scene <sceneId>` starts later. Needs ffmpeg and a lesson with recorded narration; a lesson without it is refused instead of exported silent. The bundled example is not in the lesson store and has no export.

How it works: `/lesson/<id>/render` shows the stage alone, built from the same scene components and the same state derivation as the player. The exporter steps that page frame by frame in headless Chromium (several pages in parallel), moves every CSS transition and animation to the frame's time, and pipes a screenshot of each frame into ffmpeg; the sound track is put together from the per-scene recordings at the same scene start times. Text is kept out of the areas the apps cover with their own interface (top 130, bottom 484, left 44, right 140 of 1080 x 1920 pixels; third-party guidance, not an official figure).

### Review a video before publishing it

```bash
node scripts/video-quality.mjs <lessonId>
node scripts/video-quality.mjs <lessonId> --base http://127.0.0.1:3000 --frames-dir .data/review-v1
```

The first command is offline and reads `lesson.json` from the lesson store (set `LESSON_STORE_DIR` to select another store). The second also samples real browser frames on the running local app, saves PNGs in a new directory, and adds layout findings to the same JSON report. Use `--format landscape` for a separate 16:9 review. Exit codes: `0` no blocking findings, `1` findings to fix, `2` tool/input error. Warnings are editing suggestions, not quality scores; frames are sampled, not exhaustive. No model or new dependency is required.

For an agent: read `findings[]` in `paperscenes.video-quality@1`, prioritise errors, and improve only the named scene using its cited source. Compare the same frames from two revisions, then export and run `check-export` for real audio/video synchronisation. Review one pass on a phone: can a viewer read the main claim and say what was compared, by how much, and under which conditions? Keep only changes that improve the answer without adding claims.

### Edit only the picture of one scene

```bash
npm run --silent video:scene -- inspect <lessonId> <sceneId>
npm run --silent video:scene -- apply <lessonId> patch.json --out variant.json
node scripts/video-quality.mjs <lessonId> --scene <sceneId> --base http://127.0.0.1:3000 --frames-dir before
node scripts/video-quality.mjs <lessonId> --scene <sceneId> --visual-patch patch.json --base http://127.0.0.1:3000 --frames-dir after
```

The inspector returns the scene, its cited passages and a `suggestedPatch` when it finds a valid comparison. Copy that object to `patch.json`. The patch binds a lesson ID, a scene ID and the base revision to `visual: { "type": "comparison", "refs": ["R-01", "R-02"] }`. You may set `contextRef` to one of those references if it contains a short, verbatim measurement condition. The tool derives groups, values and labels from the cited evidence, requires separate timed cues, and rejects stale or invalid patches. The first supported edit turns a statement, points or an existing comparison into a two-measurement comparison.

`apply` writes a new file (never overwrites one) and preserves the cues, caption timings, audio references and other scenes. The two preview commands capture the same three times: entry, a moment during the last line, and exit. They use the existing local render server; the patched preview serves its variant only inside the browser session. No model call, audio generation or full export is needed. Keep the original as the baseline. The variant is a review artifact, not an in-place edit or a publish step.

The picture must carry evidence, not duplicate the transcript. Two cited scalars get large portrait tiles; ranges keep the shared axis. The assembler checks the group label, plotted endpoints and units against matched inventory quotes. Counts such as “31 of 40 pairs” retain their total and only share an axis with counts out of the same total. An ambiguous comparison falls back to cited text cards. The export renderer also checks older lesson files; already generated MP4s are unchanged until re-exported. This is a conservative text check, not a guarantee of semantic accuracy. Complex notation, ambiguous quotes or values only visible in an image may need a source figure or editorial review.

## Confirmed Bedrock capabilities

Checked on 2026-11-21 with the team's key against the AWS documentation ([API keys](https://docs.aws.amazon.com/bedrock/latest/userguide/api-keys-use.html), [regions](https://docs.aws.amazon.com/bedrock/latest/userguide/models-region-compatibility.html), [API compatibility](https://docs.aws.amazon.com/bedrock/latest/userguide/models-api-compatibility.html), [structured output](https://docs.aws.amazon.com/bedrock/latest/userguide/structured-output.html)) and with small live calls.

| Capability | Result with this key |
|---|---|
| List models and inference profiles (`bedrock.<region>.amazonaws.com`) | Works in us-east-1, us-west-2, eu-central-1 |
| Converse / ConverseStream / InvokeModel (`bedrock-runtime`) | **Not usable**: every model, including Nova and all Claude profiles, answers `400 Operation not allowed` in all four regions tried |
| Claude models on the OpenAI-compatible endpoint (`bedrock-mantle`) | **Not usable**: "not available for this account" |
| Chat Completions on `bedrock-mantle` with open-weight models | **Works** (Mistral, Qwen, DeepSeek, GLM, Kimi, Gemma, gpt-oss and others) |
| Structured output (`response_format: json_schema`, strict) | Works with Mistral Large 3, GLM 4.7 Flash, GLM 5, Qwen3, DeepSeek V3.2, Kimi K2.5, gpt-oss-120b. Not with gpt-oss-20b, Minimax M2.5, Palmyra Vision |
| Streaming (server-sent events, with token usage) | Works with every model tried |
| Image input | Works with Mistral Large 3, Qwen3 VL 235B, Kimi K2.5, Gemma 3 27B. Used to describe original figures and tables. Bounding boxes from Mistral Large 3, Qwen3 VL and Kimi K2.5 were too imprecise to crop a table, so positions come from the PDF text layer instead |
| Speech output | **Not available**: Nova Sonic needs bidirectional streaming, which Bedrock API keys do not support. Narration uses the local Piper voice |
| Image generation | **Not available**: no active text-to-image model in the regions checked (Nova Canvas and the Stability generators are legacy; the active Stability models only edit images). Illustrations are drawn in code and labelled |

**Why these models.** The minimal configuration is one model, Mistral Large 3, for every role; it completes the whole pipeline. A second model was added because it measurably helps: on a 9-page paper the inventory with GLM 4.7 Flash took 68 s instead of 185 s, cost about a quarter, and 94 % instead of 86 % of its quotes were found word for word in the PDF (`node scripts/bench-models.mjs`). Smaller models failed that step (Ministral 14B: no quote found; gpt-oss-120b: invalid JSON on the long source). Mistral Large 3 stays for storyboard, narration and the claim check, and doubles as the vision model, so two models cover four tasks.

## What was run end to end

Run on 2026-11-21 on Windows 11, Node 24, production build, headless Chromium (desktop 1440 x 900 and phone 390 x 844). All three inputs went through their real input path.

| Input | Path | Result |
|---|---|---|
| Urban trees paper (Schwaab et al. 2021) | bundled demo, offline | 17 scenes, 9.9 min, recorded voice. New staging with the duck. 0 requests to `/api` while playing. `verify:demo`: 222/222 quotes found. |
| Second PDF: Hinton et al., "Distilling the Knowledge in a Neural Network" (arXiv 1503.02531, 9 pages) | upload page, Bedrock | 23 scenes in 5 chapters, 7.7 min, recorded voice. 176 inventory entries, 167 quotes found in the PDF. 18 scenes passed the check, 3 were regenerated automatically, 2 stayed flagged. 2 original tables cropped from the PDF. 13 model calls, about 7 minutes wall time, estimated $0.04. |
| Pasted text: the backend's `sample_dna.txt` (5 paragraphs) | upload page, Bedrock | 9 scenes in 4 chapters, 2.7 min, recorded voice. 30 inventory entries, 28 quotes found. A different scene sequence (milestones and statements, no methods chapter). 5 model calls, about 1.5 minutes, estimated $0.01. |

Models used: `zai.glm-4.7-flash` (inventory, scene repair, single-scene regeneration) and `mistral.mistral-large-3-675b-instruct` (storyboard, claim check, figure descriptions), both through Bedrock.

Checked by hand against the original for the second PDF: the scene "67 / 146 / 74 test errors" matches page 4 of the paper; the chart 58.9 % / 44.5 % / 57.0 % frame accuracy matches Table 5 on page 8; the cropped table on page 6 (JFT clusters) is the complete table and its description lists the classes printed in it. The automatic check flagged a chart value ("~100") that the paper does not state, which is the check working as intended.

Automated checks, all passing:

| Check | Result |
|---|---|
| `npm run build`, `npx tsc --noEmit` | clean |
| `npm run check:tutor` | Offline checks of the tutor on the demo lesson: why-question, evidence, simpler, open question, ambiguous reference, resume command. |
| `npm run e2e:tutor -- http://localhost:3000` | Browser check of the tutor on desktop and phone: pause on ask, answer with page, evidence opens without moving the position, resume, reload restores position and conversation, clear data. |
| `npm run verify:demo` | 222/222 quotes, coverage clean in both directions |
| `npm run e2e` with `--errors` | 65/65: jury walkthrough on desktop and phone, the staged intro (street, orbit, measured surfaces), duck pose and target per sentence, identical state after seek and pace change, pause on source and continue at the same moment, keyboard incl. Escape, reduced motion, the duck covers nothing in any of the 17 scenes, broken PDF, scanned PDF, too-short text |
| `npm run e2e` with `--upload` and `--text` | 37/37: both generations; stored as `paperscenes.lesson` v2; reopened in a fresh browser with identical scenes, assets, timings and actions and no generating request; scene jump and seek; one scene regenerated with the other scenes and their audio untouched; text run stopped during the storyboard step and resumed without repeating the inventory call; text sources shown as marked paragraphs |
| `node scripts/check-upload-failures.mjs` | 9/9: missing key, Bedrock rate limit (2 retries, then stop, run kept), model not enabled, content refusal (run ended and removed), Anthropic rate limit, server limit |
| `node scripts/check-audio.mjs` | demo and both generated lessons: audio length equals scene length, speech in every caption interval, silence between sentences |
| `python run_tests.py` (backend) | 17/17 after the merge (on Windows set `PYTHONUTF8=1`, otherwise printing the check mark fails) |

**Listening test: not done.** This environment has no audio output, so nobody heard the narration in this round. The technical playback test above shows that the audio decodes, has the right length and carries speech exactly where the captions say; it cannot judge pronunciation or how pleasant the voice is. Please listen to at least the intro and one generated scene before the demo.

**Not tested:** a real phone (only the phone viewport), other browsers than Chromium, two-column PDFs through the upload path, and the direct Anthropic provider end to end in this round (it was run end to end in the first round; here only its error path).

**Reproduce with the same pipeline:** `node scripts/generate.mjs <file.pdf or file.txt>` or the upload page. Model output varies between runs, so scene counts and wording differ; the checks, the format and the player stay the same.

## How coverage is made checkable

`src/lib/types.ts` defines the model: **inventory, then storyboard**.

1. The inventory lists what the source contains: per entry a stable ID, type, location, verbatim quote, plain statement, and for numbers the unit, what it measures and the comparison conditions, plus the planned place and a check status.
2. The storyboard only references inventory IDs. Each spoken sentence carries its sources, or is marked as a transition without content.
3. `src/lib/coverage.ts` checks both directions at runtime: every entry has a reachable place (intro, chapter, detail view, appendix), every sentence has a source.

For the demo paper, `npm run verify:demo` compares the inventory with the PDF: every quote must be found on its stated page, coverage must hold in both directions, on-screen numbers must match the cited entry, each page needs entries, and the reference list must be continuous. The app shows **Fully checked** only when that report passed. Current state: 222 of 222 quotes found, 224 entries on 11 pages, 1 entry marked unclear, 4 external supplements not checked.

Generated lessons never get that label. They show "Automatically generated", the number of quotes that were found in the source, per entry one of: quote found (automatic), unclear, not checked, external, and per scene whether it passed the automatic check.

## Limits

Enforced on the server (`src/lib/limits.ts`), chosen for a hackathon demo:

| Limit | Value |
|---|---|
| PDF | 15 MB, 40 pages, 200,000 characters of text; longer papers are rejected, nothing is cut silently |
| Minimum text in a PDF | 1,500 characters, otherwise "scan without text layer" |
| Pasted text, `.txt`, `.md` | 400 to 60,000 characters, 200 paragraphs |
| Word, PowerPoint | 15 MB, 400 to 200,000 characters of text, 800 paragraphs or 80 slides |
| Short mode | 5 to 7 scenes, 45 to 90 seconds, at most 2 scene rewrites, no figures |
| Generations | 4 per visitor per 10 minutes (a regenerated scene counts as one), 2 at the same time per server |
| One model call | 5 minutes; at most 2 retries after a rate limit, a 5xx or a dropped connection; one retry after a malformed answer |
| Repairs | one automatic repair per failing scene, at most 10 per lesson |
| Figures | 2 per lesson |

A refusal by a content filter ends the run at once and removes it. A rate limit, missing model access or a missing key is shown with its reason; the run is kept and can be resumed. Rate limits are held in memory and reset when the server restarts. Stored lessons can be opened by anyone who knows their random ID; there are no accounts in the web app (the backend has them).

## Scripts

| Command | Purpose |
|---|---|
| `npm run check:tutor` | Offline checks of the tutor on the demo lesson: why-question, evidence, simpler, open question, ambiguous reference, resume command. |
| `npm run e2e:tutor -- http://localhost:3000` | Browser check of the tutor on desktop and phone: pause on ask, answer with page, evidence opens without moving the position, resume, reload restores position and conversation, clear data. |
| `npm run verify:demo` | Checks the demo lesson against the PDF and writes the verification report. |
| `npm run e2e -- http://localhost:3000` | Browser check of the jury walkthrough on desktop and phone, keyboard, reduced motion, mascot placement (Playwright). `--errors <dir>` adds broken and scanned PDFs. `--upload <pdf>` and `--text <file>` run real generations and check storing, reopening, interrupting, resuming and regenerating (costs tokens). |
| `node scripts/generate.mjs <pdf, docx, pptx, txt or md>` | Runs the same pipeline from the command line and stores the lesson. `--mode short` makes the 45 to 90 second highlights (default: full lesson). `--resume <id>` continues a run. |
| `npm run check:inputs` | Offline checks of the Word, PowerPoint and text readers (including damaged, protected and empty files) and of the short-mode rules. `node scripts/make-fixtures.mjs` rebuilds the two fixtures in `tests/fixtures/`. |
| `npm run check:shorts -- <lesson id> \| --all` | Measures finished shorts in the lesson store against the short-mode bounds and the source checks. |
| `node scripts/bench-models.mjs <pdf or txt> <model> ...` | Compares models on the inventory step: time, tokens, cost, share of quotes found. |
| `node scripts/check-upload-failures.mjs <txt>` | Missing key, Bedrock rate limit, missing model access, content refusal, Anthropic rate limit, the server's own limit; against a local mock provider. Needs `npm run build` first. |
| `node scripts/shots.mjs <url> <lesson path> <dir>` | Screenshots of every scene, for a visual check. |
| `npm run narration` | Rebuilds the demo narration with Piper and ffmpeg. `-- --only <scene ids>` re-records single scenes. |

Playwright uses its own Chromium if installed (`npx playwright install chromium`), otherwise an installed Edge or Chrome.

## What still needs a person

- **Statements.** The automatic checks prove that a quote exists and that numbers match it; the claim check is a model's judgement. Neither replaces reading the generated sentences against the original once.
- **Figures and tables.** At most two originals are shown. They are found through their caption or header row in the text layer, which works for single-column pages with clear spacing and can fail or include neighbouring text elsewhere. The descriptions come from a vision model and cite the figure itself. Numbers that only appear inside an image are not used.
- **Scans** are rejected (no OCR). Pages without text in an otherwise readable PDF are listed as unreadable and not covered.
- **Voice.** Recorded narration needs Piper on the server. Pronunciation of formulas, units and names was not reviewed.
- **Layout.** Two-column PDFs with unusual reading order, hyphenation or formulas can make a quote unfindable; it is then shown as "unclear" with its page.
- **Other languages.** Prompts, voice and UI are English.

## How the two parts fit together

The backend on `main` and the web app were built at the same time. The web app now follows the backend where both solve the same problem:

- **Same Bedrock configuration.** `AWS_BEARER_TOKEN_BEDROCK`, `AWS_REGION` and `BEDROCK_MODEL_ID` mean the same in both. Note for the backend: its default goes through Converse (`bedrock-runtime`), which this key cannot use (see the table above); the web app uses the `bedrock-mantle` endpoint instead.
- **Text sources.** The backend's `sample_dna.txt` is the text input of the web app's tests, and its "§n heading" layout is what the paragraph splitter and the "§3" labels follow.
- **Verification.** The backend's rule "no number may be introduced by a script" is the deterministic scene check here, and its model-judged comparison of a script with the outline is the claim check.
- **Provenance.** As in the backend, every lesson records source hash, model, prompt version and schema version.
- **Labelled analogies.** The backend's rule to label an analogy as an analogy became the statement scene's "Analogy, not a finding" tag.

Not connected yet: the web app does not call the backend's API (accounts, tutor, practice), and the backend does not produce this lesson format. The natural next step is a backend endpoint that returns a `paperscenes.lesson` file, or the web app's pipeline behind the backend's job queue.

## Sources and licences

- Demo paper: Schwaab, J., Meier, R., Mussetti, G., Seneviratne, S., Bürgi, C. & Davin, E. L. *The role of urban trees in reducing land surface temperatures in European cities.* Nat. Commun. 12, 6763 (2021). https://doi.org/10.1038/s41467-021-26768-w. Open access under CC BY 4.0. The PDF in `public/demo/` is unchanged; the figures `public/demo/fig*.png` are cropped from it.
- Narration: generated offline with Piper and the `en_US-ljspeech-high` voice (trained on the public-domain LJ Speech data set).
- The robot duck, the city and satellite illustration, the region layout and the day timeline are our own drawings; illustrations are labelled as such in the player.
- `AGENTS.md` is written by `next dev` (Next.js 16 notes for coding agents).

---

## Backend (Lumina Learn)

The text of this section is the backend's own README from `main`, unchanged except for heading levels.


A modular learning-video backend: upload a resource → generate a narrated visual
lesson with selectable styles → ask source-grounded questions → practise →
resume. The connected loop (interrupt, reshape, practise the exact confusion,
continue) is the product; this is the maintainable foundation under it.

- **Architecture & milestones:** [ARCHITECTURE.md](ARCHITECTURE.md)
- **Backlog:** [BACKLOG.md](BACKLOG.md)
- **Frontend:** the accessible player/tutor client (published separately as the
  Lumina Learn artifact). M2 wires it to this API — see backlog.

### Why it's shaped this way
- **Modular monolith + in-process worker.** No external broker/microservices
  until load justifies them.
- **Core on the standard library.** Persistence (SQLite), the job queue, and the
  tutor run with zero third-party deps, so the whole suite runs and passes
  offline. Heavy tools (Docling, Kokoro, boto3) sit behind provider interfaces.
- **Facts separate from presentation.** One factual outline per source; every
  narrator script is verified against it before use.
- **Provenance on every lesson:** source hash, model, prompt version, schema
  version, settings.

### Run with zero installs (offline, mock model)
```bash
cd ~/lumina-pipeline
python run_tests.py                 # 17 tests, stdlib only
python cli.py sample_dna.txt        # upload → generate → verify → tutor, end to end
```

### Run the API
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

#### Environment variables
| Var | Purpose |
|---|---|
| `MODEL` | `mock` (default, offline) or `bedrock` |
| `AWS_BEARER_TOKEN_BEDROCK` | Bedrock key — **rotate the one pasted in chat**; server-side only |
| `BEDROCK_MODEL_ID`, `AWS_REGION` | model + region |
| `PARSER` | `auto` (default) / `pypdf` / `docling` / `text` |
| `SPEECH` | `fallback` (default) / `kokoro` |
| `LUMINA_DB`, `LUMINA_STORAGE` | sqlite path, upload dir |
| `ALLOWED_ORIGINS` | CORS allowlist for the frontend |

### API
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

### Checks run (offline, reported honestly)
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

### Security posture
Ownership enforced in services; tutor retrieval scoped to the owner. Document
text is treated as untrusted data, never instructions; no model-written code is
executed. Secrets stay server-side. Deletion cascades and the response says so.
A file format is only advertised once it actually parses.

### Attribution
- Docling — https://github.com/docling-project/docling (MIT; model licences vary)
- Kokoro-82M — https://huggingface.co/hexgrad/Kokoro-82M (Apache-2.0)
- pypdf — https://github.com/py-pdf/pypdf (BSD)
- Chatterbox — https://github.com/resemble-ai/chatterbox (evaluate; check terms)
- Paper2Video/PaperTalker — https://github.com/showlab/Paper2Video (evaluated; not bundled)
- Open Notebook — https://github.com/lfnovo/open-notebook (patterns only; not forked)

Narrator identities are original. Celebrity references describe delivery only;
no narrator is presented as a real person.

### Demo script (the connected loop)
Upload short PDF → generate lesson → pick Traditional Explainer → switch to Spill
the Tea mid-lesson (same facts) → pause, ask a grounded question → answer a
challenge wrong → get a different explanation + a fresh question → retry → resume
with progress saved.
