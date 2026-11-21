// Structured output the model must produce for an uploaded paper.
// Flat, fully-required fields keep the JSON schema simple; the server validates it again
// with zod and then cross-checks every quote against the PDF before anything is rendered.
import * as z from "zod/v4";

export const ICONS = ["doc", "chart", "search", "check", "scale", "clock", "thermo", "leaf", "drop", "sun", "city", "tree", "layers", "model", "grid", "satellite"] as const;

const ItemSchema = z.object({
  id: z.string().describe("Stable short ID, e.g. Q-01, M-03, R-12, L-02, F-1, T-1, EQ-1, REF"),
  type: z.enum(["question", "background", "method", "result", "limitation", "conclusion", "figure", "table", "formula", "footnote", "reference", "data", "supplement", "meta"]),
  title: z.string().describe("Label of at most 8 words"),
  statement: z.string().describe("Plain-language statement of the content, one or two sentences"),
  page: z.number().int().describe("1-based page where the passage is"),
  section: z.string().describe("Section heading it belongs to"),
  quote: z.string().describe("8-30 consecutive words copied exactly from that page (for figures and tables: the start of the caption). No ellipsis, no paraphrase."),
  value: z.string().describe("For numeric content: the number or range exactly as stated. Otherwise empty."),
  unit: z.string().describe("Unit of the value. Otherwise empty."),
  refers_to: z.string().describe("What quantity the number measures. Otherwise empty."),
  conditions: z.string().describe("Comparison group and conditions under which the number holds. Otherwise empty."),
  place: z.enum(["intro", "chapter", "detail", "appendix"]).describe("Where this entry is made accessible in the lesson"),
  certainty: z.enum(["clear", "unclear"]).describe("unclear when wording, number or location is ambiguous"),
});

const CueSchema = z.object({
  text: z.string().describe("One spoken sentence, at most 30 words, plain language"),
  refs: z.array(z.string()).describe("Inventory IDs that back this sentence"),
  connective: z.boolean().describe("true only for a transition that makes no claim about the paper"),
  focus: z.string().describe("key of the card or row this sentence is about, or empty"),
});

const CardSchema = z.object({
  key: z.string(),
  title: z.string().describe("At most 5 words"),
  body: z.string().describe("At most 12 words"),
  icon: z.enum(ICONS),
  ref: z.string().describe("Inventory ID"),
});

const RowSchema = z.object({
  key: z.string(),
  label: z.string(),
  from: z.number(),
  to: z.number().describe("Equal to `from` for a single value"),
  display: z.string().describe("Number with unit as shown on screen"),
  ref: z.string().describe("Inventory ID of the entry that states this number"),
  tone: z.enum(["cool", "warm", "neutral"]),
});

const SceneSchema = z.object({
  type: z.enum(["question", "points", "flow", "comparison"]),
  title: z.string().describe("At most 5 words"),
  question: z.string().describe("The one question this scene answers"),
  headline: z.string().describe("For type question: the research question as one sentence. Otherwise empty."),
  cues: z.array(CueSchema),
  cards: z.array(CardSchema).describe("points: 2-5 cards. flow: 3-5 ordered steps. Otherwise empty."),
  axis_label: z.string().describe("comparison only, otherwise empty"),
  unit: z.string().describe("comparison only, otherwise empty"),
  rows: z.array(RowSchema).describe("comparison only: 2-4 values on one shared scale and unit. Otherwise empty."),
  basis: z.string().describe("comparison only: what is compared with what, under which conditions. Otherwise empty."),
  basis_ref: z.string().describe("comparison only: inventory ID for the basis. Otherwise empty."),
});

export const LessonDraftSchema = z.object({
  title: z.string(),
  authors: z.string(),
  venue: z.string().describe("Journal, conference or preprint server; empty if not stated"),
  year: z.string(),
  inventory: z.array(ItemSchema),
  intro_scenes: z.array(SceneSchema),
  chapters: z.array(
    z.object({
      kind: z.enum(["question", "method", "results", "limits"]),
      title: z.string(),
      summary: z.string(),
      scenes: z.array(SceneSchema),
    }),
  ),
});

export type LessonDraft = z.infer<typeof LessonDraftSchema>;
export type SceneDraft = z.infer<typeof SceneSchema>;
