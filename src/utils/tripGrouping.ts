/**
 * Groups the calendar entries of one trip into one event when scanning the
 * agenda. A trip usually sits in the calendar as several entries - each
 * hotel stay, a bus transfer, a tour - and scanning them one by one gave
 * every entry its own plan: duplicate "travel documents" and "transport"
 * tasks across four "events" that are really one Guatemala trip.
 *
 * Rule: entries that look like travel (stays, transport, all-day entries
 * spanning several days, or a trip-category title) and follow each other
 * with at most one free day in between form one trip. Other entries that
 * fall inside that trip's dates join it, unless the caller says they can't
 * (routine items like a standup). A group needs at least two entries; a
 * single entry stays as it is.
 */

export interface CalendarEntryLike {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
}

export interface TripGroup<T extends CalendarEntryLike> {
  entries: T[];
  startDate: string;
  endDate: string;
  destination?: string;
  title: string;
}

const TRAVEL_WORDS =
  /\b(stay|hotel|hostel|airbnb|b&b|guesthouse|guest house|lodge|resort|check[- ]?in|check[- ]?out|flight|fly|flying|airport|bus|shuttle|train|ferry|transfer|pick[- ]?up|drive to|road ?trip|tour|excursion|trek|hike)\b/i;

const DAY_MS = 24 * 60 * 60 * 1000;

function dayNumber(date: string): number {
  return Math.floor(new Date(`${date}T12:00:00Z`).getTime() / DAY_MS);
}

function fromDayNumber(n: number): string {
  return new Date(n * DAY_MS).toISOString().slice(0, 10);
}

/** First and last calendar day an entry covers (Google's all-day end date is exclusive). */
export function entryDaySpan(entry: CalendarEntryLike): { start: number; end: number } | null {
  const rawStart = entry.start?.dateTime || entry.start?.date;
  if (!rawStart) return null;
  const start = dayNumber(rawStart.slice(0, 10));
  let end = start;
  if (entry.end?.date) {
    end = Math.max(start, dayNumber(entry.end.date.slice(0, 10)) - 1);
  } else if (entry.end?.dateTime) {
    end = Math.max(start, dayNumber(entry.end.dateTime.slice(0, 10)));
  }
  return { start, end };
}

export function looksLikeTravel(entry: CalendarEntryLike, isTripCategory: boolean): boolean {
  if (isTripCategory) return true;
  if (TRAVEL_WORDS.test(`${entry.summary || ''} ${entry.description || ''}`)) return true;
  const span = entryDaySpan(entry);
  return Boolean(span && entry.start?.date && span.end - span.start >= 1);
}

/** The most common last part of the entries' locations ("…, Guatemala" -> "Guatemala"). */
function commonDestination(entries: CalendarEntryLike[]): string | undefined {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    const parts = (entry.location || '').split(',').map((p) => p.trim()).filter(Boolean);
    const place = parts[parts.length - 1];
    if (!place || /^\d/.test(place)) continue;
    counts.set(place, (counts.get(place) || 0) + 1);
  }
  let best: string | undefined;
  let bestCount = 0;
  for (const [place, count] of counts) {
    if (count > bestCount) {
      best = place;
      bestCount = count;
    }
  }
  return best;
}

export function groupTripEntries<T extends CalendarEntryLike>(
  entries: T[],
  options: {
    isTripCategory: (entry: T) => boolean;
    /** Whether a non-travel entry inside a trip's dates may join it. */
    canJoinTrip?: (entry: T) => boolean;
    /** Free days allowed between two travel entries of the same trip. */
    maxGapDays?: number;
  }
): { trips: TripGroup<T>[]; ungrouped: T[] } {
  const maxGap = options.maxGapDays ?? 1;
  const spans = new Map<string, { start: number; end: number }>();
  for (const entry of entries) {
    const span = entryDaySpan(entry);
    if (span) spans.set(entry.id, span);
  }

  const travel = entries
    .filter((e) => spans.has(e.id) && looksLikeTravel(e, options.isTripCategory(e)))
    .sort((a, b) => spans.get(a.id)!.start - spans.get(b.id)!.start);

  // Chain travel entries that follow each other closely.
  const chains: { entries: T[]; start: number; end: number }[] = [];
  for (const entry of travel) {
    const span = spans.get(entry.id)!;
    const current = chains[chains.length - 1];
    if (current && span.start <= current.end + maxGap + 1) {
      current.entries.push(entry);
      current.end = Math.max(current.end, span.end);
    } else {
      chains.push({ entries: [entry], start: span.start, end: span.end });
    }
  }

  const grouped = new Set<string>();
  const trips: TripGroup<T>[] = [];
  for (const chain of chains) {
    if (chain.entries.length < 2) continue;
    // Other entries during the trip belong to it (a tour, a dinner there).
    const inside = entries.filter((e) => {
      if (chain.entries.includes(e)) return false;
      const span = spans.get(e.id);
      if (!span || span.start < chain.start || span.start > chain.end) return false;
      return options.canJoinTrip ? options.canJoinTrip(e) : true;
    });
    const members = [...chain.entries, ...inside].sort((a, b) => spans.get(a.id)!.start - spans.get(b.id)!.start);
    members.forEach((m) => grouped.add(m.id));
    const destination = commonDestination(members);
    trips.push({
      entries: members,
      startDate: fromDayNumber(chain.start),
      endDate: fromDayNumber(chain.end),
      destination,
      title: destination ? `Trip to ${destination}` : `Trip: ${members[0].summary || 'Travel'}`,
    });
  }

  return { trips, ungrouped: entries.filter((e) => !grouped.has(e.id)) };
}

/** One line per entry, for the planner and the event's own context. */
export function describeTripEntry(entry: CalendarEntryLike): string {
  const date = (entry.start?.dateTime || entry.start?.date || '').slice(0, 10);
  const place = entry.location ? ` (${entry.location})` : '';
  return `${date}: ${entry.summary || 'Untitled'}${place}`;
}
