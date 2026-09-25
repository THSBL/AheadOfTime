import type { CalendarEvent, TMinusMilestone } from '../types';
import { isLateFromStart } from './readiness';
import type { CalendarEntryLike } from './tripGrouping';

/**
 * When an agenda is imported, some of the plan's tasks are visibly done
 * already: a calendar entry "Stay at Casa Familiar" means the lodging is
 * booked, a flight entry means flights are booked. This finds that
 * evidence for booking-type tasks only - never for preparation work like
 * packing or gear, which an entry can't prove.
 */

const BOOKING_TASK = /\b(book|booked|booking|secure|secured|reserve|reserved|reservation|arrange|arranged|lodging|accommodation|flights?)\b/i;

const KINDS: { entry: RegExp; task: RegExp }[] = [
  // Lodging
  { entry: /\b(stay|hotel|hostel|airbnb|b&b|guesthouse|guest house|lodge|resort|check[- ]?in)\b/i, task: /\b(lodging|accommodation|hotel|hostel|airbnb|room|stay)\b/i },
  // Flights
  { entry: /\b(flight|fly|flying|airline|airport)\b|✈/i, task: /\b(flights?|airfare|plane tickets?)\b/i },
  // Ground transport
  { entry: /\b(bus|shuttle|train|ferry|transfer|pick[- ]?up|rental car|car rental|drive to)\b/i, task: /\b(bus|shuttle|train|ferry|transfer|transport|transportation|rental car|car rental)\b/i },
];

// Words that say nothing about WHICH place/tour an entry is.
const GENERIC = new Set([
  'stay', 'hotel', 'hostel', 'lodge', 'resort', 'booking', 'flight', 'airport', 'transfer', 'shuttle', 'check',
  'drive', 'trip', 'travel', 'tour', 'from', 'with', 'night', 'overnight', 'morning', 'evening', 'private',
  'tourist', 'return', 'arrival', 'departure', 'international', 'street', 'avenue', 'calle',
]);

const TRANSPORT_ENTRY = KINDS[2].entry;

/**
 * Distinctive names in an entry's own title and venue (the first part of
 * its location, never the city/country after it). Transport entries give
 * none: "Drive to Antigua" names where you go, not something you booked there.
 */
function namesIn(entry: CalendarEntryLike): string[] {
  if (TRANSPORT_ENTRY.test(entry.summary || '')) return [];
  const venue = (entry.location || '').split(',')[0];
  const text = `${entry.summary || ''} ${venue}`.toLowerCase();
  return Array.from(new Set(text.match(/[a-zà-ÿ]{5,}/g) || [])).filter((w) => !GENERIC.has(w));
}

/** The calendar entry that shows this task is already arranged, if any. */
export function findCalendarEvidence(
  milestone: Pick<TMinusMilestone, 'title'>,
  entries: CalendarEntryLike[],
  ignoreNames: string[] = []
): CalendarEntryLike | null {
  const title = milestone.title || '';
  const ignored = new Set(ignoreNames.flatMap((n) => n.toLowerCase().match(/[a-zà-ÿ]{5,}/g) || []));
  if (!BOOKING_TASK.test(title)) return null;
  const lowerTitle = title.toLowerCase();
  for (const entry of entries) {
    const entryText = `${entry.summary || ''} ${entry.description || ''}`;
    // Same kind of arrangement ("Secure lodging" <- "Stay at Casa Familiar").
    // A task naming several ("Flights & hotel booked") needs every one of
    // them in the calendar, so it's checked across all entries below.
    const kinds = KINDS.filter((k) => k.task.test(title));
    if (kinds.length === 1 && kinds[0].entry.test(entryText)) return entry;
    // The task names the booked place or tour ("Secure Acatenango guide" <- "SOY ACATENANGO+FUEGO").
    if (namesIn(entry).some((name) => !ignored.has(name) && new RegExp(`\\b${name}\\b`, 'i').test(lowerTitle))) return entry;
  }
  const kinds = KINDS.filter((k) => k.task.test(title));
  if (kinds.length > 1) {
    const proofs = kinds.map((k) => entries.find((e) => k.entry.test(`${e.summary || ''} ${e.description || ''}`)));
    if (proofs.every(Boolean)) return proofs[0]!;
  }
  return null;
}

/**
 * For an imported trip: marks the tasks that were already late when it was
 * added (see isLateFromStart) and that its calendar entries show as arranged
 * as completed, noting why so the user can see (and undo) it. Only for
 * trips - a single "Dinner at Luigi's" entry is the event itself, not proof
 * the table is booked. ignoreNames: the trip's own destination/title, which
 * every task may mention.
 */
export function completeTasksEvidencedByCalendar(
  milestones: TMinusMilestone[],
  entries: CalendarEntryLike[],
  event: Pick<CalendarEvent, 'createdAt' | 'eventDate'> & Partial<Pick<CalendarEvent, 'eventTime'>>,
  ignoreNames: string[] = []
): TMinusMilestone[] {
  const now = new Date().toISOString();
  return milestones.map((m) => {
    if (!isLateFromStart(m, event)) return m;
    const evidence = findCalendarEvidence(m, entries, ignoreNames);
    if (!evidence) return m;
    const note = `Marked done: "${evidence.summary || 'a calendar entry'}" is already in your calendar.`;
    return {
      ...m,
      status: 'completed',
      completedAt: now,
      description: m.description ? `${m.description}\n\n${note}` : note,
    };
  });
}
