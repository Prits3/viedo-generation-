// Technical check of an exported video (it does not replace watching it):
// container and streams (size, 30 fps, H.264 yuv420p, AAC, faststart), the exact number of frames,
// the length against the lesson, and that sound and picture share one clock:
//   - the sound track is compared with each scene's narration file at the scene's start time
//     (the offset with the best match must be within 10 ms),
//   - there is speech inside every caption interval and silence under the end card,
//   - the caption box of the picture changes exactly at the frame where a sentence starts.
// With --base, the render view is also asked which sentence it shows at each of those frames.
//
//   node scripts/check-export.mjs <lessonId> [--format vertical|landscape] [--max-seconds N]
//        [--from-scene <sceneId>] [--end-card <seconds>] [--base http://localhost:3000]
// Pass the same options the export was made with. Needs ffmpeg and ffprobe (FFMPEG_EXE, FFPROBE_EXE or PATH).
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { captionAt, frameTime, planVideo, positionAt, VIDEO_FORMATS, VIDEO_FPS } from "../src/lib/video-plan.ts";
import { cueIndexAt } from "../src/lib/actions.ts";

const args = process.argv.slice(2);
const flag = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const id = args[0];
const format = flag("--format") ?? "vertical";
const maxSeconds = flag("--max-seconds") ? Number(flag("--max-seconds")) : undefined;
const endCard = flag("--end-card") !== undefined ? Number(flag("--end-card")) : undefined;
const fromScene = flag("--from-scene");
const base = flag("--base")?.replace(/\/+$/, "");
if (!id || !VIDEO_FORMATS[format]) {
  console.error("usage: node scripts/check-export.mjs <lessonId> [--format vertical|landscape] [--max-seconds N] [--from-scene <sceneId>] [--end-card <seconds>] [--base http://localhost:3000]");
  process.exit(2);
}
const FFMPEG = process.env.FFMPEG_EXE || "ffmpeg";
const FFPROBE = process.env.FFPROBE_EXE || "ffprobe";
const size = VIDEO_FORMATS[format];
const dir = join(resolve(process.env.LESSON_STORE_DIR || join(".data", "lessons")), id);
const name = [format, fromScene?.replace(/[^A-Za-z0-9_-]/g, ""), maxSeconds ? `${maxSeconds}s` : ""].filter(Boolean).join("-");
const video = join(dir, "export", `${name}.mp4`);

let failed = 0;
function check(label, ok, detail = "") {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? "  — " + detail : ""}`);
}
if (!existsSync(video)) {
  console.log(`FAIL  no export at ${video}`);
  process.exit(1);
}
const { lesson, provenance } = JSON.parse(readFileSync(join(dir, "lesson.json"), "utf8"));
const plan = planVideo(lesson, { maxSeconds, endCard, fromScene });

// ── container and streams ──
const probe = JSON.parse(spawnSync(FFPROBE, ["-v", "error", "-count_frames", "-show_streams", "-show_format", "-of", "json", video], { encoding: "utf8", maxBuffer: 1 << 26 }).stdout || "{}");
const v = probe.streams?.find((s) => s.codec_type === "video") ?? {};
const a = probe.streams?.find((s) => s.codec_type === "audio") ?? {};
const seconds = Number(probe.format?.duration);
check("video stream", v.codec_name === "h264" && v.pix_fmt === "yuv420p" && v.width === size.width && v.height === size.height && v.avg_frame_rate === `${VIDEO_FPS}/1`, `${v.codec_name} ${v.profile} ${v.pix_fmt} ${v.width}x${v.height} ${v.avg_frame_rate} fps`);
check("audio stream", a.codec_name === "aac" && Number(a.sample_rate) === 48000 && a.channels === 2, `${a.codec_name} ${a.profile} ${a.sample_rate} Hz ${a.channels} ch, ${(Number(a.bit_rate) / 1000).toFixed(0)} kb/s, ${Number(a.duration).toFixed(3)} s`);
check("frame count", Number(v.nb_read_frames) === plan.frames, `${v.nb_read_frames} decoded, ${plan.frames} planned`);
const lessonSeconds = plan.content;
check("length", Math.abs(seconds - plan.duration) <= 0.05 && Math.abs(Number(a.duration) - Number(v.duration)) <= 0.05, `file ${seconds.toFixed(3)} s = lesson content ${lessonSeconds.toFixed(2)} s + end card ${plan.endCard} s (planned ${plan.duration.toFixed(3)} s); video ${Number(v.duration).toFixed(3)} s, audio ${Number(a.duration).toFixed(3)} s`);
const head = readFileSync(video);
check("faststart (index before the media data)", head.indexOf("moov") > 0 && head.indexOf("moov") < head.indexOf("mdat"), `moov at byte ${head.indexOf("moov")}, mdat at byte ${head.indexOf("mdat")}`);
check("post text next to the video", existsSync(join(dir, "export", "caption.txt")) && readFileSync(join(dir, "export", "caption.txt"), "utf8").includes(lesson.meta.title) && readFileSync(join(dir, "export", "caption.txt"), "utf8").includes("AI-generated"), provenance.sourceName);

// ── sound against the narration files ──
const RATE = 16000;
const decode = (file) => {
  const out = spawnSync(FFMPEG, ["-v", "error", "-i", file, "-vn", "-f", "s16le", "-ac", "1", "-ar", String(RATE), "-"], { maxBuffer: 1 << 29 });
  return out.status === 0 ? new Int16Array(out.stdout.buffer, out.stdout.byteOffset, Math.floor(out.stdout.length / 2)) : new Int16Array(0);
};
const rms = (pcm, from, to) => {
  const i0 = Math.max(0, Math.floor(from * RATE));
  const i1 = Math.min(pcm.length, Math.floor(to * RATE));
  if (i1 <= i0) return 0;
  let sum = 0;
  for (let i = i0; i < i1; i++) sum += pcm[i] * pcm[i];
  return Math.sqrt(sum / (i1 - i0));
};
const track = decode(video);
let worstLag = 0;
let quiet = 0;
let cues = 0;
const problems = [];
for (const p of plan.scenes) {
  const src = decode(join(dir, p.scene.audio.split("/asset/")[1]));
  // Offset between the track and this scene's file: best match of two seconds of the first sentence.
  const from = Math.floor(((p.scene.cues[0].start ?? 0) + 0.2) * RATE);
  const n = Math.min(2 * RATE, Math.floor(p.length * RATE) - from - RATE / 10);
  const at = Math.round(p.start * RATE) + from;
  let best = { lag: 0, score: -Infinity };
  for (let lag = -800; lag <= 800; lag++) {
    let score = 0;
    for (let i = 0; i < n; i += 2) score += src[from + i] * (track[at + i + lag] ?? 0);
    if (score > best.score) best = { lag, score };
  }
  const ms = (best.lag / RATE) * 1000;
  if (Math.abs(ms) > Math.abs(worstLag)) worstLag = ms;
  if (Math.abs(ms) > 10) problems.push(`${p.scene.id}: sound is ${ms.toFixed(1)} ms off its narration file`);
  p.scene.cues.forEach((c, k) => {
    if ((c.end ?? 0) > p.length + 0.01) return;
    cues++;
    const level = rms(track, p.start + c.start + 0.1, p.start + c.end - 0.1);
    if (level < 300) {
      quiet++;
      problems.push(`${p.scene.id} sentence ${k + 1}: no speech between ${(p.start + c.start).toFixed(2)} and ${(p.start + c.end).toFixed(2)} s (rms ${level.toFixed(0)})`);
    }
  });
}
check("sound sits at the scene start times", !problems.some((x) => x.includes("ms off")), `largest offset ${worstLag.toFixed(1)} ms over ${plan.scenes.length} scenes`);
check("speech inside every caption interval", quiet === 0, `${cues - quiet}/${cues} sentences`);
if (plan.endCard > 0.5) check("silence under the end card", rms(track, plan.content + 0.1, plan.duration - 0.1) < 60, `rms ${rms(track, plan.content + 0.1, plan.duration - 0.1).toFixed(0)}`);
for (const x of problems.slice(0, 8)) console.log(`      ${x}`);

// ── picture: the caption box changes at the frame where a sentence starts ──
// Caption box in output pixels (see render.css): x, y, width, height. Even numbers, as crop works on 4:2:0 pictures.
const BOX = format === "vertical" ? [46, 1240, 894, 194] : [260, 920, 1400, 136];
const starts = [];
for (const p of plan.scenes)
  p.scene.cues.forEach((c, k) => {
    if ((c.start ?? 0) >= p.length) return;
    // First frame whose sampling time is at or after the sentence start.
    const frame = Math.ceil((p.start + c.start - 0.001) * VIDEO_FPS - 0.5);
    if (frame > 0 && frame < plan.frames - 1) starts.push({ frame, scene: p.scene, k, text: c.text });
  });
const wanted = [...new Set(starts.flatMap((s) => [s.frame - 1, s.frame, s.frame + 1]))].sort((x, y) => x - y);
const raw = spawnSync(FFMPEG, ["-v", "error", "-i", video, "-an", "-vf", `select='${wanted.map((f) => `eq(n\\,${f})`).join("+")}',crop=${BOX[2]}:${BOX[3]}:${BOX[0]}:${BOX[1]},format=gray`, "-fps_mode", "passthrough", "-f", "rawvideo", "-"], { maxBuffer: 1 << 30 });
const per = BOX[2] * BOX[3];
const got = Math.floor((raw.stdout?.length ?? 0) / per);
const frameOf = (f) => raw.stdout.subarray(wanted.indexOf(f) * per, (wanted.indexOf(f) + 1) * per);
const diff = (x, y) => {
  let sum = 0;
  for (let i = 0; i < per; i += 3) sum += Math.abs(x[i] - y[i]);
  return sum / (per / 3);
};
if (got !== wanted.length) check("caption changes at sentence starts", false, `ffmpeg returned ${got} of ${wanted.length} frames`);
else {
  const late = starts.filter((s) => diff(frameOf(s.frame - 1), frameOf(s.frame)) < 1 || diff(frameOf(s.frame), frameOf(s.frame + 1)) > 2);
  check("caption changes at the frame of every sentence start, not before and not after", late.length === 0, `${starts.length - late.length}/${starts.length} sentence starts; a frame is ${(1000 / VIDEO_FPS).toFixed(1)} ms`);
  for (const s of late.slice(0, 6)) console.log(`      ${s.scene.id} sentence ${s.k + 1} at frame ${s.frame}: change ${diff(frameOf(s.frame - 1), frameOf(s.frame)).toFixed(2)}, next ${diff(frameOf(s.frame), frameOf(s.frame + 1)).toFixed(2)}`);
}

// ── optional: ask the render view which sentence each of those frames shows ──
if (base) {
  const { launchBrowser } = await import("./browser.mjs");
  const browser = await launchBrowser();
  const page = await browser.newPage({ viewport: { width: size.cssWidth, height: size.cssHeight }, deviceScaleFactor: 1 });
  const q = new URLSearchParams({ format });
  if (maxSeconds) q.set("max", String(maxSeconds));
  if (endCard !== undefined) q.set("end", String(endCard));
  if (fromScene) q.set("from", fromScene);
  await page.goto(`${base}/lesson/${id}/render?${q}`);
  await page.waitForFunction(() => window.__psRender?.ready || window.__psRender?.error);
  const shown = await page.evaluate(async (frames) => {
    const out = {};
    for (const f of frames) {
      await window.__psRender.step(f);
      const root = document.querySelector(".rv");
      out[f] = { scene: root.dataset.scene, caption: document.querySelector(".rv-caption")?.textContent ?? "", chip: document.querySelector(".rv-chip")?.textContent ?? "" };
    }
    return out;
  }, wanted);
  await browser.close();
  const expected = (f) => {
    const pos = positionAt(plan, frameTime(f));
    const scene = plan.scenes[pos.index].scene;
    const k = cueIndexAt(scene, pos.t);
    return { scene: scene.id, caption: pos.ended ? "" : captionAt(k >= 0 ? scene.cues[k] : undefined, pos.t, size.captionChars)?.text ?? "" };
  };
  const wrong = wanted.filter((f) => shown[f].scene !== expected(f).scene || shown[f].caption !== expected(f).caption);
  const firstWords = starts.filter((s) => !s.text.startsWith(shown[s.frame].caption) || s.text.startsWith(shown[s.frame - 1].caption || "\u0000"));
  check("render view shows the sentence whose audio starts at that frame", wrong.length === 0 && firstWords.length === 0, `${wanted.length} frames around ${starts.length} sentence starts; every sentence has a source chip: ${wanted.every((f) => shown[f].chip.length > 0)}`);
}

console.log(`${failed ? "FAIL" : "PASS"}  ${video}`);
process.exit(failed ? 1 : 0);
