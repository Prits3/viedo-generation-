// POST /api/generate  (multipart form, field "file")
// Streams newline-delimited JSON events so the upload page can show real states:
//   {type:"stage", stage:"reading"} -> {type:"extracted", ...} -> {type:"stage", stage:"storyboard"}
//   -> {type:"progress", outputChars} ... -> {type:"done", lesson} | {type:"error", code, title, help}
// GET /api/generate reports whether live generation is configured, plus the limits.
import { extractPdfText } from "@/lib/pdf-text";
import { assembleLesson } from "@/lib/assemble";
import { GenerateError, generateDraft, modelConfigured, modelName } from "@/lib/generate";
import { ERROR_TEXT, LIMITS, publicLimits, type GenerateErrorCode } from "@/lib/limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// In-memory limits: enough for a single demo server, reset on restart.
const hits = new Map<string, number[]>();
let running = 0;

function clientKey(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}

function rateLimited(key: string): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < LIMITS.rateLimitWindowMs);
  if (recent.length >= LIMITS.rateLimitMax) {
    hits.set(key, recent);
    return true;
  }
  recent.push(now);
  hits.set(key, recent);
  return false;
}

export async function GET() {
  return Response.json({ configured: modelConfigured(), model: modelName(), limits: publicLimits() });
}

export async function POST(req: Request) {
  const encoder = new TextEncoder();
  const fail = (code: GenerateErrorCode, detail?: string) => ({ type: "error" as const, code, ...ERROR_TEXT[code], detail });

  // Checks that need no streaming.
  let file: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get("file");
    if (f instanceof File) file = f;
  } catch {
    /* handled below */
  }
  if (!file || file.size === 0) return Response.json(fail("invalid_request"), { status: 400 });
  if (file.size > LIMITS.maxUploadBytes) return Response.json(fail("too_large"), { status: 413 });
  if (running >= LIMITS.maxConcurrent) return Response.json(fail("busy"), { status: 503 });

  const upload = file;
  const key = clientKey(req);
  running++;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send = (event: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          closed = true;
        }
      };
      try {
        send({ type: "stage", stage: "reading" });
        const bytes = new Uint8Array(await upload.arrayBuffer());
        const header = new TextDecoder("latin1").decode(bytes.subarray(0, 1024));
        if (!header.includes("%PDF-")) throw new GenerateError("invalid_pdf", "The file does not start with a PDF header.");

        let extracted;
        try {
          extracted = await extractPdfText(bytes, LIMITS.maxPages + 1);
        } catch {
          throw new GenerateError("invalid_pdf", "pdf.js could not parse the file.");
        }
        if (extracted.numPages > LIMITS.maxPages) throw new GenerateError("too_many_pages", `${extracted.numPages} pages.`);

        const readable = extracted.pages.filter((p) => extracted.pageStatus.find((s) => s.page === p.page)?.status === "ok");
        const unreadable = extracted.pageStatus.filter((s) => s.status === "unreadable").map((s) => s.page);
        const chars = readable.reduce((n, p) => n + p.text.length, 0);
        send({ type: "extracted", pages: extracted.numPages, unreadablePages: unreadable, chars });
        if (readable.length === 0 || chars < LIMITS.minTextChars) throw new GenerateError("no_text_layer", `${chars} characters of text on ${extracted.numPages} page(s).`);
        if (chars > LIMITS.maxTextChars) throw new GenerateError("too_long", `${chars} characters of text.`);

        if (!modelConfigured()) throw new GenerateError("missing_key", "ANTHROPIC_API_KEY is not set on the server.");
        // Only uploads that reach the model count against the visitor's limit.
        if (rateLimited(key)) throw new GenerateError("rate_limited", `This server allows ${LIMITS.rateLimitMax} generations per ${LIMITS.rateLimitWindowMs / 60000} minutes per visitor.`);

        send({ type: "stage", stage: "storyboard", model: modelName() });
        const { draft, model, usage } = await generateDraft(readable, unreadable, (p) => send({ type: "progress", ...p }), req.signal);

        send({ type: "stage", stage: "checking" });
        const lesson = assembleLesson({ draft, pages: extracted.pages, pageStatus: extracted.pageStatus, numPages: extracted.numPages, pdfUrl: "", fileName: upload.name });
        if (lesson.intro.scenes.length === 0 || lesson.chapters.length === 0 || lesson.inventory.length === 0)
          throw new GenerateError("invalid_model_output", "The storyboard had no usable intro, chapters or inventory.");
        send({ type: "done", lesson, model, usage });
      } catch (err) {
        if (err instanceof GenerateError) send(fail(err.code, err.message));
        else send(fail("upstream_error", "Unexpected server error."));
      } finally {
        running--;
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
  });

  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });
}
