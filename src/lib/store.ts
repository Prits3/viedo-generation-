// File store for generated lessons. One directory per lesson:
//
//   <store>/<id>/job.json          progress of the generation (stage, runs, error)
//   <store>/<id>/source.json       the source blocks the lesson was built from
//   <store>/<id>/source.pdf        the uploaded PDF (PDF lessons); source.docx / source.pptx likewise
//   <store>/<id>/inventory.json    checkpoint: model draft of the inventory
//   <store>/<id>/storyboard.json   checkpoint: model draft of the storyboard
//   <store>/<id>/scenes.json       checkpoint: checked (and repaired) scenes
//   <store>/<id>/lesson.json       the finished, versioned lesson file
//   <store>/<id>/audio/*           narration per scene
//   <store>/<id>/fig-*.png         crops of original figures
//
// The checkpoints are what makes an interrupted run resumable without paying for finished steps.
// LESSON_STORE_DIR sets the location (default: .data/lessons, not committed).
// IDs are random; whoever knows an ID can open that lesson. There are no user accounts here.
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve, sep } from "node:path";
import { LessonFileSchema, type LessonFile } from "./lesson-file.ts";
import type { RunRecord } from "./providers.ts";
import type { ProviderId, Role } from "./models.ts";
import { GenerateError } from "./errors.ts";
import type { LessonMode } from "./limits.ts";

export const STAGES = ["reading", "inventory", "storyboard", "checking", "figures", "voice", "saving"] as const;
export type Stage = (typeof STAGES)[number];

export interface Job {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: "running" | "interrupted" | "failed" | "done";
  stage: Stage;
  /** Absent in jobs stored before short mode existed: those are full lessons. */
  mode?: LessonMode;
  /** `format` is what was uploaded (absent in older jobs: the same as `kind`). */
  input: { kind: "pdf" | "text"; format?: "pdf" | "text" | "docx" | "pptx"; name: string; hash?: string; chars?: number; count?: number };
  provider: ProviderId;
  models: Record<Role, string>;
  runs: RunRecord[];
  error?: { code: string; message: string };
  title?: string;
}

const ID = /^l-[a-z0-9]{8,24}$/;

/** Short content hash, used to name audio files after the sentences they speak. */
export const sha8 = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 8);

export function storeDir(): string {
  // On Vercel only /tmp is writable (and it is per instance, so generated lessons there are temporary).
  const fallback = process.env.VERCEL ? join(/*turbopackIgnore: true*/ "/tmp", "lessons") : join(/*turbopackIgnore: true*/ ".data", "lessons");
  return resolve(/*turbopackIgnore: true*/ process.env.LESSON_STORE_DIR || fallback);
}

/**
 * Bundled example lessons (committed, read-only): finished shorts with their narration and video,
 * so a deployment without model key, Piper, ffmpeg or a browser still has lessons to show.
 * The writable store wins when both hold the same ID.
 */
export function showcaseDir(): string {
  return resolve(/*turbopackIgnore: true*/ process.env.LESSON_SHOWCASE_DIR || join(/*turbopackIgnore: true*/ "showcase", "lessons"));
}

export function isShowcase(id: string): boolean {
  return validId(id) && !existsSync(/*turbopackIgnore: true*/ join(/*turbopackIgnore: true*/ storeDir(), id)) && existsSync(/*turbopackIgnore: true*/ join(/*turbopackIgnore: true*/ showcaseDir(), id));
}

function refuseShowcase(id: string): void {
  if (isShowcase(id)) throw new GenerateError("read_only", "This is a bundled example lesson; it cannot be changed.");
}

export function newId(): string {
  return "l-" + randomBytes(9).toString("base64url").toLowerCase().replace(/[^a-z0-9]/g, "x").slice(0, 12);
}

export function validId(id: string): boolean {
  return ID.test(id);
}

function dirOf(id: string): string {
  if (!validId(id)) throw new GenerateError("not_found", "Invalid lesson ID.");
  return join(/*turbopackIgnore: true*/ isShowcase(id) ? showcaseDir() : storeDir(), id);
}

/** Resolves a file inside a lesson directory and refuses anything that escapes it. */
export function pathIn(id: string, rel: string): string {
  const base = dirOf(id);
  const full = resolve(/*turbopackIgnore: true*/ base, rel);
  if (full !== base && !full.startsWith(base + sep)) throw new GenerateError("not_found", "Invalid path.");
  return full;
}

export function has(id: string, rel: string): boolean {
  return validId(id) && existsSync(/*turbopackIgnore: true*/ pathIn(id, rel));
}

export function writeBytes(id: string, rel: string, data: Uint8Array | string): void {
  refuseShowcase(id);
  const full = pathIn(id, rel);
  mkdirSync(/*turbopackIgnore: true*/ join(/*turbopackIgnore: true*/ full, ".."), { recursive: true });
  // Write-then-rename, so a crash never leaves a half-written checkpoint.
  const tmp = `${full}.${process.pid}.tmp`;
  writeFileSync(/*turbopackIgnore: true*/ tmp, data);
  renameSync(/*turbopackIgnore: true*/ tmp, full);
}

export function writeJson(id: string, rel: string, data: unknown): void {
  writeBytes(id, rel, JSON.stringify(data));
}

export function readJson<T>(id: string, rel: string): T | null {
  if (!has(id, rel)) return null;
  try {
    return JSON.parse(readFileSync(/*turbopackIgnore: true*/ pathIn(id, rel), "utf8")) as T;
  } catch {
    return null;
  }
}

export function readBytes(id: string, rel: string): Buffer | null {
  return has(id, rel) ? readFileSync(/*turbopackIgnore: true*/ pathIn(id, rel)) : null;
}

export function saveJob(job: Job): void {
  job.updatedAt = new Date().toISOString();
  writeJson(job.id, "job.json", job);
}

export function loadJob(id: string): Job | null {
  return validId(id) ? readJson<Job>(id, "job.json") : null;
}

/** Validates and writes the lesson file. Throws if the lesson does not match the format. */
export function saveLesson(file: LessonFile): void {
  const parsed = LessonFileSchema.safeParse(file);
  if (!parsed.success) throw new GenerateError("invalid_model_output", `The lesson did not match the lesson format (${parsed.error.issues[0]?.path.join(".")}: ${parsed.error.issues[0]?.message}).`);
  writeJson(file.lesson.id, "lesson.json", file);
}

/** Loads and validates a stored lesson. Null when missing or not a valid lesson file. */
export function loadLesson(id: string): LessonFile | null {
  const raw = validId(id) ? readJson<unknown>(id, "lesson.json") : null;
  if (!raw) return null;
  const parsed = LessonFileSchema.safeParse(raw);
  return parsed.success ? (raw as LessonFile) : null;
}

export interface LessonSummary {
  id: string;
  title: string;
  kind: "pdf" | "text";
  format: "pdf" | "text" | "docx" | "pptx";
  mode: LessonMode;
  /** Playing time in seconds, for finished lessons. */
  seconds?: number;
  status: Job["status"];
  stage: Stage;
  updatedAt: string;
  scenes?: number;
  voice?: string;
  /** A bundled example (read-only). */
  example?: boolean;
}

function idsIn(root: string): string[] {
  if (!existsSync(/*turbopackIgnore: true*/ root)) return [];
  return readdirSync(/*turbopackIgnore: true*/ root).filter((id) => validId(id) && statSync(/*turbopackIgnore: true*/ join(/*turbopackIgnore: true*/ root, id)).isDirectory());
}

export function listLessons(): LessonSummary[] {
  // There are no accounts: on a public deployment the list would show every visitor's lessons to
  // everyone. There it lists the examples only; a visitor's own lesson stays reachable by its link.
  // LESSON_LIST_ALL=1 lists everything anyway (a private deployment).
  const listOwn = !process.env.VERCEL || process.env.LESSON_LIST_ALL === "1";
  const own = listOwn ? idsIn(storeDir()) : [];
  const examples = idsIn(showcaseDir()).filter((id) => !own.includes(id));
  const out: LessonSummary[] = [];
  for (const id of [...own, ...examples]) {
    const job = loadJob(id);
    if (!job) continue;
    const file = job.status === "done" ? loadLesson(id) : null;
    const scenes = file ? [...file.lesson.intro.scenes, ...file.lesson.chapters.flatMap((c) => c.scenes)] : [];
    out.push({
      id,
      title: file?.lesson.meta.title ?? job.title ?? job.input.name,
      kind: job.input.kind,
      format: job.input.format ?? job.input.kind,
      mode: file?.provenance.mode ?? job.mode ?? "full",
      seconds: file ? Math.round(scenes.reduce((s, sc) => s + (sc.duration ?? 0), 0)) : undefined,
      status: job.status === "done" && !file ? "failed" : job.status,
      stage: job.stage,
      updatedAt: job.updatedAt,
      scenes: file ? scenes.length : undefined,
      voice: file?.provenance.voice,
      ...(examples.includes(id) ? { example: true } : {}),
    });
  }
  // Own lessons first (newest first), then the examples.
  return out.sort((a, b) => Number(!!a.example) - Number(!!b.example) || b.updatedAt.localeCompare(a.updatedAt)).slice(0, 50);
}

export function removeLesson(id: string): boolean {
  if (!validId(id) || isShowcase(id) || !existsSync(/*turbopackIgnore: true*/ dirOf(id))) return false;
  rmSync(/*turbopackIgnore: true*/ dirOf(id), { recursive: true, force: true });
  return true;
}
