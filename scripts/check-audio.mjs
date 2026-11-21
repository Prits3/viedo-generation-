// Technical check of recorded narration (it does not replace listening):
// every scene's audio file decodes, its length matches the stored scene duration, there is speech
// energy inside every caption interval, and the lead-in before the first sentence is silent.
// This shows that captions, actions and audio share one clock; it says nothing about how the voice sounds.
//
//   node scripts/check-audio.mjs demo            the bundled example
//   node scripts/check-audio.mjs <lesson id>     a stored lesson (reads LESSON_STORE_DIR or .data/lessons)
// Needs ffmpeg (FFMPEG_EXE or "ffmpeg" on PATH).
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const which = process.argv[2];
if (!which) {
  console.error("usage: node scripts/check-audio.mjs demo | <lesson id>");
  process.exit(2);
}
const FFMPEG = process.env.FFMPEG_EXE || "ffmpeg";
let scenes;
let fileOf;
if (which === "demo") {
  const { demoLesson } = await import("../src/data/demo/lesson.ts");
  scenes = [...demoLesson.intro.scenes, ...demoLesson.chapters.flatMap((c) => c.scenes)];
  fileOf = (s) => join("public", s.audio);
} else {
  const dir = join(process.env.LESSON_STORE_DIR || join(".data", "lessons"), which);
  const { lesson } = JSON.parse(readFileSync(join(dir, "lesson.json"), "utf8"));
  scenes = [...lesson.intro.scenes, ...lesson.chapters.flatMap((c) => c.scenes)];
  fileOf = (s) => join(dir, s.audio.split("/asset/")[1]);
}

const RATE = 16000;
const rms = (pcm, from, to) => {
  const a = Math.max(0, Math.floor(from * RATE));
  const b = Math.min(pcm.length, Math.floor(to * RATE));
  if (b <= a) return 0;
  let sum = 0;
  for (let i = a; i < b; i++) sum += pcm[i] * pcm[i];
  return Math.sqrt(sum / (b - a));
};

let bad = 0;
let cues = 0;
let total = 0;
for (const s of scenes) {
  if (!s.audio) {
    console.log(`FAIL  ${s.id}: no recorded audio`);
    bad++;
    continue;
  }
  const out = spawnSync(FFMPEG, ["-v", "error", "-i", fileOf(s), "-f", "s16le", "-ac", "1", "-ar", String(RATE), "-"], { maxBuffer: 1 << 28 });
  if (out.status !== 0 || out.stdout.length < 1000) {
    console.log(`FAIL  ${s.id}: audio does not decode`);
    bad++;
    continue;
  }
  const pcm = new Int16Array(out.stdout.buffer, out.stdout.byteOffset, Math.floor(out.stdout.length / 2));
  const seconds = pcm.length / RATE;
  const problems = [];
  if (Math.abs(seconds - s.duration) > 0.25) problems.push(`audio is ${seconds.toFixed(2)} s, scene says ${s.duration} s`);
  const lead = rms(pcm, 0.02, Math.max(0.05, s.cues[0].start - 0.08));
  if (lead > 120) problems.push(`sound before the first sentence (rms ${lead.toFixed(0)})`);
  s.cues.forEach((c, k) => {
    cues++;
    const level = rms(pcm, c.start + 0.1, c.end - 0.1);
    if (level < 300) problems.push(`sentence ${k + 1} (${c.start}-${c.end} s) is silent (rms ${level.toFixed(0)})`);
    const next = s.cues[k + 1];
    if (next && next.start - c.end > 0.2) {
      const gap = rms(pcm, c.end + 0.06, next.start - 0.06);
      if (gap > 200) problems.push(`speech in the pause after sentence ${k + 1} (rms ${gap.toFixed(0)})`);
    }
    if (!s.actions?.some((a) => a.track === "graphic" && Math.abs(a.at - c.start) < 0.01)) problems.push(`no graphic action at the start of sentence ${k + 1}`);
  });
  total += seconds;
  if (problems.length) {
    bad++;
    console.log(`FAIL  ${s.id}: ${problems.join("; ")}`);
  }
}
console.log(`${bad ? "FAIL" : "PASS"}  ${which}: ${scenes.length - bad}/${scenes.length} scenes, ${cues} sentences, ${(total / 60).toFixed(1)} min of narration; audio length, speech inside every caption interval, silence between sentences, actions on sentence starts`);
process.exit(bad ? 1 : 0);
