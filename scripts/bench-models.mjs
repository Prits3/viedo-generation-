// Compares models on the inventory step (the step the "fast" role does), on a real source.
// Prints time, tokens, cost estimate and how many quotes can actually be found in the source.
//
//   node scripts/bench-models.mjs <paper.pdf | text.txt> <model> [<model> ...]
//
// Needs AWS_BEARER_TOKEN_BEDROCK. Costs tokens (one call per model).
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { sourceFromPdf, sourceFromText } from "../src/lib/source.ts";
import { buildInventory } from "../src/lib/generate.ts";
import { inventoryFromDraft } from "../src/lib/assemble.ts";

const [file, ...models] = process.argv.slice(2);
if (!file || models.length === 0) {
  console.error("usage: node scripts/bench-models.mjs <paper.pdf | text.txt> <model> [<model> ...]");
  process.exit(2);
}
const source = /\.pdf$/i.test(file) ? await sourceFromPdf(new Uint8Array(readFileSync(file)), basename(file)) : sourceFromText(readFileSync(file, "utf8"), basename(file));
console.log(`${basename(file)}: ${source.count} blocks, ${source.chars} characters\n`);
console.log("model".padEnd(40), "time".padStart(7), "in".padStart(7), "out".padStart(7), "cost".padStart(9), "entries".padStart(8), "found".padStart(6), "types".padStart(6), "numbers ok");
for (const model of models) {
  process.env.BEDROCK_MODEL_FAST = model;
  try {
    const t0 = Date.now();
    const { draft, runs } = await buildInventory(source.pages, [], source.kind, { provider: "bedrock" });
    const cost = runs.every((r) => r.costUsd !== null) ? runs.reduce((n, r) => n + r.costUsd, 0) : null;
    const run = { ms: Date.now() - t0, inputTokens: runs.reduce((n, r) => n + r.inputTokens, 0), outputTokens: runs.reduce((n, r) => n + r.outputTokens, 0), costUsd: cost };
    const { inventory } = inventoryFromDraft(draft.inventory, source);
    const found = inventory.filter((it) => it.status === "matched").length;
    const types = new Set(inventory.map((it) => it.type)).size;
    const withValue = draft.inventory.filter((d) => d.value.trim());
    const numeric = withValue.filter((d) => /\d/.test(d.value)).length;
    console.log(model.padEnd(40), `${(run.ms / 1000).toFixed(1)}s`.padStart(7), String(run.inputTokens).padStart(7), String(run.outputTokens).padStart(7), (run.costUsd === null ? "n/a" : "$" + run.costUsd.toFixed(4)).padStart(9), String(inventory.length).padStart(8), String(found).padStart(6), String(types).padStart(6), `${numeric}/${withValue.length}`, "| ids:", draft.inventory.slice(0, 4).map((d) => d.id).join(" "), "| title:", draft.title);
  } catch (err) {
    console.log(model.padEnd(40), "FAILED", err.code ?? "", err.message);
  }
}
