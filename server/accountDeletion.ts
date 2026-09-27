import { query } from './db.js';
import { verifyRequestUser } from './requestAuth.js';
import { decryptSecret } from './cryptoUtil.js';
import { buildClearedSessionCookie } from './sessionStore.js';

/**
 * DELETE /api/auth/account { confirm: "DELETE" }
 *
 * Deletes the signed-in user's account and everything stored for it:
 * events and tasks, profile, sessions, Telegram link, Background Sync grant
 * (also revoked at Google), feedback, AI usage and quality logs - every
 * table references users(id) ON DELETE CASCADE. Calendar-poll answers are
 * deleted too (they only reference the user with SET NULL, and may hold an
 * email address). Nothing in the user's own Google Calendar is touched.
 */
export async function handleAccountDeletion(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'DELETE' && req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'Method not allowed' });
    return;
  }
  const verified = await verifyRequestUser(req);
  if (!verified) {
    res.status(401).json({ ok: false, error: 'Unauthorized' });
    return;
  }
  if (req.body?.confirm !== 'DELETE') {
    res.status(400).json({ ok: false, error: 'Confirmation missing' });
    return;
  }

  const rows = await query<{ id: string }>(`SELECT id FROM users WHERE lower(email) = lower($1)`, [verified.email]);
  const userId = rows[0]?.id;
  if (userId) {
    // Revoke the Background Sync grant at Google first (best effort), so the
    // stored refresh token can't be used even if a copy existed somewhere.
    const tokenRows = await query<{ encrypted_refresh_token: string }>(
      `SELECT encrypted_refresh_token FROM google_oauth_tokens WHERE user_id = $1`,
      [userId]
    ).catch(() => []);
    for (const row of tokenRows) {
      try {
        const token = decryptSecret(row.encrypted_refresh_token);
        await fetch('https://oauth2.googleapis.com/revoke', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token }),
        });
      } catch (err) {
        console.warn('Google grant revoke during account deletion failed (continuing):', err);
      }
    }
    await query(`DELETE FROM calendar_preference_votes WHERE user_id = $1`, [userId]).catch(() => {});
    await query(`DELETE FROM users WHERE id = $1`, [userId]);
  }

  res.setHeader('Set-Cookie', buildClearedSessionCookie());
  res.status(200).json({ ok: true, deleted: Boolean(userId) });
}
