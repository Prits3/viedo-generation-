// Text of Word (.docx) and PowerPoint (.pptx) files as source blocks. Both formats are zip
// archives of XML; only the text is read (no images, no charts, no speaker notes, no comments).
//
//   docx  blocks are paragraphs; a paragraph in a heading style becomes the heading of the block
//         after it, and short paragraphs (list items, table cells) stay with the block before them
//   pptx  one block per slide, in presentation order, so block n is slide n
import type { SourceBlock } from "./types.ts";
import { openZip, type Zip } from "./zip.ts";

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const decode = (s: string) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] !== "#") return ENTITIES[e.toLowerCase()] ?? m;
    const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
    return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : "";
  });
const tidy = (s: string) => s.replace(/[ \t ]+/g, " ").replace(/ ?\n ?/g, "\n").trim();
const xml = (zip: Zip, name: string) => zip.read(name)?.toString("utf8") ?? null;

/**
 * A short paragraph (a list item, a table cell) joins the block before it, up to a block size, so
 * it can be quoted together with the sentence that introduces it.
 */
const SHORT_PARAGRAPH = 120;
const MERGED_BLOCK = 600;

export interface OfficeText {
  /** The document's own title, when it has one. */
  title?: string;
  blocks: SourceBlock[];
}

// ───────────────────────── Word ─────────────────────────
export function isDocx(names: string[]): boolean {
  return names.includes("word/document.xml");
}

export function readDocx(bytes: Uint8Array): OfficeText | null {
  const zip = openZip(bytes);
  const doc = xml(zip, "word/document.xml");
  if (doc === null) return null;
  const body = doc.replace(/<w:p(?:\s[^>]*)?\/>/g, "");
  const blocks: SourceBlock[] = [];
  let title: string | undefined;
  let heading: string | undefined;
  let open = false; // true while the last block may still take another short paragraph
  for (const m of body.matchAll(/<w:p(?:\s[^>]*)?>([\s\S]*?)<\/w:p>/g)) {
    const p = m[1];
    let text = "";
    for (const t of p.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:(tab|br|cr|noBreakHyphen)(?:\s[^>]*)?\/>/g)) text += t[1] !== undefined ? decode(t[1]) : t[2] === "noBreakHyphen" ? "-" : " ";
    text = tidy(text);
    if (!text) continue;
    const style = /<w:pStyle\s[^>]*w:val="([^"]+)"/.exec(p)?.[1] ?? "";
    if (/^(title|titel)$/i.test(style)) {
      title ??= text;
      continue;
    }
    if (/^(heading|berschrift|subtitle|untertitel)\s*\d*$/i.test(style)) {
      heading = text;
      open = false;
      continue;
    }
    const last = blocks[blocks.length - 1];
    if (open && last && !heading && text.length < SHORT_PARAGRAPH && last.text.length + text.length < MERGED_BLOCK) last.text += "\n" + text;
    else blocks.push({ n: blocks.length + 1, heading, text });
    heading = undefined;
    open = true;
  }
  return { title, blocks };
}

// ───────────────────────── PowerPoint ─────────────────────────
export function isPptx(names: string[]): boolean {
  return names.includes("ppt/presentation.xml");
}

/** Slide files in presentation order (the order of the slide list, not of the file names). */
const slideNo = (name: string) => Number(/slide(\d+)\.xml$/.exec(name)?.[1] ?? 0);
function slideFiles(zip: Zip): string[] {
  const numbered = zip.names.filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => slideNo(a) - slideNo(b));
  const pres = xml(zip, "ppt/presentation.xml");
  const rels = xml(zip, "ppt/_rels/presentation.xml.rels");
  if (!pres || !rels) return numbered;
  const target = new Map<string, string>();
  for (const r of rels.matchAll(/<Relationship\s[^>]*>/g)) {
    const id = /\sId="([^"]+)"/.exec(r[0])?.[1];
    const to = /\sTarget="([^"]+)"/.exec(r[0])?.[1];
    if (id && to) target.set(id, "ppt/" + to.replace(/^\/ppt\//, "").replace(/^\.\//, ""));
  }
  const ordered = [...pres.matchAll(/<p:sldId\s[^>]*r:id="([^"]+)"/g)].map((m) => target.get(m[1]) ?? "").filter((n) => zip.names.includes(n));
  return ordered.length ? ordered : numbered;
}

const paragraphs = (part: string) =>
  [...part.matchAll(/<a:p(?:\s[^>]*)?>([\s\S]*?)<\/a:p>/g)]
    .map((m) => {
      let text = "";
      for (const t of m[1].matchAll(/<a:t(?:\s[^>]*)?>([\s\S]*?)<\/a:t>|<a:(br|tab)(?:\s[^>]*)?\/>/g)) text += t[1] !== undefined ? decode(t[1]) : " ";
      return tidy(text);
    })
    .filter(Boolean);

export function readPptx(bytes: Uint8Array): OfficeText | null {
  const zip = openZip(bytes);
  if (!isPptx(zip.names)) return null;
  const blocks: SourceBlock[] = [];
  slideFiles(zip).forEach((file, k) => {
    const slide = xml(zip, file) ?? "";
    let heading: string | undefined;
    let rest = slide;
    for (const sp of slide.matchAll(/<p:sp>[\s\S]*?<\/p:sp>/g)) {
      if (!/<p:ph\s[^>]*type="(?:title|ctrTitle)"/.test(sp[0])) continue;
      heading = paragraphs(sp[0]).join(" ") || undefined;
      rest = slide.replace(sp[0], "");
      break;
    }
    // A slide without text (a picture, a chart) keeps its number, so block n stays slide n.
    blocks.push({ n: k + 1, heading, text: paragraphs(rest).join("\n") });
  });
  return { title: blocks[0]?.heading, blocks };
}
