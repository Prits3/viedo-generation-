"use client";

// "Where is everything?" - shows for the whole paper which parts are in the intro,
// in a chapter, in a detail view, in the source appendix, or only in the original.
import type { Lesson, Placement } from "@/lib/types";
import type { CoverageReport } from "@/lib/coverage";
import { PLACE_LABEL, STATUS_LABEL, locLabel } from "@/lib/labels";

const ORDER: Placement[] = ["intro", "chapter", "detail", "appendix", "original-only"];
const HINT: Record<Placement, string> = {
  intro: "Explained in the short animated intro",
  chapter: "Explained in a chapter of the full video",
  detail: "Readable in a detail view below, with a link to the page",
  appendix: "Listed in the source appendix below",
  "original-only": "Not covered here; open the original PDF",
};

export function CoverageMap({ lesson, coverage, onSelect }: { lesson: Lesson; coverage: CoverageReport; onSelect: (id: string) => void }) {
  const statuses = Object.entries(coverage.statusCounts) as [keyof typeof STATUS_LABEL, number][];
  return (
    <section className="coverage" aria-labelledby="coverage-h">
      <h2 id="coverage-h">Where each part of the {lesson.meta.sourceKind === "text" ? "text" : "paper"} lives</h2>
      <p className="coverage__lead">
        {lesson.inventory.length} inventoried passages, figures, formulas, footnotes and references. Every one has a place; click any entry to see it in the {lesson.meta.sourceKind === "text" ? "original text" : "PDF"}.
      </p>
      <div className="coverage__grid">
        {ORDER.map((p) => {
          const items = lesson.inventory.filter((it) => coverage.locations[it.id]?.placements.includes(p));
          return (
            <details key={p} className={`coverage__col coverage__col--${p}`} data-place={p}>
              <summary>
                <span className={`place place--${p}`}>{PLACE_LABEL[p]}</span>
                <strong>{items.length}</strong>
                <small>{HINT[p]}</small>
              </summary>
              {items.length === 0 ? (
                <p className="coverage__none">Nothing here.</p>
              ) : (
                <ul>
                  {items.map((it) => (
                    <li key={it.id}>
                      <button type="button" onClick={() => onSelect(it.id)}>
                        <span className="index__id">{it.id}</span> {it.title} <span className="coverage__page">{locLabel(lesson.meta.sourceKind, it.source.page)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </details>
          );
        })}
      </div>

      <div className="coverage__meta">
        <div>
          <h3>Check status</h3>
          <ul className="coverage__status">
            {statuses.map(([s, n]) => (
              <li key={s}>
                <span className={`status status--${s}`}>
                  <i aria-hidden="true" />
                  {n}
                </span>{" "}
                {STATUS_LABEL[s]}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3>{lesson.meta.sourceKind === "text" ? "Paragraphs of the text" : "Pages of the PDF"}</h3>
          <ol className="coverage__pages">
            {coverage.pages.map((p) => {
              const st = lesson.pageStatus.find((x) => x.page === p.page);
              const bad = st?.status === "unreadable";
              return (
                <li key={p.page} className={bad ? "is-bad" : p.items === 0 ? "is-empty" : ""} title={bad ? `Page ${p.page}: no readable text layer` : `Page ${p.page}: ${p.items} entries`}>
                  <span>{locLabel(lesson.meta.sourceKind, p.page)}</span>
                  <strong>{bad ? "unreadable" : p.items}</strong>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}
