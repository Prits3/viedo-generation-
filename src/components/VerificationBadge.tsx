"use client";

import type { Lesson } from "@/lib/types";
import type { CoverageReport } from "@/lib/coverage";

/**
 * Shows the real check status. "Fully checked" appears only when a verification run
 * compared the inventory with the PDF and found no problem, and the live coverage check agrees.
 */
export function VerificationBadge({ lesson, coverage }: { lesson: Lesson; coverage: CoverageReport }) {
  const v = lesson.verification;
  const full = v.mode === "manual" && v.fullyChecked && coverage.issues.length === 0;
  const unreadable = lesson.pageStatus.filter((p) => p.status === "unreadable").length;
  return (
    <details className={`verify ${full ? "verify--full" : "verify--auto"}`} data-verified={full ? "full" : "auto"}>
      <summary>
        <i aria-hidden="true" />
        {full ? (
          <span>
            <strong>Fully checked</strong> against the PDF{v.checkedAt ? ` · ${v.checkedAt}` : ""}
          </span>
        ) : (
          <span>
            <strong>Automatically generated</strong> · quotes found: {v.quoteChecks.matched}/{v.quoteChecks.total} · not reviewed by a person
          </span>
        )}
      </summary>
      <div className="verify__body">
        <p>{v.method}</p>
        {v.reviewer && <p>Reviewer: {v.reviewer}</p>}
        <ul>
          <li>
            Quotes found on their stated page: {v.quoteChecks.matched} of {v.quoteChecks.total}
          </li>
          <li>
            Spoken sentences with a source: {coverage.cues.sourced} of {coverage.cues.total - coverage.cues.connective} ({coverage.cues.connective} transitions without scientific content)
          </li>
          <li>
            Inventory entries with a place in the lesson: {lesson.inventory.length - coverage.counts["original-only"]} of {lesson.inventory.length}
          </li>
          {unreadable > 0 && <li>Pages without readable text: {unreadable}</li>}
          {v.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
          {coverage.issues.slice(0, 12).map((i) => (
            <li key={i.message} className="verify__issue">
              {i.message}
            </li>
          ))}
        </ul>
      </div>
    </details>
  );
}
