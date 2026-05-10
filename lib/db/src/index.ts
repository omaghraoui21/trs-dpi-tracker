import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// ─── Connection pool config ───────────────────────────────────────────────────
// Railway is a long-running process (not serverless), so we can use a standard
// pool. Supabase Postgres supports up to ~60 direct connections on the free
// plan — keep max low to leave headroom for migrations and seeds.
//
// Use the Supabase "Session mode" pooler (port 5432) — NOT Transaction mode —
// because Drizzle ORM uses prepared statements which require session affinity.
//
// Connection string format for Supabase Session pooler:
//   postgresql://postgres.[PROJECT-ID]:[PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:5432/postgres
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,                  // max concurrent connections per Railway instance
  idleTimeoutMillis: 30_000, // release idle connections after 30 s
  connectionTimeoutMillis: 5_000, // fail fast if DB is unreachable
});

export const db = drizzle(pool, { schema });

export * from "./schema";
