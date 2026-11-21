"use client";

import { createContext, useContext } from "react";
import type { InventoryItem } from "@/lib/types";

export interface LessonCtx {
  item: (id: string | undefined) => InventoryItem | undefined;
  /** Open the source view for an inventory entry (scene -> original PDF). */
  openSource: (id: string) => void;
  selectedId?: string;
  /** Short label of a source location: "p. 3" for a PDF page, "§3" for a paragraph. */
  loc: (n: number) => string;
}

export const LessonContext = createContext<LessonCtx>({ item: () => undefined, openSource: () => {}, loc: (n) => `p. ${n}` });
export const useLesson = () => useContext(LessonContext);

/** Small "p. 3" button that jumps from an on-screen element to its passage in the PDF. */
export function SourceTag({ id, label, className = "" }: { id?: string; label?: string; className?: string }) {
  const { item, openSource, selectedId, loc } = useLesson();
  const it = item(id);
  if (!it || !id) return null;
  const where = loc(it.source.page);
  return (
    <button
      type="button"
      className={`source-tag ${selectedId === id ? "is-selected" : ""} ${className}`}
      onClick={(e) => {
        e.stopPropagation();
        openSource(id);
      }}
      title={`Show the source: ${it.title} (${where})`}
      aria-label={`${label ?? it.title}: show source, ${where === "external" ? "external material" : where}`}
    >
      <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true">
        <path d="M4 1.5h5.5L13 5v9.5H4z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        <path d="M9.5 1.5V5H13" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      </svg>
      <span>{label ? `${label} · ${where}` : where}</span>
    </button>
  );
}
