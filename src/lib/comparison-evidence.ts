import type { ComparisonRow, InventoryItem, Scene } from "./types.ts";

export interface ChartFinding {
  code: "chart.evidence" | "chart.unit" | "chart.coordinates" | "chart.display" | "chart.scale";
  ref?: string;
  action: string;
}

const NUMBER = String.raw`[+-]?\d+(?:[.,]\d+)?`;
const RANGE = String.raw`\s*(?:-|–|—|\bto\b|\bbis\b)\s*`;
const VALUE = new RegExp(`^(${NUMBER})(?:${RANGE}(${NUMBER}))?$`, "i");
const APPROX = /(?:\babout|\baround|\bapproximately|\broughly|\bca\.|\betwa|\bcirca|[~≈])\s*$/iu;
const APPROX_LABEL = /^(?:about\b|around\b|approximately\b|roughly\b|ca\.|etwa\b|circa\b|[~≈])\s*/iu;
const normalize = (s: string) => s.normalize("NFKC").replace(/−/g, "-").trim().replace(/\s+/g, " ");
const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const num = (s: string) => Number(s.replace(",", "."));

function pair(a: string, b?: string): [number, number] {
  const x = num(a), y = b === undefined ? x : num(b);
  return [Math.min(x, y), Math.max(x, y)];
}

/** Conservative: compare only a matched scalar or range printed next to its unit in the quote. */
export function citedMeasurement(item?: InventoryItem) {
  if (!item?.quantity || !item.source.quote || (item.status !== "matched" && item.status !== "verified")) return null;
  const { quantity } = item;
  const unit = normalize(quantity.unit);
  const value = normalize(quantity.value);
  const m = VALUE.exec(value.replace(APPROX_LABEL, ""));
  if (!unit || !m) return null;
  const [from, to] = pair(m[1], m[2]);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  // Scan from left to right, consuming a whole range before considering its second endpoint.
  // Digits inside a clock time, longer number or scientific notation are not measurements.
  const token = new RegExp(`(?<![\\p{L}\\d.,:+-])(${NUMBER})(?:${RANGE}(${NUMBER}))?(?:\\s*(${escape(unit)})(?![\\p{L}\\d%]))?(?![\\d,:]|\\.\\d)`, "gu");
  const quote = normalize(item.source.quote);
  for (const found of quote.matchAll(token)) {
    const [lo, hi] = pair(found[1], found[2]);
    if (found[3] && lo === from && hi === to) return { from, to, unit, approximate: APPROX.test(quote.slice(0, found.index)) };
  }
  return null;
}

export function validateComparison(rows: ComparisonRow[], axisUnit: string, byId: Map<string, InventoryItem>): ChartFinding[] {
  if (rows.length < 2) return [{ code: "chart.scale", action: "Use a comparison only for two or more cited measurements." }];
  return rows.flatMap((row): ChartFinding[] => {
    const ref = row.ref;
    const measure = citedMeasurement(byId.get(ref));
    if (!measure) return [{ code: "chart.evidence", ref, action: "Use a matched quote containing the complete measurement and its unit, or use a non-numeric card." }];
    if (normalize(axisUnit) !== measure.unit) return [{ code: "chart.unit", ref, action: "Use the same exact cited unit on every row and on the axis." }];
    const { from, to } = measure;
    // Older lessons encoded a point bar as a range to zero. The baseline is not a measurement.
    const legacyPoint = from === to && row.from === Math.min(0, to) && row.to === Math.max(0, to);
    if ((row.from !== from || row.to !== to) && !legacyPoint) return [{ code: "chart.coordinates", ref, action: "Set both plotted endpoints to the cited scalar or use the full cited range. Do not infer a value." }];
    const display = normalize(row.display).replace(new RegExp(`\\s*${escape(measure.unit)}$`, "u"), "");
    const m = VALUE.exec(display.replace(APPROX_LABEL, ""));
    const shown = m && pair(m[1], m[2]);
    if (!shown || shown[0] !== from || shown[1] !== to || APPROX_LABEL.test(display) !== measure.approximate) return [{ code: "chart.display", ref, action: "Show the cited value or range and its unit, preserving approximation qualifiers." }];
    return [];
  });
}

export function chartFindings(scene: Scene, byId: Map<string, InventoryItem>): ChartFinding[] {
  if (!scene.comparison) return [];
  const { rows, unit, min, max, ticks } = scene.comparison;
  const findings = validateComparison(rows, unit, byId);
  if (!(max > min) || min !== Math.min(0, ...rows.map((r) => r.from)) || max !== Math.max(0, ...rows.map((r) => r.to)) || ticks.some((n) => n < min || n > max)) {
    findings.push({ code: "chart.scale", action: "Derive the axis and tick marks from the vetted measurements, including zero." });
  }
  return findings;
}

/** Keep the voice and action keys, but never carry rejected model labels or coordinates into the cards. */
export function prepareVideoScene(scene: Scene, byId: Map<string, InventoryItem>): Scene {
  if (scene.type !== "comparison" || !scene.comparison || !chartFindings(scene, byId).length) return scene;
  const { comparison, ...rest } = scene;
  return {
    ...rest,
    type: "points",
    points: { items: comparison.rows.map((row, i) => {
      const entry = byId.get(row.ref);
      const quote = entry?.status === "matched" || entry?.status === "verified" ? entry.source.quote?.trim() : undefined;
      return { key: row.key, title: `Source excerpt ${i + 1}`, body: quote || "No matched measurement in the source.", icon: "doc", ref: quote ? row.ref : undefined };
    }) },
  };
}
