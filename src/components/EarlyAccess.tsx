"use client";
// Early-access sign-up on the start page. There are no accounts yet; the address only puts the
// visitor on the list for when sign-in opens. On Netlify it goes to Netlify Forms (public/__forms.html),
// elsewhere to /api/signup.
import { useState } from "react";

type State = { kind: "idle" | "sending" | "done" } | { kind: "error"; message: string };

async function viaNetlify(email: string, trap: string): Promise<boolean> {
  try {
    const res = await fetch("/__forms.html", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ "form-name": "early-access", email, "bot-field": trap }).toString(),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function viaApi(email: string, trap: string): Promise<string | null> {
  try {
    const res = await fetch("/api/signup", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, website: trap }) });
    if (res.ok) return null;
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    return data.error ?? "Something went wrong. Please try again.";
  } catch {
    return "No connection. Please try again.";
  }
}

export function EarlyAccess() {
  const [email, setEmail] = useState("");
  const [trap, setTrap] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const value = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value)) return setState({ kind: "error", message: "Please enter a valid email address." });
    setState({ kind: "sending" });
    if (await viaNetlify(value, trap)) return setState({ kind: "done" });
    const error = await viaApi(value, trap);
    setState(error ? { kind: "error", message: error } : { kind: "done" });
  }

  return (
    <section className="early" aria-labelledby="early-title">
      <div>
        <h2 id="early-title">Get early access</h2>
        <p>Accounts with your own library are coming. Leave your email and we tell you when sign-in opens.</p>
      </div>
      {state.kind === "done" ? (
        <p className="early__done" role="status" data-state="signup-done">
          Thanks, you are on the list.
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
