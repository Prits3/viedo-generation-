// Server-side text extraction with pdf.js (no rendering, no canvas).
// Returns one text block per page so every later claim can be tied to a page.
import type { PageStatus } from "./types.ts";

export interface PageText {
  page: number;
  text: string;
}

export interface ExtractedPdf {
  pages: PageText[];
  pageStatus: PageStatus[];
  numPages: number;
  title?: string;
  author?: string;
}

/** Pages with fewer characters than this count as unreadable (scan / image only). */
export const MIN_CHARS_PER_READABLE_PAGE = 200;

export async function extractPdfText(data: Uint8Array, maxPages = Infinity): Promise<ExtractedPdf> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjs.getDocument({
    data,
    useSystemFonts: true,
    disableFontFace: true,
    verbosity: 0,
  });
  const doc = await loadingTask.promise;
  try {
    const numPages = doc.numPages;
    const pages: PageText[] = [];
    const pageStatus: PageStatus[] = [];
    const limit = Math.min(numPages, maxPages);
    for (let n = 1; n <= limit; n++) {
      const page = await doc.getPage(n);
      const content = await page.getTextContent();
      let text = "";
      for (const item of content.items) {
        if ("str" in item) {
          text += item.str;
          if (item.hasEOL) text += "\n";
        }
      }
      pages.push({ page: n, text });
      const chars = text.replace(/\s+/g, "").length;
      pageStatus.push({ page: n, chars, status: chars >= MIN_CHARS_PER_READABLE_PAGE ? "ok" : "unreadable" });
      page.cleanup();
    }
    let title: string | undefined;
    let author: string | undefined;
    try {
      const meta = await doc.getMetadata();
      const info = meta.info as { Title?: string; Author?: string } | undefined;
      title = info?.Title || undefined;
      author = info?.Author || undefined;
    } catch {
      /* metadata is optional */
    }
    return { pages, pageStatus, numPages, title, author };
  } finally {
    await loadingTask.destroy();
  }
}
