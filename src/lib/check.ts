// Automatic check of one scene against the inventory. Deterministic, no model involved.
// A scene that fails is repaired once by the fast model and checked again; if it still fails
// it stays in the lesson, visibly flagged, and can be regenerated on its own.
import type { InventoryItem, Scene } from "./types.ts";
import { chartFindings } from "./comparison-evidence.ts";
import { sceneRefs } from "./coverage.ts";

/** Numbers as written, normalised: "8-12" -> ["8","12"], "3,4" -> "3.4". */
export const digits = (s: string) => (s.match(/\d+(?:[.,]\d+)?/g) ?? []).map((d) => d.replace(",", "."));

const WORDS: Record<string, string> = { zero: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", ten: "10", eleven: "11", twelve: "12" };

function haystack(items: (InventoryItem | undefined)[], extra = ""): Set<string> {
  const text = items.map((it) => (it ? `${it.source.quote ?? ""} ${it.quantity?.value ?? ""} ${it.title} ${it.source.label ?? ""}` : "")).join(" ") + " " + extra;
  const set = new Set(digits(text));
  // A source that writes "two hydrogen bonds" backs a caption that shows "2".
  for (const w of text.toLowerCase().match(/[a-z]+/g) ?? []) if (WORDS[w]) set.add(WORDS[w]);
  return set;
}

/**
 * Problems of a scene:
 *  - a sentence that makes a claim without a source, or leans on an entry marked unclear
 *  - a number spoken or shown that does not occur in the cited passage (the same rule the
 *    Python backend's verifier applies to scripts: no number may be introduced)
 *  - a picture the voice cannot follow (no sentence tied to any card or row)
 * `extraText` is additional source text numbers may come from (e.g. the page of a figure).
 */
export function checkScene(scene: Scene, byId: Map<string, InventoryItem>, extraText = ""): string[] {
  const problems: string[] = [];
  scene.cues.forEach((cue, k) => {
    if (!cue.connective && cue.refs.length === 0) problems.push(`Sentence ${k + 1} makes a statement but cites no inventory entry: "${cue.text}"`);
    for (const r of cue.refs) if (byId.get(r)?.status === "unclear") problems.push(`Sentence ${k + 1} relies on entry ${r}, which is marked unclear.`);
    const nums = digits(cue.text);
    if (nums.length && !cue.connective) {
      const hay = haystack(cue.refs.map((r) => byId.get(r)), extraText);
      const missing = nums.filter((n) => !hay.has(n));
      if (missing.length) problems.push(`Sentence ${k + 1} says ${missing.join(", ")}, which is not in the passages it cites (${cue.refs.join(", ") || "none"}).`);
    }
  });
  for (const f of chartFindings(scene, byId)) problems.push(`${f.code}${f.ref ? ` (${f.ref})` : ""}: ${f.action}`);
  for (const m of scene.milestones?.items ?? []) {
    // Only real dates and measurements are checked; "Step 2" is an order label, not a claim.
    const missing = digits(m.tag).filter((n) => (n.length >= 3 || n.includes(".")) && !haystack([byId.get(m.ref ?? "")]).has(n));
    if (missing.length) problems.push(`Milestone "${m.tag}" is not in the passage of ${m.ref ?? "its (missing) source"}.`);
  }
  const keys: string[] = [];
  scene.points?.items.forEach((p) => keys.push(p.key));
  scene.flow?.steps.forEach((p) => keys.push(p.key));
  scene.milestones?.items.forEach((p) => keys.push(p.key));
  scene.comparison?.rows.forEach((p) => keys.push(p.key));
  if (keys.length > 1 && !keys.some((key) => scene.cues.some((c) => c.focus === key))) problems.push("No sentence is tied to a card or row, so the picture cannot follow the voice.");
  for (const { ref } of sceneRefs(scene)) if (!byId.has(ref)) problems.push(`Unknown inventory entry ${ref}.`);
  return [...new Set(problems)];
}
