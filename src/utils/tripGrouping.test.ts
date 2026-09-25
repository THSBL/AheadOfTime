import { describe, it, expect } from 'vitest';
import { groupTripEntries } from './tripGrouping';
import { completeTasksEvidencedByCalendar, findCalendarEvidence } from './calendarEvidence';

const entry = (id: string, summary: string, start: string, end?: string, location?: string) => ({
  id, summary, location,
  start: { date: start },
  end: { date: end || start },
});

// A Guatemala trip as it sits in a calendar (all-day entries, end exclusive),
// plus two unrelated entries.
const calendar = [
  entry('a', 'Stay: Hotel Casa Sofia', '2026-10-20', '2026-10-23', 'Hotel Casa Sofia, Antigua Guatemala, Guatemala'),
  entry('b', 'SOY Acatenango+Fuego', '2026-10-22', '2026-10-24', 'Acatenango, Guatemala'),
  entry('c', 'Drive to Antigua from Lanquin bus stop', '2026-10-25'),
  entry('d', 'Stay at Casa Familiar', '2026-10-25', '2026-10-28', 'Casa Familiar, Lanquín, Guatemala'),
  entry('e', 'Dentist', '2026-10-26'),
  entry('f', "Maya's birthday dinner", '2026-11-14'),
];
const isTrip = () => false;

describe('groupTripEntries', () => {
  it('turns the entries of one trip into one trip, and leaves the rest alone', () => {
    const { trips, ungrouped } = groupTripEntries(calendar, {
      isTripCategory: isTrip,
      canJoinTrip: (e) => !/dentist/i.test(e.summary || ''),
    });
    expect(trips).toHaveLength(1);
    expect(trips[0].entries.map((e) => e.id)).toEqual(['a', 'b', 'c', 'd']);
    expect(trips[0].startDate).toBe('2026-10-20');
    expect(trips[0].endDate).toBe('2026-10-27');
    expect(trips[0].title).toBe('Trip to Guatemala');
    expect(ungrouped.map((e) => e.id)).toEqual(['e', 'f']);
  });

  it('keeps a lone travel entry and trips far apart separate', () => {
    const { trips } = groupTripEntries(
      [entry('x', 'Flight to Lisbon', '2026-10-01'), entry('y', 'Stay in Porto', '2026-12-01', '2026-12-04')],
      { isTripCategory: isTrip }
    );
    expect(trips).toHaveLength(0);
  });
});

describe('calendar evidence for already-arranged tasks', () => {
  const parts = calendar.slice(0, 4);
  const task = (title: string, date = '2026-09-01') => ({
    id: title, eventId: 't', title, tMinusLabel: 'T-30d', tMinusOffsetMinutes: -43200,
    calculatedDate: date, category: 'booking', status: 'pending', deliverables: [],
  }) as any;

  it('finds the entry that shows a booking task is done', () => {
    expect(findCalendarEvidence(task('Secure lodging at Casa Familiar'), parts)?.id).toBe('a');
    expect(findCalendarEvidence(task('Secure Acatenango overnight guide and permit'), parts)?.id).toBe('b');
    expect(findCalendarEvidence(task('Secure private shuttle or tourist bus booking'), parts)?.id).toBe('c');
  });

  it('never marks preparation, documents, or the destination itself as done', () => {
    expect(findCalendarEvidence(task('Acquire high-altitude technical gear'), parts)).toBeNull();
    expect(findCalendarEvidence(task('International Travel Documents Verified'), parts)).toBeNull();
    expect(findCalendarEvidence(task('Book Antigua cooking class'), parts)).toBeNull();
    expect(findCalendarEvidence(task('Secure Guatemala travel insurance'), parts, ['Trip to Guatemala'])).toBeNull();
    // A hotel stay alone doesn't prove the flights are booked.
    expect(findCalendarEvidence(task('Flights, trains & hotel reservation lock'), parts)).toBeNull();
  });

  it('only completes tasks that were already due at import, and says why', () => {
    const result = completeTasksEvidencedByCalendar(
      [task('Secure lodging at Casa Familiar'), task('Book hotel for the last night', '2026-10-15')],
      parts,
      { createdAt: '2026-09-25T10:00:00Z', eventDate: '2026-10-20' },
      ['Trip to Guatemala']
    );
    expect(result[0].status).toBe('completed');
    expect(result[0].description).toMatch(/already in your calendar/);
    expect(result[1].status).toBe('pending');
  });
});
