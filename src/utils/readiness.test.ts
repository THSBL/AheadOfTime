import { describe, it, expect } from 'vitest';
import {
  computeAheadStatus,
  computeOverallAheadStatus,
  computeNextBestActionForEvent,
  computeNextBestAction,
  inferMilestoneImportance,
  inferActionTheme,
  computeThisWeekFocus,
  isNextBestActionThisWeek,
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

describe('computeOverallAheadStatus', () => {
  it('reports ready when there are no events', () => {
    expect(computeOverallAheadStatus([], REF_DATE_ISO).level).toBe('ready');
  });

  it('is at_risk if any single event is at_risk, even if others are ready', () => {
    const readyEvent = makeEvent([makeMilestone({ status: 'completed' })], { id: 'evt-ready', title: 'Ready Event' });
    const riskyEvent = makeEvent(
      [makeMilestone({ category: 'booking', scope: 'macro', calculatedDate: '2026-09-01', status: 'pending' })],
      { id: 'evt-risky', title: 'Risky Event' }
    );
    const overall = computeOverallAheadStatus([readyEvent, riskyEvent], REF_DATE_ISO);
    expect(overall.level).toBe('at_risk');
  });

  it('sums completed/total counts across all events', () => {
    const eventA = makeEvent([makeMilestone({ id: 'a1', status: 'completed', calculatedDate: '2026-09-20' })], {
      id: 'evt-a',
    });
    const eventB = makeEvent(
      [
        makeMilestone({ id: 'b1', status: 'pending', calculatedDate: '2026-09-20' }),
        makeMilestone({ id: 'b2', status: 'pending', calculatedDate: '2026-09-20' }),
      ],
      { id: 'evt-b' }
    );
    const overall = computeOverallAheadStatus([eventA, eventB], REF_DATE_ISO);
    expect(overall.completedCount).toBe(1);
    expect(overall.totalCount).toBe(3);
  });
});

describe('inferActionTheme', () => {
  it('classifies passport/visa items as documents', () => {
    expect(inferActionTheme(makeMilestone({ title: 'Passport validity & renewal check' }))).toBe('documents');
  });

  it('classifies packing/gear items as packing, even when a booking verb is also present', () => {
    expect(inferActionTheme(makeMilestone({ title: 'Pack Uniform & Shinguards' }))).toBe('packing');
  });

  it('classifies flight/transport items as logistics rather than calls_confirmations', () => {
    expect(inferActionTheme(makeMilestone({ title: 'Book flight tickets' }))).toBe('logistics');
  });

  it('classifies booking/RSVP items with no logistics keyword as calls_confirmations', () => {
    expect(inferActionTheme(makeMilestone({ title: 'Confirm restaurant reservation' }))).toBe('calls_confirmations');
  });

  it('falls back to other for unmatched titles', () => {
    expect(inferActionTheme(makeMilestone({ title: 'Review project scope with the team' }))).toBe('other');
  });
});

describe('computeThisWeekFocus', () => {
  it('groups same-theme actions across different events into one cluster', () => {
    const eventA = makeEvent(
      [makeMilestone({ id: 'a1', title: 'Pack hiking boots', calculatedDate: '2026-09-15' })],
      { id: 'evt-a', title: 'Highlands Trip' }
    );
    const eventB = makeEvent(
      [makeMilestone({ id: 'b1', title: 'Pack Uniform & Shinguards', calculatedDate: '2026-09-16' })],
      { id: 'evt-b', title: 'Football Tournament' }
    );

    const clusters = computeThisWeekFocus([eventA, eventB], REF_DATE_ISO);

    expect(clusters).toHaveLength(1);
    expect(clusters[0].theme).toBe('packing');
    expect(clusters[0].count).toBe(2);
    expect(clusters[0].eventTitles.sort()).toEqual(['Football Tournament', 'Highlands Trip']);
  });

  it('excludes clusters below the minimum size (no batching value from a single item)', () => {
    const event = makeEvent([makeMilestone({ title: 'Pack hiking boots', calculatedDate: '2026-09-15' })]);
    expect(computeThisWeekFocus([event], REF_DATE_ISO)).toHaveLength(0);
  });

  it('excludes actions further out than the horizon, but always includes overdue ones', () => {
    const farOut = makeEvent(
      [
        makeMilestone({ id: 'f1', title: 'Pack bag one', calculatedDate: '2026-12-01' }),
        makeMilestone({ id: 'f2', title: 'Pack bag two', calculatedDate: '2026-12-02' }),
      ],
      { id: 'evt-far' }
    );
    expect(computeThisWeekFocus([farOut], REF_DATE_ISO, { withinDays: 14 })).toHaveLength(0);

    const overdue = makeEvent(
      [
        makeMilestone({ id: 'o1', title: 'Pack bag one', calculatedDate: '2026-01-01' }),
        makeMilestone({ id: 'o2', title: 'Pack bag two', calculatedDate: '2026-01-02' }),
      ],
      { id: 'evt-overdue' }
    );
    expect(computeThisWeekFocus([overdue], REF_DATE_ISO, { withinDays: 14 })).toHaveLength(1);
  });

  it('excludes completed and skipped milestones', () => {
    const event = makeEvent([
      makeMilestone({ id: 'p1', title: 'Pack bag one', status: 'completed', calculatedDate: '2026-09-15' }),
      makeMilestone({ id: 'p2', title: 'Pack bag two', status: 'skipped', calculatedDate: '2026-09-15' }),
      makeMilestone({ id: 'p3', title: 'Pack bag three', status: 'pending', calculatedDate: '2026-09-15' }),
    ]);
    expect(computeThisWeekFocus([event], REF_DATE_ISO)).toHaveLength(0);
  });

  it('never returns the "other" catch-all as a cluster', () => {
    const event = makeEvent([
      makeMilestone({ id: 'm1', title: 'Review project scope', calculatedDate: '2026-09-15' }),
      makeMilestone({ id: 'm2', title: 'Review budget allocation', calculatedDate: '2026-09-15' }),
    ]);
    const clusters = computeThisWeekFocus([event], REF_DATE_ISO);
    expect(clusters.every((c) => c.theme !== 'other')).toBe(true);
  });

  it('includes due-status on each action and sorts overdue ones first within a cluster', () => {
    const event = makeEvent([
      makeMilestone({ id: 'soon', title: 'Pack bag one', calculatedDate: '2026-09-15' }),
      makeMilestone({ id: 'overdue', title: 'Pack bag two', calculatedDate: '2026-09-01' }),
    ]);
    const clusters = computeThisWeekFocus([event], REF_DATE_ISO);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].actions[0].milestoneId).toBe('overdue');
    expect(clusters[0].actions[0].isOverdue).toBe(true);
    expect(clusters[0].actions[1].isOverdue).toBe(false);
    expect(clusters[0].actions[0].dueLabel).toBeTruthy();
  });

  it('sorts largest cluster first and caps at maxClusters', () => {
    const event = makeEvent([
      makeMilestone({ id: 'd1', title: 'Passport check', calculatedDate: '2026-09-15' }),
      makeMilestone({ id: 'd2', title: 'Visa application', calculatedDate: '2026-09-15' }),
      makeMilestone({ id: 'p1', title: 'Pack suitcase', calculatedDate: '2026-09-15' }),
      makeMilestone({ id: 'p2', title: 'Pack boots', calculatedDate: '2026-09-15' }),
      makeMilestone({ id: 'p3', title: 'Pack costume', calculatedDate: '2026-09-15' }),
      makeMilestone({ id: 'g1', title: 'Buy gift', calculatedDate: '2026-09-15' }),
      makeMilestone({ id: 'g2', title: 'Wrap present', calculatedDate: '2026-09-15' }),
    ]);
    const clusters = computeThisWeekFocus([event], REF_DATE_ISO, { maxClusters: 2 });
    expect(clusters).toHaveLength(2);
    expect(clusters[0].theme).toBe('packing');
    expect(clusters[0].count).toBe(3);
  });
});

describe('isNextBestActionThisWeek', () => {
  const eventDueIn = (diffDays: number, isOverdue = false) => ({
    eventId: 'evt-1',
    eventTitle: 'Some Event',
    milestoneId: 'ms-1',
    title: 'Some action',
    reason: 'Needed before your Some Event.',
    dueLabel: isOverdue ? 'Overdue by 1 day' : `In ${diffDays} days`,
    isOverdue,
    diffDays,
    importance: 'important' as const,
  });

  it('treats an overdue action as this week regardless of diffDays', () => {
    expect(isNextBestActionThisWeek(eventDueIn(-30, true))).toBe(true);
  });

  it('treats an action due within the default 7-day window as this week', () => {
    expect(isNextBestActionThisWeek(eventDueIn(5))).toBe(true);
  });

  it('treats an action due further out than 7 days as NOT this week', () => {
    expect(isNextBestActionThisWeek(eventDueIn(21))).toBe(false);
  });

  it('respects a custom horizon', () => {
    expect(isNextBestActionThisWeek(eventDueIn(10), 14)).toBe(true);
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
