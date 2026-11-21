"use client";

// Source view next to the player: the cited passage in the original PDF ("Source" tab)
// and the searchable inventory of everything in the paper ("Index" tab).
// Both directions are one click: claim -> PDF passage, PDF passage -> explaining scene.
import { useEffect, useMemo, useState } from "react";
import type { InventoryItem, Lesson } from "@/lib/types";
import type { CoverageReport, SceneRef } from "@/lib/coverage";
import { INDEX_FILTERS, PLACE_LABEL, STATUS_LABEL, STATUS_SHORT, TYPE_LABEL, locLabel, locLong } from "@/lib/labels";
import { canon, canonWithMap } from "@/lib/text";
import { PdfPage } from "./PdfPage";

interface Props {
  lesson: Lesson;
  coverage: CoverageReport;
  selectedId?: string;
  tab: "source" | "index";
  onTab: (t: "source" | "index") => void;
  onSelect: (id: string) => void;
  onJump: (ref: SceneRef) => void;
  onOpenDetail: (sectionId: string, itemId: string) => void;
  /** Set while playback is paused because a source was opened from the video. */
  onResume?: () => void;
}

export function StatusBadge({ status }: { status: InventoryItem["status"] }) {
  return (
    <span className={`status status--${status}`} title={STATUS_LABEL[status]}>
      <i aria-hidden="true" />
      {STATUS_SHORT[status]}
    </span>
  );
}

export function SourcePanel({ lesson, coverage, selectedId, tab, onTab, onSelect, onJump, onOpenDetail, onResume }: Props) {
  const isText = lesson.meta.sourceKind === "text";
  const item = useMemo(() => lesson.inventory.find((it) => it.id === selectedId), [lesson, selectedId]);
  return (
    <section className="panel" aria-label="Sources">
      <div className="panel__tabs" role="tablist" aria-label="Source views">
        <button type="button" role="tab" id="tab-source" aria-selected={tab === "source"} aria-controls="tabpanel-source" onClick={() => onTab("source")}>
          {isText ? "Source in the text" : "Source in the PDF"}
        </button>
        <button type="button" role="tab" id="tab-index" aria-selected={tab === "index"} aria-controls="tabpanel-index" onClick={() => onTab("index")}>
          Source index <span className="count">{lesson.inventory.length}</span>
        </button>
      </div>
      {tab === "source" ? (
        <div role="tabpanel" id="tabpanel-source" aria-labelledby="tab-source" className="panel__body">
          {item ? (
            <SourceCard key={item.id} lesson={lesson} item={item} coverage={coverage} onJump={onJump} onOpenDetail={onOpenDetail} onResume={onResume} />
          ) : (
            <div className="panel__empty">
              <p>
                <strong>Check any statement.</strong> Click a number, a figure label or a <span className="source-tag source-tag--demo">{locLabel(lesson.meta.sourceKind, 3)}</span> tag in the video to see the exact passage in the original
                {isText ? " text" : " PDF"} here. The video pauses and continues where you left off.
              </p>
              <p>Or browse the source index and jump from a passage back to the scene that explains it.</p>
              <button type="button" className="btn btn--ghost" onClick={() => onTab("index")}>
                Open the source index
              </button>
            </div>
          )}
        </div>
      ) : (
        <div role="tabpanel" id="tabpanel-index" aria-labelledby="tab-index" className="panel__body">
          <SourceIndex lesson={lesson} coverage={coverage} selectedId={selectedId} onSelect={onSelect} onJump={onJump} onOpenDetail={onOpenDetail} />
        </div>
      )}
    </section>
  );
}

function SourceCard({ lesson, item, coverage, onJump, onOpenDetail, onResume }: { lesson: Lesson; item: InventoryItem; coverage: CoverageReport; onJump: (r: SceneRef) => void; onOpenDetail: (s: string, i: string) => void; onResume?: () => void }) {
  const isText = lesson.meta.sourceKind === "text";
  const block = isText ? lesson.sourceBlocks?.find((b) => b.n === item.source.page) : undefined;
  const [located, setLocated] = useState<boolean | null>(null);
  useEffect(() => setLocated(null), [item.id]);
  const loc = coverage.locations[item.id];
  const inPdf = item.source.page > 0 && item.status !== "external";
  const pageInfo = lesson.pageStatus.find((p) => p.page === item.source.page);
  return (
    <article className="srccard" data-item={item.id}>
      {onResume && (
        <button type="button" className="btn btn--primary btn--small srccard__resume" onClick={onResume} data-action="resume-from-source">
          <span aria-hidden="true">▶</span> Close and continue watching
        </button>
      )}
      <header className="srccard__head">
        <span className="srccard__id">{item.id}</span>
        <span className="chip">{TYPE_LABEL[item.type]}</span>
        <StatusBadge status={item.status} />
      </header>
      <h3>{item.title}</h3>
      <p className="srccard__statement">{item.statement}</p>

      <div className="srccard__where">
        <strong>
          {item.status === "external" ? "Cited in" : "Original"}: {locLong(lesson.meta.sourceKind, item.source.page)}
          {item.source.label ? ` · ${item.source.label}` : ""}
        </strong>
        <span>{item.source.section}</span>
      </div>
      {item.source.quote && (
        <blockquote className="srccard__quote">
          <span aria-hidden="true">“</span>
          {item.source.quote}
          <span aria-hidden="true">”</span>
        </blockquote>
      )}
      {item.note && <p className="srccard__note">{item.note}</p>}
      {item.status === "external" && <p className="srccard__note srccard__note--warn">This material is not part of the source. The passage below only shows where it is referred to.</p>}

      {isText && block && <TextPassage block={block} quote={item.source.quote} />}
      {!isText && item.source.page > 0 && (
        <>
          {pageInfo?.status === "unreadable" ? (
            <p className="srccard__note srccard__note--warn">Page {item.source.page} has no readable text layer; the passage cannot be highlighted.</p>
          ) : located === false && item.source.quote ? (
            <p className="srccard__note srccard__note--warn">The passage could not be highlighted automatically. Page {item.source.page} is shown; use the excerpt above to find it.</p>
          ) : located && item.source.quote ? (
            <p className="srccard__note srccard__note--ok">Highlighted in the page below.</p>
          ) : null}
          <PdfPage url={lesson.meta.pdfUrl} page={item.source.page} quote={inPdf || item.status === "external" ? item.source.quote : undefined} region={item.source.region} onLocated={setLocated} />
          <a className="btn btn--ghost btn--small" href={`${lesson.meta.pdfUrl}#page=${item.source.page}`} target="_blank" rel="noreferrer">
            Open the original PDF at page {item.source.page} ↗
          </a>
        </>
      )}

      {item.quantity && (
        <dl className="quantity">
          <div>
            <dt>Value</dt>
            <dd>
              <strong>{item.quantity.value}</strong> {item.quantity.unit}
            </dd>
          </div>
          <div>
            <dt>Refers to</dt>
            <dd>{item.quantity.reference}</dd>
          </div>
          <div>
            <dt>Conditions</dt>
            <dd>{item.quantity.conditions}</dd>
          </div>
        </dl>
      )}

      <div className="srccard__back">
        <h4>Where this is explained</h4>
        <ul>
          {loc?.scenes.map((s) => (
            <li key={s.sceneId}>
              <button type="button" className="btn btn--jump" onClick={() => onJump(s)} data-jump-scene={s.sceneId}>
                <span aria-hidden="true">▶</span> {s.chapterIndex < 0 ? "Intro" : `Chapter ${s.chapterIndex + 1}`} · {s.sceneTitle}
              </button>
            </li>
          ))}
          {loc?.details.map((d) => (
            <li key={d}>
              <button type="button" className="btn btn--jump" onClick={() => onOpenDetail(d, item.id)}>
                <span aria-hidden="true">☰</span> Detail view · {lesson.details.find((x) => x.id === d)?.title}
              </button>
            </li>
          ))}
          {loc?.appendix.map((a) => (
            <li key={a}>
              <button type="button" className="btn btn--jump" onClick={() => onOpenDetail(a, item.id)}>
                <span aria-hidden="true">☰</span> Source appendix · {lesson.appendix.find((x) => x.id === a)?.title}
              </button>
            </li>
          ))}
          {loc?.placements.includes("original-only") && <li className="srccard__only">Only available in the original; not covered in the lesson.</li>}
        </ul>
      </div>
    </article>
  );
}

function SourceIndex({ lesson, coverage, selectedId, onSelect, onJump, onOpenDetail }: { lesson: Lesson; coverage: CoverageReport; selectedId?: string; onSelect: (id: string) => void; onJump: (r: SceneRef) => void; onOpenDetail: (s: string, i: string) => void }) {
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const list = useMemo(() => {
    const f = INDEX_FILTERS.find((x) => x.key === filter);
    const q = query.trim().toLowerCase();
    return lesson.inventory.filter((it) => {
      if (f && f.types.length && !f.types.includes(it.type)) return false;
      if (!q) return true;
      return `${it.id} ${it.title} ${it.statement} ${it.source.section} ${it.source.quote ?? ""}`.toLowerCase().includes(q);
    });
  }, [lesson, filter, query]);
  const pages = useMemo(() => {
    const m = new Map<number, InventoryItem[]>();
    for (const it of list) m.set(it.source.page, [...(m.get(it.source.page) ?? []), it]);
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [list]);

  return (
    <div className="index">
      <label className="index__search">
        <span className="sr-only">Search the source index</span>
        <input type="search" placeholder="Search passages, numbers, figures…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>
      <div className="index__filters" role="group" aria-label="Filter by kind of content">
        {INDEX_FILTERS.map((f) => (
          <button key={f.key} type="button" className={`chip chip--btn ${filter === f.key ? "is-active" : ""}`} aria-pressed={filter === f.key} onClick={() => setFilter(f.key)} data-filter={f.key}>
            {f.label}
          </button>
        ))}
      </div>
      <p className="index__count" aria-live="polite">
        {list.length} of {lesson.inventory.length} entries
      </p>
      {pages.map(([page, items]) => {
        const ps = lesson.pageStatus.find((p) => p.page === page);
        return (
          <section key={page} className="index__page">
            <h4>
              {locLong(lesson.meta.sourceKind, page).replace(/^./, (c) => c.toUpperCase())}
              {ps?.status === "unreadable" && <span className="status status--unclear">no readable text</span>}
            </h4>
            <ul>
              {items.map((it) => {
                const loc = coverage.locations[it.id];
                const scene = loc?.scenes.find((s) => s.chapterIndex >= 0) ?? loc?.scenes[0];
                const section = loc?.details[0] ?? loc?.appendix[0];
                return (
                  <li key={it.id} className={`index__row ${selectedId === it.id ? "is-selected" : ""}`} data-item={it.id}>
                    <button type="button" className="index__main" onClick={() => onSelect(it.id)}>
                      <span className="index__id">{it.id}</span>
                      <span className="index__title">{it.title}</span>
                      <span className="index__meta">
                        <StatusBadge status={it.status} />
                        {loc?.placements.map((p) => (
                          <span key={p} className={`place place--${p}`}>
                            {PLACE_LABEL[p]}
                          </span>
                        ))}
                      </span>
                    </button>
                    {scene ? (
                      <button type="button" className="index__jump" onClick={() => onJump(scene)} aria-label={`Go to the explanation of ${it.title}: ${scene.sceneTitle}`} data-jump-item={it.id}>
                        <span aria-hidden="true">▶</span> Explanation
                      </button>
                    ) : section ? (
                      <button type="button" className="index__jump" onClick={() => onOpenDetail(section, it.id)} aria-label={`Open ${it.title} in the detail views`}>
                        <span aria-hidden="true">☰</span> Details
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      {list.length === 0 && <p className="panel__empty">No entry matches this search.</p>}
    </div>
  );
}

/** One paragraph of a pasted text with the cited passage marked. */
function TextPassage({ block, quote }: { block: { n: number; heading?: string; text: string }; quote?: string }) {
  const range = useMemo(() => {
    const q = quote ? canon(quote) : "";
    if (q.length < 8) return null;
    const { text, map } = canonWithMap(block.text);
    const at = text.indexOf(q);
    return at < 0 ? null : { start: map[at], end: map[at + q.length - 1] + 1 };
  }, [block, quote]);
  return (
    <div className="textsrc" data-located={range ? "true" : "false"}>
      <p className={`srccard__note ${range ? "srccard__note--ok" : "srccard__note--warn"}`}>{range ? "Highlighted in the original paragraph below." : quote ? "The passage could not be highlighted automatically; the whole paragraph is shown." : "The original paragraph:"}</p>
      <div className="textsrc__box">
        <span className="textsrc__n">§{block.n}</span>
        {block.heading && <strong className="textsrc__heading">{block.heading}</strong>}
        <p>
          {range ? (
            <>
              {block.text.slice(0, range.start)}
              <mark>{block.text.slice(range.start, range.end)}</mark>
              {block.text.slice(range.end)}
            </>
          ) : (
            block.text
          )}
        </p>
      </div>
    </div>
  );
}
