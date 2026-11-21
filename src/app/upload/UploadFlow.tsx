"use client";

// Upload flow with honest, visible states: reading the PDF, building the storyboard,
// checking it against the PDF, done, or a failure with its reason and the example as a way out.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Lesson } from "@/lib/types";
import { LessonExperience } from "@/components/LessonExperience";

type Stage = "idle" | "reading" | "storyboard" | "checking" | "done" | "error";
interface Failure {
  code: string;
  title: string;
  help: string;
  detail?: string;
  failedAt: Stage;
}
interface Config {
  configured: boolean;
  model: string;
  limits: { maxUploadMb: number; maxPages: number; rateLimitMax: number; rateLimitWindowMinutes: number };
}

const ORDER: Stage[] = ["reading", "storyboard", "checking"];

export function UploadFlow() {
  const [stage, setStage] = useState<Stage>("idle");
  const [config, setConfig] = useState<Config | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [lesson, setLesson] = useState<Lesson | null>(null);
  const [info, setInfo] = useState<{ pages?: number; unreadable?: number[]; chars?: number; outputChars?: number; model?: string; fileName?: string }>({});
  const [elapsed, setElapsed] = useState(0);
  const [over, setOver] = useState(false);
  const blobUrl = useRef<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const stageRef = useRef<Stage>("idle");
  stageRef.current = stage;

  useEffect(() => {
    fetch("/api/generate")
      .then((r) => r.json())
      .then(setConfig)
      .catch(() => setConfig(null));
    return () => {
      abort.current?.abort();
      if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);
    };
  }, []);

  const busy = stage === "reading" || stage === "storyboard" || stage === "checking";
  useEffect(() => {
    if (!busy) return;
    const t0 = Date.now();
    const id = setInterval(() => setElapsed(Math.round((Date.now() - t0) / 1000)), 1000);
    return () => clearInterval(id);
  }, [busy]);

  const fail = (f: Omit<Failure, "failedAt">) => {
    setFailure({ ...f, failedAt: stageRef.current === "idle" ? "reading" : stageRef.current });
    setStage("error");
  };

  async function start(file: File) {
    if (busy) return;
    setFailure(null);
    setLesson(null);
    setElapsed(0);
    setInfo({ fileName: file.name });
    setStage("reading");
    stageRef.current = "reading";
    if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);
    blobUrl.current = URL.createObjectURL(file);
    const body = new FormData();
    body.append("file", file);
    const ctl = new AbortController();
    abort.current = ctl;
    try {
      const res = await fetch("/api/generate", { method: "POST", body, signal: ctl.signal });
      if (!res.ok || !res.body || !res.headers.get("content-type")?.includes("ndjson")) {
        const j = await res.json().catch(() => null);
        fail(j?.title ? j : { code: "upstream_error", title: "The server did not accept the upload", help: `Status ${res.status}. Try again.` });
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let finished = false;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          const ev = JSON.parse(line);
          if (ev.type === "stage") {
            setStage(ev.stage);
            stageRef.current = ev.stage;
            if (ev.model) setInfo((i) => ({ ...i, model: ev.model }));
          } else if (ev.type === "extracted") setInfo((i) => ({ ...i, pages: ev.pages, unreadable: ev.unreadablePages, chars: ev.chars }));
          else if (ev.type === "progress") setInfo((i) => ({ ...i, outputChars: ev.outputChars }));
          else if (ev.type === "error") {
            fail(ev);
            finished = true;
          } else if (ev.type === "done") {
            const l = ev.lesson as Lesson;
            l.meta.pdfUrl = blobUrl.current ?? "";
            setLesson(l);
            setStage("done");
            finished = true;
          }
        }
      }
      if (!finished) fail({ code: "upstream_error", title: "The connection ended early", help: "The server stopped before the lesson was finished. Try again." });
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        setStage("idle");
        return;
      }
      fail({ code: "upstream_error", title: "The upload could not be sent", help: "Check your connection and try again." });
    }
  }

  if (stage === "done" && lesson) {
    const unreadable = lesson.pageStatus.filter((p) => p.status === "unreadable").map((p) => p.page);
    return (
      <LessonExperience
        lesson={lesson}
        notice={
          <div className="alert alert--warn notice" role="status" data-upload-state="done">
            <p>
              <strong>Generated automatically from “{info.fileName}”.</strong> Quotes were matched against the PDF text ({lesson.verification.quoteChecks.matched} of {lesson.verification.quoteChecks.total}
              found), but no person has checked the statements. Entries marked “Unclear” need a look at the original.
              {unreadable.length > 0 && ` Pages without readable text, not covered: ${unreadable.join(", ")}.`}
            </p>
            <div className="alert__actions">
              <button type="button" className="btn btn--small" onClick={() => setStage("idle")}>
                Upload another PDF
              </button>
              <Link href="/lesson/demo" className="btn btn--ghost btn--small">
                Open the fully checked example
              </Link>
            </div>
          </div>
        }
      />
    );
  }

  const stepClass = (s: Stage) => {
    if (stage === "error") return failure?.failedAt === s ? "is-failed" : ORDER.indexOf(s) < ORDER.indexOf(failure?.failedAt ?? "reading") ? "is-done" : "";
    if (stage === s) return "is-active";
    return ORDER.indexOf(s) < ORDER.indexOf(stage) ? "is-done" : "";
  };
  const mark = (s: Stage) => (stepClass(s) === "is-done" ? "✓" : stepClass(s) === "is-failed" ? "!" : "");

  return (
    <main className="upload">
      <Link href="/" className="back">
        ← Start
      </Link>
      <h1>Upload a paper</h1>
      <p className="lead">A PDF with a text layer becomes an intro, chapters, captions and a source index. Each generated statement is matched against the PDF, and the page tells you what could not be verified.</p>

      {config && !config.configured && stage !== "error" && (
        <div className="alert alert--info" role="status" data-upload-state="not-configured">
          <h2>Live generation is not configured on this server</h2>
          <p>
            No model API key is set (<code>ANTHROPIC_API_KEY</code>). You can still try an upload to see what happens, or open the example, which runs without a key.
          </p>
          <Link href="/lesson/demo" className="btn btn--primary">
            Open the example
          </Link>
        </div>
      )}

      {!busy && (
        <label
          className={`drop ${over ? "is-over" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            const f = e.dataTransfer.files?.[0];
            if (f) start(f);
          }}
        >
          <strong>Drop a PDF here or choose a file</strong>
          <input
            type="file"
            accept="application/pdf,.pdf"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) start(f);
            }}
          />
          <span className="limits">
            Up to {config?.limits.maxUploadMb ?? 15} MB and {config?.limits.maxPages ?? 40} pages · text layer required (no scans) · {config?.limits.rateLimitMax ?? 4} generations per{" "}
            {config?.limits.rateLimitWindowMinutes ?? 10} minutes
          </span>
          <span className="limits">The PDF text is sent to the model provider to build the lesson. The file itself stays in your browser tab.</span>
        </label>
      )}

      {stage !== "idle" && (
        <ol className="steps" aria-live="polite" data-upload-steps={stage}>
          <li className={stepClass("reading")}>
            <i aria-hidden="true">{mark("reading")}</i>
            <span>
              <strong>Reading the PDF</strong>
              <small>
                {info.fileName}
                {info.pages ? ` · ${info.pages} pages · ${info.chars?.toLocaleString("en-US")} characters of text` : ""}
                {info.unreadable?.length ? ` · no readable text on page ${info.unreadable.join(", ")}` : ""}
              </small>
            </span>
          </li>
          <li className={stepClass("storyboard")}>
            <i aria-hidden="true">{mark("storyboard")}</i>
            <span>
              <strong>Building inventory and storyboard</strong>
              <small>
                {stage === "storyboard"
                  ? `${info.model ?? "Model"} is working · ${elapsed} s${info.outputChars ? ` · ${info.outputChars.toLocaleString("en-US")} characters written` : " · this usually takes one to three minutes"}`
                  : "Content inventory first, then scenes that only use inventory entries"}
              </small>
            </span>
          </li>
          <li className={stepClass("checking")}>
            <i aria-hidden="true">{mark("checking")}</i>
            <span>
              <strong>Checking against the PDF</strong>
              <small>Validating the output and searching every quote on its page</small>
            </span>
          </li>
        </ol>
      )}

      {busy && (
        <button type="button" className="btn btn--ghost" onClick={() => abort.current?.abort()}>
          Cancel
        </button>
      )}

      {stage === "error" && failure && (
        <div className="alert alert--error" role="alert" data-upload-state="error" data-error-code={failure.code}>
          <h2>{failure.title}</h2>
          <p>{failure.help}</p>
          {failure.detail && (
            <p className="limits">
              Reason: {failure.detail} <code>{failure.code}</code>
            </p>
          )}
          <p>Live generation did not finish. The example lesson shows the complete flow with checked data and needs no model call.</p>
          <div className="alert__actions">
            <Link href="/lesson/demo" className="btn btn--primary" data-action="fallback-example">
              Open the example instead
            </Link>
          </div>
        </div>
      )}
    </main>
  );
}
