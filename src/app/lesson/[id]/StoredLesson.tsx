"use client";

// A lesson from the lesson store. It is loaded as one validated file and played as it is:
// same scenes, assets and timings every time, and no model call. Only "Regenerate this scene"
// calls a model, for that one scene.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Lesson } from "@/lib/types";
import { LessonExperience } from "@/components/LessonExperience";

interface Run {
  step: string;
  model: string;
  ms: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number | null;
  attempts: number;
}
interface StoredFile {
  format: string;
  version: number;
  revision: number;
  savedAt: string;
  provenance: { sourceKind: "pdf" | "text"; sourceName: string; sourceHash: string; provider: string; models: { fast: string; strong: string; vision: string }; promptVersion: string; voice: string; runs: Run[] };
  totals: { calls: number; ms: number; inputTokens: number; outputTokens: number; costUsd: number | null };
  lesson: Lesson;
}

export function StoredLesson({ id }: { id: string }) {
  const router = useRouter();
  const [file, setFile] = useState<StoredFile | null>(null);
  const [missing, setMissing] = useState<{ title: string; help: string; job?: { status: string; stage: string; title: string } | null } | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/api/lessons/${id}`)
      .then(async (r) => ({ ok: r.ok, body: await r.json() }))
      .then(({ ok, body }) => {
        if (!alive) return;
        if (ok) setFile(body);
        else setMissing(body);
      })
      .catch(() => alive && setMissing({ title: "The lesson could not be loaded", help: "Check that the server is running and try again." }));
    return () => {
      alive = false;
    };
  }, [id]);

  const regenerate = useCallback(
    async (sceneId: string): Promise<string | null> => {
      try {
        const res = await fetch(`/api/lessons/${id}/scenes/${sceneId}`, { method: "POST" });
        const body = await res.json();
        if (!res.ok) return `${body.title ?? "The scene could not be regenerated"}. ${body.detail ?? body.help ?? ""}`;
        setFile(body);
        return null;
      } catch {
        return "The scene could not be regenerated: the server did not answer.";
      }
    },
    [id],
  );

  const remove = async () => {
    if (!window.confirm("Delete this lesson, its source and its narration from the server?")) return;
    await fetch(`/api/lessons/${id}`, { method: "DELETE" });
    router.push("/upload");
  };

  if (missing)
    return (
      <main className="upload">
        <Link href="/" className="back">
          ← Start
        </Link>
        <div className="alert alert--error" role="alert" data-lesson-state="missing">
          <h2>{missing.job ? "This lesson is not finished" : missing.title}</h2>
          <p>{missing.job ? `"${missing.job.title}" stopped at the step "${missing.job.stage}". The finished steps are stored.` : missing.help}</p>
          <div className="alert__actions">
            {missing.job && (
              <Link href={`/upload?resume=${id}`} className="btn btn--primary">
                Resume generation
              </Link>
            )}
            <Link href="/lesson/demo" className="btn">
              Open the example
            </Link>
          </div>
        </div>
      </main>
    );
  if (!file)
    return (
      <main className="upload" data-lesson-state="loading">
        <p className="lead">Loading the lesson…</p>
      </main>
    );

  const { lesson, provenance: p, totals } = file;
  const unreadable = lesson.pageStatus.filter((s) => s.status === "unreadable").map((s) => s.page);
  return (
    <LessonExperience
      lesson={lesson}
      onRegenerate={regenerate}
      notice={
        <div className="alert alert--warn notice" role="status" data-lesson-state="stored" data-revision={file.revision}>
          <p>
            <strong>Generated automatically from “{p.sourceName}”.</strong> Quotes were matched against the {p.sourceKind === "text" ? "pasted text" : "PDF text"} ({lesson.verification.quoteChecks.matched} of {lesson.verification.quoteChecks.total} found), but no person has
            checked the statements. Entries marked “Unclear” need a look at the original.
            {unreadable.length > 0 && ` Pages without readable text, not covered: ${unreadable.join(", ")}.`}
          </p>
          <details className="made">
            <summary>How this lesson was made</summary>
            <p className="limits">
              Lesson format {file.format} v{file.version}, revision {file.revision}, saved {file.savedAt.slice(0, 16).replace("T", " ")} UTC · provider {p.provider} · prompts {p.promptVersion} · voice {p.voice} · source sha256 {p.sourceHash.slice(0, 12)}… Opening and
              playing this lesson calls no model.
            </p>
            <div className="runs-wrap">
              <table className="runs">
                <thead>
                  <tr>
                    <th>Step</th>
                    <th>Model</th>
                    <th className="num">Time</th>
                    <th className="num">Tokens in</th>
                    <th className="num">Tokens out</th>
                    <th className="num">Est. cost</th>
                  </tr>
                </thead>
                <tbody>
                  {p.runs.map((r, k) => (
                    <tr key={k}>
                      <td>{r.step}</td>
                      <td>{r.model}</td>
                      <td className="num">{(r.ms / 1000).toFixed(1)} s</td>
                      <td className="num">{r.inputTokens.toLocaleString("en-US")}</td>
                      <td className="num">{r.outputTokens.toLocaleString("en-US")}</td>
                      <td className="num">{r.costUsd === null ? "n/a" : `$${r.costUsd.toFixed(4)}`}</td>
                    </tr>
                  ))}
                  <tr>
                    <th colSpan={2}>Total, {totals.calls} model calls</th>
                    <th className="num">{(totals.ms / 1000).toFixed(0)} s</th>
                    <th className="num">{totals.inputTokens.toLocaleString("en-US")}</th>
                    <th className="num">{totals.outputTokens.toLocaleString("en-US")}</th>
                    <th className="num">{totals.costUsd === null ? "n/a" : `$${totals.costUsd.toFixed(4)}`}</th>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="limits">Cost is an estimate from list prices per million tokens; models without a listed price show n/a.</p>
          </details>
          <div className="alert__actions">
            <Link href="/upload" className="btn btn--small">
              Make another lesson
            </Link>
            <Link href="/lesson/demo" className="btn btn--ghost btn--small">
              Open the fully checked example
            </Link>
            <button type="button" className="btn btn--ghost btn--small" onClick={remove} data-action="delete-lesson">
              Delete this lesson
            </button>
          </div>
        </div>
      }
    />
  );
}
