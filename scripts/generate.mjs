// Runs the generation pipeline from the command line, exactly as the upload page does.
// The lesson is stored in the lesson store and can be opened at /lesson/<id>.
//
//   node scripts/generate.mjs <paper.pdf | text.txt | text.md> [--provider bedrock|anthropic] [--resume <id>]
//
// Needs AWS_BEARER_TOKEN_BEDROCK (default provider) or ANTHROPIC_API_KEY. Costs tokens.
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { createJob, runPipeline } from "../src/lib/pipeline.ts";
import { defaultProvider } from "../src/lib/models.ts";

const args = process.argv.slice(2);
const opt = (name) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const file = args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--"));
const resume = opt("--resume");
const provider = opt("--provider") ?? defaultProvider();
if ((!file && !resume) || !provider) {
  console.error(!provider ? "No provider configured (AWS_BEARER_TOKEN_BEDROCK or ANTHROPIC_API_KEY)." : "usage: node scripts/generate.mjs <paper.pdf | text.txt> [--provider bedrock|anthropic] [--resume <id>]");
  process.exit(2);
}

let id = resume;
if (!id) {
  const name = basename(file);
  const job = /\.pdf$/i.test(name) ? createJob({ kind: "pdf", name, bytes: new Uint8Array(readFileSync(file)) }, provider) : createJob({ kind: "text", name: name.replace(/\.(txt|md)$/i, ""), text: readFileSync(file, "utf8") }, provider);
  id = job.id;
}
const t0 = Date.now();
const at = () => `${((Date.now() - t0) / 1000).toFixed(1).padStart(6)}s`;
try {
  const out = await runPipeline(id, (ev) => {
    if (ev.type === "progress" || ev.type === "voice") return;
    if (ev.type === "run") {
      const r = ev.run;
      console.log(at(), `run ${r.step.padEnd(16)} ${r.model}  ${(r.ms / 1000).toFixed(1)} s  in ${r.inputTokens}  out ${r.outputTokens}  ${r.costUsd === null ? "cost n/a" : "$" + r.costUsd}${r.attempts > 1 ? "  attempts " + r.attempts : ""}`);
    } else console.log(at(), JSON.stringify(ev));
  });
  const l = out.lesson;
  const scenes = [...l.intro.scenes, ...l.chapters.flatMap((c) => c.scenes)];
  console.log(`\n${l.meta.title}`);
  console.log(`inventory ${l.inventory.length} entries, quotes found ${l.verification.quoteChecks.matched}/${l.verification.quoteChecks.total}`);
  for (const c of [l.intro, ...l.chapters]) console.log(`  [${c.kind}] ${c.title}: ${c.scenes.map((s) => `${s.type}${s.check?.status === "ok" ? "" : "(" + s.check?.status + ")"}`).join(", ")}`);
  console.log(`scenes ${scenes.length}, duration ${(scenes.reduce((s, x) => s + (x.duration ?? 0), 0) / 60).toFixed(1)} min, voice ${out.provenance.voice}`);
  for (const n of l.verification.notes) console.log("  note:", n);
  console.log(`open: /lesson/${id}`);
} catch (err) {
  console.error(at(), "FAILED", err.code ?? "", err.message, `\nresume: node scripts/generate.mjs --resume ${id}`);
  process.exit(1);
}
