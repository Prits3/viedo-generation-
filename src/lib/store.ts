// File store for generated lessons. One directory per lesson:
//
//   <store>/<id>/job.json          progress of the generation (stage, runs, error)
//   <store>/<id>/source.json       the source blocks the lesson was built from
//   <store>/<id>/source.pdf        the uploaded PDF (PDF lessons)
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

export const STAGES = ["reading", "inventory", "storyboard", "checking", "figures", "voice", "saving"] as const;
export type Stage = (typeof STAGES)[number];

export interface Job {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: "running" | "interrupted" | "failed" | "done";
  stage: Stage;
  input: { kind: "pdf" | "text"; name: string; hash?: string; chars?: number; count?: number };
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
  return resolve(/*turbopackIgnore: true*/ process.env.LESSON_STORE_DIR || join(/*turbopackIgnore: true*/ ".data", "lessons"));
}

export function newId(): string {
  return "l-" + randomBytes(9).toString("base64url").toLowerCase().replace(/[^a-z0-9]/g, "x").slice(0, 12);
}

export function validId(id: string): boolean {
  return ID.test(id);
}

function dirOf(id: string): string {
  if (!validId(id)) throw new GenerateError("not_found", "Invalid lesson ID.");
  return join(/*turbopackIgnore: true*/ storeDir(), id);
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
  status: Job["status"];
  stage: Stage;
  updatedAt: string;
  scenes?: number;
  voice?: string;
}

export function listLessons(): LessonSummary[] {
  const root = storeDir();
  if (!existsSync(/*turbopackIgnore: true*/ root)) return [];
  const out: LessonSummary[] = [];
  for (const id of readdirSync(/*turbopackIgnore: true*/ root)) {
    if (!validId(id) || !statSync(/*turbopackIgnore: true*/ join(/*turbopackIgnore: true*/ root, id)).isDirectory()) continue;
    const job = loadJob(id);
    if (!job) continue;
    const file = job.status === "done" ? loadLesson(id) : null;
    out.push({
      id,
      title: file?.lesson.meta.title ?? job.title ?? job.input.name,
      kind: job.input.kind,
      status: job.status === "done" && !file ? "failed" : job.status,
      stage: job.stage,
      updatedAt: job.updatedAt,
      scenes: file ? file.lesson.intro.scenes.length + file.lesson.chapters.reduce((n, c) => n + c.scenes.length, 0) : undefined,
      voice: file?.provenance.voice,
    });
  }
  return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 50);
}

export function removeLesson(id: string): boolean {
  if (!validId(id) || !existsSync(/*turbopackIgnore: true*/ dirOf(id))) return false;
  rmSync(/*turbopackIgnore: true*/ dirOf(id), { recursive: true, force: true });
  return true;
}
