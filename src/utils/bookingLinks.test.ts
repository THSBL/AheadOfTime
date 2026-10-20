import { describe, expect, it } from 'vitest';
import { bookingNeeds, knownCountry, linksFor } from './bookingLinks';

const ms = (id: string, title: string, extra: Record<string, unknown> = {}) =>
  ({ id, eventId: 'e', title, tMinusLabel: '', tMinusOffsetMinutes: 0, calculatedDate: '2027-07-01', category: 'booking', status: 'pending', ...extra }) as any;

const trip = {
  title: 'Ibiza – Trip – 12–18 Aug 2027',
  eventDate: '2027-08-12',
  endDate: '2027-08-18',
  location: 'Ibiza',
  context: { guestCount: 8 },
  milestones: [
    ms('a', 'Decide & book: which flights & where to stay'),
    ms('b', 'Shortlist & book Day 2 activity – Boat trip'),
    ms('c', 'Trip packing & travel logistics checklist'),
  ],
} as any;

describe('booking help links', () => {
  it('finds flights, stay and an activity in a trip, filled in with its place, dates and group', () => {
    const needs = bookingNeeds(trip, { country: 'NL', from: 'Amsterdam' });
    expect(needs.map((n) => n.kind)).toEqual(['flights', 'stay', 'activity']);
    const stay = needs.find((n) => n.kind === 'stay')!;
    expect(stay.links[0].url).toBe('https://www.booking.com/searchresults.html?ss=Ibiza&checkin=2027-08-12&checkout=2027-08-18&group_adults=8');
    expect(needs[0].links[0].url).toContain(encodeURIComponent('Flights to Ibiza from Amsterdam on 2027-08-12 through 2027-08-18'));
  });

  it('only ever links to known sites, and typed text stays inside a search parameter', () => {
    const evil = { ...trip, location: 'x" onmouseover=alert(1) https://evil.example/?a=b&c', milestones: [ms('a', 'Book a restaurant'), ms('b', 'Buy a gift')] };
    const urls = bookingNeeds(evil, { country: 'GB' }).flatMap((n) => n.links.map((l) => l.url));
    expect(urls.length).toBeGreaterThan(0);
    for (const u of urls) {
      expect(new URL(u).hostname).toMatch(/(^|\.)(google\.com|opentable\.com|thefork\.com|amazon\.co\.uk)$/);
      expect(u).not.toContain('"');
      expect(u).not.toContain(' ');
    }
  });

  it('uses the shop of their country, and no partner code without one set', () => {
    expect(linksFor('gift', trip, { country: 'NL' })[0]).toMatchObject({ label: 'bol.com', affiliate: false });
    expect(linksFor('gift', trip, { country: 'GB' })[0].url).toContain('amazon.co.uk');
  });

  it('leaves out steps that are not about booking', () => {
    const plan = { ...trip, milestones: [ms('a', 'Collect shared trip fund'), ms('b', 'Plan the itinerary: day-by-day outline')] };
    expect(bookingNeeds(plan, { country: 'NL' })).toEqual([]);
  });

  it('reads the country from a saved answer or the home location', () => {
    expect(knownCountry({ country: 'BE' })).toBe('BE');
    expect(knownCountry({ homeZipOrLocation: '1012 AB' })).toBe('NL');
    expect(knownCountry({ homeZipOrLocation: 'SW1A 1AA' })).toBe('GB');
    expect(knownCountry({ homeZipOrLocation: 'somewhere' })).toBeUndefined();
    expect(knownCountry(null)).toBeUndefined();
  });
});

describe('group size for stays', () => {
  it('reads it from their words when the plan has no guest count', async () => {
    const { groupSize } = await import('./bookingLinks');
    expect(groupSize({ title: 'x', context: {}, rawInputSnippet: 'Going to Ibiza with 7 friends' } as any)).toBe(8);
    expect(groupSize({ title: 'x', context: {}, rawInputSnippet: 'Dinner for 6 people' } as any)).toBe(6);
    expect(groupSize({ title: 'x', context: { guestCount: 4 } } as any)).toBe(4);
  });
});
