import { query } from './db.js';
import type { CalendarVoteInput } from '../src/utils/calendarPoll.js';

let schemaReady: Promise<void> | null = null;

/**
 * Idempotent and memoised per instance, like the app's other runtime schema
 * helpers, so the poll works without a manual migration. One row per
 * (visitor, source): answering again in the same place updates the vote.
 */
export function ensureCalendarPollSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await query(
        `CREATE TABLE IF NOT EXISTS calendar_preference_votes (
           id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
           visitor_id    TEXT NOT NULL,
           source        TEXT NOT NULL,
           calendar      TEXT NOT NULL,
           other_text    TEXT,
           notify_email  TEXT,
           user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
           created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
           updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
           UNIQUE (visitor_id, source)
         )`
      );
    })().catch((err) => {
      schemaReady = null;
      throw err;
    });
  }
  return schemaReady;
}

export async function recordCalendarVote(vote: CalendarVoteInput, userId?: string | null): Promise<void> {
  await ensureCalendarPollSchema();
  await query(
    `INSERT INTO calendar_preference_votes (visitor_id, source, calendar, other_text, notify_email, user_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (visitor_id, source) DO UPDATE SET
       calendar = EXCLUDED.calendar,
       other_text = EXCLUDED.other_text,
       notify_email = COALESCE(EXCLUDED.notify_email, calendar_preference_votes.notify_email),
       user_id = COALESCE(EXCLUDED.user_id, calendar_preference_votes.user_id),
       updated_at = now()`,
    [vote.visitorId, vote.source, vote.calendar, vote.otherText || null, vote.notifyEmail || null, userId || null]
  );
}

export interface CalendarPollSummary {
  /** Votes per source and calendar, e.g. { landing: { google: 12, outlook: 5 } }. */
  bySource: Record<string, Record<string, number>>;
  /** Distinct visitors per calendar, across all sources (their latest answer). */
  totalByCalendar: Record<string, number>;
  /** How many left an email to hear when their calendar is supported, per calendar. */
  notifyByCalendar: Record<string, number>;
  /** Recent free-text answers for "Something else". */
  recentOther: string[];
}

export async function summarizeCalendarVotes(): Promise<CalendarPollSummary> {
  await ensureCalendarPollSchema();
  const bySourceRows = await query<{ source: string; calendar: string; n: string }>(
    `SELECT source, calendar, COUNT(*)::text AS n FROM calendar_preference_votes GROUP BY source, calendar`
  );
  const totalRows = await query<{ calendar: string; n: string; notify: string }>(
    `SELECT calendar, COUNT(*)::text AS n, COUNT(notify_email)::text AS notify FROM (
       SELECT DISTINCT ON (visitor_id) visitor_id, calendar, notify_email
       FROM calendar_preference_votes ORDER BY visitor_id, updated_at DESC
     ) latest GROUP BY calendar`
  );
  const otherRows = await query<{ other_text: string }>(
    `SELECT other_text FROM calendar_preference_votes WHERE other_text IS NOT NULL ORDER BY updated_at DESC LIMIT 20`
  );
  const bySource: Record<string, Record<string, number>> = {};
  for (const r of bySourceRows) {
    bySource[r.source] = { ...(bySource[r.source] || {}), [r.calendar]: Number(r.n) };
  }
  const totalByCalendar: Record<string, number> = {};
  const notifyByCalendar: Record<string, number> = {};
  for (const r of totalRows) {
    totalByCalendar[r.calendar] = Number(r.n);
    notifyByCalendar[r.calendar] = Number(r.notify);
  }
  return { bySource, totalByCalendar, notifyByCalendar, recentOther: otherRows.map((r) => r.other_text) };
}
