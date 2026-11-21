// Launches a Chromium-family browser for the dev scripts. Prefers Playwright's own
// Chromium; falls back to an installed Edge/Chrome so no browser download is needed.
import { chromium } from "playwright";

export async function launchBrowser(opts = {}) {
  const attempts = [{}, { channel: "msedge" }, { channel: "chrome" }];
  let lastErr;
  for (const a of attempts) {
    try { return await chromium.launch({ headless: true, ...a, ...opts }); }
    catch (e) { lastErr = e; }
  }
  throw lastErr;
}
