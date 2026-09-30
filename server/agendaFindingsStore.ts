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
  // Bounded per scan and per field: a calendar full of (shared or invited)
  // events can't fill the table or keep the scan busy. One statement, not
  // one round trip per event.
  const batch = findings.slice(0, MAX_FINDINGS_PER_SCAN);
  // Re-finding the same event (a retry after a failed delivery) is a no-op.
  await query(
    `INSERT INTO agenda_scan_findings (user_id, google_event_id, title, event_date, prep_steps)
     SELECT $1, f.id, f.title, f.day, f.steps
       FROM unnest($2::text[], $3::text[], $4::text[], $5::int[]) AS f(id, title, day, steps)
     ON CONFLICT (user_id, google_event_id) DO NOTHING`,
    [
      userId,
      batch.map((f) => String(f.googleEventId).slice(0, 1024)),
      batch.map((f) => String(f.title || '').slice(0, 200)),
      batch.map((f) => f.eventDate),
      batch.map((f) => Math.max(0, Math.min(100, Math.round(Number(f.prepSteps) || 0)))),
    ]
  );
  // Old findings (events long past) are only clutter.
  await query(`DELETE FROM agenda_scan_findings WHERE user_id = $1 AND event_date < to_char(now() - interval '60 days', 'YYYY-MM-DD')`, [userId]).catch(() => {});
}

const MAX_FINDINGS_PER_SCAN = 50;

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
