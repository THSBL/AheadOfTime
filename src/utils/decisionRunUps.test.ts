import { describe, expect, it } from 'vitest';
import type { CalendarEvent, TMinusMilestone } from '../types';
import { buildDecisionRunUps, checkOffset, checkPoints, decisionTopic, isDecisionMilestone, runUpSpacing, withDecisionRunUps } from './decisionRunUps';
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

describe('the rhythm for arranging things: Explore & share -> Decide & book -> Check & verify', () => {
  it('stages bookings and arrangements, not one-step things', () => {
    expect(isDecisionMilestone(ms('a', 'Book flights and hotel', '2026-10-20'))).toBe(true);
    expect(isDecisionMilestone(ms('b', 'Restaurant Selected & Table Reserved', '2026-10-20'))).toBe(true);
    expect(isDecisionMilestone(ms('e', 'Home Care & Pet Sitter Arranged', '2026-10-20'))).toBe(true);
    expect(isDecisionMilestone(ms('c', 'Pack suitcase', '2026-10-20'))).toBe(false);
    expect(isDecisionMilestone(ms('f', 'Buy drinks and ice', '2026-10-20'))).toBe(false);
    expect(isDecisionMilestone(ms('g', 'US ESTA Approved & Passports Verified', '2026-10-20'))).toBe(false);
    expect(isDecisionMilestone(ms('d', 'Book flights', '2026-10-20', { status: 'completed' }))).toBe(false);
  });

  it('names what is arranged, without the verb or the outcome', () => {
    expect(decisionTopic('Book flights and hotel')).toBe('flights and hotel');
    expect(decisionTopic('Travel prep: Reserve dinner table')).toBe('dinner table');
    expect(decisionTopic('Flights & Brooklyn Lodging Secured', 'Trip to Brooklyn')).toBe('flights & Brooklyn lodging');
    expect(decisionTopic('Flights & lodging Booked & Confirmed')).toBe('flights & lodging');
  });

  it('knows what to check once booked', () => {
    expect(checkPoints('flights & lodging')).toBe('arrival times, transfers, check-in');
    expect(checkPoints('dinner table')).toBe('booking time, getting there');
    expect(checkPoints('something else')).toBe('details, timing');
  });

  it('scales the timing to the time left', () => {
    expect(runUpSpacing(20)).toEqual({ look: 7 });
    expect(runUpSpacing(3)).toEqual({ look: 2 });
    expect(runUpSpacing(1)).toBeNull();
    expect(checkOffset(30)).toBe(23); // a week before the event
    expect(checkOffset(6)).toBe(3); // halfway
    expect(checkOffset(1)).toBeNull();
  });

  it('adds explore & share before and check & verify after a booking in a group event', () => {
    const decision = ms('a', 'Book flights and hotel', '2026-10-20');
    const added = buildDecisionRunUps(event([decision]), [decision], REF);
    expect(added.map((m) => [m.title, m.calculatedDate.slice(0, 10), m.tier])).toEqual([
      ['Explore & share options: flights and hotel', '2026-10-13', 'extensive'],
      ['Check & verify: flights and hotel (arrival times, transfers, check-in)', '2026-11-13', 'extensive'],
    ]);
    const all = withDecisionRunUps(event([decision]), [decision], REF);
    expect(all.map((m) => m.title)).toEqual([
      'Explore & share options: flights and hotel',
      'Decide & book: flights and hotel',
      'Check & verify: flights and hotel (arrival times, transfers, check-in)',
    ]);
  });

  it('explores alone when nobody else is involved', () => {
    const decision = ms('a', 'Book dentist', '2026-10-20');
    const solo = event([decision], { title: 'Dentist', userRole: 'guest' });
    expect(buildDecisionRunUps(solo, [decision], REF)[0].title).toBe('Explore options: dentist');
  });

  it('is idempotent and does not double a stage the plan already has', () => {
    const decision = ms('a', 'Book flights and hotel', '2026-10-20');
    const once = withDecisionRunUps(event([decision]), [decision], REF);
    expect(withDecisionRunUps(event(once), once, REF)).toEqual(once);
    const aiLook = ms('b', 'Compare flights options', '2026-10-12');
    expect(buildDecisionRunUps(event([decision, aiLook]), [decision, aiLook], REF).map((m) => m.title)).toEqual([
      'Check & verify: flights and hotel (arrival times, transfers, check-in)',
    ]);
  });

  it('a booking with no room before it still gets its check', () => {
    const decision = ms('a', 'Book taxi', '2026-10-02');
    expect(buildDecisionRunUps(event([decision]), [decision], REF).map((m) => m.title)).toEqual(['Check & verify: taxi (pick-up)']);
  });

  it('switching to Extensive adds the stages; Balanced hides them and gives the booking its own title back', () => {
    const decision = ms('a', 'Book flights and hotel', '2026-10-20', { tier: 'essentials' });
    const ev = event([decision]);
    const up = applyPreparationLevelChange([decision], 'extensive', undefined, { event: ev, referenceDate: REF });
    expect(up.milestones).toHaveLength(3);
    expect(up.milestones.find((m) => m.id === 'a')?.title).toBe('Decide & book: flights and hotel');
    expect(up.needsReplan).toBe(true);
    const down = applyPreparationLevelChange(up.milestones, 'balanced');
    const visible = down.milestones.filter((m) => m.isActive !== false);
    expect(visible.map((m) => m.title)).toEqual(['Book flights and hotel']);
  });
});
