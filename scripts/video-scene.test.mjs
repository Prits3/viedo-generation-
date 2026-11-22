import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { applyVisualPatch, inspectScene } from "../src/lib/scene-authoring.ts";
import { LessonFileSchema } from "../src/lib/lesson-file.ts";
import { stateAt } from "../src/lib/actions.ts";
import { inspectVideo } from "../src/lib/video-quality.ts";

const load = () => LessonFileSchema.parse(JSON.parse(readFileSync(new URL("../showcase/lessons/l-ov5pmkhgkfz6/lesson.json", import.meta.url))));
const makePatch = (file) => ({ schema: "paperscenes.scene-visual@1", lessonId: file.lesson.id, baseRevision: file.revision, sceneId: "intro-2", visual: { type: "comparison", refs: ["R-01", "R-02"], contextRef: "R-01" } });

test("inspect exposes scene cues and cited evidence with a ready patch", () => {
  const file = load();
  const report = inspectScene(file, "intro-2");
  assert.deepEqual(report.suggestedPatch.visual.refs, ["R-01", "R-02"]);
  assert.match(report.evidence[0].source.quote, /without trees reached 34/);
  assert.throws(() => inspectScene(file, "missing"), /exactly one scene/);
});

test("comparison variant preserves audio, captions, timing, sources and every other scene", () => {
  const file = load();
  const before = structuredClone(file);
  const prior = file.lesson.intro.scenes[1];
  const variant = applyVisualPatch(file, makePatch(file));
  const scene = variant.lesson.intro.scenes[1];
  assert.deepEqual(file, before);
  assert.equal(variant.revision, file.revision + 1);
  assert.deepEqual(variant.provenance, file.provenance);
  assert.deepEqual(variant.lesson.inventory, file.lesson.inventory);
  assert.deepEqual(variant.lesson.chapters, file.lesson.chapters);
  assert.deepEqual(variant.lesson.intro.scenes.filter((_, i) => i !== 1), file.lesson.intro.scenes.filter((_, i) => i !== 1));
  assert.equal(scene.audio, prior.audio);
  assert.equal(scene.duration, prior.duration);
  assert.deepEqual(scene.cues, prior.cues);
  assert.deepEqual(scene.comparison.rows.map(({ label, to, ref }) => [label, to, ref]), [["street without trees", 34, "R-01"], ["street with trees", 31, "R-02"]]);
  assert.match(scene.comparison.basis, /15:00/);
  assert.equal(stateAt(scene, scene.cues[0].start + 0.01).focus, "measure-1");
  assert.equal(stateAt(scene, scene.cues[1].start + 0.01).focus, "measure-2");
  assert.ok(LessonFileSchema.safeParse(variant).success);
});

test("rejects stale, ungrounded, duplicate or non-visual patches", () => {
  const file = load();
  const patch = makePatch(file);
  assert.throws(() => applyVisualPatch(file, { ...patch, baseRevision: patch.baseRevision + 1 }), /revision/);
  assert.throws(() => applyVisualPatch(file, { ...patch, lessonId: "l-otherfile" }), /lesson ID/);
  assert.throws(() => applyVisualPatch(file, { ...patch, visual: { type: "comparison", refs: ["M-01", "R-02"] } }), /cited by a cue/);
  assert.throws(() => applyVisualPatch(file, { ...patch, visual: { ...patch.visual, refs: ["R-01", "R-01"] } }), /distinct/);
  assert.throws(() => applyVisualPatch(file, { ...patch, visual: { ...patch.visual, contextRef: "M-01" } }), /one of the two/);
  assert.throws(() => applyVisualPatch(file, { ...patch, visual: { ...patch.visual, caption: "arbitrary" } }), /caption/);
});

test("scene-only preview picks the same three frame times before and after", () => {
  const file = load();
  const patch = makePatch(file);
  const variant = applyVisualPatch(file, patch);
  const preview = (f) => inspectVideo(f.lesson, "vertical", "intro-2");
  const original = preview(file);
  assert.deepEqual(original.frames.map((f) => f.kind), ["entry", "focus", "exit"]);
  assert.ok(original.frames.every((f) => f.sceneId === "intro-2" && f.frame < original.totalFrames));
  assert.deepEqual(preview(variant).frames, original.frames);
  assert.throws(() => inspectVideo(file.lesson, "vertical", "missing"), /not part of this lesson/);
});
