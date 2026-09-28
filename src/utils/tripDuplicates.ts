import type { CalendarEvent, TMinusMilestone } from '../types';
import { isSameMilestoneTask } from './tminusRules';

/**
 * One trip can exist as several events (each hotel stay of an agenda
 * imported before trip grouping, or a trip planned twice). Their plans then
 * repeat the things you do once per trip - "International Travel Documents
 * Verified" under one stay, "Confirm international travel documents" under
 * the next - so ticking it in one place left its twin showing as overdue.
 *
 * Only once-per-trip tasks count (documents, insurance, money, phone,
 * packing, who looks after home): bookings are per place, and "Secure
 * lodging at Casa Familiar" is not the same task as "... at Hotel Casa
 * Sofia", even though the words look alike.
 */
const ONCE_PER_TRIP =
  /\b(passport|visa|esta|etias|travel documents?|entry requirements?|travel insurance|insurance|vaccin\w*|currency|cash|atm|e-?sim|roaming|sim card|pack(ing|ed)?|luggage|suitcase|out[- ]of[- ]office|pet (care|sitter)|dog sitter|cat sitter|house ?sit\w*|plants?)\b/i;

const DAY_MS = 24 * 60 * 60 * 1000;

function dayNumber(date: string | undefined): number {
  const t = Date.parse(`${(date || '').slice(0, 10)}T12:00:00Z`);
  return Number.isFinite(t) ? Math.floor(t / DAY_MS) : NaN;
}

/** Whether two events are the same stretch of time (dates overlap or touch, 2 days' slack). */
export function eventsOverlap(a: CalendarEvent, b: CalendarEvent): boolean {
  const aStart = dayNumber(a.eventDate);
  const bStart = dayNumber(b.eventDate);
  if (!Number.isFinite(aStart) || !Number.isFinite(bStart)) return false;
  const aEnd = Math.max(aStart, dayNumber(a.endDate) || aStart);
  const bEnd = Math.max(bStart, dayNumber(b.endDate) || bStart);
  return aStart <= bEnd + 2 && bStart <= aEnd + 2;
}

const isTripLike = (event: CalendarEvent) => event.category === 'travel_trip' || Boolean(event.endDate && event.endDate > event.eventDate);

export function isOncePerTripTask(milestone: Pick<TMinusMilestone, 'title'>): boolean {
  return ONCE_PER_TRIP.test(milestone.title || '');
}

/** The same once-per-trip task in another event of the same trip. */
export function isTripDuplicate(
  a: { event: CalendarEvent; milestone: TMinusMilestone },
  b: { event: CalendarEvent; milestone: TMinusMilestone }
): boolean {
  if (a.event.id === b.event.id) return false;
  if (!isTripLike(a.event) || !isTripLike(b.event) || !eventsOverlap(a.event, b.event)) return false;
  if (!isOncePerTripTask(a.milestone) || !isOncePerTripTask(b.milestone)) return false;
  return isSameMilestoneTask(a.milestone, b.milestone, a.event.title);
}

/**
 * Ticking a once-per-trip task done also ticks its twins in the other events
 * of the same trip. Returns the events with those twins completed.
 */
export function completeTripDuplicates(
  events: CalendarEvent[],
  eventId: string,
  milestone: TMinusMilestone
): CalendarEvent[] {
  const source = events.find((e) => e.id === eventId);
  if (!source || milestone.status !== 'completed' || !isOncePerTripTask(milestone)) return events;
  const completedAt = milestone.completedAt || new Date().toISOString();
  return events.map((event) => {
    if (event.id === eventId) return event;
    let changed = false;
    const milestones = (event.milestones || []).map((m) => {
      if (m.status === 'completed' || m.status === 'skipped') return m;
      if (!isTripDuplicate({ event: source, milestone }, { event, milestone: m })) return m;
      changed = true;
      return { ...m, status: 'completed' as const, completedAt };
    });
    return changed ? { ...event, milestones } : event;
  });
}

/**
 * For lists across events (My Week Ahead): whether this open task should
 * be left out because the same trip already shows it - its twin is done,
 * or its twin is also open and comes first (earlier event, then id).
 */
export function isShadowedByTripDuplicate(
  milestone: TMinusMilestone,
  event: CalendarEvent,
  allEvents: CalendarEvent[]
): boolean {
  if (!isOncePerTripTask(milestone) || !isTripLike(event)) return false;
  for (const other of allEvents) {
    if (other.id === event.id || !isTripLike(other) || !eventsOverlap(event, other)) continue;
    for (const m of other.milestones || []) {
      if (m.status === 'skipped' || m.isActive === false) continue;
      if (!isTripDuplicate({ event, milestone }, { event: other, milestone: m })) continue;
      if (m.status === 'completed') return true;
      const otherFirst = other.eventDate < event.eventDate || (other.eventDate === event.eventDate && other.id < event.id);
      if (otherFirst) return true;
    }
  }
  return false;
}
