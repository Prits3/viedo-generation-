"use client";

// Detail views and source appendix: everything the video does not spell out stays readable here
// (full reference list, formulas, footnotes, supplements with their own status).
import type { Lesson } from "@/lib/types";
import type { CoverageReport, SceneRef } from "@/lib/coverage";
import { TYPE_LABEL } from "@/lib/labels";
import { StatusBadge } from "./SourcePanel";

interface Props {
  lesson: Lesson;
  coverage: CoverageReport;
  open: { id: string; item?: string } | null;
  onOpen: (v: { id: string; item?: string } | null) => void;
  onSource: (id: string) => void;
  onJump: (ref: SceneRef) => void;
}

export function DetailSections({ lesson, coverage, open, onOpen, onSource, onJump }: Props) {
  const figureSrc = new Map<string, { src: string; alt: string }>();
  for (const sc of [...lesson.intro.scenes, ...lesson.chapters.flatMap((c) => c.scenes)]) if (sc.figure) figureSrc.set(sc.figure.figureRef, { src: sc.figure.src, alt: sc.figure.alt });
  const byId = new Map(lesson.inventory.map((it) => [it.id, it]));

  const renderSection = (sec: { id: string; title: string; intro?: string; items: string[] }, kind: "detail" | "appendix") => {
    const compact = sec.items.length > 20;
    return (
      <details
        key={sec.id}
        id={sec.id}
        className="dsec"
        open={open?.id === sec.id}
        onToggle={(e) => {
          const isOpen = (e.currentTarget as HTMLDetailsElement).open;
          if (isOpen && open?.id !== sec.id) onOpen({ id: sec.id });
          if (!isOpen && open?.id === sec.id) onOpen(null);
        }}
      >
        <summary>
          <span className={`place place--${kind}`}>{kind === "detail" ? "Detail view" : "Appendix"}</span>
          <strong>{sec.title}</strong>
          <span className="count">{sec.items.length}</span>
        </summary>
        {sec.intro && <p className="dsec__intro">{sec.intro}</p>}
        <ul className={compact ? "dsec__list dsec__list--compact" : "dsec__list"}>
          {sec.items.map((id) => {
            const it = byId.get(id);
            if (!it) return null;
            const scene = coverage.locations[id]?.scenes.find((s) => s.chapterIndex >= 0) ?? coverage.locations[id]?.scenes[0];
            const fig = figureSrc.get(id);
            return (
              <li key={id} id={`item-${sec.id}-${id}`} className={open?.id === sec.id && open.item === id ? "is-target" : ""}>
                {compact ? (
                  <p>
                    <span className="index__id">{it.source.label ?? it.id}</span> {it.statement}
                  </p>
                ) : (
                  <>
                    <header>
                      <span className="index__id">{it.id}</span>
                      <strong>{it.title}</strong>
                      <span className="chip">{TYPE_LABEL[it.type]}</span>
                      <StatusBadge status={it.status} />
                    </header>
                    {fig && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img className="dsec__fig" src={fig.src} alt={fig.alt} loading="lazy" />
                    )}
                    <p>{it.statement}</p>
                    {it.quantity && (
                      <p className="dsec__quantity">
                        <strong>
                          {it.quantity.value} {it.quantity.unit}
                        </strong>{" "}
                        · {it.quantity.reference} · {it.quantity.conditions}
                      </p>
                    )}
                    {it.note && <p className="srccard__note">{it.note}</p>}
                  </>
                )}
                <span className="dsec__actions">
                  <button type="button" className="source-tag" onClick={() => onSource(id)}>
                    {it.status === "external" ? "Where it is cited" : "Show in PDF"} · p. {it.source.page}
                  </button>
                  {scene && (
                    <button type="button" className="source-tag source-tag--jump" onClick={() => onJump(scene)}>
                      ▶ {scene.sceneTitle}
                    </button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </details>
    );
  };

  return (
    <>
      {lesson.details.length > 0 && (
        <section className="dsecs" aria-labelledby="details-h">
          <h2 id="details-h">Detail views</h2>
          <p className="coverage__lead">Content the video only touches on, in full and with its place in the PDF.</p>
          {lesson.details.map((d) => renderSection(d, "detail"))}
        </section>
      )}
      {lesson.appendix.length > 0 && (
        <section className="dsecs" aria-labelledby="appendix-h">
          <h2 id="appendix-h">Source appendix</h2>
          <p className="coverage__lead">Figures, formulas, tables, references, data and supplements.</p>
          {lesson.appendix.map((a) => renderSection(a, "appendix"))}
        </section>
      )}
    </>
  );
}
