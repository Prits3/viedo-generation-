// GET    /api/lessons/:id   the stored, validated lesson file. No model is called to play it.
// DELETE /api/lessons/:id   removes the lesson with its source, audio and figures.
import { loadJob, loadLesson, removeLesson } from "@/lib/store";
import { runTotals } from "@/lib/lesson-file";
import { ERROR_TEXT } from "@/lib/limits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const file = loadLesson(id);
  if (!file) {
    const job = loadJob(id);
    return Response.json({ type: "error", code: "not_found", ...ERROR_TEXT.not_found, job: job ? { status: job.status, stage: job.stage, title: job.title ?? job.input.name } : null }, { status: 404 });
  }
  return Response.json({ ...file, totals: runTotals(file.provenance.runs) }, { headers: { "cache-control": "no-store" } });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return removeLesson(id) ? Response.json({ deleted: id, note: "The lesson, its source, narration and figure crops were removed from this server." }) : Response.json({ type: "error", code: "not_found", ...ERROR_TEXT.not_found }, { status: 404 });
}
