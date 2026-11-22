import { chartFindings } from "./comparison-evidence.ts";
import type { Lesson } from "./types.ts";
import { captionChunks, planVideo, VIDEO_FORMATS, type VideoFormat } from "./video-plan.ts";

export interface VideoFinding {
  code: string;
  severity: "error" | "warning";
  action: string;
  sceneId?: string;
  ref?: string;
  frame?: number;
  cue?: number;
}

/** Offline review of a timed storyboard. Warnings are editorial heuristics, not scores. */
export function inspectVideo(lesson: Lesson, format: VideoFormat) {
  const plan = planVideo(lesson);
  const findings: VideoFinding[] = [];
  const byId = new Map(lesson.inventory.map((item) => [item.id, item]));
  const shots = new Map<number, { frame: number; sceneId?: string; kind: "entry" | "focus" | "end-card" }>();
  const addShot = (seconds: number, kind: "entry" | "focus" | "end-card", sceneId?: string) => {
    const frame = Math.max(0, Math.min(plan.frames - 1, Math.ceil(seconds * plan.fps - 0.5)));
    if (!shots.has(frame)) shots.set(frame, { frame, sceneId, kind });
  };
  const short = lesson.meta.mode === "short";
  if (!plan.scenes.length) findings.push({ code: "video.no-timeline", severity: "error", action: "Generate a lesson with timed scenes before reviewing a video." });
  let previousEnd: number | undefined;
  let cues = 0;
  for (const { scene, start, length } of plan.scenes) {
    const sceneId = scene.id;
    findings.push(...chartFindings(scene, byId).map((f): VideoFinding => ({ ...f, sceneId, severity: "error" })));
    if (scene.check?.status === "flagged") findings.push({ code: "source.flagged-scene", severity: "error", sceneId, action: "Review this scene against its cited passages before publishing." });
    if (!scene.audio) findings.push({ code: "audio.missing", severity: "error", sceneId, action: "Record narration for this scene; browser-only speech cannot be exported." });
    addShot(start, "entry", sceneId);
    scene.cues.forEach((cue, i) => {
      cues++;
      const at = cue.start, end = cue.end;
      if (at === undefined || end === undefined || at < 0 || end <= at || end > length + 0.03) {
        findings.push({ code: "audio.invalid-cue", severity: "error", sceneId, cue: i + 1, action: "Rebuild the narration and use its actual cue timings." });
        return;
      }
      const readingChars = captionChunks(cue.text, VIDEO_FORMATS[format].captionChars).reduce((n, p) => n + p.length, 0);
      if (readingChars / (end - at) > 20) findings.push({ code: "captions.fast", severity: "warning", sceneId, cue: i + 1, action: "Shorten this caption or slow its delivery; it exceeds 20 characters per second." });
      if (short && i === 0 && previousEnd !== undefined && start + at - previousEnd > 1) {
        const gap = (start + at - previousEnd).toFixed(2);
        findings.push({ code: "pacing.scene-gap", severity: "warning", sceneId, action: `The scheduled gap is ${gap}s. Shorten it unless the viewer needs time to read the picture.` });
      }
      if (i === scene.cues.length - 1) previousEnd = start + end;
      addShot(start + Math.min(length - 0.5 / plan.fps, at + (end - at) * 0.5), "focus", sceneId);
    });
  }
  if (plan.scenes.length && plan.endCard > 0) addShot(plan.content + plan.endCard * 0.5, "end-card");
  return {
    schema: "paperscenes.video-quality@1" as const,
    lessonId: lesson.id,
    format,
    fps: plan.fps,
    totalFrames: plan.frames,
    duration: plan.duration,
    scenes: plan.scenes.length,
    cues,
    frames: [...shots.values()].sort((a, b) => a.frame - b.frame),
    findings,
  };
}
