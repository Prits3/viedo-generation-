// Screenshots of the player at chosen moments, for a visual check of scenes and the mascot.
//   node scripts/shots.mjs <base-url> <lesson-path> <out-dir> [--phone] [scene:seconds ...]
//   node scripts/shots.mjs http://localhost:3000 /lesson/demo .cache/shots 0:3 0:14 0:22 2:10
// A target is <scene index>:<seconds into that scene>. Without targets, every scene is shot at 60 % of its length.
import { mkdirSync } from "node:fs";
import { launchBrowser } from "./browser.mjs";

const [base, path, out, ...rest] = process.argv.slice(2);
if (!base || !path || !out) {
  console.error("usage: node scripts/shots.mjs <base-url> <lesson-path> <out-dir> [--phone] [scene:seconds ...]");
  process.exit(2);
}
const phone = rest.includes("--phone");
const targets = rest.filter((a) => /^\d+:[\d.]+$/.test(a)).map((a) => a.split(":").map(Number));
mkdirSync(out, { recursive: true });
const browser = await launchBrowser();
const page = await browser.newPage({ viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 900 }, deviceScaleFactor: phone ? 2 : 1 });
await page.goto(base + (path.startsWith("/") ? path : "/" + path), { waitUntil: "networkidle" });
await page.waitForSelector(".stage");
await page.click(".bigplay");
await page.click('[data-action="mute"]');
await page.click('[data-action="play"]'); // pause
const count = await page.evaluate(() => document.querySelectorAll(".chapters__btn").length);
// Walk the whole playlist with the "next scene" button; shoot the scenes that were asked for.
const want = new Map();
for (const [i, t] of targets) want.set(i, [...(want.get(i) ?? []), t]);
let index = 0;
for (;;) {
  const dur = Number(await page.getAttribute(".seek input", "max"));
  const times = targets.length ? want.get(index) ?? [] : [dur * 0.6];
  for (const t of times) {
    await page.fill(".seek input", String(Math.min(t, dur - 0.2)));
    await page.waitForTimeout(1300);
    const id = await page.getAttribute(".scene", "data-scene");
    const file = `${out}/${phone ? "phone" : "desk"}-${String(index).padStart(2, "0")}-${id}-${String(t.toFixed ? t.toFixed(0) : t)}.png`;
    await page.locator(".stage").screenshot({ path: file });
    console.log(file, await page.getAttribute(".mascot", "data-mascot-pose").catch(() => "in-scene"));
  }
  const next = page.locator('button[aria-label="Next scene"]');
  if (await next.isDisabled()) break;
  await next.click();
  await page.waitForTimeout(150);
  index++;
}
console.log("chapters", count, "scenes", index + 1);
await browser.close();
