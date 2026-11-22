// Builds the small Word and PowerPoint files used by scripts/check-inputs.mjs and for trying the
// upload by hand. They are written from the texts below with a minimal zip writer, so the
// repository needs no Office and no extra package to recreate them.
//   node scripts/make-fixtures.mjs            -> tests/fixtures/sleep-and-memory.docx, tests/fixtures/city-trees.pptx
import { mkdirSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { crc32, deflateRawSync } from "node:zlib";

/** A zip archive from name -> text. `encrypted` sets the flag a password-protected entry carries. */
export function zip(files, { encrypted = false } = {}) {
  const local = [];
  const central = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const raw = Buffer.from(text, "utf8");
    const data = deflateRawSync(raw);
    const nameBuf = Buffer.from(name, "utf8");
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0);
    head.writeUInt16LE(20, 4);
    head.writeUInt16LE(encrypted ? 1 : 0, 6);
    head.writeUInt16LE(8, 8);
    head.writeUInt32LE(crc32(raw), 14);
    head.writeUInt32LE(data.length, 18);
    head.writeUInt32LE(raw.length, 22);
    head.writeUInt16LE(nameBuf.length, 26);
    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(20, 4);
    dir.writeUInt16LE(20, 6);
    head.copy(dir, 8, 6, 30); // flags, method, time, date, crc, sizes, name length, extra length
    dir.writeUInt32LE(offset, 42);
    local.push(head, nameBuf, data);
    central.push(dir, nameBuf);
    offset += 30 + nameBuf.length + data.length;
  }
  const dirBytes = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(dirBytes.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, dirBytes, end]);
}

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';

// ───────────────────────── Word ─────────────────────────
/** paragraphs: [style | "", text]. A text containing "|" is written as several runs, as Word does. */
export function docx(paragraphs) {
  const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
  const body = paragraphs
    .map(([style, text]) => {
      const runs = text.split("|").map((t) => `<w:r><w:t xml:space="preserve">${esc(t)}</w:t></w:r>`).join("");
      return `<w:p>${style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : ""}${runs}</w:p>`;
    })
    .join("");
  return zip({
    "[Content_Types].xml": `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
    "_rels/.rels": `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    "word/document.xml": `${XML}<w:document xmlns:w="${W}"><w:body>${body}<w:p/><w:sectPr/></w:body></w:document>`,
  });
}

// ───────────────────────── PowerPoint ─────────────────────────
/**
 * slides: { title?, body: string[] }. `fileOrder` gives the number of the slide file each slide is
 * stored in, so the order of the presentation can differ from the order of the file names.
 */
export function pptx(slides, fileOrder = slides.map((_, k) => k + 1)) {
  const A = "http://schemas.openxmlformats.org/drawingml/2006/main";
  const P = "http://schemas.openxmlformats.org/presentationml/2006/main";
  const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
  const para = (t) => `<a:p><a:r><a:rPr lang="en-US"/><a:t>${esc(t)}</a:t></a:r></a:p>`;
  const files = {
    "[Content_Types].xml": `${XML}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>${slides.map((_, k) => `<Override PartName="/ppt/slides/slide${k + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join("")}</Types>`,
    "_rels/.rels": `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${R}/officeDocument" Target="ppt/presentation.xml"/></Relationships>`,
    "ppt/presentation.xml": `${XML}<p:presentation xmlns:a="${A}" xmlns:r="${R}" xmlns:p="${P}"><p:sldIdLst>${slides.map((_, k) => `<p:sldId id="${256 + k}" r:id="rId${k + 1}"/>`).join("")}</p:sldIdLst></p:presentation>`,
    "ppt/_rels/presentation.xml.rels": `${XML}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${slides.map((_, k) => `<Relationship Id="rId${k + 1}" Type="${R}/slide" Target="slides/slide${fileOrder[k]}.xml"/>`).join("")}</Relationships>`,
  };
  slides.forEach((s, k) => {
    const title = s.title ? `<p:sp><p:nvSpPr><p:cNvPr id="2" name="Title 1"/><p:cNvSpPr/><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/>${para(s.title)}</p:txBody></p:sp>` : "";
    const body = s.body.length ? `<p:sp><p:nvSpPr><p:cNvPr id="3" name="Content 2"/><p:cNvSpPr/><p:nvPr><p:ph idx="1"/></p:nvPr></p:nvSpPr><p:spPr/><p:txBody><a:bodyPr/>${s.body.map(para).join("")}</p:txBody></p:sp>` : "";
    files[`ppt/slides/slide${fileOrder[k]}.xml`] = `${XML}<p:sld xmlns:a="${A}" xmlns:r="${R}" xmlns:p="${P}"><p:cSld><p:spTree>${title}${body}</p:spTree></p:cSld></p:sld>`;
  });
  return zip(files);
}

// ───────────────────────── the two fixtures (own text, written for this repository) ─────────────────────────
export const SLEEP_DOCX = [
  ["Title", "Sleep and memory: a study guide"],
  ["Heading1", "Why sleep matters for learning"],
  ["", "Learning does not end when a lesson ends. During the night the brain replays what happened during the day, and this replay decides how much of it is still there the next morning. This guide summarises a fictional classroom study that was written as practice material; its numbers are examples, not research results."],
  ["Heading1", "What the study did"],
  ["", "The study followed 120 students for four weeks. Each student learned 40 new vocabulary pairs on Monday evening and was tested on Tuesday morning. Half of the group was asked to sleep at least 8 hours, the other half was limited to 5 hours."],
  ["", "Every student wore a simple wrist tracker, so the hours of sleep were measured | and not only reported by the students themselves."],
  ["Heading1", "What it found"],
  ["", "Students who slept at least 8 hours remembered 31 of the 40 pairs on average. Students who slept 5 hours remembered 22 of the 40 pairs. The difference of 9 pairs appeared in every one of the four weeks."],
  ["", "A short nap helped as well, but less. Students in the short-sleep group who took a 20 minute nap after school remembered 25 pairs, which is 3 more than without the nap."],
  ["Heading2", "Three habits the students named"],
  ["ListParagraph", "No screens in the last 30 minutes before bed"],
  ["ListParagraph", "The same bedtime on school days & weekends"],
  ["ListParagraph", "Repeating the vocabulary once, right before sleeping"],
  ["Heading1", "What the study cannot show"],
  ["", "The study lasted only four weeks and looked at one kind of material, vocabulary pairs. It may not hold for skills such as mathematics or sport. The students also knew which group they were in, which can change how hard they try."],
  ["Heading1", "Takeaway"],
  ["", "If there is one thing to remember, it is this: the hours of sleep after learning are part of the learning. In this study, three more hours of sleep were worth 9 more remembered pairs out of 40."],
];

export const TREES_PPTX = [
  { title: "City trees: what one street can do", body: ["A practice deck written for this repository. The numbers are examples for a school project, not measurements."] },
  { title: "The question", body: ["Can a single row of street trees make a hot street noticeably cooler in summer?", "The class measured one street with trees and one without, 300 metres apart."] },
  { title: "How the class measured", body: ["Two thermometers at a height of 1.5 metres, read every hour from 10:00 to 18:00.", "Measured on 12 sunny days in July.", "Both streets have the same width and the same dark asphalt."] },
  { body: [] },
  { title: "The result", body: ["At 15:00 the street without trees reached 34 °C on average.", "The street with trees reached 31 °C at the same time.", "The difference was largest in the afternoon and close to zero at 10:00 in the morning."] },
  { title: "Why shade is not the whole story", body: ["Leaves also release water, which cools the air around them.", "On the 2 days after rain the difference grew from 3 °C to 4 °C."] },
  { title: "Limits", body: ["Only two streets were compared, so other differences between them may play a role.", "The class did not measure at night, when trees can hold warm air under their crowns."] },
  { title: "Takeaway", body: ["One row of trees made the afternoon about 3 °C cooler on this street.", "The effect depends on water: trees that are dry cool less."] },
];

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  mkdirSync("tests/fixtures", { recursive: true });
  writeFileSync("tests/fixtures/sleep-and-memory.docx", docx(SLEEP_DOCX));
  // Slides 2 and 3 are stored in swapped files, as happens after slides were reordered in PowerPoint.
  writeFileSync("tests/fixtures/city-trees.pptx", pptx(TREES_PPTX, [1, 3, 2, 4, 5, 6, 7, 8]));
  console.log("wrote tests/fixtures/sleep-and-memory.docx and tests/fixtures/city-trees.pptx");
}
