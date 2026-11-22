// Server side of "Export video": starts scripts/export-video.mjs as its own process and reads the
// status file that script keeps up to date. The export itself (headless browser, ffmpeg) lives in
// the script, so the command line and the app produce the same file the same way.
import { spawn, type ChildProcess } from "node:child_process";
import { closeSync, mkdirSync, openSync } from "node:fs";
import { join } from "node:path";
import { has, isHosted, isShowcase,loadLesson, pathIn, readJson, storeDir, writeJson } from "./store.ts";
import { ERROR_TEXT } from "./limits.ts";
import { planVideo, scenesWithoutNarration, VIDEO_FORMATS, type VideoFormat } from "./video-plan.ts";

export interface ExportStatus {
  state: "none" | "running" | "done" | "failed";
  format: VideoFormat;
  stage?: string;
  frame?: number;
  frames?: number;
  /** Length of the video in seconds. */
  seconds?: number;
  bytes?: number;
  error?: string;
  /** Lesson revision the video was made from. */
  revision?: number;
  startedAt?: string;
  updatedAt?: string;
  wallMs?: number;
  /** False when the lesson was changed after this video was made. */
  current?: boolean;
}

export const isFormat = (v: string | null): v is VideoFormat => v !== null && Object.hasOwn(VIDEO_FORMATS, v);

// One export at a time: it uses several browser pages and all processor cores.
let active: { child: ChildProcess; id: string; format: VideoFormat } | null = null;

export function exportStatus(id: string, format: VideoFormat): ExportStatus {
  const raw = readJson<ExportStatus & { pid?: number }>(id, `export/${format}.status.json`);
  if (!raw) return { state: "none", format };
  const { pid: _pid, ...status } = raw;
  // The script writes the file every two seconds while it runs.
  if (status.state === "running" && Date.now() - Date.parse(status.updatedAt ?? "") > 20000) return { ...status, state: "failed", error: "The export stopped before it was finished (the export process or the server was closed). Start it again." };
  if (status.state === "done" && !has(id, `export/${format}.mp4`)) return { state: "none", format };
  return { ...status, format, current: status.revision === loadLesson(id)?.revision };
}

export type StartResult = { ok: true; status: ExportStatus } | { ok: false; code: number; title: string; help: string };

export function startExport(id: string, format: VideoFormat): StartResult {
  const file = loadLesson(id);
  if (!file) return { ok: false, code: 404, title: "Lesson not found", help: "This lesson is not in the lesson store." };
  if (isShowcase(id)) {
    const ready = exportStatus(id, format);
    if (ready.state === "done") return { ok: true, status: ready };
    return { ok: false, code: 409, title: ERROR_TEXT.read_only.title, help: "Only the vertical video comes with this example. Other formats are exported from your own lessons, in the app running locally." };
  }
  if (isHosted()) return { ok: false, code: 501, title: "Video export runs in the local app", help: "Rendering an MP4 needs ffmpeg and a headless browser, which this hosted version does not have. Run the app locally (npm run build && npm start) to export." };
  const silent = scenesWithoutNarration(planVideo(file.lesson));
  if (silent.length)
    return {
      ok: false,
      code: 409,
      title: "This lesson has no recorded narration",
      help: `${silent.length} scene${silent.length > 1 ? "s have" : " has"} no recording. A video is only exported with its narration, not silent. Generate the lesson with the Piper voice set up, then export again.`,
    };
  const now = exportStatus(id, format);
  if (now.state === "running") return { ok: true, status: now };
  if (active) return { ok: false, code: 429, title: "Another export is running", help: "One video is rendered at a time. Try again when it is finished." };

  const port = process.env.PORT || "3000";
  mkdirSync(/*turbopackIgnore: true*/ pathIn(id, "export"), { recursive: true });
  const first: ExportStatus = { state: "running", format, stage: "starting", frame: 0, frames: 0, revision: file.revision, startedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  writeJson(id, `export/${format}.status.json`, first);
  const log = openSync(/*turbopackIgnore: true*/ pathIn(id, `export/${format}.log`), "w");
  const script = join(/*turbopackIgnore: true*/ process.cwd(), "scripts", "export-video.mjs");
  const child = spawn(process.execPath, [script, id, "--format", format, "--base", `http://localhost:${port}`], {
    cwd: /*turbopackIgnore: true*/ process.cwd(),
    env: { ...process.env, LESSON_STORE_DIR: storeDir() },
    stdio: ["ignore", log, log],
    windowsHide: true,
  });
  closeSync(log);
  active = { child, id, format };
  const release = () => {
    if (active?.child === child) active = null;
  };
  child.on("error", () => {
    release();
    writeJson(id, `export/${format}.status.json`, { ...first, state: "failed", error: "The export process could not be started on this server.", updatedAt: new Date().toISOString() });
  });
  child.on("close", release);
  return { ok: true, status: first };
}
