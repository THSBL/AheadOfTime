import type { CalendarEvent, TMinusMilestone } from '../types';
import { fixedMoments } from './planLink';

/**
 * Whether an event's plan is in the user's Google Calendar: the event
 * itself (pushed by the app, or imported from the calendar by Scan agenda),
 * a trip's return, and every shown task. Same rules as
 * syncEventToGoogleCalendar, which skips what already has a Google id - so
 * this is exactly what a push would still add.
 */
export function isEventInCalendar(event: CalendarEvent): boolean {
  return Boolean(event.googleEventId && !event.googleEventId.startsWith('local_'));
}

/** A task is in Google as a Google Task, or as a calendar reminder when the user chose events. */
const isTaskInGoogle = (m: TMinusMilestone) => Boolean(m.googleTaskId || m.googleCalendarEventId);

/** Shown tasks not in Google yet. */
export function unpushedTaskCount(event: CalendarEvent): number {
  return (event.milestones || []).filter((m) => m.isActive !== false && !isTaskInGoogle(m)).length;
}

/** A trip pushed before its return became an event of its own. */
function returnPending(event: CalendarEvent): boolean {
  return isEventInCalendar(event) && !event.googleReturnEventId && fixedMoments(event).some((m) => m.key === 'return');
}

/** Items a push would add: the event if it isn't there, a trip's return, plus its unpushed tasks. */
export function pendingPushItems(event: CalendarEvent): number {
  return (isEventInCalendar(event) ? 0 : 1) + (returnPending(event) ? 1 : 0) + unpushedTaskCount(event);
}

export function isPlanPushed(event: CalendarEvent): boolean {
  return pendingPushItems(event) === 0;
}

/** "6 tasks + the event", "2 tasks · event already in calendar", "In calendar". */
export function describePendingPush(event: CalendarEvent): string {
  const tasks = unpushedTaskCount(event);
  const taskText = `${tasks} ${tasks === 1 ? 'task' : 'tasks'}`;
  if (!isEventInCalendar(event)) return tasks > 0 ? `${taskText} + the event` : 'the event';
  if (returnPending(event)) return tasks > 0 ? `${taskText} + the return` : 'the return';
  return tasks > 0 ? `${taskText} · event already in calendar` : 'In calendar';
}

/**
 * Tasks added after the plan was synced: the plan has tasks in Google
 * already, and these ones aren't. 0 when the plan was never synced (then
 * the whole plan is simply "pending sync").
 */
export function newTasksPendingSync(event: CalendarEvent): number {
  const shown = (event.milestones || []).filter((m) => m.isActive !== false);
  if (!shown.some(isTaskInGoogle)) return 0;
  return shown.filter((m) => !isTaskInGoogle(m)).length;
}
