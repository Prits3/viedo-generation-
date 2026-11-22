"use client";

// Signup / free-trial CTA — FRONTEND ONLY.
//
// The backend (authentication, user accounts, database) is not wired yet. This form
// validates input and shows a confirmation so the signup experience is visually
// functional, but it does NOT store anything anywhere. The wiring is pending — Trung
// will connect accounts + database later. No data is saved and no numbers are shown.

import { useState } from "react";

type Status = "idle" | "done";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function Waitlist({
  source = "landing_page",
  heading = "Start your free trial",
  blurb = "Create your LearnLayla account and turn your first resources into lessons.",
}: {
  source?: string;
  heading?: string;
  blurb?: string;
}) {
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<Status>("idle");
  const [fieldError, setFieldError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const normalised = email.trim().toLowerCase();
    if (!EMAIL_RE.test(normalised) || normalised.length > 254) {
      setFieldError("Please enter a valid email address.");
      return;
    }
    // Backend not connected yet — do not send anywhere. Just confirm visually.
    setFieldError(null);
    setStatus("done");
  }

  if (status === "done") {
    return (
      <section className="waitlist" aria-labelledby="waitlist-heading">
        <div className="waitlist__text">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/learnlayla-logo.png" alt="LearnLayla" className="waitlist__mascot" width={64} height={64} />
          <h2 id="waitlist-heading">{heading}</h2>
        </div>
        <p className="waitlist__done" role="status">
          ✓ Thanks for your interest! Account sign-up isn’t live yet — we’ll open it shortly.
        </p>
        <p className="waitlist__pending">Signup backend is being connected. No account was created and nothing was saved.</p>
      </section>
    );
  }

  return (
    <section className="waitlist" aria-labelledby="waitlist-heading">
      <div className="waitlist__text">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/learnlayla-logo.png" alt="LearnLayla" className="waitlist__mascot" width={64} height={64} />
        <h2 id="waitlist-heading">{heading}</h2>
        <p>{blurb}</p>
      </div>

      <form className="waitlist__form" onSubmit={submit} data-source={source} noValidate>
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
            }}
          />
          <button type="submit" className="btn btn--primary">
            Start free trial
          </button>
        </div>

        <label className="waitlist__consent">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
          <span>Send me occasional LearnLayla updates.</span>
        </label>

        <p className="waitlist__hint" id="waitlist-hint">
          Early-access updates only. No spam.
        </p>
        <p className="waitlist__pending" aria-live="polite">
          ⚙︎ Backend wiring pending — accounts &amp; database to be connected by Trung.
        </p>

        {fieldError && (
          <p className="waitlist__error" id="waitlist-error" role="alert">
            {fieldError}
          </p>
        )}
      </form>
    </section>
  );
}
