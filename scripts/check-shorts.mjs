// Measures finished shorts in the lesson store against what short mode promises. Reads the stored
// lesson files only: no model call, no server.
//   node scripts/check-shorts.mjs <lesson-id> [<lesson-id> ...]
//   node scripts/check-shorts.mjs --all          every short in the store
// For each short: the lesson file is valid and says it is a short, 5 to 7 scenes, 45 to 90
// seconds, every spoken sentence cites inventory entries whose quote was found in the source,
// the number check passes, and the claim check ran. Flagged scenes are counted as failures.
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { LessonFileSchema, runTotals } from "../src/lib/lesson-file.ts";
import { checkScene } from "../src/lib/check.ts";
import { SHORT } from "../src/lib/limits.ts";
import { shortProblems, totalSeconds } from "../src/lib/short.ts";
import { storeDir } from "../src/lib/store.ts";

const args = process.argv.slice(2);
const root = storeDir();
const read = (id) => {
  try {
    return JSON.parse(readFileSync(join(root, id, "lesson.json"), "utf8"));
  } catch {
    return null;
  }
};
const ids = args.includes("--all") ? (existsSync(root) ? readdirSync(root).filter((id) => read(id)?.provenance?.mode === "short") : []) : args.filter((a) => !a.startsWith("--"));
if (ids.length === 0) {
  console.error(args.includes("--all") ? `No shorts in ${root}.` : "usage: node scripts/check-shorts.mjs <lesson-id> [...] | --all");
  process.exit(2);
}

let failed = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

for (const id of ids) {
  const file = read(id);
  console.log(`\n${id}${file ? `  "${file.lesson?.meta?.title}"  (${file.provenance?.sourceFormat ?? file.provenance?.sourceKind}: ${file.provenance?.sourceName})` : ""}`);
  if (!file) {
    check("lesson file exists", false, join(root, id, "lesson.json"));
    continue;
  }
  const parsed = LessonFileSchema.safeParse(file);
  check("valid paperscenes.lesson file, version 2", parsed.success && file.version === 2, parsed.success ? "" : `${parsed.error.issues[0]?.path.join(".")}: ${parsed.error.issues[0]?.message}`);
  if (!parsed.success) continue;
  const { lesson, provenance } = file;
  const scenes = lesson.intro.scenes;
  const byId = new Map(lesson.inventory.map((it) => [it.id, it]));
  const cues = scenes.flatMap((s) => s.cues);
  const steps = provenance.runs.map((r) => r.step);
  const totals = runTotals(provenance.runs);

  check("mode is recorded as short, in the provenance and for the player", provenance.mode === "short" && lesson.meta.mode === "short");
  check("one run of scenes: everything in the intro, no chapters", lesson.chapters.length === 0 && scenes.length > 0);
  check(`${SHORT.minScenes} to ${SHORT.maxScenes} scenes`, scenes.length >= SHORT.minScenes && scenes.length <= SHORT.maxScenes, `${scenes.length} scenes: ${scenes.map((s) => s.type).join(", ")}`);
  const seconds = totalSeconds(scenes);
  check(`${SHORT.minSeconds} to ${SHORT.maxSeconds} seconds`, shortProblems(scenes).every((p) => !p.includes("seconds")), `${seconds.toFixed(1)} s, ${scenes.every((s) => s.audio) ? "recorded" : "estimated"}`);
  check("starts with a hook (a question scene) and has at least three scenes between hook and takeaway", scenes[0]?.type === "question" && scenes.length - 2 >= 3, `hook: "${scenes[0]?.headline ?? scenes[0]?.title}"`);
  const unsourced = cues.filter((c) => !c.connective && c.refs.length === 0);
  const weak = cues.flatMap((c) => c.refs).filter((r) => byId.get(r)?.status !== "matched");
  check("every spoken statement cites inventory entries whose quote was found in the source", unsourced.length === 0 && weak.length === 0, `${cues.length} sentences, ${cues.filter((c) => c.connective).length} transition(s), ${new Set(cues.flatMap((c) => c.refs)).size} entries cited`);
  const flagged = scenes.filter((s) => s.check?.status === "flagged");
  const problems = scenes.flatMap((s) => checkScene(s, byId).map((p) => `${s.id}: ${p}`));
  check("number and source check passes on every scene, run again now", problems.length === 0, problems.slice(0, 2).join(" | "));
  check("no scene is flagged", flagged.length === 0, flagged.map((s) => `${s.id}: ${s.check.problems[0]}`).join(" | ").slice(0, 300));
  check("the claim check ran (model comparison of each sentence with its passages)", steps.includes("claim-check") && steps.includes("short-storyboard") && steps.some((s) => s.startsWith("inventory")));
  check("no figure step, and at most the allowed repairs", !steps.includes("figure") && steps.filter((s) => s === "repair-scene").length <= SHORT.maxRepairs, steps.join(", "));
  const longest = Math.max(...cues.map((c) => c.text.trim().split(/\s+/).length));
  check("short sentences and sparse scenes (at most 20 words a sentence, 3 sentences and 3 cards a scene)", longest <= 20 && scenes.every((s) => s.cues.length <= 3 && (s.points?.items.length ?? 0) <= 3 && (s.comparison?.rows.length ?? 0) <= 3 && !s.statement?.analogy), `longest sentence ${longest} words`);
  check("provenance: source hash, provider, models, prompt version, voice", /^[0-9a-f]{64}$/.test(provenance.sourceHash) && Boolean(provenance.provider && provenance.models.strong && provenance.promptVersion && provenance.voice));
  const q = lesson.verification.quoteChecks;
  console.log(`      ${scenes.length} scenes · ${seconds.toFixed(1)} s · ${totals.calls} model calls (${(totals.ms / 1000).toFixed(1)} s in model calls) · est. cost ${totals.costUsd === null ? "n/a" : "$" + totals.costUsd} · quotes found ${q.matched}/${q.total} · voice ${provenance.voice}`);
  for (const n of lesson.verification.notes) console.log(`      note: ${n}`);
}

console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
