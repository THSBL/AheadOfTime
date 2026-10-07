import crypto from 'crypto';
import { query } from './db.js';
import { appOrigin } from './appOrigin.js';
import { verifyRequestUser } from './requestAuth.js';
import { findOrCreateUserByEmail } from './telegramStore.js';

/**
 * Share a plan: a read-only public page (/p/<token>) showing one plan's
 * steps, dates and ideas - for a partner, a group or a team. Each share
 * stores a SNAPSHOT of just those fields (never notes, locations, the
 * owner's name or email, or any other plan), taken when the owner shares
 * and refreshed when they share again; "Stop sharing" turns the link off.
 * Example plans made by the weekly content drafter are shares without an
 * owner (user_id NULL).
 */

export interface SharedPlanStep {
  title: string;
  date: string;
  ideas: string[];
  done: boolean;
}

export interface SharedPlanSnapshot {
  title: string;
  eventDate: string;
  endDate?: string;
  eventTime?: string;
  category?: string;
  steps: SharedPlanStep[];
}

let schemaReady: Promise<void> | null = null;

function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      await query(
        `CREATE TABLE IF NOT EXISTS shared_plans (
           token       TEXT PRIMARY KEY,
           user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
           event_key   TEXT NOT NULL,
           snapshot    JSONB NOT NULL,
           created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
           updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
           revoked_at  TIMESTAMPTZ
         )`
      );
      await query(`CREATE UNIQUE INDEX IF NOT EXISTS shared_plans_owner_event ON shared_plans (user_id, event_key) WHERE user_id IS NOT NULL`);
    })().catch((err) => {
      schemaReady = null;
      throw err;
    });
  }
  return schemaReady;
}

const text = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const day = (v: unknown): string => {
  const s = typeof v === 'string' ? v.slice(0, 10) : '';
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
};

/** Only what a shared plan shows, trimmed - whatever the client sent. */
export function snapshotFromEvent(event: any): SharedPlanSnapshot | null {
  if (!event || typeof event !== 'object') return null;
  const title = text(event.title, 160);
  const eventDate = day(event.eventDate);
  if (!title || !eventDate) return null;
  const steps: SharedPlanStep[] = (Array.isArray(event.milestones) ? event.milestones : [])
    .filter((m: any) => m && m.isActive !== false && m.status !== 'skipped' && text(m.title, 140))
    .map((m: any) => ({
      title: text(m.title, 140),
      date: day(m.calculatedDate),
      ideas: (Array.isArray(m.deliverables) ? m.deliverables : [])
        .map((d: any) => text(typeof d === 'string' ? d : d?.title, 160))
        .filter(Boolean)
        .slice(0, 3),
      done: m.status === 'completed',
    }))
    .filter((s: SharedPlanStep) => s.date)
    .sort((a: SharedPlanStep, b: SharedPlanStep) => a.date.localeCompare(b.date))
    .slice(0, 40);
  const endDate = day(event.endDate);
  const time = text(event.eventTime, 5);
  return {
    title,
    eventDate,
    ...(endDate && endDate !== eventDate ? { endDate } : {}),
    ...(/^\d{2}:\d{2}$/.test(time) ? { eventTime: time } : {}),
    ...(text(event.category, 40) ? { category: text(event.category, 40) } : {}),
    steps,
  };
}

const newToken = () => crypto.randomBytes(12).toString('base64url');
export const sharedPlanUrl = (appUrl: string, token: string) => `${appUrl}/p/${token}`;

/** Creates or refreshes the owner's share of one plan; returns its token. */
export async function sharePlan(userId: string | null, eventKey: string, snapshot: SharedPlanSnapshot): Promise<string> {
  await ensureSchema();
  if (userId) {
    const existing = await query<{ token: string }>(`SELECT token FROM shared_plans WHERE user_id = $1 AND event_key = $2`, [userId, eventKey]);
    if (existing[0]) {
      await query(`UPDATE shared_plans SET snapshot = $2::jsonb, updated_at = now(), revoked_at = NULL WHERE token = $1`, [existing[0].token, JSON.stringify(snapshot)]);
      return existing[0].token;
    }
  }
  const token = newToken();
  await query(`INSERT INTO shared_plans (token, user_id, event_key, snapshot) VALUES ($1, $2, $3, $4::jsonb)`, [token, userId, eventKey, JSON.stringify(snapshot)]);
  return token;
}

export async function getSharedPlan(token: string): Promise<{ snapshot: SharedPlanSnapshot; updatedAt: string } | null> {
  if (!/^[A-Za-z0-9_-]{8,40}$/.test(token)) return null;
  await ensureSchema();
  const rows = await query<{ snapshot: SharedPlanSnapshot; updated_at: string | Date }>(
    // A plan its owner deleted isn't shown any more either.
    `SELECT sp.snapshot, sp.updated_at FROM shared_plans sp
      WHERE sp.token = $1 AND sp.revoked_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM events e
           WHERE e.user_id = sp.user_id AND COALESCE(e.client_id, e.id::text) = sp.event_key AND e.deleted_at IS NOT NULL
        )`,
    [token]
  );
  if (!rows[0]) return null;
  return { snapshot: rows[0].snapshot, updatedAt: new Date(rows[0].updated_at).toISOString() };
}

async function shareStatus(userId: string, eventKey: string): Promise<string | null> {
  await ensureSchema();
  const rows = await query<{ token: string }>(
    `SELECT token FROM shared_plans WHERE user_id = $1 AND event_key = $2 AND revoked_at IS NULL`,
    [userId, eventKey]
  );
  return rows[0]?.token || null;
}

async function stopSharing(userId: string, eventKey: string): Promise<void> {
  await ensureSchema();
  await query(`UPDATE shared_plans SET revoked_at = now() WHERE user_id = $1 AND event_key = $2 AND revoked_at IS NULL`, [userId, eventKey]);
}

/**
 * /api/plan/shared
 *   GET  ?token=...                  - the public plan (anyone with the link)
 *   GET  ?eventKey=...               - is this plan of mine shared? (signed in)
 *   POST {action:'share', event}     - share / refresh the snapshot (signed in)
 *   POST {action:'stop', eventKey}   - stop sharing (signed in)
 */
export async function handleSharedPlans(req: any, res: any) {
  const q = req.query || {};
  try {
    if (req.method === 'GET' && typeof q.token === 'string') {
      // Not cached: "Stop sharing" must take effect at once.
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('X-Robots-Tag', 'noindex');
      const plan = await getSharedPlan(q.token);
      if (!plan) return res.status(404).json({ ok: false, error: 'This shared plan is no longer available.' });
      return res.status(200).json({ ok: true, plan: plan.snapshot, updatedAt: plan.updatedAt });
    }

    res.setHeader('Cache-Control', 'no-store');
    const verified = await verifyRequestUser(req);
    if (!verified) return res.status(401).json({ ok: false, error: 'Sign in to share a plan.' });
    const userId = await findOrCreateUserByEmail(verified.email);
    const appUrl = appOrigin(req);

    if (req.method === 'GET' && typeof q.eventKey === 'string') {
      const token = await shareStatus(userId, text(q.eventKey, 120));
      return res.status(200).json({ ok: true, shared: Boolean(token), url: token ? sharedPlanUrl(appUrl, token) : null });
    }
    if (req.method === 'POST') {
      const body = req.body || {};
      const eventKey = text(body.eventKey || body.event?.id, 120);
      if (!eventKey) return res.status(400).json({ ok: false, error: 'Which plan?' });
      if (body.action === 'stop') {
        await stopSharing(userId, eventKey);
        return res.status(200).json({ ok: true, shared: false, url: null });
      }
      if (body.action === 'share') {
        if (JSON.stringify(body.event || {}).length > 200_000) return res.status(413).json({ ok: false, error: 'That plan is too large to share.' });
        const snapshot = snapshotFromEvent(body.event);
        if (!snapshot) return res.status(400).json({ ok: false, error: 'This plan needs a title and a date to be shared.' });
        const token = await sharePlan(userId, eventKey, snapshot);
        return res.status(200).json({ ok: true, shared: true, url: sharedPlanUrl(appUrl, token) });
      }
    }
    return res.status(400).json({ ok: false, error: 'Unknown request' });
  } catch (err: any) {
    console.error('Shared plans error:', err?.message || err);
    return res.status(503).json({ ok: false, error: 'Sharing is not available right now.' });
  }
}
