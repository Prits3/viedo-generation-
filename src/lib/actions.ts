// The timed action track of a scene. Sentences are the anchors: each cue contributes a graphic
// action (what is in focus), a camera action (the shot) and a mascot action (the pose), plus any
// extra beats inside the sentence. `stateAt` folds every action at or before a time into the state
// the renderer draws, so the same time always gives the same picture after pause, seek, a chapter
// jump or a change of pace.
import type { Action, Cue, MascotPose, Scene, Shot } from "./types.ts";

const POINTING: Scene["type"][] = ["comparison", "figure", "timeline", "map"];

/** Pose for a sentence without an authored direction. */
export function autoPose(scene: Scene, cue: Cue, k: number): MascotPose {
  if (k === 0) return "enter";
  if (cue.connective) return "listen";
  if (!cue.focus) return cue.refs.length ? "look" : "listen";
  if (POINTING.includes(scene.type)) return "point";
  // Card scenes: alternate so the duck does not repeat one gesture for every card.
  return k % 3 === 2 ? "lean" : k % 2 === 1 ? "point" : "look";
}

export function compileActions(scene: Scene): Action[] {
  const out: Action[] = [];
  scene.cues.forEach((cue, k) => {
    const at = cue.start ?? 0;
    out.push({ at, track: "graphic", do: cue.focus ? "focus" : "rest", target: cue.focus });
    out.push({ at, track: "camera", do: cue.shot ?? "wide" });
    // The duck moves a moment before the voice names the thing, so the eye is already there.
    out.push({ at: Math.max(0, at - 0.25), track: "mascot", do: cue.duck ?? autoPose(scene, cue, k), target: cue.focus });
    for (const b of cue.beats ?? []) out.push({ at: at + b.after, track: b.track, do: b.do, target: b.target });
  });
  return out
    .map((a, i) => ({ a, i }))
    .sort((x, y) => x.a.at - y.a.at || x.i - y.i)
    .map((x) => ({ ...x.a, at: +x.a.at.toFixed(2) }));
}

export interface SceneState {
  /** Index of the sentence being spoken, -1 before the first. */
  step: number;
  focus?: string;
  shot: Shot;
  mascot: { pose: MascotPose | "away"; target?: string };
  revealed: (key: string) => boolean;
  /** Class names for an element with this key: is-on/is-off, is-focus/is-dim. */
  state: (key: string) => string;
}

export function cueIndexAt(scene: Scene, t: number): number {
  let k = -1;
  for (let i = 0; i < scene.cues.length; i++) if ((scene.cues[i].start ?? 0) <= t + 0.001) k = i;
  return k;
}

/** State of a scene at time t (seconds). t < 0 means playback has not started. */
export function stateAt(scene: Scene, t: number): SceneState {
  const actions = scene.actions ?? compileActions(scene);
  let focus: string | undefined;
  let shot: Shot = (actions.find((a) => a.track === "camera")?.do as Shot) ?? "wide";
  let mascot: SceneState["mascot"] = { pose: "away" };
  const seen = new Set<string>();
  const ever = new Set<string>();
  for (const a of actions) {
    if (a.track === "graphic" && a.do === "focus" && a.target) ever.add(a.target);
    if (t < 0 || a.at > t + 0.001) continue;
    if (a.track === "graphic") {
      focus = a.do === "focus" ? a.target : undefined;
      if (focus) seen.add(focus);
    } else if (a.track === "camera") shot = a.do as Shot;
    else mascot = { pose: a.do as MascotPose, target: a.target };
  }
  // Elements no sentence points at are part of the base picture and always visible.
  const revealed = (key: string) => !ever.has(key) || seen.has(key);
  const state = (key: string) => `${revealed(key) ? "is-on" : "is-off"} ${focus === key ? "is-focus" : focus ? "is-dim" : ""}`;
  return { step: t < 0 ? -1 : cueIndexAt(scene, t), focus, shot, mascot, revealed, state };
}
