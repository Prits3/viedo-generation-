// Extracts the full reference list of the demo paper from the PDF text layer
// so every reference stays reachable in the source appendix.
import { readFileSync, writeFileSync } from "node:fs";
import { extractPdfText } from "../src/lib/pdf-text.ts";

const pdf = new Uint8Array(readFileSync("public/demo/schwaab2021.pdf"));
const { pages } = await extractPdfText(pdf);
const strip = (t) => t.split("\n").filter((l) => !/NATURE COMMUNICATIONS \|/.test(l) && !/^\s*ARTICLE\s*$/.test(l)).join("\n");

const refs = [];
let expected = 1;
let current = null;
for (const p of pages.filter((p) => p.page === 9 || p.page === 10)) {
  let text = strip(p.text);
  if (p.page === 9) text = text.slice(text.indexOf("References") + "References".length);
  if (p.page === 10) text = text.slice(0, text.indexOf("Acknowledgements"));
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*(\d{1,2})\.\s+(.*)$/);
    if (m && Number(m[1]) === expected) {
      current = { n: expected, page: p.page, text: m[2].trim() };
      refs.push(current);
      expected++;
    } else if (current && line.trim()) {
      current.text += (current.text.endsWith("-") ? "" : " ") + line.trim();
    }
  }
}
for (const r of refs) r.text = r.text.replace(/\s+/g, " ").replace(/\s+([,.;:)])/g, "$1").trim();
writeFileSync("src/data/demo/references.json", JSON.stringify(refs, null, 1) + "\n");
console.log("references:", refs.length, "| first:", refs[0]?.text.slice(0, 70), "| last:", refs.at(-1)?.text.slice(0, 70));
console.log("page 9 ->", refs.filter((r) => r.page === 9).length, " page 10 ->", refs.filter((r) => r.page === 10).length);
