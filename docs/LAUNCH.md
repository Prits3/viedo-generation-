# PaperScenes: positioning, demo and launch plan

Working document for the hackathon team. Written 2026-11-22. Facts come from a web research pass on the same day; each has its source. Items marked UNVERIFIED rest on secondary sources or on inference and must not be stated as fact on stage.

## 1. What we are up against

NotebookLM was renamed Gemini Notebook in July 2026 and already makes a roughly 60 second "Short" video from a document, alongside longer Explainer and Cinematic formats, in about 79 languages, with MP4 download ([Google blog](https://blog.google/innovation-and-ai/products/gemini-notebook/notebooklm-gemini-notebook/), [video help page](https://support.google.com/notebooklm/answer/16454555)). It accepts PDF, DOCX, PPTX, TXT, MD and more ([sources help page](https://support.google.com/notebooklm/answer/16215270)).

So "drop a file, get a short video" is not new. We do not pitch that.

What Google's own help page says about its videos:

- They "may contain inaccuracies or audio glitches".
- Generation can take "more than 30 minutes".
- The viewer gets speed, scrub and full screen. The page describes no citations inside the video and no editing of a finished video; steering happens before rendering only.

UNVERIFIED: that their videos really show no citations. This is inferred from the help page. Someone on the team must generate one Short from our demo PDF and look before we say it on stage.

Other tools in the space: PDF-to-brainrot apps (gameplay background, no checking), study suites such as Turbo AI and StudyFetch (notes and quizzes, video is not the product), Golpo (whiteboard explainers, from about $40 a month, UNVERIFIED), and two research projects, Paper2Video ([arXiv 2510.05096](https://arxiv.org/abs/2510.05096)) and PaperTok ([arXiv 2601.18218](https://arxiv.org/abs/2601.18218)).

## 2. Positioning

**One line:** PaperScenes makes the short video you can check.

**Why it holds:** every spoken sentence carries its source, on screen while it plays and one click away in the player; every number spoken or shown is compared with the cited passage by code, not by a model; a scene that fails is repaired or visibly flagged.

Four things we can show in three minutes, in order of strength:

| # | Differentiator | How it shows in the demo |
|---|---|---|
| 1 | Click to source | Click a sentence in the player: the original page opens with the quote highlighted. In the exported video the source chip ("p. 3") stays on screen. |
| 2 | Checked numbers | The check badge per scene, and one prepared case where the check flagged a value the paper does not state (the "~100" case from the Hinton run in the README). |
| 3 | Time to video | Start a timer when the file is dropped. Only claim this once we have measured it on the demo machine; see section 6. |
| 4 | Fix one scene | "Regenerate this scene" rewrites one scene and re-records only its audio. Google allows notes before rendering only. |

What we leave out of the pitch: the local voice, open-weight models on Bedrock, and the mascot as a reason to switch. They are cost and character, not reasons a student changes tools. The pace, caption and motion controls are features; "built for neurodivergent learners" is a claim we cannot back with evidence yet, so we say "you control pace, captions and motion".

## 3. Product shape for the launch

| Piece | State | Owner branch |
|---|---|---|
| Full lesson from PDF or text, with source view | working | `paperscenes-prototype` |
| Short mode: hook, 3 to 5 points, takeaway, 45 to 90 s | working (9 of the last 11 stored shorts pass `check:shorts`; a failing one is flagged, not hidden) | `launch` |
| Drop PDF, TXT, MD, DOCX, PPTX | working (`check:inputs` all pass) | `launch` |
| Vertical MP4 export 1080x1920 with captions, source chip, end card, post text | working (`check:export` all pass on 3 shorts) | `launch` |
| Three example shorts with MP4, read-only, for a deployment without keys or binaries | working | `launch` |
| German output and voice | stretch | `feat/shorts` |
| Tutor and practice (Python backend) | exists on `main` / `integration`, not connected to this branch | teammate |

Gaps we know and have not closed: no accounts in the web app (a stored lesson is readable by anyone with its ID), no OCR for scans, rate limits are in memory, two-column PDFs are untested through upload, and nobody has listened to the generated voice end to end.

## 4. Three-minute demo

1. **0:00 The problem (20 s).** "AI summaries are fast and you cannot tell which sentence is wrong. Google's own help page says its videos may contain inaccuracies."
2. **0:20 Drop a file (15 s).** Drop a DOCX or PDF on the page, mode Short. Timer visible.
3. **0:35 While it runs (40 s).** Open a finished short of the same kind. Play 15 seconds. Click a number: the source page opens with the sentence highlighted. Close, playback continues at the same moment.
4. **1:15 The check (30 s).** Show the scene that was flagged and why. "A model wrote the script. Code checked the numbers."
5. **1:45 Export (30 s).** Show the exported MP4 on a phone: captions, source chip, AI label, end card with attribution. Show the generated post text.
6. **2:15 The fresh result (25 s).** Back to the upload: the new short is ready. State the measured time.
7. **2:40 Close (20 s).** Who it is for, what is next (accounts, tutor, posting API), the ask.

Fallbacks: a pre-rendered MP4 on the phone and a stored lesson that opens with no model call, in case the network or the model provider fails during the demo.

## 5. Getting it onto TikTok

**No direct posting this week.** An app that has not passed TikTok's audit can only post privately, to private accounts, for at most five users a day; the audit also demands a specific posting screen and forbids logos added by the app ([content sharing guidelines](https://developers.tiktok.com/doc/content-sharing-guidelines), [API start page](https://developers.tiktok.com/doc/content-posting-api-get-started)). Audit duration is not published. We ship MP4 download plus a ready post text and upload by hand. Posting through the API is roadmap.

**Format.** 1080x1920, 9:16, H.264 MP4 works for TikTok, Reels and Shorts. YouTube Shorts allows up to 3 minutes ([YouTube help](https://support.google.com/youtube/answer/15424877)). Text stays out of the top 130 px, bottom 484 px and right 140 px (third-party figures from ad guidance, UNVERIFIED as an organic spec).

**Labelling.** TikTok requires a label for AI content that shows realistic scenes or people ([integrity policy](https://www.tiktok.com/safety/en/policies-and-engagement/integrity-authenticity)); our drawn scenes are not that, but we label every export as AI-generated anyway and switch on TikTok's own AI label when uploading. Honest by default is part of the product.

**Length.** A Buffer analysis of 2.7 million Reels found little difference in reach below 90 seconds ([Buffer](https://buffer.com/resources/instagram-reels-length)). We found no solid data on hook length for educational clips, so we test instead of quoting a rule.

**Rights.** Only publish videos of sources we may adapt. CC BY allows adaptation with credit, a licence link and a note of changes ([CC BY 4.0](https://creativecommons.org/licenses/by/4.0/deed.en)); "no derivatives" licences do not. Lecture slides and textbook chapters usually need permission. Product default: private study; publishing is the user's decision and the end card names the source. This is not legal advice.

### What comparable apps did

Coconote reached $1M annual revenue in four months without paid ads, through a handful of small creators (5 to 10 thousand followers) posting "this solved my problem" content; of about 30 creators tried, 3 mattered. Its PDF-to-brainrot side product drew 41 million views and almost no payers and was shut down ([founder interview, Sub Club](https://subclub.com/episode/bootstrapped-to-67m-arr-and-an-exit-to-quizlet-in-2-years-brett-bauman-zack-hargett-coconote)).

What we take from that: show a real study problem being solved, post often and cheaply, do not present the product as a toy.

### First two weeks

Account: one product account, our own faces or hands where possible, the generated shorts as the content inside.

| Series | What a post is | Why |
|---|---|---|
| "Paper in 60 seconds" | One open-access (CC BY) paper per post, exported straight from the product, source on the end card | The product is the content; every post is a demo |
| "Check the AI" | Screen recording: click a sentence, the source opens; or the check catching a wrong number | Shows the one thing competitors do not |
| "Same PDF, two tools" | Our short next to a Gemini Notebook short of the same paper, source view open | Direct comparison; only after we verified the citation claim |
| "Exam week" | Drop your own notes (our own notes, not a lecturer's slides), get the short, study from it | The problem-solution format that converted for Coconote |

Rhythm: one post a day for 14 days, three hooks tested per series, keep what holds viewers past the first seconds. Measure views, completion rate, profile visits and sign-ups from the link in bio. Decide after 14 days with the numbers, not before.

Hook drafts to test:

- "This AI summary shows you where every sentence comes from."
- "I dropped a 12-page paper. This is what came out, and yes, you can check it."
- "The AI got a number wrong. Watch the app catch it."

## 6. Numbers we may state

Fill in from measured runs on the demo machine; until then say nothing about speed.

| Claim | Value | Evidence |
|---|---|---|
| Short from a 5-paragraph text | to be measured end to end (model calls alone: 39 s in one run) | `check:shorts` output |
| Short from a 9-page PDF | to be measured | |
| MP4 export of a 50 to 65 s short | 20 to 31 s on the owner's laptop (MSI Stealth A16, 4 render pages), 2026-11-22 | `export-video.mjs` output |
| Cost per short | about $0.008 in one run (estimate from list prices) | provenance in the lesson file |
| Full lesson, 9-page PDF | about 7 min, about $0.04 | README, run of 2026-11-21 |

## 7. Hosting for the demo

The pipeline needs Piper, ffmpeg and headless Chromium and runs for minutes. That fits one Docker container on a VPS (`next start` behind Caddy), not serverless: Vercel limits a function to 300 s on Hobby and 250 MB per bundle ([limits](https://vercel.com/docs/functions/limitations)), Cloudflare Workers cannot run binaries ([docs](https://developers.cloudflare.com/workers/runtime-apis/nodejs/)). Before it goes public it needs: a generation cap per visitor that survives restarts, a spending cap on the model key, and deletion of uploads. Not built yet.

**What we do for the launch (2026-11-22):** the public site runs on Vercel (domain learnlayla.xyz) as a showcase: the example lesson and three example shorts with their MP4s, all without model calls. The start page lists only the examples there, so visitors never see each other's lessons. Generation on Vercel stays off unless the team sets a Bedrock key and a spending limit; the live generation in the demo runs on the laptop (`npm start`), where Piper and the MP4 export work. See README, "Deploy on Vercel".

User documents are sent to the model provider (Amazon Bedrock). AWS states that model providers have no access to prompts and completions ([data protection](https://docs.aws.amazon.com/bedrock/latest/userguide/data-protection.html)). The upload page should say this in one sentence.

## 8. Open decisions

1. Submission deadline and judging criteria (decides what we cut).
2. Merge plan with `integration`: it is based on the old prototype and diverges from this branch in 88 files.
3. Product name: PaperScenes (web app) or Lumina Learn (backend). One name before anything is posted.
4. Public demo on the VPS, or local with a tunnel.
5. Language of the launch content: English, German or both.
