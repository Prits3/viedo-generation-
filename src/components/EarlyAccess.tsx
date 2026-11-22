"use client";
// Early-access sign-up on the start page. There are no accounts yet; the address only puts the
// visitor on the list for when sign-in opens. Submissions are stored in Supabase `public.waitlist`
// via the REST API using the PUBLISHABLE (anon) key and the table's insert-only RLS policy — this
// works on serverless/Vercel, unlike a local file. Reads are blocked for this key, so the list is
// never exposed; the count is viewed in the Supabase dashboard.
import { useState } from "react";

type State = { kind: "idle" | "sending" | "done" | "exists" } | { kind: "error"; message: string };

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export function EarlyAccess() {
  const [email, setEmail] = useState("");
  const [trap, setTrap] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) {
      return setState({ kind: "error", message: "Please enter a valid email address." });
    }
    if (trap) return setState({ kind: "done" }); // honeypot filled: a bot, pretend success

    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return setState({ kind: "error", message: "Sign-up is temporarily unavailable. Please try again later." });
    }

    setState({ kind: "sending" });
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/waitlist`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "content-type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ email: value, source: "landing_page", marketing_consent: false }),
      });
      if (res.status === 201 || res.status === 200 || res.status === 204) return setState({ kind: "done" });
      if (res.status === 409) return setState({ kind: "exists" }); // unique_violation → already on the list
      return setState({ kind: "error", message: "Something went wrong. Please try again." });
    } catch {
      return setState({ kind: "error", message: "No connection. Please try again." });
    }
  }

  const settled = state.kind === "done" || state.kind === "exists";

  return (
    <section className="early" aria-labelledby="early-title">
      <div>
        <h2 id="early-title">Get early access</h2>
        <p>Accounts with your own library are coming. Leave your email and we tell you when sign-in opens.</p>
      </div>
      {settled ? (
        <p className="early__done" role="status" data-state="signup-done">
          {state.kind === "done" ? "Thanks, you are on the list." : "You’re already signed up."}
        </p>
      ) : (
        <form className="early__form" onSubmit={submit} noValidate>
          <label htmlFor="early-email" className="sr-only">Email address</label>
          <input id="early-email" type="email" name="email" autoComplete="email" inputMode="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required aria-invalid={state.kind === "error"} aria-describedby="early-note" />
          <input className="early__trap" type="text" name="bot-field" tabIndex={-1} autoComplete="off" aria-hidden="true" value={trap} onChange={(e) => setTrap(e.target.value)} />
          <button type="submit" className="btn btn--primary" disabled={state.kind === "sending"} data-action="signup">
            {state.kind === "sending" ? "Sending…" : "Notify me"}
          </button>
        </form>
      )}
      {state.kind === "error" && <p className="early__error" role="alert">{state.message}</p>}
      <p id="early-note" className="early__note">We only use your email to tell you about sign-in and launch news. No spam, no sharing. Ask us any time and we delete it. <a href="/privacy">Privacy notice</a></p>
    </section>
  );
}
