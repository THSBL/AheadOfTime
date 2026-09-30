import { query } from './db.js';

/**
 * Google identity pinning. An email address is not a stable identity: a
 * company can give a former employee's Google Workspace address to someone
 * new. Google's `sub` (the account's permanent id) is, so the first Google
 * account seen for an address is recorded, and a different Google account
 * using that same address later is refused instead of inheriting the old
 * account's plans, Telegram link and calendar access.
 */

let ready: Promise<void> | null = null;
function ensureColumn(): Promise<void> {
  if (!ready) {
    ready = query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS google_sub TEXT`)
      .then(() => undefined)
      .catch((err) => {
        ready = null;
        throw err;
      });
  }
  return ready;
}

// Per instance: most requests come from the same few people.
const known = new Map<string, string>();

/**
 * True when this Google account may act as this email: first use (the id is
 * recorded now) or the same Google account as before. False when the address
 * now belongs to a different Google account.
 */
export async function checkGoogleSubject(email: string, sub: string | null | undefined): Promise<boolean> {
  if (!sub) return true; // Google didn't say (older token): nothing to compare, keep the old behaviour.
  const key = email.toLowerCase().trim();
  const cached = known.get(key);
  if (cached) return cached === sub;
  await ensureColumn();
  const rows = await query<{ google_sub: string | null }>(
    `UPDATE users SET google_sub = COALESCE(google_sub, $2) WHERE lower(email) = $1 RETURNING google_sub`,
    [key, sub]
  );
  const stored = rows[0]?.google_sub;
  if (!stored) return true; // no account yet: the session route records it on creation
  known.set(key, stored);
  return stored === sub;
}

/** Records the Google account for a freshly created or linked user (first one wins). */
export async function bindGoogleSubject(userId: string, sub: string | null | undefined): Promise<void> {
  if (!sub) return;
  await ensureColumn();
  await query(`UPDATE users SET google_sub = COALESCE(google_sub, $2) WHERE id = $1`, [userId, sub]);
}
