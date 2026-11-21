// GET /api/lessons/:id/asset/<file>: narration, figure crops and the uploaded PDF of a stored lesson.
// Supports byte ranges so the audio element can seek.
import { statSync, createReadStream } from "node:fs";
import { Readable } from "node:stream";
import { has, pathIn, validId } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = { mp3: "audio/mpeg", wav: "audio/wav", png: "image/png", pdf: "application/pdf" };
const ALLOWED = /^(audio\/[A-Za-z0-9_.-]+\.(mp3|wav)|fig-\d+\.png|source\.pdf)$/;

export async function GET(req: Request, { params }: { params: Promise<{ id: string; path: string[] }> }) {
  const { id, path } = await params;
  const rel = path.join("/");
  if (!validId(id) || !ALLOWED.test(rel) || !has(id, rel)) return new Response("Not found", { status: 404 });
  const full = pathIn(id, rel);
  const size = statSync(/*turbopackIgnore: true*/ full).size;
  const headers: Record<string, string> = {
    "content-type": TYPES[rel.split(".").pop() ?? ""] ?? "application/octet-stream",
    "accept-ranges": "bytes",
    // File names of audio carry a content hash and figures never change; the PDF is fixed per lesson.
    "cache-control": "private, max-age=3600",
    "x-content-type-options": "nosniff",
  };
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") ?? "");
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    let end = range[1] && range[2] ? Number(range[2]) : size - 1;
    end = Math.min(end, size - 1);
    if (start > end || start >= size) return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}` } });
    start = Math.max(0, start);
    return new Response(Readable.toWeb(createReadStream(/*turbopackIgnore: true*/ full, { start, end })) as ReadableStream, { status: 206, headers: { ...headers, "content-range": `bytes ${start}-${end}/${size}`, "content-length": String(end - start + 1) } });
  }
  return new Response(Readable.toWeb(createReadStream(/*turbopackIgnore: true*/ full)) as ReadableStream, { headers: { ...headers, "content-length": String(size) } });
}
