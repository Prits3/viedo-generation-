"use client";

// Resource-to-video demo (frontend prototype).
// Add resources (URLs or uploaded files) → "Generate video" → a prepared lesson video
// shown beside the resources you added and a fixed "Related research" list.
//
// This is a demo: the same prepared video appears for every submission, and nothing the
// user adds is analysed. Files are held in browser memory only, never uploaded.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

/* ──────────────────────────────────────────────────────────────────────────
   CONFIGURATION — replace the prepared video here.
   Either a path to an MP4 served from /public (e.g. "/mp4/lesson.mp4")
   or a YouTube link (e.g. "https://www.youtube.com/watch?v=XXXXXXXXXXX").
   Leave as an empty string to show the designed placeholder.
   ────────────────────────────────────────────────────────────────────────── */
const PREPARED_VIDEO_URL = "/mp4/lesson.mp4";

const LESSON_TITLE = "From your resources to a narrated lesson";
const LESSON_DESCRIPTION =
  "A short, visual walkthrough that turns dense source material into a lesson you can follow at your own pace. This is a prepared demo clip — the same video is shown for every set of resources.";

// Fixed references, shown as related reading after every generation.
// These are not retrieved from the user's resources and the video does not cite them.
const RELATED_RESEARCH: { title: string; authors: string; url: string }[] = [
  {
    title: "Bitcoin: A Peer-to-Peer Electronic Cash System",
    authors: "Satoshi Nakamoto",
    url: "https://bitcoin.org/bitcoin.pdf",
  },
  {
    title: "On Bitcoin and Red Balloons",
    authors: "Babaioff, Dobzinski, Oren & Zohar",
    url: "https://www.microsoft.com/en-us/research/publication/on-bitcoin-and-red-balloons/",
  },
];

const ACCEPTED_EXTENSIONS = [".pdf", ".docx", ".txt", ".pptx"];
const ACCEPT_ATTR =
  ".pdf,.docx,.txt,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,application/vnd.openxmlformats-officedocument.presentationml.presentation";

type View = "input" | "loading" | "lesson";

interface Resource {
  id: string;
  kind: "file" | "url";
  name: string; // filename or URL
  detail?: string; // e.g. file size or host
}

const newId = () => Math.random().toString(36).slice(2, 10);

function fileExtensionOk(name: string): boolean {
  const lower = name.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function normaliseUrl(raw: string): URL | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (!url.hostname.includes(".")) return null;
    return url;
  } catch {
    return null;
  }
}

// Returns a YouTube embed URL, or null when the configured value is not a YouTube link.
function youTubeEmbedUrl(value: string): string | null {
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, "");
    if (host === "youtu.be") {
      const id = url.pathname.slice(1);
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (host === "youtube.com" || host === "m.youtube.com") {
      if (url.pathname === "/watch") {
        const id = url.searchParams.get("v");
        return id ? `https://www.youtube.com/embed/${id}` : null;
      }
      if (url.pathname.startsWith("/embed/")) return value;
    }
    return null;
  } catch {
    return null;
  }
}

export function ResourceVideoDemo() {
  const [view, setView] = useState<View>("input");
  const [resources, setResources] = useState<Resource[]>([]);
  const [urlInput, setUrlInput] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const loadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (loadTimer.current) clearTimeout(loadTimer.current);
    },
    [],
  );

  function addFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList);
    if (files.length === 0) return;
    const accepted: Resource[] = [];
    const rejected: string[] = [];
    for (const file of files) {
      if (fileExtensionOk(file.name)) {
        accepted.push({ id: newId(), kind: "file", name: file.name, detail: formatSize(file.size) });
      } else {
        rejected.push(file.name);
      }
    }
    if (accepted.length) setResources((prev) => [...prev, ...accepted]);
    setFileError(
      rejected.length ? `Not added — unsupported file type: ${rejected.join(", ")}. Use PDF, DOCX, TXT or PPTX.` : null,
    );
  }

  function addUrl() {
    const url = normaliseUrl(urlInput);
    if (!url) {
      setUrlError("Enter a valid link, e.g. https://example.com/paper.pdf");
      return;
    }
    const href = url.toString();
    if (resources.some((r) => r.kind === "url" && r.name === href)) {
      setUrlError("That link has already been added.");
      return;
    }
    setResources((prev) => [...prev, { id: newId(), kind: "url", name: href, detail: url.hostname.replace(/^www\./, "") }]);
    setUrlInput("");
    setUrlError(null);
  }

  function removeResource(id: string) {
    setResources((prev) => prev.filter((r) => r.id !== id));
  }

  function generate() {
    if (resources.length === 0 || view === "loading") return;
    setView("loading");
    loadTimer.current = setTimeout(() => setView("lesson"), 2200);
  }

  function backToInput() {
    if (loadTimer.current) clearTimeout(loadTimer.current);
    setView("input");
  }

  /* ── Lesson view ── */
  if (view === "lesson") {
    return (
      <main className="rvd">
        <div className="rvd__head">
          <button type="button" className="back" onClick={backToInput}>
            ← Edit resources
          </button>
          <div className="rvd__title">
            <h1>{LESSON_TITLE}</h1>
            <p>{LESSON_DESCRIPTION}</p>
          </div>
          <span className="rvd__demo-tag" aria-label="This is a prepared demo lesson">
            Demo · Prepared lesson
          </span>
        </div>

        <div className="rvd__grid">
          <section className="rvd__main" aria-label="Prepared lesson video">
            <VideoPlayer />
          </section>

          <aside className="rvd__side">
            <section className="rvd__panel" aria-labelledby="rvd-your-resources">
              <h2 id="rvd-your-resources" className="rvd__panel-title">
                Your resources <span className="count">{resources.length}</span>
              </h2>
              <ul className="rvd__reslist">
                {resources.map((r) => (
                  <li key={r.id} className="rvd__resitem rvd__resitem--static">
                    <span className={`rvd__restype rvd__restype--${r.kind}`} aria-hidden="true">
                      {r.kind === "url" ? "link" : "file"}
                    </span>
                    <span className="rvd__resname">
                      {r.kind === "url" ? (
                        <a href={r.name} target="_blank" rel="noopener noreferrer">
                          {r.name}
                        </a>
                      ) : (
                        r.name
                      )}
                      {r.detail && <small>{r.detail}</small>}
                    </span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="rvd__panel" aria-labelledby="rvd-related">
              <h2 id="rvd-related" className="rvd__panel-title">
                Related research
              </h2>
              <p className="rvd__panel-note">Related reading, shown for every lesson. Not retrieved from your resources.</p>
              <ul className="rvd__refs">
                {RELATED_RESEARCH.map((ref) => (
                  <li key={ref.url}>
                    <a className="rvd__ref" href={ref.url} target="_blank" rel="noopener noreferrer">
                      <strong>{ref.title}</strong>
                      <small>{ref.authors}</small>
                      <span className="rvd__ref-link">Open ↗</span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          </aside>
        </div>
      </main>
    );
  }

  /* ── Loading view ── */
  if (view === "loading") {
    return (
      <main className="rvd rvd--loading" role="status" aria-live="polite">
        <div className="rvd__loader">
          <span className="rvd__spinner" aria-hidden="true" />
          <strong>Preparing your lesson…</strong>
          <small>Composing the video view from your {resources.length} resource{resources.length === 1 ? "" : "s"}.</small>
        </div>
      </main>
    );
  }

  /* ── Input view ── */
  const canGenerate = resources.length > 0;
  return (
    <main className="rvd rvd--input">
      <Link href="/" className="back">
        ← Start
      </Link>
      <header className="rvd__intro">
        <h1>Turn your resources into a lesson video</h1>
        <p className="lead">
          Add the papers, articles or documents you want to learn from, then generate a narrated video lesson shown
          alongside related research.
        </p>
        <span className="rvd__demo-tag rvd__demo-tag--inline">Demo · Prepared lesson</span>
      </header>

      <section aria-labelledby="rvd-add-files">
        <h2 id="rvd-add-files" className="rvd__section-title">
          Upload documents
        </h2>
        <label
          className={`drop ${dragOver ? "is-over" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
          }}
        >
          <strong>Drop files here or choose from your device</strong>
          <input
            type="file"
            multiple
            accept={ACCEPT_ATTR}
            onChange={(e) => {
              if (e.target.files?.length) addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <span className="limits">PDF, DOCX, TXT or PPTX · held in your browser only, not uploaded or analysed</span>
        </label>
        {fileError && (
          <p className="rvd__field-error" role="alert">
            {fileError}
          </p>
        )}
      </section>

      <section aria-labelledby="rvd-add-link">
        <h2 id="rvd-add-link" className="rvd__section-title">
          Add a link
        </h2>
        <form
          className="rvd__urlrow"
          onSubmit={(e) => {
            e.preventDefault();
            addUrl();
          }}
        >
          <label className="sr-only" htmlFor="rvd-url">
            Paste a link to a paper, article or resource
          </label>
          <input
            id="rvd-url"
            className="rvd__urlinput"
            type="url"
            inputMode="url"
            placeholder="https://example.com/paper.pdf"
            value={urlInput}
            aria-invalid={urlError ? true : undefined}
            aria-describedby={urlError ? "rvd-url-error" : undefined}
            onChange={(e) => {
              setUrlInput(e.target.value);
              if (urlError) setUrlError(null);
            }}
          />
          <button type="submit" className="btn btn--primary">
            Add link
          </button>
        </form>
        {urlError && (
          <p className="rvd__field-error" id="rvd-url-error" role="alert">
            {urlError}
          </p>
        )}
      </section>

      <section aria-labelledby="rvd-list">
        <h2 id="rvd-list" className="rvd__section-title">
          Added resources <span className="count">{resources.length}</span>
        </h2>
        {resources.length === 0 ? (
          <p className="rvd__empty">No resources yet. Upload a document or add a link to get started.</p>
        ) : (
          <ul className="rvd__reslist">
            {resources.map((r) => (
              <li key={r.id} className="rvd__resitem">
                <span className={`rvd__restype rvd__restype--${r.kind}`} aria-hidden="true">
                  {r.kind === "url" ? "link" : "file"}
                </span>
                <span className="rvd__resname">
                  {r.kind === "url" ? (
                    <a href={r.name} target="_blank" rel="noopener noreferrer">
                      {r.name}
                    </a>
                  ) : (
                    r.name
                  )}
                  {r.detail && <small>{r.detail}</small>}
                </span>
                <button
                  type="button"
                  className="rvd__remove"
                  onClick={() => removeResource(r.id)}
                  aria-label={`Remove ${r.name}`}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="rvd__generate">
        <button type="button" className="btn btn--primary btn--large" disabled={!canGenerate} onClick={generate}>
          Generate video
        </button>
        {!canGenerate && <span className="limits">Add at least one resource to generate the lesson.</span>}
      </div>
    </main>
  );
}

function VideoPlayer() {
  const embed = PREPARED_VIDEO_URL ? youTubeEmbedUrl(PREPARED_VIDEO_URL) : null;

  if (!PREPARED_VIDEO_URL) {
    return (
      <div className="rvd__video rvd__video--placeholder" role="img" aria-label="Prepared video not yet configured">
        <span className="rvd__play" aria-hidden="true" />
        <strong>Prepared video not configured</strong>
        <small>Set PREPARED_VIDEO_URL in ResourceVideoDemo.tsx to an MP4 path or YouTube link.</small>
      </div>
    );
  }

  if (embed) {
    return (
      <div className="rvd__video">
        <iframe
          src={embed}
          title="Prepared lesson video"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
      </div>
    );
  }

  return (
    <div className="rvd__video">
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <video src={PREPARED_VIDEO_URL} controls playsInline preload="metadata">
        Your browser does not support embedded video.
      </video>
    </div>
  );
}
