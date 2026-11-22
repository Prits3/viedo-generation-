// Build with the fake Supabase settings below. All signup requests are intercepted.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { launchBrowser } from './browser.mjs';

const out = join(process.env.TEMP ?? tmpdir(), 'opencode', `learnlayla-cinema-${Date.now()}`);
mkdirSync(out, { recursive: true });
const base = 'http://127.0.0.1:19367';
const provider = 'https://fixture.supabase.co/rest/v1/waitlist';
const app = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', '19367'], {
  env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' }, stdio: 'inherit',
});
let browser;
try {
  let ready = false;
  for (let i = 0; i < 50 && !ready && app.exitCode === null; i++) {
    ready = (await fetch(base).catch(() => null))?.ok === true;
    if (!ready) await delay(150);
  }
  assert.ok(ready, 'Next.js did not start');
  browser = await launchBrowser();
  const errors = [];
  const open = async (label, width, height, reducedMotion = 'no-preference') => {
    const page = await browser.newPage({ viewport: { width, height }, reducedMotion });
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error' && !/status of (409|503)/.test(message.text())) errors.push(message.text());
    });
    await page.route('**/*', (route) => route.request().url().startsWith(`${base}/`) ? route.continue() : route.abort());
    const asset = page.waitForResponse((r) => r.url() === `${base}/landing-city.svg` && r.ok());
    assert.equal((await page.goto(base))?.status(), 200);
    await asset;
    const input = page.getByRole('textbox', { name: 'Email address' });
    const button = page.getByRole('button', { name: 'Join waitlist' });
    for (const control of [input, button]) {
      const rect = await control.boundingBox();
      assert.ok(rect && rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= width && rect.y + rect.height <= height && rect.height >= 44, `${label}: signup must fit above the fold`);
    }
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${label}: page overflows`);
    const shot = (name) => page.screenshot({ path: join(out, `${name}.png`), scale: 'css' });
    const animations = await page.locator('.cinema-hero').evaluate((el) => el.getAnimations({ subtree: true }).map((a) => a.animationName));
    if (reducedMotion === 'reduce') assert.deepEqual(animations, []);
    else {
      assert.ok(animations.includes('cinema-push'), `${label}: motion missing`);
      if (label === 'desktop') {
        await page.locator('.cinema-hero').evaluate((el) => el.getAnimations({ subtree: true }).forEach((animation) => { animation.pause(); animation.currentTime = 440; }));
        await shot('desktop-motion');
      }
      await page.locator('.cinema-hero').evaluate((el) => el.getAnimations({ subtree: true }).forEach((animation) => animation.finish()));
    }
    await shot(label);
    if (label === 'mobile') await page.screenshot({ path: join(out, 'mobile-full.png'), fullPage: true, scale: 'css' });
    assert.equal(await page.getByRole('link', { name: /Play the example lesson/ }).getAttribute('href'), '/lesson/demo');
    assert.equal(await page.getByRole('link', { name: 'Try an upload' }).getAttribute('href'), '/upload');
    return { page, input, button };
  };
  const desktop = await open('desktop', 1440, 900);
  await desktop.page.close();
  const small = await open('compact', 360, 740);
  await small.page.close();
  const reduced = await open('reduced', 390, 844, 'reduce');
  await reduced.page.close();
  const { page, input, button } = await open('mobile', 390, 844);
  const posts = [];
  const results = [201, 409, 503];
  await page.route(provider, async (route) => {
    posts.push({ method: route.request().method(), body: route.request().postDataJSON() });
    await route.fulfill({ status: results.shift() ?? 500 });
  });
  await input.fill('invalid');
  await button.click();
  await page.getByText('Please enter a valid email address.', { exact: true }).waitFor();
  assert.equal(await input.evaluate((el) => el === document.activeElement), true);
  assert.equal(posts.length, 0);
  for (const message of ['You’re signed up!', 'You’re already signed up.', 'We couldn’t complete your signup. Please try again.']) {
    await input.fill('Pilot@Example.invalid');
    await button.click();
    await page.getByText(message, { exact: true }).waitFor();
    if (results.length) await page.reload();
  }
  assert.deepEqual(posts, Array.from({ length: 3 }, () => ({ method: 'POST', body: { email: 'pilot@example.invalid', source: 'landing_page', marketing_consent: true } })));
  assert.deepEqual(errors, []);
  for (const path of ['/lesson/demo', '/upload', '/privacy']) assert.equal((await fetch(base + path)).status, 200, path);
  console.log('PASS: 1440/390/360 layout, signup above fold, reduced motion, invalid/focus and mock signup 201/409/503, demo/upload/privacy routes, no browser errors.');
  console.log(`Screenshots: ${out}`);
} finally {
  await browser?.close();
  if (app.exitCode === null && app.signalCode === null) {
    const exit = once(app, 'exit');
    app.kill();
    await exit;
  }
}
