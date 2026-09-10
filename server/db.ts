import { Pool } from 'pg';

/**
 * Lazily-initialized Postgres connection pool, shared by server.ts (long-
 * running Express process) and the Vercel serverless functions under
 * api/*.ts alike - same lazy-singleton pattern as agentProcessor.ts's
 * getGeminiClient(), so a warm serverless instance reuses one pool across
 * invocations instead of reconnecting every time.
 *
 * Expects a pooled connection string (Neon's pooled/pgbouncer URL, which
 * Vercel's Postgres storage integration injects automatically) in
 * POSTGRES_URL or DATABASE_URL - either name is accepted since different
 * Vercel Postgres integrations have used different conventions.
 */
let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('No Postgres connection string found (expected POSTGRES_URL or DATABASE_URL env var).');
    }
    pool = new Pool({
      connectionString,
      ssl: { rejectUnauthorized: false },
    });
  }
  return pool;
}

export async function query<T = any>(text: string, params?: any[]): Promise<T[]> {
  const result = await getPool().query(text, params);
  return result.rows;
}
