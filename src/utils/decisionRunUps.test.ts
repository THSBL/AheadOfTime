import { describe, expect, it } from 'vitest';
import type { CalendarEvent, TMinusMilestone } from '../types';
import { applyStaging, buildDecisionRunUps, checkOffset, checkPoints, decisionTopic, isDecisionMilestone, runUpSpacing } from './decisionRunUps';
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
    expect(runUpSpacing(20, true)).toEqual({ look: 14 });
    expect(runUpSpacing(3)).toEqual({ look: 2 });
    expect(runUpSpacing(1)).toBeNull();
    expect(checkOffset(30)).toBe(23); // a week before the event
    expect(checkOffset(6)).toBe(3); // halfway
    expect(checkOffset(1)).toBeNull();
  });

  const picked = (keys: Record<string, 'group' | 'headroom'>) => ({ stagingAnswered: true, stagedBookings: keys });

  it('a plan starts lean: nothing is staged until the user picks it', () => {
    const decision = ms('a', 'Book flights and hotel', '2026-10-20');
    expect(buildDecisionRunUps(event([decision]), [decision], REF)).toEqual([]);
    expect(applyStaging(event([decision]), [decision], REF)).toEqual([decision]);
  });

  it('a trip booking decided with the group: Explore & share, then Decide & book (the whole-trip check covers stage 3)', () => {
    const decision = ms('a', 'Book flights and hotel', '2026-10-20');
    const ev = event([decision], { context: picked({ 'flights and hotel': 'group' }) });
    expect(applyStaging(ev, [decision], REF).map((m) => [m.title, m.calculatedDate.slice(0, 10)])).toEqual([
      ['Explore & share options: flights and hotel', '2026-10-13'],
      ['Decide & book: flights and hotel', '2026-10-20'],
    ]);
  });

  it('outside a trip, a picked booking also gets its own check', () => {
    const decision = ms('a', 'Book the venue', '2026-10-20');
    const ev = event([decision], { category: 'birthday_party', title: 'Party with friends', context: picked({ venue: 'group' }) });
    expect(applyStaging(ev, [decision], REF).map((m) => m.title)).toEqual([
      'Explore & share options: venue',
      'Decide & book: venue',
      'Check & verify: venue (access, setup time)',
    ]);
  });

  it('solo headroom starts exploring earlier, without sharing', () => {
    const decision = ms('a', 'Book dentist', '2026-10-30');
    const ev = event([decision], { title: 'Dentist', userRole: 'guest', category: 'custom', context: picked({ dentist: 'headroom' }) });
    const first = applyStaging(ev, [decision], REF)[0];
    expect([first.title, first.calculatedDate.slice(0, 10)]).toEqual(['Explore options: dentist', '2026-10-16']);
  });

  it('is idempotent, and un-picking removes open stages and gives the booking its title back', () => {
    const decision = ms('a', 'Book flights and hotel', '2026-10-20');
    const ev = event([decision], { context: picked({ 'flights and hotel': 'group' }) });
    const once = applyStaging(ev, [decision], REF);
    expect(applyStaging(ev, once, REF)).toEqual(once);
    const back = applyStaging(event(once, { context: picked({}) }), once, REF);
    expect(back.map((m) => m.title)).toEqual(['Book flights and hotel']);
  });

  it('the help level alone never adds stages', () => {
    const decision = ms('a', 'Book flights and hotel', '2026-10-20', { tier: 'essentials' });
    const up = applyPreparationLevelChange([decision], 'extensive', undefined, { event: event([decision]), referenceDate: REF });
    expect(up.milestones.map((m) => m.title)).toEqual(['Book flights and hotel']);
  });
});

describe('plans saved before the rhythm', () => {
  it('rename open look/share steps into one Explore & share step and the booking into Decide & book', async () => {
    const { upgradeLegacyRunUps } = await import('./decisionRunUps');
    const ev = event([
      ms('a', 'Flights & Brooklyn Lodging Secured', '2026-10-05', { category: 'booking' }),
      ms('a-runup-look', 'Look at options: flights & Brooklyn Lodging Secured', '2026-10-01', { slotKey: 'runup:a:look' }),
      ms('a-runup-share', 'Share flights & Brooklyn Lodging Secured options with the group', '2026-10-03', { slotKey: 'runup:a:share' }),
    ], { title: 'Trip to Brooklyn with friends', location: 'Brooklyn, New York' });
    const titles = upgradeLegacyRunUps(ev).milestones.filter((m) => m.isActive !== false).map((m) => m.title).sort();
    expect(titles).toEqual(['Decide & book: flights & Brooklyn lodging', 'Explore & share options: flights & Brooklyn lodging']);
    const fresh = event([ms('b', 'Book flights', '2026-10-05')]);
    expect(upgradeLegacyRunUps(fresh)).toBe(fresh);
  });
});
