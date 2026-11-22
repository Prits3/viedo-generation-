// One internal source structure for every input format.
// A source is a list of numbered blocks: PDF pages, paragraphs of a text or a Word file, or
// slides of a presentation.
// Everything downstream (inventory, quote check, source view) only sees blocks, so a statement
// always points at "block n" and the UI names it "p. n" or "§n".
import { createHash } from "node:crypto";
import type { PageStatus, SourceBlock } from "./types.ts";
import { extractPdfText, type PageText } from "./pdf-text.ts";
import { GenerateError } from "./errors.ts";
import { LIMITS } from "./limits.ts";
import { readDocx, readPptx, type OfficeText } from "./office.ts";
import { ZipError } from "./zip.ts";

/** What the upload was. `kind` says how its blocks are addressed (pages or paragraphs). */
export type SourceFormat = "pdf" | "text" | "docx" | "pptx";

export interface SourceDoc {
  kind: "pdf" | "text";
  /** Absent in sources stored before other formats existed: then it equals `kind`. */
  format?: SourceFormat;
  /** File name or a title taken from the text. */
  name: string;
  /** sha256 of the original bytes; stored with the lesson as provenance. */
  hash: string;
  /** Blocks in reading order. `page` is the block number (PDF page or paragraph). */
  pages: PageText[];
  pageStatus: PageStatus[];
  count: number;
  chars: number;
  /** Paragraphs with their headings (text sources only), kept for the source view. */
  blocks?: SourceBlock[];
}

export const sha256 = (data: Uint8Array | string) => createHash("sha256").update(data).digest("hex");

export async function sourceFromPdf(bytes: Uint8Array, name: string): Promise<SourceDoc> {
  const header = new TextDecoder("latin1").decode(bytes.subarray(0, 1024));
  if (!header.includes("%PDF-")) throw new GenerateError("invalid_pdf", "The file does not start with a PDF header.");
  const hash = sha256(bytes);
  let extracted;
  try {
    // pdf.js transfers the buffer, so hand it a copy and keep the original for storage.
    extracted = await extractPdfText(bytes.slice(), LIMITS.maxPages + 1);
  } catch {
    throw new GenerateError("invalid_pdf", "pdf.js could not parse the file.");
  }
  if (extracted.numPages > LIMITS.maxPages) throw new GenerateError("too_many_pages", `${extracted.numPages} pages.`);
  const readable = extracted.pages.filter((p) => extracted.pageStatus.find((s) => s.page === p.page)?.status === "ok");
  const chars = readable.reduce((n, p) => n + p.text.length, 0);
  if (readable.length === 0 || chars < LIMITS.minTextChars) throw new GenerateError("no_text_layer", `${chars} characters of text on ${extracted.numPages} page(s).`);
  if (chars > LIMITS.maxTextChars) throw new GenerateError("too_long", `${chars} characters of text.`);
  return { kind: "pdf", name, hash, pages: extracted.pages, pageStatus: extracted.pageStatus, count: extracted.numPages, chars };
}

/**
 * Splits pasted text into paragraphs. A short first line followed by body text is kept as the
 * paragraph's heading (this also covers the "§1 Heading" layout of the backend's sample texts).
 */
export function sourceFromText(raw: string, name = "Pasted text"): SourceDoc {
  const text = raw.replace(/\r\n?/g, "\n").replace(/\u0000/g, "").trim();
  if (text.length < LIMITS.minPastedChars) throw new GenerateError("invalid_text", `${text.length} characters; at least ${LIMITS.minPastedChars} are needed.`);
  if (text.length > LIMITS.maxPastedChars) throw new GenerateError("too_long", `${text.length} characters of text.`);
  const parts = text
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  // A text without blank lines: fall back to one block per line.
  const paras = parts.length > 1 ? parts : text.split(/\n+/).map((p) => p.trim()).filter(Boolean);
  const blocks: SourceBlock[] = [];
  let pendingHeading: string | undefined;
  for (const p of paras) {
    const lines = p.split("\n");
    const first = lines[0].trim();
    const headingLike = first.length <= 90 && !/[.!?:;,]$/.test(first);
    if (lines.length === 1 && headingLike && first.split(/\s+/).length <= 12) {
      // A heading on its own line belongs to the next paragraph.
      pendingHeading = first;
      continue;
    }
    let heading = pendingHeading;
    let body = p;
    if (lines.length > 1 && headingLike) {
      heading = first;
      body = lines.slice(1).join("\n").trim();
    }
    pendingHeading = undefined;
    blocks.push({ n: blocks.length + 1, heading, text: body.replace(/\s*\n\s*/g, " ") });
  }
  if (pendingHeading && blocks.length === 0) blocks.push({ n: 1, text: pendingHeading });
  if (blocks.length === 0) throw new GenerateError("invalid_text", "No paragraphs found.");
  if (blocks.length > LIMITS.maxParagraphs) throw new GenerateError("too_long", `${blocks.length} paragraphs.`);
  const title = name !== "Pasted text" ? name : blocks[0].heading ?? "Pasted text";
  return {
    kind: "text",
    name: title,
    hash: sha256(text),
    // The heading is part of the block's searchable text, so a quote may come from it too.
    pages: blocks.map((b) => ({ page: b.n, text: b.heading ? `${b.heading}\n${b.text}` : b.text })),
    pageStatus: blocks.map((b) => ({ page: b.n, chars: b.text.length, status: "ok" as const })),
    count: blocks.length,
    chars: text.length,
    blocks,
  };
}

/**
 * Which reader an uploaded file gets, from its first bytes and its name. Null when it is neither
 * a PDF, a Word or PowerPoint file, nor a plain-text file.
 */
export function formatOf(name: string, bytes: Uint8Array): SourceFormat | null {
  const ext = /\.[a-z0-9]+$/i.exec(name)?.[0].toLowerCase() ?? "";
  if (new TextDecoder("latin1").decode(bytes.subarray(0, 1024)).includes("%PDF-") || ext === ".pdf") return "pdf";
  if (ext === ".docx" || ext === ".pptx") return ext.slice(1) as SourceFormat;
  if (ext === ".txt" || ext === ".md" || ext === ".markdown") return "text";
  return null;
}

/** The text of an uploaded .txt or .md file. Refuses binary content instead of showing garbage. */
export function textFromBytes(bytes: Uint8Array, name: string): string {
  let text: string;
  if (bytes[0] === 0xff && bytes[1] === 0xfe) text = new TextDecoder("utf-16le").decode(bytes);
  else if (bytes[0] === 0xfe && bytes[1] === 0xff) text = new TextDecoder("utf-16be").decode(bytes);
  else {
    if (bytes.subarray(0, 8000).includes(0)) throw new GenerateError("unsupported_type", "The file is not plain text.");
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      text = new TextDecoder("windows-1252").decode(bytes);
    }
  }
  text = text.replace(/^﻿/, "");
  // Markdown heading marks are layout, not content.
  return /\.(md|markdown)$/i.test(name) ? text.replace(/^#{1,6}[ \t]+/gm, "") : text;
}

const OLE = [0xd0, 0xcf, 0x11, 0xe0];
const withoutExt = (name: string) => name.replace(/\.[a-z0-9]+$/i, "");

/**
 * A Word or PowerPoint file as source blocks: paragraphs of a document, slides of a presentation.
 * An encrypted Office file is not a zip archive but an OLE container, like the old .doc format.
 */
export function sourceFromOffice(bytes: Uint8Array, name: string, format: "docx" | "pptx"): SourceDoc {
  const what = format === "docx" ? "Word document" : "PowerPoint presentation";
  if (OLE.every((b, k) => bytes[k] === b)) throw new GenerateError("protected_document", `The file is an encrypted or old-format Office container, not a .${format} archive.`);
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) throw new GenerateError("invalid_document", `The file is not a .${format} archive.`);
  let read: OfficeText | null;
  try {
    read = format === "docx" ? readDocx(bytes) : readPptx(bytes);
  } catch (err) {
    if (err instanceof ZipError && err.reason === "encrypted") throw new GenerateError("protected_document", "The archive is encrypted.");
    throw new GenerateError("invalid_document", err instanceof ZipError ? err.message : "The archive could not be read.");
  }
  if (!read) throw new GenerateError("invalid_document", `The archive does not contain a ${what}.`);
  const { blocks } = read;
  const unit = format === "docx" ? "paragraphs" : "slides";
  const chars = blocks.reduce((n, b) => n + b.text.length + (b.heading?.length ?? 0), 0);
  if (chars < LIMITS.minPastedChars) throw new GenerateError("too_little_text", `${chars} characters of text in ${blocks.length} ${unit}.`);
  if (chars > LIMITS.maxTextChars) throw new GenerateError("too_long", `${chars} characters of text.`);
  if (blocks.length > (format === "docx" ? LIMITS.maxDocBlocks : LIMITS.maxSlides)) throw new GenerateError("too_long", `${blocks.length} ${unit}.`);
  return {
    kind: "text",
    format,
    name: read.title?.slice(0, 120) || withoutExt(name),
    hash: sha256(bytes),
    pages: blocks.map((b) => ({ page: b.n, text: b.heading ? `${b.heading}\n${b.text}` : b.text })),
    // A slide that holds only a picture has nothing to cite; it is listed as not covered.
    pageStatus: blocks.map((b) => ({ page: b.n, chars: b.text.length + (b.heading?.length ?? 0), status: b.text || b.heading ? ("ok" as const) : ("unreadable" as const) })),
    count: blocks.length,
    chars,
    blocks,
  };
}
