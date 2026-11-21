// The generation pipeline, the same for every input:
//
//   input -> source blocks -> content inventory -> storyboard -> checked scenes -> figures -> voice -> lesson file
//
// Each step writes a checkpoint into the lesson's directory. A run that was interrupted or failed
// is resumed from its last checkpoint; finished model calls are not repeated. A single scene can
// be regenerated later without touching the others.
import type { Chapter, InventoryItem, Lesson, Scene } from "./types.ts";
import type { InventoryDraft, StoryboardDraft } from "./lesson-schema.ts";
import { GenerateError } from "./errors.ts";
import { LIMITS } from "./limits.ts";
import { PROMPT_VERSION, modelsFor, type ProviderId } from "./models.ts";
import type { RunRecord } from "./providers.ts";
import { sourceFromPdf, sourceFromText, type SourceDoc } from "./source.ts";
import { buildInventory, buildStoryboard, checkClaims, readFigure, repairScene } from "./generate.ts";
import { autoVerification, chaptersFromStoryboard, inventoryFromDraft, regroup, sceneFromDraft, type SceneContext } from "./assemble.ts";
import { checkScene } from "./check.ts";
import { sceneRefs } from "./coverage.ts";
import { timeScene, type SceneTiming } from "./timing.ts";
import { narrateScene, voiceSetup } from "./voice.ts";
import { cropPng, locateInText, pageLines, renderPdfPage } from "./figures.ts";
import { LESSON_FORMAT, LESSON_VERSION, runTotals, type LessonFile } from "./lesson-file.ts";
import { has, loadJob, loadLesson, newId, pathIn, readBytes, readJson, saveJob, saveLesson, sha8, writeBytes, writeJson, type Job, type Stage } from "./store.ts";
import { locLabel } from "./labels.ts";
import { wordCount } from "./text.ts";

export type Emit = (event: Record<string, unknown>) => void;

interface Checked {
  intro: Chapter;
  chapters: Chapter[];
  figuresDone: boolean;
  notes: string[];
}
interface AudioMeta {
  hash: string;
  file: string;
  timing: SceneTiming;
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);
const assetUrl = (id: string, rel: string) => `/api/lessons/${id}/asset/${rel}`;
const DRAFTABLE: Scene["type"][] = ["question", "statement", "points", "flow", "milestones", "comparison"];

export function createJob(input: { kind: "pdf"; name: string; bytes: Uint8Array } | { kind: "text"; name: string; text: string }, provider: ProviderId): Job {
  const id = newId();
  const now = new Date().toISOString();
  const job: Job = { id, createdAt: now, updatedAt: now, status: "running", stage: "reading", input: { kind: input.kind, name: input.name }, provider, models: modelsFor(provider), runs: [] };
  if (input.kind === "pdf") writeBytes(id, "source.pdf", input.bytes);
  else writeBytes(id, "input.txt", input.text);
  saveJob(job);
  return job;
}

/** Inventory entries a scene may draw on when it is rewritten: its own, and their neighbours in the source. */
function entriesFor(scene: Scene, inventory: InventoryItem[]): InventoryItem[] {
  const own = new Set(sceneRefs(scene).map((r) => r.ref));
  const pages = new Set(inventory.filter((it) => own.has(it.id)).map((it) => it.source.page));
  const usable = inventory.filter((it) => it.status !== "unclear");
  const near = usable.filter((it) => own.has(it.id) || (pages.has(it.source.page) && it.status !== "external"));
  const pool = near.length >= 3 ? near : usable.filter((it) => (it.planned ?? it.place) === "intro" || (it.planned ?? it.place) === "chapter");
  return pool.slice(0, 60);
}

async function narrate(id: string, scene: Scene, signal?: AbortSignal): Promise<AudioMeta | null> {
  const setup = voiceSetup();
  if (!setup) return null;
  const sentences = scene.cues.map((c) => c.say ?? c.text);
  const hash = sha8(sentences.join("\n"));
  const meta = readJson<AudioMeta>(id, `audio/${scene.id}.json`);
  if (meta && meta.hash === hash && has(id, meta.file)) return meta;
  const { file, timing } = await narrateScene(setup, sentences, pathIn(id, `audio/${scene.id}-${hash}`), signal);
  const out: AudioMeta = { hash, file: `audio/${scene.id}-${hash}${file.endsWith(".mp3") ? ".mp3" : ".wav"}`, timing };
  writeJson(id, `audio/${scene.id}.json`, out);
  return out;
}

function finishLesson(id: string, source: SourceDoc, meta: InventoryDraft, inventory: InventoryItem[], checked: Checked, audio: Map<string, AudioMeta>): Lesson {
  const time = (sc: Scene) => {
    const a = audio.get(sc.id);
    return timeScene(sc, a?.timing, a ? assetUrl(id, a.file) : undefined);
  };
  const intro = { ...checked.intro, scenes: checked.intro.scenes.map(time) };
  const chapters = checked.chapters.map((c) => ({ ...c, scenes: c.scenes.map(time) }));
  const { details, appendix } = regroup(inventory, intro, chapters);
  const all = [...intro.scenes, ...chapters.flatMap((c) => c.scenes)];
  const lesson: Lesson = {
    id,
    origin: "upload",
    meta: {
      title: clip(meta.title || source.name, 200),
      authors: clip(meta.authors, 200),
      venue: clip(meta.venue, 120),
      year: clip(meta.year, 12),
      pdfUrl: source.kind === "pdf" ? assetUrl(id, "source.pdf") : "",
      pages: source.count,
      sourceKind: source.kind,
    },
    inventory,
    intro,
    chapters,
    details,
    appendix,
    pageStatus: source.pageStatus,
    verification: { mode: "auto", fullyChecked: false, method: "", quoteChecks: { total: 0, matched: 0, failed: [] }, notes: [] },
    hasRecordedVoice: all.length > 0 && all.every((s) => s.audio),
    sourceBlocks: source.blocks,
  };
  lesson.verification = autoVerification(lesson);
  lesson.verification.notes.push(...checked.notes);
  return lesson;
}

// ───────────────────────── original figures and tables (vision) ─────────────────────────
async function addFigures(id: string, source: SourceDoc, inventory: InventoryItem[], checked: Checked, provider: ProviderId, runs: RunRecord[], emit: Emit, signal?: AbortSignal): Promise<void> {
  const pdf = readBytes(id, "source.pdf");
  if (!pdf) return;
  const used = new Set([...checked.intro.scenes, ...checked.chapters.flatMap((c) => c.scenes)].flatMap((s) => sceneRefs(s).map((r) => r.ref)));
  const candidates = inventory
    .filter((it) => (it.type === "figure" || it.type === "table") && it.status === "matched" && it.source.page > 0)
    .sort((a, b) => Number(used.has(b.id)) - Number(used.has(a.id)))
    .slice(0, LIMITS.maxFigures * 3);
  const byId = new Map(inventory.map((it) => [it.id, it]));
  let n = 0;
  const taken: { page: number; y: number; h: number }[] = [];
  for (const it of candidates) {
    if (n >= LIMITS.maxFigures) break;
    try {
      const page = await renderPdfPage(new Uint8Array(pdf), it.source.page);
      if (!page) {
        checked.notes.push("Original figures were not added: page rendering is not available on this server.");
        return;
      }
      // Where the object is comes from the PDF text layer (exact); what it shows comes from the vision model.
      const box = locateInText(await pageLines(new Uint8Array(pdf), it.source.page), it.source.quote ?? "");
      // Two inventory entries can describe the same object (a table and one of its rows): show it once.
      if (box && taken.some((t) => t.page === it.source.page && Math.min(t.y + t.h, box.y + box.h) - Math.max(t.y, box.y) > 0.5 * Math.min(t.h, box.h))) continue;
      const crop = box && (await cropPng(page, box));
      if (!crop) {
        checked.notes.push(`${it.title}: the original could not be located on its page automatically; it is linked to its page instead.`);
        continue;
      }
      const { read, run } = await readFigure({ pngBase64: crop.png.toString("base64"), label: it.title, caption: `${it.source.quote ?? ""}\n${it.statement}`, kind: it.type === "table" ? "table" : "figure" }, { provider, signal });
      runs.push(run);
      emit({ type: "run", run });
      if (!read.usable || read.callouts.length === 0) {
        checked.notes.push(`${it.title}: the vision model could not confirm the crop; the original is linked to its page instead.`);
        continue;
      }
      taken.push({ page: it.source.page, y: box!.y, h: box!.h });
      const file = `fig-${++n}.png`;
      writeBytes(id, file, crop.png);
      // No boxes are drawn inside the crop: the model is not precise enough about positions.
      const callouts = read.callouts.slice(0, 4).map((c, k) => ({ key: `part${k + 1}`, label: clip(c.label, 80), x: 0, y: 0, w: 0, h: 0, ref: it.id, say: clip(c.say.trim(), 300) }));
      const where = locLabel("pdf", it.source.page);
      let scene: Scene = {
        id: `fig-${n}`,
        type: "figure",
        title: clip(it.title, 60),
        question: `What does the original ${it.type} show?`,
        figure: {
          src: assetUrl(id, file),
          alt: clip(read.alt, 300),
          width: crop.width,
          height: crop.height,
          figureRef: it.id,
          attribution: `Cropped automatically from ${where} of the uploaded PDF, located by its text. The notes beside it were written by a vision model.`,
          callouts: callouts.map(({ say: _say, ...c }) => c),
        },
        cues: [{ text: `Here is the original ${it.type}, from ${where === "external" ? "the paper" : "page " + it.source.page}.`, refs: [it.id], duck: "enter" }, ...callouts.filter((c) => c.say).map((c) => ({ text: c.say, refs: [it.id], focus: c.key, duck: "point" as const }))],
      };
      // Numbers read from an image are only kept when the page text states them too.
      const pageText = source.pages.find((p) => p.page === it.source.page)?.text ?? "";
      const bad = new Set(
        checkScene(scene, byId, pageText)
          .map((p) => /^Sentence (\d+) says/.exec(p)?.[1])
          .filter(Boolean)
          .map((k) => Number(k) - 1),
      );
      if (bad.size) scene = { ...scene, cues: scene.cues.filter((_, k) => !bad.has(k)) };
      if (scene.cues.length < 2) continue;
      scene.check = { status: "ok", problems: [], attempts: 1 };
      const home = checked.chapters.find((c) => c.scenes.some((s) => sceneRefs(s).some((r) => r.ref === it.id))) ?? checked.chapters.findLast((c) => c.kind === "results") ?? checked.chapters[checked.chapters.length - 1];
      if (!home) continue;
      const after = home.scenes.findLastIndex((s) => sceneRefs(s).some((r) => r.ref === it.id));
      home.scenes.splice(after >= 0 ? after + 1 : home.scenes.length, 0, scene);
      emit({ type: "scene", id: scene.id, title: scene.title, status: "figure" });
      if (bad.size) checked.notes.push(`${it.title}: ${bad.size} sentence(s) about the image were dropped because their numbers are not in the page text.`);
    } catch (err) {
      // A figure is an extra. Only a refusal or a cancelled run ends the whole generation.
      if (err instanceof GenerateError && (err.code === "model_refused" || signal?.aborted)) throw err;
      checked.notes.push(`${it.title}: the original could not be read automatically (${err instanceof GenerateError ? err.code : "error"}); it is linked to its page instead.`);
    }
  }
  if (n) checked.notes.push("Figure scenes: the descriptions come from a vision model reading the page image. They cite the figure itself; check them against the original.");
}

// ───────────────────────── the pipeline ─────────────────────────
export async function runPipeline(id: string, emit: Emit, signal?: AbortSignal): Promise<LessonFile> {
  const job = loadJob(id);
  if (!job) throw new GenerateError("not_found", "No such generation.");
  const provider = job.provider;
  job.status = "running";
  job.error = undefined;
  const stage = (s: Stage, extra: Record<string, unknown> = {}) => {
    job.stage = s;
    saveJob(job);
    emit({ type: "stage", stage: s, ...extra });
  };
  const record = (run: RunRecord) => {
    job.runs.push(run);
    saveJob(job);
    emit({ type: "run", run });
  };
  const stop = () => {
    if (signal?.aborted) throw new GenerateError("timeout", "The run was cancelled.");
  };

  try {
    emit({ type: "job", id, provider, models: job.models, voice: voiceSetup()?.name ?? "browser" });

    // 1. input -> source blocks
    stage("reading");
    let source = readJson<SourceDoc>(id, "source.json");
    if (!source) {
      if (job.input.kind === "pdf") {
        const bytes = readBytes(id, "source.pdf");
        if (!bytes) throw new GenerateError("invalid_request", "The uploaded file is missing.");
        source = await sourceFromPdf(new Uint8Array(bytes), job.input.name);
      } else {
        source = sourceFromText(readBytes(id, "input.txt")?.toString("utf8") ?? "", job.input.name);
      }
      writeJson(id, "source.json", source);
    }
    job.input = { ...job.input, hash: source.hash, chars: source.chars, count: source.count };
    const unreadable = source.pageStatus.filter((s) => s.status === "unreadable").map((s) => s.page);
    const readable = source.pages.filter((p) => !unreadable.includes(p.page));
    emit({ type: "extracted", kind: source.kind, count: source.count, unreadable, chars: source.chars });
    stop();

    // 2. source blocks -> content inventory (fast model)
    let invDraft = readJson<InventoryDraft>(id, "inventory.json");
    stage("inventory", { model: job.models.fast, cached: Boolean(invDraft) });
    if (!invDraft) {
      const r = await buildInventory(readable, unreadable, source.kind, { provider, signal, onProgress: (outputChars) => emit({ type: "progress", stage: "inventory", outputChars }) });
      invDraft = r.draft;
      writeJson(id, "inventory.json", invDraft);
      r.runs.forEach(record);
    }
    const { inventory, idMap } = inventoryFromDraft(invDraft.inventory, source);
    const usable = inventory.filter((it) => it.status === "matched");
    if (inventory.length < 3 || usable.length === 0) throw new GenerateError("invalid_model_output", `The inventory had ${inventory.length} entries, ${usable.length} of them traceable to the source.`);
    job.title = clip(invDraft.title || source.name, 120);
    emit({ type: "inventory", entries: inventory.length, matched: usable.length });
    stop();

    // 3. inventory -> storyboard (strong model)
    let sbDraft = readJson<StoryboardDraft>(id, "storyboard.json");
    stage("storyboard", { model: job.models.strong, cached: Boolean(sbDraft) });
    if (!sbDraft) {
      const words = wordCount(readable.map((p) => p.text).join(" "));
      const r = await buildStoryboard({ title: job.title, sourceType: invDraft.source_type, words }, inventory.filter((it) => it.status !== "unclear"), source.kind, { provider, signal, onProgress: (outputChars) => emit({ type: "progress", stage: "storyboard", outputChars }) });
      sbDraft = r.draft;
      writeJson(id, "storyboard.json", sbDraft);
      record(r.run);
    }
    stop();

    // 4. check every scene; repair the ones that fail, one by one (fast model)
    const ctx: SceneContext = { byId: new Map(inventory.map((it) => [it.id, it])), idMap };
    let checked = readJson<Checked>(id, "scenes.json");
    stage("checking", { model: job.models.fast, cached: Boolean(checked) });
    if (!checked) {
      const { intro, chapters } = chaptersFromStoryboard(sbDraft, ctx, source.kind === "pdf" ? "The paper in one minute" : "The short version");
      if (intro.scenes.length === 0 || chapters.length === 0) throw new GenerateError("invalid_model_output", "The storyboard had no usable intro or chapters.");
      // Model-judged half of the check: is each sentence supported by the passages it cites?
      const judged = new Map<string, string[]>();
      const notes: string[] = [];
      try {
        const r = await checkClaims([...intro.scenes, ...chapters.flatMap((c) => c.scenes)], ctx.byId, { provider, signal });
        record(r.run);
        for (const f of r.findings) judged.set(f.scene, [...(judged.get(f.scene) ?? []), `Sentence ${f.sentence} is not supported by its cited passages: ${f.problem}`]);
      } catch (err) {
        if (!(err instanceof GenerateError) || !["invalid_model_output", "upstream_error", "rate_limited"].includes(err.code) || signal?.aborted) throw err;
        notes.push("The model-based comparison of each sentence with its cited passages did not run; only the deterministic checks did.");
      }
      let repairs = 0;
      for (const chapter of [intro, ...chapters]) {
        for (let k = 0; k < chapter.scenes.length; k++) {
          let scene = chapter.scenes[k];
          let problems = [...checkScene(scene, ctx.byId), ...(judged.get(scene.id) ?? [])];
          let attempts = 1;
          let repaired = false;
          while (problems.length && attempts <= LIMITS.maxSceneRepairs && repairs < 10) {
            stop();
            emit({ type: "scene", id: scene.id, title: scene.title, status: "repairing", problems: problems.length });
            attempts++;
            repairs++;
            try {
              const r = await repairScene({ scene, problems, chapterTitle: chapter.title, neighbours: chapter.scenes.filter((s) => s.id !== scene.id).map((s) => s.title), entries: entriesFor(scene, inventory), kind: source.kind }, { provider, signal });
              record(r.run);
              const fixed = sceneFromDraft(r.draft, scene.id, ctx);
              const left = fixed ? checkScene(fixed, ctx.byId) : problems;
              if (fixed && left.length < problems.length) {
                scene = fixed;
                problems = left;
                repaired = true;
              }
            } catch (err) {
              // Only this scene failed to repair; the lesson goes on with the scene flagged.
              if (!(err instanceof GenerateError) || !["invalid_model_output", "upstream_error"].includes(err.code) || signal?.aborted) throw err;
            }
          }
          scene.check = { status: problems.length ? "flagged" : repaired ? "repaired" : "ok", problems, attempts };
          chapter.scenes[k] = scene;
          emit({ type: "scene", id: scene.id, title: scene.title, status: scene.check.status });
        }
      }
      checked = { intro, chapters, figuresDone: false, notes };
      writeJson(id, "scenes.json", checked);
    }
    stop();

    // 5. original figures or tables (vision model), PDF only
    if (source.kind === "pdf" && !checked.figuresDone && process.env.LESSON_FIGURES !== "off") {
      stage("figures", { model: job.models.vision });
      await addFigures(id, source, inventory, checked, provider, job.runs, emit, signal);
      saveJob(job);
    }
    checked.figuresDone = true;
    writeJson(id, "scenes.json", checked);
    stop();

    // 6. narration with the local voice (same voice as the bundled demo)
    const voice = voiceSetup();
    const scenes = [...checked.intro.scenes, ...checked.chapters.flatMap((c) => c.scenes)];
    const audio = new Map<string, AudioMeta>();
    stage("voice", { voice: voice?.name ?? "browser", total: scenes.length });
    if (voice) {
      let done = 0;
      const queue = [...scenes];
      const worker = async () => {
        for (let sc = queue.shift(); sc; sc = queue.shift()) {
          stop();
          try {
            const meta = await narrate(id, sc, signal);
            if (meta) audio.set(sc.id, meta);
          } catch (err) {
            if (signal?.aborted) throw err;
            checked.notes.push(`Scene "${sc.title}" has no recorded narration (the voice tool failed); it uses the browser voice or captions.`);
          }
          emit({ type: "voice", done: ++done, total: scenes.length });
        }
      };
      await Promise.all([worker(), worker(), worker()]);
    }
    stop();

    // 7. the versioned lesson file
    stage("saving");
    const lesson = finishLesson(id, source, invDraft, inventory, checked, audio);
    const file: LessonFile = {
      format: LESSON_FORMAT,
      version: LESSON_VERSION,
      revision: 1,
      savedAt: new Date().toISOString(),
      provenance: { sourceKind: source.kind, sourceName: source.name, sourceHash: source.hash, provider, models: job.models, promptVersion: PROMPT_VERSION, voice: voice && lesson.hasRecordedVoice ? voice.name : "browser", runs: job.runs },
      lesson,
    };
    saveLesson(file);
    job.status = "done";
    saveJob(job);
    emit({ type: "done", id, totals: runTotals(job.runs), scenes: scenes.length, voice: file.provenance.voice });
    return file;
  } catch (err) {
    const e = err instanceof GenerateError ? err : new GenerateError("upstream_error", "Unexpected server error.");
    job.status = signal?.aborted ? "interrupted" : "failed";
    job.error = { code: e.code, message: e.message };
    saveJob(job);
    throw e;
  }
}

/**
 * Generates one scene again and re-records only that scene's narration. Everything else in the
 * stored lesson (other scenes, their audio, the inventory) stays as it is.
 */
export async function regenerateScene(id: string, sceneId: string, signal?: AbortSignal): Promise<LessonFile> {
  const file = loadLesson(id);
  const source = readJson<SourceDoc>(id, "source.json");
  const invDraft = readJson<InventoryDraft>(id, "inventory.json");
  if (!file || !source || !invDraft) throw new GenerateError("not_found", "This lesson has no stored generation data.");
  const lesson = file.lesson;
  const chapter = [lesson.intro, ...lesson.chapters].find((c) => c.scenes.some((s) => s.id === sceneId));
  const old = chapter?.scenes.find((s) => s.id === sceneId);
  if (!chapter || !old) throw new GenerateError("not_found", "No such scene.");
  if (!DRAFTABLE.includes(old.type)) throw new GenerateError("invalid_request", "This kind of scene cannot be regenerated on its own.");

  const { idMap } = inventoryFromDraft(invDraft.inventory, source);
  const ctx: SceneContext = { byId: new Map(lesson.inventory.map((it) => [it.id, it])), idMap };
  const provider = file.provenance.provider;
  const { draft, run } = await repairScene(
    { scene: old, problems: old.check?.problems ?? [], chapterTitle: chapter.title, neighbours: chapter.scenes.filter((s) => s.id !== sceneId).map((s) => s.title), entries: entriesFor(old, lesson.inventory), kind: source.kind, fresh: true },
    { provider, signal },
  );
  const fresh = sceneFromDraft(draft, sceneId, ctx);
  if (!fresh) throw new GenerateError("invalid_model_output", "The regenerated scene had no usable sentences.");
  const problems = checkScene(fresh, ctx.byId);
  fresh.check = { status: problems.length ? "flagged" : "repaired", problems, attempts: (old.check?.attempts ?? 1) + 1 };

  let meta: AudioMeta | null = null;
  try {
    meta = await narrate(id, fresh, signal);
  } catch {
    /* no recording for this scene: browser voice or captions */
  }
  const timed = timeScene(fresh, meta?.timing, meta ? assetUrl(id, meta.file) : undefined);
  chapter.scenes = chapter.scenes.map((s) => (s.id === sceneId ? timed : s));
  const { details, appendix } = regroup(lesson.inventory, lesson.intro, lesson.chapters);
  lesson.details = details;
  lesson.appendix = appendix;
  const all = [lesson.intro, ...lesson.chapters].flatMap((c) => c.scenes);
  lesson.hasRecordedVoice = all.every((s) => s.audio);
  const keep = lesson.verification.notes.filter((n) => /^(Figure scenes|Scene "|.*could not be read automatically|.*were dropped because)/.test(n));
  lesson.verification = autoVerification(lesson);
  lesson.verification.notes.push(...keep.filter((n) => !lesson.verification.notes.includes(n)));

  file.revision += 1;
  file.savedAt = new Date().toISOString();
  file.provenance.runs.push(run);
  saveLesson(file);
  const job = loadJob(id);
  if (job) {
    job.runs = file.provenance.runs;
    saveJob(job);
  }
  return file;
}
