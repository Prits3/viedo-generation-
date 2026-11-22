// Exports a stored lesson as an MP4 for short-video platforms.
//
//   node scripts/export-video.mjs <lessonId> [--format vertical|landscape] [--max-seconds N]
//        [--base http://localhost:3000] [--from-scene <sceneId>] [--end-card <seconds>] [--workers N]
//
// Writes <store>/<id>/export/<format>.mp4 (1080x1920 or 1920x1080, H.264 yuv420p + AAC, 30 fps,
// faststart) and caption.txt (post text). A shortened export gets its own name
// (vertical-30s.mp4, vertical-fig-1-45s.mp4) and never replaces the full one.
//
// How: the app's render view (/lesson/<id>/render) is opened in headless Chromium and stepped
// frame by frame; every frame is a screenshot of the page at exactly that time on the video clock,
// piped into ffmpeg. Nothing is recorded in real time, so a slow machine gives the same video.
// Several browser pages render different parts in parallel. The sound track is assembled from the
// per-scene narration files at the same scene start times, sample-exact.
//
// Needs: the app running at --base (npm run build && npm start), ffmpeg (FFMPEG_EXE or on PATH),
// and a lesson with recorded narration. A lesson without it is refused: no silent video.
// Progress is also written to <format>.status.json (the app's export button reads it).
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { join, resolve } from "node:path";
import { launchBrowser } from "./browser.mjs";
import { frameTime, planVideo, VIDEO_FORMATS, VIDEO_FPS } from "../src/lib/video-plan.ts";
import { shareCaption } from "../src/lib/share-caption.ts";

const args = process.argv.slice(2);
const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const id = args[0];
const format = flag("--format") ?? "vertical";
const base = (flag("--base") ?? "http://localhost:3000").replace(/\/+$/, "");
const maxSeconds = flag("--max-seconds") ? Number(flag("--max-seconds")) : undefined;
const endCard = flag("--end-card") !== undefined ? Number(flag("--end-card")) : undefined;
const fromScene = flag("--from-scene");
const FFMPEG = process.env.FFMPEG_EXE || "ffmpeg";
const AUDIO_RATE = 48000;

if (!id || id.startsWith("--") || !VIDEO_FORMATS[format] || (maxSeconds !== undefined && !(maxSeconds > 0)) || (endCard !== undefined && !(endCard >= 0))) {
  console.error("usage: node scripts/export-video.mjs <lessonId> [--format vertical|landscape] [--max-seconds N] [--base http://localhost:3000] [--from-scene <sceneId>] [--end-card <seconds>] [--workers N]");
  process.exit(2);
}
if (!/^l-[a-z0-9]{8,24}$/.test(id)) {
  console.error(`FAIL  "${id}" is not a stored lesson ID. The bundled example (/lesson/demo) is not in the lesson store and cannot be exported.`);
  process.exit(1);
}

const size = VIDEO_FORMATS[format];
const lessonDir = join(resolve(process.env.LESSON_STORE_DIR || join(".data", "lessons")), id);
const outDir = join(lessonDir, "export");
const name = [format, fromScene?.replace(/[^A-Za-z0-9_-]/g, ""), maxSeconds ? `${maxSeconds}s` : ""].filter(Boolean).join("-");
const outFile = join(outDir, `${name}.mp4`);
const statusFile = join(outDir, `${name}.status.json`);
const tmpDir = join(outDir, `.tmp-${name}-${process.pid}`);

const startedAt = Date.now();
let status = { state: "running", stage: "starting", name, format, frame: 0, frames: 0, pid: process.pid, startedAt: new Date(startedAt).toISOString() };
function writeStatus(patch = {}) {
  status = { ...status, ...patch, updatedAt: new Date().toISOString() };
  try {
    mkdirSync(outDir, { recursive: true });
    writeFileSync(`${statusFile}.${process.pid}.tmp`, JSON.stringify(status));
    renameSync(`${statusFile}.${process.pid}.tmp`, statusFile);
  } catch {
    /* a reader has the file open for a moment; the next write follows shortly */
  }
}

let browser;
const children = new Set();
function cleanup() {
  for (const c of children) c.kill();
  if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
}
async function fail(message) {
  clearInterval(heartbeat);
  await browser?.close().catch(() => {});
  cleanup();
  writeStatus({ state: "failed", error: message });
  console.error(`FAIL  ${message}`);
  process.exit(1);
}
const heartbeat = setInterval(() => writeStatus(), 2000);
process.on("SIGINT", () => fail("The export was stopped."));
process.on("SIGTERM", () => fail("The export was stopped."));

function run(cmd, cmdArgs, input) {
  return new Promise((ok, bad) => {
    const child = spawn(cmd, cmdArgs, { stdio: [input ? "pipe" : "ignore", "ignore", "pipe"], windowsHide: true });
    children.add(child);
    let err = "";
    let inputError;
    child.stderr.on("data", (d) => (err = (err + d).slice(-600)));
    child.on("error", (e) => bad(new Error(`${cmd} could not be started (${e.message}). Is ffmpeg installed?`)));
    child.on("close", (code) => {
      children.delete(child);
      if (inputError) bad(inputError);
      else if (code === 0) ok();
      else bad(new Error(`${cmd} exited with ${code}: ${err.trim()}`));
    });
    // A failure while feeding the process is the real reason; stop the process and report that.
    if (input)
      Promise.resolve(input(child)).catch((e) => {
        inputError = e;
        child.kill();
      });
  });
}

try {
  // ── 1. the lesson and its plan ──
  if (!existsSync(join(lessonDir, "lesson.json"))) await fail(`No stored lesson "${id}" in ${resolve(lessonDir, "..")}.`);
  const file = JSON.parse(readFileSync(join(lessonDir, "lesson.json"), "utf8"));
  if (file.format !== "paperscenes.lesson" || !file.lesson) await fail(`${join(lessonDir, "lesson.json")} is not a paperscenes.lesson file.`);
  const { lesson } = file;
  let plan;
  try {
    plan = planVideo(lesson, { maxSeconds, endCard, fromScene });
  } catch (e) {
    await fail(e.message);
  }
  if (!plan.scenes.length) await fail("The lesson has no scenes with a duration.");

  // ── 2. narration: every scene needs its recording ──
  const audioPath = (scene) => (scene.audio?.includes("/asset/") ? join(lessonDir, scene.audio.split("/asset/")[1]) : null);
  const silent = plan.scenes.filter((p) => !audioPath(p.scene) || !existsSync(audioPath(p.scene))).map((p) => p.scene.id);
  if (silent.length)
    await fail(
      `This lesson has no recorded narration for ${silent.length} of ${plan.scenes.length} scenes (${silent.slice(0, 6).join(", ")}${silent.length > 6 ? ", …" : ""}). ` +
        "A video is only exported with its narration, not silent. Generate the lesson with the Piper voice set up (PIPER_EXE, PIPER_VOICE), or regenerate these scenes, then export again.",
    );
  if (spawnSync(FFMPEG, ["-version"], { stdio: "ignore", windowsHide: true }).status !== 0) await fail(`ffmpeg was not found ("${FFMPEG}"). Install it or set FFMPEG_EXE.`);

  // ── 3. the app must serve the same lesson ──
  const served = await fetch(`${base}/api/lessons/${id}`)
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => undefined);
  if (served === undefined) await fail(`The app does not answer at ${base}. Start it (npm run build && npm start) or pass --base.`);
  if (!served || served.revision !== file.revision) await fail(`The app at ${base} does not serve revision ${file.revision} of lesson ${id}. It must use the same lesson store (LESSON_STORE_DIR).`);

  mkdirSync(tmpDir, { recursive: true });
  const frames = plan.frames;
  writeStatus({ stage: "audio", frames, revision: file.revision, seconds: plan.duration });
  console.log(`${id}: "${lesson.meta.title}", ${plan.scenes.length} scenes, ${plan.content.toFixed(2)} s of lesson + ${plan.endCard} s end card = ${plan.duration.toFixed(3)} s, ${frames} frames at ${VIDEO_FPS} fps, ${size.width}x${size.height}${plan.shortened ? " (shortened)" : ""}`);

  // ── 4. sound track: each scene's recording at its start time, cut to the scene length ──
  const total = Math.round((frames / VIDEO_FPS) * AUDIO_RATE);
  const pcm = new Int16Array(total);
  for (const p of plan.scenes) {
    const dec = spawnSync(FFMPEG, ["-v", "error", "-i", audioPath(p.scene), "-f", "s16le", "-ac", "1", "-ar", String(AUDIO_RATE), "-"], { maxBuffer: 1 << 29, windowsHide: true });
    if (dec.status !== 0 || dec.stdout.length < 1000) await fail(`The narration of scene ${p.scene.id} does not decode (${audioPath(p.scene)}).`);
    const src = new Int16Array(dec.stdout.buffer, dec.stdout.byteOffset, Math.floor(dec.stdout.length / 2));
    const at = Math.round(p.start * AUDIO_RATE);
    const n = Math.max(0, Math.min(src.length, Math.round(p.length * AUDIO_RATE), total - at));
    pcm.set(src.subarray(0, n), at);
    // A cut scene ends in the pause after a sentence; a short fade avoids a click.
    const fade = p.cut ? Math.min(n, Math.round(0.03 * AUDIO_RATE)) : 0;
    for (let i = 0; i < fade; i++) pcm[at + n - 1 - i] = Math.round((pcm[at + n - 1 - i] * i) / fade);
  }
  const wav = Buffer.alloc(44 + total * 2);
  wav.write("RIFF", 0);
  wav.writeUInt32LE(36 + total * 2, 4);
  wav.write("WAVEfmt ", 8);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(AUDIO_RATE, 24);
  wav.writeUInt32LE(AUDIO_RATE * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write("data", 36);
  wav.writeUInt32LE(total * 2, 40);
  Buffer.from(pcm.buffer, pcm.byteOffset, total * 2).copy(wav, 44);
  writeFileSync(join(tmpDir, "audio.wav"), wav);

  // ── 5. pictures: step the render view frame by frame, several pages in parallel ──
  const wanted = flag("--workers") ? Number(flag("--workers")) : Math.min(4, Math.max(1, Math.floor(availableParallelism() / 3)));
  const workers = Math.max(1, Math.min(wanted || 1, Math.ceil(frames / 150)));
  const query = new URLSearchParams({ format });
  if (maxSeconds) query.set("max", String(maxSeconds));
  if (endCard !== undefined) query.set("end", String(endCard));
  if (fromScene) query.set("from", fromScene);
  const url = `${base}/lesson/${id}/render?${query}`;
  browser = await launchBrowser();
  let done = 0;
  let lastLog = Date.now();
  const framesStartedAt = Date.now();
  writeStatus({ stage: "frames" });

  async function renderPart(k) {
    const from = Math.floor((k * frames) / workers);
    const to = Math.floor(((k + 1) * frames) / workers);
    const ctx = await browser.newContext({ viewport: { width: size.cssWidth, height: size.cssHeight }, deviceScaleFactor: size.scale });
    const page = await ctx.newPage();
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(String(e)));
    await page.goto(url, { waitUntil: "load" });
    await page.waitForFunction(() => window.__psRender?.ready || window.__psRender?.error, null, { timeout: 60000 });
    const info = await page.evaluate(() => ({ error: window.__psRender.error, ...window.__psRender.info }));
    if (info.error) throw new Error(`The render view reports: ${info.error}`);
    if (info.frames !== frames || info.revision !== file.revision) throw new Error(`The render view plans ${info.frames} frames of revision ${info.revision}, the exporter ${frames} of revision ${file.revision}. Rebuild the app (npm run build) so both use the same code.`);
    // Run through everything before this part, so every animation is where it is in a single pass.
    await page.evaluate((f) => window.__psRender.preroll(f), from);
    const cdp = await ctx.newCDPSession(page);
    const segment = join(tmpDir, `part-${String(k).padStart(2, "0")}.mp4`);
    const encoderArgs = ["-v", "error", "-y", "-f", "image2pipe", "-framerate", String(VIDEO_FPS), "-c:v", "png", "-i", "-",
      "-vf", `scale=${size.width}:${size.height}:flags=lanczos:out_color_matrix=bt709:out_range=tv,format=yuv420p`,
      "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-bf", "0", "-g", String(VIDEO_FPS * 2), "-r", String(VIDEO_FPS), "-video_track_timescale", "15360",
      "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv", "-an", segment];
    try {
      await run(FFMPEG, encoderArgs, async (child) => {
        child.stdin.on("error", () => {});
        for (let f = from; f < to; f++) {
          await page.evaluate((n) => window.__psRender.step(n), f);
          const { data } = await cdp.send("Page.captureScreenshot", { format: "png", optimizeForSpeed: true });
          if (!child.stdin.write(Buffer.from(data, "base64"))) await new Promise((r) => child.stdin.once("drain", r));
          status.frame = ++done;
          if (Date.now() - lastLog > 5000) {
            lastLog = Date.now();
            const rate = done / ((Date.now() - framesStartedAt) / 1000);
            console.log(`  frame ${done}/${frames} (${Math.round((100 * done) / frames)} %), about ${Math.ceil((frames - done) / rate)} s left`);
          }
        }
        if (pageErrors.length) throw new Error(`The render view threw: ${pageErrors[0]}`);
        child.stdin.end();
      });
    } finally {
      await ctx.close().catch(() => {});
    }
    return { segment, frames: to - from };
  }
  // When one part fails, the others are stopped; the first failure is the one reported.
  let firstError;
  const parts = await Promise.all(
    Array.from({ length: workers }, (_, k) =>
      renderPart(k).catch((e) => {
        firstError ??= e;
        for (const c of children) c.kill();
        return null;
      }),
    ),
  );
  await browser.close().catch(() => {});
  browser = undefined;
  if (firstError) await fail(firstError.message);

  // ── 6. join the parts, add the sound, faststart ──
  writeStatus({ stage: "encoding", frame: frames });
  writeFileSync(join(tmpDir, "parts.txt"), parts.map((p) => `file '${p.segment.split(/[\\/]/).pop()}'`).join("\n") + "\n");
  const partial = join(tmpDir, "out.mp4");
  await run(FFMPEG, ["-v", "error", "-y", "-f", "concat", "-safe", "0", "-i", join(tmpDir, "parts.txt"), "-i", join(tmpDir, "audio.wav"), "-map", "0:v:0", "-map", "1:a:0",
    "-c:v", "copy", "-c:a", "aac", "-b:a", "160k", "-ac", "2", "-ar", String(AUDIO_RATE), "-movflags", "+faststart",
    "-metadata", `title=${lesson.meta.title}`, "-metadata", "comment=AI-generated with LearnLayla. Every claim links to its source.", partial]);
  renameSync(partial, outFile);
  writeFileSync(join(outDir, "caption.txt"), shareCaption(lesson, file.provenance.sourceName, file.provenance.sourceFormat));

  clearInterval(heartbeat);
  cleanup();
  const wallMs = Date.now() - startedAt;
  const bytes = statSync(outFile).size;
  writeStatus({ state: "done", stage: "done", frame: frames, file: `${name}.mp4`, bytes, seconds: plan.duration, wallMs, workers, finishedAt: new Date().toISOString() });
  console.log(`PASS  ${outFile}`);
  console.log(`      ${plan.duration.toFixed(3)} s, ${frames} frames, ${(bytes / 1e6).toFixed(2)} MB, rendered in ${(wallMs / 1000).toFixed(1)} s with ${workers} page${workers > 1 ? "s" : ""} (${(frames / (wallMs / 1000)).toFixed(1)} frames/s)`);
  console.log(`      post text: ${join(outDir, "caption.txt")}`);
  process.exit(0);
} catch (e) {
  await fail(e?.message ?? String(e));
}
