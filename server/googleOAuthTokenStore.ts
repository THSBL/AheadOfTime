import { query } from './db.js';
import { encryptSecret, decryptSecret } from './cryptoUtil.js';
import { getGoogleClientId } from './googleClientId.js';
import { DEFAULT_NOTIFY_PREFS, isValidTimeZone, parseChannelList, type NotifyPrefs } from './notifyPrefs.js';

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
export function missingBackgroundSyncConfig(): string[] {
  // The client id is not listed: it is public and always resolvable (see googleClientId.ts).
  return ['GOOGLE_OAUTH_CLIENT_SECRET', 'NOTIFY_LINK_SECRET', 'TOKEN_ENCRYPTION_KEY'].filter(
    (name) => !process.env[name]?.trim()
  );
}

export function isBackgroundSyncConfigured(): boolean {
  return missingBackgroundSyncConfig().length === 0;
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
      await query(`ALTER TABLE google_oauth_tokens ADD COLUMN IF NOT EXISTS notify_channel TEXT`);
      // Update preferences: channels (comma list, any combination), how often,
      // and the local time, plus when the last update went out.
      await query(`ALTER TABLE google_oauth_tokens ADD COLUMN IF NOT EXISTS notify_channels TEXT`);
      await query(`ALTER TABLE google_oauth_tokens ADD COLUMN IF NOT EXISTS notify_frequency TEXT`);
      await query(`ALTER TABLE google_oauth_tokens ADD COLUMN IF NOT EXISTS notify_hour SMALLINT`);
      await query(`ALTER TABLE google_oauth_tokens ADD COLUMN IF NOT EXISTS notify_weekday SMALLINT`);
      await query(`ALTER TABLE google_oauth_tokens ADD COLUMN IF NOT EXISTS notify_timezone TEXT`);
      await query(`ALTER TABLE google_oauth_tokens ADD COLUMN IF NOT EXISTS last_update_sent_at TIMESTAMPTZ`);
      // Where the server-side push (server/googleBackgroundPush.ts) records
      // what it created in Google, so nothing is ever pushed twice.
      await query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS google_event_id TEXT`);
      await query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS google_event_link TEXT`);
      await query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS synced_to_google_at TIMESTAMPTZ`);
      await query(`ALTER TABLE milestones ADD COLUMN IF NOT EXISTS google_task_id TEXT`);
      await query(
        `CREATE TABLE IF NOT EXISTS agenda_scan_findings (
           id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
           user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
           google_event_id TEXT NOT NULL,
           title           TEXT NOT NULL,
           event_date      TEXT NOT NULL,
           prep_steps      INTEGER NOT NULL DEFAULT 0,
           found_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
           notified_via    TEXT,
           dismissed_at    TIMESTAMPTZ,
           UNIQUE (user_id, google_event_id)
         )`
      );
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

export { NOTIFY_CHANNELS, type NotifyChannel } from './notifyPrefs.js';

export interface StoredNotifyPrefs {
  prefs: NotifyPrefs;
  /** False until the user has saved preferences at least once (defaults apply). */
  saved: boolean;
}

/** The token-row columns that make up the preferences (also selected by the daily scan). */
export interface NotifyPrefsColumns {
  notify_channel?: string | null;
  notify_channels?: string | null;
  notify_frequency?: string | null;
  notify_hour?: number | null;
  notify_weekday?: number | null;
  notify_timezone?: string | null;
}

/** Builds preferences from a token row, falling back to defaults (and to the old single channel). */
export function prefsFromRow(row: NotifyPrefsColumns | undefined): StoredNotifyPrefs {
  if (!row) return { prefs: { ...DEFAULT_NOTIFY_PREFS }, saved: false };
  const channels =
    row.notify_channels != null ? parseChannelList(row.notify_channels) : parseChannelList(row.notify_channel);
  const prefs: NotifyPrefs = {
    channels,
    frequency: row.notify_frequency === 'weekly' ? 'weekly' : 'daily',
    hour: Number.isInteger(row.notify_hour) ? (row.notify_hour as number) : DEFAULT_NOTIFY_PREFS.hour,
    weekday: Number.isInteger(row.notify_weekday) ? (row.notify_weekday as number) : DEFAULT_NOTIFY_PREFS.weekday,
    timezone: isValidTimeZone(row.notify_timezone) ? row.notify_timezone : DEFAULT_NOTIFY_PREFS.timezone,
  };
  const saved = row.notify_channels != null || row.notify_channel != null || row.notify_frequency != null;
  return { prefs, saved };
}

export async function getNotifyPrefs(userId: string): Promise<StoredNotifyPrefs> {
  await ensureBackgroundSyncSchema();
  const rows = await query<NotifyPrefsColumns>(
    `SELECT notify_channel, notify_channels, notify_frequency, notify_hour, notify_weekday, notify_timezone
       FROM google_oauth_tokens WHERE user_id = $1`,
    [userId]
  );
  return prefsFromRow(rows[0]);
}

export async function setNotifyPrefs(userId: string, prefs: NotifyPrefs): Promise<void> {
  await ensureBackgroundSyncSchema();
  await query(
    `UPDATE google_oauth_tokens
        SET notify_channels = $2, notify_frequency = $3, notify_hour = $4, notify_weekday = $5, notify_timezone = $6
      WHERE user_id = $1`,
    [userId, prefs.channels.join(','), prefs.frequency, prefs.hour, prefs.weekday, prefs.timezone]
  );
}

export async function unlinkBackgroundSync(userId: string): Promise<void> {
  await ensureBackgroundSyncSchema();
  await query(`DELETE FROM agenda_scan_findings WHERE user_id = $1`, [userId]);
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

  const clientId = getGoogleClientId();
  const clientSecret = getGoogleClientSecret();
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

/** The OAuth client secret, tolerant of the stray whitespace or quotes a copy-paste adds. */
export function getGoogleClientSecret(): string {
  return (process.env.GOOGLE_OAUTH_CLIENT_SECRET || '').trim().replace(/^["']|["']$/g, '').trim();
}

export function describeSecretShape(secret: string): string {
  return `secret shape: length=${secret.length}, startsWithGOCSPX=${secret.startsWith('GOCSPX-')}`;
}

export async function exchangeAuthorizationCode(code: string, redirectUri: string): Promise<{ refreshToken: string; scope: string } | null> {
  const clientId = getGoogleClientId();
  const clientSecret = getGoogleClientSecret();
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
    // Shape only, never the value: Google client secrets start with GOCSPX- and
    // are 35 characters, so this tells the owner whether the wrong thing got pasted.
    console.error('Google authorization code exchange failed:', res.status, body, describeSecretShape(clientSecret));
    // Not the same as 'no refresh token': the caller must not tell the user to
    // reconnect when the fault is this deployment's own configuration.
    throw new Error('google_code_exchange_failed');
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
