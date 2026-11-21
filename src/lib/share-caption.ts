// Post text for a shared video, built from the lesson file alone (no model call):
// title, the takeaway, a line that names the source and says the video is AI-generated, hashtags.
import type { Lesson, Scene } from "./types.ts";

function sceneIdea(scene: Scene | undefined): string | undefined {
  return scene?.statement?.text || scene?.headline || scene?.cues[0]?.text;
}

/** The takeaway: a takeaway chapter if the lesson has one, else the key idea of the intro. */
export function takeaway(lesson: Lesson): string {
  const closing = lesson.chapters.find((c) => c.kind === "takeaway");
  return (
    sceneIdea(closing?.scenes.find((s) => s.statement) ?? closing?.scenes[0]) ??
    sceneIdea(lesson.intro.scenes.find((s) => s.statement)) ??
    sceneIdea(lesson.intro.scenes[0]) ??
    lesson.intro.summary
  );
}

/** One line that names the source, for the end card and the post text. */
export function sourceLine(lesson: Lesson, sourceName: string): string {
  const m = lesson.meta;
  if (m.sourceKind === "text") return `pasted text "${sourceName}"`;
  const by = m.authors ? ` by ${m.authors}` : "";
  const year = m.year ? ` (${m.year})` : "";
  return `"${m.title}"${by}${year}, file ${sourceName}`;
}

export function shareCaption(lesson: Lesson, sourceName: string): string {
  const tags = ["#science", "#explained", "#learning", "#education", ...(lesson.meta.sourceKind === "pdf" ? ["#research"] : [])];
  return [
    lesson.meta.title,
    "",
    takeaway(lesson),
    "",
    "Every claim in this video links to its passage in the source.",
    `AI-generated with PaperScenes from: ${sourceLine(lesson, sourceName)}. The narration is a synthetic voice.`,
    "",
    tags.join(" "),
    "",
  ].join("\n");
}
