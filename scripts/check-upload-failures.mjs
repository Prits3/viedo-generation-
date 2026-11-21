// Checks how the generation API behaves when a model call cannot succeed. No real provider is
// called: a local mock stands in for Bedrock and for the Anthropic API.
//   1. no key on the server                         -> missing_key
//   2. Bedrock answers 429 (rate limit)             -> rate_limited, after a bounded number of retries
//   3. Bedrock: model not enabled for the account   -> no_model_access, no retry
//   4. Bedrock: content filter declines             -> model_refused, run ended, nothing to resume
//   5. Anthropic API answers 429                    -> rate_limited (direct provider still selectable)
//   6. visitor exceeds the server's own limit       -> rate_limited before any provider call
// Needs a production build (`npm run build`) and a short text file.
//   node scripts/check-upload-failures.mjs <text.txt>
import http from "node:http";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const file = process.argv[2];
if (!file) {
  console.error("usage: node scripts/check-upload-failures.mjs <text.txt>");
  process.exit(2);
}
const text = readFileSync(file, "utf8");
let failed = 0;
const check = (name, ok, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`);
};

// Stand-in for both providers. The requested model name selects the behaviour.
let calls = 0;
const mock = http.createServer((req, res) => {
  let body = "";
  req.on("data", (d) => (body += d));
  req.on("end", () => {
    calls++;
    let model = "";
    try {
      model = JSON.parse(body).model ?? "";
    } catch {
      /* ignore */
    }
    if (model === "mock-no-access") {
      res.writeHead(403, { "content-type": "application/json" });
      return res.end(JSON.stringify({ error: { message: "mock-no-access is not available for this account." } }));
    }
    if (model === "mock-refuse") {
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write(`data: ${JSON.stringify({ choices: [{ index: 0, delta: { content: "" }, finish_reason: "content_filter" }] })}\n\n`);
      return res.end("data: [DONE]\n\n");
    }
    res.writeHead(429, { "content-type": "application/json", "retry-after": "1" });
    res.end(JSON.stringify({ type: "error", error: { type: "rate_limit_error", message: "mock rate limit" } }));
  });
});
await new Promise((r) => mock.listen(0, "127.0.0.1", r));
const mockUrl = `http://127.0.0.1:${mock.address().port}`;
const store = mkdtempSync(join(tmpdir(), "lessons-"));

async function withServer(port, env, fn) {
  const clean = { ...process.env };
  for (const k of Object.keys(clean)) if (/^(ANTHROPIC_|AWS_|BEDROCK_|LESSON_)/.test(k)) delete clean[k];
  const child = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(port)], { env: { ...clean, LESSON_STORE_DIR: store, LESSON_VOICE: "off", ...env }, stdio: "ignore" });
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

async function generate(base, provider) {
  const body = new FormData();
  body.append("text", text);
  if (provider) body.append("provider", provider);
  const res = await fetch(`${base}/api/generate`, { method: "POST", body });
  const events = (await res.text()).trim().split("\n").map((l) => JSON.parse(l));
  return events.at(-1);
}
const stored = async (base) => (await (await fetch(`${base}/api/lessons`)).json()).lessons;
const bedrock = (model, extra = {}) => ({ AWS_BEARER_TOKEN_BEDROCK: "test-key-not-real", BEDROCK_ENDPOINT: `${mockUrl}/v1`, BEDROCK_MODEL_ID: model, ...extra });

await withServer(3231, {}, async (base) => {
  const cfg = await (await fetch(`${base}/api/generate`)).json();
  const last = await generate(base);
  check("no key: config endpoint reports not configured, for both providers", cfg.configured === false && cfg.providers.every((p) => p.configured === false));
  check("no key: generation ends with missing_key and a readable reason", last.type === "error" && last.code === "missing_key" && /not configured/i.test(last.title), `${last.code}: ${last.title}`);
});

await withServer(3232, bedrock("mock-429"), async (base) => {
  const cfg = await (await fetch(`${base}/api/generate`)).json();
  check("bedrock: is the default provider when its key is set; the key itself is never returned", cfg.defaultProvider === "bedrock" && !JSON.stringify(cfg).includes("test-key-not-real"));
  const before = calls;
  const last = await generate(base);
  check("bedrock 429: generation ends with rate_limited after at most 3 requests (2 retries)", last.type === "error" && last.code === "rate_limited" && calls - before >= 2 && calls - before <= 3, `${last.code}: ${last.detail} (provider requests: ${calls - before})`);
  check("bedrock 429: the run is kept so it can be resumed later", Boolean(last.id) && (await stored(base)).some((l) => l.id === last.id && l.status === "failed"));
});

await withServer(3233, bedrock("mock-no-access"), async (base) => {
  const before = calls;
  const last = await generate(base);
  check("bedrock, model not enabled: generation ends with no_model_access after one request, naming the model", last.type === "error" && last.code === "no_model_access" && calls - before === 1 && /mock-no-access/.test(last.detail ?? ""), `${last.code}: ${last.detail}`);
});

await withServer(3234, bedrock("mock-refuse"), async (base) => {
  const before = calls;
  const n = (await stored(base)).length;
  const last = await generate(base);
  check("bedrock, content declined: generation ends with model_refused after one request and the run is removed", last.type === "error" && last.code === "model_refused" && calls - before === 1 && !last.id && (await stored(base)).length === n, `${last.code}: ${last.title} (provider requests: ${calls - before})`);
});

await withServer(3235, { ANTHROPIC_API_KEY: "test-key-not-real", ANTHROPIC_BASE_URL: mockUrl }, async (base) => {
  const before = calls;
  const last = await generate(base, "anthropic");
  check("anthropic 429: the direct provider is selectable and ends with rate_limited", last.type === "error" && last.code === "rate_limited" && calls > before, `${last.code}: ${last.detail} (provider requests: ${calls - before})`);
});

await withServer(3236, bedrock("mock-429", { LESSON_RATE_LIMIT_MAX: "1" }), async (base) => {
  await generate(base);
  const before = calls;
  const last = await generate(base);
  check("server limit: the second generation is stopped before any provider request", last.type === "error" && last.code === "rate_limited" && /This server allows 1/.test(last.detail ?? "") && calls === before, `${last.code}: ${last.detail}`);
});

mock.close();
rmSync(store, { recursive: true, force: true });
process.exit(failed ? 1 : 0);
