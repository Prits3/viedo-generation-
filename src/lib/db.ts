// Postgres access for the signup waitlist.
//
// Reads a standard Postgres connection string from the environment. Works with any
// Postgres host; set up here for Supabase. Use the *pooler* connection string from
// Supabase (Project → Settings → Database → "Connection string" → Transaction pooler),
// which is required for serverless/Vercel. `prepare: false` is needed for that pooler.
//
// Local dev / preview without a database: hasDb() is false and the API degrades
// gracefully instead of crashing.

import postgres from "postgres";

const connectionString =
  process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.SUPABASE_DB_URL || "";

let client: ReturnType<typeof postgres> | null = null;
let schemaReady: Promise<void> | null = null;

export function hasDb(): boolean {
  return connectionString.length > 0;
}

export function db() {
  if (!connectionString) throw new Error("No database connection string configured (set DATABASE_URL).");
  if (!client) {
    client = postgres(connectionString, {
      prepare: false, // Supabase transaction pooler does not support prepared statements
      ssl: "require",
      max: 1, // serverless-friendly: one socket per function instance
      idle_timeout: 20,
      connect_timeout: 10,
    });
  }
  return client;
}

// Create the signups table on first use so there is no separate migration step.
export async function ensureSchema(): Promise<void> {
  const sql = db();
  if (!schemaReady) {
    schemaReady = (async () => {
      await sql`
        create table if not exists signups (
          id bigserial primary key,
          email text not null unique,
          source text,
          created_at timestamptz not null default now()
        )
      `;
    })().catch((err) => {
      // Reset so a later request can retry (e.g. transient connection error).
      schemaReady = null;
      throw err;
    });
  }
  await schemaReady;
}
