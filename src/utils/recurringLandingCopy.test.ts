import { describe, it, expect } from 'vitest';
import { computeStripeOneStatus, computeUpcomingEventCount, computeStripeTwoCopy } from './recurringLandingCopy';
import { CalendarEvent, TMinusMilestone } from '../types';

const REF_DATE_ISO = '2026-09-17T12:00:00.000Z';

function makeMilestone(overrides: Partial<TMinusMilestone> = {}): TMinusMilestone {
  return {
    id: overrides.id || 'ms-1',
    eventId: 'evt-1',
    tMinusLabel: 'T-7d',
    tMinusOffsetMinutes: -10080,
    calculatedDate: '2026-09-20',
    title: 'Book restaurant',
    category: 'booking',
    status: 'pending',
    ...overrides,
  };
}

function makeEvent(milestones: TMinusMilestone[], overrides: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'evt-1',
    title: 'Anniversary Weekend',
    category: 'dinner_social',
    eventDate: '2026-10-01',
    status: 'milestones_active',
    context: {},
    milestones,
    createdAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('computeStripeOneStatus', () => {
  it('returns a neutral clear state with zero events instead of crashing on undefined counts', () => {
    const status = computeStripeOneStatus([], REF_DATE_ISO);
    expect(status.level).toBe('clear');
    expect(status.copy).toBe('Nothing tracked yet');
  });

  it('is red/"overdue" when anything is overdue, even if other items are also due this week', () => {
    const event = makeEvent([
      makeMilestone({ id: 'ms-overdue', calculatedDate: '2026-09-10', status: 'pending' }),
      makeMilestone({ id: 'ms-this-week', calculatedDate: '2026-09-19', status: 'pending' }),
    ]);
    const status = computeStripeOneStatus([event], REF_DATE_ISO);
    expect(status.level).toBe('overdue');
    expect(status.copy).toBe('1 task needs attention');
    expect(status.secondary).toBe('1 is due this week');
  });

  it('adds a second "N are due this week" line when overdue and due-this-week tasks coexist', () => {
    const event = makeEvent([
      makeMilestone({ id: 'ms-o1', calculatedDate: '2026-09-10', status: 'pending' }),
      makeMilestone({ id: 'ms-o2', calculatedDate: '2026-09-12', status: 'pending' }),
      makeMilestone({ id: 'ms-w1', calculatedDate: '2026-09-19', status: 'pending' }),
      makeMilestone({ id: 'ms-w2', calculatedDate: '2026-09-20', status: 'pending' }),
      makeMilestone({ id: 'ms-w3', calculatedDate: '2026-09-21', status: 'pending' }),
    ]);
    const status = computeStripeOneStatus([event], REF_DATE_ISO);
    expect(status.copy).toBe('2 tasks need attention');
    expect(status.secondary).toBe('3 are due this week');
  });

  it('has no second line when something is overdue but nothing else is due this week', () => {
    const event = makeEvent([makeMilestone({ calculatedDate: '2026-09-10', status: 'pending' })]);
    expect(computeStripeOneStatus([event], REF_DATE_ISO).secondary).toBeUndefined();
  });

  it('pluralizes the overdue count correctly', () => {
    const event = makeEvent([
      makeMilestone({ id: 'ms-1', calculatedDate: '2026-09-10', status: 'pending' }),
      makeMilestone({ id: 'ms-2', calculatedDate: '2026-09-12', status: 'pending' }),
    ]);
    expect(computeStripeOneStatus([event], REF_DATE_ISO).copy).toBe('2 tasks need attention');
  });

  it('is amber/"due_soon" when nothing is overdue but something is due within the week', () => {
    const event = makeEvent([makeMilestone({ calculatedDate: '2026-09-19', status: 'pending' })]);
    const status = computeStripeOneStatus([event], REF_DATE_ISO);
    expect(status.level).toBe('due_soon');
    expect(status.copy).toBe('1 task is due this week');
    expect(status.secondary).toBeUndefined();
  });

  it('is sage/"clear" when there are events but nothing overdue or due this week', () => {
    const event = makeEvent([makeMilestone({ calculatedDate: '2026-11-01', status: 'pending' })]);
    const status = computeStripeOneStatus([event], REF_DATE_ISO);
    expect(status.level).toBe('clear');
    expect(status.copy).toBe('All clear this week');
  });

  it('excludes completed and skipped milestones from both overdue and due-soon counts', () => {
    const event = makeEvent([
      makeMilestone({ id: 'ms-done', calculatedDate: '2026-09-10', status: 'completed' }),
      makeMilestone({ id: 'ms-skipped', calculatedDate: '2026-09-11', status: 'skipped' }),
    ]);
    expect(computeStripeOneStatus([event], REF_DATE_ISO).level).toBe('clear');
  });
});

describe('computeUpcomingEventCount / computeStripeTwoCopy', () => {
  it('returns 0 / neutral copy with zero events', () => {
    expect(computeUpcomingEventCount([], REF_DATE_ISO)).toBe(0);
    expect(computeStripeTwoCopy([], REF_DATE_ISO)).toBe('Nothing tracked yet');
  });

  it('counts events whose date falls within the next 30 days', () => {
    const soon = makeEvent([], { id: 'e1', eventDate: '2026-09-25' });
    const later = makeEvent([], { id: 'e2', eventDate: '2026-10-10' });
    const farFuture = makeEvent([], { id: 'e3', eventDate: '2027-01-01' });
    expect(computeUpcomingEventCount([soon, later, farFuture], REF_DATE_ISO)).toBe(2);
    expect(computeStripeTwoCopy([soon, later, farFuture], REF_DATE_ISO)).toBe('2 major events coming up');
  });

  it('excludes events already in the past', () => {
    const past = makeEvent([], { id: 'e1', eventDate: '2026-09-01' });
    expect(computeUpcomingEventCount([past], REF_DATE_ISO)).toBe(0);
    expect(computeStripeTwoCopy([past], REF_DATE_ISO)).toBe('Nothing on the horizon yet');
  });

  it('singularizes "1 major event coming up"', () => {
    const soon = makeEvent([], { id: 'e1', eventDate: '2026-09-25' });
    expect(computeStripeTwoCopy([soon], REF_DATE_ISO)).toBe('1 major event coming up');
  });
});
