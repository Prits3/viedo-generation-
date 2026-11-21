// In-memory limits for everything that calls a model: enough for a single demo server, reset on restart.
import { LIMITS } from "./limits.ts";

const hits = new Map<string, number[]>();
let running = 0;

export function clientKey(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}

/** Counts one generation for this visitor; true when the visitor is over the limit. */
export function rateLimited(key: string): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < LIMITS.rateLimitWindowMs);
  if (recent.length >= LIMITS.rateLimitMax) {
    hits.set(key, recent);
    return true;
  }
  recent.push(now);
  hits.set(key, recent);
  return false;
}

export const busy = () => running >= LIMITS.maxConcurrent;
export const enter = () => void running++;
export const leave = () => void running--;
export const RATE_TEXT = `This server allows ${LIMITS.rateLimitMax} generations per ${LIMITS.rateLimitWindowMs / 60000} minutes per visitor.`;
