import type { CalendarEvent, TMinusMilestone } from '../types.js';

/**
 * What of a plan is in Google, and what a sync would change.
 *
 * The plan keeps its own record of every step it put in Google
 * (CalendarEvent.googleSynced: step id -> Google task/event ids and a
 * fingerprint of what was sent). The record lives on the plan, not on the
 * steps, because a correction replaces the steps with new ones: without it
 * the old Google copies were forgotten - left with their old titles - and
 * the next sync added everything again.
 */

export interface SyncedStep {
  /** Google Tasks id. */
  task?: string;
  /** Google Calendar event id (a reminder at a set time). */
  event?: string;
  /** Fingerprint of what was sent (stepFingerprint); missing for steps pushed before it existed. */
  hash?: string;
}

/** How prep steps were sent, so a change of style or hour updates them all. */
export interface SyncedStyle {
  format: string;
  time?: string;
  minutes?: number;
}

const fingerprint = (parts: unknown[]) => {
  const s = JSON.stringify(parts);
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
};

/** What a step looks like in Google: title, day, done, ideas. */
export function stepFingerprint(m: TMinusMilestone, eventTitle: string): string {
  return fingerprint([
    m.title,
    (m.calculatedDate || '').slice(0, 10),
    m.status === 'completed',
    (m.deliverables || []).map((d) => [d?.title, d?.is_completed]),
    m.description || '',
    eventTitle,
  ]);
}

/** What the plan's own events look like in Google: title, dates, time, place. */
export function eventFingerprint(event: Pick<CalendarEvent, 'title' | 'eventDate' | 'endDate' | 'eventTime' | 'location' | 'context'>): string {
  return fingerprint([event.title, event.eventDate, event.endDate || '', event.eventTime || '', event.location || '', event.context?.returnTime || '']);
}

/** Steps shown in the plan (hidden and skipped ones are not in the calendar). */
export const shownSteps = (event: Pick<CalendarEvent, 'milestones'>) =>
  (event.milestones || []).filter((m) => m.isActive !== false && m.status !== 'skipped');

/** The plan's record, filled in from the steps' own Google ids for plans pushed before the record existed. */
export function syncedSteps(event: Pick<CalendarEvent, 'milestones' | 'googleSynced'>): Record<string, SyncedStep> {
  const record: Record<string, SyncedStep> = { ...(event.googleSynced || {}) };
  for (const m of event.milestones || []) {
    if (!m.googleTaskId && !m.googleCalendarEventId) continue;
    record[m.id] = { ...record[m.id], task: m.googleTaskId || record[m.id]?.task, event: m.googleCalendarEventId || record[m.id]?.event };
  }
  return record;
}

export interface PlanSyncStatus {
  /** Something of this plan is in Google already. */
  pushedBefore: boolean;
  /** The event itself still has to go in. */
  eventMissing: boolean;
  /** The event's title, date, time or place changed since the last sync. */
  eventChanged: boolean;
  /** Steps not in Google yet. */
  toAdd: number;
  /** Steps in Google whose title, date, ideas or done changed. */
  toUpdate: number;
  /** Steps in Google that are no longer in the plan. */
  toRemove: number;
  /** Pushed before this record existed and the steps were replaced: the old copies are found by the plan's title. */
  legacyCleanup: boolean;
}

export function planSyncStatus(event: CalendarEvent, style?: SyncedStyle): PlanSyncStatus {
  const record = syncedSteps(event);
  const shown = shownSteps(event);
  const shownIds = new Set(shown.map((m) => m.id));
  const eventInGoogle = Boolean(event.googleEventId && !event.googleEventId.startsWith('local_'));
  const pushedBefore = eventInGoogle || Object.keys(record).length > 0;
  const styleChanged = Boolean(style && event.googleSyncStyle && JSON.stringify(style) !== JSON.stringify(event.googleSyncStyle));
  let toAdd = 0;
  let toUpdate = 0;
  for (const m of shown) {
    const entry = record[m.id];
    if (!entry || (!entry.task && !entry.event)) toAdd += 1;
    else if (styleChanged || (entry.hash && entry.hash !== stepFingerprint(m, event.title))) toUpdate += 1;
  }
  const toRemove = Object.keys(record).filter((id) => !shownIds.has(id) && (record[id].task || record[id].event)).length;
  return {
    pushedBefore,
    eventMissing: !eventInGoogle,
    eventChanged: eventInGoogle && Boolean(event.googleEventHash) && event.googleEventHash !== eventFingerprint(event),
    toAdd,
    toUpdate,
    toRemove,
    // Steps pushed by the app before the record existed, and none of today's
    // steps is linked any more: a correction replaced them. (Not an event
    // imported from the calendar by Scan agenda: the app never pushed its steps.)
    legacyCleanup: eventInGoogle && !event.googleSynced && Boolean(event.googleMilestoneCount) && shown.length > 0 && shown.every((m) => !record[m.id]),
  };
}

/** Anything a sync would still do. */
export function planSyncPending(s: PlanSyncStatus): number {
  return (s.eventMissing ? 1 : 0) + (s.eventChanged ? 1 : 0) + s.toAdd + s.toUpdate + s.toRemove;
}

/** "3 new · 2 changed · 1 removed", "Up to date". */
export function describePlanSync(s: PlanSyncStatus): string {
  const parts = [
    s.toAdd ? `${s.toAdd} new` : '',
    s.toUpdate ? `${s.toUpdate} changed` : '',
    s.toRemove ? `${s.toRemove} removed` : '',
    s.eventChanged ? 'event details changed' : '',
    s.legacyCleanup ? 'old copies replaced' : '',
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'Up to date';
}
