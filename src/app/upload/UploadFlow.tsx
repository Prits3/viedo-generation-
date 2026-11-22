"use client";

// Generation flow with honest, visible states for every input (a dropped file or pasted text)
// and both lengths (a short of about a minute, or the full lesson):
// reading, inventory, storyboard, checking, figures, voice, saving; or a failure with its
// reason, a way to resume from the last finished step, and the example as a way out.
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Library } from "@/components/Library";
import styles from "./upload.module.css";

type Stage = "idle" | "reading" | "inventory" | "storyboard" | "checking" | "figures" | "voice" | "saving" | "done" | "error";
interface Failure {
  code: string;
  title: string;
  help: string;
  detail?: string;
  failedAt: Stage;
  /** Present when the run can be resumed from its last checkpoint. */
  id?: string;
}
interface Provider {
  id: "bedrock" | "anthropic";
  configured: boolean;
  models: { fast: string; strong: string; vision: string };
}
interface Config {
  configured: boolean;
  defaultProvider: Provider["id"] | null;
  providers: Provider[];
  voice: string | null;
  limits: { maxUploadMb: number; maxPages: number; accept?: string[]; rateLimitMax: number; rateLimitWindowMinutes: number };
}
interface Run {
  step: string;
  model: string;
  ms: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number | null;
}
interface Info {
  name?: string;
  kind?: "pdf" | "text";
  format?: "pdf" | "text" | "docx" | "pptx";
  /** Set by the server when a run starts or is resumed. */
  length?: "short" | "full";
  count?: number;
  unreadable?: number[];
  chars?: number;
  outputChars?: number;
  entries?: number;
  matched?: number;
  scenes: { title: string; status: string }[];
  voiceDone?: number;
  voiceTotal?: number;
  voice?: string;
  models?: Provider["models"];
  runs: Run[];
  cached: Stage[];
}

const PROVIDER_NAME = { bedrock: "Amazon Bedrock", anthropic: "Anthropic API (direct)" };
const emptyInfo = (): Info => ({ scenes: [], runs: [], cached: [] });
/** Formats that were run end to end; the server reports its own list and refuses anything else. */
const ACCEPT = [".pdf", ".docx", ".pptx", ".txt", ".md"];
const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");

export function UploadFlow() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("idle");
  const [config, setConfig] = useState<Config | null>(null);
  const [provider, setProvider] = useState<Provider["id"] | "">("");
  const [mode, setMode] = useState<"pdf" | "text">("pdf");
  const [length, setLength] = useState<"short" | "full">("short");
  const [pageOver, setPageOver] = useState(false);
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [failure, setFailure] = useState<Failure | null>(null);
  const [info, setInfo] = useState<Info>(emptyInfo);
  const [elapsed, setElapsed] = useState(0);
  const [over, setOver] = useState(false);
  const [resumeId, setResumeId] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const stageRef = useRef<Stage>("idle");
  const jobRef = useRef<string | null>(null);
  stageRef.current = stage;

  useEffect(() => {
    fetch("/api/generate")
      .then((r) => r.json())
      .then((c: Config) => {
        setConfig(c);
        setProvider(c.defaultProvider ?? "");
      })
      .catch(() => setConfig(null));
    const q = new URLSearchParams(window.location.search);
    if (q.get("resume")) setResumeId(q.get("resume"));
    if (q.get("input") === "text") setMode("text");
    if (q.get("mode") === "full") setLength("full");
    return () => abort.current?.abort();
  }, []);

  const busy = !["idle", "done", "error"].includes(stage);
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

  async function run(body: FormData, name: string) {
    if (busy) return;
    setFailure(null);
    setElapsed(0);
    setInfo({ ...emptyInfo(), name });
    setStage("reading");
    stageRef.current = "reading";
    jobRef.current = null;
    if (provider) body.append("provider", provider);
    if (!body.has("resume")) body.append("mode", length);
    const ctl = new AbortController();
    abort.current = ctl;
    try {
      const res = await fetch("/api/generate", { method: "POST", body, signal: ctl.signal });
      if (!res.body || !res.headers.get("content-type")?.includes("ndjson")) {
        const j = await res.json().catch(() => null);
        if (j?.type === "done" && j.id) return router.push(`/lesson/${j.id}`);
        fail(j?.title ? j : { code: "upstream_error", title: "The server did not accept the request", help: `Status ${res.status}. Try again.` });
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
          if (ev.type === "job") {
            jobRef.current = ev.id;
            setInfo((i) => ({ ...i, models: ev.models, voice: ev.voice, length: ev.mode }));
          } else if (ev.type === "stage") {
            setStage(ev.stage);
            stageRef.current = ev.stage;
            setInfo((i) => ({ ...i, outputChars: undefined, cached: ev.cached ? [...i.cached, ev.stage] : i.cached, voiceTotal: ev.total ?? i.voiceTotal }));
          } else if (ev.type === "extracted") setInfo((i) => ({ ...i, kind: ev.kind, format: ev.format, count: ev.count, unreadable: ev.unreadable, chars: ev.chars }));
          else if (ev.type === "progress") setInfo((i) => ({ ...i, outputChars: ev.outputChars }));
          else if (ev.type === "inventory") setInfo((i) => ({ ...i, entries: ev.entries, matched: ev.matched }));
          else if (ev.type === "run") setInfo((i) => ({ ...i, runs: [...i.runs, ev.run] }));
          else if (ev.type === "scene") setInfo((i) => ({ ...i, scenes: [...i.scenes.filter((s) => s.title !== ev.title), { title: ev.title, status: ev.status }] }));
          else if (ev.type === "voice") setInfo((i) => ({ ...i, voiceDone: ev.done, voiceTotal: ev.total }));
          else if (ev.type === "error") {
            fail(ev);
            finished = true;
          } else if (ev.type === "done") {
            finished = true;
            setStage("done");
            router.push(`/lesson/${ev.id}`);
          }
        }
      }
      if (!finished) fail({ code: "upstream_error", title: "The connection ended early", help: "The server stopped before the lesson was finished. Finished steps are kept; you can resume.", id: jobRef.current ?? undefined });
    } catch (e) {
      if ((e as Error).name === "AbortError") {
        fail({ code: "interrupted", title: "Generation interrupted", help: "You stopped the run. The steps that had finished are kept on the server, so resuming does not repeat them.", id: jobRef.current ?? undefined });
        return;
      }
      fail({ code: "upstream_error", title: "The request could not be sent", help: "Check your connection and try again.", id: jobRef.current ?? undefined });
    }
  }

  const startFile = (file: File) => {
    const body = new FormData();
    body.append("file", file);
    run(body, file.name);
  };
  const startText = () => {
    const body = new FormData();
    body.append("text", text);
    if (title.trim()) body.append("title", title.trim());
    run(body, title.trim() || "Pasted text");
  };
  const resume = (id: string) => {
    const body = new FormData();
    body.append("resume", id);
    setResumeId(null);
    run(body, info.name ?? "Earlier run");
  };

  // A file may be dropped anywhere on the page, not only on the box.
  const startFileRef = useRef(startFile);
  startFileRef.current = startFile;
  useEffect(() => {
    if (busy || stage === "done") return;
    let depth = 0;
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setPageOver(true);
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      if (--depth <= 0) {
        depth = 0;
        setPageOver(false);
      }
    };
    const over = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setPageOver(false);
      setOver(false);
      const f = e.dataTransfer?.files?.[0];
      if (f) startFileRef.current(f);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
      setPageOver(false);
    };
  }, [busy, stage]);

  const isShort = (info.length ?? length) === "short";
  const unit = info.format === "pptx" ? "slides" : info.kind === "text" ? "paragraphs" : "pages";
  const one = unit.slice(0, -1);
  const accept = config?.limits.accept ?? ACCEPT;
  const ORDER: Stage[] = ["reading", "inventory", "storyboard", "checking", ...(info.kind === "text" || (!info.kind && mode === "text") || isShort ? [] : (["figures"] as Stage[])), "voice", "saving"];
  const stepClass = (s: Stage) => {
    const at = stage === "error" ? failure?.failedAt ?? "reading" : stage;
    if (stage === "done") return "is-done";
    if (at === s) return stage === "error" ? "is-failed" : "is-active";
    return ORDER.indexOf(s) < ORDER.indexOf(at) ? "is-done" : "";
  };
  const mark = (s: Stage) => (stepClass(s) === "is-done" ? "✓" : stepClass(s) === "is-failed" ? "!" : "");
  const writing = (s: Stage, model?: string) =>
    stage === s ? `${model ?? "Model"} is working · ${elapsed} s${info.outputChars ? ` · ${info.outputChars.toLocaleString("en-US")} characters written` : ""}` : info.cached.includes(s) ? "Kept from the earlier run, not generated again" : undefined;
  const active = config?.providers.find((p) => p.id === provider);
  const models = info.models ?? active?.models;
  const repaired = info.scenes.filter((s) => s.status === "repaired").length;
  const flagged = info.scenes.filter((s) => s.status === "flagged").length;
  const checkedCount = info.scenes.filter((s) => ["ok", "repaired", "flagged"].includes(s.status)).length;
  const textOk = text.trim().length >= 400;

  return (
    <main className="upload">
      <Link href="/" className="back">
        ← Start
      </Link>
      <h1>Make a lesson</h1>
      <p className="lead">Drop in a PDF, a Word or PowerPoint file, a text file or a pasted text. You get a one-minute short with the most important points, or a full lesson with chapters; both are narrated, captioned and guided by the same robot duck. Each statement is matched against the source, and the lesson tells you what could not be verified.</p>

      {config && !config.configured && stage !== "error" && (
        <div className="alert alert--info" role="status" data-upload-state="not-configured">
          <h2>Live generation is not configured on this server</h2>
          <p>
            No model key is set (<code>AWS_BEARER_TOKEN_BEDROCK</code> or <code>ANTHROPIC_API_KEY</code>). You can still try an upload to see what happens, or open the example, which runs without a key.
          </p>
          <Link href="/lesson/demo" className="btn btn--primary">
            Open the example
          </Link>
        </div>
      )}

      {resumeId && !busy && (
        <div className="alert alert--warn" role="status" data-upload-state="resumable">
          <h2>An earlier run was not finished</h2>
          <p>Its finished steps are stored. Resuming continues after the last one.</p>
          <button type="button" className="btn btn--primary" onClick={() => resume(resumeId)} data-action="resume">
            Resume generation
          </button>
        </div>
      )}

      {!busy && stage !== "done" && (
        <>
          <fieldset className={styles.modes} data-mode={length}>
            <legend>What should it become?</legend>
            <label className={styles.mode}>
              <input type="radio" name="length" value="short" checked={length === "short"} onChange={() => setLength("short")} data-mode-option="short" />
              <strong>Short</strong>
              <span>About one minute: a hook, the 3 to 5 most important points, one takeaway. Usually ready in about a minute.</span>
            </label>
            <label className={styles.mode}>
              <input type="radio" name="length" value="full" checked={length === "full"} onChange={() => setLength("full")} data-mode-option="full" />
              <strong>Full lesson</strong>
              <span>3 to 10 minutes: an intro, chapters, and original figures from a PDF. Takes 2 to 7 minutes to make.</span>
            </label>
          </fieldset>

          <div className="tabs" role="tablist" aria-label="Kind of input">
            <button type="button" role="tab" aria-selected={mode === "pdf"} onClick={() => setMode("pdf")} data-input="pdf">
              File
            </button>
            <button type="button" role="tab" aria-selected={mode === "text"} onClick={() => setMode("text")} data-input="text">
              Paste text
            </button>
          </div>

          {mode === "pdf" ? (
            <label
              className={`drop ${over ? "is-over" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setOver(true);
              }}
              onDragLeave={() => setOver(false)}
              onDrop={() => setOver(false)}
              data-accept={accept.join(" ")}
            >
              <strong>Drop a file anywhere on this page, or choose one</strong>
              <span className={styles.formats}>PDF, Word (.docx), PowerPoint (.pptx), text (.txt) or Markdown (.md)</span>
              <input
                type="file"
                accept={accept.join(",")}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) startFile(f);
                }}
              />
              <span className="limits">
                Up to {config?.limits.maxUploadMb ?? 15} MB · PDFs up to {config?.limits.maxPages ?? 40} pages, text layer required (no scans) · only text is read from Word and PowerPoint files · {config?.limits.rateLimitMax ?? 4} generations per {config?.limits.rateLimitWindowMinutes ?? 10} minutes
              </span>
            </label>
          ) : (
            <div className="paste">
              <label>
                <span className="sr-only">Title (optional)</span>
                <input type="text" placeholder="Title (optional)" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} style={{ width: "100%" }} />
              </label>
              <label>
                <span className="sr-only">Text to turn into a lesson</span>
                <textarea placeholder="Paste a chapter, an article or your notes. Separate paragraphs with an empty line; the lesson will point back to the paragraph each statement comes from." value={text} onChange={(e) => setText(e.target.value)} data-input="text-area" />
              </label>
              <div className="paste__row">
                <span className="limits">
                  {text.trim().length.toLocaleString("en-US")} characters · 400 to 60,000 · {config?.limits.rateLimitMax ?? 4} generations per {config?.limits.rateLimitWindowMinutes ?? 10} minutes
                </span>
                <button type="button" className="btn btn--primary" onClick={startText} disabled={!textOk} data-action="generate-text">
                  {length === "short" ? "Generate the short" : "Generate the lesson"}
                </button>
              </div>
            </div>
          )}

          {config && (
            <div className="setup" data-setup>
              <div className="setup__row">
                <strong>Model provider</strong>
                {config.providers.filter((p) => p.configured).length > 1 ? (
                  <select value={provider} onChange={(e) => setProvider(e.target.value as Provider["id"])} aria-label="Model provider" data-provider-select>
                    {config.providers
                      .filter((p) => p.configured)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {PROVIDER_NAME[p.id]}
                          {p.id === config.defaultProvider ? " (default)" : ""}
                        </option>
                      ))}
                  </select>
                ) : (
                  <span>{active ? PROVIDER_NAME[active.id] : "none configured"}</span>
                )}
                {config.providers.map((p) => (
                  <span key={p.id} className="chip" data-provider={p.id} data-configured={p.configured}>
                    {PROVIDER_NAME[p.id]}: {p.configured ? "key present" : "no key"}
                  </span>
                ))}
              </div>
              {active && (
                <div className="setup__row">
                  <span>
                    Inventory and repairs <code>{active.models.fast}</code>
                  </span>
                  <span>
                    Storyboard and narration <code>{active.models.strong}</code>
                  </span>
                  <span>
                    Original figures <code>{active.models.vision}</code>
                  </span>
                </div>
              )}
              <div className="setup__row">
                <span>Voice: {config.voice ? `recorded with the local voice (${config.voice}), the same as in the example` : "no local voice on this server; lessons use the browser voice or captions"}</span>
              </div>
              <span className="limits">The source text is sent to the model provider to build the lesson. The file and the finished lesson are stored on this server so the lesson can be reopened without generating it again; you can delete it from the lesson page.</span>
            </div>
          )}
        </>
      )}

      {stage !== "idle" && (
        <ol className="steps" aria-live="polite" data-upload-steps={stage}>
          <li className={stepClass("reading")}>
            <i aria-hidden="true">{mark("reading")}</i>
            <span>
              <strong>Reading the source</strong>
              <small>
                {info.name}
                {info.count ? ` · ${info.count} ${unit} · ${info.chars?.toLocaleString("en-US")} characters of text` : ""}
                {info.unreadable?.length ? ` · no readable text on ${one} ${info.unreadable.join(", ")}` : ""}
              </small>
            </span>
          </li>
          <li className={stepClass("inventory")}>
            <i aria-hidden="true">{mark("inventory")}</i>
            <span>
              <strong>Content inventory</strong>
              <small>{writing("inventory", models?.fast) ?? (info.entries ? `${info.entries} entries, ${info.matched} of them found word for word in the source` : "Every statement, figure and number with an exact quote and its place")}</small>
            </span>
          </li>
          <li className={stepClass("storyboard")}>
            <i aria-hidden="true">{mark("storyboard")}</i>
            <span>
              <strong>{isShort ? "The short: hook, key points, takeaway" : "Storyboard, narration and directions for the guide"}</strong>
              <small>{writing("storyboard", models?.strong) ?? (isShort ? "Five to seven scenes built only from the most important inventory entries; this usually takes under half a minute" : "Scenes built only from inventory entries; this usually takes one to two minutes")}</small>
            </span>
          </li>
          <li className={stepClass("checking")}>
            <i aria-hidden="true">{mark("checking")}</i>
            <span>
              <strong>Checking every scene</strong>
              <small>
                {checkedCount > 0
                  ? `${checkedCount} scenes checked${repaired ? ` · ${repaired} regenerated after a failed check` : ""}${flagged ? ` · ${flagged} still flagged` : ""}`
                  : info.cached.includes("checking")
                    ? "Kept from the earlier run"
                    : "Sources, numbers and claims; a scene that fails is regenerated on its own"}
              </small>
            </span>
          </li>
          {ORDER.includes("figures") && (
            <li className={stepClass("figures")}>
              <i aria-hidden="true">{mark("figures")}</i>
              <span>
                <strong>Original figures and tables</strong>
                <small>{stage === "figures" ? `${models?.vision ?? "Vision model"} is describing the cropped originals · ${elapsed} s` : "Up to two originals are cropped from the PDF and described by a vision model; numbers must also be in the page text"}</small>
              </span>
            </li>
          )}
          <li className={stepClass("voice")}>
            <i aria-hidden="true">{mark("voice")}</i>
            <span>
              <strong>Narration</strong>
              <small>{info.voice === "browser" ? "No local voice on this server: the lesson uses the browser voice or captions" : info.voiceTotal ? `${info.voiceDone ?? 0} of ${info.voiceTotal} scenes recorded with the local voice` : "Recorded scene by scene with the local voice"}</small>
            </span>
          </li>
          <li className={stepClass("saving")}>
            <i aria-hidden="true">{mark("saving")}</i>
            <span>
              <strong>Saving the lesson</strong>
              <small>Validated against the lesson format, then stored; playing it needs no model</small>
            </span>
          </li>
        </ol>
      )}

      {info.runs.length > 0 && (
        <div className="runs-wrap">
          <table className="runs" data-runs={info.runs.length}>
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
              {info.runs.map((r, k) => (
                <tr key={k}>
                  <td>{r.step}</td>
                  <td>{r.model}</td>
                  <td className="num">{(r.ms / 1000).toFixed(1)} s</td>
                  <td className="num">{r.inputTokens.toLocaleString("en-US")}</td>
                  <td className="num">{r.outputTokens.toLocaleString("en-US")}</td>
                  <td className="num">{r.costUsd === null ? "n/a" : `$${r.costUsd.toFixed(4)}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {busy && (
        <button type="button" className="btn btn--ghost" onClick={() => abort.current?.abort()} data-action="cancel">
          Stop
        </button>
      )}

      {stage === "done" && (
        <div className="alert alert--info" role="status" data-upload-state="done">
          <p>The lesson is saved. Opening it…</p>
        </div>
      )}

      {stage === "error" && failure && (
        <div className={`alert ${failure.code === "interrupted" ? "alert--warn" : "alert--error"}`} role="alert" data-upload-state="error" data-error-code={failure.code} data-resumable={failure.id ? "true" : "false"}>
          <h2>{failure.title}</h2>
          <p>{failure.help}</p>
          {failure.detail && (
            <p className="limits">
              Reason: {failure.detail} <code>{failure.code}</code>
            </p>
          )}
          {failure.code !== "interrupted" && <p>Live generation did not finish. The example lesson shows the complete flow with checked data and needs no model call.</p>}
          <div className="alert__actions">
            {failure.id && (
              <button type="button" className="btn btn--primary" onClick={() => resume(failure.id!)} data-action="resume">
                Resume from the last finished step
              </button>
            )}
            <Link href="/lesson/demo" className={`btn ${failure.id ? "" : "btn--primary"}`} data-action="fallback-example">
              Open the example instead
            </Link>
          </div>
        </div>
      )}

      {pageOver && !busy && (
        <div className={styles.pagedrop} data-page-drop>
          Drop the file to make {length === "short" ? "a short" : "a full lesson"}
        </div>
      )}

      {!busy && <Library heading="Lessons on this server" />}
    </main>
  );
}
