import { describe, it, expect } from 'vitest';
import {
  isPastEventTask,
  computeOverdueMilestones,
  computeSimpleAheadStatus,
  computeNextBestActionForEvent,
  prepareWeekViewEvents,
} from './readiness';
import type { CalendarEvent, TMinusMilestone } from '../types';

const ms = (id: string, calculatedDate: string, tMinusOffsetMinutes: number | undefined, status: TMinusMilestone['status'] = 'pending'): TMinusMilestone => ({
  id,
  eventId: 'evt',
  title: id,
  tMinusLabel: '',
  tMinusOffsetMinutes: tMinusOffsetMinutes as number,
  calculatedDate,
  category: 'booking',
  status,
});

const event = (milestones: TMinusMilestone[], overrides: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: 'evt',
  title: 'Dinner with Sam',
  category: 'dinner_social',
  eventDate: '2026-10-10',
  status: 'milestones_active',
  context: {},
  milestones,
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
  ...overrides,
});

describe('isPastEventTask', () => {
  const dinner = event([]);
  const trip = event([], { title: 'Rome trip', eventDate: '2026-10-10', endDate: '2026-10-15' });

  it('keeps prep until the event day has passed', () => {
    const prep = ms('book', '2026-10-03', -10080);
    expect(isPastEventTask(prep, dinner, '2026-10-09T12:00:00Z')).toBe(false);
    expect(isPastEventTask(prep, dinner, '2026-10-10T12:00:00Z')).toBe(false); // the day itself
    expect(isPastEventTask(prep, dinner, '2026-10-11T08:00:00Z')).toBe(true);
  });

  it('always keeps a task planned for after the event (T+)', () => {
    const thanks = ms('thank-you', '2026-10-11', 1440);
    expect(isPastEventTask(thanks, dinner, '2026-10-20T12:00:00Z')).toBe(false);
    const sameEvening = ms('send photos', '2026-10-10', 120);
    expect(isPastEventTask(sameEvening, dinner, '2026-10-12T12:00:00Z')).toBe(false);
  });

  it('decides by date when a task has no lead time', () => {
    expect(isPastEventTask(ms('old', '2026-10-05', undefined), dinner, '2026-10-12T00:00:00Z')).toBe(true);
    expect(isPastEventTask(ms('later', '2026-10-14', undefined), dinner, '2026-10-12T00:00:00Z')).toBe(false);
  });

  it('for a trip: prep goes once it starts, tasks during it once it ends, after-trip tasks stay', () => {
    const packing = ms('pack', '2026-10-08', -2880);
    const duringTrip = ms('confirm day trip', '2026-10-12', 2880);
    const expenses = ms('file expenses', '2026-10-17', 10080);
    expect(isPastEventTask(packing, trip, '2026-10-11T12:00:00Z')).toBe(true);
    expect(isPastEventTask(duringTrip, trip, '2026-10-13T12:00:00Z')).toBe(false);
    expect(isPastEventTask(duringTrip, trip, '2026-10-16T12:00:00Z')).toBe(true);
    expect(isPastEventTask(expenses, trip, '2026-10-30T12:00:00Z')).toBe(false);
  });
});

describe('overdue and reminders after the event', () => {
  const REF = '2026-10-14T12:00:00Z';
  const past = event([ms('book table', '2026-10-03', -10080), ms('buy gift', '2026-10-08', -2880), ms('thank-you note', '2026-10-12', 2880)]);

  it('lists only the T+ task as overdue', () => {
    expect(computeOverdueMilestones([past], REF).map((i) => i.milestoneId)).toEqual(['thank-you note']);
  });

  it('counts only the T+ task in the status', () => {
    expect(computeSimpleAheadStatus([past], REF).overdueCount).toBe(1);
  });

  it('suggests the T+ task as the next action', () => {
    expect(computeNextBestActionForEvent(past, REF)?.milestoneId).toBe('thank-you note');
  });

  it('My Week Ahead keeps the event only for its T+ task', () => {
    const [view] = prepareWeekViewEvents([past], REF);
    expect(view.milestones.filter((m) => m.isActive !== false).map((m) => m.id)).toEqual(['thank-you note']);
    const onlyPrep = event([ms('book table', '2026-10-03', -10080)]);
    expect(prepareWeekViewEvents([onlyPrep], REF)).toEqual([]);
  });

  it('still shows prep as overdue before the event', () => {
    expect(computeOverdueMilestones([past], '2026-10-09T12:00:00Z').map((i) => i.milestoneId).sort()).toEqual(['book table', 'buy gift']);
  });
});
