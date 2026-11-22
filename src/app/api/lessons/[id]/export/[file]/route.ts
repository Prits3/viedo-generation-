// GET /api/lessons/:id/export/vertical.mp4 | landscape.mp4 | caption.txt: the exported video and its post text, as downloads.
import { createReadStream, statSync } from "node:fs";
import { Readable } from "node:stream";
import { has, loadLesson, pathIn, validId } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED = /^((vertical|landscape)\.mp4|caption\.txt)$/;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; file: string }> }) {
  const { id, file } = await params;
  const rel = `export/${file}`;
  if (!validId(id) || !ALLOWED.test(file) || !has(id, rel)) return new Response("Not found", { status: 404 });
  const full = pathIn(id, rel);
  const slug = (loadLesson(id)?.lesson.meta.title ?? id).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || id;
  return new Response(Readable.toWeb(createReadStream(/*turbopackIgnore: true*/ full)) as ReadableStream, {
    headers: {
      "content-type": file.endsWith(".mp4") ? "video/mp4" : "text/plain; charset=utf-8",
      "content-length": String(statSync(/*turbopackIgnore: true*/ full).size),
      "content-disposition": `attachment; filename="learnlayla-${slug}-${file}"`,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
