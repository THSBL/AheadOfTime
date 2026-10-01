import type { CalendarEvent, TMinusMilestone } from '../types.js';

/**
 * Every trip plan has an itinerary step, one "Check the whole trip" step and
 * a packing step, whatever the planner came up with this time (the AI
 * sometimes leaves them out, and a plan without them looks thin). The
 * whole-trip check is where bookings are looked at together - arrival times,
 * check-in, transfers - instead of a separate check after every booking.
 * Added once (slotKey), never twice.
 */

const ITINERARY = /\b(itinerar|day-by-day|day by day|daily plan|schedule for the trip|trip plan)\w*/i;
const PACKING = /\bpack(ing|ed)?\b/i;
const WHOLE_TRIP_CHECK = /\b(check|verify|review)\b.*\b(whole trip|all bookings|everything lines up|bookings line up)\b/i;

const DAY_MS = 86_400_000;
const dayOf = (iso: string) => iso.slice(0, 10);
const shiftDay = (iso: string, days: number) => new Date(Date.parse(`${dayOf(iso)}T12:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${dayOf(b)}T12:00:00Z`) - Date.parse(`${dayOf(a)}T12:00:00Z`)) / DAY_MS);

export function withTripBasics(event: CalendarEvent, milestones: TMinusMilestone[], referenceDate: string): TMinusMilestone[] {
  if (event.category !== 'travel_trip' || !event.eventDate) return milestones;
  // Only real trips: a date range, a destination or travel words - never a
  // dinner that was mislabelled a trip.
  const travelWords = /\b(trip|travel|flight|fly|flying|hotel|stay|vacation|holiday|abroad|getaway|lodging)\b/i;
  const isRealTrip =
    (event.endDate && event.endDate !== event.eventDate) ||
    Boolean(event.context?.destination) ||
    travelWords.test(`${event.title || ''} ${event.rawInputSnippet || ''}`);
  if (!isRealTrip) return milestones;
  const today = dayOf(new Date(referenceDate).toISOString());
  const lead = daysBetween(today, event.eventDate);
  if (lead < 1) return milestones;
  const has = (re: RegExp, key: string) => milestones.some((m) => m.slotKey === key || (m.isActive !== false && re.test(m.title)));
  const add: TMinusMilestone[] = [];
  const step = (key: string, daysBefore: number, title: string, description: string, category: TMinusMilestone['category']) => {
    const before = Math.max(1, Math.min(daysBefore, lead - 1));
    add.push({
      id: `${event.id}-${key}`,
      eventId: event.id,
      title,
      description,
      category,
      status: 'pending',
      tMinusOffsetMinutes: -before * 1440,
      tMinusLabel: `T-${before}d`,
      calculatedDate: `${shiftDay(event.eventDate, -before)}T09:00:00`,
      tier: 'balanced',
      isActive: true,
      slotKey: key,
      kind: 'milestone',
      deliverables: [],
    });
  };
  if (!has(ITINERARY, 'trip:itinerary')) {
    step('trip:itinerary', lead >= 21 ? 14 : Math.ceil(lead / 2), 'Plan the itinerary: day-by-day outline', 'What you do each day, with the bookings in it - so gaps and clashes show up early.', 'logistics');
  }
  if (!has(WHOLE_TRIP_CHECK, 'trip:check')) {
    step('trip:check', lead >= 10 ? 7 : Math.max(1, Math.floor(lead / 3)), 'Check the whole trip: arrival times, check-in, transfers', 'Put the bookings side by side: does the flight land before check-in, is there a way from the airport, do the dates all match?', 'logistics');
  }
  if (!has(PACKING, 'trip:packing')) {
    step('trip:packing', 2, 'Pack luggage & travel documents', 'Clothes for the weather, chargers, passports/ID and booking confirmations.', 'logistics');
  }
  if (add.length === 0) return milestones;
  return [...milestones, ...add].sort((a, b) => a.calculatedDate.localeCompare(b.calculatedDate));
}
