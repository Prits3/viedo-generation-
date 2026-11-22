import { handleSignup } from "@/lib/waitlist.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return handleSignup(req);
}
