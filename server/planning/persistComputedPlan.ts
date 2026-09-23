import { sanitizeIncomingEvent, upsertEvent, UpsertEventResult } from '../eventSyncStore.js';
import type { CalendarEvent } from '../../src/types.js';

/**
 * The one write path for an already-computed plan (event + milestones),
 * regardless of which channel produced it - architecture reset Phase 5.
 *
 * Before this, Telegram wrote events/milestones through its own thinner,
 * fixed-column-only INSERTs (server/telegramStore.ts's recordEventCreated/
 * addMilestonesToEvent), silently dropping slotKey/scope/tag/source and
 * every Phase 4 preparation-level field until a later web sync happened to
 * backfill them. This delegates to the exact same sanitize+upsert path the
 * web multi-device sync already uses (server/eventSyncStore.ts), so every
 * channel gets the same full client_payload round-trip, the same Phase 4
 * columns, and the same non-blocking chronology validation
 * (validateMilestoneChronology, wired inside upsertEvent itself so it
 * covers both this path and the web sync path with one implementation).
 */
export interface PersistComputedPlanParams {
  userId: string;
  event: CalendarEvent;
  sourceChannel: 'web' | 'telegram';
}

export interface PersistComputedPlanResult {
  outcome: UpsertEventResult['outcome'] | 'rejected';
  eventUuid: string | null;
}

export async function persistComputedPlan(params: PersistComputedPlanParams): Promise<PersistComputedPlanResult> {
  const { userId, event, sourceChannel } = params;
  const sanitized = sanitizeIncomingEvent({
    ...event,
    id: event.id,
    // Always "now" - this call represents the channel's own fresh write,
    // never a stale multi-device push that should lose a last-write-wins
    // comparison against itself.
    updatedAt: new Date().toISOString(),
  });
  if (!sanitized) {
    return { outcome: 'rejected', eventUuid: null };
  }
  const result = await upsertEvent(userId, sanitized, sourceChannel);
  return result;
}
