// Local tutor: answers a question about the lesson by choosing passages of the source, without a
// model call. Every answer is built from the plain-language statements of inventory entries and
// cites their page and verbatim quote, so it works on any host and never says more than the source.
//
// Context, in order of weight: the sentence being spoken when the viewer paused, the current scene,
// the previous answer (for follow-ups such as "What is the evidence?").
import type { InventoryItem, Scene } from "./types.ts";

export interface Citation {
  id: string;
  title: string;
  page: number;
  quote?: string;
}

export type TutorKind = "answer" | "evidence" | "simpler" | "not_found" | "clarify" | "resume";

export interface TutorReply {
  kind: TutorKind;
  text: string;
  citations: Citation[];
  /** For "clarify": the choices, as questions the viewer can send with one click. */
  options?: string[];
}

export interface TutorContext {
  scene: Scene;
  /** Index of the sentence that was playing (or last played) in the scene, -1 before the first. */
  cueIndex: number;
  inventory: InventoryItem[];
  /** Inventory IDs of the previous answer, for follow-up questions. Empty after a context reset. */
  previous: string[];
}

const STOP = new Set(
  "a an and are as at be been being but by can could did do does doing for from had has have how i if in into is it its just me more most my no not of on or our so some such than that the their them then there these they this those to too very was we were what when where which while who whom why will with would you your about also may might shall should tell explain say said says show please mean means meant much many lot get got".split(" "),
);

// A few spellings that should meet: cooling/cooler/cool, south/southern, tree/trees ...
const ALIAS: Record<string, string> = {
  cooler: "cool", cooling: "cool", cooled: "cool", cools: "cool", colder: "cool",
  warmer: "warm", warming: "warm", hotter: "warm", heat: "warm", hot: "warm",
  southern: "south", mediterranean: "south", central: "centr", centre: "centr", center: "centr",
  trees: "tree", forests: "forest", lower: "low", lowest: "low", less: "low", smaller: "low", weaker: "low",
  higher: "high", highest: "high", bigger: "high", stronger: "high", larger: "high",
  temperatures: "temperatur", temperature: "temperatur", lst: "temperatur", lsts: "temperatur",
  evapotranspiration: "evapotranspir", et: "evapotranspir", cities: "city", urban: "city",
};

function stem(w: string): string {
  if (ALIAS[w]) return ALIAS[w];
  if (w.length > 5 && w.endsWith("ies")) return w.slice(0, -3) + "y";
  if (w.length > 5 && w.endsWith("ing")) return w.slice(0, -3);
  if (w.length > 4 && w.endsWith("es")) return w.slice(0, -2);
  if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss")) return w.slice(0, -1);
  return w;
}

export function terms(text: string): string[] {
  return (text.toLowerCase().normalize("NFKD").replace(/[^a-z0-9\s-]/g, " ").split(/[\s-]+/) ?? [])
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map(stem);
}

const RESUME = /^\s*(please\s+)?(continue|resume)(\s+the)?(\s+lesson|\s+video|\s+playing)?\s*[.!]?\s*$/i;
const EVIDENCE = /\b(evidence|proof|prove|source|sources|cite|citation|where does (it|the paper|the text) say|which page|show me)\b/i;
const SIMPLER = /\b(simpl\w*|easier|plain(er)? (english|words|language)|in short|eli5|like i'?m (five|5)|dumb it down)\b/i;
const VAGUE = /^\s*(why|how|what|and)?\s*(about|is|was|does)?\s*(that|this|it|those|these|them)\s*\??\s*$/i;

/** Is this the unambiguous voice/text command to go on with the lesson? */
export const isResumeCommand = (text: string) => RESUME.test(text);

function cite(it: InventoryItem): Citation {
  return { id: it.id, title: it.title, page: it.source.page, quote: it.source.quote };
}

function firstSentence(text: string): string {
  const m = text.match(/^.*?[.!?](\s|$)/);
  return (m ? m[0] : text).trim();
}

function sceneRefs(scene: Scene): string[] {
  return [...new Set(scene.cues.flatMap((c) => c.refs))];
}

const GLOSSARY: Record<string, string> = {
  evapotranspiration: "water that plants and soil give off into the air, which cools them",
  "land surface temperature": "how hot the ground or a roof feels, measured by satellite, not the air temperature",
  "urban fabric": "built-up land such as streets and buildings",
  kelvin: "a temperature step of the same size as one degree Celsius",
  albedo: "how much sunlight a surface reflects",
};

const CAUSE = /\b(because|due to|related to|linked to|caused|driven|explain\w*|reason|limited by|leads? to|result\w* (in|from))\b/i;

/** Score of one passage and how many distinct question words it contains. */
function score(it: InventoryItem, q: string[], boost: number, why: boolean, rare: Set<string>): { s: number; hits: number } {
  const title = new Set(terms(it.title));
  const text = `${it.statement} ${it.source.quote ?? ""} ${it.quantity?.reference ?? ""} ${it.quantity?.conditions ?? ""}`;
  const body = new Set(terms(text));
  let s = 0;
  let hits = 0;
  for (const w of new Set(q)) {
    // A rare word (a name, a technical term) found in the passage says as much as two common ones.
    const weight = rare.has(w) ? 2 : 1;
    if (title.has(w)) (s += 2 * weight), (hits += weight);
    else if (body.has(w)) (s += weight), (hits += weight);
  }
  if (s === 0) return { s: 0, hits: 0 };
  // A "why" question wants the passage that gives a cause, not the one that restates the fact.
  if (why && CAUSE.test(`${it.title} ${text}`)) s += 2;
  return { s: s + boost, hits };
}

/** Where the answer stands in the source, as a short label. */
export function pageLabel(c: Citation, kind: "pdf" | "text" = "pdf"): string {
  if (c.page <= 0) return "outside the source";
  return kind === "text" ? `§${c.page}` : `page ${c.page}`;
}

export function answer(question: string, ctx: TutorContext, kind: "pdf" | "text" = "pdf"): TutorReply {
  const byId = new Map(ctx.inventory.map((it) => [it.id, it]));
  const cue = ctx.cueIndex >= 0 ? ctx.scene.cues[ctx.cueIndex] : undefined;
  const cueRefs = (cue?.refs ?? []).filter((r) => byId.has(r));
  const here = sceneRefs(ctx.scene).filter((r) => byId.has(r));
  const where = (c: Citation) => pageLabel(c, kind);

  if (isResumeCommand(question)) return { kind: "resume", text: "Continuing the lesson.", citations: [] };

  // "What is the evidence?": the quotes behind the last answer, else behind the current sentence.
  if (EVIDENCE.test(question) && terms(question.replace(EVIDENCE, "")).length <= 1) {
    const ids = (ctx.previous.length ? ctx.previous : cueRefs.length ? cueRefs : here).slice(0, 2);
    const items = ids.map((id) => byId.get(id)).filter((x): x is InventoryItem => Boolean(x?.source.quote));
    if (!items.length) return { kind: "not_found", text: "There is no quoted passage for this point yet. Ask about a specific statement and I will look for it in the source.", citations: [] };
    const text = items.map((it) => `On ${where(cite(it))} the source says: “${it.source.quote}”`).join(" ");
    return { kind: "evidence", text, citations: items.map(cite) };
  }

  // "Explain that more simply": the first sentence of the plain-language statement behind the last answer.
  if (SIMPLER.test(question) && terms(question.replace(SIMPLER, "")).length <= 1) {
    const ids = ctx.previous.length ? ctx.previous : cueRefs.length ? cueRefs : here;
    const it = ids.map((id) => byId.get(id)).find(Boolean);
    if (!it) return { kind: "not_found", text: "Ask me about a point first, then I can say it more simply.", citations: [] };
    // The entry title is the plain one-line version of the point; hard words get a general explanation,
    // marked as such because it does not come from the source.
    const words = Object.entries(GLOSSARY).filter(([w]) => new RegExp(`\\b${w}`, "i").test(`${it.title} ${it.statement}`)).slice(0, 2);
    const help = words.length ? ` Word help (general meaning, not from the source): ${words.map(([w, d]) => `${w}: ${d}`).join("; ")}.` : "";
    const title = it.title.replace(/[.:]\s*$/, "");
    return { kind: "simpler", text: `In short: ${title.charAt(0).toUpperCase() + title.slice(1)}.${help}`, citations: [cite(it)] };
  }

  const q = terms(question);
  // "Why is that?" while two different points are on screen: ask which one is meant.
  if (q.length === 0 || VAGUE.test(question)) {
    const pool = [...new Set(ctx.previous.length ? ctx.previous : cueRefs.length > 1 ? cueRefs : here)].map((id) => byId.get(id)).filter((x): x is InventoryItem => Boolean(x));
    if (pool.length === 1) return { kind: "answer", text: pool[0].statement, citations: [cite(pool[0])] };
    if (pool.length > 1)
      return {
        kind: "clarify",
        text: "Which point do you mean?",
        citations: [],
        options: pool.slice(0, 3).map((it) => `Tell me more about: ${it.title}`),
      };
    return { kind: "not_found", text: "Could you ask that as a full question? For example: “Why is cooling lower in Southern Europe?”", citations: [] };
  }

  const why = /^\s*why\b/i.test(question);
  const uniq = new Set(q).size;
  const docs = ctx.inventory.map((it) => new Set(terms(`${it.title} ${it.statement} ${it.source.quote ?? ""}`)));
  const rare = new Set([...new Set(q)].filter((w) => {
    const df = docs.filter((d) => d.has(w)).length;
    return df > 0 && df <= Math.max(3, Math.round(ctx.inventory.length * 0.05));
  }));
  const ranked = ctx.inventory
    .map((it) => ({ it, ...score(it, q, cueRefs.includes(it.id) ? 1.5 : here.includes(it.id) ? 1 : ctx.previous.includes(it.id) ? 0.5 : 0, why, rare) }))
    .filter((r) => r.s > 0)
    .sort((a, b) => b.s - a.s);
  const best = ranked[0];
  // The passage must contain most of what was asked: at least half of the question words, and two of them
  // when the question has two or more. Otherwise the source leaves the question open.
  if (!best || best.hits < Math.min(2, uniq) || best.hits / uniq < 0.5) {
    return {
      kind: "not_found",
      text: best
        ? `The source does not answer that directly. The closest passage is “${best.it.title}” on ${where(cite(best.it))}: ${firstSentence(best.it.statement)}`
        : "The source does not say anything about that, so I will not guess.",
      citations: best ? [cite(best.it)] : [],
    };
  }
  const picked = ranked.filter((r) => r.s >= best.s - 1).slice(0, 2).map((r) => r.it);
  return { kind: "answer", text: picked.map((it) => it.statement).join(" "), citations: picked.map(cite) };
}
