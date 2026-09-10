import { describe, it, expect } from 'vitest';
import {
  getCleanEventTitle,
  detectEventCategory,
  parseNaturalDateRange,
  decomposeComplexTripIntent,
  generateHeuristicMilestones,
} from './tminusRules';

// Fixed reference date used throughout so date-offset assertions are stable
// regardless of when the suite runs.
const REF_DATE_ISO = '2026-09-01T12:00:00.000Z';

describe('getCleanEventTitle', () => {
  it('extracts a destination from conversational "Going to X on <date>" phrasing', () => {
    // Regression test: the destination regex previously required whitespace
    // before its end-of-string alternative, which never matches when the
    // destination is the last word - see the "Fix generic Travel Trip
    // titles" commit.
    expect(getCleanEventTitle('Trip to New York', 'travel_trip')).toBe('Trip to New York');
  });

  it('does not fall back to a generic title when a destination is present', () => {
    expect(getCleanEventTitle('Trip to Paris', 'travel_trip')).not.toBe('Travel Trip');
  });

  it('falls back to "Travel Trip" only when no destination can be extracted', () => {
    // A destination made of digits can't match the extraction regex at all
    // (it only captures letters), so this exercises the true fallback path.
    expect(getCleanEventTitle('Trip to 123', 'travel_trip')).toBe('Travel Trip');
  });

  it('labels a business trip distinctly from a leisure trip', () => {
    expect(getCleanEventTitle('Going to Chicago for business', 'travel_trip')).toBe('Business Trip to Chicago');
  });

  it('passes through an already-specific title unchanged', () => {
    expect(getCleanEventTitle("Maya's 30th Birthday Party", 'birthday_party')).toBe("Maya's 30th Birthday Party");
  });

  it('treats the bare internal sentinel "Group Trip Horizon" as generic', () => {
    const result = getCleanEventTitle('Group Trip Horizon', 'travel_trip');
    expect(result).not.toBe('Group Trip Horizon');
  });

  it('keeps a "Group Trip Horizon" title once a destination has been appended to it', () => {
    // Regression test: getCleanEventTitle used to discard any title
    // *starting with* the sentinel, even after a real destination was
    // appended (e.g. "Group Trip Horizon (New York)"), throwing away real
    // information for a vaguer category label instead.
    expect(getCleanEventTitle('Group Trip Horizon (New York)', 'travel_trip')).toBe('Group Trip Horizon (New York)');
  });

  it('replaces "Upcoming Event" with a category-based fallback', () => {
    const result = getCleanEventTitle('Upcoming Event', 'birthday_party');
    expect(result).not.toBe('Upcoming Event');
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('detectEventCategory', () => {
  it('detects a birthday party', () => {
    expect(detectEventCategory("Maya's 30th birthday party")).toBe('birthday_party');
  });

  it('detects kids hobbies/activities over generic sports mentions', () => {
    expect(detectEventCategory('Soccer tournament this weekend')).toBe('kids_hobbies');
  });

  it('detects hosting visitors', () => {
    expect(detectEventCategory('Friends staying with us this weekend')).toBe('hosting_visitors');
  });
});

describe('parseNaturalDateRange', () => {
  it('parses an explicit ISO date range', () => {
    const result = parseNaturalDateRange('2026-10-15 to 2026-10-18', REF_DATE_ISO);
    expect(result).toMatchObject({ startDate: '2026-10-15', endDate: '2026-10-18' });
  });

  it('parses "<day> <Month>" with an ordinal suffix, defaulting to the reference year', () => {
    const result = parseNaturalDateRange('on 15th October', REF_DATE_ISO);
    expect(result?.startDate).toBe('2026-10-15');
  });

  it('parses "<Month> <day>" (US month-first order)', () => {
    const result = parseNaturalDateRange('October 15', REF_DATE_ISO);
    expect(result?.startDate).toBe('2026-10-15');
  });

  it('parses a day-to-day range within one month', () => {
    const result = parseNaturalDateRange('from 15 to 21 October', REF_DATE_ISO);
    expect(result).toMatchObject({ startDate: '2026-10-15', endDate: '2026-10-21' });
  });

  it('returns null when no recognizable date is present', () => {
    expect(parseNaturalDateRange('no dates mentioned here', REF_DATE_ISO)).toBeNull();
  });

  it('parses a tightly-written "<Month> <day>-<day>" range with no spaces around the hyphen', () => {
    // Regression test: the range separator required surrounding whitespace,
    // so "Oct 14-18" silently fell through to the single-date pattern and
    // dropped the end date entirely.
    const result = parseNaturalDateRange('Oct 14-18', REF_DATE_ISO);
    expect(result).toMatchObject({ startDate: '2026-10-14', endDate: '2026-10-18' });
  });
});

describe('decomposeComplexTripIntent', () => {
  it('recognizes conversational "Going to <place>" phrasing as trip intent', () => {
    // Regression test: isTripIntent previously only matched literal
    // keywords like "trip"/"vacation"/"getaway", so a message starting
    // with "Going to <place>" never triggered trip decomposition at all.
    const result = decomposeComplexTripIntent(
      'Going to New York on October 15th with my wife.',
      REF_DATE_ISO
    );
    expect(result).not.toBeNull();
  });

  it('extracts the destination into the macro event title', () => {
    const result = decomposeComplexTripIntent(
      'Going to New York on October 15th with my wife.',
      REF_DATE_ISO
    );
    expect(result?.macro_event.title).toBe('Trip to New York');
  });

  it('extracts the destination even when immediately followed by "on <date>"', () => {
    // Regression test: the destination regex was missing "on" as a
    // stop-word, so "to New York on October 15th" failed to extract
    // "New York" at all.
    const result = decomposeComplexTripIntent('Weekend trip to Boston on October 15th.', REF_DATE_ISO);
    expect(result?.macro_event.title).toContain('Boston');
  });

  it('returns null for a message with no trip-like intent', () => {
    expect(decomposeComplexTripIntent('Pay the electricity bill', REF_DATE_ISO)).toBeNull();
  });

  it('gives a specific title to a recognized archetype (stag party) alongside the destination', () => {
    const result = decomposeComplexTripIntent('Stag party trip to Prague', REF_DATE_ISO);
    expect(result?.macro_event.title).toBe('Stag Party Weekend (Prague)');
  });

  it('extracts the destination when immediately followed by a bare month/date (no "on")', () => {
    // Regression test: the destination regex only stopped at "from|with|for
    // |on|,|." - a destination directly followed by a date like "Highlands
    // Oct 14-18" swallowed the month name into the capture, the trailing
    // digits then broke the [a-zA-Z\s] class, the whole match failed, and
    // the generic "Group Trip Horizon" sentinel leaked through as the title.
    const result = decomposeComplexTripIntent('Trip to Scottish Highlands Oct 14-18 with 4 friends', REF_DATE_ISO);
    expect(result?.macro_event.title).toContain('Scottish Highlands');
    expect(result?.macro_event.start_date).toBe('2026-10-14');
    expect(result?.macro_event.end_date).toBe('2026-10-18');
  });
});

describe('generateHeuristicMilestones', () => {
  it('generates at least one milestone for a travel_trip category', () => {
    const milestones = generateHeuristicMilestones(
      { category: 'travel_trip', context: {} },
      'evt-test-1',
      '2026-10-15',
      '19:00'
    );
    expect(milestones.length).toBeGreaterThan(0);
  });

  it('adds a pet-care milestone when the title mentions a dog sitter', () => {
    const milestones = generateHeuristicMilestones(
      { category: 'travel_trip', title: 'Trip to New York (need a dog sitter)', context: {} },
      'evt-test-2',
      '2026-10-15',
      '19:00'
    );
    expect(milestones.some((m) => /dog sitter|pet boarding/i.test(m.title))).toBe(true);
  });

  it('adds a passport-check milestone for international destinations', () => {
    const milestones = generateHeuristicMilestones(
      { category: 'travel_trip', title: 'Trip to Paris', context: {} },
      'evt-test-3',
      '2026-10-15',
      '19:00'
    );
    expect(milestones.some((m) => /passport/i.test(m.title))).toBe(true);
  });

  it('generates a birthday-appropriate milestone set', () => {
    const milestones = generateHeuristicMilestones(
      { category: 'birthday_party', context: {} },
      'evt-test-4',
      '2026-10-15',
      '19:00'
    );
    expect(milestones.length).toBeGreaterThan(0);
  });
});
