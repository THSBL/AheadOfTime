import crypto from 'crypto';
import { query } from './db.js';

/**
 * App-owned login sessions. The browser used to prove who it was with a
 * Google access token on every request - kept in session storage, gone when
 * Chrome closes and expired after about an hour - so a reopened app showed
 * the cached summary while every server call was quietly refused. Now a
 * Google check happens once (POST /api/auth/session) and the server issues
 * its own session: a random token in an HttpOnly cookie, stored here only
 * as a SHA-256 hash, valid 30 days and renewed while the app is used.
 */
export const SESSION_COOKIE = 'aot_session';
export const SESSION_TTL_DAYS = 30;
const SESSION_TTL_MS = SESSION_TTL_DAYS * 24 * 60 * 60 * 1000;
// Renew (and record last use) at most this often, to keep writes rare.
const RENEW_AFTER_MS = 60 * 60 * 1000;

let schemaReady: Promise<void> | null = null;

export function ensureSessionSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await query(
        `CREATE TABLE IF NOT EXISTS user_sessions (
           id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
           user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
           email         TEXT NOT NULL,
           token_hash    TEXT NOT NULL UNIQUE,
           user_agent    TEXT,
           created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
           last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
           expires_at    TIMESTAMPTZ NOT NULL,
           revoked_at    TIMESTAMPTZ
         )`
      );
      await query(`CREATE INDEX IF NOT EXISTS user_sessions_user_idx ON user_sessions (user_id)`);
    })().catch((err) => {
      schemaReady = null;
      throw err;
    });
  }
  return schemaReady;
}

export function hashSessionToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** Creates a session and returns the raw token (only ever sent in the cookie). */
export async function createSession(userId: string, email: string, userAgent?: string | null): Promise<string> {
  await ensureSessionSchema();
  const token = crypto.randomBytes(32).toString('base64url');
  await query(
    `INSERT INTO user_sessions (user_id, email, token_hash, user_agent, expires_at)
     VALUES ($1, $2, $3, $4, $5)`,
    [userId, email.toLowerCase().trim(), hashSessionToken(token), userAgent ? String(userAgent).slice(0, 300) : null, new Date(Date.now() + SESSION_TTL_MS)]
  );
  return token;
}

/**
 * The session's user, or null when unknown, expired or revoked. Renews the
 * expiry (rolling 30 days) when it was last renewed over an hour ago.
 */
export async function verifySession(token: string | null | undefined): Promise<{ userId: string; email: string } | null> {
  if (!token || token.length < 20 || token.length > 200) return null;
  await ensureSessionSchema();
  const rows = await query<{ id: string; user_id: string; email: string; last_seen_at: string; expires_at: string; revoked_at: string | null }>(
    `SELECT id, user_id, email, last_seen_at, expires_at, revoked_at FROM user_sessions WHERE token_hash = $1`,
    [hashSessionToken(token)]
  );
  const row = rows[0];
  if (!row || row.revoked_at || new Date(row.expires_at).getTime() <= Date.now()) return null;
  if (Date.now() - new Date(row.last_seen_at).getTime() > RENEW_AFTER_MS) {
    await query(`UPDATE user_sessions SET last_seen_at = now(), expires_at = $2 WHERE id = $1`, [row.id, new Date(Date.now() + SESSION_TTL_MS)]).catch(() => {});
  }
  return { userId: row.user_id, email: row.email };
}

export async function revokeSession(token: string | null | undefined): Promise<void> {
  if (!token) return;
  await ensureSessionSchema();
  await query(`UPDATE user_sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL`, [hashSessionToken(token)]);
}

// --- Cookie helpers (work for both Express and Vercel's Node handlers) ---

export function readSessionCookie(req: any): string | null {
  const header: unknown = req?.headers?.cookie;
  if (typeof header !== 'string') return null;
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === SESSION_COOKIE) return decodeURIComponent(rest.join('='));
  }
  return null;
}

/**
 * HttpOnly (page scripts can't read it), Secure, SameSite=Lax (not sent on
 * cross-site POSTs, which blocks request forgery against the JSON API).
 * Browsers treat localhost as secure, so Secure also works in local dev.
 */
export function buildSessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL_DAYS * 24 * 60 * 60}`;
}

export function buildClearedSessionCookie(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}
