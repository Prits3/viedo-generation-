// Production-mode builds with emulated Netlify contexts. No real Stripe or form submission.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { mkdirSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { resolve } from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { expect } from "playwright/test";
import { launchBrowser } from "./browser.mjs";

const testLink = process.env.PILOT_E2E_TEST_LINK ?? "https://buy.stripe.com/test_PilotFixtureOnly";
const testPrice = process.env.PILOT_E2E_TEST_PRICE;
const liveLink = "https://buy.stripe.com/PilotFixtureOnly";
const next = resolve("node_modules/next/dist/bin/next");
const evidence = resolve(process.env.PILOT_SCREENSHOTS_DIR ?? ".cache/pilot-offer");
const common = Object.fromEntries(Object.entries(process.env).filter(([name]) => !/^(?:PILOT_|LEGAL_|AWS_|BEDROCK_|ANTHROPIC_|CONTEXT$)/i.test(name)));
const cases = [
  { name: "hidden", context: "production", link: null, env: {} },
  { name: "preview", context: "deploy-preview", link: testLink, test: true, env: { PILOT_STRIPE_TEST_LINK: testLink, ...(testPrice ? { PILOT_PRICE: testPrice } : {}) } },
  { name: "public-sandbox", context: "production", link: testLink, test: true, env: {
    PILOT_PUBLIC_TEST_LINK: testLink,
    PILOT_PUBLIC_TEST_PRICE: testPrice ?? "€5.00 (test price)",
  } },
  { name: "approved-fixture", context: "production", link: liveLink, env: {
    PILOT_STRIPE_LIVE_LINK: liveLink,
    PILOT_LIVE_APPROVED: "true",
    PILOT_PRICE: "€15.00 total",
    PILOT_DELIVERY: "Within 2 business days after receiving the PDF.",
    PILOT_PDF_HANDOFF: "We email you a private upload link after checking payment.",
    PILOT_ORDER_INFO_URL: "https://example.invalid/order-terms",
    LEGAL_NAME: "Example Seller",
    LEGAL_ADDRESS: "10 Example Lane|Example Town",
    LEGAL_EMAIL: "seller@example.invalid",
  } },
];
const screens = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
];
mkdirSync(evidence, { recursive: true });

async function freePort() {
  const socket = createServer().listen(0, "127.0.0.1");
  await once(socket, "listening");
  const { port } = socket.address();
  await new Promise((resolve, reject) => socket.close((error) => error ? reject(error) : resolve()));
  return String(port);
}

function npmBuild(env) {
  const args = process.platform === "win32" ? ["/d", "/c", "npm run build"] : ["run", "build"];
  const cmd = process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : "npm";
  const result = spawnSync(cmd, args, { env, stdio: "inherit" });
  assert.equal(result.status, 0, result.error?.message ?? "npm run build failed");
}

async function checkPage(browser, base, scenario, screen) {
  const ctx = await browser.newContext({ viewport: { width: screen.width, height: screen.height }, reducedMotion: "reduce", hasTouch: screen.name === "mobile" });
  try {
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    let enteredCheckout = false;
    let signup = false;
    await ctx.route("**/*", (route) => {
      const req = route.request();
      const url = new URL(req.url());
      if (req.url() === scenario.link && req.isNavigationRequest()) {
        enteredCheckout = true;
        return route.fulfill({ contentType: "text/html", body: "<h1>Intercepted checkout navigation — not Stripe</h1>" });
      }
      if (url.origin !== base) return route.abort();
      if (req.method() === "POST" && url.pathname === "/__forms.html") {
        const fields = new URLSearchParams(req.postData());
        signup = fields.get("form-name") === "early-access" && fields.get("email") === "pilot-test@example.invalid";
        return route.fulfill({ status: signup ? 200 : 400 });
      }
      return req.method() === "GET" ? route.continue() : route.abort();
    });

    await page.goto(base);
    // Wait for the existing demo library before checking the offer's placement.
    await expect(page.getByRole("heading", { name: "Shorts and lessons" })).toBeVisible();
    const demo = page.locator('[data-action="try-example"]');
    const early = page.getByRole("heading", { name: "Get early access" });
    const card = page.locator("[data-pilot-mode]");
    const order = page.getByRole("link", { name: scenario.test ? "Try the Stripe test checkout" : "Order a learning video" });
    await expect(demo).toBeVisible();
    await expect(early).toBeVisible();
    if (scenario.link) {
      await expect(card.getByText("LearnLayla – Your PDF, Explained", { exact: true })).toBeVisible();
      await expect(card.getByText(/short narrated MP4/)).toBeVisible();
      await expect(card.getByText("One-time purchase, no subscription.")).toBeVisible();
      const testMode = Boolean(scenario.test);
      await expect(card).toHaveAttribute("data-pilot-mode", testMode ? "test" : "live");
      if (testMode) {
        await expect(card.getByText(/Test checkout only\. No real payment, PDF submission or delivery/)).toBeVisible();
        await expect(card.getByText(/Use test card details only/)).toBeVisible();
        await expect(card.getByText(testPrice ?? "€5.00 (test price)", { exact: true })).toBeVisible();
        await expect(card.getByText(/3 business days.*test estimate/)).toBeVisible();
        await expect(card.getByText(/verify payment, then email PDF submission instructions/)).toBeVisible();
      } else {
        await expect(card.getByText(/Test checkout only/)).toHaveCount(0);
        await expect(card.getByText("€15.00 total")).toBeVisible();
        await expect(card.getByText(scenario.env.PILOT_DELIVERY)).toBeVisible();
        await expect(card.getByText(scenario.env.PILOT_PDF_HANDOFF)).toBeVisible();
        // Seller details must be visible even when runtime variables are not configured.
        await expect(card.getByText(/Example Seller, 10 Example Lane, Example Town · seller@example\.invalid/)).toBeVisible();
        await expect(card.getByRole("link", { name: "Order and privacy information" })).toHaveAttribute("href", scenario.env.PILOT_ORDER_INFO_URL);
      }
      await expect(order).toHaveAttribute("href", scenario.link);
      const placement = await card.evaluate((el) => ({
        afterDemo: Boolean(document.getElementById("library-h").compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING),
        beforeEarlyAccess: Boolean(el.compareDocumentPosition(document.getElementById("early-title")) & Node.DOCUMENT_POSITION_FOLLOWING),
      }));
      assert.deepEqual(placement, { afterDemo: true, beforeEarlyAccess: true });
      const btn = await order.boundingBox();
      assert(btn.height >= 44 && btn.x >= 0 && btn.x + btn.width <= screen.width);
      await card.screenshot({ path: resolve(evidence, `${scenario.name}-${screen.name}.png`) });
      await demo.focus();
      for (let n = 0; n < 40 && !(await order.evaluate((el) => el === document.activeElement)); n++) await page.keyboard.press("Tab");
      await expect(order).toBeFocused();
      assert.equal(await order.evaluate((el) => getComputedStyle(el).outlineStyle), "solid");
      await Promise.all([page.waitForURL(scenario.link), page.keyboard.press("Enter")]);
      assert(enteredCheckout);
      await page.goBack();
      await expect(order).toBeVisible();
    } else {
      await expect(card).toHaveCount(0);
      await expect(order).toHaveCount(0);
      await expect(page.getByRole("link", { name: "Try the Stripe test checkout" })).toHaveCount(0);
      await early.scrollIntoViewIfNeeded();
      await page.locator(".early").screenshot({ path: resolve(evidence, `${scenario.name}-${screen.name}.png`) });
    }
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.goto(`${base}/?payment=success&session_id=synthetic-return`);
    await expect(page.getByText(/payment (?:confirmed|successful)|order confirmed/i)).toHaveCount(0);
    await demo.click();
    await expect(page).toHaveURL(`${base}/lesson/demo`);
    await page.locator(".bigplay").click();
    await page.waitForFunction(() => Number(document.querySelector(".seek input")?.value) > 0.5);

    await page.goto(base);
    await page.getByLabel("Email address", { exact: true }).fill("pilot-test@example.invalid");
    await page.getByRole("button", { name: "Notify me" }).click();
    await expect(page.getByText("Thanks, you are on the list.")).toBeVisible();
    assert(signup);
    assert.deepEqual(errors, []);
    console.log(`PASS ${scenario.name} / ${screen.width}×${screen.height}: no overflow, demo plays, early access posts to mocked form${scenario.link ? ", keyboard follows intercepted Stripe URL, back is not a payment" : ", no checkout visible"}`);
  } finally {
    await ctx.close();
  }
}

const browser = await launchBrowser();
try {
  for (const scenario of cases) {
    const env = { ...common, NEXT_TELEMETRY_DISABLED: "1", CONTEXT: scenario.context, ...scenario.env };
    npmBuild(env);
    const { routes } = JSON.parse(readFileSync(".next/prerender-manifest.json", "utf8"));
    assert(Object.hasOwn(routes, "/"), "homepage must be prerendered with the deploy context");
    const port = await freePort();
    const base = `http://127.0.0.1:${port}`;
    // Deliberately omit CONTEXT and offer values at runtime: Netlify supplies them to Builds only.
    const server = spawn(process.execPath, [next, "start", "-H", "127.0.0.1", "-p", port], { env: { ...common, NEXT_TELEMETRY_DISABLED: "1" }, stdio: ["ignore", "inherit", "inherit"] });
    try {
      let ready = false;
      for (let i = 0; i < 80 && server.exitCode === null; i++) {
        ready = await fetch(base).then((res) => res.ok).catch(() => false);
        if (ready) break;
        await pause(250);
      }
      assert(ready, `${scenario.name}: Next start did not become ready`);
      for (const screen of screens) await checkPage(browser, base, scenario, screen);
    } finally {
      if (server.exitCode === null && server.signalCode === null) {
        const exited = once(server, "exit");
        server.kill();
        await exited;
      }
    }
  }
  console.log(`${cases.length * screens.length}/${cases.length * screens.length} browser scenarios passed. Local checkout navigation only; Stripe was not contacted. Screenshots: ${evidence}`);
} finally {
  await browser.close();
}
