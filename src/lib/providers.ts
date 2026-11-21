// Server-only. One function, two providers: a structured, streamed model call whose output is
// validated against a zod schema before anything else sees it.
//
//   bedrock    Bedrock's OpenAI-compatible endpoint (bedrock-mantle), authenticated with the
//              Bedrock API key in AWS_BEARER_TOKEN_BEDROCK. Structured output via json_schema,
//              streaming via server-sent events.
//   anthropic  The Anthropic API through the official SDK (ANTHROPIC_API_KEY).
//
// Keys are read from the environment here and nowhere else; they are never logged or returned.
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import * as z from "zod/v4";
import { GenerateError } from "./errors.ts";
import { DEFAULT_EFFORT, EFFORTS, LIMITS } from "./limits.ts";
import { bedrockEndpoint, estimateCost, modelFor, type ProviderId, type Role } from "./models.ts";

export interface RunRecord {
  step: string;
  provider: ProviderId;
  model: string;
  role: Role;
  ms: number;
  inputTokens: number;
  outputTokens: number;
  /** Estimate from list prices; null when the model has no listed price. */
  costUsd: number | null;
  /** 1 = succeeded on the first request. */
  attempts: number;
}

export interface StructuredCall<T> {
  provider: ProviderId;
  role: Role;
  /** Name of the pipeline step, for the run log. */
  step: string;
  system: string;
  user: string;
  /** PNG images (base64, no data: prefix) placed after the text. */
  images?: string[];
  schema: z.ZodType<T>;
  schemaName: string;
  maxTokens?: number;
  /** Bedrock only. Default 0.3. */
  temperature?: number;
  onProgress?: (outputChars: number) => void;
  signal?: AbortSignal;
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new GenerateError("timeout", "The request was cancelled."));
    });
  });

function effortLevel(): (typeof EFFORTS)[number] {
  const e = process.env.LESSON_EFFORT as (typeof EFFORTS)[number] | undefined;
  return e && EFFORTS.includes(e) ? e : DEFAULT_EFFORT;
}

function parseAndValidate<T>(text: string, schema: z.ZodType<T>): T {
  let raw: unknown;
  try {
    const trimmed = text.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
    raw = JSON.parse(trimmed);
  } catch {
    throw new GenerateError("invalid_model_output", "The model did not return valid JSON.");
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) throw new GenerateError("invalid_model_output", `The model output did not match the schema (${parsed.error.issues.length} issue(s), first at "${parsed.error.issues[0]?.path.join(".")}").`);
  return parsed.data;
}

// ───────────────────────── Bedrock (OpenAI-compatible endpoint) ─────────────────────────
interface Attempt {
  text: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
}

class Retryable extends Error {
  after: number;
  final: GenerateError;
  constructor(final: GenerateError, after: number) {
    super(final.message);
    this.final = final;
    this.after = after;
  }
}

async function bedrockOnce<T>(call: StructuredCall<T>, model: string, signal: AbortSignal): Promise<Attempt> {
  const token = process.env.AWS_BEARER_TOKEN_BEDROCK;
  if (!token) throw new GenerateError("missing_key", "AWS_BEARER_TOKEN_BEDROCK is not set on the server.");
  const content = call.images?.length
    ? [{ type: "text", text: call.user }, ...call.images.map((b64) => ({ type: "image_url", image_url: { url: `data:image/png;base64,${b64}` } }))]
    : call.user;
  let res: Response;
  try {
    res = await fetch(`${bedrockEndpoint()}/chat/completions`, {
      method: "POST",
      signal,
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({
        model,
        stream: true,
        stream_options: { include_usage: true },
        // Several models on this endpoint cap answers at 32,768 tokens.
        max_completion_tokens: Math.min(call.maxTokens ?? LIMITS.maxOutputTokens, 32_000),
        temperature: call.temperature ?? 0.3,
        messages: [
          { role: "system", content: call.system },
          { role: "user", content },
        ],
        response_format: { type: "json_schema", json_schema: { name: call.schemaName, strict: true, schema: z.toJSONSchema(call.schema) } },
      }),
    });
  } catch (err) {
    if (signal.aborted) throw new GenerateError("timeout", "The model call was stopped (cancelled or timed out).");
    throw new Retryable(new GenerateError("upstream_error", `Bedrock could not be reached (${(err as Error).name}).`), 1500);
  }

  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    let msg = "";
    try {
      const j = JSON.parse(body);
      msg = String(j.error?.message ?? j.message ?? "");
    } catch {
      /* not JSON */
    }
    msg = msg.replace(/\s+/g, " ").slice(0, 200);
    if (res.status === 429) throw new Retryable(new GenerateError("rate_limited", "Bedrock rate limit reached for this key."), Math.min(8000, Number(res.headers.get("retry-after")) * 1000 || 2500));
    if (res.status >= 500) throw new Retryable(new GenerateError("upstream_error", `Bedrock returned status ${res.status}.`), 2000);
    if (/not available for this account|does not exist|isn't supported|not supported|does not support/i.test(msg) || res.status === 404) throw new GenerateError("no_model_access", `${model}: ${msg || "model not available"}`);
    if (res.status === 401 || res.status === 403) throw new GenerateError("missing_key", "Bedrock rejected the configured API key.");
    throw new GenerateError("upstream_error", `Bedrock rejected the request (status ${res.status}${msg ? ": " + msg : ""}).`);
  }

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let text = "";
  let finish = "";
  let usage = { prompt_tokens: 0, completion_tokens: 0 };
  let sent = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let nl;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") continue;
        let ev: { choices?: { delta?: { content?: string }; finish_reason?: string | null }[]; usage?: typeof usage; error?: { message?: string } };
        try {
          ev = JSON.parse(data);
        } catch {
          continue;
        }
        if (ev.error) throw new Retryable(new GenerateError("upstream_error", "Bedrock ended the stream with an error."), 2000);
        const ch = ev.choices?.[0];
        if (ch?.delta?.content) {
          text += ch.delta.content;
          if (text.length - sent > 600) {
            sent = text.length;
            call.onProgress?.(text.length);
          }
        }
        if (ch?.finish_reason) finish = ch.finish_reason;
        if (ev.usage) usage = ev.usage;
      }
    }
  } catch (err) {
    if (err instanceof Retryable || err instanceof GenerateError) throw err;
    if (signal.aborted) throw new GenerateError("timeout", "The model call was stopped (cancelled or timed out).");
    throw new Retryable(new GenerateError("upstream_error", "The connection to Bedrock dropped during the answer."), 1500);
  }
  if (finish === "content_filter") throw new GenerateError("model_refused", "The model's content filter declined the request.");
  if (finish === "length") throw new GenerateError("invalid_model_output", "The answer was cut off at the output limit.");
  return { text, inputTokens: usage.prompt_tokens ?? 0, outputTokens: usage.completion_tokens ?? 0, model };
}

// ───────────────────────── Anthropic API ─────────────────────────
async function anthropicOnce<T>(call: StructuredCall<T>, model: string, signal: AbortSignal): Promise<Attempt> {
  const client = new Anthropic({ timeout: LIMITS.modelTimeoutMs, maxRetries: 0 });
  const content: Anthropic.Beta.BetaContentBlockParam[] = [{ type: "text", text: call.user }];
  for (const data of call.images ?? []) content.push({ type: "image", source: { type: "base64", media_type: "image/png", data } });
  try {
    const stream = client.beta.messages.stream(
      {
        model,
        max_tokens: call.maxTokens ?? LIMITS.maxOutputTokens,
        // Server-side fallback: if a safety classifier declines the request, the API retries it
        // on the model's default fallback instead of failing the run.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: call.system,
        output_config: { effort: effortLevel(), format: betaZodOutputFormat(call.schema) },
        messages: [{ role: "user", content }],
      },
      { signal },
    );
    let chars = 0;
    let sent = 0;
    stream.on("text", (delta) => {
      chars += delta.length;
      if (chars - sent > 600) {
        sent = chars;
        call.onProgress?.(chars);
      }
    });
    const message = await stream.finalMessage();
    if (message.stop_reason === "refusal") throw new GenerateError("model_refused", "The model declined the request.");
    if (message.stop_reason === "max_tokens") throw new GenerateError("invalid_model_output", "The answer was cut off at the output limit.");
    const text = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    return { text, inputTokens: message.usage.input_tokens, outputTokens: message.usage.output_tokens, model: message.model };
  } catch (err) {
    if (err instanceof GenerateError) throw err;
    if (err instanceof Anthropic.APIUserAbortError) throw new GenerateError("timeout", "The request was cancelled.");
    if (err instanceof Anthropic.APIConnectionTimeoutError) throw new GenerateError("timeout", "The model call timed out.");
    if (err instanceof Anthropic.AuthenticationError) throw new GenerateError("missing_key", "The configured Anthropic API key was rejected.");
    if (err instanceof Anthropic.PermissionDeniedError || err instanceof Anthropic.NotFoundError) throw new GenerateError("no_model_access", `${model} is not available for this key.`);
    if (err instanceof Anthropic.RateLimitError) throw new Retryable(new GenerateError("rate_limited", "The model provider rate limit was reached."), Math.min(8000, Number(err.headers?.get?.("retry-after")) * 1000 || 2500));
    if (err instanceof Anthropic.BadRequestError) throw new GenerateError("upstream_error", "The model service rejected the request.");
    if (err instanceof Anthropic.APIConnectionError) throw new Retryable(new GenerateError("upstream_error", "The model service could not be reached."), 1500);
    if (err instanceof Anthropic.APIError) {
      const e = new GenerateError("upstream_error", `The model service returned status ${err.status ?? "unknown"}.`);
      if ((err.status ?? 0) >= 500) throw new Retryable(e, 2000);
      throw e;
    }
    throw new GenerateError("upstream_error", "Unexpected error while calling the model.");
  }
}

/**
 * Runs one structured model call. Temporary errors (rate limit, 5xx, dropped connection) are retried
 * at most LIMITS.maxRetries times; a refusal, a missing key or missing model access ends the call at once.
 */
export async function callStructured<T>(call: StructuredCall<T>): Promise<{ data: T; run: RunRecord }> {
  const model = modelFor(call.provider, call.role);
  const timeout = AbortSignal.timeout(LIMITS.modelTimeoutMs);
  const signal = call.signal ? AbortSignal.any([call.signal, timeout]) : timeout;
  const t0 = Date.now();
  let attempts = 0;
  for (;;) {
    attempts++;
    try {
      const a = call.provider === "bedrock" ? await bedrockOnce(call, model, signal) : await anthropicOnce(call, model, signal);
      const data = parseAndValidate(a.text, call.schema);
      return {
        data,
        run: { step: call.step, provider: call.provider, model: a.model, role: call.role, ms: Date.now() - t0, inputTokens: a.inputTokens, outputTokens: a.outputTokens, costUsd: estimateCost(model, a.inputTokens, a.outputTokens), attempts },
      };
    } catch (err) {
      // A malformed answer is worth exactly one more try; it is not a temporary provider error.
      if (err instanceof GenerateError && err.code === "invalid_model_output" && attempts === 1) continue;
      if (err instanceof Retryable) {
        if (attempts > LIMITS.maxRetries) throw err.final;
        await sleep(err.after * attempts, signal);
        continue;
      }
      throw err;
    }
  }
}
