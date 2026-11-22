const FAILURE = "We couldn’t complete your signup. Please try again.";
const INVALID_EMAIL = "Please enter a valid email address.";

/** @param {unknown} input */
export function normaliseEmail(input) {
  if (typeof input !== "string") return null;
  const email = input.trim().toLowerCase();
  const parts = email.split("@");
  if (parts.length !== 2 || email.length > 254) return null;
  const [local, domain] = parts;
  const labels = domain.split(".");
  if (local.length > 64 || !/^[a-z0-9!#$%&'*+\-/=?^_`{|}~]+(?:\.[a-z0-9!#$%&'*+\-/=?^_`{|}~]+)*$/.test(local) || labels.length < 2 ||
      labels.at(-1).length < 2 || !labels.every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) return null;
  return email;
}

/** @param {NodeJS.ProcessEnv} env */
function config(env) {
  const key = env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!key || !/^sb_publishable_[a-z0-9_-]+$/i.test(key)) return null;
  try {
    const url = new URL(env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "");
    if (url.protocol === "https:" && /^[a-z0-9]+\.supabase\.co$/.test(url.hostname) &&
        !url.username && !url.password && !url.port && url.pathname === "/" && !url.search && !url.hash) {
      return { url: `${url.origin}/rest/v1/waitlist`, key };
    }
  } catch { /* missing or malformed project URL */ }
  return null;
}

/** @param {Request} req @param {{ env?: NodeJS.ProcessEnv, request?: typeof fetch }} [options] */
export async function handleSignup(req, { env = process.env, request = fetch } = {}) {
  const failed = () => Response.json({ ok: false, error: FAILURE }, { status: 503 });
  const signedUp = () => Response.json({ ok: true, status: "signed_up" }, { status: 201 });
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }
  if (typeof body.website === "string" && body.website.trim()) return signedUp();
  const email = normaliseEmail(body.email);
  if (!email) return Response.json({ ok: false, error: INVALID_EMAIL }, { status: 400 });
  const target = config(env);
  if (!target) return failed();
  try {
    const headers = new Headers({ "Content-Type": "application/json", Prefer: "return=minimal" });
    headers.set("apikey", target.key);
    const res = await request(target.url, {
      method: "POST",
      headers,
      // `created_at` is set by the database default, not by the caller.
      body: JSON.stringify({ email, source: "landing_page", marketing_consent: true }),
      redirect: "error",
      signal: AbortSignal.timeout(5000),
    });
    if ([200, 201, 204].includes(res.status)) return signedUp();
    if (res.status === 409 && (await res.json())?.code === "23505") {
      return Response.json({ ok: true, status: "already_signed_up" });
    }
  } catch { /* Do not expose database or network errors to the client. */ }
  return failed();
}
