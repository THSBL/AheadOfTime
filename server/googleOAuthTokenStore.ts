import { query } from './db.js';
import { encryptSecret, decryptSecret } from './cryptoUtil.js';

/**
 * Server-side counterpart to src/services/googleAuth.ts's browser-only
 * implicit-flow token. That file's access token lives in sessionStorage
 * and is never issued a refresh token by design (GIS token-client flow) -
 * it cannot outlive the tab, let alone be used by a cron. This store
 * holds the authorization-code flow's long-lived refresh token instead,
 * obtained once via the api/auth/google/authorize + callback round trip,
 * so a background job with no browser can still call Google Calendar/
 * Tasks on the user's behalf.
 */

const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';

/**
 * Whether this deployment has everything background sync needs. Any one of
 * these missing makes the flow fail partway through (authorize, consent
 * callback, or refresh-token storage), and the raw server message was
 * being shown to users as an error banner - the UI uses this to hide the
 * feature until the deployment is actually set up for it.
 */
export function isBackgroundSyncConfigured(): boolean {
  const has = (name: string) => Boolean(process.env[name]?.trim());
  return (
    has('VITE_GOOGLE_CLIENT_ID') &&
    has('GOOGLE_OAUTH_CLIENT_SECRET') &&
    has('NOTIFY_LINK_SECRET') &&
    has('TOKEN_ENCRYPTION_KEY')
  );
}

let schemaReady: Promise<void> | null = null;

/**
 * Idempotent and memoised per instance, so the feature does not hinge on
 * someone remembering to run `npm run db:migrate` against production: the
 * first call creates the table if it is missing and adds the scan-progress
 * column (both also live in server/db/schema.sql).
 */
export function ensureBackgroundSyncSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await query(
        `CREATE TABLE IF NOT EXISTS google_oauth_tokens (
           user_id                 UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
           encrypted_refresh_token TEXT NOT NULL,
           scope                   TEXT,
           linked_at               TIMESTAMPTZ NOT NULL DEFAULT now(),
           last_refreshed_at       TIMESTAMPTZ,
           revoked_at              TIMESTAMPTZ
         )`
      );
      await query(`ALTER TABLE google_oauth_tokens ADD COLUMN IF NOT EXISTS last_agenda_scan_at TIMESTAMPTZ`);
    })().catch((err) => {
      schemaReady = null; // retry on the next call instead of caching a failure
      throw err;
    });
  }
  return schemaReady;
}

/** Test hook: forget the memoised schema check. */
export function resetSchemaCheckForTests(): void {
  schemaReady = null;
}

export async function storeRefreshToken(userId: string, refreshToken: string, scope: string): Promise<void> {
  await ensureBackgroundSyncSchema();
  const encrypted = encryptSecret(refreshToken);
  await query(
    `INSERT INTO google_oauth_tokens (user_id, encrypted_refresh_token, scope, linked_at, last_refreshed_at, revoked_at)
     VALUES ($1, $2, $3, now(), now(), NULL)
     ON CONFLICT (user_id) DO UPDATE SET
       encrypted_refresh_token = EXCLUDED.encrypted_refresh_token,
       scope = EXCLUDED.scope,
       linked_at = now(),
       last_refreshed_at = now(),
       revoked_at = NULL`,
    [userId, encrypted, scope]
  );
}

export async function hasBackgroundSyncLinked(userId: string): Promise<boolean> {
  await ensureBackgroundSyncSchema();
  const rows = await query<{ revoked_at: string | null }>(
    `SELECT revoked_at FROM google_oauth_tokens WHERE user_id = $1`,
    [userId]
  );
  return rows.length > 0 && !rows[0].revoked_at;
}

export async function unlinkBackgroundSync(userId: string): Promise<void> {
  await ensureBackgroundSyncSchema();
  await query(`DELETE FROM google_oauth_tokens WHERE user_id = $1`, [userId]);
}

async function markRevoked(userId: string): Promise<void> {
  await query(`UPDATE google_oauth_tokens SET revoked_at = now() WHERE user_id = $1`, [userId]);
}

/**
 * Returns a fresh, short-lived access token for this user by exchanging
 * their stored refresh token, or null if they haven't linked background
 * sync or their grant was revoked (checked in their own Google Account
 * settings - a real, expected case this must handle gracefully rather
 * than throwing, since a cron runs across many users in one pass).
 */
export async function getValidAccessToken(userId: string): Promise<string | null> {
  const rows = await query<{ encrypted_refresh_token: string; revoked_at: string | null }>(
    `SELECT encrypted_refresh_token, revoked_at FROM google_oauth_tokens WHERE user_id = $1`,
    [userId]
  );
  const row = rows[0];
  if (!row || row.revoked_at) return null;

  const clientId = process.env.VITE_GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.warn('getValidAccessToken: GOOGLE_OAUTH_CLIENT_SECRET is not configured.');
    return null;
  }

  const refreshToken = decryptSecret(row.encrypted_refresh_token);

  const res = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (body?.error === 'invalid_grant') {
      // The user revoked access in their own Google account settings, or
      // the refresh token otherwise stopped being valid - stop retrying
      // and let the caller decide how to tell the user their sync broke.
      await markRevoked(userId);
    } else {
      console.warn('Google token refresh failed (non-fatal):', res.status, body);
    }
    return null;
  }

  const data = await res.json();
  await query(`UPDATE google_oauth_tokens SET last_refreshed_at = now() WHERE user_id = $1`, [userId]);
  return data.access_token as string;
}

export async function exchangeAuthorizationCode(code: string, redirectUri: string): Promise<{ refreshToken: string; scope: string } | null> {
  const clientId = process.env.VITE_GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error('GOOGLE_OAUTH_CLIENT_SECRET is not configured in environment.');
  }

  const res = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error('Google authorization code exchange failed:', res.status, body);
    return null;
  }

  const data = await res.json();
  // A refresh_token is only issued the FIRST time a user consents (or
  // after prompt=consent forces re-consent) - if this user had already
  // granted offline access before and Google omits it on a repeat grant,
  // there's nothing new to store; the caller should treat this as "still
  // linked" rather than an error when a prior token already exists.
  if (!data.refresh_token) {
    return null;
  }
  return { refreshToken: data.refresh_token as string, scope: data.scope as string };
}
