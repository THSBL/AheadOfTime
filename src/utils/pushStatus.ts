import type { CalendarEvent } from '../types';
import { fixedMoments } from './planLink';
import { describePlanSync, planSyncPending, planSyncStatus } from './googleSyncPlan';

/**
 * Whether an event's plan is in the user's Google Calendar and up to date:
 * the event itself (pushed by the app, or imported from the calendar by
 * Scan agenda), a trip's return, and every shown step - none missing, none
 * changed since the last sync, none removed from the plan but still in
 * Google (googleSyncPlan.ts). Same rules as syncEventToGoogleCalendar, so
 * this is exactly what a sync would still do.
 */
export function isEventInCalendar(event: CalendarEvent): boolean {
  return Boolean(event.googleEventId && !event.googleEventId.startsWith('local_'));
}

/** Shown steps not in Google yet. */
export function unpushedTaskCount(event: CalendarEvent): number {
  return planSyncStatus(event).toAdd;
}

/** A trip pushed before its return became an event of its own. */
function returnPending(event: CalendarEvent): boolean {
  return isEventInCalendar(event) && !event.googleReturnEventId && fixedMoments(event).some((m) => m.key === 'return');
}

/** Items a sync would add, update or remove. */
export function pendingPushItems(event: CalendarEvent): number {
  return planSyncPending(planSyncStatus(event)) + (returnPending(event) ? 1 : 0);
}

export function isPlanPushed(event: CalendarEvent): boolean {
  return pendingPushItems(event) === 0;
}

/** "6 tasks + the event", "2 tasks · event already in calendar", "1 new · 2 changed", "In calendar". */
export function describePendingPush(event: CalendarEvent): string {
  const s = planSyncStatus(event);
  const taskText = `${s.toAdd} ${s.toAdd === 1 ? 'task' : 'tasks'}`;
  if (s.eventMissing) return s.toAdd > 0 ? `${taskText} + the event` : 'the event';
  if (returnPending(event)) return s.toAdd > 0 ? `${taskText} + the return` : 'the return';
  if (s.toUpdate || s.toRemove || s.eventChanged) return describePlanSync(s);
  return s.toAdd > 0 ? `${taskText} · event already in calendar` : 'In calendar';
}

/**
 * Changes since the plan was synced: steps added, changed or removed, or
 * the event's own details. 0 when the plan was never synced (then the
 * whole plan is simply "pending sync").
 */
export function changesPendingSync(event: CalendarEvent): number {
  const s = planSyncStatus(event);
  if (!s.pushedBefore || s.eventMissing) return 0;
  return s.toAdd + s.toUpdate + s.toRemove + (s.eventChanged ? 1 : 0) + (returnPending(event) ? 1 : 0);
}

/** Steps added after the plan was synced. */
export function newTasksPendingSync(event: CalendarEvent): number {
  const s = planSyncStatus(event);
  return s.pushedBefore && !s.eventMissing ? s.toAdd : 0;
}
