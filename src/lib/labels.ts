import type { CheckStatus, ItemType, Placement } from "./types.ts";

export const STATUS_LABEL: Record<CheckStatus, string> = {
  verified: "Checked against the PDF",
  matched: "Quote found on page (automatic)",
  unclear: "Unclear",
  open: "Not checked yet",
  external: "External, not checked",
};

export const STATUS_SHORT: Record<CheckStatus, string> = {
  verified: "Checked",
  matched: "Quote found",
  unclear: "Unclear",
  open: "Open",
  external: "External",
};

export const PLACE_LABEL: Record<Placement, string> = {
  intro: "Intro",
  chapter: "Chapter",
  detail: "Detail view",
  appendix: "Source appendix",
  "original-only": "Only in the original",
};

export const TYPE_LABEL: Record<ItemType, string> = {
  question: "Research question",
  background: "Background",
  method: "Method",
  result: "Result",
  limitation: "Limitation",
  conclusion: "Conclusion",
  figure: "Figure",
  table: "Table",
  formula: "Formula",
  footnote: "Footnote",
  reference: "Reference",
  data: "Data & code",
  supplement: "Supplement",
  meta: "Article info",
};

export const INDEX_FILTERS: { key: string; label: string; types: ItemType[] }[] = [
  { key: "all", label: "All", types: [] },
  { key: "question", label: "Question", types: ["question", "background"] },
  { key: "method", label: "Methods", types: ["method"] },
  { key: "result", label: "Results", types: ["result", "conclusion"] },
  { key: "limit", label: "Limits", types: ["limitation"] },
  { key: "figure", label: "Figures, tables, formulas", types: ["figure", "table", "formula"] },
  { key: "reference", label: "References", types: ["reference"] },
  { key: "other", label: "Other", types: ["footnote", "data", "supplement", "meta"] },
];

export function formatTime(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export const TYPE_PLURAL: Record<ItemType, string> = {
  question: "Research questions",
  background: "Background",
  method: "Methods",
  result: "Results",
  limitation: "Limitations",
  conclusion: "Conclusions",
  figure: "Figures",
  table: "Tables",
  formula: "Formulas",
  footnote: "Footnotes",
  reference: "References",
  data: "Data and code",
  supplement: "Supplements (external)",
  meta: "Article information",
};
