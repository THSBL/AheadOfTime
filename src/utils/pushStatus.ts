import type { CalendarEvent } from '../types';

/**
 * Whether an event's plan is in the user's Google Calendar: the event
 * itself (pushed by the app, or imported from the calendar by Scan agenda)
 * and every shown task. Same rules as syncEventToGoogleCalendar, which
 * skips what already has a Google id - so this is exactly what a push
 * would still add.
 */
export function isEventInCalendar(event: CalendarEvent): boolean {
  return Boolean(event.googleEventId && !event.googleEventId.startsWith('local_'));
}

/** Shown tasks not in Google yet (a task always lands in Google Tasks, whatever the format). */
export function unpushedTaskCount(event: CalendarEvent): number {
  return (event.milestones || []).filter((m) => m.isActive !== false && !m.googleTaskId).length;
}

/** Items a push would add: the event if it isn't there, plus its unpushed tasks. */
export function pendingPushItems(event: CalendarEvent): number {
  return (isEventInCalendar(event) ? 0 : 1) + unpushedTaskCount(event);
}

export function isPlanPushed(event: CalendarEvent): boolean {
  return pendingPushItems(event) === 0;
}

/** "6 tasks + the event", "2 tasks · event already in calendar", "In calendar". */
export function describePendingPush(event: CalendarEvent): string {
  const tasks = unpushedTaskCount(event);
  const taskText = `${tasks} ${tasks === 1 ? 'task' : 'tasks'}`;
  if (!isEventInCalendar(event)) return tasks > 0 ? `${taskText} + the event` : 'the event';
  return tasks > 0 ? `${taskText} · event already in calendar` : 'In calendar';
}

/**
 * Tasks added after the plan was synced: the plan has tasks in Google
 * already, and these ones aren't. 0 when the plan was never synced (then
 * the whole plan is simply "pending sync").
 */
export function newTasksPendingSync(event: CalendarEvent): number {
  const shown = (event.milestones || []).filter((m) => m.isActive !== false);
  if (!shown.some((m) => m.googleTaskId)) return 0;
  return shown.filter((m) => !m.googleTaskId).length;
}
