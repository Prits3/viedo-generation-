// Turns validated model drafts into a Lesson and establishes the *actual* check status:
// every quote is searched in the source text, numbers are compared with their quote,
// unknown references are removed, and anything the storyboard does not use is moved
// to a detail view so it stays reachable. Works the same for PDF pages and text paragraphs.
import type { AppendixSection, Chapter, CheckStatus, DetailView, InventoryItem, Lesson, Scene } from "./types.ts";
import type { ItemDraft, SceneDraft, StoryboardDraft } from "./lesson-schema.ts";
import type { SourceDoc } from "./source.ts";
import { canon } from "./text.ts";
import { analyzeCoverage, sceneRefs } from "./coverage.ts";
import { TYPE_PLURAL, locLong } from "./labels.ts";
import { digits } from "./check.ts";
import { prepareVideoScene } from "./comparison-evidence.ts";

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

// ───────────────────────── inventory with real check status ─────────────────────────
export function inventoryFromDraft(items: ItemDraft[], source: SourceDoc): { inventory: InventoryItem[]; idMap: Record<string, string> } {
  const canonPages = source.pages.map((p) => ({ page: p.page, text: canon(p.text) }));
  const where = (n: number) => locLong(source.kind, n);
  const used = new Set<string>();
  const idMap: Record<string, string> = {};
  const inventory: InventoryItem[] = items.slice(0, 400).map((d, k) => {
    let id = (d.id || `I-${k + 1}`).trim().replace(/[^A-Za-z0-9_.-]+/g, "-").slice(0, 16) || `I-${k + 1}`;
    while (used.has(id)) id = `${id}b`;
    used.add(id);
    if (!(d.id in idMap)) idMap[d.id] = id;

    const notes: string[] = [];
    let status: CheckStatus = "open";
    let page = Number.isInteger(d.page) && d.page >= 1 && d.page <= source.count ? d.page : 0;
    const q = canon(d.quote);
    if (q.length >= 8) {
      const onPage = canonPages.find((p) => p.page === page)?.text.includes(q);
      if (onPage) status = "matched";
      else {
        const other = canonPages.find((p) => p.text.includes(q));
        if (other) {
          notes.push(`The model cited ${where(d.page)}; the quote was found in ${where(other.page)}.`);
          page = other.page;
          status = "matched";
        } else {
          status = "unclear";
          notes.push("The quoted passage was not found in the source text. Check the original.");
        }
      }
    } else {
      notes.push("No usable quote was provided for this entry.");
    }
    if (page === 0) {
      page = 1;
      status = "unclear";
      notes.push("The cited location does not exist in this source.");
    }
    if (source.pageStatus.find((p) => p.page === page)?.status === "unreadable") {
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
      notes.push("External material, not part of this source.");
    }
    return {
      id,
      type: d.type,
      title: clip(d.title, 90),
      statement: clip(d.statement, 600),
      quantity: hasValue ? { value: clip(d.value, 80), unit: clip(d.unit, 40), reference: clip(d.refers_to, 200), conditions: clip(d.conditions, 300) } : undefined,
      source: { page, section: clip(d.section, 120), quote: d.quote.trim() ? clip(d.quote.trim(), 400) : undefined },
      place: d.place,
      planned: d.place,
      status,
      note: notes.join(" ") || undefined,
    };
  });
  return { inventory, idMap };
}

// ───────────────────────── scenes ─────────────────────────
export interface SceneContext {
  byId: Map<string, InventoryItem>;
  idMap: Record<string, string>;
}

export function sceneFromDraft(d: SceneDraft, id: string, ctx: SceneContext): Scene | null {
  const ref = (r: string) => {
    const mapped = ctx.idMap[r] ?? r;
    return ctx.byId.has(mapped) ? mapped : undefined;
  };
  const seenKeys = new Set<string>();
  const keyOf = (raw: string, fallback: string) => {
    let key = (raw || fallback).trim().replace(/\s+/g, "-").slice(0, 24) || fallback;
    while (seenKeys.has(key)) key += "x";
    seenKeys.add(key);
    return key;
  };
  const rawKeys = new Map<string, string>();
  const cards = d.cards.slice(0, 6).map((c, k) => {
    const key = keyOf(c.key, `c${k + 1}`);
    rawKeys.set(c.key, key);
    return { key, tag: clip(c.tag.trim(), 14), title: clip(c.title, 50), body: clip(c.body, 110), icon: c.icon, ref: ref(c.ref) };
  });
  const rows = d.rows
    .filter((r) => Number.isFinite(r.from) && Number.isFinite(r.to) && ref(r.ref))
    .slice(0, 4)
    .map((r, k) => {
      const key = keyOf(r.key, `r${k + 1}`);
      rawKeys.set(r.key, key);
      return { key, label: clip(r.label, 40), from: Math.min(r.from, r.to), to: Math.max(r.from, r.to), display: clip(r.display, 28), ref: ref(r.ref)!, tone: r.tone };
    });

  const cardTexts = [...cards.map((c) => ({ key: c.key, ref: c.ref, text: `${c.tag} ${c.title} ${c.body}` })), ...rows.map((r) => ({ key: r.key, ref: r.ref as string | undefined, text: `${r.label} ${r.display}` }))];
  const cues = d.cues
    .slice(0, 12)
    .filter((c) => c.text.trim())
    .map((c) => {
      const refs = [...new Set(c.refs.map(ref).filter((x): x is string => Boolean(x)))];
      return { text: clip(c.text.trim(), 320), refs, connective: c.connective && refs.length === 0 ? true : undefined, focus: c.focus.trim() || undefined, duck: c.duck, shot: c.shot };
    });
  if (cues.length === 0) return null;
  const base = { id, title: clip(d.title, 60), question: clip(d.question.trim() || d.headline.trim() || d.title, 160) };
  const finish = (scene: Scene, keys: string[]): Scene => {
    // A focus that names no element on screen would hide nothing and point nowhere: drop it.
    const valid = new Set(keys);
    const out = scene.cues.map((c) => ({ ...c, focus: c.focus && valid.has(rawKeys.get(c.focus) ?? c.focus) ? rawKeys.get(c.focus) ?? c.focus : undefined }));
    // The model named no element for any sentence: tie each sentence to the card it talks about,
    // by shared source first, then by shared words, so the picture can still follow the voice.
    const items = cardTexts.filter((c) => valid.has(c.key));
    if (items.length > 1 && !out.some((c) => c.focus)) {
      const words = (t: string) => new Set(t.toLowerCase().match(/[a-z0-9]{4,}/g) ?? []);
      for (const cue of out) {
        if (cue.connective) continue;
        const cw = words(cue.text);
        let best: { key: string; score: number } | null = null;
        for (const it of items) {
          const score = (it.ref && cue.refs.includes(it.ref) ? 3 : 0) + [...words(it.text)].filter((w) => cw.has(w)).length;
          if (score > 0 && (!best || score > best.score)) best = { key: it.key, score };
        }
        if (best && best.score >= 2) cue.focus = best.key;
      }
    }
    return { ...scene, cues: out };
  };
  const asQuestion = (kicker: string): Scene => finish({ ...base, cues, type: "question", headline: clip(d.headline || d.question || d.title, 160), kicker }, []);

  if (d.type === "question") return asQuestion("The question");

  if (d.type === "statement") {
    const text = clip(d.headline || d.question || d.title, 200);
    const analogy = d.analogy.trim() ? clip(d.analogy.trim(), 220) : undefined;
    const withFocus = cues.map((c, k) => ({ ...c, focus: k === 0 ? "idea" : k === 1 && analogy ? "analogy" : c.focus }));
    rawKeys.set("idea", "idea");
    rawKeys.set("analogy", "analogy");
    return finish({ ...base, cues: withFocus, type: "statement", statement: { text, analogy, icon: d.icon, ref: cues.find((c) => c.refs.length)?.refs[0] } }, ["idea", "analogy"]);
  }

  if (d.type === "comparison" && rows.length >= 2) {
    const lo = Math.min(0, ...rows.map((r) => r.from));
    const hi = Math.max(0, ...rows.map((r) => r.to));
    const span = hi - lo || 1;
    const comparison = finish(
      {
        ...base,
        cues,
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
          derivedNote: "Generated chart: values taken from the cited passages, not re-measured.",
        },
      },
      [...rows.map((r) => r.key), "basis", "axis"],
    );
    return prepareVideoScene(comparison, ctx.byId);
  }

  if (cards.length >= 2) {
    const keys = cards.map((c) => c.key);
    if (d.type === "milestones") return finish({ ...base, cues, type: "milestones", milestones: { items: cards.map((c) => ({ key: c.key, tag: c.tag, title: c.title, body: c.body, ref: c.ref })) } }, keys);
    if (d.type === "flow") return finish({ ...base, cues, type: "flow", flow: { steps: cards.map((c) => ({ key: c.key, title: c.title, detail: c.body, icon: c.icon, facts: c.ref ? [{ text: "Source", ref: c.ref }] : [] })) } }, keys);
    return finish({ ...base, cues, type: "points", points: { items: cards.map(({ key, title, body, icon, ref: r }) => ({ key, title, body, icon, ref: r })) } }, keys);
  }
  // Minimal fallback: a scene with only spoken sentences is shown as a headline card.
  return asQuestion(clip(d.title, 60));
}

export function chaptersFromStoryboard(sb: StoryboardDraft, ctx: SceneContext, introTitle: string): { intro: Chapter; chapters: Chapter[] } {
  let n = 0;
  const scenesOf = (list: SceneDraft[], prefix: string) => list.slice(0, 10).map((s) => sceneFromDraft(s, `${prefix}-${++n}`, ctx)).filter((s): s is Scene => s !== null);
  const intro: Chapter = { id: "intro", kind: "intro", title: introTitle, summary: "The question, one key idea, and what you need to read it correctly.", scenes: scenesOf(sb.intro_scenes, "intro") };
  const chapters: Chapter[] = sb.chapters
    .slice(0, 8)
    .map((c, k) => ({ id: `ch-${k + 1}`, kind: c.kind, title: clip(c.title, 60), summary: clip(c.summary, 200), scenes: scenesOf(c.scenes, `ch${k + 1}`) }))
    .filter((c) => c.scenes.length > 0);
  return { intro, chapters };
}

// ───────────────────────── placement: everything stays reachable ─────────────────────────
/**
 * Recomputes where each inventory entry lives, from what the scenes actually use.
 * Entries planned for the video but not used there move to a detail view. Safe to run again
 * after a single scene was regenerated.
 */
export function regroup(inventory: InventoryItem[], intro: Chapter, chapters: Chapter[]): { details: DetailView[]; appendix: AppendixSection[] } {
  const inIntro = new Set<string>();
  const inChapter = new Set<string>();
  for (const sc of intro.scenes) for (const { ref } of sceneRefs(sc)) inIntro.add(ref);
  for (const ch of chapters) for (const sc of ch.scenes) for (const { ref } of sceneRefs(sc)) inChapter.add(ref);
  const MOVED = "Planned for the video but not used there; kept here.";
  for (const it of inventory) {
    const planned = it.planned ?? it.place;
    const note = (it.note ?? "").replace(MOVED, "").trim();
    if (inIntro.has(it.id) || inChapter.has(it.id)) {
      // Entries planned as detail/appendix keep that home as well; the scene is an extra.
      it.place = planned === "detail" || planned === "appendix" ? planned : inIntro.has(it.id) && (planned === "intro" || !inChapter.has(it.id)) ? "intro" : "chapter";
      it.note = note || undefined;
    } else if (planned === "intro" || planned === "chapter") {
      it.place = "detail";
      it.note = `${note ? note + " " : ""}${MOVED}`;
    } else {
      it.place = planned;
      it.note = note || undefined;
    }
  }
  const group = (place: "detail" | "appendix") => {
    const groups = new Map<string, string[]>();
    for (const it of inventory) if (it.place === place) groups.set(it.type, [...(groups.get(it.type) ?? []), it.id]);
    return [...groups.entries()].map(([type, items]) => ({ id: `${place === "detail" ? "d" : "a"}-${type}`, title: TYPE_PLURAL[type as keyof typeof TYPE_PLURAL], items }));
  };
  return { details: group("detail").map((g) => ({ ...g, intro: "Content the video does not spell out, with its place in the source." })), appendix: group("appendix") };
}

/** The automatic verification report: what was actually compared, and with what result. */
export function autoVerification(lesson: Pick<Lesson, "inventory" | "intro" | "chapters" | "details" | "appendix" | "pageStatus" | "meta">): Lesson["verification"] {
  const withQuote = lesson.inventory.filter((it) => it.source.quote);
  const matched = withQuote.filter((it) => it.status === "matched").length;
  const unreadable = lesson.pageStatus.filter((p) => p.status === "unreadable").map((p) => p.page);
  const scenes = [...lesson.intro.scenes, ...lesson.chapters.flatMap((c) => c.scenes)];
  const flagged = scenes.filter((s) => s.check?.status === "flagged");
  const repaired = scenes.filter((s) => s.check?.status === "repaired");
  const isText = lesson.meta.sourceKind === "text";
  const notes = [
    ...(unreadable.length ? [`Pages without readable text (not covered): ${unreadable.join(", ")}.`] : []),
    ...(repaired.length ? [`${repaired.length} scene(s) failed the automatic check once and were regenerated.`] : []),
    ...(flagged.length ? [`${flagged.length} scene(s) still have open problems and are marked in the player: ${flagged.map((s) => s.title).join("; ")}.`] : []),
    ...(isText ? [] : ["The reference list is linked to its page in the original; it is not reproduced. Figures and tables are shown only where a scene says so."]),
  ];
  const cov = analyzeCoverage(lesson);
  if (cov.issues.length) notes.push(`${cov.issues.length} coverage issue(s) found automatically; see the list below.`);
  return {
    mode: "auto",
    fullyChecked: false,
    checkedAt: new Date().toISOString().slice(0, 10),
    method: `Generated automatically from the ${isText ? "pasted text" : "PDF text layer"}. Machine checks only: each quote was searched in its stated ${isText ? "paragraph" : "page"}, numbers spoken or shown were compared with the cited passage, and coverage was computed in both directions. No person has reviewed the statements.`,
    quoteChecks: { total: withQuote.length, matched, failed: withQuote.filter((it) => it.status !== "matched" && it.status !== "external").map((it) => it.id) },
    notes,
  };
}
