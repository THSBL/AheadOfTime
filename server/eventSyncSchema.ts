import { query } from './db.js';
import { ensurePreparationSchema } from './preparationSchema.js';

/**
 * Columns that let the same event live on several devices (and be undone
 * after an accidental delete):
 *
 *  - events.client_id / milestones.client_id: the id the web app itself
 *    generated. Telegram-created rows keep only their uuid, so an event's
 *    public id everywhere is `client_id ?? id::text` - identical on every
 *    device, and old Telegram events are unchanged.
 *  - events.client_updated_at: the client's own updatedAt, so devices resolve
 *    conflicts by the time the user actually edited, not by arrival order.
 *  - events.deleted_at: soft delete. Deleted events are kept for
 *    PURGE_AFTER_DAYS (restorable from Settings), then purged by the daily cron.
 *
 * Idempotent and memoised per instance so it never depends on someone
 * running `npm run db:migrate` against production (also mirrored in
 * server/db/schema.sql).
 */

export const PURGE_AFTER_DAYS = 30;

let ready: Promise<void> | null = null;

export function ensureEventSyncSchema(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      // Composed here rather than at every eventSyncStore.ts/telegramStore.ts
      // call site - both schemas govern the same events/milestones tables,
      // and every caller that needs one already needs the other to exist.
      await ensurePreparationSchema();
      await query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS client_id TEXT`);
      await query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS client_updated_at TIMESTAMPTZ`);
      await query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`);
      // The full event as the web app holds it, so fields with no column of
      // their own survive a round trip through another device unchanged.
      await query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS client_payload JSONB`);
      await query(`ALTER TABLE milestones ADD COLUMN IF NOT EXISTS client_payload JSONB`);
      await query(
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_events_user_client_id ON events(user_id, client_id) WHERE client_id IS NOT NULL`
      );
      await query(`ALTER TABLE milestones ADD COLUMN IF NOT EXISTS client_id TEXT`);
      await query(`CREATE INDEX IF NOT EXISTS idx_milestones_event_client ON milestones(event_id, client_id)`);
    })().catch((err) => {
      ready = null; // retry next call instead of caching a failure
      throw err;
    });
  }
  return ready;
}

/** Test hook. */
export function resetEventSyncSchemaForTests(): void {
  ready = null;
}
