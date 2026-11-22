"use client";

// "Export video" for a stored lesson: starts the export on the server, shows its progress and
// offers the finished MP4 and the post text. Rendering is not instant: every frame of the video
// is drawn by a headless browser on the server, which takes a minute or more.
import { useEffect, useMemo, useState } from "react";
import type { Lesson } from "@/lib/types";
import { formatTime } from "@/lib/labels";
import { planVideo, scenesWithoutNarration, VIDEO_FORMATS, type VideoFormat } from "@/lib/video-plan";
import styles from "./ExportVideo.module.css";

interface Status {
  state: "none" | "running" | "done" | "failed";
  stage?: string;
  frame?: number;
  frames?: number;
  seconds?: number;
  bytes?: number;
  error?: string;
  startedAt?: string;
  wallMs?: number;
  current?: boolean;
}

const FORMAT_LABEL: Record<VideoFormat, string> = { vertical: "Vertical 9:16 (TikTok, Reels, Shorts)", landscape: "Landscape 16:9" };

export function ExportVideo({ id, lesson }: { id: string; lesson: Lesson }) {
  const [format, setFormat] = useState<VideoFormat>("vertical");
  const [loaded, setLoaded] = useState<{ format: VideoFormat; status: Status } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  // Increased when an export was started, so the effect below begins to ask for its progress.
  const [watch, setWatch] = useState(0);
  const plan = useMemo(() => planVideo(lesson), [lesson]);
  const silent = scenesWithoutNarration(plan).length;
  const size = VIDEO_FORMATS[format];
  const status = loaded?.format === format ? loaded.status : null;

  // Look for an earlier export, and keep asking while one is running.
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      const res = await fetch(`/api/lessons/${id}/export?format=${format}`).catch(() => null);
      const body = res?.ok ? ((await res.json().catch(() => null)) as Status | null) : null;
      if (!alive) return;
      if (body) setLoaded({ format, status: body });
      // A request that failed is tried again; a finished or failed export ends the loop.
      if (!body || body.state === "running") timer = setTimeout(poll, body ? 1500 : 4000);
    };
    poll();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [id, format, watch]);

  const start = async () => {
    setProblem(null);
    try {
      const res = await fetch(`/api/lessons/${id}/export?format=${format}`, { method: "POST" });
      const body = await res.json();
      if (!res.ok) return setProblem(`${body.title ?? "The export could not be started"}. ${body.help ?? ""}`);
      setLoaded({ format, status: body });
      setWatch((n) => n + 1);
    } catch {
      setProblem("The export could not be started: the server did not answer.");
    }
  };

  const running = status?.state === "running";
  const done = status?.state === "done";
  const drawing = running && status.frames ? status.frame ?? 0 : 0;
  const elapsed = running && status.startedAt ? (Date.now() - Date.parse(status.startedAt)) / 1000 : 0;
  const left = drawing > 30 && status?.frames ? Math.ceil(((status.frames - drawing) * elapsed) / drawing) : null;

  return (
    <div className={styles.box} data-export-state={status?.state ?? "loading"}>
      <div className={styles.row}>
        <strong>Video for sharing</strong>
        <label className={styles.format}>
          <span className="sr-only">Video format</span>
          <select value={format} onChange={(e) => setFormat(e.target.value as VideoFormat)} disabled={running}>
            {(Object.keys(FORMAT_LABEL) as VideoFormat[]).map((f) => (
              <option key={f} value={f}>
                {FORMAT_LABEL[f]}
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="btn btn--small" onClick={start} disabled={running || silent > 0} data-action="export-video">
          {running ? "Exporting…" : done ? "Export again" : "Export video"}
        </button>
        {done && (
          <>
            <a className="btn btn--primary btn--small" href={`/api/lessons/${id}/export/${format}.mp4`} download data-action="download-video">
              Download MP4{status.bytes ? ` (${(status.bytes / 1e6).toFixed(1)} MB)` : ""}
            </a>
            <a className="btn btn--ghost btn--small" href={`/api/lessons/${id}/export/caption.txt`} download data-action="download-caption">
              Post text
            </a>
          </>
        )}
      </div>
      {running && (
        <div className={styles.progress} role="status">
          <progress max={status.frames || 1} value={status.frames ? drawing : undefined} />
          <span>
            {status.frames
              ? status.stage === "encoding"
                ? "Adding the narration and writing the file…"
                : `Drawing frame ${drawing.toLocaleString("en-US")} of ${status.frames.toLocaleString("en-US")}${left !== null ? ` · about ${left < 90 ? `${left} s` : `${Math.ceil(left / 60)} min`} left` : ""}`
              : "Starting the browser that draws the frames…"}
          </span>
        </div>
      )}
      <p className={styles.note}>
        {silent > 0
          ? `This lesson cannot be exported: ${silent} of ${plan.scenes.length} scenes have no recorded narration, and a video is not exported silent.`
          : done
            ? `${formatTime(status.seconds ?? plan.duration)} min, ${size.width} × ${size.height}, with narration, captions and a source label on every sentence${status.wallMs ? `; rendered in ${Math.round(status.wallMs / 1000)} s` : ""}.${status.current === false ? " The lesson was changed after this video was made: export again to include the change." : ""}`
            : `${formatTime(plan.duration)} min, ${size.width} × ${size.height} MP4 with narration, captions and a source label on every sentence. Every frame is drawn on this server, which can take a minute or more; the page can stay open or be reloaded meanwhile.`}
      </p>
      {status?.state === "failed" && <p className={`${styles.note} ${styles.bad}`} role="alert">The export failed: {status.error ?? "unknown reason"}</p>}
      {problem && <p className={`${styles.note} ${styles.bad}`} role="alert">{problem}</p>}
    </div>
  );
}
