import test from 'node:test';
import assert from 'node:assert/strict';
import { handleSignup, normaliseEmail } from '../src/lib/waitlist.mjs';

const env = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://fixture.supabase.co',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_FAKE_TEST_FIXTURE',
};
const signup = (body, options = {}) => handleSignup(new Request('http://localhost/api/signup', {
  method: 'POST', body: JSON.stringify(body),
}), { env, ...options });

test('valid signup sends only normalized email, fixed source and consent; DB supplies created_at', async () => {
  const res = await signup({ email: '  EXAMPLE@Example.com  ', source: 'other', marketing_consent: false, created_at: 'override' }, {
    request: async (url, init) => {
      assert.equal(url, 'https://fixture.supabase.co/rest/v1/waitlist');
      assert.equal(init.method, 'POST');
      assert.equal(init.redirect, 'error');
      assert.equal(init.headers.get('apikey'), env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
      assert.equal(init.headers.get('Prefer'), 'return=minimal');
      assert.deepEqual(JSON.parse(init.body), { email: 'example@example.com', source: 'landing_page', marketing_consent: true });
      return new Response(null, { status: 201 });
    },
  });
  assert.equal(res.status, 201);
  assert.deepEqual(await res.json(), { ok: true, status: 'signed_up' });
});

test('unique conflicts receive a distinct result and no row content', async () => {
  const res = await signup({ email: 'example@example.com' }, {
    request: async () => Response.json({ code: '23505', details: 'not returned to the browser' }, { status: 409 }),
  });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, status: 'already_signed_up' });
});

test('invalid email and honeypot never reach Supabase', async () => {
  for (const email of ['not-an-email', 'one@@example.com', 'a'.repeat(65) + '@example.com', 'foo@-example.com', 'foo@example.com\u0000', null]) {
    assert.equal(normaliseEmail(email), null);
    assert.equal((await signup({ email }, { request: () => assert.fail('unexpected request') })).status, 400);
  }
  assert.equal((await signup({ website: 'bot' }, { request: () => assert.fail('unexpected request') })).status, 201);
});

test('missing configuration, unrelated conflicts, permissions and transport failures all return generic 503', async () => {
  const attempts = [
    { env: {}, request: () => assert.fail('unexpected request') },
    { env: { ...env, NEXT_PUBLIC_SUPABASE_URL: 'https://fixture.supabase.co.invalid' }, request: () => assert.fail('unexpected request') },
    { env: { ...env, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'invalid-key-type' }, request: () => assert.fail('unexpected request') },
    { request: async () => Response.json({ code: '23503', details: 'private' }, { status: 409 }) },
    { request: async () => Response.json({ code: '42501', details: 'private' }, { status: 403 }) },
    { request: async () => { throw new Error('private'); } },
  ];
  for (const options of attempts) {
    const res = await signup({ email: 'example@example.com' }, options);
    assert.equal(res.status, 503);
    assert.deepEqual(await res.json(), { ok: false, error: 'We couldn’t complete your signup. Please try again.' });
  }
});
