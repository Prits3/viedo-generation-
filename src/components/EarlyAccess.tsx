"use client";
import { useState } from "react";

type State = { kind: "idle" | "sending" | "done" | "duplicate" } | { kind: "error"; message: string };
const FAILURE = "We couldn’t complete your signup. Please try again.";

async function viaApi(email: string, trap: string): Promise<State> {
  try {
    const res = await fetch("/api/signup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, website: trap }) });
    const data = (await res.json()) as { ok?: boolean; status?: string; error?: string };
    if (res.ok && data.ok && data.status === "signed_up") return { kind: "done" };
    if (res.ok && data.ok && data.status === "already_signed_up") return { kind: "duplicate" };
    return { kind: "error", message: res.status === 400 && data.error ? data.error : FAILURE };
  } catch {
    return { kind: "error", message: FAILURE };
  }
}

export function EarlyAccess() {
  const [email, setEmail] = useState("");
  const [trap, setTrap] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (state.kind === "sending") return;
    const value = email.trim().toLowerCase();
    if (value.length > 254 || !/^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/.test(value)) return setState({ kind: "error", message: "Please enter a valid email address." });
    setState({ kind: "sending" });
    setState(await viaApi(value, trap));
  }

  return (
    <section className="early" aria-labelledby="early-title">
      <div>
        <h2 id="early-title">Get early access</h2>
        <p>Accounts with your own library are coming. Leave your email and we tell you when sign-in opens.</p>
      </div>
      {state.kind === "done" || state.kind === "duplicate" ? (
        <p className="early__done" role="status" data-state="signup-done">
          {state.kind === "done" ? "You’re signed up!" : "You’re already signed up."}
        </p>
      ) : (
        <form className="early__form" method="post" action="/api/signup" onSubmit={submit} noValidate>
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
