import type { CalendarEvent, TMinusMilestone } from '../types';

/**
 * Timeline & Tasks calendar (desktop): which events and tasks fall on which
 * day, and which events belong in the Active Events list for the period on
 * screen. Dates are compared as YYYY-MM-DD strings.
 */

export const dayKey = (value: string | undefined): string => (value || '').slice(0, 10);

export function addDaysKey(key: string, days: number): string {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function eventSpan(event: CalendarEvent): [string, string] {
  const start = dayKey(event.eventDate);
  const end = event.endDate && dayKey(event.endDate) > start ? dayKey(event.endDate) : start;
  return [start, end];
}

/** Tasks the user can see (not hidden by a help-level downgrade, not removed in Google). */
function shownTasks(event: CalendarEvent): TMinusMilestone[] {
  return (event.milestones || []).filter((m) => m.isActive !== false && m.status !== 'skipped');
}

const isOpen = (m: TMinusMilestone) => m.status !== 'completed';

/** The event itself, or one of its tasks, falls between start and end (inclusive). */
export function eventTouchesRange(event: CalendarEvent, start: string, end: string, today: string): boolean {
  const [from, to] = eventSpan(event);
  if (from <= end && to >= start) return true;
  return shownTasks(event).some((m) => {
    const d = dayKey(m.calculatedDate);
    // Late tasks also show on today, so they count for the period containing today.
    if (isOpen(m) && d < today && start <= today && today <= end) return true;
    return d >= start && d <= end;
  });
}

/**
 * List view: events you're preparing for now - the event is in the next
 * `days` days (or under way), or one of its open tasks is due by then
 * (late ones included). Everything else goes under "Later".
 */
export function isComingUp(event: CalendarEvent, today: string, days = 30): boolean {
  const horizon = addDaysKey(today, days);
  const [from, to] = eventSpan(event);
  if (from <= horizon && to >= today) return true;
  return shownTasks(event).some((m) => isOpen(m) && dayKey(m.calculatedDate) <= horizon);
}

export type CalendarItem =
  | { kind: 'event'; event: CalendarEvent; key: string }
  | { kind: 'task'; event: CalendarEvent; milestone: TMinusMilestone; key: string; late: boolean; carried: boolean };

/**
 * What one calendar day shows: events spanning it first, then its tasks.
 * Today also carries every open task that is already late, so a missed task
 * from an earlier week is never out of sight.
 */
export function itemsForDay(events: CalendarEvent[], day: string, today: string): CalendarItem[] {
  const out: CalendarItem[] = [];
  for (const event of events) {
    const [from, to] = eventSpan(event);
    if (from <= day && day <= to) out.push({ kind: 'event', event, key: `e-${event.id}` });
  }
  const tasks: CalendarItem[] = [];
  for (const event of events) {
    for (const m of shownTasks(event)) {
      const d = dayKey(m.calculatedDate);
      const late = isOpen(m) && d < today;
      if (d === day) tasks.push({ kind: 'task', event, milestone: m, key: `t-${m.id}`, late, carried: false });
      else if (late && day === today) tasks.push({ kind: 'task', event, milestone: m, key: `t-${m.id}`, late, carried: true });
    }
  }
  // Late first, then open, then done - the order that needs attention.
  const rank = (i: CalendarItem) => (i.kind !== 'task' ? 0 : i.late ? 0 : isOpen(i.milestone) ? 1 : 2);
  tasks.sort((a, b) => rank(a) - rank(b));
  return [...out, ...tasks];
}
