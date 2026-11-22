// Build with the fake Supabase settings below. All signup requests are intercepted.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { launchBrowser } from './browser.mjs';

const out = join(process.env.TEMP ?? tmpdir(), 'opencode', `learnlayla-cinema-${Date.now()}`);
mkdirSync(out, { recursive: true });
const portProbe = createServer().listen(0, '127.0.0.1');
await once(portProbe, 'listening');
const { port } = portProbe.address();
await new Promise((resolve, reject) => portProbe.close((error) => error ? reject(error) : resolve()));
const base = `http://127.0.0.1:${port}`;
const provider = 'https://fixture.supabase.co/rest/v1/waitlist';
const app = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', String(port)], {
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
    const stage = page.locator('.cinema-frame');
    const animations = await stage.evaluate((el) => el.getAnimations({ subtree: true }).map((a) => a.animationName));
    if (reducedMotion === 'reduce') {
      assert.deepEqual(animations, []);
      assert.equal(await page.getByRole('button', { name: 'Pause motion' }).isVisible(), false);
    }
    else {
      assert.ok(animations.includes('layla-lap'), `${label}: mascot flight missing`);
      const poses = await stage.evaluate((el) => {
        const tracks = el.getAnimations({ subtree: true });
        const pilot = el.querySelector('[data-flight-pilot]');
        if (!pilot) throw new Error('Missing pilot');
        return [0, 2200, 5300, 7600, 10000].map((time) => {
          tracks.forEach((track) => { track.pause(); track.currentTime = time; });
          const { x, y } = pilot.getBoundingClientRect();
          return { x, y };
        });
      });
      assert.ok(Math.abs(poses[2].x - poses[0].x) > width * .1, `${label}: pilot does not cross the stage`);
      assert.ok(Math.abs(poses[1].y - poses[0].y) > 35, `${label}: pilot does not climb`);
      assert.deepEqual(poses[4], poses[0], `${label}: loop does not close`);
      if (label === 'desktop') {
        for (const [name, time] of [['takeoff', 0], ['bank', 4700], ['return', 7600]]) {
          await stage.evaluate((el, ms) => el.getAnimations({ subtree: true }).forEach((animation) => { animation.currentTime = ms; }), time);
          await shot(`desktop-${name}`);
        }
        if (process.argv.includes('--loop-frames')) {
          const frames = join(out, 'loop-frames');
          mkdirSync(frames);
          for (let i = 0; i < 80; i++) {
            await stage.evaluate((el, ms) => el.getAnimations({ subtree: true }).forEach((animation) => { animation.currentTime = ms; }), i * 125);
            await stage.screenshot({ path: join(frames, `frame-${String(i).padStart(3, '0')}.png`), scale: 'css' });
          }
        }
      }
      await stage.evaluate((el) => el.getAnimations({ subtree: true }).forEach((animation) => { animation.currentTime = 2200; }));
    }
    await shot(label);
    if (label === 'mobile') await page.screenshot({ path: join(out, 'mobile-full.png'), fullPage: true, scale: 'css' });
    assert.equal(await page.getByRole('link', { name: /Play the example lesson/ }).getAttribute('href'), '/lesson/demo');
    assert.equal(await page.getByRole('link', { name: 'Try an upload' }).getAttribute('href'), '/upload');
    return { page, input, button };
  };
  const desktop = await open('desktop', 1440, 900);
  // Reload to test the real CSS playback control rather than the paused visual snapshots.
  await desktop.page.reload({ waitUntil: 'networkidle' });
  const pilot = desktop.page.locator('[data-flight-pilot]');
  const location = () => pilot.evaluate((el) => getComputedStyle(el).transform);
  const start = await location();
  await desktop.page.waitForFunction((initial) => getComputedStyle(document.querySelector('[data-flight-pilot]')).transform !== initial, start);
  await desktop.page.getByRole('button', { name: 'Pause motion' }).click();
  await desktop.page.waitForFunction(() => getComputedStyle(document.querySelector('[data-flight-pilot]')).animationPlayState === 'paused');
  const hold = await location();
  await desktop.page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await location(), hold);
  await desktop.page.getByRole('button', { name: 'Resume motion' }).click();
  await desktop.page.waitForFunction((initial) => getComputedStyle(document.querySelector('[data-flight-pilot]')).transform !== initial, hold);
  await desktop.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const dock = desktop.page.locator('[data-flight-dock]');
  await dock.waitFor();
  await desktop.page.waitForFunction(() => getComputedStyle(document.querySelector('[data-flight-pilot]')).animationPlayState === 'paused');
  assert.equal(await dock.evaluate((el) => getComputedStyle(el).pointerEvents), 'none');
  await desktop.page.screenshot({ path: join(out, 'desktop-scroll.png'), scale: 'css' });
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
  console.log('PASS: 1440/390/360 layout, continuous mascot lap and pause/resume, scroll companion, reduced motion, signup above fold, invalid/focus and mock signup 201/409/503, demo/upload/privacy routes, no browser errors.');
  console.log(`Screenshots: ${out}`);
} finally {
  await browser?.close();
  if (app.exitCode === null && app.signalCode === null) {
    const exit = once(app, 'exit');
    app.kill();
    await exit;
  }
}
