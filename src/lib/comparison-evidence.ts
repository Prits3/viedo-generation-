import type { ComparisonRow, InventoryItem, Scene } from "./types.ts";

export interface ChartFinding {
  code: "chart.evidence" | "chart.unit" | "chart.coordinates" | "chart.display" | "chart.label" | "chart.scale";
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
const group = (s: string) => normalize(s).toLowerCase().replace(/^(?:the|an?) /u, "");
const containsPhrase = (text: string, phrase: string) => new RegExp(`(?<![\\p{L}\\p{N}])${escape(phrase)}(?![\\p{L}\\p{N}])`, "iu").test(text);
const labelMatches = (label: string, reference: string) => label === reference || (label.includes(" ") && reference.endsWith(` ${label}`));

function pair(a: string, b?: string): [number, number] {
  const x = num(a), y = b === undefined ? x : num(b);
  return [Math.min(x, y), Math.max(x, y)];
}

/** Require a cited group and one unambiguous measurement with its unit in the same excerpt. */
export function citedMeasurement(item?: InventoryItem) {
  if (!item?.quantity || !item.source.quote || (item.status !== "matched" && item.status !== "verified")) return null;
  const { quantity } = item;
  const unit = normalize(quantity.unit);
  const value = normalize(quantity.value);
  const reference = normalize(quantity.reference ?? "");
  const m = VALUE.exec(value.replace(APPROX_LABEL, ""));
  if (!unit || !m || !group(reference)) return null;
  const [from, to] = pair(m[1], m[2]);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  // Consume the full range or part-of-total expression, so a denominator cannot become a value.
  const total = String.raw`(?:\s+(?:out of|of)\s+(?:the\s+)?(\d+))?`;
  const token = new RegExp(`(?<![\\p{L}\\d.,:+-])(${NUMBER})(?:${RANGE}(${NUMBER}))?${total}(?![\\d:]|[.,]\\d)(?:\\s*(${escape(unit)})(?![\\p{L}\\d%]))?`, "gu");
  const excerpts = normalize(item.source.quote).split(/[;!?]|\.(?=\s+\p{Lu})/u);
  const withGroup = excerpts.filter((text) => containsPhrase(text, reference));
  if (withGroup.length !== 1) return null;
  const excerpt = withGroup[0];
  const matches = [...excerpt.matchAll(token)].filter((found) => found[4]);
  if (matches.length === 1) {
    const [found] = matches;
    const [lo, hi] = pair(found[1], found[2]);
    const denominator = found[3] === undefined ? undefined : Number(found[3]);
    if (lo === from && hi === to && (denominator === undefined || (from === to && from >= 0 && to <= denominator && Number.isSafeInteger(denominator) && denominator > 0))) {
      return { from, to, unit, reference, excerpt, denominator, approximate: APPROX.test(excerpt.slice(0, found.index)) };
    }
  }
  return null;
}

export function validateComparison(rows: ComparisonRow[], axisUnit: string, byId: Map<string, InventoryItem>): ChartFinding[] {
  if (rows.length < 2) return [{ code: "chart.scale", action: "Use a comparison only for two or more cited measurements." }];
  const evidence = rows.map((row) => citedMeasurement(byId.get(row.ref)));
  return rows.flatMap((row, i): ChartFinding[] => {
    const ref = row.ref;
    const measure = evidence[i];
    if (!measure) return [{ code: "chart.evidence", ref, action: "Use a matched excerpt with the exact group, one unambiguous measurement and its unit, or use a source card." }];
    const axis = normalize(axisUnit);
    // Older count charts may add a quoted descriptor, e.g. “pairs remembered”.
    const descriptor = axis.startsWith(`${measure.unit} `) ? axis.slice(measure.unit.length + 1) : "";
    const legacyCountAxis = measure.denominator !== undefined && /^\p{L}+(?: \p{L}+)?$/u.test(descriptor) && containsPhrase(measure.excerpt, descriptor);
    if ((axis !== measure.unit && !legacyCountAxis) || evidence.some((other) => other && other.unit !== measure.unit)) return [{ code: "chart.unit", ref, action: "Use the same cited unit on every row and on the axis." }];
    if (measure.denominator !== undefined && evidence.some((other) => other && other.denominator !== measure.denominator)) {
      return [{ code: "chart.scale", ref, action: "Compare counts out of the same total, or present them as separate source cards." }];
    }
    const { from, to } = measure;
    // Older lessons encoded a point bar as a range to zero. The baseline is not a measurement.
    const legacyPoint = from === to && row.from === Math.min(0, to) && row.to === Math.max(0, to);
    if ((row.from !== from || row.to !== to) && !legacyPoint) return [{ code: "chart.coordinates", ref, action: "Set both plotted endpoints to the cited scalar or use the full cited range. Do not infer a value." }];
    const withoutUnit = normalize(row.display).replace(new RegExp(`\\s*${escape(measure.unit)}$`, "u"), "");
    const display = measure.denominator === undefined ? withoutUnit : withoutUnit.replace(new RegExp(` (?:out of|of) (?:the )?${measure.denominator}$`, "u"), "");
    const m = VALUE.exec(display.replace(APPROX_LABEL, ""));
    const shown = m && pair(m[1], m[2]);
    if (!shown || shown[0] !== from || shown[1] !== to || APPROX_LABEL.test(display) !== measure.approximate) return [{ code: "chart.display", ref, action: "Show the cited value or range and its unit, preserving approximation qualifiers." }];
    const label = group(row.label);
    if (!labelMatches(label, group(measure.reference)) || evidence.some((other, j) => j !== i && other && labelMatches(label, group(other.reference)))) {
      return [{ code: "chart.label", ref, action: "Use the exact cited group for this measurement, preserving qualifiers and distinguishing it from the other rows." }];
    }
    if (evidence.some((other, j) => j !== i && other && containsPhrase(measure.excerpt, other.reference))) {
      return [{ code: "chart.evidence", ref, action: "Cite a separate excerpt for this group; otherwise show source cards instead of a chart." }];
    }
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
  if (scene.type !== "comparison" || !scene.comparison) return scene;
  if (!chartFindings(scene, byId).length) {
    const rows = scene.comparison.rows.map((row) => {
      const measure = citedMeasurement(byId.get(row.ref));
      // Render the complete quoted group, even when a legacy label used a shorthand.
      if (!measure) return row;
      const display = measure.denominator === undefined ? row.display : `${measure.approximate ? "≈ " : ""}${measure.to} of ${measure.denominator} ${measure.unit}`;
      return row.label === measure.reference && row.display === display ? row : { ...row, label: measure.reference, display };
    });
    return rows.some((row, i) => row !== scene.comparison?.rows[i]) ? { ...scene, comparison: { ...scene.comparison, rows } } : scene;
  }
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
