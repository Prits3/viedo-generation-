import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { LessonFileSchema } from "../src/lib/lesson-file.ts";
import { inspectVideo } from "../src/lib/video-quality.ts";
import { VIDEO_FORMATS } from "../src/lib/video-plan.ts";

function options([id, ...args]) {
  if (!/^l-[a-z0-9]{8,24}$/.test(id ?? "") || args.length % 2) throw new Error("Expected a stored lesson ID and flag/value pairs.");
  const opts = new Map();
  for (let i = 0; i < args.length; i += 2) {
    const [k, v] = args.slice(i, i + 2);
    if (!["--format", "--base", "--frames-dir"].includes(k) || opts.has(k) || !v || v.startsWith("--")) throw new Error(`Invalid argument: ${k}`);
    opts.set(k, v);
  }
  const format = opts.get("--format") ?? "vertical";
  if (!Object.hasOwn(VIDEO_FORMATS, format)) throw new Error("Format must be vertical or landscape.");
  const base = opts.get("--base"), dir = opts.get("--frames-dir");
  if (Boolean(base) !== Boolean(dir)) throw new Error("Use --base and --frames-dir together.");
  const origin = base ? new URL(base) : undefined;
  if (origin && (!["http:", "https:"].includes(origin.protocol) || !["127.0.0.1", "localhost", "[::1]"].includes(origin.hostname) || origin.username || origin.password || origin.pathname !== "/" || origin.search || origin.hash)) throw new Error("Browser review accepts only a loopback origin.");
  return { id, format, origin, dir };
}

async function probe(report, file, { id, format, origin, dir }) {
  const { launchBrowser } = await import("./browser.mjs");
  mkdirSync(dir); // Refuse to overwrite a prior review.
  const { cssWidth: width, cssHeight: height } = VIDEO_FORMATS[format];
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage({ viewport: { width, height }, serviceWorkers: "block" });
    // The quality tool never needs a public origin (including redirects or remote assets).
    await page.route("**/*", (route) => new URL(route.request().url()).origin === origin.origin ? route.continue() : route.abort());
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(new URL(`/lesson/${id}/render?format=${format}`, origin).href);
    await page.waitForFunction(() => window.__psRender?.ready || window.__psRender?.error, null, { timeout: 30000 });
    const info = await page.evaluate(() => ({ error: window.__psRender.error, ...window.__psRender.info }));
    if (info.error || info.revision !== file.revision || info.frames !== report.totalFrames) throw new Error("The local renderer is not serving the same lesson revision and frame plan.");
    const capture = await page.context().newCDPSession(page);
    let next = 0;
    for (const shot of report.frames) {
      await page.evaluate(async ({ next, frame }) => {
        // Preserve the exporter's animation history while skipping screenshot work.
        for (let f = next; f <= frame; f++) await window.__psRender.step(f);
      }, { next, frame: shot.frame });
      next = shot.frame + 1;
      const measured = await page.evaluate(() => {
        const root = document.querySelector(".rv");
        const stage = root.querySelector(".rv-stage");
        const bounds = root.getBoundingClientRect();
        const boundsStyle = getComputedStyle(root);
        const edge = (name) => parseFloat(boundsStyle.getPropertyValue(`--safe-${name}`)) || 0;
        const safe = { top: bounds.top + edge("top"), bottom: bounds.bottom - edge("bottom"), left: bounds.left + edge("left"), right: bounds.right - edge("right") };
        const selectors = ".rv-caption p, .rv-chip, .rv-ai, .qcard__headline, .scene__question, .stmt__idea p, .cmp__row, .points__item, .flow__step, .mstones__item, .rv-end > p";
        const ended = root.dataset.ended === "true";
        const elements = [...root.querySelectorAll(selectors)].filter((el) => {
          if (Boolean(el.closest(".rv-end")) !== ended || el.closest(".is-off")) return false;
          const style = getComputedStyle(el);
          return style.visibility === "visible" && style.display !== "none" && Number(style.opacity) > 0.1;
        });
        const out = elements.filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 0 && (r.left < safe.left - 2 || r.top < safe.top - 2 || r.right > safe.right + 2 || r.bottom > safe.bottom + 2);
        }).map((el) => el.getAttribute("class") || el.tagName.toLowerCase());
        const caption = root.querySelector(".rv-caption p");
        const captionLines = caption ? Math.round(caption.getBoundingClientRect().height / parseFloat(getComputedStyle(caption).lineHeight)) : 0;
        const captionOverflow = Boolean(caption && (caption.scrollWidth > caption.clientWidth + 1 || caption.getBoundingClientRect().height > caption.parentElement.clientHeight));
        const hookVisible = [...root.querySelectorAll(".qcard__headline span")].every((el) => Number(getComputedStyle(el).opacity) > 0.9);
        return { out, captionLines, captionOverflow, hookVisible, ended, sceneType: stage.dataset.sceneType };
      });
      const flag = (code, severity, action) => report.findings.push({ code, severity, action, sceneId: shot.sceneId, frame: shot.frame });
      if (measured.out.length) flag("layout.safe-area", "error", `Move these elements inside the safe area: ${[...new Set(measured.out)].join(", ")}.`);
      if (measured.captionOverflow) flag("layout.caption-overflow", "error", "Split the caption at phrase boundaries so it fits the caption box.");
      else if (measured.captionLines > 2) flag("layout.caption-lines", "warning", "Keep captions to two lines where possible.");
      if (format === "vertical" && shot.frame === 0 && measured.sceneType === "question" && !measured.hookVisible) flag("layout.late-hook", "error", "Make the complete hook visible on frame zero.");
      const screenshot = `${String(shot.frame).padStart(6, "0")}-${shot.kind}.png`;
      const { data } = await capture.send("Page.captureScreenshot", { format: "png", optimizeForSpeed: true });
      writeFileSync(join(dir, screenshot), Buffer.from(data, "base64"), { flag: "wx" });
      Object.assign(shot, { screenshot, sceneType: measured.ended ? "end-card" : measured.sceneType });
    }
    if (errors.length) throw new Error(`Render page threw ${errors.length} error(s).`);
  } finally {
    await browser.close();
  }
}

try {
  const opts = options(process.argv.slice(2));
  const store = resolve(process.env.LESSON_STORE_DIR || join(".data", "lessons"));
  const file = LessonFileSchema.parse(JSON.parse(readFileSync(join(store, opts.id, "lesson.json"), "utf8")));
  if (file.lesson.id !== opts.id) throw new Error("Lesson ID does not match the directory name.");
  const report = { ...inspectVideo(file.lesson, opts.format), revision: file.revision, browserFrames: "not-run" };
  if (opts.origin && report.scenes) {
    await probe(report, file, opts);
    report.browserFrames = "sampled";
  }
  const ok = !report.findings.some((f) => f.severity === "error");
  console.log(JSON.stringify({ ...report, ok }, null, 2));
  process.exitCode = ok ? 0 : 1;
} catch (error) {
  console.error(`Video quality: ${error.message}\nUsage: node scripts/video-quality.mjs <lessonId> [--format vertical|landscape] [--base http://127.0.0.1:3000 --frames-dir <new-directory>]`);
  process.exitCode = 2;
}
