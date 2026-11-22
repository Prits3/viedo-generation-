import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { validateComparison, prepareVideoScene } from "../src/lib/comparison-evidence.ts";
import { inspectVideo } from "../src/lib/video-quality.ts";
import { sceneFromDraft } from "../src/lib/assemble.ts";
import { checkScene } from "../src/lib/check.ts";

const showcase = (id) => JSON.parse(readFileSync(new URL(`../showcase/lessons/${id}/lesson.json`, import.meta.url))).lesson;
const trees = showcase("l-ov5pmkhgkfz6");
const byId = new Map(trees.inventory.map((it) => [it.id, it]));
const rows = [
  { key: "without", label: "Without trees", ref: "R-01", from: 34, to: 34, display: "34 °C", tone: "warm" },
  { key: "with", label: "With trees", ref: "R-02", from: 31, to: 31, display: "31 °C", tone: "cool" },
];
const check = (input = rows, unit = "°C", inventory = byId) => validateComparison(input, unit, inventory);

test("accepts two cited quantities and a legacy zero-baseline point", () => {
  assert.deepEqual(check(), []);
  assert.deepEqual(check([{ ...rows[0], from: 0 }, rows[1]]), []);
});

test("rejects invented geometry even if the display text is correct", () => {
  const findings = check([{ ...rows[0], from: 0, to: 100 }, rows[1]]);
  assert.deepEqual(findings.map((f) => f.code), ["chart.coordinates"]);
});

test("rejects swapped citations, an incorrect unit, and values pulled out of times", () => {
  assert.ok(check([{ ...rows[0], ref: "R-02" }, rows[1]]).some((f) => f.code === "chart.coordinates"));
  assert.ok(check(rows, "%").some((f) => f.code === "chart.unit"));
  const fake = new Map(byId);
  fake.set("R-01", { ...byId.get("R-01"), quantity: { value: "15", unit: "°C" } });
  assert.ok(check(rows, "°C", fake).some((f) => f.code === "chart.evidence"));
});

test("keeps signed ranges and rejects sign changes and shortened ranges", () => {
  const inventory = new Map(byId);
  inventory.set("R-01", { ...byId.get("R-01"), quantity: { value: "−8 to −4", unit: "°C" }, source: { quote: "The range was −8 to −4 °C." } });
  const row = { ...rows[0], from: -8, to: -4, display: "−8 to −4 °C" };
  assert.deepEqual(check([row, rows[1]], "°C", inventory), []);
  assert.ok(check([{ ...row, from: 4, to: 8 }, rows[1]], "°C", inventory).length > 0);
  inventory.get("R-01").quantity.value = "−4";
  assert.ok(check([{ ...row, from: -4, to: -4, display: "−4 °C" }, rows[1]], "°C", inventory).some((f) => f.code === "chart.evidence"));
});

test("does not turn a quoted approximation into an exact on-screen value", () => {
  const inventory = new Map(byId);
  inventory.set("R-01", { ...byId.get("R-01"), source: { quote: "The estimated temperature was about 34 °C." } });
  assert.equal(check(rows, "°C", inventory)[0].code, "chart.display");
  assert.deepEqual(check([{ ...rows[0], display: "about 34 °C" }, rows[1]], "°C", inventory), []);
});

test("snapshot legacy false chart: report, generic fallback, no mutation", () => {
  const lesson = showcase("l-zl0jsgukw6kl");
  const original = lesson.intro.scenes.find((s) => s.comparison);
  const entries = new Map(lesson.inventory.map((it) => [it.id, it]));
  assert.ok(checkScene(original, entries).some((p) => p.includes("chart.evidence")));
  const safe = prepareVideoScene(original, entries);
  assert.equal(safe.type, "points");
  assert.equal(safe.comparison, undefined);
  assert.deepEqual(safe.cues, original.cues);
  assert.deepEqual(safe.points.items.map((it) => it.key), original.comparison.rows.map((r) => r.key));
  assert.equal(original.comparison.max, 100);
  assert.ok(!JSON.stringify(safe.points).includes("100"));
});

test("new scene assembly downgrades unsupported plots but preserves valid numeric comparisons", () => {
  const base = { type: "comparison", title: "Trees", question: "What was measured?", cards: [], axis_label: "Temperature", unit: "°C", basis: "At 15:00", basis_ref: "R-01", cues: [{ text: "The street without trees reached 34 °C.", refs: ["R-01"], focus: "without" }] };
  const ctx = { byId, idMap: {} };
  assert.equal(sceneFromDraft({ ...base, rows }, "s", ctx).type, "comparison");
  const fallback = sceneFromDraft({ ...base, rows: [{ ...rows[0], to: 100, display: "100 °C" }, rows[1]] }, "s", ctx);
  assert.equal(fallback.type, "points");
  assert.equal(fallback.cues[0].focus, "without");
  assert.ok(!JSON.stringify(fallback.points).includes("100"));
});

test("agent report has stable finding codes and deterministic, in-range storyboard frames", () => {
  const report = inspectVideo(trees, "vertical");
  assert.equal(report.schema, "paperscenes.video-quality@1");
  assert.ok(report.findings.some((f) => f.code === "pacing.scene-gap" && f.action));
  assert.ok(report.frames.some((f) => f.frame === 0));
  assert.ok(report.frames.every((f, i, a) => f.frame < report.totalFrames && (!i || f.frame > a[i - 1].frame)));
  assert.deepEqual(report, inspectVideo(trees, "vertical"));
  assert.ok(inspectVideo(showcase("l-zl0jsgukw6kl"), "vertical").findings.some((f) => f.code === "chart.evidence" && f.severity === "error"));
});
