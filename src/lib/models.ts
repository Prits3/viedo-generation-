// Which model does which job, per provider. Server-only: reads process.env, never sent to the browser
// except as { configured: boolean, model names }.
//
// Roles
//   fast    outline of the source, mapping statements to source blocks, repairing single scenes
//   strong  storyboard, narration, visual metaphors, directions for the mascot
//   vision  reading a selected original figure or table from a page image
//
// Bedrock is the default when AWS_BEARER_TOKEN_BEDROCK is set; the direct Anthropic API stays
// available as an explicit choice (LESSON_PROVIDER=anthropic or the selector on the upload page).

export type ProviderId = "bedrock" | "anthropic";
export type Role = "fast" | "strong" | "vision";

/** Bump when prompts or the draft schemas change; stored with every lesson. */
export const PROMPT_VERSION = "2026-11-22.1";

// Defaults confirmed live with the team key on 2026-11-21 (see README, "Confirmed Bedrock capabilities").
// The key reaches Bedrock's OpenAI-compatible endpoint (bedrock-mantle); Claude models on Bedrock
// are not enabled for this account, so the defaults are models that are.
const BEDROCK_DEFAULTS: Record<Role, string> = {
  fast: "zai.glm-4.7-flash",
  strong: "mistral.mistral-large-3-675b-instruct",
  vision: "mistral.mistral-large-3-675b-instruct",
};

const ANTHROPIC_DEFAULTS: Record<Role, string> = {
  fast: "claude-haiku-5-5",
  strong: "claude-opus-5-5",
  vision: "claude-opus-5-5",
};

export function bedrockRegion(): string {
  return process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-1";
}

/**
 * Base URL of Bedrock's OpenAI-compatible API. BEDROCK_ENDPOINT overrides it (a proxy, or the
 * mock provider used by scripts/check-upload-failures.mjs).
 */
export function bedrockEndpoint(): string {
  return (process.env.BEDROCK_ENDPOINT || `https://bedrock-mantle.${bedrockRegion()}.api.aws/v1`).replace(/\/$/, "");
}

export function providerConfigured(p: ProviderId): boolean {
  if (p === "bedrock") return Boolean(process.env.AWS_BEARER_TOKEN_BEDROCK);
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

export function defaultProvider(): ProviderId | null {
  const forced = process.env.LESSON_PROVIDER;
  if ((forced === "bedrock" || forced === "anthropic") && providerConfigured(forced)) return forced;
  if (providerConfigured("bedrock")) return "bedrock";
  if (providerConfigured("anthropic")) return "anthropic";
  return null;
}

export function modelFor(p: ProviderId, role: Role): string {
  if (p === "bedrock") {
    // BEDROCK_MODEL_ID (the variable the Python backend uses) selects one model for every role.
    const single = process.env.BEDROCK_MODEL_ID;
    const perRole = { fast: process.env.BEDROCK_MODEL_FAST, strong: process.env.BEDROCK_MODEL_STRONG, vision: process.env.BEDROCK_MODEL_VISION }[role];
    return perRole || single || BEDROCK_DEFAULTS[role];
  }
  const perRole = { fast: process.env.LESSON_MODEL_FAST, strong: process.env.LESSON_MODEL, vision: process.env.LESSON_MODEL_VISION || process.env.LESSON_MODEL }[role];
  return perRole || ANTHROPIC_DEFAULTS[role];
}

export function modelsFor(p: ProviderId): Record<Role, string> {
  return { fast: modelFor(p, "fast"), strong: modelFor(p, "strong"), vision: modelFor(p, "vision") };
}

/**
 * List prices in USD per million tokens, used only for the cost estimate shown after a run.
 * Bedrock: aws.amazon.com/bedrock/pricing, US regions, read 2026-11-21.
 * Anthropic: published list prices for the direct API.
 * A model that is not listed gets no estimate rather than a guess.
 */
const PRICES: Record<string, { in: number; out: number }> = {
  "mistral.mistral-large-3-675b-instruct": { in: 0.5, out: 1.5 },
  "mistral.ministral-3-14b-instruct": { in: 0.2, out: 0.2 },
  "zai.glm-4.7-flash": { in: 0.07, out: 0.4 },
  "zai.glm-4.7": { in: 0.6, out: 2.2 },
  "zai.glm-5": { in: 1.0, out: 3.2 },
  "qwen.qwen3-vl-235b-a22b-instruct": { in: 0.53, out: 2.66 },
  "deepseek.v3.2": { in: 0.62, out: 1.85 },
  "moonshotai.kimi-k2.5": { in: 0.6, out: 3.0 },
  "google.gemma-3-27b-it": { in: 0.23, out: 0.38 },
  "claude-opus-5-5": { in: 4, out: 20 },
  "claude-sonnet-5-5": { in: 2, out: 10 },
  "claude-haiku-5-5": { in: 0.1, out: 0.5 },
};

export function estimateCost(model: string, inputTokens: number, outputTokens: number): number | null {
  const p = PRICES[model];
  if (!p) return null;
  return +((inputTokens * p.in + outputTokens * p.out) / 1e6).toFixed(5);
}
