// Run after npm run build. Uses only a local server and a fake Supabase fixture.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { launchBrowser } from './browser.mjs';

const shim = `const real = globalThis.fetch;
const emails = new Set();
globalThis.fetch = async (input, init) => {
  if (input !== 'https://fixture.supabase.co/rest/v1/waitlist') return real(input, init);
  const body = JSON.parse(init.body);
  if (init.method !== 'POST' || init.headers.get('apikey') !== 'sb_publishable_FAKE_TEST_FIXTURE' ||
      body.email !== 'pilot@example.invalid' || body.source !== 'landing_page' || body.marketing_consent !== true) {
    return new Response(null, { status: 422 });
  }
  if (emails.has(body.email)) return Response.json({ code: '23505' }, { status: 409 });
  emails.add(body.email);
  return new Response(null, { status: 201 });
};`;

async function withApp(configured, verify) {
  const base = 'http://127.0.0.1:19359';
  const app = spawn(process.execPath, [
    '--import', `data:text/javascript;base64,${Buffer.from(shim).toString('base64')}`,
    'node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', '19359',
  ], {
    env: {
      ...process.env, NEXT_TELEMETRY_DISABLED: '1',
      NEXT_PUBLIC_SUPABASE_URL: configured ? 'https://fixture.supabase.co' : '',
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: configured ? 'sb_publishable_FAKE_TEST_FIXTURE' : '',
    },
    stdio: 'inherit',
  });
  try {
    let ready = false;
    for (let i = 0; i < 50 && !ready; i++) {
      if (app.exitCode !== null) break;
      ready = (await fetch(base).catch(() => null))?.ok === true;
      if (!ready) await delay(200);
    }
    assert.ok(ready, 'Next.js did not start');
    await verify(base);
  } finally {
    if (app.exitCode === null && app.signalCode === null) {
      const exit = once(app, 'exit');
      app.kill();
      await exit;
    }
  }
}

const browser = await launchBrowser();
try {
  const page = await browser.newPage({ viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true });
  const email = page.getByRole('textbox', { name: 'Email address' });
  const submit = page.getByRole('button', { name: 'Notify me' });
  const send = async (address, base, status) => {
    await email.fill(address);
    const response = page.waitForResponse((r) => r.url() === `${base}/api/signup` && r.request().method() === 'POST');
    await submit.click();
    assert.equal((await response).status(), status);
  };
  await withApp(true, async (base) => {
    await page.goto(base);
    await submit.waitFor();
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Page overflows the mobile viewport');
    for (const element of [email, submit]) {
      const rect = await element.boundingBox();
      assert.ok(rect && rect.x >= 0 && rect.x + rect.width <= 360, 'Form control is clipped');
    }
    let posted = false;
    page.on('request', (req) => { if (req.method() === 'POST') posted = true; });
    await email.fill('bad-address');
    await submit.click();
    await page.getByRole('alert').filter({ hasText: 'Please enter a valid email address.' }).waitFor();
    assert.equal(posted, false);
    await send('PILOT@Example.Invalid', base, 201);
    await page.getByText('You’re signed up!', { exact: true }).waitFor();
    await page.reload();
    await send('pilot@example.invalid', base, 200);
    await page.getByText('You’re already signed up.', { exact: true }).waitFor();
    assert.equal((await fetch(`${base}/api/signup`)).status, 405, 'Signup records must not be readable through the app route');
    console.log('PASS: mobile layout, invalid email, valid signup, duplicate, no read route.');
  });
  await withApp(false, async (base) => {
    await page.goto(base);
    await send('pilot@example.invalid', base, 503);
    await page.getByText('We couldn’t complete your signup. Please try again.', { exact: true }).waitFor();
    console.log('PASS: missing configuration returns the expected error.');
  });
} finally {
  await browser.close();
}
