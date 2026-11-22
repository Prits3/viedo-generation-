import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { LessonFileSchema } from "../src/lib/lesson-file.ts";
import { applyVisualPatch, inspectScene } from "../src/lib/scene-authoring.ts";

try {
  const [command, id, value, flag, out, ...rest] = process.argv.slice(2);
  const inspect = command === "inspect" && value && flag === undefined;
  const apply = command === "apply" && value && flag === "--out" && out && rest.length === 0;
  if ((!inspect && !apply) || !/^l-[a-z0-9]{8,24}$/.test(id ?? "")) throw new Error("Invalid arguments.");
  const store = resolve(process.env.LESSON_STORE_DIR || join(".data", "lessons"));
  const file = LessonFileSchema.parse(JSON.parse(readFileSync(join(store, id, "lesson.json"), "utf8")));
  if (file.lesson.id !== id) throw new Error("Lesson ID does not match the directory name.");
  if (inspect) console.log(JSON.stringify(inspectScene(file, value), null, 2));
  else {
    const variant = LessonFileSchema.parse(applyVisualPatch(file, JSON.parse(readFileSync(value, "utf8"))));
    writeFileSync(out, `${JSON.stringify(variant, null, 2)}\n`, { flag: "wx" });
    console.log(JSON.stringify({ lessonId: id, baseRevision: file.revision, revision: variant.revision, output: out }));
  }
} catch (error) {
  console.error(`Video scene: ${error.message}\nUsage: node scripts/video-scene.mjs inspect <lessonId> <sceneId> | apply <lessonId> <patch.json> --out <new.json>`);
  process.exitCode = 2;
}
