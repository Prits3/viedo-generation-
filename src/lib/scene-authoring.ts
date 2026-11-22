import * as z from "zod/v4";
import { compileActions } from "./actions.ts";
import { chartFindings, citedMeasurement } from "./comparison-evidence.ts";
import type { LessonFile } from "./lesson-file.ts";
import type { Action, ComparisonRow } from "./types.ts";

const ref = z.string().min(1).max(40);
const Patch = z.strictObject({
  schema: z.literal("paperscenes.scene-visual@1"),
  lessonId: z.string().regex(/^l-[a-z0-9]{8,24}$/),
  baseRevision: z.number().int().positive(),
  sceneId: ref,
  visual: z.strictObject({ type: z.literal("comparison"), refs: z.tuple([ref, ref]), contextRef: ref.optional() }),
});

function sceneFor(file: LessonFile, sceneId: string) {
  const matches = [file.lesson.intro, ...file.lesson.chapters].flatMap((chapter) => chapter.scenes.filter((s) => s.id === sceneId));
  if (matches.length !== 1) throw new Error("The scene ID must identify exactly one scene in the lesson.");
  return matches[0];
}

export function inspectScene(file: LessonFile, sceneId: string) {
  const scene = sceneFor(file, sceneId);
  const refs = new Set(scene.cues.flatMap((cue) => cue.refs));
  const evidence = file.lesson.inventory.filter((item) => refs.has(item.id));
  const measured = evidence.filter((item) => citedMeasurement(item)).slice(0, 16);
  let suggestedPatch: z.infer<typeof Patch> | undefined;
  // Suggestions must pass the same compiler as a user patch.
  for (let i = 0; !suggestedPatch && i < measured.length; i++) {
    for (let j = i + 1; j < measured.length; j++) {
      const draft = { schema: "paperscenes.scene-visual@1", lessonId: file.lesson.id, baseRevision: file.revision, sceneId, visual: { type: "comparison", refs: [measured[i].id, measured[j].id] } } as const;
      try { applyVisualPatch(file, draft); suggestedPatch = Patch.parse(draft); break; }
      catch { /* The two measurements may not be comparable or timed separately. */ }
    }
  }
  return { schema: "paperscenes.scene-inspection@1", lessonId: file.lesson.id, revision: file.revision, scene, evidence, suggestedPatch };
}

/** Compile a visual-only alternate revision. Never write to the lesson store. */
export function applyVisualPatch(file: LessonFile, input: unknown, savedAt = new Date().toISOString()): LessonFile {
  const patch = Patch.parse(input);
  if (patch.lessonId !== file.lesson.id) throw new Error("The patch lesson ID does not match the input lesson.");
  if (patch.baseRevision !== file.revision) throw new Error("The patch base revision is stale; inspect the scene again.");
  const scene = sceneFor(file, patch.sceneId);
  if (scene.check?.status === "flagged") throw new Error("Repair the flagged source statements before changing the picture.");
  if (!["statement", "points", "comparison"].includes(scene.type)) throw new Error("This patch can replace only statement, points or comparison scenes.");
  const { refs, contextRef } = patch.visual;
  if (refs[0] === refs[1]) throw new Error("Choose two distinct source references.");
  if (contextRef && !refs.includes(contextRef)) throw new Error("contextRef must be one of the two measurements.");
  const byId = new Map(file.lesson.inventory.map((item) => [item.id, item]));
  const rows: ComparisonRow[] = refs.map((ref, i) => {
    if (!scene.cues.some((cue) => cue.refs.includes(ref))) throw new Error(`${ref} is not cited by a cue in this scene.`);
    const m = citedMeasurement(byId.get(ref));
    if (!m) throw new Error(`${ref} has no unambiguous cited measurement.`);
    const value = m.from === m.to ? `${m.to}` : `${m.from}–${m.to}`;
    const total = m.denominator === undefined ? "" : ` of ${m.denominator}`;
    return { key: `measure-${i + 1}`, ref, label: m.reference, from: m.from, to: m.to, display: `${m.approximate ? "≈ " : ""}${value}${total} ${m.unit}`, tone: "neutral" };
  });

  const actions: Action[] = (scene.actions ?? compileActions(scene)).flatMap((a) => {
    if (a.track === "graphic") return [];
    if (a.track === "mascot") { const { target: _target, ...untargeted } = a; return [untargeted]; }
    return [a];
  });
  const introduced = new Set<string>();
  for (const cue of scene.cues) {
    const candidates = rows.filter((row) => cue.refs.includes(row.ref));
    const target = candidates.length === 1 ? candidates[0].key : undefined;
    if (target) {
      if (cue.start === undefined || cue.start < 0 || cue.start >= (scene.duration ?? 0)) throw new Error("The comparison needs timed narration cues.");
      introduced.add(target);
      actions.push({ at: cue.start, track: "graphic", do: "focus", target });
    } else if (cue.start !== undefined) actions.push({ at: cue.start, track: "graphic", do: "rest" });
  }
  if (introduced.size !== rows.length) throw new Error("Each measurement needs a separate timed cue that cites it.");
  actions.sort((a, b) => a.at - b.at);

  const unit = citedMeasurement(byId.get(refs[0]))!.unit;
  const min = Math.min(0, ...rows.map((row) => row.from));
  const max = Math.max(0, ...rows.map((row) => row.to));
  const delta = max - min;
  if (!Number.isFinite(delta)) throw new Error("The comparison scale is not finite.");
  let basis = "Compare the measurements in the cited passages.";
  if (contextRef) {
    const entry = byId.get(contextRef);
    const condition = entry?.quantity?.conditions.trim() ?? "";
    if (!condition || condition.length > 80 || !entry?.source.quote?.includes(condition)) throw new Error("contextRef must have a short, verbatim condition in its quote.");
    basis = `Source context: ${condition}`;
  }
  const { statement: _statement, points: _points, ...unchanged } = scene;
  const edited = { ...unchanged, type: "comparison" as const, actions, comparison: {
    rows, min, max, ticks: [min, min + delta / 4, min + delta / 2, max - delta / 4, max], axisLabel: "Measured values", unit, basis, basisRef: contextRef,
  } };
  const problems = chartFindings(edited, byId);
  if (problems.length) throw new Error(problems.map((p) => `${p.code}: ${p.action}`).join(" "));
  const replace = (chapter: LessonFile["lesson"]["intro"]) => chapter.scenes.includes(scene) ? { ...chapter, scenes: chapter.scenes.map((s) => s === scene ? edited : s) } : chapter;
  return { ...file, revision: file.revision + 1, savedAt, lesson: { ...file.lesson, intro: replace(file.lesson.intro), chapters: file.lesson.chapters.map(replace) } };
}
