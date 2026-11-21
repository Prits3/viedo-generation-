// Shared data model: paper inventory -> storyboard -> lesson.
// The storyboard never contains free-floating science: every cue points at inventory IDs,
// and every inventory entry records where it lives in the lesson.

export type ItemType =
  | "question"
  | "background"
  | "method"
  | "result"
  | "limitation"
  | "conclusion"
  | "figure"
  | "table"
  | "formula"
  | "footnote"
  | "reference"
  | "data"
  | "supplement"
  | "meta";

/** Where an inventory entry is reachable in the lesson. */
export type Placement = "intro" | "chapter" | "detail" | "appendix" | "original-only";

/**
 * verified  - unambiguous, compared against the PDF by a reviewer
 * matched   - automatic only: the quote was found on the stated page; wording not reviewed
 * unclear   - found, but wording/number is ambiguous or could not be matched exactly
 * open      - not checked yet
 * external  - lives outside the PDF (supplement, data repository); not checked here
 */
export type CheckStatus = "verified" | "matched" | "unclear" | "open" | "external";

export interface PageRegion {
  /** Fractions of the page box, origin top-left. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SourceRef {
  /** 1-based PDF page. 0 = not in this PDF (external material). */
  page: number;
  /** Section heading the passage belongs to. */
  section: string;
  /** Verbatim excerpt used to locate and highlight the passage. */
  quote?: string;
  /** "Fig. 1", "Table 2", ... when the source is a figure or table. */
  label?: string;
  /** Region to outline when there is no text to highlight (figures). */
  region?: PageRegion;
}

export interface Quantity {
  value: string;
  unit: string;
  /** What the number refers to (the measured quantity). */
  reference: string;
  /** Comparison surface / conditions under which the number holds. */
  conditions: string;
}

export interface InventoryItem {
  id: string;
  type: ItemType;
  title: string;
  /** Plain-language statement of the content. */
  statement: string;
  quantity?: Quantity;
  source: SourceRef;
  /** Intended home in the lesson; coverage check confirms it is actually reachable there. */
  place: Placement;
  status: CheckStatus;
  note?: string;
}

export type SceneType =
  | "establishing"
  | "question"
  | "comparison"
  | "flow"
  | "map"
  | "figure"
  | "points"
  | "timeline";

export interface Cue {
  /** Caption text. */
  text: string;
  /** Optional spoken variant (numbers/abbreviations written out). */
  say?: string;
  /** Inventory IDs that back this sentence. */
  refs: string[];
  /** True for pure transitions without scientific content (needs no source). */
  connective?: boolean;
  /** Key of the on-screen element this sentence is about. */
  focus?: string;
  /** Filled by the narration build (seconds within the scene). */
  start?: number;
  end?: number;
}

export interface ComparisonRow {
  key: string;
  label: string;
  from: number;
  to: number;
  /** Text shown on the bar, e.g. "8-12 K cooler". */
  display: string;
  ref: string;
  tone: "cool" | "warm" | "neutral";
  note?: string;
}

export interface ComparisonData {
  axisLabel: string;
  unit: string;
  min: number;
  max: number;
  ticks: number[];
  rows: ComparisonRow[];
  /** Notes pinned to a position on the axis. */
  annotations?: { key: string; at: number; text: string; ref: string }[];
  /** Shown under the chart: what is being compared, conditions. */
  basis: string;
  basisRef?: string;
  /** Marks a chart drawn from a stated ratio rather than measured values. */
  derivedNote?: string;
}

export interface FlowStep {
  key: string;
  title: string;
  detail: string;
  /** Icon name from components/scenes/Icons. */
  icon: string;
  facts?: { text: string; ref: string }[];
}

export interface MapRegion {
  key: string;
  label: string;
  /** Position on a 12 x 8 schematic grid. */
  col: number;
  row: number;
  w: number;
  h: number;
  group: string;
}

export interface MapData {
  regions: MapRegion[];
  groups: { key: string; label: string; value: string; tone: "cool" | "warm" | "neutral"; ref: string }[];
  /** Per-cue overlays: focus key -> region keys + badge text. */
  states: Record<string, { regions: string[]; badge: string; arrow?: "up" | "down" | "mixed" }>;
  disclaimer: string;
}

export interface FigureCallout {
  key: string;
  label: string;
  /** Region on the image in fractions. */
  x: number;
  y: number;
  w: number;
  h: number;
  ref?: string;
}

export interface FigureData {
  src: string;
  alt: string;
  width: number;
  height: number;
  figureRef: string;
  attribution: string;
  callouts: FigureCallout[];
}

export interface PointItem {
  key: string;
  title: string;
  body: string;
  icon: string;
  ref?: string;
}

export interface TimelineData {
  /** Hours on the axis. */
  from: number;
  to: number;
  marker: { at: number; label: string; ref: string };
  facts: { key: string; title: string; body: string; ref: string }[];
  disclaimer: string;
}

export interface EstablishingData {
  disclaimer: string;
  labels: { key: string; text: string; ref?: string }[];
}

export interface Scene {
  id: string;
  type: SceneType;
  title: string;
  /** The one question this scene answers. */
  question: string;
  cues: Cue[];
  audio?: string;
  duration?: number;
  comparison?: ComparisonData;
  flow?: { steps: FlowStep[] };
  map?: MapData;
  figure?: FigureData;
  points?: { items: PointItem[] };
  timeline?: TimelineData;
  establishing?: EstablishingData;
  /** Large text for question scenes. */
  headline?: string;
  kicker?: string;
}

export type ChapterKind = "intro" | "question" | "method" | "results" | "limits";

export interface Chapter {
  id: string;
  kind: ChapterKind;
  title: string;
  summary: string;
  scenes: Scene[];
}

export interface DetailView {
  id: string;
  title: string;
  intro: string;
  items: string[];
}

export interface AppendixSection {
  id: string;
  title: string;
  intro?: string;
  items: string[];
}

export interface PageStatus {
  page: number;
  chars: number;
  status: "ok" | "unreadable";
}

export interface Verification {
  /** manual = a reviewer compared inventory and PDF; auto = machine checks only. */
  mode: "manual" | "auto";
  /** Only true after an actual comparison ran and passed. */
  fullyChecked: boolean;
  checkedAt?: string;
  reviewer?: string;
  method: string;
  quoteChecks: { total: number; matched: number; failed: string[] };
  notes: string[];
}

export interface LessonMeta {
  title: string;
  authors: string;
  venue: string;
  year: string;
  doi?: string;
  license?: string;
  pdfUrl: string;
  pages: number;
}

export interface Lesson {
  id: string;
  origin: "demo" | "upload";
  meta: LessonMeta;
  inventory: InventoryItem[];
  intro: Chapter;
  chapters: Chapter[];
  details: DetailView[];
  appendix: AppendixSection[];
  pageStatus: PageStatus[];
  verification: Verification;
  /** True when pre-recorded narration ships with the lesson. */
  hasRecordedVoice: boolean;
}
