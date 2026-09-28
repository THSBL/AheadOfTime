import { describe, expect, it } from 'vitest';
import type { CalendarEvent, TMinusMilestone } from '../types';
import { buildDecisionRunUps, decisionTopic, isDecisionMilestone, runUpSpacing, withDecisionRunUps } from './decisionRunUps';
import { applyPreparationLevelChange } from './preparationLevelActions';

const ms = (id: string, title: string, date: string, extra: Partial<TMinusMilestone> = {}): TMinusMilestone => ({
  id,
  eventId: 'e1',
  title,
  tMinusLabel: 'T',
  tMinusOffsetMinutes: -1440 * 10,
  calculatedDate: `${date}T09:00:00`,
  category: 'logistics',
  status: 'pending',
  ...extra,
});

const event = (milestones: TMinusMilestone[], extra: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: 'e1',
  title: 'Weekend in Lisbon with friends',
  category: 'travel_trip',
  eventDate: '2026-11-20',
  status: 'milestones_active',
  context: {},
  milestones,
  createdAt: '2026-09-01T00:00:00Z',
  updatedAt: '2026-09-01T00:00:00Z',
  ...extra,
});

const REF = '2026-10-01T10:00:00Z';

describe('decision run-ups (Extensive = time to decide)', () => {
  it('spots decisions', () => {
    expect(isDecisionMilestone(ms('a', 'Book flights and hotel', '2026-10-20'))).toBe(true);
    expect(isDecisionMilestone(ms('b', 'Restaurant Selected & Table Reserved', '2026-10-20'))).toBe(true);
    expect(isDecisionMilestone(ms('c', 'Pack suitcase', '2026-10-20'))).toBe(false);
    expect(isDecisionMilestone(ms('d', 'Book flights', '2026-10-20', { status: 'completed' }))).toBe(false);
  });

  it('names the topic without the verb', () => {
    expect(decisionTopic('Book flights and hotel')).toBe('flights and hotel');
    expect(decisionTopic('Travel prep: Reserve dinner table')).toBe('dinner table');
  });

  it('scales spacing to the time left', () => {
    expect(runUpSpacing(20)).toEqual({ look: 7, share: 2 });
    expect(runUpSpacing(6)).toEqual({ look: 4, share: 2 });
    expect(runUpSpacing(3)).toEqual({ look: 2, share: 1 });
    expect(runUpSpacing(1)).toBeNull();
  });

  it('adds look + share before a roomy decision in a group event', () => {
    const decision = ms('a', 'Book flights and hotel', '2026-10-20');
    const added = buildDecisionRunUps(event([decision]), [decision], REF);
    expect(added.map((m) => [m.title, m.calculatedDate.slice(0, 10), m.tier])).toEqual([
      ['Look at options: flights and hotel', '2026-10-13', 'extensive'],
      ['Share flights and hotel options with the group', '2026-10-18', 'extensive'],
    ]);
  });

  it('skips sharing when nobody else is involved', () => {
    const decision = ms('a', 'Book dentist', '2026-10-20');
    const solo = event([decision], { title: 'Dentist', userRole: 'guest' });
    expect(buildDecisionRunUps(solo, [decision], REF).map((m) => m.title)).toEqual(['Look at options: dentist']);
  });

  it('is idempotent and does not double a step the plan already has', () => {
    const decision = ms('a', 'Book flights and hotel', '2026-10-20');
    const once = withDecisionRunUps(event([decision]), [decision], REF);
    expect(withDecisionRunUps(event(once), once, REF)).toHaveLength(once.length);
    const aiLook = ms('b', 'Compare flights options', '2026-10-12');
    expect(buildDecisionRunUps(event([decision, aiLook]), [decision, aiLook], REF).map((m) => m.title)).toEqual([
      'Share flights and hotel options with the group',
    ]);
  });

  it('leaves decisions with no room alone', () => {
    const decision = ms('a', 'Book taxi', '2026-10-02');
    expect(buildDecisionRunUps(event([decision]), [decision], REF)).toEqual([]);
  });

  it('switching an existing plan to Extensive adds run-ups; Balanced hides them again', () => {
    const decision = ms('a', 'Book flights and hotel', '2026-10-20', { tier: 'essentials' });
    const ev = event([decision]);
    const up = applyPreparationLevelChange([decision], 'extensive', undefined, { event: ev, referenceDate: REF });
    expect(up.milestones).toHaveLength(3);
    expect(up.needsReplan).toBe(true);
    const down = applyPreparationLevelChange(up.milestones, 'balanced');
    expect(down.milestones.filter((m) => m.isActive !== false)).toHaveLength(1);
  });
});
