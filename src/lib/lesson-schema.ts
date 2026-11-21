// Structured output the models must produce. Flat, fully-required fields keep the JSON schema
// inside what strict structured output supports on every provider; the server validates each
// answer again with zod and then cross-checks it against the source before anything is rendered.
import * as z from "zod/v4";

export const ICONS = ["doc", "chart", "search", "check", "scale", "clock", "thermo", "leaf", "drop", "sun", "city", "tree", "layers", "model", "grid", "satellite"] as const;
export const POSES = ["enter", "look", "lean", "point", "wow", "listen", "idle"] as const;
export const DRAFT_SCENE_TYPES = ["question", "statement", "points", "flow", "milestones", "comparison"] as const;
export const CHAPTER_KINDS = ["question", "background", "method", "results", "limits", "story", "takeaway"] as const;

// ───────────────────────── step 1: content inventory (fast model) ─────────────────────────
export const ItemSchema = z.object({
  id: z.string().describe("Stable short ID, e.g. Q-01, M-03, R-12, L-02, F-1, T-1, EQ-1, REF"),
  type: z.enum(["question", "background", "method", "result", "limitation", "conclusion", "figure", "table", "formula", "footnote", "reference", "data", "supplement", "meta"]),
  title: z.string().describe("Label of at most 8 words"),
  statement: z.string().describe("Plain-language statement of the content, one or two sentences"),
  page: z.number().int().describe("Number of the source block (page or paragraph) where the passage is"),
  section: z.string().describe("Section heading it belongs to; empty if there is none"),
  quote: z.string().describe("8-30 consecutive words copied exactly from that block (for figures and tables: the start of the caption). No ellipsis, no paraphrase."),
  value: z.string().describe("For numeric content: the number or range exactly as stated. Otherwise empty."),
  unit: z.string().describe("Unit of the value. Otherwise empty."),
  refers_to: z.string().describe("What quantity the number measures. Otherwise empty."),
  conditions: z.string().describe("Comparison group and conditions under which the number holds. Otherwise empty."),
  place: z.enum(["intro", "chapter", "detail", "appendix"]).describe("Where this entry is made accessible in the lesson"),
  certainty: z.enum(["clear", "unclear"]).describe("unclear when wording, number or location is ambiguous"),
});

export const InventoryDraftSchema = z.object({
  title: z.string().describe("Title of the source"),
  authors: z.string().describe("Authors; empty if not stated"),
  venue: z.string().describe("Journal, conference, publisher or site; empty if not stated"),
  year: z.string().describe("Year of publication; empty if not stated"),
  source_type: z.enum(["research_paper", "report", "textbook", "article", "other"]),
  inventory: z.array(ItemSchema),
});

// ───────────────────────── step 2: storyboard (strong model) ─────────────────────────
const CueSchema = z.object({
  text: z.string().describe("One spoken sentence, at most 30 words, plain language"),
  refs: z.array(z.string()).describe("Inventory IDs that back this sentence"),
  connective: z.boolean().describe("true only for a transition that makes no claim about the source"),
  focus: z.string().describe("key of the card or row this sentence is about, or empty"),
  duck: z.enum(POSES).describe("What the guide character does during this sentence"),
  shot: z.enum(["wide", "close"]).describe("close when one element deserves full attention"),
});

const CardSchema = z.object({
  key: z.string(),
  tag: z.string().describe("milestones: the date or order label, e.g. 1953. Otherwise empty."),
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

export const SceneSchema = z.object({
  type: z.enum(DRAFT_SCENE_TYPES),
  title: z.string().describe("At most 5 words"),
  question: z.string().describe("The one question this scene answers"),
  headline: z.string().describe("question: the guiding question as one sentence. statement: the one idea in at most 18 words. Otherwise empty."),
  analogy: z.string().describe("statement only: an optional everyday comparison that helps picture the idea without adding facts. Otherwise empty."),
  icon: z.enum(ICONS).describe("statement: the icon shown beside the idea. Otherwise doc."),
  cues: z.array(CueSchema),
  cards: z.array(CardSchema).describe("points: 2-5 cards. flow: 3-5 ordered steps. milestones: 3-6 events in order. Otherwise empty."),
  axis_label: z.string().describe("comparison only, otherwise empty"),
  unit: z.string().describe("comparison only, otherwise empty"),
  rows: z.array(RowSchema).describe("comparison only: 2-4 values on one shared scale and unit. Otherwise empty."),
  basis: z.string().describe("comparison only: what is compared with what, under which conditions. Otherwise empty."),
  basis_ref: z.string().describe("comparison only: inventory ID for the basis. Otherwise empty."),
});

export const StoryboardDraftSchema = z.object({
  intro_scenes: z.array(SceneSchema),
  chapters: z.array(
    z.object({
      kind: z.enum(CHAPTER_KINDS),
      title: z.string(),
      summary: z.string(),
      scenes: z.array(SceneSchema),
    }),
  ),
});

// ───────────────────────── optional: describing an original figure or table (vision model) ─────────────────────────
export const FigureReadSchema = z.object({
  usable: z.boolean().describe("false if the image does not show the figure or table that was asked for, or is unreadable"),
  alt: z.string().describe("One sentence describing what the figure or table shows, for screen readers"),
  callouts: z.array(
    z.object({
      label: z.string().describe("What to look at, at most 10 words"),
      say: z.string().describe("One plain spoken sentence, at most 28 words, about this part. Use only what is visible in the image or stated in the caption."),
    }),
  ),
});

export type InventoryDraft = z.infer<typeof InventoryDraftSchema>;
export type ItemDraft = z.infer<typeof ItemSchema>;
export type StoryboardDraft = z.infer<typeof StoryboardDraftSchema>;
export type SceneDraft = z.infer<typeof SceneSchema>;
export type FigureRead = z.infer<typeof FigureReadSchema>;

// ───────────────────────── claim check: narration against its cited passages (strong model) ─────────────────────────
export const ClaimCheckSchema = z.object({
  findings: z.array(
    z.object({
      scene: z.string().describe("ID of the scene"),
      sentence: z.number().int().describe("Number of the sentence in that scene, starting at 1"),
      problem: z.string().describe("What the sentence states that its cited passages do not support, in at most 25 words"),
    }),
  ),
});
export type ClaimCheck = z.infer<typeof ClaimCheckSchema>;
