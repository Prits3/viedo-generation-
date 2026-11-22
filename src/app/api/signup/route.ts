// Waitlist signup endpoint.
//   GET  → { configured, count }           — how many have joined (for the live counter)
//   POST { email, source? } → { ok, count } — add an email (idempotent on email)
//
// Stores nothing beyond the email, an optional source label, and a timestamp.

import { NextResponse } from "next/server";
import { db, ensureSchema, hasDb } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export async function GET() {
  if (!hasDb()) return NextResponse.json({ configured: false, count: 0 });
  try {
    await ensureSchema();
    const sql = db();
    const [row] = await sql<{ count: number }[]>`select count(*)::int as count from signups`;
    return NextResponse.json({ configured: true, count: row?.count ?? 0 });
  } catch {
    return NextResponse.json({ configured: true, count: 0, error: "db_error" });
  }
}

export async function POST(req: Request) {
  if (!hasDb()) {
    return NextResponse.json(
      { ok: false, error: "not_configured", message: "Signups aren’t connected yet." },
      { status: 503 },
    );
  }

  let email = "";
  let source = "waitlist";
  try {
    const body = (await req.json()) as { email?: unknown; source?: unknown };
    email = String(body.email ?? "").trim().toLowerCase();
    if (typeof body.source === "string" && body.source) source = body.source.slice(0, 60);
  } catch {
    return NextResponse.json({ ok: false, error: "bad_request", message: "Invalid request." }, { status: 400 });
  }

  if (!EMAIL_RE.test(email) || email.length > 254) {
    return NextResponse.json(
      { ok: false, error: "invalid_email", message: "Enter a valid email address." },
      { status: 400 },
    );
  }

  try {
    await ensureSchema();
    const sql = db();
    await sql`
      insert into signups (email, source) values (${email}, ${source})
      on conflict (email) do nothing
    `;
    const [row] = await sql<{ count: number }[]>`select count(*)::int as count from signups`;
    return NextResponse.json({ ok: true, count: row?.count ?? 0 });
  } catch {
    return NextResponse.json(
      { ok: false, error: "db_error", message: "Could not save right now. Please try again." },
      { status: 500 },
    );
  }
}
