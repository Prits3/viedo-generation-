// Builds the recorded narration for the demo lesson (one MP3 per scene) and the cue timings.
// Runs offline with Piper (https://github.com/rhasspy/piper) and ffmpeg. The output is committed,
// so the demo itself needs neither tool, no model call and no API key.
//
//   PIPER_EXE    path to the piper executable            (default: "piper" on PATH)
//   PIPER_VOICE  path to a Piper .onnx voice             (default: .cache/voices/en_US-ljspeech-high.onnx,
//                                                          LJ Speech voice, public-domain data set)
//   FFMPEG_EXE   path to ffmpeg                          (default: "ffmpeg" on PATH)
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { intro, chapters } from "../src/data/demo/storyboard.ts";

const PIPER = process.env.PIPER_EXE || "piper";
const VOICE = process.env.PIPER_VOICE || ".cache/voices/en_US-ljspeech-high.onnx";
const FFMPEG = process.env.FFMPEG_EXE || "ffmpeg";
const OUT = "public/demo/audio";
const TMP = ".cache/narration";
const LEAD_IN = 0.45; // seconds of silence before the first sentence
const GAP = 0.32; // between sentences
const TAIL = 0.8; // after the last sentence, lets the picture settle

mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });

function readWav(path) {
  const buf = readFileSync(path);
  let off = 12;
  let fmt = null;
  while (off < buf.length - 8) {
    const id = buf.toString("ascii", off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === "fmt ") fmt = { channels: buf.readUInt16LE(off + 10), rate: buf.readUInt32LE(off + 12), bits: buf.readUInt16LE(off + 22) };
    if (id === "data") {
      // Piper streams to the file, so the declared size can be wrong; trust the file length.
      const data = buf.subarray(off + 8);
      return { ...fmt, data: data.subarray(0, data.length - (data.length % 2)) };
    }
    off += 8 + size + (size % 2);
  }
  throw new Error("no data chunk in " + path);
}

function writeWav(path, pcm, rate) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0);
  h.writeUInt32LE(36 + pcm.length, 4);
  h.write("WAVEfmt ", 8);
  h.writeUInt32LE(16, 16);
  h.writeUInt16LE(1, 20);
  h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24);
  h.writeUInt32LE(rate * 2, 28);
  h.writeUInt16LE(2, 32);
  h.writeUInt16LE(16, 34);
  h.write("data", 36);
  h.writeUInt32LE(pcm.length, 40);
  writeFileSync(path, Buffer.concat([h, pcm]));
}

const scenes = [...intro.scenes, ...chapters.flatMap((c) => c.scenes)];
const timings = {};
let total = 0;

for (const scene of scenes) {
  const parts = [];
  const cues = [];
  let rate = 22050;
  const silence = (sec) => Buffer.alloc(Math.round(sec * rate) * 2);
  let at = LEAD_IN;
  parts.push(silence(LEAD_IN));
  scene.cues.forEach((cue, k) => {
    const wav = join(TMP, `${scene.id}-${k}.wav`);
    const res = spawnSync(PIPER, ["--model", VOICE, "--output_file", wav, "--sentence_silence", "0.24", "--length_scale", "0.93"], {
      input: (cue.say ?? cue.text) + "\n",
      encoding: "utf8",
    });
    if (res.status !== 0) throw new Error(`piper failed for ${scene.id}#${k}: ${res.stderr || res.error}`);
    const w = readWav(wav);
    if (w.channels !== 1 || w.bits !== 16) throw new Error("unexpected wav format");
    rate = w.rate;
    const dur = w.data.length / 2 / rate;
    cues.push({ start: +at.toFixed(2), end: +(at + dur).toFixed(2) });
    parts.push(w.data);
    at += dur;
    if (k < scene.cues.length - 1) {
      parts.push(silence(GAP));
      at += GAP;
    }
  });
  parts.push(silence(TAIL));
  at += TAIL;
  const sceneWav = join(TMP, `${scene.id}.wav`);
  writeWav(sceneWav, Buffer.concat(parts), rate);
  const mp3 = join(OUT, `${scene.id}.mp3`);
  const ff = spawnSync(FFMPEG, ["-y", "-loglevel", "error", "-i", sceneWav, "-ac", "1", "-ar", "44100", "-codec:a", "libmp3lame", "-b:a", "64k", mp3]);
  if (ff.status !== 0) throw new Error(`ffmpeg failed for ${scene.id}: ${ff.stderr}`);
  timings[scene.id] = { duration: +at.toFixed(2), cues };
  total += at;
  console.log(scene.id.padEnd(16), at.toFixed(1) + " s", `(${scene.cues.length} sentences)`);
}

writeFileSync("src/data/demo/timings.json", JSON.stringify(timings, null, 1) + "\n");
rmSync(TMP, { recursive: true, force: true });
const introSec = intro.scenes.reduce((s, sc) => s + timings[sc.id].duration, 0);
console.log(`intro ${introSec.toFixed(1)} s | total ${(total / 60).toFixed(1)} min | ${scenes.length} scenes`);
