// The plan of an exported video: which scenes it contains, where each one starts on the video
// clock, where a shortened cut ends, and how long the end card is. The render view
// (/lesson/<id>/render) and the exporter (scripts/export-video.mjs) both build the plan with this
// module, so pictures and audio are laid out on the same clock.
import type { Cue, Lesson, Scene } from "./types.ts";
import { locLabel } from "./labels.ts";

export const VIDEO_FPS = 30;
export const END_CARD_SECONDS = 3;

export type VideoFormat = "vertical" | "landscape";

/** Output size, and the CSS viewport it is rendered from (CSS size x scale = output size). */
export const VIDEO_FORMATS: Record<VideoFormat, { width: number; height: number; cssWidth: number; cssHeight: number; scale: number; captionChars: number }> = {
  vertical: { width: 1080, height: 1920, cssWidth: 432, cssHeight: 768, scale: 2.5, captionChars: 52 },
  landscape: { width: 1920, height: 1080, cssWidth: 960, cssHeight: 540, scale: 2, captionChars: 92 },
};

export interface PlanOptions {
  /** Upper limit for the whole video including the end card. The cut is made after a sentence. */
  maxSeconds?: number;
  /** Length of the end card in seconds (0 = none). */
  endCard?: number;
  /** Start at this scene instead of the first one. */
  fromScene?: string;
}

export interface PlannedScene {
  scene: Scene;
  /** Start on the video clock, seconds. */
  start: number;
  /** Seconds of this scene that are shown (shorter than the scene when the video is cut here). */
  length: number;
  cut: boolean;
}

export interface VideoPlan {
  fps: number;
  scenes: PlannedScene[];
  /** Seconds of lesson content before the end card. */
  content: number;
  endCard: number;
  frames: number;
  /** frames / fps: content + end card, rounded to a whole frame. */
  duration: number;
  /** True when scenes or sentences of the lesson were left out. */
  shortened: boolean;
}

export function lessonScenes(lesson: Lesson): Scene[] {
  return [...lesson.intro.scenes, ...lesson.chapters.flatMap((c) => c.scenes)];
}

/** Scenes that cannot be exported because they have no recorded narration. */
export function scenesWithoutNarration(plan: VideoPlan): string[] {
  return plan.scenes.filter((p) => !p.scene.audio).map((p) => p.scene.id);
}

export function planVideo(lesson: Lesson, opts: PlanOptions = {}): VideoPlan {
  const all = lessonScenes(lesson);
  const from = opts.fromScene ? all.findIndex((s) => s.id === opts.fromScene) : 0;
  if (from < 0) throw new Error(`Scene "${opts.fromScene}" is not part of this lesson.`);
  const endCard = Math.max(0, opts.endCard ?? END_CARD_SECONDS);
  const budget = opts.maxSeconds && opts.maxSeconds > 0 ? Math.max(1, opts.maxSeconds - endCard) : Infinity;
  const scenes: PlannedScene[] = [];
  let at = 0;
  for (const scene of all.slice(from)) {
    const full = scene.duration ?? 0;
    if (full <= 0) continue;
    if (at + full <= budget + 1e-6) {
      scenes.push({ scene, start: at, length: full, cut: false });
      at += full;
      continue;
    }
    // The scene does not fit: keep the sentences that do and stop in the pause after the last one.
    let length = 0;
    scene.cues.forEach((cue, k) => {
      const next = scene.cues[k + 1];
      const stop = Math.min((cue.end ?? 0) + 0.3, next ? (next.start ?? full) - 0.02 : full);
      if (at + stop <= budget + 1e-6) length = stop;
    });
    // Not even one sentence fits and there is nothing before it: cut at the limit.
    if (length === 0 && scenes.length === 0) length = Math.min(full, budget);
    if (length > 0) {
      scenes.push({ scene, start: at, length, cut: true });
      at += length;
    }
    break;
  }
  const frames = Math.round((at + endCard) * VIDEO_FPS);
  const shortened = from > 0 || scenes.length < all.filter((s) => (s.duration ?? 0) > 0).length || scenes.some((p) => p.cut);
  return { fps: VIDEO_FPS, scenes, content: at, endCard, frames, duration: frames / VIDEO_FPS, shortened };
}

export interface VideoPosition {
  /** Index into plan.scenes. */
  index: number;
  /** Seconds into that scene. */
  t: number;
  /** True while the end card is shown. */
  ended: boolean;
}

/** What the video shows at time T on the video clock. */
export function positionAt(plan: VideoPlan, T: number): VideoPosition {
  const last = plan.scenes.length - 1;
  if (T >= plan.content) return { index: last, t: plan.scenes[last]?.length ?? 0, ended: plan.endCard > 0 };
  let index = 0;
  for (let i = 0; i <= last; i++) if (plan.scenes[i].start <= T + 1e-9) index = i;
  return { index, t: Math.max(0, T - plan.scenes[index].start), ended: false };
}

/** Time of the middle of a frame; frames are sampled there so no cue is off by more than half a frame. */
export function frameTime(frame: number, fps = VIDEO_FPS): number {
  return (frame + 0.5) / fps;
}

/**
 * Splits a sentence into caption-sized pieces at punctuation and word boundaries.
 * Short sentences stay whole.
 */
export function captionChunks(text: string, maxChars: number): string[] {
  const clean = text.trim().replace(/\s+/g, " ");
  if (clean.length <= maxChars) return [clean];
  const words = clean.split(" ");
  const target = clean.length / Math.ceil(clean.length / maxChars);
  const out: string[] = [];
  let cur = "";
  for (const w of words) {
    const joined = cur ? `${cur} ${w}` : w;
    if (cur && joined.length > maxChars) {
      out.push(cur);
      cur = w;
      continue;
    }
    cur = joined;
    const atBreak = /[,;:.!?—–)]$/.test(w);
    if (cur.length >= target || (atBreak && cur.length >= target * 0.7)) {
      out.push(cur);
      cur = "";
    }
  }
  if (cur) {
    // A last piece of one or two short words reads better attached to the piece before it.
    if (out.length && cur.length < 12 && out[out.length - 1].length + cur.length + 1 <= maxChars * 1.15) out[out.length - 1] += ` ${cur}`;
    else out.push(cur);
  }
  return out;
}

export interface CaptionPiece {
  text: string;
  /** Position of this piece in the sentence, for keys and checks. */
  part: number;
  parts: number;
}

/**
 * The caption piece at time t of a scene. Sentence starts and ends are the recorded timings;
 * inside a sentence, pieces share the time in proportion to their length (an estimate, the
 * recording has no word timings).
 */
export function captionAt(cue: Cue | undefined, t: number, maxChars: number): CaptionPiece | null {
  if (!cue) return null;
  const pieces = captionChunks(cue.text, maxChars);
  if (pieces.length === 1) return { text: pieces[0], part: 0, parts: 1 };
  const start = cue.start ?? 0;
  const span = Math.max(0.1, (cue.end ?? start) - start);
  const total = pieces.reduce((n, p) => n + p.length, 0);
  let acc = 0;
  let part = 0;
  for (let i = 0; i < pieces.length; i++) {
    if (t >= start + (span * acc) / total - 1e-9) part = i;
    acc += pieces[i].length;
  }
  return { text: pieces[part], part, parts: pieces.length };
}

/** Text of the source chip for a sentence: where in the original it comes from. */
export function sourceChip(lesson: Lesson, cue: Cue | undefined): { where: string; title: string } {
  const kind = lesson.meta.sourceKind;
  const items = (cue?.refs ?? []).map((r) => lesson.inventory.find((it) => it.id === r)).filter((it) => it !== undefined);
  if (!items.length) return { where: "", title: cue?.connective ? "Transition, no claim" : "" };
  const pages = [...new Set(items.map((it) => it.source.page))].sort((a, b) => a - b);
  return { where: pages.slice(0, 3).map((p) => locLabel(kind, p)).join(", "), title: items[0].title };
}
