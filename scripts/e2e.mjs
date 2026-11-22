// Browser check of the jury flow on desktop and phone (Playwright, headless Chromium).
//   node scripts/e2e.mjs [baseUrl] [--errors <dir>] [--upload <pdf>] [--text <file.txt>] [--only flow|extras|live]
// --errors  uploads broken.pdf and scan.pdf from <dir> and expects the error states.
// --upload  runs one real PDF generation through the upload page, then checks the stored lesson:
//           reopen without model calls, scene jump, regenerate one scene. Costs tokens.
// --text    pastes the text file, interrupts the run, resumes it, and checks the text lesson. Costs tokens.
// Screenshots go to .cache/e2e/.
import { mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { launchBrowser } from "./browser.mjs";

const args = process.argv.slice(2);
const base = args.find((a) => a.startsWith("http")) ?? "http://localhost:3000";
const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const uploadPdf = flag("--upload");
const textFile = flag("--text");
const errorsDir = flag("--errors");
const only = flag("--only");
const OUT = ".cache/e2e";
mkdirSync(OUT, { recursive: true });

let failed = 0;
const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
}

const browser = await launchBrowser();

async function newPage(opts) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => m.type() === "error" && !/favicon|404/.test(m.text()) && errors.push(m.text()));
  return { ctx, page, errors };
}

const sceneId = (page) => page.locator(".stage .scene").getAttribute("data-scene");
const seekValue = async (page) => Number(await page.locator(".seek input").inputValue());
const isPlaying = async (page) => (await page.locator('[data-action="play"]').getAttribute("aria-label")) === "Pause";
const inViewport = (page, selector) =>
  page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.bottom > 0 && r.top < window.innerHeight && r.width > 0 && r.height > 0;
  }, selector);
const noOverflow = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

/** Highlight exists and is scrolled into the visible part of the PDF panel. */
async function highlightVisible(page) {
  await page.waitForSelector('.pdf__scroll[data-state="ready"]', { timeout: 30000 });
  return page.evaluate(() => {
    const box = document.querySelector(".pdf__scroll");
    const hl = document.querySelector(".pdf__hl, .pdf__region");
    if (!box || !hl) return { count: 0, visible: false };
    const b = box.getBoundingClientRect();
    const h = hl.getBoundingClientRect();
    return { count: document.querySelectorAll(".pdf__hl").length, visible: h.top >= b.top - 2 && h.bottom <= b.bottom + 2 && h.left >= b.left - 2 && h.right <= b.right + 2 && h.top >= 0 && h.bottom <= window.innerHeight };
  });
}

/** What the stage shows right now: sentence, element in focus, camera shot, mascot pose and target. */
const stageState = (page) =>
  page.evaluate(() => {
    const scene = document.querySelector(".stage .scene");
    const duck = document.querySelector(".stage .dk");
    const mascot = document.querySelector(".stage .mascot");
    return {
      scene: scene?.getAttribute("data-scene"),
      step: scene?.getAttribute("data-step"),
      shot: scene?.getAttribute("data-shot"),
      pose: duck?.getAttribute("data-pose"),
      target: mascot?.getAttribute("data-mascot-target") ?? "",
      focus: [...document.querySelectorAll(".stage .scene .is-focus")].map((e) => e.getAttribute("data-key")).filter(Boolean).join(","),
      caption: document.querySelector(".captions p")?.textContent ?? "",
    };
  });

/** Elements the mascot must never cover. Returns the ones it overlaps. */
const mascotOverlaps = (page) =>
  page.evaluate(() => {
    const m = document.querySelector(".stage .mascot svg")?.getBoundingClientRect();
    if (!m || m.width === 0) return ["mascot missing"];
    const hit = [];
    for (const sel of [".cmp__value", ".cmp__bar", ".cmp__label", ".stage .source-tag", ".captions", ".points__item button", ".mstones__item button", ".flow__step", ".fig__frame", ".fig__list button", ".scene__question", ".stmt__idea p", ".qcard__headline", ".heldbar", ".tline__facts li", ".rmap__grid"]) {
      for (const el of document.querySelectorAll(sel)) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || getComputedStyle(el).opacity === "0") continue;
        const overlap = Math.min(m.right, r.right) - Math.max(m.left, r.left) > 2 && Math.min(m.bottom, r.bottom) - Math.max(m.top, r.top) > 2;
        if (overlap) hit.push(sel);
      }
    }
    return [...new Set(hit)];
  });

async function juryFlow(label, opts) {
  const { ctx, page, errors } = await newPage(opts);
  const shot = (n) => page.screenshot({ path: `${OUT}/${label}-${n}.png` });
  const mobile = Boolean(opts.isMobile);

  // Start page: two clear actions.
  await page.goto(base + "/", { waitUntil: "networkidle" });
  check(`${label}: start page shows "Try an example" and "Upload a PDF"`, (await page.locator('[data-action="try-example"]').isVisible()) && (await page.locator('[data-action="upload"]').isVisible()));
  check(`${label}: start page has no horizontal overflow`, await noOverflow(page));
  await shot("01-home");

  // 1. Open the example and start the animated intro.
  await page.click('[data-action="try-example"]');
  await page.waitForSelector(".bigplay");
  check(`${label}: example opens the player directly`, page.url().endsWith("/lesson/demo") && (await sceneId(page)) === "intro-city");
  await page.click(".bigplay");
  await page.waitForFunction(() => Number(document.querySelector(".seek input")?.value) > 1.2, null, { timeout: 15000 });
  check(`${label}: intro plays with recorded narration (audio clock advances)`, (await seekValue(page)) > 1.2 && (await page.locator(".voice").innerText()).includes("Recorded"));
  const street = await stageState(page);
  check(`${label}: the duck stands in the street scene (pose "enter", street shot)`, street.pose === "enter" && street.shot === "street" && (await page.locator(".est .est-duck .dk").count()) === 1, JSON.stringify(street));
  await page.waitForTimeout(1500);
  await shot("02-intro-playing");

  // The staged intro: look up, orbit, back on the street with only the measured surfaces lit.
  await page.click('[data-action="play"]');
  await page.locator(".seek input").fill("8");
  const up = await stageState(page);
  await page.locator(".seek input").fill("12");
  const orbit = await stageState(page);
  await page.locator(".seek input").fill("19");
  await page.waitForTimeout(mobile ? 300 : 1300);
  const surface = await stageState(page);
  const surfaceLabel = await page.locator(".est-label--surface").innerText();
  const surfaceShown = await page.evaluate(() => getComputedStyle(document.querySelector(".est-surface")).opacity === "1" || document.querySelector(".est").classList.contains("est--surface"));
  check(`${label}: intro goes street (duck looks up) -> orbit -> street with only measured surfaces lit`, up.pose === "look" && up.shot === "street" && orbit.shot === "orbit" && surface.shot === "surface" && surface.pose === "lean" && surfaceShown && /surfaces/.test(surfaceLabel), JSON.stringify({ up: [up.pose, up.shot], orbit: orbit.shot, surface: [surface.pose, surface.shot] }));
  await shot("02b-intro-surface");

  // 2. Regional comparison on one scale; the duck points at the value being spoken.
  await page.click('.scenebar__list button:has-text("Central versus Southern Europe")');
  await page.waitForFunction(() => document.querySelector(".stage .scene")?.getAttribute("data-scene") === "intro-compare");
  await page.click('[data-action="play"]'); // pause, then seek to the sentence about Southern Europe
  await page.locator(".seek input").fill("16");
  await page.waitForSelector(".cmp__row--warm.is-on");
  const rows = await page.locator(".cmp__row.is-on").count();
  const basis = await page.locator(".cmp__basis").innerText();
  check(`${label}: comparison shows Central and Southern Europe on the same scale`, rows === 2 && /surface temperature/i.test(basis), `rows=${rows}`);
  const atSouth = await stageState(page);
  const overlaps = await mascotOverlaps(page);
  check(`${label}: the duck points at the row in focus and covers no value, bar, caption or source button`, atSouth.pose === "point" && atSouth.target === "south" && atSouth.focus.includes("south") && overlaps.length === 0, `${JSON.stringify(atSouth).slice(0, 140)} overlaps=${overlaps.join(",") || "none"}`);

  // Same time, same picture: seek away and back, change pace, pause and resume.
  await page.locator(".seek input").fill("3");
  const early = await stageState(page);
  await page.locator(".seek input").fill("16");
  const again = await stageState(page);
  await page.selectOption(".ctl-select select", "1.5");
  const paced = await stageState(page);
  await page.selectOption(".ctl-select select", "1");
  const same = (a, b) => a.step === b.step && a.pose === b.pose && a.target === b.target && a.focus === b.focus && a.shot === b.shot;
  check(`${label}: after seeking away and back, and after a pace change, sentence, focus and duck pose are identical`, same(atSouth, again) && same(atSouth, paced) && early.step === "0" && early.pose === "enter", JSON.stringify({ early: [early.step, early.pose], again: [again.step, again.pose, again.target] }));
  await page.waitForTimeout(1100);
  await shot("03-comparison");

  // Click a value while the scene is playing: it pauses and shows the passage.
  await page.click('[data-action="play"]');
  await page.waitForFunction(() => document.querySelector('[data-action="play"]')?.getAttribute("aria-label") === "Pause");
  await page.waitForTimeout(700);
  await page.click(".cmp__row--cool .cmp__value");
  const pausedAt = await seekValue(page);

  // 3. The right passage in the original PDF.
  await page.waitForSelector('.srccard[data-item="R-03"]');
  const hl = await highlightVisible(page);
  const where = await page.locator(".srccard__where").innerText();
  const quote = await page.locator(".srccard__quote").innerText();
  check(`${label}: number opens its passage in the PDF (page 1, highlighted, in view)`, /page 1/.test(where) && /8-12 K lower in Central Europe/.test(quote) && hl.count > 0 && hl.visible, JSON.stringify(hl));
  const held = (await page.locator(".stage").getAttribute("data-paused-for-source")) === "true";
  check(`${label}: clicking the value paused the running scene`, held && !(await isPlaying(page)) && Math.abs((await seekValue(page)) - pausedAt) < 0.2, `paused at ${pausedAt.toFixed(1)} s`);
  if (mobile) {
    check(`${label}: source view expands below the player`, (await page.locator(".side-toggle").getAttribute("aria-expanded")) === "true" && (await inViewport(page, ".srccard")));
  } else {
    const side = await page.evaluate(() => {
      const p = document.querySelector(".player").getBoundingClientRect();
      const s = document.querySelector(".lesson__side").getBoundingClientRect();
      return s.left >= p.right - 1 && s.top < window.innerHeight;
    });
    check(`${label}: source view sits beside the player`, side);
  }
  await page.waitForTimeout(600);
  await shot("04-source-pdf");

  // Close the source: the scene goes on from the same moment.
  await page.click('[data-action="resume-from-source"]');
  await page.waitForFunction(() => document.querySelector('[data-action="play"]')?.getAttribute("aria-label") === "Pause", null, { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(900);
  const resumedAt = await seekValue(page);
  check(`${label}: closing the source continues the same scene from the same moment`, (await isPlaying(page)) && (await sceneId(page)) === "intro-compare" && resumedAt >= pausedAt - 0.1 && resumedAt - pausedAt < 2.5 && (await page.locator(".srccard").count()) === 0 && (await inViewport(page, ".stage")), `paused ${pausedAt.toFixed(1)} s, playing again at ${resumedAt.toFixed(1)} s`);
  await page.click('[data-action="play"]');

  // 4. Source index: pick a methods passage and jump back to its explanation.
  if ((await page.locator(".side-toggle").getAttribute("aria-expanded")) === "false" && mobile) await page.click(".side-toggle");
  await page.click("#tab-index");
  await page.click('[data-filter="method"]');
  const methodRows = await page.locator(".index__row").count();
  await page.locator('[data-jump-item="M-19"]').scrollIntoViewIfNeeded();
  await shot("05-index-methods");
  await page.click('[data-jump-item="M-19"]');
  await page.waitForFunction(() => document.querySelector(".stage .scene")?.getAttribute("data-scene") === "m-time", null, { timeout: 8000 });
  await page.waitForTimeout(1200);
  check(`${label}: index entry (methods) jumps back to the explaining scene`, methodRows > 20 && (await sceneId(page)) === "m-time" && (await isPlaying(page)) && (await inViewport(page, ".stage")), `method entries=${methodRows}`);
  check(`${label}: chapter 2 is marked active after the jump`, (await page.locator('.chapters__btn[data-chapter="ch-method"]').getAttribute("aria-current")) === "true");
  await shot("06-jumped-to-scene");

  // 5. Switch chapter, turn on captions, try reduced motion.
  await page.click('.chapters__btn[data-chapter="ch-results"]');
  await page.waitForFunction(() => document.querySelector(".stage .scene")?.getAttribute("data-scene") === "r-map");
  check(`${label}: chapter switch opens "What they found"`, (await sceneId(page)) === "r-map");
  const capBefore = await page.locator(".captions p").count();
  await page.click('[data-action="captions"]');
  await page.waitForFunction(() => (document.querySelector(".captions p")?.textContent ?? "").trim().length > 10, null, { timeout: 12000 });
  const caption = await page.locator(".captions p").innerText();
  check(`${label}: captions can be switched on and follow the narration`, capBefore === 0 && caption.length > 10, caption.slice(0, 60));
  await page.click('[data-action="reduced-motion"]');
  const reduced = await page.evaluate(() => {
    const root = document.querySelector(".lesson");
    const el = document.querySelector(".scene .is-on") ?? document.querySelector(".scene");
    const head = document.querySelector(".stage .dk-head");
    return { flag: root.getAttribute("data-reduced"), transition: getComputedStyle(el).transitionDuration, animation: getComputedStyle(el).animationName, duck: head ? getComputedStyle(head).transitionDuration : "none", duckAnim: getComputedStyle(document.querySelector(".stage .dk-body")).animationName };
  });
  check(`${label}: reduced motion switches off transitions and animations, for the duck too`, reduced.flag === "true" && /^0s/.test(reduced.transition) && reduced.animation === "none" && /^0s/.test(reduced.duck) && reduced.duckAnim === "none", JSON.stringify(reduced));
  await page.waitForTimeout(9000);
  const calm = await stageState(page);
  check(`${label}: with reduced motion the duck still takes its pose for each sentence, and sources stay clickable`, Boolean(calm.pose) && calm.pose !== "away" && (await page.locator(".stage .source-tag, .stage .fig__list button:not([disabled])").count()) > 0, `pose=${calm.pose}`);
  await shot("07-captions-reduced-motion");
  check(`${label}: original figure is shown with attribution`, (await page.locator(".fig__frame img").isVisible()) && /CC BY 4\.0/.test(await page.locator(".fig__caption").innerText()));
  const figOverlap = await mascotOverlaps(page);
  check(`${label}: the duck does not cover the original figure or its callout list`, figOverlap.length === 0, figOverlap.join(",") || "none");

  // Pace and mute.
  await page.selectOption(".ctl-select select", "1.5");
  await page.click('[data-action="mute"]');
  const before = await seekValue(page);
  await page.waitForTimeout(2000);
  const after = await seekValue(page);
  check(`${label}: pace 1.5x and mute keep the lesson running`, after - before > 2.2 && (await page.locator('[data-action="mute"]').getAttribute("aria-pressed")) === "true", `advanced ${(after - before).toFixed(1)} s in 2 s`);

  check(`${label}: no horizontal overflow in the lesson`, await noOverflow(page));
  check(`${label}: no page errors`, errors.length === 0, errors.slice(0, 3).join(" | "));
  await ctx.close();
}

async function extras() {
  const { ctx, page, errors } = await newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(base + "/lesson/demo", { waitUntil: "networkidle" });

  // Keyboard: start, pause, seek, mute, visible focus.
  await page.keyboard.press("Tab"); // back link
  await page.keyboard.press("Tab"); // verification details
  const ring = await page.evaluate(() => {
    const cs = getComputedStyle(document.activeElement);
    return { tag: document.activeElement.tagName, style: cs.outlineStyle, width: cs.outlineWidth };
  });
  check("keyboard: focused control shows a visible focus ring", ring.style !== "none" && parseFloat(ring.width) >= 2, JSON.stringify(ring));
  await page.locator(".bigplay").focus();
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => Number(document.querySelector(".seek input")?.value) > 0.8, null, { timeout: 15000 });
  await page.locator(".stage").focus();
  await page.keyboard.press("Space");
  const paused = (await page.locator('[data-action="play"]').getAttribute("aria-label")) === "Play";
  const t0 = await seekValue(page);
  await page.keyboard.press("ArrowRight");
  const t1 = await seekValue(page);
  await page.keyboard.press("m");
  const muted = (await page.locator('[data-action="mute"]').getAttribute("aria-pressed")) === "true";
  await page.keyboard.press("n");
  const next = await sceneId(page);
  check("keyboard: Enter starts, Space pauses, arrow seeks 5 s, M mutes, N goes to next scene", paused && Math.abs(t1 - t0 - 5) < 0.6 && muted && next === "intro-question", JSON.stringify({ paused, dt: +(t1 - t0).toFixed(2), muted, next }));
  const unlabeled = await page.evaluate(() => [...document.querySelectorAll(".player button, .player select, .player input")].filter((el) => !(el.getAttribute("aria-label") || el.textContent.trim() || el.closest("label"))).length);
  check("keyboard: every player control has an accessible name", unlabeled === 0, `unlabeled=${unlabeled}`);

  // Keyboard: open a source from the scene, Escape closes it and playback continues.
  await page.keyboard.press("n");
  await page.waitForFunction(() => document.querySelector(".stage .scene")?.getAttribute("data-scene") === "intro-compare");
  await page.locator(".seek input").fill("9");
  await page.locator(".stage").focus();
  await page.keyboard.press("Space");
  await page.waitForFunction(() => document.querySelector('[data-action="play"]')?.getAttribute("aria-label") === "Pause");
  await page.locator('.cmp__value[data-value="central"]').focus();
  await page.keyboard.press("Enter");
  await page.waitForSelector('.srccard[data-item="R-03"]');
  const heldKb = (await page.locator(".stage").getAttribute("data-paused-for-source")) === "true";
  await page.keyboard.press("Escape");
  await page.waitForTimeout(700);
  check("keyboard: Enter on a value pauses and shows the source, Escape closes it and playback continues", heldKb && (await isPlaying(page)) && (await page.locator(".srccard").count()) === 0);
  await page.keyboard.press("Space");

  // The mascot is the same character in every scene and never covers content (all 17 scenes, mid-scene).
  await page.click('.chapters__btn >> nth=0');
  await page.click('[data-action="play"]').catch(() => {});
  const seen = [];
  const covered = [];
  for (;;) {
    if (await isPlaying(page)) await page.click('[data-action="play"]');
    const dur = Number(await page.getAttribute(".seek input", "max"));
    await page.locator(".seek input").fill(String((dur * 0.62).toFixed(1)));
    const st = await stageState(page);
    seen.push(`${st.scene}:${st.pose}`);
    if (!st.pose || st.pose === "away") covered.push(`${st.scene} has no duck`);
    if (st.scene !== "intro-city") for (const o of await mascotOverlaps(page)) covered.push(`${st.scene} covers ${o}`);
    const nextBtn = page.locator('button[aria-label="Next scene"]');
    if (await nextBtn.isDisabled()) break;
    await nextBtn.click();
    await page.waitForTimeout(60);
  }
  const poses = new Set(seen.map((s) => s.split(":")[1]));
  check("mascot: present in all 17 scenes, with several different poses, covering nothing", seen.length === 17 && covered.length === 0 && poses.size >= 3, `${seen.length} scenes, poses ${[...poses].join("/")}${covered.length ? " | " + covered.slice(0, 4).join("; ") : ""}`);

  // Intro ends with the offer to watch the full paper.
  await page.click('.chapters__btn >> nth=0');
  await page.click('.scenebar__list button:has-text("Read it correctly")');
  await page.locator(".seek input").fill("26");
  await page.waitForSelector('[data-action="watch-full"]', { timeout: 20000 });
  await page.screenshot({ path: `${OUT}/desktop-08-intro-end.png` });
  await page.click('[data-action="watch-full"]');
  await page.waitForFunction(() => document.querySelector(".stage .scene")?.getAttribute("data-scene") === "q-gap");
  check('intro ends with "Watch the full paper" and leads to chapter 1', (await sceneId(page)) === "q-gap");

  // Coverage map and verification badge.
  const badge = await page.locator(".verify").getAttribute("data-verified");
  const places = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll(".coverage__col")].map((c) => [c.getAttribute("data-place"), Number(c.querySelector("summary strong").textContent)])));
  check("coverage map lists intro, chapters, detail views and appendix; nothing is original-only", places.intro > 0 && places.chapter > 0 && places.detail > 0 && places.appendix >= 84 && places["original-only"] === 0, JSON.stringify(places));
  check('demo shows "fully checked" (verification report passed)', badge === "full");

  // PDF -> detail view (formula in the appendix) and external supplement status.
  await page.click("#tab-index");
  await page.fill(".index__search input", "emissivity");
  await page.click('.index__row[data-item="M-17"] .index__jump');
  await page.waitForSelector("#d-lst[open]");
  await page
    .waitForFunction(() => {
      const r = document.querySelector("#item-d-lst-M-17")?.getBoundingClientRect();
      return r && r.top >= 0 && r.top < window.innerHeight;
    }, null, { timeout: 5000 })
    .catch(() => {});
  check("index entry without a scene opens its detail view", await inViewport(page, "#item-d-lst-M-17"));
  await page.fill(".index__search input", "Supplementary Figures");
  await page.click('.index__row[data-item="S-01"] .index__main');
  await page.waitForSelector('.srccard[data-item="S-01"]');
  check("external supplement is shown with its own status", /External/.test(await page.locator(".srccard__head").innerText()));

  // Figure source: region outline when there is no text to highlight.
  await page.click("#tab-index");
  await page.fill(".index__search input", "FORM-1");
  await page.click('.index__row[data-item="FORM-1"] .index__main');
  await page.waitForSelector('.pdf__scroll[data-state="ready"]');
  check("formula inside a figure opens page 5 with the figure region outlined", (await page.locator(".pdf__region").count()) === 1 && /page 5/.test(await page.locator(".srccard__where").innerText()));
  await page.screenshot({ path: `${OUT}/desktop-09-figure-region.png` });
  check("extras: no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  await ctx.close();

  // The demo needs no server call beyond its own static files (no model, no lesson store).
  const off = await newPage({ viewport: { width: 1280, height: 800 } });
  const api = [];
  off.page.on("request", (r) => r.url().includes("/api/") && api.push(r.url()));
  await off.page.goto(base + "/lesson/demo", { waitUntil: "networkidle" });
  await off.page.click(".bigplay");
  await off.page.waitForTimeout(2500);
  check("demo lesson plays without any API request (no model call, no lesson store)", api.length === 0 && (await seekValue(off.page)) > 1, api.join(", ") || "0 requests to /api");
  await off.ctx.close();

  // System preference for reduced motion is respected without touching the switch.
  const rm = await newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: "reduce" });
  await rm.page.goto(base + "/lesson/demo", { waitUntil: "networkidle" });
  await rm.page.waitForFunction(() => document.querySelector(".lesson")?.getAttribute("data-reduced") === "true", null, { timeout: 5000 }).catch(() => {});
  check("system setting prefers-reduced-motion turns on the low-motion mode", (await rm.page.locator(".lesson").getAttribute("data-reduced")) === "true" && (await rm.page.locator('[data-action="reduced-motion"]').getAttribute("aria-pressed")) === "true");
  await rm.ctx.close();
}

async function uploadErrors(dir) {
  const { ctx, page } = await newPage({ viewport: { width: 1280, height: 900 } });
  for (const [file, code] of [["broken.pdf", "invalid_pdf"], ["scan.pdf", "no_text_layer"]]) {
    await page.goto(base + "/upload", { waitUntil: "networkidle" });
    await page.setInputFiles('input[type="file"]', resolve(dir, file));
    await page.waitForSelector('[data-upload-state="error"]', { timeout: 30000 });
    const got = await page.locator('[data-upload-state="error"]').getAttribute("data-error-code");
    const offersExample = await page.locator('[data-action="fallback-example"]').isVisible();
    check(`upload: ${file} shows the reason (${code}) and offers the example`, got === code && offersExample, `code=${got}`);
    await page.screenshot({ path: `${OUT}/upload-error-${code}.png` });
  }
  // Pasted text that is too short is refused before any model call.
  await page.goto(base + "/upload", { waitUntil: "networkidle" });
  await page.click('[data-input="text"]');
  await page.fill('[data-input="text-area"]', "Too short to be a lesson.");
  check("upload: a pasted text under 400 characters cannot be submitted", await page.locator('[data-action="generate-text"]').isDisabled());
  await ctx.close();
}

const fetchLesson = async (id) => (await fetch(`${base}/api/lessons/${id}`)).json();
const allScenes = (file) => [...file.lesson.intro.scenes, ...file.lesson.chapters.flatMap((c) => c.scenes)];
const idFromUrl = (page) => page.url().split("/lesson/")[1]?.split(/[?#]/)[0];

/** Checks shared by every generated lesson once it is open in the player. */
async function generatedLessonChecks(tag, page, kind) {
  const id = idFromUrl(page);
  const file = await fetchLesson(id);
  const scenes = allScenes(file);
  const types = [...new Set(scenes.map((s) => s.type))];
  console.log(`      ${tag}: "${file.lesson.meta.title}" | ${scenes.length} scenes: ${scenes.map((s) => s.type).join(", ")}`);
  console.log(`      ${tag}: chapters: ${file.lesson.chapters.map((c) => `${c.kind}:${c.title}`).join(" | ")}`);
  console.log(`      ${tag}: models ${[...new Set(file.provenance.runs.map((r) => `${r.step.split(" ")[0]}=${r.model}`))].join(", ")} | ${file.totals.calls} calls, ${(file.totals.ms / 1000).toFixed(0)} s model time, ${file.totals.inputTokens}/${file.totals.outputTokens} tokens, est. ${file.totals.costUsd === null ? "n/a" : "$" + file.totals.costUsd}`);
  const badge = await page.locator(".verify").getAttribute("data-verified");
  const summary = await page.locator(".verify summary").innerText();
  check(`${tag}: lesson is stored as ${file.format} v${file.version} and is NOT labelled fully checked`, file.format === "paperscenes.lesson" && file.version === 2 && badge === "auto" && /Automatically generated/.test(summary), summary.replace(/\s+/g, " "));
  check(`${tag}: provider, models, time and tokens are recorded for every model call`, file.provenance.provider === "bedrock" && file.provenance.runs.length >= 2 && file.provenance.runs.every((r) => r.model && r.ms > 0 && r.outputTokens > 0), `${file.provenance.runs.length} runs`);
  check(`${tag}: every scene carries a timed action track (mascot, camera, graphic) and timed captions`, scenes.every((s) => s.actions?.some((a) => a.track === "mascot") && s.actions.some((a) => a.track === "camera") && s.cues.every((c) => typeof c.start === "number" && c.end > c.start)));
  await page.click(".bigplay");
  await page.waitForFunction(() => Number(document.querySelector(".seek input")?.value) > 1.5, null, { timeout: 20000 });
  const voice = await page.locator(".voice").innerText();
  const st = await stageState(page);
  check(`${tag}: plays with the recorded local voice, and the duck is on stage`, /Recorded/.test(voice) && file.provenance.voice.startsWith("piper:") && Boolean(st.pose) && st.pose !== "away", `${voice} | pose ${st.pose}`);
  await page.screenshot({ path: `${OUT}/${tag}-03-lesson.png` });

  // scene -> source, pause, and continue
  const tagBtn = page.locator(".sources-line .source-tag").first();
  await tagBtn.waitFor({ timeout: 30000 });
  await tagBtn.click();
  await page.waitForSelector(".srccard");
  if (kind === "pdf") {
    const hl = await highlightVisible(page);
    check(`${tag}: sentence source opens the uploaded PDF with the passage highlighted`, hl.count > 0 && hl.visible, JSON.stringify(hl));
  } else {
    const marked = (await page.locator(".textsrc mark").count()) === 1 ? await page.locator(".textsrc mark").innerText() : "";
    const where = await page.locator(".srccard__where").innerText();
    check(`${tag}: sentence source shows the original paragraph with the passage marked`, marked.length > 15 && /paragraph \d+/.test(where), `${where.split("\n")[0]} | "${marked.slice(0, 60)}"`);
  }
  await page.screenshot({ path: `${OUT}/${tag}-04-source.png` });
  await page.click('[data-action="resume-from-source"]');
  await page.waitForTimeout(600);
  check(`${tag}: closing the source continues playback`, await isPlaying(page));
  await page.click('[data-action="play"]');

  // source -> scene
  await page.click("#tab-index");
  await page.locator(".index__jump:has-text('Explanation')").first().click();
  await page.waitForTimeout(800);
  check(`${tag}: index entry jumps back to a scene`, await isPlaying(page));
  await page.click('[data-action="play"]');
  const places = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll(".coverage__col")].map((c) => [c.getAttribute("data-place"), Number(c.querySelector("summary strong").textContent)])));
  check(`${tag}: every inventory entry has a place (nothing only in the original)`, places["original-only"] === 0 && places.intro + places.chapter > 0, JSON.stringify(places));
  return { id, file, scenes, types };
}

/** Reopen a stored lesson in a fresh browser context: same data, no model call. */
async function reopenChecks(tag, id, before) {
  const { ctx, page, errors } = await newPage({ viewport: { width: 1440, height: 900 } });
  const calls = [];
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.pathname.startsWith("/api/") && (r.method() !== "GET" || u.pathname.startsWith("/api/generate"))) calls.push(`${r.method()} ${u.pathname}`);
  });
  await page.goto(`${base}/lesson/${id}`, { waitUntil: "networkidle" });
  await page.waitForSelector(".bigplay", { timeout: 20000 });
  const again = await fetchLesson(id);
  const key = (f) => JSON.stringify(allScenes(f).map((s) => [s.id, s.type, s.duration, s.audio, s.cues.map((c) => [c.text, c.start, c.end]), s.actions]));
  check(`${tag}: reopened lesson has the same scenes, assets, timings and actions`, key(again) === key(before) && again.revision === before.revision && again.provenance.runs.length === before.provenance.runs.length);
  await page.click(".bigplay");
  await page.waitForFunction(() => Number(document.querySelector(".seek input")?.value) > 1.5, null, { timeout: 20000 });
  // Scene jump: go to the last scene of the first chapter and to a time inside it.
  await page.click('.chapters__btn >> nth=1');
  await page.waitForTimeout(500);
  const chips = page.locator(".scenebar__list button");
  await chips.nth((await chips.count()) - 1).click();
  await page.waitForTimeout(1200);
  const jumped = await stageState(page);
  if (await isPlaying(page)) await page.click('[data-action="play"]');
  const sc = allScenes(again).find((s) => s.id === jumped.scene);
  const target = sc.cues[sc.cues.length - 1];
  await page.locator(".seek input").fill(String((target.start + 0.4).toFixed(1)));
  const atCue = await stageState(page);
  check(`${tag}: scene jump and seek land on the stored sentence (same caption, step and audio position)`, atCue.step === String(sc.cues.length - 1) && Math.abs((await seekValue(page)) - (target.start + 0.4)) < 0.2 && atCue.scene === jumped.scene, `scene ${jumped.scene}, sentence ${atCue.step}`);
  await page.click('[data-action="play"]');
  await page.waitForTimeout(1500);
  const audioOk = await page.evaluate(() => performance.getEntriesByType("resource").some((e) => /\/asset\/audio\//.test(e.name)));
  check(`${tag}: playback of the stored lesson made no model call (only GET requests for the lesson and its assets)`, calls.length === 0 && audioOk, calls.join(", ") || "0 generating requests");
  check(`${tag}: reopen: no page errors`, errors.length === 0, errors.slice(0, 3).join(" | "));
  return { ctx, page };
}

async function regenerateCheck(tag, page, id) {
  const before = await fetchLesson(id);
  const target = allScenes(before).find((s) => ["points", "flow", "milestones", "statement", "comparison"].includes(s.type) && s.id.startsWith("ch"));
  // Navigate to that scene.
  const chapterIndex = before.lesson.chapters.findIndex((c) => c.scenes.some((s) => s.id === target.id));
  await page.click(`.chapters__btn >> nth=${chapterIndex + 1}`);
  await page.locator(`.scenebar__list button:has-text(${JSON.stringify(target.title)})`).first().click();
  await page.waitForFunction((sid) => document.querySelector(".stage .scene")?.getAttribute("data-scene") === sid, target.id);
  await page.click('[data-action="regenerate-scene"]');
  await page.waitForFunction((rev) => Number(document.querySelector("[data-revision]")?.getAttribute("data-revision")) > rev, before.revision, { timeout: 180000 });
  const after = await fetchLesson(id);
  const others = (f) => JSON.stringify(allScenes(f).filter((s) => s.id !== target.id).map((s) => [s.id, s.audio, s.duration, s.cues, s.actions]));
  const fresh = allScenes(after).find((s) => s.id === target.id);
  const newRuns = after.provenance.runs.slice(before.provenance.runs.length);
  check(`${tag}: one scene regenerated on its own: other scenes and their audio untouched, one extra model call, new revision`, others(after) === others(before) && after.revision === before.revision + 1 && newRuns.length === 1 && newRuns[0].step === "regenerate-scene" && fresh.audio !== target.audio && Boolean(fresh.audio), `"${target.title}" -> "${fresh.title}" (${fresh.type}, ${fresh.check.status}), ${newRuns[0]?.model}, ${(newRuns[0]?.ms / 1000).toFixed(1)} s`);
  await page.screenshot({ path: `${OUT}/${tag}-06-regenerated.png` });
  await page.click('[data-action="play"]');
  await page.waitForFunction(() => Number(document.querySelector(".seek input")?.value) > 1, null, { timeout: 15000 });
  check(`${tag}: the regenerated scene plays with its new narration`, (await sceneId(page)) === target.id && /Recorded/.test(await page.locator(".voice").innerText()));
}

async function uploadLive(pdf) {
  const { ctx, page, errors } = await newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(base + "/upload?mode=full", { waitUntil: "networkidle" });
  const setup = await page.locator("[data-setup]").innerText();
  check("pdf: upload page shows the provider (Bedrock by default), the model per task and the voice, never a key", /Amazon Bedrock/.test(setup) && /Inventory and repairs/.test(setup) && /Storyboard and narration/.test(setup) && /key present/.test(setup) && !/ABSK|sk-ant/.test(await page.content()), setup.replace(/\s+/g, " ").slice(0, 160));
  await page.screenshot({ path: `${OUT}/pdf-01-idle.png` });
  await page.setInputFiles('input[type="file"]', resolve(pdf));
  await page.waitForSelector('[data-upload-steps="inventory"]', { timeout: 60000 });
  await page.waitForSelector('[data-upload-steps="storyboard"]', { timeout: 300000 });
  check("pdf: reading, inventory and storyboard states are shown in turn", true);
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${OUT}/pdf-02-storyboard.png` });
  const outcome = await Promise.race([page.waitForURL(/\/lesson\/l-/, { timeout: 900000 }).then(() => "done"), page.waitForSelector('[data-upload-state="error"]', { timeout: 900000 }).then(() => "error")]);
  if (outcome === "error") {
    check("pdf: live generation finished", false, await page.locator('[data-upload-state="error"]').innerText());
    await page.screenshot({ path: `${OUT}/pdf-03-error.png` });
    await ctx.close();
    return;
  }
  await page.waitForSelector(".bigplay", { timeout: 30000 });
  const { id, file, scenes } = await generatedLessonChecks("pdf", page, "pdf");
  const fig = scenes.find((s) => s.type === "figure");
  if (fig) {
    const ch = file.lesson.chapters.findIndex((c) => c.scenes.some((s) => s.id === fig.id));
    await page.click(`.chapters__btn >> nth=${ch + 1}`);
    await page.locator(`.scenebar__list button:has-text(${JSON.stringify(fig.title)})`).first().click();
    await page.waitForSelector(".fig__frame img");
    await page.waitForTimeout(2500);
    const img = await page.evaluate(() => {
      const i = document.querySelector(".fig__frame img");
      return { ok: i.complete && i.naturalWidth > 50, w: i.naturalWidth, h: i.naturalHeight };
    });
    check("pdf: an original figure or table from the PDF is shown as a crop with callouts and its source", img.ok && fig.figure.callouts.length >= 1 && (await page.locator(".fig__caption .source-tag").count()) === 1, `${fig.title}: ${img.w}x${img.h}, ${fig.figure.callouts.length} callouts`);
    await page.screenshot({ path: `${OUT}/pdf-05-figure.png` });
    console.log(`      pdf: figure scene says: ${fig.cues.map((c) => c.text).join(" | ")}`);
  } else {
    check("pdf: an original figure or table from the PDF is shown as a crop", false, `no figure scene; notes: ${file.lesson.verification.notes.join(" | ")}`);
  }
  await page.screenshot({ path: `${OUT}/pdf-07-full.png`, fullPage: true });
  check("pdf: no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  await ctx.close();

  const again = await reopenChecks("pdf", id, await fetchLesson(id));
  await regenerateCheck("pdf", again.page, id);
  await again.ctx.close();
  return id;
}

async function textLive(path) {
  const { ctx, page, errors } = await newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(base + "/upload?mode=full", { waitUntil: "networkidle" });
  await page.click('[data-input="text"]');
  await page.fill('[data-input="text-area"]', readFileSync(path, "utf8"));
  await page.screenshot({ path: `${OUT}/text-01-paste.png` });
  await page.click('[data-action="generate-text"]');

  // Interrupt the run during the storyboard step, after the inventory has been paid for.
  await page.waitForSelector('[data-upload-steps="storyboard"]', { timeout: 300000 });
  await page.waitForTimeout(2500);
  await page.click('[data-action="cancel"]');
  await page.waitForSelector('[data-upload-state="error"]');
  const code = await page.locator('[data-upload-state="error"]').getAttribute("data-error-code");
  const resumable = await page.locator('[data-upload-state="error"]').getAttribute("data-resumable");
  const runsBefore = Number(await page.locator("[data-runs]").getAttribute("data-runs"));
  check("text: stopping the run during the storyboard step leaves a resumable run", code === "interrupted" && resumable === "true" && runsBefore >= 1, `code=${code}, model calls so far=${runsBefore}`);
  await page.screenshot({ path: `${OUT}/text-02-interrupted.png` });
  const listed = await (await fetch(`${base}/api/lessons`)).json();
  const stopped = listed.lessons.find((l) => l.status === "interrupted");
  check("text: the interrupted run is listed on the server with the step it stopped at", Boolean(stopped) && stopped.stage === "storyboard", JSON.stringify(stopped ?? {}).slice(0, 140));

  await page.click('[data-action="resume"]');
  await page.waitForSelector('[data-upload-steps="storyboard"]', { timeout: 60000 });
  const invNote = await page.locator(".steps li").nth(1).innerText();
  check("text: resuming keeps the finished inventory instead of generating it again", /Kept from the earlier run/.test(invNote) || /entries/.test(invNote), invNote.replace(/\s+/g, " ").slice(0, 100));
  const outcome = await Promise.race([page.waitForURL(/\/lesson\/l-/, { timeout: 900000 }).then(() => "done"), page.waitForSelector('[data-upload-state="error"]', { timeout: 900000 }).then(() => "error")]);
  if (outcome === "error") {
    check("text: live generation finished", false, await page.locator('[data-upload-state="error"]').innerText());
    await ctx.close();
    return;
  }
  await page.waitForSelector(".bigplay", { timeout: 30000 });
  const { id, file, types } = await generatedLessonChecks("text", page, "text");
  const inventoryRuns = file.provenance.runs.filter((r) => r.step.startsWith("inventory")).length;
  check("text: the resumed lesson was built with one inventory call in total (not repeated after the interruption)", inventoryRuns === 1 && id === stopped?.id, `inventory calls=${inventoryRuns}, same run id=${id === stopped?.id}`);
  check("text: the lesson points to paragraphs of the pasted text", file.lesson.meta.sourceKind === "text" && file.lesson.sourceBlocks.length >= 2 && (await page.locator(".sources-line").innerText()).includes("§"));
  await page.screenshot({ path: `${OUT}/text-05-full.png`, fullPage: true });
  check("text: no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  await ctx.close();
  const again = await reopenChecks("text", id, await fetchLesson(id));
  await again.ctx.close();
  return { id, types, chapters: file.lesson.chapters.map((c) => c.kind) };
}

if (!only || only === "flow") {
  await juryFlow("desktop", { viewport: { width: 1440, height: 900 } });
  await juryFlow("phone", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
}
if (!only || only === "extras") await extras();
if (errorsDir) await uploadErrors(errorsDir);
const pdfId = uploadPdf ? await uploadLive(uploadPdf) : null;
const text = textFile ? await textLive(textFile) : null;
if (pdfId && text) {
  const pdfFile = await fetchLesson(pdfId);
  const a = allScenes(pdfFile).map((s) => s.type).join(",");
  const b = allScenes(await fetchLesson(text.id)).map((s) => s.type).join(",");
  check("same pipeline, different staging: the PDF lesson and the text lesson use different scene sequences and chapter kinds", a !== b && pdfFile.lesson.chapters.map((c) => c.kind).join() !== text.chapters.join(), `pdf chapters ${pdfFile.lesson.chapters.map((c) => c.kind).join("/")} | text chapters ${text.chapters.join("/")}`);
}

await browser.close();
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
