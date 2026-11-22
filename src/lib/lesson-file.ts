// The versioned lesson file: what a finished lesson is stored as and what the player loads.
// Everything the renderer needs is in here as data (scenes of approved types, narration text,
// timed captions, sources, asset references, timed actions); playing it needs no model call.
// The schema is checked when a file is written and again when it is opened.
import * as z from "zod/v4";
import type { Lesson } from "./types.ts";
import type { RunRecord } from "./providers.ts";

export const LESSON_FORMAT = "paperscenes.lesson";
export const LESSON_VERSION = 2;

const Ref = z.string().max(40);
const Key = z.string().max(60);
const Box = { x: z.number(), y: z.number(), w: z.number(), h: z.number() };

const Item = z.object({
  id: Ref,
  type: z.enum(["question", "background", "method", "result", "limitation", "conclusion", "figure", "table", "formula", "footnote", "reference", "data", "supplement", "meta"]),
  title: z.string(),
  statement: z.string(),
  quantity: z.object({ value: z.string(), unit: z.string(), reference: z.string(), conditions: z.string() }).optional(),
  source: z.object({ page: z.number().int().min(0), section: z.string(), quote: z.string().optional(), label: z.string().optional(), region: z.object(Box).optional() }),
  place: z.enum(["intro", "chapter", "detail", "appendix", "original-only"]),
  planned: z.enum(["intro", "chapter", "detail", "appendix", "original-only"]).optional(),
  status: z.enum(["verified", "matched", "unclear", "open", "external"]),
  note: z.string().optional(),
});

const Pose = z.enum(["enter", "look", "lean", "point", "wow", "listen", "idle"]);
const Shot = z.enum(["wide", "close", "street", "liftoff", "orbit", "surface"]);
const Track = z.enum(["mascot", "camera", "graphic"]);

const Cue = z.object({
  text: z.string(),
  say: z.string().optional(),
  refs: z.array(Ref),
  connective: z.boolean().optional(),
  focus: Key.optional(),
  duck: Pose.optional(),
  shot: Shot.optional(),
  beats: z.array(z.object({ after: z.number(), track: Track, do: z.string().max(20), target: Key.optional() })).optional(),
  start: z.number().optional(),
  end: z.number().optional(),
});

const Tone = z.enum(["cool", "warm", "neutral"]);

const Scene = z.object({
  id: z.string().max(40),
  type: z.enum(["establishing", "question", "comparison", "flow", "map", "figure", "points", "timeline", "milestones", "statement"]),
  title: z.string(),
  question: z.string(),
  cues: z.array(Cue).min(1),
  audio: z.string().optional(),
  duration: z.number().optional(),
  headline: z.string().optional(),
  kicker: z.string().optional(),
  comparison: z
    .object({
      axisLabel: z.string(),
      unit: z.string(),
      min: z.number(),
      max: z.number(),
      ticks: z.array(z.number()),
      rows: z.array(z.object({ key: Key, label: z.string(), from: z.number(), to: z.number(), display: z.string(), ref: Ref, tone: Tone, note: z.string().optional() })),
      annotations: z.array(z.object({ key: Key, at: z.number(), text: z.string(), ref: Ref })).optional(),
      basis: z.string(),
      basisRef: Ref.optional(),
      derivedNote: z.string().optional(),
    })
    .optional(),
  flow: z.object({ steps: z.array(z.object({ key: Key, title: z.string(), detail: z.string(), icon: z.string(), facts: z.array(z.object({ text: z.string(), ref: Ref })).optional() })) }).optional(),
  map: z
    .object({
      regions: z.array(z.object({ key: Key, label: z.string(), col: z.number(), row: z.number(), w: z.number(), h: z.number(), group: z.string() })),
      groups: z.array(z.object({ key: Key, label: z.string(), value: z.string(), tone: Tone, ref: Ref })),
      states: z.record(z.string(), z.object({ regions: z.array(z.string()), badge: z.string(), arrow: z.enum(["up", "down", "mixed"]).optional() })),
      disclaimer: z.string(),
    })
    .optional(),
  figure: z
    .object({
      src: z.string(),
      alt: z.string(),
      width: z.number(),
      height: z.number(),
      figureRef: Ref,
      attribution: z.string(),
      callouts: z.array(z.object({ key: Key, label: z.string(), ...Box, ref: Ref.optional() })),
    })
    .optional(),
  points: z.object({ items: z.array(z.object({ key: Key, title: z.string(), body: z.string(), icon: z.string(), ref: Ref.optional() })) }).optional(),
  timeline: z
    .object({
      from: z.number(),
      to: z.number(),
      marker: z.object({ at: z.number(), label: z.string(), ref: Ref }),
      facts: z.array(z.object({ key: Key, title: z.string(), body: z.string(), ref: Ref })),
      disclaimer: z.string(),
    })
    .optional(),
  establishing: z.object({ disclaimer: z.string(), labels: z.array(z.object({ key: Key, text: z.string(), ref: Ref.optional() })) }).optional(),
  milestones: z.object({ items: z.array(z.object({ key: Key, tag: z.string(), title: z.string(), body: z.string(), ref: Ref.optional() })) }).optional(),
  statement: z.object({ text: z.string(), analogy: z.string().optional(), icon: z.string(), ref: Ref.optional() }).optional(),
  actions: z.array(z.object({ at: z.number().min(0), track: Track, do: z.string().max(20), target: Key.optional() })).optional(),
  check: z.object({ status: z.enum(["ok", "repaired", "flagged"]), problems: z.array(z.string()), attempts: z.number().int() }).optional(),
});

const Chapter = z.object({
  id: z.string(),
  kind: z.enum(["intro", "question", "method", "results", "limits", "background", "story", "takeaway"]),
  title: z.string(),
  summary: z.string(),
  scenes: z.array(Scene),
});

const LessonSchema = z.object({
  id: z.string(),
  origin: z.enum(["demo", "upload"]),
  meta: z.object({
    title: z.string(),
    authors: z.string(),
    venue: z.string(),
    year: z.string(),
    doi: z.string().optional(),
    license: z.string().optional(),
    pdfUrl: z.string(),
    pages: z.number().int(),
    sourceKind: z.enum(["pdf", "text"]).optional(),
    mode: z.enum(["full", "short"]).optional(),
  }),
  inventory: z.array(Item),
  intro: Chapter,
  chapters: z.array(Chapter),
  details: z.array(z.object({ id: z.string(), title: z.string(), intro: z.string(), items: z.array(Ref) })),
  appendix: z.array(z.object({ id: z.string(), title: z.string(), intro: z.string().optional(), items: z.array(Ref) })),
  pageStatus: z.array(z.object({ page: z.number().int(), chars: z.number(), status: z.enum(["ok", "unreadable"]) })),
  verification: z.object({
    mode: z.enum(["manual", "auto"]),
    fullyChecked: z.boolean(),
    checkedAt: z.string().optional(),
    reviewer: z.string().optional(),
    method: z.string(),
    quoteChecks: z.object({ total: z.number(), matched: z.number(), failed: z.array(z.string()) }),
    notes: z.array(z.string()),
  }),
  hasRecordedVoice: z.boolean(),
  sourceBlocks: z.array(z.object({ n: z.number().int(), heading: z.string().optional(), text: z.string() })).optional(),
});

const Run = z.object({
  step: z.string(),
  provider: z.enum(["bedrock", "anthropic"]),
  model: z.string(),
  role: z.enum(["fast", "strong", "vision"]),
  ms: z.number(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  costUsd: z.number().nullable(),
  attempts: z.number(),
});

export const LessonFileSchema = z.object({
  format: z.literal(LESSON_FORMAT),
  version: z.literal(LESSON_VERSION),
  /** Increases every time the lesson is saved again (e.g. after one scene was regenerated). */
  revision: z.number().int().min(1),
  savedAt: z.string(),
  provenance: z.object({
    /** How the lesson was generated. Absent in files written before short mode existed: "full". */
    mode: z.enum(["full", "short"]).optional(),
    sourceKind: z.enum(["pdf", "text"]),
    /** The uploaded format when it is more specific than sourceKind (a Word or PowerPoint file). */
    sourceFormat: z.enum(["pdf", "text", "docx", "pptx"]).optional(),
    sourceName: z.string(),
    /** sha256 of the uploaded bytes or pasted text. */
    sourceHash: z.string(),
    provider: z.enum(["bedrock", "anthropic"]),
    models: z.object({ fast: z.string(), strong: z.string(), vision: z.string() }),
    promptVersion: z.string(),
    /** "piper:<voice>" when narration was recorded, otherwise "browser". */
    voice: z.string(),
    runs: z.array(Run),
  }),
  lesson: LessonSchema,
});

export interface LessonFile extends Omit<z.infer<typeof LessonFileSchema>, "lesson" | "provenance"> {
  provenance: Omit<z.infer<typeof LessonFileSchema>["provenance"], "runs"> & { runs: RunRecord[] };
  lesson: Lesson;
}

// Compile-time guard: the schema and the Lesson type must describe the same thing.
type _SchemaFitsType = z.infer<typeof LessonSchema> extends Lesson ? true : never;
type _TypeFitsSchema = Lesson extends z.infer<typeof LessonSchema> ? true : never;
export const _lessonSchemaInSync: [_SchemaFitsType, _TypeFitsSchema] = [true, true];

export function runTotals(runs: RunRecord[]) {
  const known = runs.every((r) => r.costUsd !== null);
  return {
    calls: runs.length,
    ms: runs.reduce((s, r) => s + r.ms, 0),
    inputTokens: runs.reduce((s, r) => s + r.inputTokens, 0),
    outputTokens: runs.reduce((s, r) => s + r.outputTokens, 0),
    costUsd: known ? +runs.reduce((s, r) => s + (r.costUsd ?? 0), 0).toFixed(4) : null,
  };
}
