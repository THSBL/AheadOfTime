import { describe, it, expect } from 'vitest';
import { completeTripDuplicates, isTripDuplicate } from './tripDuplicates';
import { prepareWeekViewEvents, computeOverdueMilestones, computeCatchUpGroups } from './readiness';

const ms = (id: string, title: string, date: string, extra: Record<string, unknown> = {}) =>
  ({ id, eventId: '', title, tMinusLabel: 'T', tMinusOffsetMinutes: -7 * 1440, calculatedDate: date, category: 'admin', status: 'pending', deliverables: [], ...extra }) as any;
const ev = (id: string, title: string, start: string, end: string, milestones: any[], createdAt = '2026-09-01T09:00:00Z') =>
  ({ id, title, category: 'travel_trip', eventDate: start, endDate: end, status: 'milestones_active', context: {}, milestones, createdAt, updatedAt: createdAt }) as any;

// One Guatemala trip stored as two stays (imported before trip grouping).
const sofia = ev('a', 'Stay: Hotel Casa Sofia', '2026-10-20', '2026-10-23', [
  ms('a1', 'International Travel Documents Verified', '2026-09-20'),
  ms('a2', 'Secure lodging at Hotel Casa Sofia', '2026-09-21'),
]);
const familiar = ev('b', 'Stay at Casa Familiar', '2026-10-25', '2026-10-28', [
  ms('b1', 'Confirm international travel documents and entry requirements', '2026-09-22'),
  ms('b2', 'Secure lodging at Casa Familiar', '2026-09-23'),
]);
const today = '2026-09-28T10:00:00Z';

describe('duplicate tasks across events of the same trip', () => {
  it('treats once-per-trip tasks as the same, but never two different bookings', () => {
    expect(isTripDuplicate({ event: sofia, milestone: sofia.milestones[0] }, { event: familiar, milestone: familiar.milestones[0] })).toBe(true);
    expect(isTripDuplicate({ event: sofia, milestone: sofia.milestones[1] }, { event: familiar, milestone: familiar.milestones[1] })).toBe(false);
  });

  it('ticking one ticks its twin in the other event', () => {
    const done = { ...sofia.milestones[0], status: 'completed', completedAt: '2026-09-28T10:00:00Z' };
    const next = completeTripDuplicates([sofia, familiar], 'a', done);
    expect(next[1].milestones[0].status).toBe('completed');
    expect(next[1].milestones[1].status).toBe('pending');
  });

  it('My Week Ahead lists the documents task once, and not at all once its twin is done', () => {
    const view = prepareWeekViewEvents([sofia, familiar], today);
    const titles = computeOverdueMilestones(view, today).map((i) => i.title);
    expect(titles.filter((t) => /documents/i.test(t))).toHaveLength(1);
    expect(titles.filter((t) => /lodging/i.test(t))).toHaveLength(2);

    const sofiaDone = { ...sofia, milestones: [{ ...sofia.milestones[0], status: 'completed' }, sofia.milestones[1]] };
    const after = computeOverdueMilestones(prepareWeekViewEvents([sofiaDone, familiar], today), today).map((i) => i.title);
    expect(after.filter((t) => /documents/i.test(t))).toHaveLength(0);
  });

  it('a task never shows in both catch-up and overdue', () => {
    const late = ev('c', 'Trip to Lisbon', '2026-10-10', '2026-10-12', [ms('c1', 'Book flights', '2026-09-10'), ms('c2', 'Book hotel', '2026-09-26')], '2026-09-20T09:00:00Z');
    const view = prepareWeekViewEvents([late], today);
    const catchUp = computeCatchUpGroups(view, today).flatMap((g) => g.items.map((i) => i.milestoneId));
    const overdue = computeOverdueMilestones(view, today).map((i) => i.milestoneId);
    expect(catchUp).toEqual(['c1']);
    expect(overdue).toEqual(['c2']);
  });
});

describe('events that are over', () => {
  it('drop out of My Week Ahead, except tasks planned for after them', () => {
    const past = ev('p', 'Weekend in Paris', '2026-09-25', '2026-09-26', [
      ms('p1', 'Book train', '2026-09-10'),
      ms('p2', 'Submit trip expenses', '2026-09-29', { tMinusOffsetMinutes: 3 * 1440 }),
    ]);
    const pastAllDone = ev('q', 'Dinner', '2026-09-26', '2026-09-26', [ms('q1', 'Book table', '2026-09-20', { status: 'completed' })]);
    const view = prepareWeekViewEvents([past, pastAllDone], today);
    expect(view.map((e) => e.id)).toEqual(['p']);
    const open = view[0].milestones.filter((m: any) => m.isActive !== false && m.status !== 'completed').map((m: any) => m.id);
    expect(open).toEqual(['p2']);
  });
});
