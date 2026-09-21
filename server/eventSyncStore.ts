import { query } from './db.js';
import { ensureEventSyncSchema, PURGE_AFTER_DAYS } from './eventSyncSchema.js';
import { findOrCreateUserByEmail, rowToCalendarEvent } from './telegramStore.js';
import type { CalendarEvent } from '../src/types.js';

/**
 * Multi-device event sync for signed-in web users.
 *
 * The web app used to keep every event it created (or scanned in) in that
 * browser's local storage only, so a second device saw nothing but the events
 * created over Telegram. Now each device pushes its changed events here and
 * pulls everyone else's:
 *
 *  - An event's public id is the id the web app gave it (`client_id`), else the
 *    database uuid (Telegram events) - identical on every device.
 *  - Conflicts are last-write-wins per event, by the client's own edit time.
 *  - Deleting is a SOFT delete (`deleted_at`): other devices drop the event,
 *    Settings can restore it, and the daily cron purges it after
 *    PURGE_AFTER_DAYS.
 *
 * Nothing here trusts the payload: every field is length-capped and shape-checked.
 */

const MAX_EVENTS_PER_PUSH = 100;
const MAX_MILESTONES_PER_EVENT = 300;
const MAX_PAYLOAD_CHARS = 60_000;
const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000;
const EPOCH = '1970-01-01T00:00:00.000Z';

const DATE_RE = /^\d{4}-\d{2}-\d{2}/;

function str(value: unknown, max: number, fallback = ''): string {
  return typeof value === 'string' ? value.slice(0, max) : fallback;
}
function optStr(value: unknown, max: number): string | null {
  return typeof value === 'string' && value.trim() ? value.slice(0, max) : null;
}
function isoOrNull(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

export interface SanitizedMilestone {
  publicId: string;
  title: string;
  description: string | null;
  category: string | null;
  calculatedDate: string;
  status: string;
  kind: string;
  deliverables: unknown[];
  completedAt: string | null;
  googleTaskId: string | null;
  payload: Record<string, unknown>;
}

export interface SanitizedEvent {
  publicId: string;
  title: string;
  category: string;
  eventDate: string;
  endDate: string | null;
  eventTime: string | null;
  location: string | null;
  status: string;
  context: Record<string, unknown>;
  payload: Record<string, unknown>;
  updatedAtMs: number;
  createdAt: string;
  milestones: SanitizedMilestone[];
}

function sanitizeMilestone(raw: any, eventDate: string, index: number): SanitizedMilestone | null {
  if (!raw || typeof raw !== 'object') return null;
  const publicId = str(raw.id, 128) || `ms-${index}-${Math.random().toString(36).slice(2, 8)}`;
  const status = ['pending', 'completed', 'skipped'].includes(raw.status) ? raw.status : 'pending';
  const { deliverables, ...rest } = raw;
  const payload = JSON.stringify(rest).length <= MAX_PAYLOAD_CHARS ? rest : {};
  return {
    publicId,
    title: str(raw.title, 500, 'Untitled task') || 'Untitled task',
    description: optStr(raw.description, 4000),
    category: optStr(raw.category, 64),
    calculatedDate: DATE_RE.test(String(raw.calculatedDate)) ? String(raw.calculatedDate).substring(0, 10) : eventDate,
    status,
    kind: str(raw.kind, 32, 'milestone') || 'milestone',
    deliverables: Array.isArray(deliverables) ? deliverables.slice(0, 50) : [],
    completedAt: isoOrNull(raw.completedAt),
    googleTaskId: optStr(raw.googleTaskId, 256),
    payload,
  };
}

export function sanitizeIncomingEvent(raw: any, nowMs: number = Date.now()): SanitizedEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const publicId = str(raw.id, 128);
  if (!publicId || !DATE_RE.test(String(raw.eventDate))) return null;
  const eventDate = String(raw.eventDate).substring(0, 10);

  const claimed = Date.parse(String(raw.updatedAt));
  const updatedAtMs = Number.isNaN(claimed) ? nowMs : Math.min(claimed, nowMs + MAX_CLOCK_SKEW_MS);

  const { milestones: rawMilestones, ...rest } = raw;
  const context = raw.context && typeof raw.context === 'object' && !Array.isArray(raw.context) ? raw.context : {};
  const milestones = (Array.isArray(rawMilestones) ? rawMilestones.slice(0, MAX_MILESTONES_PER_EVENT) : [])
    .map((m: any, i: number) => sanitizeMilestone(m, eventDate, i))
    .filter((m: SanitizedMilestone | null): m is SanitizedMilestone => m !== null);

  return {
    publicId,
    title: str(raw.title, 300, 'Untitled event') || 'Untitled event',
    category: str(raw.category, 64, 'general') || 'general',
    eventDate,
    endDate: DATE_RE.test(String(raw.endDate)) ? String(raw.endDate).substring(0, 10) : null,
    eventTime: optStr(raw.eventTime, 16),
    location: optStr(raw.location, 300),
    status: str(raw.status, 64, 'milestones_active') || 'milestones_active',
    context: JSON.stringify(context).length <= MAX_PAYLOAD_CHARS ? context : {},
    payload: JSON.stringify(rest).length <= MAX_PAYLOAD_CHARS ? rest : {},
    updatedAtMs,
    createdAt: isoOrNull(raw.createdAt) || new Date(nowMs).toISOString(),
    milestones,
  };
}

async function reconcileMilestones(eventUuid: string, incoming: SanitizedMilestone[]): Promise<void> {
  const existing = await query<{ id: string; client_id: string | null }>(
    `SELECT id, client_id FROM milestones WHERE event_id = $1`,
    [eventUuid]
  );
  const byPublicId = new Map(existing.map((r) => [r.client_id || r.id, r]));
  const keep = new Set<string>();

  for (const m of incoming) {
    keep.add(m.publicId);
    const row = byPublicId.get(m.publicId);
    const completed = m.status === 'completed';
    const confirmedAt = completed ? m.completedAt || new Date().toISOString() : null;
    if (row) {
      await query(
        `UPDATE milestones
            SET title = $2, description = $3, category = $4, calculated_date = $5, status = $6, kind = $7,
                deliverables = $8::jsonb, confirmed_at = $9, confirmed_via = $10,
                google_task_id = COALESCE($11, google_task_id), client_payload = $12::jsonb
          WHERE id = $1`,
        [
          row.id, m.title, m.description, m.category, m.calculatedDate, m.status, m.kind,
          JSON.stringify(m.deliverables), confirmedAt, completed ? 'web' : null, m.googleTaskId,
          JSON.stringify(m.payload),
        ]
      );
    } else {
      await query(
        `INSERT INTO milestones
           (event_id, title, description, category, calculated_date, status, kind, deliverables,
            confirmed_at, confirmed_via, google_task_id, client_id, client_payload)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, $12, $13::jsonb)`,
        [
          eventUuid, m.title, m.description, m.category, m.calculatedDate, m.status, m.kind,
          JSON.stringify(m.deliverables), confirmedAt, completed ? 'web' : null, m.googleTaskId, m.publicId,
          JSON.stringify(m.payload),
        ]
      );
    }
  }

  const stale = existing.filter((r) => !keep.has(r.client_id || r.id)).map((r) => r.id);
  if (stale.length > 0) {
    await query(`DELETE FROM milestones WHERE id = ANY($1::uuid[])`, [stale]);
  }
}

type UpsertOutcome = 'applied' | 'skipped';

async function upsertEvent(userId: string, e: SanitizedEvent): Promise<UpsertOutcome> {
  const found = await query<{ id: string; deleted_at: string | null; ver: string }>(
    `SELECT id, deleted_at, COALESCE(client_updated_at, updated_at) AS ver
       FROM events WHERE user_id = $1 AND (client_id = $2 OR id::text = $2) LIMIT 1`,
    [userId, e.publicId]
  );
  const existing = found[0];

  // Deleted somewhere: the tombstone wins. The pushing device learns of it
  // from the response and drops its copy.
  if (existing?.deleted_at) return 'skipped';

  let eventUuid: string;
  if (!existing) {
    // client_updated_at starts at the epoch and is only set to the real time
    // in the final UPDATE below: if anything fails half-way, the retry still
    // looks "newer" and re-applies instead of being skipped as up to date.
    const inserted = await query<{ id: string }>(
      `INSERT INTO events (user_id, title, category, event_date, end_date, event_time, location, status,
                           source_channel, context, client_id, client_updated_at, client_payload, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'web', $9::jsonb, $10, $11, $12::jsonb, $13, now())
       RETURNING id`,
      [
        userId, e.title, e.category, e.eventDate, e.endDate, e.eventTime, e.location, e.status,
        JSON.stringify(e.context), e.publicId, EPOCH, JSON.stringify(e.payload), e.createdAt,
      ]
    );
    eventUuid = inserted[0].id;
  } else {
    if (new Date(existing.ver).getTime() >= e.updatedAtMs) return 'skipped';
    eventUuid = existing.id;
  }

  await reconcileMilestones(eventUuid, e.milestones);
  await query(
    `UPDATE events
        SET title = $2, category = $3, event_date = $4, end_date = $5, event_time = $6, location = $7, status = $8,
            context = $9::jsonb, client_updated_at = $10, client_payload = $11::jsonb, updated_at = now()
      WHERE id = $1`,
    [
      eventUuid, e.title, e.category, e.eventDate, e.endDate, e.eventTime, e.location, e.status,
      JSON.stringify(e.context), new Date(e.updatedAtMs).toISOString(), JSON.stringify(e.payload),
    ]
  );
  return 'applied';
}

export interface PushSummary {
  applied: number;
  skipped: number;
  failed: number;
}

/** Applies a device's changed events. Never throws for one bad event. */
export async function applyIncomingEvents(email: string, rawEvents: unknown[]): Promise<PushSummary> {
  await ensureEventSyncSchema();
  const userId = await findOrCreateUserByEmail(email);
  const summary: PushSummary = { applied: 0, skipped: 0, failed: 0 };

  for (const raw of rawEvents.slice(0, MAX_EVENTS_PER_PUSH)) {
    const event = sanitizeIncomingEvent(raw);
    if (!event) {
      summary.failed++;
      continue;
    }
    try {
      const outcome = await upsertEvent(userId, event);
      summary[outcome]++;
    } catch (err) {
      summary.failed++;
      console.warn('Event sync: could not apply one event (non-fatal):', err);
    }
  }
  return summary;
}

async function findUserId(email: string): Promise<string | undefined> {
  const rows = await query<{ id: string }>(`SELECT id FROM users WHERE lower(email) = lower($1) LIMIT 1`, [email]);
  return rows[0]?.id;
}

export interface EventChanges {
  events: CalendarEvent[];
  /** Public ids of events deleted (and still restorable) since `since`. */
  deletedIds: string[];
  /** Server clock at read time - the next `since`. */
  serverTime: string;
}

/**
 * Events changed since `sinceIso` (everything when omitted), plus the ids of
 * events deleted since then. Cheap enough to poll: an incremental call with
 * nothing new returns near-empty arrays.
 */
export async function listEventChanges(email: string, sinceIso?: string): Promise<EventChanges> {
  await ensureEventSyncSchema();
  const clock = await query<{ now: string | Date }>(`SELECT now() AS now`);
  const serverTime = new Date(clock[0].now).toISOString();
  const since = sinceIso && !Number.isNaN(Date.parse(sinceIso)) ? new Date(sinceIso).toISOString() : null;

  const userId = await findUserId(email);
  if (!userId) return { events: [], deletedIds: [], serverTime };

  const eventRows = await query<any>(
    `SELECT * FROM events
      WHERE user_id = $1 AND deleted_at IS NULL AND ($2::timestamptz IS NULL OR updated_at > $2::timestamptz)`,
    [userId, since]
  );
  let milestoneRows: any[] = [];
  if (eventRows.length > 0) {
    milestoneRows = await query<any>(`SELECT * FROM milestones WHERE event_id = ANY($1::uuid[])`, [
      eventRows.map((r) => r.id),
    ]);
  }

  const deleted = await query<{ id: string; client_id: string | null }>(
    `SELECT id, client_id FROM events
      WHERE user_id = $1 AND deleted_at IS NOT NULL
        AND deleted_at > now() - make_interval(days => $3)
        AND ($2::timestamptz IS NULL OR deleted_at > $2::timestamptz)`,
    [userId, since, PURGE_AFTER_DAYS]
  );

  return {
    events: eventRows.map((row) => rowToCalendarEvent(row, milestoneRows)),
    deletedIds: deleted.map((r) => r.client_id || r.id),
    serverTime,
  };
}

export interface DeletedEventSummary {
  id: string;
  title: string;
  eventDate: string;
  deletedAt: string;
  milestoneCount: number;
}

/** What Settings offers to restore. */
export async function listDeletedEvents(email: string): Promise<DeletedEventSummary[]> {
  await ensureEventSyncSchema();
  const userId = await findUserId(email);
  if (!userId) return [];
  const rows = await query<any>(
    `SELECT e.id, e.client_id, e.title, e.event_date, e.deleted_at,
            (SELECT count(*)::int FROM milestones m WHERE m.event_id = e.id) AS milestone_count
       FROM events e
      WHERE e.user_id = $1 AND e.deleted_at IS NOT NULL
        AND e.deleted_at > now() - make_interval(days => $2)
      ORDER BY e.deleted_at DESC LIMIT 100`,
    [userId, PURGE_AFTER_DAYS]
  );
  return rows.map((r) => ({
    id: r.client_id || r.id,
    title: r.title,
    eventDate: new Date(r.event_date).toISOString().substring(0, 10),
    deletedAt: new Date(r.deleted_at).toISOString(),
    milestoneCount: r.milestone_count ?? 0,
  }));
}

/** Undoes a delete. Bumps updated_at so every device's next pull picks it up again. */
export async function restoreDeletedEvent(email: string, publicId: string): Promise<boolean> {
  await ensureEventSyncSchema();
  const userId = await findUserId(email);
  if (!userId) return false;
  const restored = await query<{ id: string }>(
    `UPDATE events
        SET deleted_at = NULL, updated_at = now()
      WHERE user_id = $1 AND (client_id = $2 OR id::text = $2) AND deleted_at IS NOT NULL
      RETURNING id`,
    [userId, String(publicId)]
  );
  return restored.length > 0;
}

/** Permanently removes events deleted more than PURGE_AFTER_DAYS ago (milestones cascade). */
export async function purgeDeletedEvents(): Promise<number> {
  await ensureEventSyncSchema();
  const purged = await query<{ id: string }>(
    `DELETE FROM events WHERE deleted_at IS NOT NULL AND deleted_at < now() - make_interval(days => $1) RETURNING id`,
    [PURGE_AFTER_DAYS]
  );
  return purged.length;
}
