import type { Chapter, Scene } from "./types.ts";
import { estimateSeconds } from "./text.ts";
import { compileActions } from "./actions.ts";

export type SceneTiming = { duration: number; cues: { start: number; end: number }[] };

/**
 * Puts a scene on its clock: cue times from a recording when there is one, otherwise estimated
 * from text length, and the action track compiled against those times.
 */
export function timeScene(scene: Scene, recorded?: SceneTiming, audioUrl?: string): Scene {
  let timed: Scene;
  if (recorded && audioUrl && recorded.cues.length === scene.cues.length) {
    timed = { ...scene, audio: audioUrl, duration: recorded.duration, cues: scene.cues.map((c, k) => ({ ...c, start: recorded.cues[k].start, end: recorded.cues[k].end })) };
  } else {
    let at = 0.4;
    const cues = scene.cues.map((c) => {
      const d = estimateSeconds(c.say ?? c.text);
      const out = { ...c, start: +at.toFixed(2), end: +(at + d).toFixed(2) };
      at += d + 0.35;
      return out;
    });
    timed = { ...scene, audio: undefined, duration: +(at + 0.4).toFixed(2), cues };
  }
  return { ...timed, actions: compileActions(timed) };
}

/** Times every scene of a chapter; `recorded` maps scene IDs to timings of audio files under `audioBase`. */
export function withTimings(chapter: Chapter, recorded: Record<string, SceneTiming> = {}, audioBase?: string): Chapter {
  return { ...chapter, scenes: chapter.scenes.map((scene) => timeScene(scene, recorded[scene.id], audioBase ? `${audioBase}/${scene.id}.mp3` : undefined)) };
}
