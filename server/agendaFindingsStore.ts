import { query } from './db.js';
import { ensureBackgroundSyncSchema } from './googleOAuthTokenStore.js';

/**
 * New calendar events the daily scan found for a user. They double as the
 * in-app fallback notice: a finding whose notified_via is still NULL was NOT
 * delivered over Telegram/email, so the app shows it the next time the user
 * opens it (see components/AgendaFindingsBanner.tsx).
 */

export interface FindingInput {
  googleEventId: string;
  title: string;
  eventDate: string; // YYYY-MM-DD
  prepSteps: number;
}

export interface AgendaFinding {
  id: string;
  title: string;
  eventDate: string;
  prepSteps: number;
}

export async function recordFindings(userId: string, findings: FindingInput[]): Promise<void> {
  if (findings.length === 0) return;
  await ensureBackgroundSyncSchema();
  for (const f of findings) {
    // Re-finding the same event (a retry after a failed delivery) is a no-op.
    await query(
      `INSERT INTO agenda_scan_findings (user_id, google_event_id, title, event_date, prep_steps)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, google_event_id) DO NOTHING`,
      [userId, f.googleEventId, f.title, f.eventDate, f.prepSteps]
    );
  }
}

/** Marks these events as delivered over an external channel (no in-app notice needed). */
export async function markFindingsNotified(userId: string, googleEventIds: string[], via: 'telegram' | 'email'): Promise<void> {
  if (googleEventIds.length === 0) return;
  await ensureBackgroundSyncSchema();
  await query(
    `UPDATE agenda_scan_findings SET notified_via = $3
      WHERE user_id = $1 AND google_event_id = ANY($2::text[])`,
    [userId, googleEventIds, via]
  );
}

/** Undelivered, undismissed findings for events that have not happened yet. */
export async function listPendingFindings(userId: string, todayIso: string): Promise<AgendaFinding[]> {
  await ensureBackgroundSyncSchema();
  const rows = await query<{ id: string; title: string; event_date: string; prep_steps: number }>(
    `SELECT id, title, event_date, prep_steps
       FROM agenda_scan_findings
      WHERE user_id = $1 AND notified_via IS NULL AND dismissed_at IS NULL AND event_date >= $2
      ORDER BY event_date ASC
      LIMIT 20`,
    [userId, todayIso.substring(0, 10)]
  );
  return rows.map((r) => ({ id: r.id, title: r.title, eventDate: r.event_date, prepSteps: r.prep_steps }));
}

export async function dismissAllFindings(userId: string): Promise<void> {
  await ensureBackgroundSyncSchema();
  await query(
    `UPDATE agenda_scan_findings SET dismissed_at = now() WHERE user_id = $1 AND dismissed_at IS NULL`,
    [userId]
  );
}
