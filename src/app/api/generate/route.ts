// POST /api/generate   multipart form with one of:
//     file     a PDF with a text layer, a Word file (.docx), a PowerPoint file (.pptx) or a text file (.txt, .md)
//     text     pasted text (optional: title)
//     resume   ID of an interrupted or failed generation
//   optional: provider = "bedrock" | "anthropic"
//   optional: mode = "short" (45-90 second highlights) | "full" (default: the lesson with chapters)
// Streams newline-delimited JSON events so the page can show real progress:
//   job -> stage(reading) -> extracted -> stage(inventory) -> run -> stage(storyboard) -> run
//   -> stage(checking) -> scene... -> stage(figures) -> stage(voice) -> voice... -> stage(saving)
//   -> done {id} | error {code, title, help, detail, id?}
// GET /api/generate reports which providers are configured (never the keys), the models per role,
// whether the local voice is available, and the limits.
import { GenerateError } from "@/lib/errors";
import { ERROR_TEXT, LIMITS, asMode, publicLimits, type GenerateErrorCode } from "@/lib/limits";
import { defaultProvider, modelsFor, providerConfigured, type ProviderId } from "@/lib/models";
import { createJob, runPipeline, type JobInput } from "@/lib/pipeline";
import { formatOf, textFromBytes } from "@/lib/source";
import { loadJob, removeLesson, has } from "@/lib/store";
import { busy, clientKey, enter, leave, rateLimited, RATE_TEXT } from "@/lib/ratelimit";
import { voiceSetup } from "@/lib/voice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const PROVIDERS: ProviderId[] = ["bedrock", "anthropic"];

export async function GET() {
  return Response.json({
    configured: defaultProvider() !== null,
    defaultProvider: defaultProvider(),
    providers: PROVIDERS.map((id) => ({ id, configured: providerConfigured(id), models: modelsFor(id) })),
    voice: voiceSetup()?.name ?? null,
    limits: publicLimits(),
  });
}

export async function POST(req: Request) {
  const encoder = new TextEncoder();
  const fail = (code: GenerateErrorCode, detail?: string, id?: string) => ({ type: "error" as const, code, ...ERROR_TEXT[code], detail, id });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return Response.json(fail("invalid_request"), { status: 400 });
  }
  const file = form.get("file");
  const text = form.get("text");
  const resume = form.get("resume");
  const wanted = form.get("provider");

  let jobId: string;
  let fresh = false;
  if (typeof resume === "string" && resume) {
    const job = loadJob(resume);
    if (!job) return Response.json(fail("not_found"), { status: 404 });
    if (job.status === "done" && has(resume, "lesson.json")) return Response.json({ type: "done", id: resume }, { status: 200 });
    jobId = resume;
    if (!providerConfigured(job.provider)) return Response.json(fail("missing_key"), { status: 200 });
  } else {
    const provider = wanted === "bedrock" || wanted === "anthropic" ? wanted : defaultProvider();
    if (file instanceof File && file.size > 0) {
      if (file.size > LIMITS.maxUploadBytes) return Response.json(fail("too_large"), { status: 413 });
    } else if (typeof text === "string" && text.trim()) {
      if (text.length > LIMITS.maxPastedChars * 1.2) return Response.json(fail("too_long"), { status: 413 });
    } else return Response.json(fail("invalid_request"), { status: 400 });
    if (busy()) return Response.json(fail("busy"), { status: 503 });
    // Without a provider the input is still read, so the page can say what is wrong with the file
    // before it says that no key is configured.
    const title = form.get("title");
    let input: JobInput;
    if (file instanceof File && file.size > 0) {
      // The reader is chosen here, from the first bytes and the name; whether the file can actually
      // be read is found out in the pipeline's first step and reported from there.
      const name = file.name || "upload.pdf";
      const bytes = new Uint8Array(await file.arrayBuffer());
      const format = formatOf(name, bytes);
      if (!format) return Response.json(fail("unsupported_type", `"${name.slice(-40)}" is not one of the accepted kinds of file.`), { status: 415 });
      if (format === "text") {
        try {
          input = { kind: "text", name: name.replace(/\.[a-z0-9]+$/i, "").slice(0, 120), text: textFromBytes(bytes, name) };
        } catch (err) {
          return Response.json(fail("unsupported_type", err instanceof GenerateError ? err.message : undefined), { status: 415 });
        }
        if (input.text.length > LIMITS.maxPastedChars * 1.2) return Response.json(fail("too_long"), { status: 413 });
      } else input = { kind: format, name, bytes };
    } else input = { kind: "text", name: typeof title === "string" && title.trim() ? title.trim().slice(0, 120) : "Pasted text", text: String(text) };
    const job = createJob(input, provider ?? "bedrock", asMode(form.get("mode")));
    jobId = job.id;
    fresh = true;
  }
  if (busy()) return Response.json(fail("busy"), { status: 503 });

  const key = clientKey(req);
  enter();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      let counted = false;
      const send = (event: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          closed = true;
        }
      };
      // The pipeline reads the input first; the key and the visitor's limit are checked at the
      // moment the first model call is due, so unreadable files never count against the limit.
      const gate = new AbortController();
      const signal = AbortSignal.any([req.signal, gate.signal]);
      let gateError: GenerateError | null = null;
      const emit = (ev: Record<string, unknown>) => {
        if (ev.type === "stage" && ev.stage === "inventory" && !counted) {
          counted = true;
          const job = loadJob(jobId);
          if (!job || !providerConfigured(job.provider)) gateError = new GenerateError("missing_key", "No model key is set on the server.");
          else if (rateLimited(key)) gateError = new GenerateError("rate_limited", RATE_TEXT);
          if (gateError) {
            gate.abort();
            return;
          }
        }
        send(ev);
      };
      try {
        await runPipeline(jobId, emit, signal);
      } catch (err) {
        const e = gateError ?? (err instanceof GenerateError ? err : new GenerateError("upstream_error", "Unexpected server error."));
        const stage = loadJob(jobId)?.stage;
        // Nothing worth resuming if the input itself was unusable.
        const resumable = !(fresh && stage === "reading") && e.code !== "model_refused";
        if (!resumable) removeLesson(jobId);
        send(fail(e.code, e.message, resumable ? jobId : undefined));
      } finally {
        leave();
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
