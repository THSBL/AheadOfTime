import { describe, expect, it } from 'vitest';
import { findPlace, travelPlace, tidyPlaceName } from './place';
import { decomposeComplexTripIntent, getCleanEventTitle } from './tminusRules';
import { newEventTitle, extractWhatWhere } from './eventTitle';
import { isAwayFromHomeEvent } from './refinementQuestions';

describe('findPlace: the one place finder', () => {
  it.each([
    ['Going to ibiza in august next year with group of 7 girls', 'Ibiza'],
    ['Family trip to Portugal in July 2027', 'Portugal'],
    ['weekend in new york with Sam', 'New York'],
    ['Trip to Scottish Highlands Oct 14-18 with 4 friends', 'Scottish Highlands'],
    ['going to brooklyn ny from 15 to 21 oktober for business trip', 'Brooklyn, NY'],
    ['Dinner in Antwerp with Sarah next Friday', 'Antwerp'],
    ['holiday in mallorca', 'Mallorca'],
    ['trip to rio de janeiro in may', 'Rio de Janeiro'],
    ['flying to costa rica next month', 'Costa Rica'],
    ['Business trip to New York, 3-5 Nov', 'New York'],
  ])('%s -> %s', (text, place) => {
    expect(findPlace(text)).toBe(place);
  });

  it.each([
    'going to the gym on Monday',
    'Birthday party in August',
    'Going to be late',
    'Going to see Mum',
    'dinner in town',
    'trip in august',
    'going to work next week',
  ])('no place in "%s"', (text) => {
    expect(findPlace(text)).toBeNull();
  });

  it('only counts a lowercase place after a travel word', () => {
    expect(travelPlace('going to ibiza')).toBe('Ibiza');
    expect(findPlace('talking in riddles')).toBeNull();
  });

  it('tidies names', () => {
    expect(tidyPlaceName('brooklyn ny')).toBe('Brooklyn, NY');
    expect(tidyPlaceName('rio de janeiro')).toBe('Rio de Janeiro');
  });
});

describe('a lowercase trip with only a month: every path agrees on the place', () => {
  const msg = 'Going to ibiza in august next year with group of 7 girls';

  it('the template planner names Ibiza, never August', () => {
    const plan = decomposeComplexTripIntent(msg, '2026-10-17T10:00:00Z');
    expect(plan?.macro_event.title).toBe('Trip to Ibiza');
    expect(plan?.macro_event.destination ?? 'Ibiza').not.toMatch(/august/i);
  });

  it('the event title is Ibiza – Trip …', () => {
    expect(extractWhatWhere(msg).where).toBe('Ibiza');
    const title = newEventTitle({ message: msg, eventDate: '2027-08-12', endDate: '2027-08-18', referenceIso: '2026-10-17T10:00:00Z' });
    expect(title.startsWith('Ibiza – ')).toBe(true);
    expect(title).not.toMatch(/august –/i);
  });

  it('the conversational title clean-up agrees', () => {
    expect(getCleanEventTitle('going to ibiza in august')).toBe('Trip to Ibiza');
  });

  it('is a trip, so no day-out questions', () => {
    expect(isAwayFromHomeEvent(msg)).toBe(true);
  });
});

describe('a month-only message whose days were picked afterwards', () => {
  it('shows the picked days, not just the month', () => {
    const msg = 'Going to ibiza in august next year with group of 7 girls\nWhich days in August 2027? 2027-08-12 to 2027-08-18';
    const title = newEventTitle({ message: msg, eventDate: '2027-08-12', endDate: '2027-08-18', referenceIso: '2026-10-17T10:00:00Z' });
    expect(title).toMatch(/^Ibiza – Trip.* – 12–18 Aug 2027$/);
  });
});

describe('activity ideas fit the trip', () => {
  it('a group of friends gets trip ideas, not a stag do', () => {
    const plan = decomposeComplexTripIntent('Going to ibiza from 12 to 18 august 2027 with group of 7 girls', '2026-10-17T10:00:00Z');
    const options = (plan?.milestones || []).flatMap((m) => m.refinementOptions || []);
    expect(options.join(' ')).not.toMatch(/karting|paintball|axe/i);
    expect(plan?.conversational_response || '').not.toMatch(/paintball|axe/i);
  });
  it('a stag do keeps its ideas', () => {
    const plan = decomposeComplexTripIntent('Stag weekend in Prague 12-14 March 2027 with 10 lads', '2026-10-17T10:00:00Z');
    expect((plan?.milestones || []).flatMap((m) => m.refinementOptions || []).join(' ')).toMatch(/karting/i);
  });
});
