import { describe, it, expect } from 'vitest';
import {
  computeAheadStatus,
  computeNextBestActionForEvent,
  computeNextBestAction,
  inferMilestoneImportance,
} from './readiness';
import { CalendarEvent, TMinusMilestone } from '../types';

const REF_DATE_ISO = '2026-09-10T12:00:00.000Z';

function makeMilestone(overrides: Partial<TMinusMilestone> = {}): TMinusMilestone {
  return {
    id: overrides.id || 'ms-1',
    eventId: 'evt-1',
    tMinusLabel: 'T-7d',
    tMinusOffsetMinutes: -10080,
    calculatedDate: '2026-09-17',
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

describe('inferMilestoneImportance', () => {
  it('treats booking/tickets/deadline/qa categories as critical at macro scope', () => {
    expect(inferMilestoneImportance(makeMilestone({ category: 'booking', scope: 'macro' }))).toBe('critical');
    expect(inferMilestoneImportance(makeMilestone({ category: 'tickets', scope: 'macro' }))).toBe('critical');
  });

  it('downgrades a critical category by one level at micro scope', () => {
    expect(inferMilestoneImportance(makeMilestone({ category: 'booking', scope: 'micro' }))).toBe('important');
  });

  it('treats shopping/prep/general/watchpoint as routine', () => {
    expect(inferMilestoneImportance(makeMilestone({ category: 'shopping' }))).toBe('routine');
    expect(inferMilestoneImportance(makeMilestone({ category: 'general' }))).toBe('routine');
  });

  it('falls back to important for everything else', () => {
    expect(inferMilestoneImportance(makeMilestone({ category: 'logistics' }))).toBe('important');
  });
});

describe('computeAheadStatus', () => {
  it('reports ready when there are no actionable milestones', () => {
    const event = makeEvent([]);
    expect(computeAheadStatus(event, REF_DATE_ISO).level).toBe('ready');
  });

  it('reports ready when every milestone is completed', () => {
    const event = makeEvent([makeMilestone({ status: 'completed' }), makeMilestone({ id: 'ms-2', status: 'completed' })]);
    expect(computeAheadStatus(event, REF_DATE_ISO).level).toBe('ready');
  });

  it('excludes skipped milestones from both the total and the ready check', () => {
    const event = makeEvent([
      makeMilestone({ status: 'completed' }),
      makeMilestone({ id: 'ms-2', status: 'skipped' }),
    ]);
    const status = computeAheadStatus(event, REF_DATE_ISO);
    expect(status.totalCount).toBe(1);
    expect(status.level).toBe('ready');
  });

  it('reports at_risk when an overdue action is critical', () => {
    const event = makeEvent([
      makeMilestone({ category: 'booking', scope: 'macro', calculatedDate: '2026-09-01', status: 'pending' }),
    ]);
    const status = computeAheadStatus(event, REF_DATE_ISO);
    expect(status.level).toBe('at_risk');
    expect(status.overdueCount).toBe(1);
  });

  it('reports attention when overdue but nothing overdue is critical', () => {
    const event = makeEvent([
      makeMilestone({ category: 'shopping', calculatedDate: '2026-09-01', status: 'pending' }),
    ]);
    expect(computeAheadStatus(event, REF_DATE_ISO).level).toBe('attention');
  });

  it('reports ahead when 70%+ complete with nothing overdue', () => {
    const event = makeEvent([
      makeMilestone({ id: 'a', status: 'completed', calculatedDate: '2026-09-20' }),
      makeMilestone({ id: 'b', status: 'completed', calculatedDate: '2026-09-20' }),
      makeMilestone({ id: 'c', status: 'completed', calculatedDate: '2026-09-20' }),
      makeMilestone({ id: 'd', status: 'pending', calculatedDate: '2026-09-20' }),
    ]);
    expect(computeAheadStatus(event, REF_DATE_ISO).level).toBe('ahead');
  });

  it('reports on_track when under 70% complete with nothing overdue', () => {
    const event = makeEvent([
      makeMilestone({ id: 'a', status: 'completed', calculatedDate: '2026-09-20' }),
      makeMilestone({ id: 'b', status: 'pending', calculatedDate: '2026-09-20' }),
    ]);
    expect(computeAheadStatus(event, REF_DATE_ISO).level).toBe('on_track');
  });
});

describe('computeNextBestActionForEvent', () => {
  it('returns null once nothing is outstanding', () => {
    const event = makeEvent([makeMilestone({ status: 'completed' })]);
    expect(computeNextBestActionForEvent(event, REF_DATE_ISO)).toBeNull();
  });

  it('prioritizes the most overdue action over a soon-due one', () => {
    const event = makeEvent([
      makeMilestone({ id: 'soon', calculatedDate: '2026-09-12', title: 'Soon task' }),
      makeMilestone({ id: 'overdue', calculatedDate: '2026-09-01', title: 'Overdue task' }),
    ]);
    const result = computeNextBestActionForEvent(event, REF_DATE_ISO);
    expect(result?.title).toBe('Overdue task');
    expect(result?.isOverdue).toBe(true);
  });

  it('breaks ties on the same due date by importance', () => {
    const event = makeEvent([
      makeMilestone({ id: 'routine', calculatedDate: '2026-09-20', category: 'shopping', title: 'Pack bags' }),
      makeMilestone({ id: 'critical', calculatedDate: '2026-09-20', category: 'booking', title: 'Book flight' }),
    ]);
    const result = computeNextBestActionForEvent(event, REF_DATE_ISO);
    expect(result?.title).toBe('Book flight');
  });
});

describe('computeNextBestAction (cross-event)', () => {
  it('picks the overdue action across events over a non-overdue one', () => {
    const eventA = makeEvent([makeMilestone({ id: 'a1', calculatedDate: '2026-09-25', title: 'A task' })], {
      id: 'evt-a',
      title: 'Event A',
    });
    const eventB = makeEvent([makeMilestone({ id: 'b1', calculatedDate: '2026-09-01', title: 'B task' })], {
      id: 'evt-b',
      title: 'Event B',
    });

    const result = computeNextBestAction([eventA, eventB], REF_DATE_ISO);
    expect(result?.title).toBe('B task');
    expect(result?.eventId).toBe('evt-b');
  });

  it('returns null when there are no events at all', () => {
    expect(computeNextBestAction([], REF_DATE_ISO)).toBeNull();
  });
});
