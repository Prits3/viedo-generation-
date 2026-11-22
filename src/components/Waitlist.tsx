"use client";

// Signup / free-trial CTA.
//
// Records each signup into Supabase `public.waitlist` via the REST API using the
// PUBLISHABLE (anon) key, relying on the table's insert-only RLS policy. This is
// lightweight signup tracking so we can count how many people signed up — reads are
// blocked for this key by design, so the count is viewed in the Supabase dashboard.
// Full accounts / authentication are a separate backend (Trung) and are not wired here.

import { useState } from "react";

type Status = "idle" | "submitting" | "done" | "exists" | "error";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export function Waitlist({
  source = "landing_page",
  heading = "Start your free trial",
  blurb = "Create your LearnLayla account and turn your first resources into narrated lessons.",
}: {
  source?: string;
  heading?: string;
  blurb?: string;
}) {
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [fieldError, setFieldError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (status === "submitting") return;

    const normalised = email.trim().toLowerCase();
    if (!EMAIL_RE.test(normalised) || normalised.length > 254) {
      setFieldError("Please enter a valid email address.");
      return;
    }
    setFieldError(null);

    if (!SUPABASE_URL || !SUPABASE_KEY) {
      setStatus("error");
      return;
    }

    setStatus("submitting");
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/waitlist`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ email: normalised, source, marketing_consent: consent }),
      });

      if (res.status === 201 || res.status === 200 || res.status === 204) {
        setStatus("done");
        setEmail("");
        setConsent(false);
      } else if (res.status === 409) {
        setStatus("exists"); // unique_violation → already signed up
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  }

  if (status === "done" || status === "exists") {
    return (
      <section className="waitlist" aria-labelledby="waitlist-heading">
        <div className="waitlist__text">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/learnlayla-logo.png" alt="LearnLayla" className="waitlist__mascot" width={64} height={64} />
          <h2 id="waitlist-heading">{heading}</h2>
        </div>
        <p className="waitlist__done" role="status">
          ✓ {status === "done" ? "You’re signed up! We’ll email you when your account is ready." : "You’re already signed up."}
        </p>
      </section>
    );
  }

  const submitting = status === "submitting";

  return (
    <section className="waitlist" aria-labelledby="waitlist-heading">
      <div className="waitlist__text">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/learnlayla-logo.png" alt="LearnLayla" className="waitlist__mascot" width={64} height={64} />
        <h2 id="waitlist-heading">{heading}</h2>
        <p>{blurb}</p>
      </div>

      <form className="waitlist__form" onSubmit={submit} noValidate>
        <div className="waitlist__row">
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
            aria-invalid={fieldError ? true : undefined}
            aria-describedby={fieldError ? "waitlist-error" : "waitlist-hint"}
            onChange={(e) => {
              setEmail(e.target.value);
              if (fieldError) setFieldError(null);
              if (status === "error") setStatus("idle");
            }}
            disabled={submitting}
          />
          <button type="submit" className="btn btn--primary" disabled={submitting}>
            {submitting ? "Signing up…" : "Start free trial"}
          </button>
        </div>

        <label className="waitlist__consent">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} disabled={submitting} />
          <span>Send me occasional LearnLayla updates.</span>
        </label>

        <p className="waitlist__hint" id="waitlist-hint">
          Early-access updates only. No spam.
        </p>

        {fieldError && (
          <p className="waitlist__error" id="waitlist-error" role="alert">
            {fieldError}
          </p>
        )}
        {status === "error" && (
          <p className="waitlist__error" role="alert">
            Something went wrong. Please try again.
          </p>
        )}
      </form>
    </section>
  );
}
