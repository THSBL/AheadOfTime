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
    // Late tasks also show on today (while the event is still ahead), so
    // they count for the period containing today.
    if (isOpen(m) && d < today && to >= today && start <= today && today <= end) return true;
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
 * Today also carries every open task that is already late (for events
 * still ahead), so a missed task from an earlier week is never out of sight.
 */
export function itemsForDay(events: CalendarEvent[], day: string, today: string): CalendarItem[] {
  const out: CalendarItem[] = [];
  for (const event of events) {
    const [from, to] = eventSpan(event);
    if (from <= day && day <= to) out.push({ kind: 'event', event, key: `e-${event.id}` });
  }
  const tasks: CalendarItem[] = [];
  for (const event of events) {
    // An event that's over doesn't carry its late tasks to today.
    const stillAhead = eventSpan(event)[1] >= today;
    for (const m of shownTasks(event)) {
      const d = dayKey(m.calculatedDate);
      const late = isOpen(m) && d < today;
      if (d === day) tasks.push({ kind: 'task', event, milestone: m, key: `t-${m.id}`, late, carried: false });
      else if (late && stillAhead && day === today) tasks.push({ kind: 'task', event, milestone: m, key: `t-${m.id}`, late, carried: true });
    }
  }
  // Late first, then open, then done - the order that needs attention.
  const rank = (i: CalendarItem) => (i.kind !== 'task' ? 0 : i.late ? 0 : isOpen(i.milestone) ? 1 : 2);
  tasks.sort((a, b) => rank(a) - rank(b));
  return [...out, ...tasks];
}

export interface EventBar {
  event: CalendarEvent;
  /** 0 = Monday column of the week. */
  startCol: number;
  span: number;
  /** Row within the week; the same event keeps one row across its days. */
  lane: number;
  /** The event started before / goes on after this week. */
  continuesBefore: boolean;
  continuesAfter: boolean;
}

/**
 * Events of one week (or any run of days) as bars: a multi-day event is one
 * bar across its days on a single row, like any calendar app. Longer and
 * earlier events get the top rows; later ones fill the first free row.
 */
export function eventBarsForWeek(events: CalendarEvent[], weekStart: string, days = 7): EventBar[] {
  const weekEnd = addDaysKey(weekStart, days - 1);
  const col = (day: string) => Math.round((Date.parse(`${day}T12:00:00Z`) - Date.parse(`${weekStart}T12:00:00Z`)) / 86_400_000);
  const bars = events
    .map((event) => {
      const [from, to] = eventSpan(event);
      if (from > weekEnd || to < weekStart) return null;
      const start = from < weekStart ? weekStart : from;
      const end = to > weekEnd ? weekEnd : to;
      return { event, startCol: col(start), span: col(end) - col(start) + 1, lane: 0, continuesBefore: from < weekStart, continuesAfter: to > weekEnd };
    })
    .filter((b): b is EventBar => b !== null)
    .sort((a, b) => a.startCol - b.startCol || b.span - a.span || a.event.title.localeCompare(b.event.title));
  const laneEnds: number[] = [];
  for (const bar of bars) {
    let lane = laneEnds.findIndex((end) => end < bar.startCol);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = bar.startCol + bar.span - 1;
    bar.lane = lane;
  }
  return bars;
}
