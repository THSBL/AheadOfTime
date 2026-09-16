import { describe, it, expect } from 'vitest';
import {
  computeAheadStatus,
  computeOverallAheadStatus,
  computeNextBestActionForEvent,
  computeNextBestAction,
  inferMilestoneImportance,
  inferActionTheme,
  isNextBestActionThisWeek,
  computeSimpleAheadStatus,
  computeUpcomingMilestones,
  computeOverdueMilestones,
  computeWeeklyMilestonePreview,
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

  it('classifies the plural "RSVPs" the same as singular "RSVP"', () => {
    expect(inferActionTheme(makeMilestone({ title: 'Invitations & RSVPs Sent' }))).toBe('calls_confirmations');
  });

  it('falls back to other for unmatched titles', () => {
    expect(inferActionTheme(makeMilestone({ title: 'Review project scope with the team' }))).toBe('other');
  });
});

describe('computeOverdueMilestones', () => {
  it('returns only overdue, outstanding milestones, most overdue first', () => {
    const event = makeEvent([
      makeMilestone({ id: 'soon', title: 'Confirm venue', calculatedDate: '2026-09-15' }),
      makeMilestone({ id: 'overdue-1', title: 'Book flowers', calculatedDate: '2026-09-05' }),
      makeMilestone({ id: 'overdue-2', title: 'Order cake', calculatedDate: '2026-09-01' }),
    ]);

    const clusters = computeOverdueMilestones([event], REF_DATE_ISO);
    const ids = clusters.flatMap((c) => c.items.map((i) => i.milestoneId));
    expect(ids).toEqual(['overdue-2', 'overdue-1']);
  });

  it('groups same-theme overdue items across events into one cluster', () => {
    const eventA = makeEvent(
      [makeMilestone({ id: 'a1', title: 'Book restaurant reservation', calculatedDate: '2026-09-01' })],
      { id: 'evt-a', title: "Maya's Party" }
    );
    const eventB = makeEvent(
      [makeMilestone({ id: 'b1', title: 'Confirm RSVP headcount', calculatedDate: '2026-09-02' })],
      { id: 'evt-b', title: "Leo's Party" }
    );

    const clusters = computeOverdueMilestones([eventA, eventB], REF_DATE_ISO);
    expect(clusters).toHaveLength(1);
    expect(clusters[0].theme).toBe('calls_confirmations');
    expect(clusters[0].items).toHaveLength(2);
  });

  it('excludes completed and skipped milestones', () => {
    const event = makeEvent([
      makeMilestone({ id: 'done', status: 'completed', calculatedDate: '2026-09-01' }),
      makeMilestone({ id: 'skipped', status: 'skipped', calculatedDate: '2026-09-01' }),
    ]);
    expect(computeOverdueMilestones([event], REF_DATE_ISO)).toHaveLength(0);
  });
});

describe('computeWeeklyMilestonePreview', () => {
  it('buckets outstanding, non-overdue milestones into weekly windows labeled by recency', () => {
    const event = makeEvent([
      makeMilestone({ id: 'this-week', title: 'Confirm venue', calculatedDate: '2026-09-14' }),
      makeMilestone({ id: 'next-week', title: 'Book flowers', calculatedDate: '2026-09-20' }),
    ]);

    const buckets = computeWeeklyMilestonePreview([event], REF_DATE_ISO);
    expect(buckets[0].label).toBe('This week');
    expect(buckets[0].clusters.flatMap((c) => c.items.map((i) => i.milestoneId))).toEqual(['this-week']);
    expect(buckets[1].label).toBe('Next week');
    expect(buckets[1].clusters.flatMap((c) => c.items.map((i) => i.milestoneId))).toEqual(['next-week']);
  });

  it('excludes overdue items and anything beyond the requested number of weeks', () => {
    const event = makeEvent([
      makeMilestone({ id: 'overdue', calculatedDate: '2026-09-01' }),
      makeMilestone({ id: 'far-out', calculatedDate: '2026-12-01' }),
    ]);
    const buckets = computeWeeklyMilestonePreview([event], REF_DATE_ISO, { weeks: 4 });
    const allIds = buckets.flatMap((b) => b.clusters.flatMap((c) => c.items.map((i) => i.milestoneId)));
    expect(allIds).toEqual([]);
  });

  it('omits empty weeks entirely rather than returning a blank bucket', () => {
    const event = makeEvent([makeMilestone({ calculatedDate: '2026-09-14' })]);
    const buckets = computeWeeklyMilestonePreview([event], REF_DATE_ISO, { weeks: 4 });
    expect(buckets).toHaveLength(1);
    expect(buckets[0].label).toBe('This week');
  });

  it('clusters same-theme items within a week and leaves lone items standalone', () => {
    const event = makeEvent([
      makeMilestone({ id: 'p1', title: 'Pack hiking boots', calculatedDate: '2026-09-14' }),
      makeMilestone({ id: 'p2', title: 'Pack Uniform & Shinguards', calculatedDate: '2026-09-15' }),
      makeMilestone({ id: 'g1', title: 'Buy gift', calculatedDate: '2026-09-14' }),
    ]);

    const buckets = computeWeeklyMilestonePreview([event], REF_DATE_ISO);
    const thisWeek = buckets[0];
    const packingCluster = thisWeek.clusters.find((c) => c.theme === 'packing');
    expect(packingCluster?.items).toHaveLength(2);
    const giftCluster = thisWeek.clusters.find((c) => c.theme === 'gifts');
    expect(giftCluster?.items).toHaveLength(1);
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

describe('computeSimpleAheadStatus', () => {
  it('is "ahead" with no overdue and nothing due within the week', () => {
    const event = makeEvent([makeMilestone({ calculatedDate: '2026-10-15', status: 'pending' })]);
    const status = computeSimpleAheadStatus([event], REF_DATE_ISO);
    expect(status.level).toBe('ahead');
    expect(status.sub).toBe('Nothing else due this week');
  });

  it('is "almost_ahead" when something is due within the week but nothing is overdue', () => {
    const event = makeEvent([
      makeMilestone({ id: 'soon', calculatedDate: '2026-09-14', status: 'pending' }),
      makeMilestone({ id: 'later', calculatedDate: '2026-10-15', status: 'pending' }),
    ]);
    const status = computeSimpleAheadStatus([event], REF_DATE_ISO);
    expect(status.level).toBe('almost_ahead');
    expect(status.dueSoonCount).toBe(1);
    expect(status.sub).toBe('1 item needs your attention');
  });

  it('is "behind" whenever anything is overdue, even alongside due-soon or future items', () => {
    const event = makeEvent([
      makeMilestone({ id: 'overdue', calculatedDate: '2026-09-01', status: 'pending' }),
      makeMilestone({ id: 'soon', calculatedDate: '2026-09-14', status: 'pending' }),
    ]);
    const status = computeSimpleAheadStatus([event], REF_DATE_ISO);
    expect(status.level).toBe('behind');
    expect(status.overdueCount).toBe(1);
    expect(status.sub).toBe('1 task is overdue');
  });

  it('ignores completed and skipped milestones', () => {
    const event = makeEvent([
      makeMilestone({ id: 'done', calculatedDate: '2026-09-01', status: 'completed' }),
      makeMilestone({ id: 'skipped', calculatedDate: '2026-09-01', status: 'skipped' }),
    ]);
    expect(computeSimpleAheadStatus([event], REF_DATE_ISO).level).toBe('ahead');
  });
});

describe('computeUpcomingMilestones', () => {
  it('buckets outstanding milestones by how far out they are due, excluding overdue ones', () => {
    const event = makeEvent([
      makeMilestone({ id: 'overdue', calculatedDate: '2026-09-01', status: 'pending' }),
      makeMilestone({ id: 'this-week', calculatedDate: '2026-09-14', status: 'pending' }),
      makeMilestone({ id: 'next-month', calculatedDate: '2026-09-30', status: 'pending' }),
      makeMilestone({ id: 'further', calculatedDate: '2026-12-01', category: 'booking', status: 'pending' }),
    ]);

    const result = computeUpcomingMilestones([event], REF_DATE_ISO);

    expect(result.thisWeek.map((i) => i.milestoneId)).toEqual(['this-week']);
    expect(result.nextMonth.map((i) => i.milestoneId)).toEqual(['next-month']);
    expect(result.further.map((i) => i.milestoneId)).toEqual(['further']);
  });

  it('sorts "further" items by importance before due date', () => {
    const event = makeEvent([
      makeMilestone({ id: 'routine-sooner', calculatedDate: '2026-12-01', category: 'shopping', status: 'pending' }),
      makeMilestone({ id: 'critical-later', calculatedDate: '2026-12-15', category: 'booking', status: 'pending' }),
    ]);

    const result = computeUpcomingMilestones([event], REF_DATE_ISO);
    expect(result.further.map((i) => i.milestoneId)).toEqual(['critical-later', 'routine-sooner']);
  });
});
