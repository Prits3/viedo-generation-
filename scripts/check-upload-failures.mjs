// Checks how the upload API behaves when live generation cannot run:
//   1. no API key on the server            -> missing_key
//   2. provider answers 429 (rate limit)   -> rate_limited   (local mock of the provider, no real call)
//   3. visitor exceeds the server's limit  -> rate_limited
// Needs a production build (`npm run build`) and a short text PDF.
//   node scripts/check-upload-failures.mjs <paper.pdf>
import http from "node:http";
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";

const pdfPath = process.argv[2];
if (!pdfPath) {
  console.error("usage: node scripts/check-upload-failures.mjs <paper.pdf>");
  process.exit(2);
}
const pdf = readFileSync(pdfPath);
let failed = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

// Stand-in for the model provider that always answers "rate limited".
let providerCalls = 0;
const mock = http.createServer((req, res) => {
  providerCalls++;
  res.writeHead(429, { "content-type": "application/json", "x-should-retry": "false" });
  res.end(JSON.stringify({ type: "error", error: { type: "rate_limit_error", message: "mock rate limit" } }));
});
await new Promise((r) => mock.listen(0, "127.0.0.1", r));
const mockUrl = `http://127.0.0.1:${mock.address().port}`;

async function withServer(port, env, fn) {
  const clean = { ...process.env };
  for (const k of ["ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN", "ANTHROPIC_BASE_URL", "LESSON_RATE_LIMIT_MAX"]) delete clean[k];
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(port)], { env: { ...clean, ...env }, stdio: "ignore" });
  try {
    for (let i = 0; i < 60; i++) {
      try {
        if ((await fetch(`http://127.0.0.1:${port}/api/generate`)).ok) break;
      } catch {
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    child.kill();
  }
}

async function upload(base) {
  const body = new FormData();
  body.append("file", new Blob([pdf], { type: "application/pdf" }), "paper.pdf");
  const res = await fetch(`${base}/api/generate`, { method: "POST", body });
  const events = (await res.text()).trim().split("\n").map((l) => JSON.parse(l));
  return events.at(-1);
}

await withServer(3231, {}, async (base) => {
  const cfg = await (await fetch(`${base}/api/generate`)).json();
  const last = await upload(base);
  check("no API key: config endpoint reports not configured", cfg.configured === false);
  check("no API key: upload ends with missing_key and a readable reason", last.type === "error" && last.code === "missing_key" && /not configured/i.test(last.title), `${last.code}: ${last.title}`);
});

await withServer(3232, { ANTHROPIC_API_KEY: "test-key-not-real", ANTHROPIC_BASE_URL: mockUrl }, async (base) => {
  const last = await upload(base);
  check("provider 429: upload ends with rate_limited", last.type === "error" && last.code === "rate_limited" && providerCalls > 0, `${last.code}: ${last.detail} (provider calls: ${providerCalls})`);
});

await withServer(3233, { ANTHROPIC_API_KEY: "test-key-not-real", ANTHROPIC_BASE_URL: mockUrl, LESSON_RATE_LIMIT_MAX: "1" }, async (base) => {
  await upload(base);
  const before = providerCalls;
  const last = await upload(base);
  check("server limit: second upload is stopped before any provider call", last.type === "error" && last.code === "rate_limited" && /This server allows 1/.test(last.detail ?? "") && providerCalls === before, `${last.code}: ${last.detail}`);
});

mock.close();
process.exit(failed ? 1 : 0);
