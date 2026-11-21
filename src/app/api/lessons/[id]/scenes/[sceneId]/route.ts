// POST /api/lessons/:id/scenes/:sceneId: generates this one scene again (fast model), re-records
// only its narration, and saves the lesson as a new revision. Other scenes are not touched.
import { GenerateError } from "@/lib/errors";
import { ERROR_TEXT, type GenerateErrorCode } from "@/lib/limits";
import { regenerateScene } from "@/lib/pipeline";
import { providerConfigured } from "@/lib/models";
import { loadLesson } from "@/lib/store";
import { runTotals } from "@/lib/lesson-file";
import { busy, clientKey, enter, leave, rateLimited, RATE_TEXT } from "@/lib/ratelimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: Request, { params }: { params: Promise<{ id: string; sceneId: string }> }) {
  const { id, sceneId } = await params;
  const fail = (code: GenerateErrorCode, status: number, detail?: string) => Response.json({ type: "error", code, ...ERROR_TEXT[code], detail }, { status });
  const file = loadLesson(id);
  if (!file) return fail("not_found", 404);
  if (!providerConfigured(file.provenance.provider)) return fail("missing_key", 503);
  if (busy()) return fail("busy", 503);
  if (rateLimited(clientKey(req))) return fail("rate_limited", 429, RATE_TEXT);
  enter();
  try {
    const next = await regenerateScene(id, sceneId, req.signal);
    return Response.json({ ...next, totals: runTotals(next.provenance.runs) });
  } catch (err) {
    const e = err instanceof GenerateError ? err : new GenerateError("upstream_error", "Unexpected server error.");
    return fail(e.code, e.code === "not_found" ? 404 : e.code === "invalid_request" ? 400 : 502, e.message);
  } finally {
    leave();
  }
}
