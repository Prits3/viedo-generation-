// Browser check of the tutor flow from the jury demo (Playwright, headless Chromium):
// open "Central versus Southern Europe", ask, ask for the evidence, open it, resume, reload.
//   node scripts/e2e-tutor.mjs [baseUrl]
import { launchBrowser } from "./browser.mjs";

const base = process.argv.find((a) => a.startsWith("http")) ?? "http://localhost:3000";
let failed = 0;
function check(name, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
  if (!ok) failed++;
}

const browser = await launchBrowser({ args: ["--autoplay-policy=no-user-gesture-required"] });
for (const [tag, viewport] of [["desktop", { width: 1280, height: 900 }], ["phone", { width: 390, height: 844 }]]) {
  const ctx = await browser.newContext({ viewport });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(`${base}/lesson/demo`, { waitUntil: "networkidle" });
  const seek = () => page.locator(".seek input").evaluate((el) => Number(el.value));
  const playing = () => page.locator("[data-action=play]").getAttribute("aria-label").then((l) => l === "Pause");

  await page.locator(".scenebar__list button", { hasText: "Central versus Southern Europe" }).click();
  await page.waitForTimeout(3500);
  check(`${tag}: comparison scene plays`, (await playing()) && (await seek()) > 1, `t=${await seek()}`);

  await page.locator("#tutor-q").click();
  check(`${tag}: focusing the question box pauses the lesson`, !(await playing()));
  const t0 = await seek();
  await page.locator("#tutor-q").fill("Why is cooling lower in Southern Europe?");
  await page.keyboard.press("Enter");
  const reply = page.locator(".tutor__msg--layla").last();
  await reply.waitFor();
  const text = await reply.locator("p").textContent();
  const cites = await reply.locator("[data-action=tutor-source]").allTextContents();
  check(`${tag}: answer comes from the source with a page`, /evapotranspiration/i.test(text ?? "") && cites.some((c) => /page 6/.test(c)), cites.join(" | "));

  await page.locator("#tutor-q").fill("What is the evidence?");
  await page.keyboard.press("Enter");
  await page.waitForFunction(() => document.querySelectorAll(".tutor__msg--layla").length >= 2);
  const ev = await page.locator(".tutor__msg--layla").last().locator("p").textContent();
  check(`${tag}: evidence follow-up quotes page 6`, /page 6/.test(ev ?? "") && /“/.test(ev ?? ""), ev?.slice(0, 80));

  await page.locator(".tutor__msg--layla").last().locator("[data-action=tutor-source]").first().click();
  await page.waitForTimeout(800);
  const mark = await page.locator(".pdfpage mark, .pdf-highlight, [data-highlight]").count().catch(() => 0);
  check(`${tag}: opening the evidence keeps the saved position`, Math.abs((await seek()) - t0) < 0.2 && !(await playing()), `before ${t0}, after ${await seek()}, highlights ${mark}`);

  await page.locator("[data-action=tutor-resume]").click();
  await page.waitForTimeout(2500);
  const t1 = await seek();
  check(`${tag}: "Resume lesson" continues from the same moment`, (await playing()) && t1 > t0 + 0.5 && t1 < t0 + 5, `from ${t0} to ${t1}`);
  const tts = await page.evaluate(() => window.speechSynthesis?.speaking ?? false);
  check(`${tag}: no tutor voice overlaps the lesson after resuming`, !tts);

  await page.locator("#tutor-q").fill("Continue the lesson");
  await page.keyboard.press("Enter");
  await page.waitForTimeout(1500);
  check(`${tag}: typed "Continue the lesson" resumes`, await playing());

  await page.locator("[data-action=play]").click();
  await page.waitForTimeout(2200); // position is saved at most every 2 s while playing, and on pause
  const tSaved = await seek();
  await page.reload({ waitUntil: "networkidle" });
  const restore = page.locator("[data-action=restore-position]");
  check(`${tag}: after a reload the position can be restored`, await restore.isVisible(), (await restore.textContent().catch(() => "")) ?? "");
  check(`${tag}: after a reload the conversation is still there`, (await page.locator(".tutor__msg--layla").count()) >= 2);
  if (await restore.isVisible()) {
    await restore.click();
    await page.waitForTimeout(300);
    check(`${tag}: restored to the saved scene and moment`, Math.abs((await seek()) - tSaved) < 2.5, `saved ${tSaved}, now ${await seek()}`);
  }
  await page.locator("[data-action=tutor-clear]").click();
  await page.waitForTimeout(300);
  const left = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("ll.")));
  if (left.length) console.log("      left in storage:", left.join(", "));
  check(`${tag}: "Clear my data" removes conversation and position`, (await page.locator(".tutor__msg").count()) === 0 && (await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("ll.")).length)) === 0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
  check(`${tag}: no horizontal overflow`, !overflow);
  check(`${tag}: no page errors`, errors.length === 0, errors.join(" | ").slice(0, 200));
  await ctx.close();
}
await browser.close();
console.log(failed ? `\n${failed} check(s) failed` : "\nall tutor browser checks passed");
process.exit(failed ? 1 : 0);
