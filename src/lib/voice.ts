// Narration with the local Piper voice. The same voice and settings are used for the bundled demo
// (scripts/build-narration.mjs) and for generated lessons, so every lesson sounds like the same guide.
// Server/CLI only. If Piper or the voice file is missing, lessons fall back to the browser voice
// or captions; nothing here is required for playback.
//
//   PIPER_EXE    path to the piper executable            (default: "piper" on PATH)
//   PIPER_VOICE  path to a Piper .onnx voice             (default: .cache/voices/en_US-ljspeech-high.onnx)
//   FFMPEG_EXE   path to ffmpeg                          (default: "ffmpeg" on PATH; without it audio stays WAV)
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import type { SceneTiming } from "./timing.ts";

const LEAD_IN = 0.45; // seconds of silence before the first sentence
const GAP = 0.32; // between sentences
const TAIL = 0.8; // after the last sentence, lets the picture settle
const LENGTH_SCALE = "0.93";

export interface VoiceSetup {
  piper: string;
  voice: string;
  ffmpeg: string | null;
  /** Shown in the player and stored as provenance, e.g. "piper:en_US-ljspeech-high". */
  name: string;
}

let cached: VoiceSetup | null | undefined;

function runs(cmd: string, args: string[]): boolean {
  try {
    return spawnSync(cmd, args, { stdio: "ignore", timeout: 8000 }).status === 0;
  } catch {
    return false;
  }
}

/** The usable voice setup on this machine, or null. Checked once per process. */
export function voiceSetup(): VoiceSetup | null {
  if (cached !== undefined) return cached;
  const piper = process.env.PIPER_EXE || "piper";
  const voice = resolve(/*turbopackIgnore: true*/ process.env.PIPER_VOICE || ".cache/voices/en_US-ljspeech-high.onnx");
  if (process.env.LESSON_VOICE === "off" || !existsSync(/*turbopackIgnore: true*/ voice) || !existsSync(/*turbopackIgnore: true*/ voice + ".json") || !runs(piper, ["--help"])) return (cached = null);
  const ffmpeg = process.env.FFMPEG_EXE || "ffmpeg";
  return (cached = { piper, voice, ffmpeg: runs(ffmpeg, ["-version"]) ? ffmpeg : null, name: `piper:${basename(voice, ".onnx")}` });
}

function readWav(path: string): { rate: number; data: Buffer } {
  const buf = readFileSync(/*turbopackIgnore: true*/ path);
  let off = 12;
  let fmt: { channels: number; rate: number; bits: number } | null = null;
  while (off < buf.length - 8) {
    const id = buf.toString("ascii", off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === "fmt ") fmt = { channels: buf.readUInt16LE(off + 10), rate: buf.readUInt32LE(off + 12), bits: buf.readUInt16LE(off + 22) };
    if (id === "data") {
      if (!fmt || fmt.channels !== 1 || fmt.bits !== 16) throw new Error("unexpected wav format from piper");
      // Piper streams to the file, so the declared size can be wrong; trust the file length.
      const data = buf.subarray(off + 8);
      return { rate: fmt.rate, data: data.subarray(0, data.length - (data.length % 2)) };
    }
    off += 8 + size + (size % 2);
  }
  throw new Error("no data chunk in " + path);
}

function wavBytes(pcm: Buffer, rate: number): Buffer {
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
  return Buffer.concat([h, pcm]);
}

function run(cmd: string, args: string[], input?: string, signal?: AbortSignal): Promise<void> {
  return new Promise((ok, fail) => {
    const child = spawn(cmd, args, { stdio: ["pipe", "ignore", "pipe"], signal });
    let err = "";
    child.stderr.on("data", (d) => (err = (err + d).slice(-400)));
    child.on("error", fail);
    child.on("close", (code) => (code === 0 ? ok() : fail(new Error(`${basename(cmd)} exited with ${code}: ${err}`))));
    child.stdin.end(input ?? "");
  });
}

/**
 * Speaks the sentences of one scene into a single audio file and returns where each sentence
 * starts and ends. `outBase` is the path without extension; the result is .mp3 when ffmpeg is
 * available, otherwise .wav.
 */
export async function narrateScene(setup: VoiceSetup, sentences: string[], outBase: string, signal?: AbortSignal): Promise<{ file: string; timing: SceneTiming }> {
  const tmp = mkdtempSync(/*turbopackIgnore: true*/ join(/*turbopackIgnore: true*/ tmpdir(), "narr-"));
  try {
    const lines = sentences.map((text, k) => JSON.stringify({ text: text.replace(/\s+/g, " ").trim(), output_file: join(/*turbopackIgnore: true*/ tmp, `${k}.wav`) })).join("\n") + "\n";
    await run(setup.piper, ["--model", setup.voice, "--json-input", "--sentence_silence", "0.24", "--length_scale", LENGTH_SCALE, "-q"], lines, signal);
    let rate = 22050;
    const parts: Buffer[] = [];
    const cues: SceneTiming["cues"] = [];
    const silence = (sec: number) => Buffer.alloc(Math.round(sec * rate) * 2);
    let at = LEAD_IN;
    sentences.forEach((_, k) => {
      const w = readWav(join(/*turbopackIgnore: true*/ tmp, `${k}.wav`));
      rate = w.rate;
      if (k === 0) parts.push(silence(LEAD_IN));
      const dur = w.data.length / 2 / rate;
      cues.push({ start: +at.toFixed(2), end: +(at + dur).toFixed(2) });
      parts.push(w.data);
      at += dur;
      if (k < sentences.length - 1) {
        parts.push(silence(GAP));
        at += GAP;
      }
    });
    parts.push(silence(TAIL));
    at += TAIL;
    mkdirSync(/*turbopackIgnore: true*/ dirname(outBase), { recursive: true });
    const wav = wavBytes(Buffer.concat(parts), rate);
    const timing = { duration: +at.toFixed(2), cues };
    if (!setup.ffmpeg) {
      writeFileSync(/*turbopackIgnore: true*/ outBase + ".wav", wav);
      return { file: outBase + ".wav", timing };
    }
    const sceneWav = join(/*turbopackIgnore: true*/ tmp, "scene.wav");
    writeFileSync(/*turbopackIgnore: true*/ sceneWav, wav);
    await run(setup.ffmpeg, ["-y", "-loglevel", "error", "-i", sceneWav, "-ac", "1", "-ar", "44100", "-codec:a", "libmp3lame", "-b:a", "64k", outBase + ".mp3"], undefined, signal);
    return { file: outBase + ".mp3", timing };
  } finally {
    rmSync(/*turbopackIgnore: true*/ tmp, { recursive: true, force: true });
  }
}
