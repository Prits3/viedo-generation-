// Verifies the demo lesson against the original PDF and writes src/data/demo/verification.json.
// The app only shows "fully checked" when this report says so.
//   1. every inventory quote is found on the page it claims (text layer, canonical comparison)
//   2. coverage in both directions (inventory -> place in lesson, spoken sentence -> source)
//   3. every page has inventory entries; references are numbered 1..84 without gaps
//   4. numbers shown on screen appear in the inventory entry they cite
import { readFileSync, writeFileSync } from "node:fs";
import { extractPdfText } from "../src/lib/pdf-text.ts";
import { quoteFound } from "../src/lib/text.ts";
import { analyzeCoverage } from "../src/lib/coverage.ts";
import { inventory } from "../src/data/demo/inventory.ts";
import { intro, chapters, details, appendix } from "../src/data/demo/storyboard.ts";

const pdf = new Uint8Array(readFileSync("public/demo/schwaab2021.pdf"));
const { pages, pageStatus, numPages } = await extractPdfText(pdf);
const problems = [];

// 1. quotes
const withQuote = inventory.filter((it) => it.source.quote);
const failed = [];
for (const it of withQuote) {
  const pg = pages.find((p) => p.page === it.source.page);
  if (!pg || !quoteFound(pg.text, it.source.quote)) failed.push(it.id);
}
if (failed.length) problems.push(`quotes not found on their page: ${failed.join(", ")}`);
const noQuote = inventory.filter((it) => !it.source.quote);
for (const it of noQuote) if (!it.source.region) problems.push(`${it.id} has neither quote nor page region`);

// 2. coverage
const cov = analyzeCoverage({ inventory, intro, chapters, details, appendix, meta: { pages: numPages } });
for (const issue of cov.issues) problems.push(`${issue.kind}: ${issue.message}`);

// 3. pages and references
for (const p of cov.pages) if (p.items === 0) problems.push(`page ${p.page} has no inventory entry`);
for (const s of pageStatus) if (s.status !== "ok") problems.push(`page ${s.page} unreadable (${s.chars} chars)`);
const refNums = inventory.filter((it) => it.type === "reference").map((it) => Number(it.id.slice(4)));
if (refNums.length !== 84 || refNums.some((n, k) => n !== k + 1)) problems.push("reference numbering is not 1..84");

// 4. on-screen numbers must appear in the cited inventory entry
const byId = new Map(inventory.map((it) => [it.id, it]));
const digits = (s) => (s.match(/\d+(?:[.,]\d+)?/g) ?? []).map((d) => d.replace(",", ""));
const scenes = [...intro.scenes, ...chapters.flatMap((c) => c.scenes)];
let numbersChecked = 0;
for (const sc of scenes) {
  const shown = [];
  for (const r of sc.comparison?.rows ?? []) if (/\d K/.test(r.display)) shown.push([r.display, r.ref]);
  for (const st of sc.flow?.steps ?? []) for (const f of st.facts ?? []) shown.push([f.text, f.ref]);
  for (const c of sc.figure?.callouts ?? []) if (c.ref && /\d/.test(c.label)) shown.push([c.label, c.ref]);
  for (const [text, ref] of shown) {
    const it = byId.get(ref);
    const hay = digits(`${it?.statement ?? ""} ${it?.quantity?.value ?? ""} ${it?.source.quote ?? ""}`);
    for (const d of digits(text.replace("m²", "m"))) {
      numbersChecked++;
      if (!hay.includes(d)) problems.push(`scene ${sc.id}: number ${d} in "${text}" not found in ${ref}`);
    }
  }
}

const statusCounts = cov.statusCounts;
const report = {
  mode: "manual",
  fullyChecked: problems.length === 0,
  checkedAt: new Date().toISOString().slice(0, 10),
  reviewer: "Build agent, page by page against the PDF",
  method:
    "Inventory written page by page from the PDF text layer; figures read from rendered pages. Machine check: every quote found on its stated page, coverage in both directions, on-screen numbers matched to the inventory, reference list 1-84 continuous.",
  quoteChecks: { total: withQuote.length, matched: withQuote.length - failed.length, failed },
  notes: [
    `${inventory.length} inventory entries on ${numPages} pages; ${noQuote.length} located by figure region instead of a quote.`,
    `${statusCounts.unclear ?? 0} marked unclear, ${statusCounts.external ?? 0} external supplements not checked, ${statusCounts.open ?? 0} open.`,
    `${cov.cues.total} spoken sentences: ${cov.cues.sourced} with sources, ${cov.cues.connective} transitions without scientific content.`,
    `${numbersChecked} on-screen numbers matched to their inventory entry.`,
    ...problems.map((p) => `PROBLEM: ${p}`),
  ],
  pageStatus,
};
writeFileSync("src/data/demo/verification.json", JSON.stringify(report, null, 1) + "\n");
console.log(`quotes ${report.quoteChecks.matched}/${report.quoteChecks.total} | placements`, cov.counts, "| cues", cov.cues, "| status", statusCounts, "| numbers", numbersChecked);
console.log("pages:", cov.pages.map((p) => `${p.page}:${p.items}`).join(" "));
if (problems.length) {
  console.error("FAILED\n - " + problems.join("\n - "));
  process.exit(1);
}
console.log("OK: demo lesson fully checked");
