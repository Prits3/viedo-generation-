// Reusable Supabase browser client.
//
// Uses the PUBLISHABLE (anon) key only — safe to ship to the browser. Both values are
// read from NEXT_PUBLIC_* environment variables; no key is hard-coded here.
// Returns null when the env vars are absent so callers can degrade gracefully.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

let client: SupabaseClient | null = null;

export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (!url || !publishableKey) return null;
  if (!client) {
    client = createClient(url, publishableKey, {
      auth: { persistSession: false },
    });
  }
  return client;
}
