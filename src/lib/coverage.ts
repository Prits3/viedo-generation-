// Two-way coverage check between inventory and storyboard.
//  forward:  every inventory entry has a reachable place (intro, chapter, detail view, appendix)
//  backward: every spoken sentence with scientific content points at existing inventory entries
import type { Chapter, InventoryItem, Lesson, Placement, Scene } from "./types.ts";

export interface SceneRef {
  chapterId: string;
  chapterTitle: string;
  /** -1 = intro */
  chapterIndex: number;
  sceneId: string;
  sceneTitle: string;
  sceneIndex: number;
  cueIndex: number;
}

export interface ItemLocation {
  placements: Placement[];
  scenes: SceneRef[];
  details: string[];
  appendix: string[];
}

export interface CoverageIssue {
  kind: "item-without-place" | "declared-place-missing" | "cue-without-source" | "unknown-ref" | "duplicate-id";
  message: string;
  id?: string;
}

export interface CoverageReport {
  locations: Record<string, ItemLocation>;
  issues: CoverageIssue[];
  counts: Record<Placement, number>;
  cues: { total: number; sourced: number; connective: number };
  statusCounts: Record<string, number>;
  pages: { page: number; items: number }[];
}

/** All inventory IDs a scene shows or speaks, with the sentence where each first matters. */
export function sceneRefs(scene: Scene): { ref: string; cueIndex: number }[] {
  const out: { ref: string; cueIndex: number }[] = [];
  scene.cues.forEach((c, k) => c.refs.forEach((ref) => out.push({ ref, cueIndex: k })));
  const firstFocus = (key: string) => {
    const k = scene.cues.findIndex((c) => c.focus === key);
    return k < 0 ? 0 : k;
  };
  const add = (ref: string | undefined, key?: string) => {
    if (ref) out.push({ ref, cueIndex: key ? firstFocus(key) : 0 });
  };
  scene.comparison?.rows.forEach((r) => add(r.ref, r.key));
  scene.comparison?.annotations?.forEach((a) => add(a.ref, a.key));
  add(scene.comparison?.basisRef, "basis");
  scene.flow?.steps.forEach((s) => s.facts?.forEach((f) => add(f.ref, s.key)));
  scene.map?.groups.forEach((g) => add(g.ref));
  add(scene.figure?.figureRef);
  scene.figure?.callouts.forEach((c) => add(c.ref, c.key));
  scene.points?.items.forEach((p) => add(p.ref, p.key));
  add(scene.timeline?.marker.ref, "marker");
  scene.timeline?.facts.forEach((f) => add(f.ref, f.key));
  scene.establishing?.labels.forEach((l) => add(l.ref, l.key));
  return out;
}

type CoverageInput = Pick<Lesson, "inventory" | "intro" | "chapters" | "details" | "appendix"> & { meta: { pages: number } };

export function analyzeCoverage(lesson: CoverageInput): CoverageReport {
  const issues: CoverageIssue[] = [];
  const byId = new Map<string, InventoryItem>();
  for (const it of lesson.inventory) {
    if (byId.has(it.id)) issues.push({ kind: "duplicate-id", id: it.id, message: `Inventory ID ${it.id} is used twice.` });
    byId.set(it.id, it);
  }
  const locations: Record<string, ItemLocation> = {};
  const loc = (id: string) => (locations[id] ??= { placements: [], scenes: [], details: [], appendix: [] });
  const place = (id: string, p: Placement) => {
    const l = loc(id);
    if (!l.placements.includes(p)) l.placements.push(p);
  };

  const cues = { total: 0, sourced: 0, connective: 0 };
  const walk = (chapter: Chapter, chapterIndex: number) => {
    chapter.scenes.forEach((scene, sceneIndex) => {
      scene.cues.forEach((cue, k) => {
        cues.total++;
        if (cue.connective) cues.connective++;
        else if (cue.refs.length > 0) cues.sourced++;
        else issues.push({ kind: "cue-without-source", id: scene.id, message: `Sentence ${k + 1} in scene "${scene.title}" has no source.` });
      });
      const seen = new Set<string>();
      for (const { ref, cueIndex } of sceneRefs(scene)) {
        if (!byId.has(ref)) {
          issues.push({ kind: "unknown-ref", id: ref, message: `Scene "${scene.title}" references unknown inventory ID ${ref}.` });
          continue;
        }
        place(ref, chapter.kind === "intro" ? "intro" : "chapter");
        if (seen.has(ref)) continue;
        seen.add(ref);
        loc(ref).scenes.push({ chapterId: chapter.id, chapterTitle: chapter.title, chapterIndex, sceneId: scene.id, sceneTitle: scene.title, sceneIndex, cueIndex });
      }
    });
  };
  walk(lesson.intro, -1);
  lesson.chapters.forEach((c, k) => walk(c, k));

  for (const d of lesson.details)
    for (const id of d.items) {
      if (!byId.has(id)) issues.push({ kind: "unknown-ref", id, message: `Detail view "${d.title}" references unknown inventory ID ${id}.` });
      else {
        place(id, "detail");
        loc(id).details.push(d.id);
      }
    }
  for (const a of lesson.appendix)
    for (const id of a.items) {
      if (!byId.has(id)) issues.push({ kind: "unknown-ref", id, message: `Appendix "${a.title}" references unknown inventory ID ${id}.` });
      else {
        place(id, "appendix");
        loc(id).appendix.push(a.id);
      }
    }

  const counts: Record<Placement, number> = { intro: 0, chapter: 0, detail: 0, appendix: 0, "original-only": 0 };
  const statusCounts: Record<string, number> = {};
  for (const it of lesson.inventory) {
    const l = loc(it.id);
    statusCounts[it.status] = (statusCounts[it.status] ?? 0) + 1;
    if (l.placements.length === 0) {
      l.placements.push("original-only");
      if (it.place !== "original-only")
        issues.push({ kind: "item-without-place", id: it.id, message: `${it.id} (${it.title}) is not reachable in the lesson; only in the original.` });
    } else if (it.place !== "original-only" && !l.placements.includes(it.place)) {
      issues.push({ kind: "declared-place-missing", id: it.id, message: `${it.id} is planned for "${it.place}" but only appears in: ${l.placements.join(", ")}.` });
    }
    for (const p of l.placements) counts[p]++;
  }

  const pages: { page: number; items: number }[] = [];
  for (let p = 1; p <= lesson.meta.pages; p++) pages.push({ page: p, items: lesson.inventory.filter((it) => it.source.page === p).length });

  return { locations, issues, counts, cues, statusCounts, pages };
}

/** Scene that explains an inventory entry. Chapters win over the intro so jumps land on the fuller explanation. */
export function bestScene(l: ItemLocation | undefined, prefer: "chapter" | "intro" = "chapter"): SceneRef | undefined {
  if (!l || l.scenes.length === 0) return undefined;
  const inChapter = l.scenes.find((s) => s.chapterIndex >= 0);
  const inIntro = l.scenes.find((s) => s.chapterIndex < 0);
  return prefer === "chapter" ? inChapter ?? inIntro : inIntro ?? inChapter;
}
