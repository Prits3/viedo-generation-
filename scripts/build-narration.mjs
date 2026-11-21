// Builds the recorded narration for the demo lesson (one MP3 per scene) and the cue timings.
// Runs offline with Piper (https://github.com/rhasspy/piper) and ffmpeg. The output is committed,
// so the demo itself needs neither tool, no model call and no API key.
//
//   PIPER_EXE    path to the piper executable            (default: "piper" on PATH)
//   PIPER_VOICE  path to a Piper .onnx voice             (default: .cache/voices/en_US-ljspeech-high.onnx,
//                                                          LJ Speech voice, public-domain data set)
//   FFMPEG_EXE   path to ffmpeg                          (default: "ffmpeg" on PATH)
import { readFileSync, writeFileSync } from "node:fs";
import { intro, chapters } from "../src/data/demo/storyboard.ts";
import { narrateScene, voiceSetup } from "../src/lib/voice.ts";

// The same voice code narrates generated lessons on the server (src/lib/voice.ts).
//   node scripts/build-narration.mjs                 all scenes
//   node scripts/build-narration.mjs --only a,b      only these scene IDs (other recordings stay as they are)
const setup = voiceSetup();
if (!setup || !setup.ffmpeg) {
  console.error("Piper, its voice file or ffmpeg was not found. Set PIPER_EXE, PIPER_VOICE and FFMPEG_EXE.");
  process.exit(2);
}
const OUT = "public/demo/audio";
const TIMINGS = "src/data/demo/timings.json";
const only = process.argv.includes("--only") ? process.argv[process.argv.indexOf("--only") + 1].split(",") : null;

const scenes = [...intro.scenes, ...chapters.flatMap((c) => c.scenes)];
const timings = only ? JSON.parse(readFileSync(TIMINGS, "utf8")) : {};
for (const scene of scenes) {
  if (only && !only.includes(scene.id)) continue;
  const { timing } = await narrateScene(setup, scene.cues.map((c) => c.say ?? c.text), `${OUT}/${scene.id}`);
  timings[scene.id] = timing;
  console.log(scene.id.padEnd(16), timing.duration.toFixed(1) + " s", `(${scene.cues.length} sentences)`);
}
const ordered = Object.fromEntries(scenes.filter((s) => timings[s.id]).map((s) => [s.id, timings[s.id]]));
writeFileSync(TIMINGS, JSON.stringify(ordered, null, 1) + "\n");
const total = scenes.reduce((s, sc) => s + (ordered[sc.id]?.duration ?? 0), 0);
const introSec = intro.scenes.reduce((s, sc) => s + (ordered[sc.id]?.duration ?? 0), 0);
console.log(`intro ${introSec.toFixed(1)} s | total ${(total / 60).toFixed(1)} min | ${scenes.length} scenes | voice ${setup.name}`);
