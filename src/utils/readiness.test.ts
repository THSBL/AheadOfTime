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

  it('excludes a milestone hidden by a preparation-level downgrade (architecture reset Phase 9) from the total and the overdue check', () => {
    const event = makeEvent([
      makeMilestone({ status: 'completed' }),
      makeMilestone({
        id: 'ms-2',
        category: 'booking',
        scope: 'macro',
        calculatedDate: '2026-09-01',
        status: 'pending',
        isActive: false,
      }),
    ]);
    const status = computeAheadStatus(event, REF_DATE_ISO);
    expect(status.totalCount).toBe(1);
    expect(status.overdueCount).toBe(0);
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
  it('classifies passport/visa/cutoff/budget items as administration', () => {
    expect(inferActionTheme(makeMilestone({ title: 'Passport validity & renewal check' }))).toBe('administration');
    expect(inferActionTheme(makeMilestone({ title: 'Notice cutoff & cancel Lux membership' }))).toBe('administration');
    expect(inferActionTheme(makeMilestone({ title: 'Settle budget & expenses' }))).toBe('administration');
  });

  it('classifies prep/work items as deliverables_preparation', () => {
    expect(inferActionTheme(makeMilestone({ title: 'Draft deliverable & internal peer review' }))).toBe('deliverables_preparation');
    expect(inferActionTheme(makeMilestone({ title: 'Dry run rehearsal & AV check' }))).toBe('deliverables_preparation');
  });

  it('classifies packing/gear items as packing_essentials, even when a booking verb is also present', () => {
    expect(inferActionTheme(makeMilestone({ title: 'Pack Uniform & Shinguards' }))).toBe('packing_essentials');
  });

  it('classifies flight/transport items as bookings_logistics rather than outreach_communication', () => {
    expect(inferActionTheme(makeMilestone({ title: 'Book flight tickets' }))).toBe('bookings_logistics');
  });

  it('classifies booking/RSVP items with no logistics keyword as outreach_communication', () => {
    expect(inferActionTheme(makeMilestone({ title: 'Confirm restaurant reservation' }))).toBe('outreach_communication');
  });

  it('classifies the plural "RSVPs" the same as singular "RSVP"', () => {
    expect(inferActionTheme(makeMilestone({ title: 'Invitations & RSVPs Sent' }))).toBe('outreach_communication');
  });

  it('classifies stakeholder alignment as outreach_communication, not deliverables_preparation', () => {
    expect(inferActionTheme(makeMilestone({ title: 'Stakeholder deliverables alignment' }))).toBe('outreach_communication');
  });

  it('classifies buy/order/gift items as purchases_gifts_supplies', () => {
    expect(inferActionTheme(makeMilestone({ title: 'Buy hiking boots' }))).toBe('purchases_gifts_supplies');
    expect(inferActionTheme(makeMilestone({ title: 'Order personalized birthday gift' }))).toBe('purchases_gifts_supplies');
  });

  it('falls back to other for unmatched titles', () => {
    expect(inferActionTheme(makeMilestone({ title: 'Water the office plants' }))).toBe('other');
  });

  // Regression: this app's own milestone-naming convention favors
  // past-participle titles ("X Locked", "X Settled", "X Confirmed"), but a
  // bare keyword stem like "settle" never matches its own "-ed" form (the
  // \b boundary fails between two word characters) - real titles using
  // that completed form fell all the way through to "other" instead of a
  // real theme, which is why several genuinely logistics/admin items were
  // showing up ungrouped under a generic "Other" tag in the dashboard.
  it('classifies past-participle titles this codebase\'s own naming convention produces, not just their bare-verb stems', () => {
    expect(inferActionTheme(makeMilestone({ title: 'Headcount & Group Costs Settled' }))).toBe('administration');
    expect(inferActionTheme(makeMilestone({ title: 'Logistics & Bookings' }))).toBe('bookings_logistics');
    expect(inferActionTheme(makeMilestone({ title: 'Venue & Guest List' }))).toBe('bookings_logistics');
    expect(inferActionTheme(makeMilestone({ title: 'Itinerary & Dining' }))).toBe('bookings_logistics');
  });
});

describe('computeOverdueMilestones', () => {
  it('returns only overdue, outstanding milestones, most overdue first, never clustered', () => {
    const event = makeEvent([
      makeMilestone({ id: 'soon', title: 'Confirm venue', calculatedDate: '2026-09-15' }),
      makeMilestone({ id: 'overdue-1', title: 'Order flowers', calculatedDate: '2026-09-05' }),
      makeMilestone({ id: 'overdue-2', title: 'Order cake', calculatedDate: '2026-09-01' }),
    ]);

    const items = computeOverdueMilestones([event], REF_DATE_ISO);
    expect(items.map((i) => i.milestoneId)).toEqual(['overdue-2', 'overdue-1']);
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

  it('defaults to a full-year horizon, so far-out items are never silently dropped', () => {
    // Regression test: an earlier version defaulted to a hard 4-week
    // cutoff, so a trip's milestones 30-60 days out (well beyond any
    // "Next week"/"In 3 weeks"/"In 4 weeks" bucket) vanished from the
    // preview entirely with nowhere left to show them once the separate
    // "Later" catch-all was removed.
    const event = makeEvent([makeMilestone({ id: 'far-out', calculatedDate: '2026-11-15' })]);
    const buckets = computeWeeklyMilestonePreview([event], REF_DATE_ISO);
    const allIds = buckets.flatMap((b) => b.items.map((i) => i.milestoneId));
    expect(allIds).toEqual(['far-out']);
  });

  it('clusters same-theme items within a week and leaves lone items standalone', () => {
    const event = makeEvent([
      makeMilestone({ id: 'p1', title: 'Pack hiking boots', calculatedDate: '2026-09-14' }),
      makeMilestone({ id: 'p2', title: 'Pack Uniform & Shinguards', calculatedDate: '2026-09-15' }),
      makeMilestone({ id: 'g1', title: 'Buy gift', calculatedDate: '2026-09-14' }),
    ]);

    const buckets = computeWeeklyMilestonePreview([event], REF_DATE_ISO);
    const thisWeek = buckets[0];
    expect(thisWeek.items).toHaveLength(3);
    const packingCluster = thisWeek.clusters.find((c) => c.theme === 'packing_essentials');
    expect(packingCluster?.items).toHaveLength(2);
    const giftCluster = thisWeek.clusters.find((c) => c.theme === 'purchases_gifts_supplies');
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
    expect(status.sub).toBe('1 item to wrap up this week');
    expect(status.label).toBe('You are almost ahead');
  });

  it('says "Busy week" instead of "You are almost ahead" once more than 5 items are due, keeping the same level', () => {
    const dueThisWeek = (n: number) => makeMilestone({ id: `d${n}`, calculatedDate: '2026-09-14', status: 'pending' });
    const five = computeSimpleAheadStatus([makeEvent([1, 2, 3, 4, 5].map(dueThisWeek))], REF_DATE_ISO);
    expect(five.label).toBe('You are almost ahead');

    const six = computeSimpleAheadStatus([makeEvent([1, 2, 3, 4, 5, 6].map(dueThisWeek))], REF_DATE_ISO);
    expect(six.level).toBe('almost_ahead');
    expect(six.label).toBe('Busy week');
    expect(six.sub).toBe('6 items to wrap up this week');
  });

  it('is "behind" once 3 or more items are overdue, even if each is only barely late', () => {
    const event = makeEvent([
      makeMilestone({ id: 'o1', calculatedDate: '2026-09-09', status: 'pending' }),
      makeMilestone({ id: 'o2', calculatedDate: '2026-09-09', status: 'pending' }),
      makeMilestone({ id: 'o3', calculatedDate: '2026-09-09', status: 'pending' }),
    ]);
    const status = computeSimpleAheadStatus([event], REF_DATE_ISO);
    expect(status.level).toBe('behind');
    expect(status.overdueCount).toBe(3);
    expect(status.sub).toBe('3 items need attention before moving ahead');
  });

  it('is "behind" when a single item is overdue by more than 3 days, even alone', () => {
    const event = makeEvent([makeMilestone({ id: 'overdue', calculatedDate: '2026-09-01', status: 'pending' })]);
    const status = computeSimpleAheadStatus([event], REF_DATE_ISO);
    expect(status.level).toBe('behind');
    expect(status.overdueCount).toBe(1);
    expect(status.sub).toBe('1 item needs attention before moving ahead');
  });

  it('tolerates 1-2 minor overdue items (within 3 days) as "almost_ahead", not "behind"', () => {
    const event = makeEvent([
      makeMilestone({ id: 'minor-overdue', calculatedDate: '2026-09-09', status: 'pending' }),
      makeMilestone({ id: 'due-soon', calculatedDate: '2026-09-14', status: 'pending' }),
    ]);
    const status = computeSimpleAheadStatus([event], REF_DATE_ISO);
    expect(status.level).toBe('almost_ahead');
    expect(status.overdueCount).toBe(1);
    expect(status.sub).toBe('2 items to wrap up this week');
  });

  it('ignores completed and skipped milestones', () => {
    const event = makeEvent([
      makeMilestone({ id: 'done', calculatedDate: '2026-09-01', status: 'completed' }),
      makeMilestone({ id: 'skipped', calculatedDate: '2026-09-01', status: 'skipped' }),
    ]);
    expect(computeSimpleAheadStatus([event], REF_DATE_ISO).level).toBe('ahead');
  });

  it('reports completedCount and totalCount alongside the overdue/due-soon verdict', () => {
    const event = makeEvent([
      makeMilestone({ id: 'done-1', calculatedDate: '2026-09-01', status: 'completed' }),
      makeMilestone({ id: 'done-2', calculatedDate: '2026-09-01', status: 'completed' }),
      makeMilestone({ id: 'skipped', calculatedDate: '2026-09-01', status: 'skipped' }),
      makeMilestone({ id: 'overdue', calculatedDate: '2026-09-01', status: 'pending' }),
    ]);
    const status = computeSimpleAheadStatus([event], REF_DATE_ISO);
    expect(status.completedCount).toBe(2);
    // Skipped milestones are excluded from the actionable total, same as
    // everywhere else in this file.
    expect(status.totalCount).toBe(3);
  });
});

