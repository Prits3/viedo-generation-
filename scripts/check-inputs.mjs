// Checks the readers for dropped files and the rules of short mode. No model call, no network,
// no server: it runs the library code directly on the fixtures and on files built in memory.
//   node scripts/check-inputs.mjs
// Part 1  Word, PowerPoint and text files -> source blocks; wrong, damaged, protected and empty files
// Part 2  short mode: which entries are offered, how a short is cut to its length, how the mode is stored
// (A finished short is measured by scripts/check-shorts.mjs.)
import { readFileSync } from "node:fs";
import { docx, pptx, zip, SLEEP_DOCX, TREES_PPTX } from "./make-fixtures.mjs";
import { formatOf, sourceFromOffice, sourceFromText, textFromBytes } from "../src/lib/source.ts";
import { openZip } from "../src/lib/zip.ts";
import { ACCEPTED_EXTENSIONS, ERROR_TEXT, SHORT, asMode } from "../src/lib/limits.ts";
import { cutFailing, estimateSceneSeconds, fitShort, hasRealQuote, selectForShort, shortProblems, totalSeconds } from "../src/lib/short.ts";
import { LessonFileSchema } from "../src/lib/lesson-file.ts";
import { quoteFound } from "../src/lib/text.ts";

let failed = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};
const codeOf = (fn) => {
  try {
    fn();
    return "no error";
  } catch (err) {
    return err.code ?? `threw ${err.constructor.name}`;
  }
};
const u8 = (buf) => new Uint8Array(buf);

// ───────────────────────── Part 1: inputs ─────────────────────────
const docxBytes = u8(readFileSync("tests/fixtures/sleep-and-memory.docx"));
const pptxBytes = u8(readFileSync("tests/fixtures/city-trees.pptx"));

check("fixtures on disk are what scripts/make-fixtures.mjs builds", Buffer.compare(Buffer.from(docxBytes), docx(SLEEP_DOCX)) === 0 && Buffer.compare(Buffer.from(pptxBytes), pptx(TREES_PPTX, [1, 3, 2, 4, 5, 6, 7, 8])) === 0);

const z = openZip(docxBytes);
check("zip: the directory lists the parts and an entry inflates to its XML", z.names.includes("word/document.xml") && z.read("word/document.xml").toString("utf8").startsWith("<?xml") && z.read("nope.xml") === null);

const word = sourceFromOffice(docxBytes, "sleep-and-memory.docx", "docx");
check("docx: title becomes the name, kind is text, format is docx", word.name === "Sleep and memory: a study guide" && word.kind === "text" && word.format === "docx", `name="${word.name}"`);
check("docx: headings become headings of the next block, not blocks of their own", word.blocks[0].heading === "Why sleep matters for learning" && word.blocks.every((b) => b.text !== "What it found") && word.blocks.some((b) => b.heading === "What it found"), `${word.blocks.length} blocks`);
check("docx: runs of one paragraph are joined", word.blocks.some((b) => b.text.includes("were measured and not only reported")));
const list = word.blocks.find((b) => b.heading === "Three habits the students named");
check("docx: short list items stay together in one block; entities are decoded", Boolean(list) && list.text.split("\n").length === 3 && list.text.includes("school days & weekends"), list?.text.replace(/\n/g, " / "));
check("docx: block numbers run 1..n and every block counts as readable", word.blocks.every((b, k) => b.n === k + 1) && word.count === word.blocks.length && word.pageStatus.every((p) => p.status === "ok"));
check("docx: a sentence of the document is found in its block by the quote check", word.pages.filter((p) => quoteFound(p.text, "Students who slept at least 8 hours remembered 31 of the 40 pairs on average")).length === 1);

const deck = sourceFromOffice(pptxBytes, "city-trees.pptx", "pptx");
check("pptx: one block per slide, block n is slide n", deck.count === 8 && deck.blocks.every((b, k) => b.n === k + 1), `${deck.count} slides`);
check("pptx: slides follow the presentation order, not the file names", deck.blocks[1].heading === "The question" && deck.blocks[2].heading === "How the class measured", `2="${deck.blocks[1].heading}" 3="${deck.blocks[2].heading}"`);
check("pptx: the title is the block heading and is not repeated in the text", deck.blocks[4].heading === "The result" && !deck.blocks[4].text.includes("The result") && deck.blocks[4].text.includes("34 °C"));
check("pptx: a slide without text keeps its number and is listed as not readable", deck.blocks[3].text === "" && deck.pageStatus[3].status === "unreadable" && deck.pageStatus.filter((p) => p.status === "unreadable").length === 1);
check("pptx: the first slide title names the source", deck.name === "City trees: what one street can do", deck.name);

// Wrong, damaged, protected, empty.
const ole = u8(Buffer.concat([Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]), Buffer.alloc(600)]));
check("a password-protected Office file (OLE container) is named as such", codeOf(() => sourceFromOffice(ole, "secret.docx", "docx")) === "protected_document");
check("a zip with encrypted entries is named as protected", codeOf(() => sourceFromOffice(u8(zip({ "word/document.xml": "<w:document/>" }, { encrypted: true })), "locked.docx", "docx")) === "protected_document");
check("a file that is not a zip archive is refused as unreadable", codeOf(() => sourceFromOffice(u8(Buffer.from("just some text, renamed")), "fake.docx", "docx")) === "invalid_document");
check("a cut-off archive is refused as unreadable", codeOf(() => sourceFromOffice(docxBytes.subarray(0, docxBytes.length - 200), "cut.docx", "docx")) === "invalid_document");
const damaged = Buffer.from(docxBytes);
const at = damaged.indexOf("word/document.xml") + "word/document.xml".length;
damaged.fill(0xff, at, at + 40);
check("an archive with a damaged part is refused as unreadable", codeOf(() => sourceFromOffice(u8(damaged), "damaged.docx", "docx")) === "invalid_document");
check("a presentation named .docx is refused, not read as something else", codeOf(() => sourceFromOffice(pptxBytes, "deck.docx", "docx")) === "invalid_document");
check("a Word file with almost no text is refused with the reason", codeOf(() => sourceFromOffice(u8(docx([["", "Only one line."]])), "tiny.docx", "docx")) === "too_little_text");
check("a deck of pictures only is refused with the reason", codeOf(() => sourceFromOffice(u8(pptx([{ body: [] }, { body: [] }])), "pictures.pptx", "pptx")) === "too_little_text");
check("a document over the text limit is refused, not cut", codeOf(() => sourceFromOffice(u8(docx(Array.from({ length: 300 }, () => ["", "word ".repeat(200)]))), "long.docx", "docx")) === "too_long");
const bomb = u8(zip({ "word/document.xml": "a".repeat(3 * 1024 * 1024) }));
check("zip: a small archive that would unpack beyond the limit is not unpacked", bomb.length < 20_000 && codeOf(() => openZip(bomb, 1024 * 1024).read("word/document.xml")) === "threw ZipError", `${bomb.length} bytes packed, 3 MB unpacked, limit 1 MB`);

// Which reader a file gets.
const pdfHead = u8(Buffer.from("%PDF-1.7\n"));
check("format: chosen from the first bytes and the name", formatOf("a.pdf", pdfHead) === "pdf" && formatOf("report.DOCX", docxBytes) === "docx" && formatOf("deck.pptx", pptxBytes) === "pptx" && formatOf("notes.md", u8(Buffer.from("# x"))) === "text" && formatOf("notes.txt", u8(Buffer.from("x"))) === "text");
check("format: a broken file named .pdf still goes to the PDF reader (which reports invalid_pdf)", formatOf("broken.pdf", u8(Buffer.from("not a pdf"))) === "pdf");
check("format: other kinds of file are not accepted", [".doc", ".ppt", ".xlsx", ".png", ".zip", ".exe", ""].every((e) => formatOf("file" + e, u8(Buffer.from("PK\u0003\u0004"))) === null));
check("every accepted ending has a reader and every new error has a text", ACCEPTED_EXTENSIONS.every((e) => formatOf("x" + e, u8(Buffer.from("x"))) !== null) && ["unsupported_type", "invalid_document", "protected_document", "too_little_text"].every((c) => ERROR_TEXT[c]?.title && ERROR_TEXT[c]?.help));

const para = "Sleep is part of learning. ".repeat(20).trim();
check("text file: UTF-8 with BOM, UTF-16 and Windows-1252 are decoded", textFromBytes(u8(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("Grüße")])), "a.txt") === "Grüße" && textFromBytes(u8(Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("Grüße", "utf16le")])), "a.txt") === "Grüße" && textFromBytes(u8(Buffer.from([0x47, 0x72, 0xfc, 0xdf, 0x65])), "a.txt") === "Grüße");
check("text file: binary content is refused", codeOf(() => textFromBytes(u8(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 13])), "image.txt")) === "unsupported_type");
const md = sourceFromText(textFromBytes(u8(Buffer.from(`# Sleep\n\n## Why it matters\n\n${para}\n\n## What to do\n\n${para}`)), "sleep.md"), "sleep");
check("markdown: heading marks are dropped and headings attach to their paragraphs", md.blocks.length === 2 && md.blocks[0].heading === "Why it matters" && md.blocks[1].heading === "What to do", JSON.stringify(md.blocks.map((b) => b.heading)));

// ───────────────────────── Part 2: short mode ─────────────────────────
const item = (id, type, extra = {}) => ({ id, type, title: id, statement: id, source: { page: 1, section: "", quote: "some words quoted from the source text" }, place: "chapter", planned: "chapter", status: "matched", ...extra });
const inv = [
  item("B-01", "background"),
  item("R-01", "result", { quantity: { value: "31", unit: "pairs", reference: "", conditions: "" }, planned: "intro" }),
  item("REF", "reference", { planned: "appendix" }),
  item("R-02", "result", { status: "unclear" }),
  item("M-01", "method"),
  item("C-01", "conclusion"),
  item("A-01", "meta", { planned: "appendix" }),
  item("L-01", "limitation"),
  item("Q-01", "question", { planned: "intro" }),
];
const picked = selectForShort(inv, 4).map((it) => it.id);
check("short: only entries whose quote was found are offered; references and publication data never", !picked.includes("R-02") && !picked.includes("REF") && !picked.includes("A-01"), picked.join(" "));
check("short: results, conclusions and the question come before background and method, in reading order", picked.join(" ") === "R-01 C-01 L-01 Q-01", picked.join(" "));
check("short: with almost nothing to choose from, everything usable is offered", selectForShort(inv.slice(0, 3)).map((it) => it.id).join(" ") === "B-01 R-01 REF");

check("short: an entry whose quote is a fragment of one to three words is left out; captions and formulas may be brief", !hasRealQuote({ type: "conclusion", quote: "out of 40" }) && !hasRealQuote({ type: "result", quote: "sleep" }) && hasRealQuote({ type: "result", quote: "9 more remembered pairs" }) && hasRealQuote({ type: "formula", quote: "E = mc2" }));

const cue = (words, n = 1) => ({ text: Array.from({ length: words }, () => "lesson").join(" "), refs: [`R-0${n}`] });
const scene = (id, cues) => ({ id, type: "statement", title: id, question: id, cues });
const nine = Array.from({ length: 9 }, (_, k) => scene(`s${k + 1}`, [cue(10), cue(10)]));
const cutCount = fitShort(nine);
check(`short: more than ${SHORT.maxScenes} scenes are cut to ${SHORT.maxScenes}; hook and takeaway stay`, cutCount.scenes.length === SHORT.maxScenes && cutCount.scenes[0].id === "s1" && cutCount.scenes.at(-1).id === "s9" && cutCount.notes.length === 1, cutCount.scenes.map((s) => s.id).join(" "));
const wordy = Array.from({ length: 6 }, (_, k) => scene(`s${k + 1}`, [cue(12), cue(12), cue(12), cue(12)]));
const cutLen = fitShort(wordy);
check(`short: a storyboard that is too long is cut below ${SHORT.maxSeconds} s, sentences first`, totalSeconds(wordy) > SHORT.maxSeconds && totalSeconds(cutLen.scenes) <= SHORT.maxSeconds && cutLen.scenes.length === 6 && cutLen.scenes.every((s) => s.cues.length >= 2), `${totalSeconds(wordy).toFixed(0)} s -> ${totalSeconds(cutLen.scenes).toFixed(0)} s`);
check("short: cutting never changes the input", wordy.every((s) => s.cues.length === 4) && nine.length === 9);
const fine = Array.from({ length: 6 }, (_, k) => scene(`s${k + 1}`, [cue(11), cue(11)]));
check("short: a storyboard inside the bounds is left alone", fitShort(fine).notes.length === 0 && fitShort(fine).scenes.length === 6 && shortProblems(fine).length === 0, `${totalSeconds(fine).toFixed(0)} s`);
const recorded = fine.map((s) => ({ ...s, duration: 18 }));
const cutRec = fitShort(recorded);
check("short: recorded lengths count, not estimates; whole points go once sentences cannot", totalSeconds(recorded) === 108 && cutRec.scenes.length === SHORT.minScenes && cutRec.scenes[0].id === "s1" && cutRec.scenes.at(-1).id === "s6");
check("short: the measure reports scenes and seconds outside the bounds", shortProblems(fine.slice(0, 2)).length === 2 && shortProblems(recorded).length === 1 && estimateSceneSeconds(fine[0]) > 9);
const byId = new Map(inv.map((it) => [it.id, it]));
const mixed = scene("s1", [{ text: "Sleep helped.", refs: ["R-01"] }, { text: "It changed everything forever.", refs: ["R-01"] }, { text: "They remembered 99 pairs.", refs: ["R-01"] }]);
const cutBad = cutFailing(mixed, ["Sentence 2 is not supported by its cited passages: adds an evaluation", "Sentence 3 says 99, which is not in the passages it cites (R-01)."], byId);
check("short: sentences that fail a check are cut, the supported one stays word for word", cutBad?.cut === 2 && cutBad.scene.cues.length === 1 && cutBad.scene.cues[0].text === "Sleep helped." && mixed.cues.length === 3);
check("short: a scene is not cut when nothing sourced would remain, or when the problem is not about one sentence", cutFailing(mixed, ["Sentence 1 x", "Sentence 2 x", "Sentence 3 x"], byId) === null && cutFailing(mixed, ['Chart value "5" does not match the passage of R-01.'], byId) === null && cutFailing(mixed, [], byId) === null);
check("short: a headline scene whose first sentence fails is not cut (the headline would lose its voice)", cutFailing({ ...mixed, cues: mixed.cues.slice(0, 2) }, ["Sentence 1 is not supported by its cited passages: x"], byId) === null && cutFailing({ ...mixed, type: "points", cues: mixed.cues.slice(0, 2) }, ["Sentence 1 is not supported by its cited passages: x"], byId)?.cut === 1);
check("short: a cut that would leave another failing sentence behind is not made", cutFailing({ ...mixed, type: "points" }, ["Sentence 1 is not supported by its cited passages: x"], byId) === null);
check('short: only "short" selects short mode; anything else is a full lesson', asMode("short") === "short" && asMode("full") === "full" && asMode(null) === "full" && asMode("SHORT") === "full");

// The lesson file: the mode is optional, so files written before it existed still load.
const demoScene = { id: "intro-1", type: "question", title: "t", question: "q", cues: [{ text: "A sentence.", refs: [] }] };
const chapter = { id: "intro", kind: "intro", title: "Highlights", summary: "", scenes: [demoScene] };
const base = {
  format: "paperscenes.lesson",
  version: 2,
  revision: 1,
  savedAt: "2026-11-22T00:00:00.000Z",
  provenance: { sourceKind: "text", sourceName: "x", sourceHash: "0", provider: "bedrock", models: { fast: "a", strong: "b", vision: "c" }, promptVersion: "p", voice: "browser", runs: [] },
  lesson: { id: "l-test", origin: "upload", meta: { title: "t", authors: "", venue: "", year: "", pdfUrl: "", pages: 1, sourceKind: "text" }, inventory: [], intro: chapter, chapters: [], details: [], appendix: [], pageStatus: [], verification: { mode: "auto", fullyChecked: false, method: "", quoteChecks: { total: 0, matched: 0, failed: [] }, notes: [] }, hasRecordedVoice: false },
};
const asShort = { ...base, provenance: { ...base.provenance, mode: "short", sourceFormat: "pptx" }, lesson: { ...base.lesson, meta: { ...base.lesson.meta, mode: "short" } } };
check("lesson file: a file without a mode is valid (older lessons are full lessons)", LessonFileSchema.safeParse(base).success);
check("lesson file: a short with no chapters, its mode and its source format is valid", LessonFileSchema.safeParse(asShort).success);
check("lesson file: an unknown mode is rejected", !LessonFileSchema.safeParse({ ...asShort, provenance: { ...asShort.provenance, mode: "tiny" } }).success);

console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
