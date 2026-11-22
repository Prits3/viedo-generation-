// Short mode ("Highlights"): the deterministic parts. Which inventory entries the storyboard is
// offered, and how a short is kept inside its length. Nothing here writes a sentence: a short
// is only ever cut, so every sentence that remains still has its source.
import type { InventoryItem, Scene } from "./types.ts";
import { SHORT } from "./limits.ts";
import { wordCount } from "./text.ts";
import { checkScene } from "./check.ts";

/** How much an entry of this type matters for a summary. Types that are not listed are never offered. */
const WEIGHT: Partial<Record<InventoryItem["type"], number>> = { result: 5, conclusion: 5, question: 4, limitation: 3, background: 2, method: 2, figure: 1, table: 1, formula: 1 };

/**
 * The entries a short is built from: only those whose quote was found in the source, the ones the
 * inventory planned for the video first, results and conclusions before background, numbers
 * before plain statements. Returned in reading order.
 */
export function selectForShort(inventory: InventoryItem[], max: number = SHORT.maxEntries): InventoryItem[] {
  const scored = inventory
    .map((it, k) => ({ it, k, score: (WEIGHT[it.type] ?? 0) + ((it.planned ?? it.place) === "intro" ? 3 : (it.planned ?? it.place) === "chapter" ? 1 : 0) + (it.quantity ? 1 : 0) }))
    .filter((x) => x.it.status === "matched" && WEIGHT[x.it.type]);
  // Too little to choose from: offer everything that is usable.
  if (scored.length < 3) return inventory.filter((it) => it.status === "matched");
  return scored
    .sort((a, b) => b.score - a.score || a.k - b.k)
    .slice(0, max)
    .sort((a, b) => a.k - b.k)
    .map((x) => x.it);
}

/** Entry types whose quote may be short by nature (a caption, a formula, a heading of a list). */
const BRIEF_BY_NATURE = new Set<string>(["figure", "table", "formula", "footnote", "reference", "data", "supplement", "meta"]);

/**
 * False for an inventory entry whose "quote" is a fragment of one to three words. The fast model
 * sometimes ends an inventory with a run of such fragments; a single word found somewhere in the
 * source is not a trace, so a short does not build on them or list them.
 */
export function hasRealQuote(entry: { type: string; quote: string }): boolean {
  return BRIEF_BY_NATURE.has(entry.type) || wordCount(entry.quote) >= 4;
}

// Measured on nine recorded lessons (local voice, length scale 0.93): 0.066 to 0.075 s per
// character of a sentence, which varies less than the time per word (0.36 to 0.47 s). On top comes
// the silence the recording adds around and between sentences (see voice.ts).
const SECONDS_PER_CHAR = 0.07;
const SCENE_OVERHEAD = 1.25;
const SENTENCE_GAP = 0.32;

export function estimateSceneSeconds(scene: Scene): number {
  return SCENE_OVERHEAD + SENTENCE_GAP * Math.max(0, scene.cues.length - 1) + SECONDS_PER_CHAR * scene.cues.reduce((n, c) => n + (c.say ?? c.text).length, 0);
}
/** Length of a run of scenes: the recorded length where there is one, otherwise the estimate. */
export const totalSeconds = (scenes: Scene[]) => +scenes.reduce((s, sc) => s + (sc.duration ?? estimateSceneSeconds(sc)), 0).toFixed(2);

/**
 * Cuts a short down to its bounds. The hook (first scene) and the takeaway (last scene) stay.
 * Order of cuts: scenes beyond the maximum; then third and later sentences of a scene; then whole
 * points, as long as the minimum number of scenes is kept. Returns what was cut, in plain words.
 */
export function fitShort(input: Scene[], maxSeconds: number = SHORT.maxSeconds): { scenes: Scene[]; notes: string[] } {
  let scenes = input.map((s) => ({ ...s, cues: [...s.cues] }));
  const dropPoint = () => {
    // The longest point goes first; the hook and the takeaway are never candidates.
    let longest = 1;
    for (let k = 2; k < scenes.length - 1; k++) if (estimateSceneSeconds(scenes[k]) > estimateSceneSeconds(scenes[longest])) longest = k;
    scenes = scenes.filter((_, k) => k !== longest);
  };
  let droppedScenes = 0;
  let droppedCues = 0;
  while (scenes.length > SHORT.maxScenes) {
    scenes = scenes.filter((_, k) => k !== scenes.length - 2);
    droppedScenes++;
  }
  while (totalSeconds(scenes) > maxSeconds) {
    const long = scenes.filter((s) => s.cues.length > 2).sort((a, b) => b.cues.length - a.cues.length)[0];
    if (long) {
      long.cues.pop();
      // A recorded length no longer describes this scene; it is estimated until it is recorded again.
      delete long.duration;
      droppedCues++;
    } else if (scenes.length > SHORT.minScenes) {
      dropPoint();
      droppedScenes++;
    } else break;
  }
  const notes: string[] = [];
  if (droppedScenes || droppedCues) notes.push(`Short mode: ${[droppedScenes ? `${droppedScenes} scene(s)` : "", droppedCues ? `${droppedCues} sentence(s)` : ""].filter(Boolean).join(" and ")} of the storyboard were cut to keep the short within ${SHORT.maxScenes} scenes and ${SHORT.maxSeconds} seconds. Nothing was rewritten.`);
  return { scenes, notes };
}

/**
 * Short mode repairs by cutting where it can: when every problem of a scene names one sentence
 * and the scene still makes a sourced statement without those sentences, they are removed and
 * nothing is rewritten. Null when that is not possible (the scene then goes to the repair step):
 * also when the first sentence of a headline scene fails, because the headline on screen is
 * that sentence in other words and would stay without its voice.
 */
export function cutFailing(scene: Scene, problems: string[], byId: Map<string, InventoryItem>): { scene: Scene; cut: number } | null {
  const bad = new Set(problems.map((p) => Number(/^Sentence (\d+) /.exec(p)?.[1] ?? 0) - 1));
  if (bad.size === 0 || bad.has(-1)) return null;
  if (bad.has(0) && (scene.type === "statement" || scene.type === "question")) return null;
  const cues = scene.cues.filter((_, k) => !bad.has(k));
  if (!cues.some((c) => c.refs.length)) return null;
  const trimmed = { ...scene, cues };
  return checkScene(trimmed, byId).length ? null : { scene: trimmed, cut: scene.cues.length - cues.length };
}

/** What a finished short is measured by; used by the pipeline's notes and by scripts/check-shorts.mjs. */
export function shortProblems(scenes: Scene[]): string[] {
  const out: string[] = [];
  const seconds = totalSeconds(scenes);
  if (scenes.length < SHORT.minScenes || scenes.length > SHORT.maxScenes) out.push(`${scenes.length} scenes (expected ${SHORT.minScenes} to ${SHORT.maxScenes})`);
  if (seconds < SHORT.minSeconds || seconds > SHORT.maxSeconds) out.push(`${seconds.toFixed(0)} seconds (expected ${SHORT.minSeconds} to ${SHORT.maxSeconds})`);
  return out;
}
