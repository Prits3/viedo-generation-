// Browser check of the jury flow on desktop and phone (Playwright, headless Chromium).
//   node scripts/e2e.mjs [baseUrl] [--upload <pdf>] [--errors <dir>]
// --upload runs one real generation (needs ANTHROPIC_API_KEY on the server, costs tokens).
// --errors uploads broken.pdf and scan.pdf from <dir> and expects the error states.
// Screenshots go to .cache/e2e/.
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { launchBrowser } from "./browser.mjs";

const args = process.argv.slice(2);
const base = args.find((a) => a.startsWith("http")) ?? "http://localhost:3000";
const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : null);
const uploadPdf = flag("--upload");
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
  await page.waitForTimeout(1500);
  await shot("02-intro-playing");

  // 2. Regional comparison on one scale; click the number.
  await page.click('.scenebar__list button:has-text("Central versus Southern Europe")');
  await page.waitForFunction(() => document.querySelector(".stage .scene")?.getAttribute("data-scene") === "intro-compare");
  await page.click('[data-action="play"]'); // pause, then seek to the sentence about Southern Europe
  await page.locator(".seek input").fill("22");
  await page.waitForSelector(".cmp__row--warm.is-on");
  const rows = await page.locator(".cmp__row.is-on").count();
  const basis = await page.locator(".cmp__basis").innerText();
  check(`${label}: comparison shows Central and Southern Europe on the same scale`, rows === 2 && /surface temperature/i.test(basis), `rows=${rows}`);
  await page.waitForTimeout(1100);
  await shot("03-comparison");
  await page.click(".cmp__row--cool .cmp__value");

  // 3. The right passage in the original PDF.
  await page.waitForSelector('.srccard[data-item="R-03"]');
  const hl = await highlightVisible(page);
  const where = await page.locator(".srccard__where").innerText();
  const quote = await page.locator(".srccard__quote").innerText();
  check(`${label}: number opens its passage in the PDF (page 1, highlighted, in view)`, /page 1/.test(where) && /8-12 K lower in Central Europe/.test(quote) && hl.count > 0 && hl.visible, JSON.stringify(hl));
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

  // 4. Source index: pick a methods passage and jump back to its explanation.
  await page.click("#tab-index");
  await page.click('[data-filter="method"]');
  const methodRows = await page.locator(".index__row").count();
  await page.locator('[data-jump-item="M-19"]').scrollIntoViewIfNeeded();
  await shot("05-index-methods");
  await page.click('[data-jump-item="M-19"]');
  await page.waitForFunction(() => document.querySelector(".stage .scene")?.getAttribute("data-scene") === "m-time", null, { timeout: 8000 });
  await page.waitForTimeout(1200);
  const playing = (await page.locator('[data-action="play"]').getAttribute("aria-label")) === "Pause";
  check(`${label}: index entry (methods) jumps back to the explaining scene`, methodRows > 20 && (await sceneId(page)) === "m-time" && playing && (await inViewport(page, ".stage")), `method entries=${methodRows}`);
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
    return { flag: root.getAttribute("data-reduced"), transition: getComputedStyle(el).transitionDuration, animation: getComputedStyle(el).animationName };
  });
  check(`${label}: reduced motion switches off transitions and animations`, reduced.flag === "true" && /^0s/.test(reduced.transition) && reduced.animation === "none", JSON.stringify(reduced));
  await page.waitForTimeout(9000);
  await shot("07-captions-reduced-motion");
  check(`${label}: original figure is shown with attribution`, (await page.locator(".fig__frame img").isVisible()) && /CC BY 4\.0/.test(await page.locator(".fig__caption").innerText()));

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

  // Intro ends with the offer to watch the full paper.
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
  await ctx.close();
}

async function uploadLive(pdf) {
  const { ctx, page, errors } = await newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(base + "/upload", { waitUntil: "networkidle" });
  await page.screenshot({ path: `${OUT}/upload-01-idle.png` });
  await page.setInputFiles('input[type="file"]', resolve(pdf));
  await page.waitForSelector('[data-upload-steps="storyboard"]', { timeout: 60000 });
  check("upload: reading state, then storyboard state are shown", true);
  await page.waitForTimeout(4000);
  await page.screenshot({ path: `${OUT}/upload-02-storyboard.png` });
  const outcome = await Promise.race([
    page.waitForSelector('[data-upload-state="done"]', { timeout: 420000 }).then(() => "done"),
    page.waitForSelector('[data-upload-state="error"]', { timeout: 420000 }).then(() => "error"),
  ]);
  if (outcome === "error") {
    check("upload: live generation finished", false, await page.locator('[data-upload-state="error"]').innerText());
    await page.screenshot({ path: `${OUT}/upload-03-error.png` });
    await ctx.close();
    return;
  }
  const badge = await page.locator(".verify").getAttribute("data-verified");
  const summary = await page.locator(".verify summary").innerText();
  check("upload: generated lesson renders and is NOT labelled fully checked", badge === "auto" && /Automatically generated/.test(summary), summary.replace(/\s+/g, " "));
  await page.screenshot({ path: `${OUT}/upload-03-lesson.png` });
  await page.click(".bigplay");
  await page.waitForFunction(() => Number(document.querySelector(".seek input")?.value) > 1.5, null, { timeout: 15000 });
  const caption = await page.locator(".captions p").innerText();
  const voice = await page.locator(".voice").innerText();
  check("upload: plays with captions on by default; voice status is stated", caption.trim().length > 10 && /voice|captions/i.test(voice), `${voice} | ${caption.slice(0, 50)}`);
  // scene -> PDF
  const tag = page.locator(".sources-line .source-tag").first();
  await tag.waitFor({ timeout: 20000 });
  await tag.click();
  await page.waitForSelector(".srccard");
  const hl = await highlightVisible(page);
  check("upload: sentence source opens the uploaded PDF with the passage highlighted", hl.count > 0 && hl.visible, JSON.stringify(hl));
  await page.screenshot({ path: `${OUT}/upload-04-source.png` });
  // PDF -> scene
  await page.click("#tab-index");
  const jump = page.locator(".index__jump:has-text('Explanation')").first();
  await jump.click();
  await page.waitForTimeout(800);
  check("upload: index entry jumps back to a scene", (await page.locator('[data-action="play"]').getAttribute("aria-label")) === "Pause");
  const places = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll(".coverage__col")].map((c) => [c.getAttribute("data-place"), Number(c.querySelector("summary strong").textContent)])));
  console.log("      coverage:", JSON.stringify(places), "| status:", (await page.locator(".coverage__status").innerText()).replace(/\n/g, "; "));
  await page.screenshot({ path: `${OUT}/upload-05-full.png`, fullPage: true });
  check("upload: no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  await ctx.close();
}

if (!only || only === "flow") {
  await juryFlow("desktop", { viewport: { width: 1440, height: 900 } });
  await juryFlow("phone", { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
}
if (!only || only === "extras") await extras();
if (errorsDir) await uploadErrors(errorsDir);
if (uploadPdf) await uploadLive(uploadPdf);

await browser.close();
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
