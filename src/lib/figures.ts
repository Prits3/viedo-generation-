// Server-only: renders one PDF page to an image and crops regions from it, for the step that
// shows an original figure or table. Uses the canvas package that pdf.js itself installs as an
// optional dependency; when it is not available on a platform, the step is skipped.
import type { PageRegion } from "./types.ts";

interface CanvasLike {
  width: number;
  height: number;
  getContext(kind: "2d"): unknown;
  toBuffer(mime: "image/png"): Buffer;
}
interface CanvasModule {
  createCanvas(w: number, h: number): CanvasLike;
  loadImage(src: Buffer): Promise<{ width: number; height: number }>;
}

async function canvasModule(): Promise<CanvasModule | null> {
  try {
    return (await import("@napi-rs/canvas")) as unknown as CanvasModule;
  } catch {
    return null;
  }
}

export interface PageImage {
  png: Buffer;
  width: number;
  height: number;
}

export async function renderPdfPage(pdf: Uint8Array, pageNo: number, width = 1400): Promise<PageImage | null> {
  const cv = await canvasModule();
  if (!cv) return null;
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data: pdf.slice(), useSystemFonts: true, verbosity: 0 });
  try {
    const doc = await task.promise;
    const page = await doc.getPage(pageNo);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: width / base.width });
    const canvas = cv.createCanvas(Math.round(viewport.width), Math.round(viewport.height));
    const ctx = canvas.getContext("2d") as { fillStyle: string; fillRect(x: number, y: number, w: number, h: number): void };
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await page.render({ canvasContext: ctx as any, canvas: canvas as any, viewport }).promise;
    return { png: canvas.toBuffer("image/png"), width: canvas.width, height: canvas.height };
  } finally {
    await task.destroy();
  }
}

export const clampBox = (b: PageRegion): PageRegion => {
  const x = Math.min(Math.max(b.x, 0), 0.98);
  const y = Math.min(Math.max(b.y, 0), 0.98);
  return { x, y, w: Math.min(Math.max(b.w, 0.02), 1 - x), h: Math.min(Math.max(b.h, 0.02), 1 - y) };
};

export async function cropPng(image: PageImage, box: PageRegion): Promise<PageImage | null> {
  const cv = await canvasModule();
  if (!cv) return null;
  const b = clampBox(box);
  const sx = Math.round(b.x * image.width);
  const sy = Math.round(b.y * image.height);
  const sw = Math.max(8, Math.round(b.w * image.width));
  const sh = Math.max(8, Math.round(b.h * image.height));
  const canvas = cv.createCanvas(sw, sh);
  const ctx = canvas.getContext("2d") as { drawImage(img: unknown, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number): void };
  ctx.drawImage(await cv.loadImage(image.png), sx, sy, sw, sh, 0, 0, sw, sh);
  return { png: canvas.toBuffer("image/png"), width: sw, height: sh };
}

// ───────────────────────── text-layer geometry ─────────────────────────
export interface TextLine {
  top: number;
  bottom: number;
  left: number;
  right: number;
  text: string;
}

/** Lines of text on a page with their position, as fractions of the page (origin top-left). */
export async function pageLines(pdf: Uint8Array, pageNo: number): Promise<TextLine[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data: pdf.slice(), useSystemFonts: true, verbosity: 0 });
  try {
    const doc = await task.promise;
    const page = await doc.getPage(pageNo);
    const vp = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const lines: (TextLine & { base: number })[] = [];
    for (const item of content.items) {
      if (!("str" in item) || !item.str.trim()) continue;
      const [vx, vy] = vp.convertToViewportPoint(item.transform[4], item.transform[5]);
      const h = Math.max(item.height, 4);
      const box = { top: (vy - h) / vp.height, bottom: (vy + h * 0.25) / vp.height, left: vx / vp.width, right: (vx + item.width) / vp.width, base: vy / vp.height };
      const line = lines.find((l) => Math.abs(l.base - box.base) < (h * 0.45) / vp.height);
      if (line) {
        line.top = Math.min(line.top, box.top);
        line.bottom = Math.max(line.bottom, box.bottom);
        line.left = Math.min(line.left, box.left);
        line.right = Math.max(line.right, box.right);
        line.text += " " + item.str;
      } else lines.push({ ...box, text: item.str });
    }
    return lines.sort((a, b) => a.top - b.top).map(({ base: _base, ...l }) => l);
  } finally {
    await task.destroy();
  }
}

const canonLite = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");
const isCaption = (text: string) => /^\s*(table|figure|fig\.?)\s*\d+/i.test(text);

/**
 * Finds a figure or table on its page from the text layer alone, so the crop is exact and does
 * not depend on a model's sense of position. `quote` is the entry's quote: either the caption or
 * a row of the table itself.
 *  - Lines are grouped into blocks separated by vertical gaps.
 *  - If the quote is inside a caption, the object is next to it: a tall empty band (a graphic)
 *    or, failing that, the neighbouring block that looks most like a table.
 *  - Otherwise the block containing the quote is the object (a table quoted by its header row).
 * Returns null when the quote is not on the page or no plausible region is found.
 */
export function locateInText(lines: TextLine[], quote: string): PageRegion | null {
  const needle = canonLite(quote).slice(0, 24);
  if (needle.length < 8 || lines.length === 0) return null;
  const at = lines.findIndex((l, k) => canonLite(l.text + (lines[k + 1]?.text ?? "")).includes(needle) && canonLite(l.text).includes(needle.slice(0, 8)));
  if (at < 0) return null;
  const heights = lines.map((l) => l.bottom - l.top).sort((a, b) => a - b);
  const lineH = Math.max(0.006, heights[Math.floor(heights.length / 2)]);
  // Blocks: runs of lines without a gap of half a line or more.
  const blocks: { from: number; to: number; top: number; bottom: number }[] = [];
  lines.forEach((l, k) => {
    const last = blocks[blocks.length - 1];
    if (last && l.top - last.bottom < lineH * 0.5) {
      last.to = k;
      last.bottom = Math.max(last.bottom, l.bottom);
    } else blocks.push({ from: k, to: k, top: l.top, bottom: l.bottom });
  });
  const bi = blocks.findIndex((b) => at >= b.from && at <= b.to);
  const block = blocks[bi];
  const tabular = (b: { from: number; to: number }) => {
    const text = lines.slice(b.from, b.to + 1).map((l) => l.text).join(" ");
    const tokens = text.split(/\s+/).filter(Boolean);
    return tokens.length ? tokens.filter((t) => /\d/.test(t) || t.length <= 3).length / tokens.length : 0;
  };
  let top: number;
  let bottom: number;
  let from = block.from;
  let to = block.to;
  if (isCaption(lines[block.from].text)) {
    const prev = blocks[bi - 1];
    const next = blocks[bi + 1];
    const gapAbove = block.top - (prev?.bottom ?? 0.04);
    const gapBelow = (next?.top ?? 0.96) - block.bottom;
    if (Math.max(gapAbove, gapBelow) > 0.07) {
      // A graphic without text of its own sits in the tall empty band beside the caption.
      // By convention a figure sits above its caption; the band below is only used when there is none above.
      if (gapAbove > 0.07) [top, bottom] = [(prev?.bottom ?? 0.04) + lineH * 0.3, block.top - lineH * 0.2];
      else [top, bottom] = [block.bottom + lineH * 0.2, (next?.top ?? 0.96) - lineH * 0.3];
      from = to = -1;
    } else {
      const cands = [prev, next].filter((b): b is NonNullable<typeof b> => Boolean(b) && !isCaption(lines[b!.from].text));
      // Of the neighbouring blocks that look like a table, the one closer to the caption belongs to it.
      const gap = (b: { top: number; bottom: number }) => (b.bottom <= block.top ? block.top - b.bottom : b.top - block.bottom);
      const best = cands.filter((b) => tabular(b) >= 0.3).sort((a, b) => gap(a) - gap(b))[0];
      if (!best) return null;
      [top, bottom, from, to] = [best.top - lineH * 0.6, best.bottom + lineH * 0.5, best.from, best.to];
    }
  } else {
    [top, bottom] = [block.top - lineH * 0.6, block.bottom + lineH * 0.5];
  }
  if (bottom - top < 0.025 || bottom - top > 0.6) return null;
  const inside = from >= 0 ? lines.slice(from, to + 1) : lines.filter((l) => l.top >= top && l.bottom <= bottom);
  const col = lines.filter((l) => l.right - l.left > 0.45);
  const left = (inside.length ? Math.min(...inside.map((l) => l.left)) : col.length ? Math.min(...col.map((l) => l.left)) : 0.08) - 0.025;
  const right = (inside.length ? Math.max(...inside.map((l) => l.right)) : col.length ? Math.max(...col.map((l) => l.right)) : 0.92) + 0.025;
  return clampBox({ x: left, y: top, w: right - left, h: bottom - top });
}
