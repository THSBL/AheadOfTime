import type { CalendarEvent, TMinusMilestone } from '../types.js';

/**
 * Every trip plan has an itinerary step and a packing step, whatever the
 * planner came up with this time (the AI sometimes leaves them out, and a
 * plan without them looks thin). Both are one-step things: no explore /
 * decide / check stages. Added once (slotKey), never twice.
 */

const ITINERARY = /\b(itinerar|day-by-day|day by day|daily plan|schedule for the trip|trip plan)\w*/i;
const PACKING = /\bpack(ing|ed)?\b/i;

const DAY_MS = 86_400_000;
const dayOf = (iso: string) => iso.slice(0, 10);
const shiftDay = (iso: string, days: number) => new Date(Date.parse(`${dayOf(iso)}T12:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${dayOf(b)}T12:00:00Z`) - Date.parse(`${dayOf(a)}T12:00:00Z`)) / DAY_MS);

export function withTripBasics(event: CalendarEvent, milestones: TMinusMilestone[], referenceDate: string): TMinusMilestone[] {
  if (event.category !== 'travel_trip' || !event.eventDate) return milestones;
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
  if (!has(PACKING, 'trip:packing')) {
    step('trip:packing', 2, 'Pack luggage & travel documents', 'Clothes for the weather, chargers, passports/ID and booking confirmations.', 'logistics');
  }
  if (add.length === 0) return milestones;
  return [...milestones, ...add].sort((a, b) => a.calculatedDate.localeCompare(b.calculatedDate));
}
