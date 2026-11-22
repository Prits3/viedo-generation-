"use client";

// Email waitlist capture with a live "N joined" counter.
// Posts to /api/signup. Degrades to a clear message if the database isn't connected yet.

import { useEffect, useState } from "react";

type Status = "idle" | "submitting" | "done" | "error";

export function Waitlist({
  source = "waitlist",
  heading = "Join the waitlist",
  blurb = "Be the first to turn your resources into lessons. We’ll email you when it’s ready.",
}: {
  source?: string;
  heading?: string;
  blurb?: string;
}) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/signup")
      .then((r) => r.json())
      .then((d) => {
        if (active && typeof d.count === "number") setCount(d.count);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "submitting") return;
    setStatus("submitting");
    setMessage(null);
    try {
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, source }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok) {
        if (typeof data.count === "number") setCount(data.count);
        setStatus("done");
        setEmail("");
      } else {
        setStatus("error");
        setMessage(data.message ?? "Something went wrong. Please try again.");
      }
    } catch {
      setStatus("error");
      setMessage("Network error. Please try again.");
    }
  }

  return (
    <section className="waitlist" aria-labelledby="waitlist-heading">
      <div className="waitlist__text">
        <h2 id="waitlist-heading">{heading}</h2>
        <p>{blurb}</p>
        {count !== null && count > 0 && (
          <p className="waitlist__count" aria-live="polite">
            <strong>{count.toLocaleString("en-US")}</strong> {count === 1 ? "person has" : "people have"} joined
          </p>
        )}
      </div>

      {status === "done" ? (
        <p className="waitlist__done" role="status">
          ✓ You’re on the list. We’ll be in touch.
        </p>
      ) : (
        <form className="waitlist__form" onSubmit={submit}>
          <label className="sr-only" htmlFor="waitlist-email">
            Email address
          </label>
          <input
            id="waitlist-email"
            className="waitlist__input"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            placeholder="you@email.com"
            value={email}
            aria-invalid={status === "error" ? true : undefined}
            aria-describedby={message ? "waitlist-msg" : undefined}
            onChange={(e) => {
              setEmail(e.target.value);
              if (status === "error") setStatus("idle");
            }}
            disabled={status === "submitting"}
          />
          <button type="submit" className="btn btn--primary" disabled={status === "submitting"}>
            {status === "submitting" ? "Joining…" : "Join waitlist"}
          </button>
        </form>
      )}

      {message && (
        <p className="waitlist__error" id="waitlist-msg" role="alert">
          {message}
        </p>
      )}
    </section>
  );
}
