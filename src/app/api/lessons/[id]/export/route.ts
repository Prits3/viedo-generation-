// GET  /api/lessons/:id/export?format=vertical|landscape   state of the video export (none, running with frame count, done, failed)
// POST /api/lessons/:id/export?format=vertical|landscape   starts the export; it runs as its own process and can take a minute or more
// The finished file is served by /api/lessons/:id/export/<format>.mp4. No model is called.
import { validId } from "@/lib/store";
import { exportStatus, isFormat, startExport } from "@/lib/video-export";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function target(req: Request, id: string) {
  const format = new URL(req.url).searchParams.get("format") ?? "vertical";
  return validId(id) && isFormat(format) ? format : null;
}

const notFound = () => Response.json({ type: "error", title: "Not found", help: "Unknown lesson or video format." }, { status: 404 });

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const format = target(req, id);
  if (!format) return notFound();
  return Response.json(exportStatus(id, format), { headers: { "cache-control": "no-store" } });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const format = target(req, id);
  if (!format) return notFound();
  const started = startExport(id, format);
  if (!started.ok) return Response.json({ type: "error", title: started.title, help: started.help }, { status: started.code });
  return Response.json(started.status, { status: 202, headers: { "cache-control": "no-store" } });
}
