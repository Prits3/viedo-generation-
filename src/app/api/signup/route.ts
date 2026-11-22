// POST /api/signup {email}: early-access list where Netlify Forms is not available (local app, VPS).
// Appends one JSON line to <store>/../signups.jsonl. On Netlify the start page posts to Netlify Forms instead.
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { storeDir } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;

export async function POST(req: Request) {
  let email = "";
  try {
    const body = (await req.json()) as { email?: unknown; website?: unknown };
    if (body.website) return Response.json({ ok: true }); // honeypot filled: a bot, pretend success
    email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  } catch {
    return Response.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  if (!EMAIL.test(email)) return Response.json({ ok: false, error: "Please enter a valid email address." }, { status: 400 });
  try {
    const file = join(/*turbopackIgnore: true*/ dirname(storeDir()), "signups.jsonl");
    mkdirSync(/*turbopackIgnore: true*/ dirname(file), { recursive: true });
    appendFileSync(/*turbopackIgnore: true*/ file, JSON.stringify({ email, at: new Date().toISOString() }) + "\n");
  } catch {
    return Response.json({ ok: false, error: "The address could not be saved on this server." }, { status: 500 });
  }
  return Response.json({ ok: true });
}
