// Offline checks of the local tutor on the demo lesson (no browser, no model).
//   node scripts/check-tutor.mjs
import { answer, isResumeCommand } from "../src/lib/tutor.ts";
import { inventory } from "../src/data/demo/inventory.ts";
import { intro } from "../src/data/demo/storyboard.ts";

let failed = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!ok) failed++;
}

const scene = intro.scenes.find((s) => s.id === "intro-compare");
const ctx = (previous = [], cueIndex = 2) => ({ scene, cueIndex, inventory, previous });

const why = answer("Why is cooling lower in Southern Europe?", ctx());
check("why-question is answered from passages", why.kind === "answer" && why.citations.length > 0, `${why.citations.map((c) => `${c.id} p.${c.page}`).join(", ")} | ${why.text.slice(0, 120)}`);
check("answer names low evapotranspiration", /evapotranspiration/i.test(why.text));

const ev = answer("What is the evidence?", ctx(why.citations.map((c) => c.id)));
check("evidence follow-up quotes the cited passages", ev.kind === "evidence" && ev.citations.every((c) => c.quote) && ev.text.includes("“"), ev.citations.map((c) => `${c.id} p.${c.page}`).join(", "));
check("evidence includes page 6", ev.citations.some((c) => c.page === 6));

const simple = answer("Explain that more simply", ctx(why.citations.map((c) => c.id)));
check("simpler follow-up is shorter than the full answer and cites it", simple.kind === "simpler" && simple.text.split(":")[1].split(".")[0].length < why.text.length && simple.citations.length === 1, simple.text);

const open = answer("How much does it cost to plant a tree in Madrid?", ctx());
check("question the source leaves open is not invented", open.kind === "not_found", open.text.slice(0, 100));

const vague = answer("Why is that?", ctx([], 0));
check("vague reference with two points on screen asks back", vague.kind === "clarify" && (vague.options?.length ?? 0) >= 2, (vague.options ?? []).join(" | "));

check("'Continue the lesson' is the resume command", isResumeCommand("Continue the lesson") && isResumeCommand("resume lesson."));
check("a question containing 'continue' is not", !isResumeCommand("Will cities continue to warm?"));
check("resume reply", answer("Continue the lesson", ctx()).kind === "resume");

// A stored text lesson: a short question with a name in it.
const { readFileSync } = await import("node:fs");
const stored = JSON.parse(readFileSync("showcase/lessons/l-zl0jsgukw6kl/lesson.json", "utf8")).lesson;
const sc = stored.intro.scenes[0];
const named = answer("What did Chargaff find?", { scene: sc, cueIndex: 0, inventory: stored.inventory, previous: [] }, "text");
check("short question with a rare name finds its passage (text lesson, § label)", named.kind === "answer" && /chargaff/i.test(named.text) && /§/.test(`§${named.citations[0]?.page}`), named.text.slice(0, 100));
const off = answer("What is the capital of France?", { scene: sc, cueIndex: 0, inventory: stored.inventory, previous: [] }, "text");
check("unrelated question on the text lesson is not answered", off.kind === "not_found", off.text.slice(0, 80));

console.log(failed ? `\n${failed} check(s) failed` : "\nall tutor checks passed");
process.exit(failed ? 1 : 0);
