"use client";

// Renders one page of the original PDF with pdf.js and highlights the cited passage.
// If the passage cannot be located in the text layer, the page is still shown and the
// caller displays the excerpt next to it (stable page jump as the fallback).
import { useEffect, useMemo, useRef, useState } from "react";
import type { PageRegion } from "@/lib/types";
import { canon, canonWithMap } from "@/lib/text";

type PdfModule = typeof import("pdfjs-dist");
type PdfDoc = Awaited<ReturnType<PdfModule["getDocument"]>["promise"]>;

let pdfjsPromise: Promise<PdfModule> | null = null;
const docs = new Map<string, Promise<PdfDoc>>();

function loadPdfjs(): Promise<PdfModule> {
  pdfjsPromise ??= import("pdfjs-dist").then((m) => {
    m.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
    return m;
  });
  return pdfjsPromise;
}

function loadDoc(url: string): Promise<PdfDoc> {
  let p = docs.get(url);
  if (!p) {
    p = loadPdfjs().then((m) => m.getDocument({ url }).promise);
    p.catch(() => docs.delete(url));
    docs.set(url, p);
  }
  return p;
}

interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

interface Props {
  url: string;
  page: number;
  quote?: string;
  region?: PageRegion;
  /** Reports whether the quote was found on the page. */
  onLocated?: (found: boolean) => void;
}

const ZOOMS = [1, 1.4, 1.8, 2.4];

export function PdfPage({ url, page, quote, region, onLocated }: Props) {
  const scroller = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [boxWidth, setBoxWidth] = useState(0);
  const [zoomIdx, setZoomIdx] = useState(quote ? 2 : 0);
  const [rects, setRects] = useState<Rect[]>([]);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [numPages, setNumPages] = useState(0);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const onLocatedRef = useRef(onLocated);
  onLocatedRef.current = onLocated;

  // Text passages need magnification to be legible in a side panel; figures fit the width.
  useEffect(() => setZoomIdx(quote ? 2 : 0), [quote, page]);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBoxWidth(el.clientWidth));
    ro.observe(el);
    setBoxWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const zoom = ZOOMS[zoomIdx];
  const target = useMemo(() => (quote ? canon(quote) : ""), [quote]);

  useEffect(() => {
    if (!boxWidth) return;
    let cancelled = false;
    let task: { cancel: () => void; promise: Promise<unknown> } | null = null;
    setState("loading");
    (async () => {
      try {
        const doc = await loadDoc(url);
        if (cancelled) return;
        setNumPages(doc.numPages);
        const p = await doc.getPage(Math.min(Math.max(page, 1), doc.numPages));
        const base = p.getViewport({ scale: 1 });
        const cssScale = ((boxWidth - 2) / base.width) * zoom;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const vp = p.getViewport({ scale: cssScale * dpr });
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;
        canvas.width = Math.floor(vp.width);
        canvas.height = Math.floor(vp.height);
        const w = vp.width / dpr;
        const h = vp.height / dpr;
        setSize({ w, h });
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        task = p.render({ canvasContext: ctx, viewport: vp, canvas });
        await task.promise;
        if (cancelled) return;

        // Locate the quote in the text layer.
        const found: Rect[] = [];
        if (target.length >= 8) {
          const content = await p.getTextContent();
          const items = content.items.filter((it): it is Extract<(typeof content.items)[number], { str: string }> => "str" in it);
          let full = "";
          const spans: { start: number; end: number; item: (typeof items)[number] }[] = [];
          for (const it of items) {
            spans.push({ start: full.length, end: full.length + it.str.length, item: it });
            full += it.str + (it.hasEOL ? "\n" : "");
          }
          const { text, map } = canonWithMap(full);
          const at = text.indexOf(target);
          if (at >= 0) {
            const from = map[at];
            const to = map[at + target.length - 1] + 1;
            const cssVp = p.getViewport({ scale: cssScale });
            for (const sp of spans) {
              if (sp.end <= from || sp.start >= to || sp.item.str.length === 0) continue;
              const a = Math.max(from, sp.start) - sp.start;
              const b = Math.min(to, sp.end) - sp.start;
              const len = sp.item.str.length;
              const [, , , , e, f] = sp.item.transform as number[];
              const x0 = e + (sp.item.width * a) / len;
              const x1 = e + (sp.item.width * b) / len;
              const hgt = sp.item.height || 8;
              const [vx0, vy0] = cssVp.convertToViewportPoint(x0, f - hgt * 0.22) as number[];
              const [vx1, vy1] = cssVp.convertToViewportPoint(x1, f + hgt * 0.86) as number[];
              found.push({
                left: (Math.min(vx0, vx1) / w) * 100,
                top: (Math.min(vy0, vy1) / h) * 100,
                width: (Math.abs(vx1 - vx0) / w) * 100,
                height: (Math.abs(vy1 - vy0) / h) * 100,
              });
            }
          }
        }
        setRects(found);
        setState("ready");
        onLocatedRef.current?.(found.length > 0);
      } catch (err) {
        if (!cancelled && (err as { name?: string })?.name !== "RenderingCancelledException") {
          setState("error");
          onLocatedRef.current?.(false);
        }
      }
    })();
    return () => {
      cancelled = true;
      task?.cancel();
    };
  }, [url, page, boxWidth, zoom, target]);

  // Bring the highlight (or figure region) into view inside the panel.
  useEffect(() => {
    if (state !== "ready") return;
    const el = scroller.current;
    if (!el || !size.h) return;
    const box = rects.length
      ? {
          x: Math.min(...rects.map((r) => r.left)),
          y: Math.min(...rects.map((r) => r.top)),
          x2: Math.max(...rects.map((r) => r.left + r.width)),
          y2: Math.max(...rects.map((r) => r.top + r.height)),
        }
      : region
        ? { x: region.x * 100, y: region.y * 100, x2: (region.x + region.w) * 100, y2: (region.y + region.h) * 100 }
        : null;
    if (!box) {
      el.scrollTo({ top: 0, left: 0 });
      return;
    }
    const cx = (((box.x + box.x2) / 2) * size.w) / 100;
    const cy = (((box.y + box.y2) / 2) * size.h) / 100;
    el.scrollTo({ top: Math.max(0, cy - el.clientHeight / 2), left: Math.max(0, cx - el.clientWidth / 2) });
    // Make sure the PDF box itself is on screen (it can sit below the fold of the side panel).
    const r = el.getBoundingClientRect();
    if (r.bottom > window.innerHeight || r.top < 0) el.scrollIntoView({ block: "nearest" });
  }, [state, rects, region, size]);

  return (
    <div className="pdf">
      <div className="pdf__bar">
        <span>
          Original PDF · page {page}
          {numPages ? ` of ${numPages}` : ""}
        </span>
        <span className="pdf__zoom">
          <button type="button" onClick={() => setZoomIdx((z) => Math.max(0, z - 1))} disabled={zoomIdx === 0} aria-label="Zoom out">
            −
          </button>
          <span aria-live="polite">{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={() => setZoomIdx((z) => Math.min(ZOOMS.length - 1, z + 1))} disabled={zoomIdx === ZOOMS.length - 1} aria-label="Zoom in">
            +
          </button>
        </span>
      </div>
      <div className="pdf__scroll" ref={scroller} tabIndex={0} aria-label={`PDF page ${page}`} data-state={state} data-highlights={rects.length}>
        <div className="pdf__page" style={{ width: size.w || undefined, height: size.h || undefined }}>
          <canvas ref={canvasRef} style={{ width: size.w || undefined, height: size.h || undefined }} />
          {state === "ready" &&
            rects.map((r, k) => <i key={k} className="pdf__hl" style={{ left: `${r.left}%`, top: `${r.top}%`, width: `${r.width}%`, height: `${r.height}%` }} />)}
          {state === "ready" && region && rects.length === 0 && (
            <i className="pdf__region" style={{ left: `${region.x * 100}%`, top: `${region.y * 100}%`, width: `${region.w * 100}%`, height: `${region.h * 100}%` }} />
          )}
        </div>
        {state === "loading" && <p className="pdf__status">Loading page {page}…</p>}
        {state === "error" && <p className="pdf__status pdf__status--error">This page could not be rendered. Use the link below to open the original PDF.</p>}
      </div>
    </div>
  );
}
