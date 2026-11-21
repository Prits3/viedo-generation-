// Turns a validated model draft into a Lesson and establishes the *actual* check status:
// every quote is searched in the PDF text layer, numbers are compared with their quote,
// unknown references are removed, and anything the storyboard does not use is moved
// to a detail view so it stays reachable.
import type { Chapter, CheckStatus, DetailView, AppendixSection, InventoryItem, Lesson, PageStatus, Scene } from "./types.ts";
import type { LessonDraft, SceneDraft } from "./lesson-schema.ts";
import type { PageText } from "./pdf-text.ts";
import { canon } from "./text.ts";
import { withTimings } from "./timing.ts";
import { analyzeCoverage } from "./coverage.ts";
import { TYPE_PLURAL } from "./labels.ts";

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);
const digits = (s: string) => (s.match(/\d+(?:[.,]\d+)?/g) ?? []).map((d) => d.replace(",", "."));

export interface AssembleInput {
  draft: LessonDraft;
  pages: PageText[];
  pageStatus: PageStatus[];
  numPages: number;
  pdfUrl: string;
  fileName: string;
}

export function assembleLesson({ draft, pages, pageStatus, numPages, pdfUrl, fileName }: AssembleInput): Lesson {
  const canonPages = pages.map((p) => ({ page: p.page, text: canon(p.text) }));

  // ── inventory with real check status ──
  const used = new Set<string>();
  const idMap = new Map<string, string>();
  const inventory: InventoryItem[] = draft.inventory.slice(0, 400).map((d, k) => {
    let id = (d.id || `I-${k + 1}`).trim().replace(/\s+/g, "-").slice(0, 16);
    while (used.has(id)) id = `${id}b`;
    used.add(id);
    if (!idMap.has(d.id)) idMap.set(d.id, id);

    const notes: string[] = [];
    let status: CheckStatus = "open";
    let page = Number.isInteger(d.page) && d.page >= 1 && d.page <= numPages ? d.page : 0;
    const q = canon(d.quote);
    if (q.length >= 8) {
      const onPage = canonPages.find((p) => p.page === page)?.text.includes(q);
      if (onPage) status = "matched";
      else {
        const other = canonPages.find((p) => p.text.includes(q));
        if (other) {
          notes.push(`The model cited page ${d.page}; the quote was found on page ${other.page}.`);
          page = other.page;
          status = "matched";
        } else {
          status = "unclear";
          notes.push("The quoted passage was not found in the PDF text layer. Check the original.");
        }
      }
    } else {
      notes.push("No usable quote was provided for this entry.");
    }
    if (page === 0) {
      page = 1;
      status = "unclear";
      notes.push("The cited page does not exist in this PDF.");
    }
    if (pageStatus.find((p) => p.page === page)?.status === "unreadable") {
      status = "unclear";
      notes.push("This page has no readable text layer.");
    }
    const hasValue = d.value.trim().length > 0;
    if (hasValue && status === "matched") {
      const inQuote = digits(d.quote);
      const missing = digits(d.value).filter((n) => !inQuote.includes(n));
      if (missing.length) {
        status = "unclear";
        notes.push(`Number ${missing.join(", ")} does not appear in the quoted passage.`);
      }
    }
    if (d.certainty === "unclear" && status === "matched") {
      status = "unclear";
      notes.push("Marked as ambiguous during generation.");
    }
    if (d.type === "supplement") {
      status = "external";
      notes.push("External material, not part of this PDF.");
    }
    return {
      id,
      type: d.type,
      title: clip(d.title, 90),
      statement: clip(d.statement, 600),
      quantity: hasValue ? { value: clip(d.value, 80), unit: clip(d.unit, 40), reference: clip(d.refers_to, 200), conditions: clip(d.conditions, 300) } : undefined,
      source: { page, section: clip(d.section, 120), quote: d.quote.trim() ? clip(d.quote.trim(), 400) : undefined },
      place: d.place,
      status,
      note: notes.join(" ") || undefined,
    };
  });
  const byId = new Map(inventory.map((it) => [it.id, it]));
  const ref = (r: string) => {
    const id = idMap.get(r) ?? r;
    return byId.has(id) ? id : undefined;
  };

  // ── scenes ──
  let n = 0;
  const toScene = (d: SceneDraft, prefix: string): Scene | null => {
    const cues = d.cues
      .slice(0, 12)
      .filter((c) => c.text.trim())
      .map((c) => {
        const refs = [...new Set(c.refs.map(ref).filter((x): x is string => Boolean(x)))];
        return { text: clip(c.text.trim(), 320), refs, connective: c.connective && refs.length === 0 ? true : undefined, focus: c.focus.trim() || undefined };
      });
    if (cues.length === 0) return null;
    const base = { id: `${prefix}-${++n}`, title: clip(d.title, 60), question: clip(d.question, 160), cues };
    const cards = d.cards.slice(0, 6).map((c, k) => ({ key: c.key || `c${k}`, title: clip(c.title, 50), body: clip(c.body, 110), icon: c.icon, ref: ref(c.ref) }));

    if (d.type === "question") return { ...base, type: "question", headline: clip(d.headline || d.question, 160), kicker: "The research question" };

    if (d.type === "comparison") {
      const rows = d.rows
        .filter((r) => Number.isFinite(r.from) && Number.isFinite(r.to) && ref(r.ref))
        .slice(0, 4)
        .map((r, k) => ({ key: r.key || `r${k}`, label: clip(r.label, 40), from: Math.min(r.from, r.to), to: Math.max(r.from, r.to), display: clip(r.display, 28), ref: ref(r.ref)!, tone: r.tone }));
      if (rows.length >= 2) {
        const lo = Math.min(0, ...rows.map((r) => r.from));
        const hi = Math.max(0, ...rows.map((r) => r.to));
        const span = hi - lo || 1;
        let unmatched = false;
        for (const r of rows) {
          const it = byId.get(r.ref)!;
          const hay = digits(`${it.source.quote ?? ""} ${it.quantity?.value ?? ""}`);
          if (digits(r.display).some((x) => !hay.includes(x))) unmatched = true;
        }
        return {
          ...base,
          type: "comparison",
          comparison: {
            axisLabel: clip(d.axis_label || d.question, 90),
            unit: clip(d.unit, 16),
            min: lo,
            max: hi,
            ticks: [0, 0.25, 0.5, 0.75, 1].map((f) => +(lo + span * f).toPrecision(3)),
            rows,
            basis: clip(d.basis, 260),
            basisRef: ref(d.basis_ref),
            derivedNote: unmatched ? "A number shown here could not be matched to its quoted passage automatically. Check the source." : "Generated chart: values taken from the cited passages, not re-measured.",
          },
        };
      }
      // Not enough usable numbers for a chart: fall through to cards if there are any.
    }

    if (cards.length >= 2) {
      if (d.type === "flow") return { ...base, type: "flow", flow: { steps: cards.map((c) => ({ key: c.key, title: c.title, detail: c.body, icon: c.icon, facts: c.ref ? [{ text: "Source", ref: c.ref }] : [] })) } };
      return { ...base, type: "points", points: { items: cards } };
    }
    // Minimal fallback: a scene with only spoken sentences is shown as a headline card.
    return { ...base, type: "question", headline: clip(d.question || d.title, 160), kicker: clip(d.title, 60) };
  };

  // Flow steps carry their source through the sentence that talks about them.
  const scenesOf = (list: SceneDraft[], prefix: string) => list.slice(0, 8).map((s) => toScene(s, prefix)).filter((s): s is Scene => s !== null);

  const introScenes = scenesOf(draft.intro_scenes, "intro");
  const intro: Chapter = { id: "intro", kind: "intro", title: "The paper in one minute", summary: "Question, one key finding, and the caveat needed to read it.", scenes: introScenes };
  const chapters: Chapter[] = draft.chapters
    .slice(0, 8)
    .map((c, k) => ({ id: `ch-${k + 1}`, kind: c.kind, title: clip(c.title, 60), summary: clip(c.summary, 200), scenes: scenesOf(c.scenes, `ch${k + 1}`) }))
    .filter((c) => c.scenes.length > 0);

  // ── detail views and appendix: everything not explained in a scene stays reachable ──
  const inScenes = new Set<string>();
  for (const sc of [...introScenes, ...chapters.flatMap((c) => c.scenes)]) {
    sc.cues.forEach((c) => c.refs.forEach((r) => inScenes.add(r)));
    sc.points?.items.forEach((p) => p.ref && inScenes.add(p.ref));
    sc.flow?.steps.forEach((st) => st.facts?.forEach((f) => inScenes.add(f.ref)));
    sc.comparison?.rows.forEach((r) => inScenes.add(r.ref));
    if (sc.comparison?.basisRef) inScenes.add(sc.comparison.basisRef);
  }
  const details: DetailView[] = [];
  const appendix: AppendixSection[] = [];
  const group = (place: "detail" | "appendix") => {
    const groups = new Map<string, string[]>();
    for (const it of inventory) {
      if (inScenes.has(it.id) && it.place !== place) continue;
      const unused = !inScenes.has(it.id) && (it.place === "intro" || it.place === "chapter");
      if (it.place !== place && !(place === "detail" && unused)) continue;
      if (unused) {
        it.place = "detail";
        it.note = `${it.note ? it.note + " " : ""}Planned for the video but not used there; kept here.`;
      }
      groups.set(it.type, [...(groups.get(it.type) ?? []), it.id]);
    }
    return [...groups.entries()].map(([type, items]) => ({ id: `${place === "detail" ? "d" : "a"}-${type}`, title: TYPE_PLURAL[type as keyof typeof TYPE_PLURAL], items }));
  };
  for (const g of group("detail")) details.push({ ...g, intro: "Content the video does not spell out, with its place in the PDF." });
  for (const g of group("appendix")) appendix.push(g);

  const withQuote = inventory.filter((it) => it.source.quote);
  const matched = withQuote.filter((it) => it.status === "matched").length;
  const unreadable = pageStatus.filter((p) => p.status === "unreadable").map((p) => p.page);

  const lesson: Lesson = {
    id: `upload-${Date.now().toString(36)}`,
    origin: "upload",
    meta: { title: clip(draft.title || fileName, 200), authors: clip(draft.authors, 200), venue: clip(draft.venue, 120), year: clip(draft.year, 12), pdfUrl, pages: numPages },
    inventory,
    intro: withTimings(intro),
    chapters: chapters.map((c) => withTimings(c)),
    details,
    appendix,
    pageStatus,
    verification: {
      mode: "auto",
      fullyChecked: false,
      checkedAt: new Date().toISOString().slice(0, 10),
      method:
        "Generated automatically from the PDF text layer. Machine checks only: each quote was searched on its stated page, numbers were compared with their quote, and coverage was computed in both directions. No person has reviewed the statements; tables, formulas and figures were not read as images.",
      quoteChecks: { total: withQuote.length, matched, failed: withQuote.filter((it) => it.status !== "matched" && it.status !== "external").map((it) => it.id) },
      notes: [
        ...(unreadable.length ? [`Pages without readable text (not covered): ${unreadable.join(", ")}.`] : []),
        "The reference list, tables and figures are linked to their page in the original; they are not reproduced.",
      ],
    },
    hasRecordedVoice: false,
  };
  // Surface coverage problems in the report notes as well.
  const cov = analyzeCoverage(lesson);
  if (cov.issues.length) lesson.verification.notes.push(`${cov.issues.length} coverage issue(s) found automatically; see the list below.`);
  return lesson;
}
