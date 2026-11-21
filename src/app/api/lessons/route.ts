// GET /api/lessons: lessons stored on this server, newest first (finished ones and runs that can be resumed).
import { listLessons } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ lessons: listLessons() }, { headers: { "cache-control": "no-store" } });
}
