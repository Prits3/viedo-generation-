import type { Chapter } from "./types.ts";
import { estimateSeconds } from "./text.ts";

export type SceneTiming = { duration: number; cues: { start: number; end: number }[] };
/** Adds cue timings: from the recorded narration when present, otherwise estimated from text length. */
export function withTimings(chapter: Chapter, recorded: Record<string, SceneTiming> = {}, audioBase?: string): Chapter {
  return {
    ...chapter,
    scenes: chapter.scenes.map((scene) => {
      const t = recorded[scene.id];
      if (t && audioBase && t.cues.length === scene.cues.length) {
        return {
          ...scene,
          audio: `${audioBase}/${scene.id}.mp3`,
          duration: t.duration,
          cues: scene.cues.map((c, k) => ({ ...c, start: t.cues[k].start, end: t.cues[k].end })),
        };
      }
      let at = 0.4;
      const cues = scene.cues.map((c) => {
        const d = estimateSeconds(c.say ?? c.text);
        const out = { ...c, start: at, end: at + d };
        at += d + 0.35;
        return out;
      });
      return { ...scene, audio: undefined, duration: at + 0.4, cues };
    }),
  };
}
