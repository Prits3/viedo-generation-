// Assembles the demo lesson from the verified inventory, the storyboard,
// the narration timings and the last verification report.
import type { Lesson, Verification } from "../../lib/types.ts";
import { withTimings, type SceneTiming } from "../../lib/timing.ts";
import { inventory } from "./inventory.ts";
import { appendix, chapters, details, intro } from "./storyboard.ts";
import timings from "./timings.json" with { type: "json" };
import verification from "./verification.json" with { type: "json" };

const T = timings as Record<string, SceneTiming>;

const allScenes = [...intro.scenes, ...chapters.flatMap((c) => c.scenes)];
const report = verification as unknown as Verification & { pageStatus?: Lesson["pageStatus"] };

export const demoLesson: Lesson = {
  id: "schwaab-2021",
  origin: "demo",
  meta: {
    title: "The role of urban trees in reducing land surface temperatures in European cities",
    authors: "Schwaab, Meier, Mussetti, Seneviratne, Bürgi & Davin",
    venue: "Nature Communications 12:6763",
    year: "2021",
    doi: "10.1038/s41467-021-26768-w",
    license: "CC BY 4.0",
    pdfUrl: "/demo/schwaab2021.pdf",
    pages: 11,
  },
  inventory,
  intro: withTimings(intro, T, "/demo/audio"),
  chapters: chapters.map((c) => withTimings(c, T, "/demo/audio")),
  details,
  appendix,
  pageStatus: report.pageStatus ?? [],
  verification: report,
  hasRecordedVoice: allScenes.every((s) => Boolean(T[s.id])),
};
