// Upload and processing limits for live generation. Sized for a hackathon demo:
// short papers with a text layer, a handful of generations per visitor.
// Every limit is enforced on the server in src/app/api/generate/route.ts.

const envInt = (name: string, fallback: number) => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback;
};

export const LIMITS = {
  /** Largest accepted file (PDF, Word, PowerPoint, text). */
  maxUploadBytes: 15 * 1024 * 1024,
  /** Longest accepted paper. */
  maxPages: 40,
  /** Upper bound on extracted text sent to the model (no silent truncation: longer papers are rejected). */
  maxTextChars: 200_000,
  /** Below this the PDF counts as a scan without a usable text layer. */
  minTextChars: 1_500,
  /** Generations per client within the window. */
  rateLimitMax: envInt("LESSON_RATE_LIMIT_MAX", 4),
  rateLimitWindowMs: 10 * 60 * 1000,
  /** Generations running at the same time in one server process. */
  maxConcurrent: 2,
  /** Hard stop for one model call. */
  modelTimeoutMs: 5 * 60 * 1000,
  /** Includes the model's thinking; a 9-page paper used about 29k at medium effort. */
  maxOutputTokens: 48_000,
  /** Pasted text: shortest and longest accepted input, and the most paragraphs. */
  minPastedChars: 400,
  maxPastedChars: 60_000,
  maxParagraphs: 200,
  /** Word and PowerPoint files: most blocks (paragraphs) and most slides. The text limits are maxTextChars and minPastedChars. */
  maxDocBlocks: 800,
  maxSlides: 80,
  /** Retries of one model call after a temporary error (429, 5xx). */
  maxRetries: 2,
  /** Automatic repair attempts per scene that fails its check. */
  maxSceneRepairs: 1,
  /** Original figures or tables read with the vision model per lesson. */
  maxFigures: 2,
} as const;

/** File name endings the upload accepts. Anything else is refused with `unsupported_type`. */
export const ACCEPTED_EXTENSIONS = [".pdf", ".docx", ".pptx", ".txt", ".md"] as const;

/**
 * Short mode ("Highlights"): a hook, the most important points and one takeaway. The bounds are
 * what the pipeline aims for and what scripts/check-shorts.mjs asserts on a finished lesson.
 */
export const SHORT = {
  minScenes: 5,
  maxScenes: 7,
  minSeconds: 45,
  maxSeconds: 90,
  /** Inventory entries offered to the storyboard, chosen by importance (see selectForShort). */
  maxEntries: 24,
  /** Scene repairs in one short run (a full lesson allows 10). */
  maxRepairs: 2,
  /**
   * Spoken words the storyboard is asked for: 135 words are about 70 s with the local voice. The
   * storyboard is asked for the upper half of the range (and for one scene more than the minimum),
   * because the checks can only shorten a short.
   */
  minWords: 120,
  maxWords: 150,
  /** A storyboard estimated below this is asked for once more; cutting can shorten a short, nothing can lengthen it. */
  retryBelowSeconds: 52,
} as const;

export type LessonMode = "full" | "short";
export const asMode = (v: unknown): LessonMode => (v === "short" ? "short" : "full");

export const DEFAULT_MODEL = "claude-opus-5-5";
/** Thinking depth of the generation call. "low" shortens the wait; raise it with LESSON_EFFORT. */
export const DEFAULT_EFFORT = "low";
export const EFFORTS = ["low", "medium", "high", "xhigh", "max"] as const;

export function publicLimits() {
  return {
    maxUploadMb: LIMITS.maxUploadBytes / 1024 / 1024,
    maxPages: LIMITS.maxPages,
    accept: ACCEPTED_EXTENSIONS,
    rateLimitMax: LIMITS.rateLimitMax,
    rateLimitWindowMinutes: LIMITS.rateLimitWindowMs / 60000,
  };
}

export type GenerateErrorCode =
  | "invalid_request"
  | "too_large"
  | "invalid_pdf"
  | "too_many_pages"
  | "no_text_layer"
  | "too_long"
  | "invalid_text"
  | "unsupported_type"
  | "invalid_document"
  | "protected_document"
  | "too_little_text"
  | "missing_key"
  | "no_model_access"
  | "not_found"
  | "rate_limited"
  | "busy"
  | "model_refused"
  | "invalid_model_output"
  | "upstream_error"
  | "timeout";

export const ERROR_TEXT: Record<GenerateErrorCode, { title: string; help: string }> = {
  invalid_request: { title: "No file received", help: "Choose a file or paste a text and try again." },
  too_large: { title: "This file is too large", help: `The limit is ${LIMITS.maxUploadBytes / 1024 / 1024} MB.` },
  invalid_pdf: { title: "This file could not be read as a PDF", help: "It may be damaged or not a PDF at all. Try exporting it again." },
  too_many_pages: { title: "This paper is too long", help: `The limit is ${LIMITS.maxPages} pages.` },
  no_text_layer: { title: "No readable text in this PDF", help: "It looks like a scan (images only). Live generation needs a PDF with a text layer; run OCR first." },
  too_long: { title: "This paper has too much text", help: "It exceeds the text limit for one generation. Nothing was cut off silently; try a shorter paper." },
  invalid_text: { title: "This text cannot be used", help: `Paste between ${LIMITS.minPastedChars} and ${LIMITS.maxPastedChars.toLocaleString("en-US")} characters of running text.` },
  unsupported_type: { title: "This kind of file is not supported", help: `Accepted: ${ACCEPTED_EXTENSIONS.join(", ")}. Older .doc and .ppt files need to be saved as .docx or .pptx first.` },
  invalid_document: { title: "This file could not be opened", help: "It may be damaged, or not the kind of file its name says. Save it again from Word or PowerPoint and retry." },
  protected_document: { title: "This file is password-protected", help: "Protected or encrypted Office files cannot be read (the same happens with the old .doc and .ppt formats under a new name). Save an unprotected .docx or .pptx copy and retry." },
  too_little_text: { title: "Not enough text in this file", help: `At least ${LIMITS.minPastedChars} characters of text are needed. Text inside pictures, charts and speaker notes is not read.` },
  missing_key: { title: "Live generation is not configured", help: "The server has no usable model key (AWS_BEARER_TOKEN_BEDROCK or ANTHROPIC_API_KEY). The example lesson works without one." },
  no_model_access: { title: "This account cannot use the selected model", help: "The key is valid, but the model is not enabled for it. Choose another model or provider in the server configuration." },
  not_found: { title: "This lesson does not exist", help: "It may have been deleted. Generate it again or open the example." },
  rate_limited: { title: "Rate limit reached", help: "Too many generations in a short time. Wait a few minutes and try again." },
  busy: { title: "The generator is busy", help: "Other papers are being processed right now. Try again in a minute." },
  model_refused: { title: "The model declined this content", help: "A safety filter stopped the request, so the run was ended. Try a different source." },
  invalid_model_output: { title: "The generated storyboard was not usable", help: "The model output failed validation, so nothing was rendered. Trying again often helps." },
  upstream_error: { title: "The model service returned an error", help: "This is usually temporary. Try again in a moment." },
  timeout: { title: "Generation took too long", help: "The model call was stopped. Try a shorter paper." },
};
