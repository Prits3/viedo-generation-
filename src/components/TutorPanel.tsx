"use client";

// Contextual tutor (Pritika's backend) mounted into Trung's player.
// On a question it pauses playback, sends the lesson's inventory as grounding
// passages to /backend/tutor/adhoc, and shows an answer labelled by where it
// comes from. Citations reuse the existing PDF viewer via onOpenSource(id).
import { useMemo, useRef, useState } from "react";
import type { Lesson } from "@/lib/types";

type Grounding = "source" | "external" | "insufficient";
interface Citation { id: string; page_ref: string }
interface Answer { grounding: Grounding; answer: string; citations: Citation[] }
interface Msg { q: string; a?: Answer; error?: string }

const GROUND_LABEL: Record<Grounding, string> = {
  source: "from source",
  external: "general knowledge",
  insufficient: "not in source",
};

export function TutorPanel({
  lesson,
  sceneTitle,
  onOpenSource,
  onPause,
}: {
  lesson: Lesson;
  sceneTitle?: string;
  onOpenSource: (id: string) => void;
  onPause: () => void;
}) {
  const [q, setQ] = useState("");
  const [log, setLog] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const liveRef = useRef<HTMLDivElement>(null);

  // The lesson's inventory IS the grounding source — the same entries that back
  // the on-screen sentences and the PDF highlights.
  const passages = useMemo(
    () =>
      lesson.inventory
        .filter((it) => it.statement)
        .map((it) => ({
          id: it.id,
          page_ref: it.source.page > 0 ? `p. ${it.source.page}` : "external",
          passage: `${it.title}. ${it.statement}${it.source.quote ? ` "${it.source.quote}"` : ""}`,
        })),
    [lesson.inventory],
  );

  async function ask(question: string) {
    const text = question.trim();
    if (!text || busy) return;
    onPause();
    setQ("");
    setLog((l) => [...l, { q: text }]);
    setBusy(true);
    try {
      const res = await fetch("/backend/tutor/adhoc", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: text, passages, settings: { scene: sceneTitle } }),
      });
      if (!res.ok) throw new Error(`backend ${res.status}`);
      const a: Answer = await res.json();
      setLog((l) => l.map((m, i) => (i === l.length - 1 ? { ...m, a } : m)));
    } catch (e) {
      const msg =
        "Tutor backend unreachable. Start it with ./dev.sh (or MODEL=mock) — see INTEGRATION.md.";
      setLog((l) => l.map((m, i) => (i === l.length - 1 ? { ...m, error: msg } : m)));
    } finally {
      setBusy(false);
      requestAnimationFrame(() => liveRef.current?.scrollTo({ top: 1e9 }));
    }
  }

  const suggestions = ["Explain this differently", "What does the source actually say?", "Give me an example"];

  return (
    <section className="tutor" aria-label="Ask the tutor">
      <div className="tutor__head">
        <strong>Ask about this lesson</strong>
        <span>{sceneTitle ? `On: ${sceneTitle}` : "Grounded in your source"}</span>
      </div>

      <div className="tutor__log" ref={liveRef} aria-live="polite">
        {log.length === 0 && (
          <p className="tutor__hint">
            Pause any time and ask a question. Answers are grounded in this paper and labelled
            by where they come from; citations open the original PDF.
          </p>
        )}
        {log.map((m, i) => (
          <div key={i} className="tutor__turn">
            <p className="tutor__q">{m.q}</p>
            {m.error && <p className="tutor__err">{m.error}</p>}
            {m.a && (
              <div className="tutor__a">
                <span className={`tutor__tag tutor__tag--${m.a.grounding}`}>{GROUND_LABEL[m.a.grounding]}</span>
                <p>{m.a.answer}</p>
                {m.a.citations.length > 0 && (
                  <div className="tutor__cites">
                    {m.a.citations.map((c) => (
                      <button key={c.id} type="button" className="source-tag" onClick={() => onOpenSource(c.id)}>
                        {c.page_ref}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        {busy && <p className="tutor__hint">Thinking…</p>}
      </div>

      <div className="tutor__sugg">
        {suggestions.map((sg) => (
          <button key={sg} type="button" onClick={() => ask(sg)} disabled={busy}>
            {sg}
          </button>
        ))}
      </div>

      <form
        className="tutor__ask"
        onSubmit={(e) => {
          e.preventDefault();
          ask(q);
        }}
      >
        <label className="sr-only" htmlFor="tutor-input">
          Ask the tutor a question
        </label>
        <input
          id="tutor-input"
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={onPause}
          placeholder="Ask about this scene…"
          autoComplete="off"
        />
        <button type="submit" className="btn btn--primary" disabled={busy || !q.trim()}>
          Ask
        </button>
      </form>

      <style jsx>{`
        .tutor {
          border: 1px solid var(--line, #e2e0d8);
          border-radius: 12px;
          padding: 1rem;
          display: grid;
          gap: 0.7rem;
          background: var(--panel, #fff);
        }
        .tutor__head {
          display: flex;
          justify-content: space-between;
          align-items: baseline;
          gap: 0.5rem;
          flex-wrap: wrap;
        }
        .tutor__head span {
          font-size: 0.78rem;
          opacity: 0.7;
        }
        .tutor__log {
          max-height: 300px;
          overflow-y: auto;
          display: grid;
          gap: 0.8rem;
        }
        .tutor__hint {
          font-size: 0.86rem;
          opacity: 0.75;
          margin: 0;
        }
        .tutor__turn {
          display: grid;
          gap: 0.35rem;
        }
        .tutor__q {
          font-weight: 600;
          margin: 0;
        }
        .tutor__a {
          display: grid;
          gap: 0.4rem;
          padding: 0.6rem 0.75rem;
          border-radius: 10px;
          background: rgba(127, 127, 127, 0.08);
        }
        .tutor__a p {
          margin: 0;
          font-size: 0.92rem;
        }
        .tutor__err {
          margin: 0;
          font-size: 0.86rem;
          color: #b23a48;
        }
        .tutor__tag {
          justify-self: start;
          font-size: 0.66rem;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          padding: 0.12rem 0.4rem;
          border-radius: 5px;
        }
        .tutor__tag--source {
          background: #d9efed;
          color: #0f6f69;
        }
        .tutor__tag--external {
          background: #f6e9d2;
          color: #8a5a12;
        }
        .tutor__tag--insufficient {
          background: #f6dcdf;
          color: #a2303c;
        }
        .tutor__cites {
          display: flex;
          gap: 0.4rem;
          flex-wrap: wrap;
        }
        .tutor__sugg {
          display: flex;
          gap: 0.4rem;
          flex-wrap: wrap;
        }
        .tutor__sugg button {
          font-size: 0.78rem;
          border: 1px solid var(--line, #e2e0d8);
          background: transparent;
          border-radius: 999px;
          padding: 0.25rem 0.6rem;
          cursor: pointer;
          color: inherit;
        }
        .tutor__ask {
          display: flex;
          gap: 0.5rem;
        }
        .tutor__ask input {
          flex: 1;
          min-width: 0;
          padding: 0.55rem 0.7rem;
          border-radius: 8px;
          border: 1px solid var(--line, #e2e0d8);
          background: transparent;
          color: inherit;
          font: inherit;
        }
      `}</style>
    </section>
  );
}
