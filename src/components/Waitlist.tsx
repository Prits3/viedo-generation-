"use client";

// Early-access waitlist form. Inserts directly into Supabase `public.waitlist`
// from the browser using the publishable (anon) key, relying on the table's
// pre-configured Row Level Security insert policy. No numbers are read back or shown.

import { useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase";

type Status = "idle" | "submitting" | "done" | "error" | "duplicate";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const SUCCESS_MSG = "You’re on the list. We’ll let you know when your LearnLayla access is ready.";
const DUPLICATE_MSG = "You’re already on the list.";
const ERROR_MSG = "Something went wrong. Please try again.";

export function Waitlist({
  source = "landing_page",
  heading = "Get early access",
  blurb = "Be the first to turn your resources into lessons. Join the early-access list.",
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
    setStatus("submitting");

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setStatus("error");
      return;
    }

    const { error } = await supabase
      .from("waitlist")
      .insert({ email: normalised, source, marketing_consent: consent });

    if (!error) {
      setStatus("done");
      setEmail("");
      setConsent(false);
    } else if (error.code === "23505") {
      // unique_violation → email already present
      setStatus("duplicate");
    } else {
      setStatus("error");
    }
  }

  if (status === "done" || status === "duplicate") {
    return (
      <section className="waitlist" aria-labelledby="waitlist-heading">
        <div className="waitlist__text">
          <h2 id="waitlist-heading">{heading}</h2>
        </div>
        <p className="waitlist__done" role="status">
          ✓ {status === "done" ? SUCCESS_MSG : DUPLICATE_MSG}
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
            {submitting ? "Joining…" : "Join early access"}
          </button>
        </div>

        <label className="waitlist__consent">
          <input
            type="checkbox"
            checked={consent}
            onChange={(e) => setConsent(e.target.checked)}
            disabled={submitting}
          />
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
            {ERROR_MSG}
          </p>
        )}
      </form>
    </section>
  );
}
