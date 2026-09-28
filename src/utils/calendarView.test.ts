import { describe, it, expect } from 'vitest';
import { eventTouchesRange, isComingUp, itemsForDay, addDaysKey } from './calendarView';

const ms = (id: string, date: string, extra: Record<string, unknown> = {}) => ({ id, eventId: 'e', title: id, calculatedDate: `${date}T12:00:00.000Z`, status: 'pending', ...extra }) as any;
const ev = (id: string, date: string, milestones: any[] = [], extra: Record<string, unknown> = {}) => ({ id, title: id, eventDate: date, milestones, context: {}, ...extra }) as any;
const today = '2026-09-29';

describe('calendar view', () => {
  it('adds days across month ends', () => {
    expect(addDaysKey('2026-09-29', 3)).toBe('2026-10-02');
  });

  it('an event belongs to a period when it or one of its tasks falls in it', () => {
    const trip = ev('trip', '2026-11-20', [ms('book', '2026-10-05')]);
    expect(eventTouchesRange(trip, '2026-10-01', '2026-10-31', today)).toBe(true);
    expect(eventTouchesRange(trip, '2026-12-01', '2026-12-31', today)).toBe(false);
    const multiDay = ev('stay', '2026-10-30', [], { endDate: '2026-11-02' });
    expect(eventTouchesRange(multiDay, '2026-11-01', '2026-11-30', today)).toBe(true);
  });

  it('late tasks show on today and make their event count for this period', () => {
    const e = ev('x', '2026-12-10', [ms('late', '2026-09-20'), ms('done', '2026-09-21', { status: 'completed' })]);
    const todays = itemsForDay([e], today, today);
    expect(todays.map((i) => i.key)).toEqual(['t-late']);
    expect(todays[0]).toMatchObject({ late: true, carried: true });
    expect(itemsForDay([e], '2026-09-20', today)[0]).toMatchObject({ late: true, carried: false });
    expect(eventTouchesRange(e, '2026-09-28', '2026-10-04', today)).toBe(true);
  });

  it('coming up: event within 30 days, or an open task due by then; others are Later', () => {
    expect(isComingUp(ev('soon', '2026-10-20'), today)).toBe(true);
    expect(isComingUp(ev('far', '2027-01-10', [ms('b', '2026-10-15')]), today)).toBe(true);
    expect(isComingUp(ev('far2', '2027-01-10', [ms('b', '2026-12-15')]), today)).toBe(false);
    expect(isComingUp(ev('far3', '2027-01-10', [ms('b', '2026-10-15', { status: 'completed' })]), today)).toBe(false);
    expect(isComingUp(ev('hidden', '2027-01-10', [ms('b', '2026-10-15', { isActive: false })]), today)).toBe(false);
  });

  it('events first, then late, open and done tasks', () => {
    const e = ev('e1', '2026-10-01', [ms('done', '2026-10-01', { status: 'completed' }), ms('open', '2026-10-01')]);
    expect(itemsForDay([e], '2026-10-01', today).map((i) => i.key)).toEqual(['e-e1', 't-open', 't-done']);
  });
});
