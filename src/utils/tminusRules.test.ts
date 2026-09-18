import { describe, it, expect } from 'vitest';
import {
  getCleanEventTitle,
  detectEventCategory,
  parseNaturalDateRange,
  decomposeComplexTripIntent,
  generateHeuristicMilestones,
  applyMilestoneQualityGuardrails,
  attachDeliverablesToMilestones,
  finalizeMilestonePlan,
  sanitizeMilestoneTitle,
  sanitizeSlotKey,
  isSameMilestoneTask,
  preserveCompletedMilestones,
} from './tminusRules';
import type { TMinusMilestone } from '../types';

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

  it('treats a bare category-label title like "Travel & Vacation Trip" as generic, not already-specific', () => {
    // Regression test for a real, live-reported bug: Gemini's own
    // macro_event.title defaulted to exactly this plausible-but-generic
    // phrase for a fresh trip creation, and this function's narrow
    // sentinel list ("Upcoming Event"/"New Event"/"Event"/"Group Trip
    // Horizon") let it straight through as if it were already specific.
    const result = getCleanEventTitle('Travel & Vacation Trip', 'travel_trip', { destination: 'Egypt' });
    expect(result).toBe('Trip to Egypt');
  });

  it('also catches "Vacation Trip", "Travel Trip", and bare "Business Trip" as generic', () => {
    expect(getCleanEventTitle('Vacation Trip', 'travel_trip', { destination: 'Egypt' })).toBe('Trip to Egypt');
    expect(getCleanEventTitle('Travel Trip', 'travel_trip', { destination: 'Egypt' })).toBe('Trip to Egypt');
    expect(getCleanEventTitle('Business Trip', 'travel_trip', { destination: 'Egypt', isBusinessTrip: true })).toBe('Business Trip to Egypt');
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

  it('does not hijack a single-day event that merely contains a soft trip word', () => {
    // Regression test: "weekend"/"holiday"/"getaway"/"conference"/"retreat"
    // used to trigger full trip decomposition on their own, so an ordinary
    // single-day event like a "weekend BBQ" got silently replaced with a
    // canned multi-day "Group Trip Horizon" plan and unrelated Day 2
    // milestones. These words should only decompose as a trip alongside an
    // actual multi-day date range.
    expect(decomposeComplexTripIntent('Weekend BBQ with the neighbors', REF_DATE_ISO)).toBeNull();
    expect(decomposeComplexTripIntent('Holiday party at the office', REF_DATE_ISO)).toBeNull();
    expect(decomposeComplexTripIntent('Team retreat planning call', REF_DATE_ISO)).toBeNull();
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

  it('gives a business trip its own client/deck/attire track instead of the generic group-trip activity plan', () => {
    // Regression test: this regex heuristic used to have zero business-trip
    // awareness, so "work trip ... for business, need to present to a
    // client" fell into the generic "Group Trip Horizon" template with
    // group-activity suggestions (Go-Karting, Paintball, group kitty) that
    // make no sense for a solo work trip.
    const result = decomposeComplexTripIntent(
      'I am going on a work trip to New York for business, I need to present to a client',
      REF_DATE_ISO
    );
    expect(result?.macro_event.archetype).toBe('Business Trip');
    expect(result?.macro_event.title).toContain('New York');
    const taskTitles = result?.milestones.map((m) => m.task).join(' | ') || '';
    expect(taskTitles).toMatch(/client/i);
    expect(taskTitles).toMatch(/slide deck/i);
    expect(taskTitles).toMatch(/attire/i);
    // None of the group-trip-specific suggestions should leak into a
    // solo business trip's runway.
    expect(taskTitles).not.toMatch(/go-karting|paintball|kitty/i);
  });

  it('recognizes a business trip from "client"/"pitch" mentioned in the message even without the word "business"', () => {
    const result = decomposeComplexTripIntent('Flying to Chicago for a client pitch next month', REF_DATE_ISO);
    expect(result?.macro_event.archetype).toBe('Business Trip');
  });

  it('does not treat a couple\'s holiday as a group trip needing headcount/shared-fund logistics', () => {
    // Regression test: a surprise holiday with a partner used to fall
    // through to the same "Default Organiser" branch as an actual group
    // trip, generating "collect group kitty & lock in attendance count",
    // "reserve group dinner", and "coordinate shared cabs with organiser"
    // milestones for what is just two people traveling together.
    const result = decomposeComplexTripIntent(
      'Going on a surprise holiday with my girlfriend from Nov 11 to Nov 18',
      REF_DATE_ISO
    );
    const taskTitles = result?.milestones.map((m) => m.task).join(' | ') || '';
    expect(taskTitles).not.toMatch(/kitty|headcount|rsvp|attendance count|shared trip fund|organiser/i);
  });

  it('does not use "group" framing in sub-event titles for a couple\'s trip', () => {
    const result = decomposeComplexTripIntent(
      'Going on a surprise holiday with my girlfriend from Nov 11 to Nov 18, dinner on Saturday',
      REF_DATE_ISO
    );
    const subEventTitles = result?.sub_events.map((s) => s.title).join(' | ') || '';
    expect(subEventTitles).not.toMatch(/group/i);
  });

  it('still applies group-coordination logistics when a genuine group is mentioned', () => {
    const result = decomposeComplexTripIntent(
      'Trip to Scottish Highlands Oct 14-18 with 4 friends',
      REF_DATE_ISO
    );
    const taskTitles = result?.milestones.map((m) => m.task).join(' | ') || '';
    expect(taskTitles).toMatch(/shared trip fund|attendance count/i);
  });

  it('never uses "kitty" terminology, even for a genuine group trip', () => {
    const result = decomposeComplexTripIntent(
      'Stag party trip to Prague with the guys',
      REF_DATE_ISO
    );
    const taskTitles = result?.milestones.map((m) => m.task).join(' | ') || '';
    expect(taskTitles).not.toMatch(/kitty/i);
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

  it('does not suggest buying ice, glassware, or decor for a party hosted at a bar', () => {
    // Regression test for the exact scenario reported: "a party in a bar"
    // was still getting the generic self-hosting baseline (buy ice, snacks,
    // drinks) because that fallback only got suppressed when
    // context.foodPlan was set to the exact string 'bar' - the free-text
    // venue mention alone did nothing.
    const milestones = generateHeuristicMilestones(
      { category: 'birthday_party', title: "Maya's birthday party at The Rooftop Bar", context: {} },
      'evt-test-bar',
      '2026-10-15',
      '19:00'
    );
    const supplyTasks = milestones.filter((m) => /\bice\b|glassware|\bdecor\b|balloons?/i.test(`${m.title} ${m.description || ''}`));
    expect(supplyTasks).toEqual([]);
  });

  it('adds a post-trip follow-up milestone dated after the event, not just pre-departure tasks', () => {
    const milestones = generateHeuristicMilestones(
      { category: 'travel_trip', title: 'Trip to Paris', context: {} },
      'evt-test-posttrip',
      '2026-10-15',
      '19:00'
    );
    const postTrip = milestones.find((m) => m.tMinusLabel === 'Day +1');
    expect(postTrip).toBeDefined();
    expect(postTrip!.title).toMatch(/unpack/i);
    expect(postTrip!.category).toBe('logistics');
    // Dated after the event's own start date, not before it like every
    // other milestone in this list.
    expect(new Date(postTrip!.calculatedDate).getTime()).toBeGreaterThan(new Date('2026-10-15').getTime());
  });

  it('gives the post-trip follow-up business-appropriate wording for a business trip', () => {
    const milestones = generateHeuristicMilestones(
      { category: 'travel_trip', title: 'Business trip to Chicago for client meetings', context: { isBusinessTrip: true } },
      'evt-test-postbiz',
      '2026-10-15',
      '19:00'
    );
    const postTrip = milestones.find((m) => m.tMinusLabel === 'Day +1');
    expect(postTrip).toBeDefined();
    expect(postTrip!.title).toMatch(/expense report/i);
  });

  it('dates the post-trip follow-up off the return/end date, not the departure date, for multi-day trips', () => {
    const milestones = generateHeuristicMilestones(
      { category: 'travel_trip', title: 'Trip to Paris', endDate: '2026-10-22', context: {} },
      'evt-test-posttrip-enddate',
      '2026-10-15',
      '19:00'
    );
    const postTrip = milestones.find((m) => m.tMinusLabel === 'Day +1');
    expect(postTrip).toBeDefined();
    // One day after the trip's end date (Oct 22), not one day after the
    // start date (Oct 15).
    expect(postTrip!.calculatedDate.slice(0, 10)).toBe('2026-10-23');
  });

  it('adds a post-launch review milestone dated after the deadline for project_deadline events', () => {
    const milestones = generateHeuristicMilestones(
      { category: 'project_deadline', context: {} },
      'evt-test-launch',
      '2026-10-15',
      '19:00'
    );
    const postLaunch = milestones.find((m) => m.tMinusLabel === 'Day +3');
    expect(postLaunch).toBeDefined();
    expect(postLaunch!.title).toMatch(/review|retro/i);
    expect(postLaunch!.category).toBe('review');
    expect(new Date(postLaunch!.calculatedDate).getTime()).toBeGreaterThan(new Date('2026-10-15').getTime());
  });
});

describe('applyMilestoneQualityGuardrails', () => {
  const makeMilestone = (overrides: Partial<TMinusMilestone> = {}): TMinusMilestone => ({
    id: overrides.id || 'ms-1',
    eventId: 'evt-1',
    tMinusLabel: 'T-7d',
    tMinusOffsetMinutes: -10080,
    calculatedDate: '2026-10-08',
    title: 'Buy party supplies',
    category: 'shopping',
    status: 'pending',
    ...overrides,
  });

  it('collapses an exact-duplicate title down to a single milestone', () => {
    const milestones = [
      makeMilestone({ id: 'a', title: 'Confirm venue booking' }),
      makeMilestone({ id: 'b', title: 'Confirm venue booking' }),
    ];
    const result = applyMilestoneQualityGuardrails(milestones);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a');
  });

  it('collapses a near-restatement of the same task (one title containing the other)', () => {
    const milestones = [
      makeMilestone({ id: 'a', title: 'Buy gift' }),
      makeMilestone({ id: 'b', title: 'Buy birthday gift' }),
    ];
    const result = applyMilestoneQualityGuardrails(milestones);
    expect(result).toHaveLength(1);
  });

  it('leaves unrelated milestones alone', () => {
    const milestones = [
      makeMilestone({ id: 'a', title: 'Buy gift', category: 'gift' }),
      makeMilestone({ id: 'b', title: 'Book restaurant table', category: 'booking', tMinusOffsetMinutes: -4320 }),
    ];
    const result = applyMilestoneQualityGuardrails(milestones);
    expect(result).toHaveLength(2);
  });

  it('collapses a differently-worded milestone in the same category landing on nearly the same day (AI-phrased vs. template-phrased duplicate)', () => {
    const milestones = [
      makeMilestone({ id: 'a', title: 'Book flights and accommodation', category: 'booking', tMinusOffsetMinutes: -40320 }),
      makeMilestone({ id: 'b', title: 'Flights & Accommodations Locked', category: 'booking', tMinusOffsetMinutes: -43200 }),
    ];
    const result = applyMilestoneQualityGuardrails(milestones);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a');
  });

  it('does NOT merge two genuinely different same-category bookings due on the same day with no shared vocabulary and no slot_key', () => {
    // Regression test for a real production data-loss bug: a user added
    // "rental car" to a trip that already had "Flights & corporate hotel
    // booking locked". Both are category 'booking' due around the same
    // early-prep day (completely normal - a trip's "lock everything early"
    // phase naturally clusters several bookings together), so the old
    // category+timing-only fallback silently merged the new rental-car
    // milestone away - the AI's reply truthfully said it was added, but it
    // was discarded before ever being saved. That fallback is gone entirely
    // now; same category + same day is no longer, on its own, evidence of
    // being the same task.
    const milestones = [
      makeMilestone({ id: 'a', title: 'Flights & corporate hotel booking locked', category: 'booking', tMinusOffsetMinutes: -43200 }),
      makeMilestone({ id: 'b', title: 'Rental car booked', category: 'booking', tMinusOffsetMinutes: -43200 }),
    ];
    const result = applyMilestoneQualityGuardrails(milestones);
    expect(result).toHaveLength(2);
  });

  it('strips generic venue-supplied purchase milestones when the event is hosted at a bar', () => {
    const milestones = [
      makeMilestone({ id: 'a', title: 'Party beverages, snacks & ice run', category: 'shopping' }),
      makeMilestone({ id: 'b', title: 'Order balloon decor & party supplies', category: 'shopping' }),
      makeMilestone({ id: 'c', title: 'Confirm reservation headcount', category: 'booking' }),
    ];
    const result = applyMilestoneQualityGuardrails(milestones, { title: 'Party at the Rooftop Bar' });
    const titles = result.map((m) => m.title);
    expect(titles).not.toContain('Party beverages, snacks & ice run');
    expect(titles).not.toContain('Order balloon decor & party supplies');
    // A non-supply milestone (booking category) is untouched.
    expect(titles).toContain('Confirm reservation headcount');
  });

  it('does not strip supply milestones when no external venue is mentioned', () => {
    const milestones = [makeMilestone({ id: 'a', title: 'Party beverages, snacks & ice run', category: 'shopping' })];
    const result = applyMilestoneQualityGuardrails(milestones, { title: "Maya's birthday party at home" });
    expect(result).toHaveLength(1);
  });

  it('reads the venue signal from rawText/customNote, not just the title', () => {
    const milestones = [makeMilestone({ id: 'a', title: 'Buy ice and cups', category: 'shopping' })];
    const result = applyMilestoneQualityGuardrails(milestones, {
      title: "Maya's birthday",
      rawText: 'We booked a table at a restaurant for the party',
    });
    expect(result).toHaveLength(0);
  });

  it('merges two milestones sharing a slot_key even when titles/categories are unrelated', () => {
    const milestones = [
      makeMilestone({ id: 'a', title: 'Sort out the dog', category: 'admin', slotKey: 'dog_sitter' } as Partial<TMinusMilestone>),
      makeMilestone({ id: 'b', title: 'Confirm kennel booking', category: 'booking', tMinusOffsetMinutes: -1000, slotKey: 'dog_sitter' } as Partial<TMinusMilestone>),
    ];
    const result = applyMilestoneQualityGuardrails(milestones);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('a');
  });

  it('does not merge two milestones with different explicit slot_keys even if titles overlap', () => {
    const milestones = [
      makeMilestone({ id: 'a', title: 'Order birthday gift', category: 'shopping', slotKey: 'gift_order' } as Partial<TMinusMilestone>),
      makeMilestone({ id: 'b', title: 'Wrap gift & prepare birthday card', category: 'prep', slotKey: 'gift_wrap' } as Partial<TMinusMilestone>),
    ];
    const result = applyMilestoneQualityGuardrails(milestones);
    expect(result).toHaveLength(2);
  });

  it('still applies the legacy fuzzy fallback when either side lacks a slot_key', () => {
    const milestones = [
      makeMilestone({ id: 'a', title: 'Book flights and accommodation', category: 'booking', tMinusOffsetMinutes: -40320 }),
      makeMilestone({ id: 'b', title: 'Flights & Accommodations Locked', category: 'booking', tMinusOffsetMinutes: -43200, slotKey: 'flights_hotel' } as Partial<TMinusMilestone>),
    ];
    const result = applyMilestoneQualityGuardrails(milestones);
    expect(result).toHaveLength(1);
  });

  it('does not merge two genuinely distinct same-category milestones that just happen to land a day or two apart (no shared vocabulary)', () => {
    // Regression test: found live when exercising the deterministic
    // birthday-party fallback end-to-end - "Wrap gift & prepare birthday
    // card" (T-2d, prep) and "Party setup & beverage chill" (T-3h, prep)
    // are unrelated tasks ~45 hours apart that share zero words, but the
    // old 3-day category+timing fallback merged them anyway, grafting a
    // mismatched "Bakery or catering order confirmed" deliverable onto the
    // gift-wrapping milestone.
    const milestones = [
      makeMilestone({ id: 'a', title: 'Wrap gift & prepare birthday card', category: 'prep', tMinusOffsetMinutes: -2880 }),
      makeMilestone({
        id: 'b',
        title: 'Party setup & beverage chill',
        category: 'prep',
        tMinusOffsetMinutes: -180,
        deliverables: [{ deliverable_id: 'd1', title: 'Bakery or catering order confirmed with pickup time', type: 'purchase', is_completed: false }],
      } as Partial<TMinusMilestone>),
    ];
    const result = applyMilestoneQualityGuardrails(milestones);
    expect(result).toHaveLength(2);
    const wrapMilestone = result.find((m) => m.id === 'a')!;
    expect((wrapMilestone.deliverables || []).map((d) => d.title)).not.toContain('Bakery or catering order confirmed with pickup time');
  });

  it('does not merge two unrelated milestones that only share structural "state checkpoint" suffix words from the title converter', () => {
    // Regression test: found live - "Birthday gift Ordered & Tracked" and
    // "Birthday cake & plan refreshments Ordered & Tracked" share "birthday"
    // + the mechanically-appended "Ordered"/"Tracked" suffix (3 words), which
    // was enough to false-positive as a duplicate and silently absorb the
    // cake milestone's deliverable into the gift milestone.
    const milestones = [
      makeMilestone({ id: 'a', title: 'Birthday gift Ordered & Tracked', category: 'shopping', tMinusOffsetMinutes: -20160 }),
      makeMilestone({ id: 'b', title: 'Birthday cake & plan refreshments Ordered & Tracked', category: 'shopping', tMinusOffsetMinutes: -10080 }),
    ];
    const result = applyMilestoneQualityGuardrails(milestones);
    expect(result).toHaveLength(2);
  });

  it('does not merge two sequential milestones (order vs. wrap the gift) that only share words generic to the event\'s own title', () => {
    // Regression test: found live - within a "Birthday Celebration" event,
    // "Birthday gift Ordered & Tracked" and "Wrap gift & prepare birthday
    // card" share "birthday" + "gift", but both words are individually
    // generic to this one event (every milestone says "birthday"; "gift" is
    // the shared subject of two deliberately separate steps) - not evidence
    // they're the same task. The event's own title is passed as the signal.
    const milestones = [
      makeMilestone({ id: 'a', title: 'Birthday gift Ordered & Tracked', category: 'shopping', tMinusOffsetMinutes: -20160 }),
      makeMilestone({ id: 'b', title: 'Wrap gift & prepare birthday card', category: 'prep', tMinusOffsetMinutes: -2880 }),
    ];
    const result = applyMilestoneQualityGuardrails(milestones, { title: 'Birthday Celebration' });
    expect(result).toHaveLength(2);
  });

  it('still catches a tense/number-variant duplicate via stemming ("confirm passport" vs "passports ... confirmed")', () => {
    const milestones = [
      makeMilestone({ id: 'a', title: 'Confirm passport is valid for travel', category: 'booking', tMinusOffsetMinutes: -20160 }),
      makeMilestone({ id: 'b', title: 'Passports & Key Activities Confirmed', category: 'booking', tMinusOffsetMinutes: -20160 }),
    ];
    const result = applyMilestoneQualityGuardrails(milestones);
    expect(result).toHaveLength(1);
  });

  it('unions deliverables from both sides when a slot_key merge happens, instead of dropping the second entry\'s', () => {
    const milestones = [
      makeMilestone({
        id: 'a',
        title: 'Sort out the dog',
        slotKey: 'dog_sitter',
        deliverables: [{ deliverable_id: 'd1', title: 'Kennel booked', type: 'booking', is_completed: false }],
      } as Partial<TMinusMilestone>),
      makeMilestone({
        id: 'b',
        title: 'Confirm kennel booking',
        slotKey: 'dog_sitter',
        deliverables: [{ deliverable_id: 'd2', title: 'Vaccination records shared', type: 'document', is_completed: false }],
      } as Partial<TMinusMilestone>),
    ];
    const result = applyMilestoneQualityGuardrails(milestones);
    expect(result).toHaveLength(1);
    expect(result[0].deliverables?.map((d) => d.title)).toEqual(
      expect.arrayContaining(['Kennel booked', 'Vaccination records shared'])
    );
  });
});

// Regression coverage for a real, live-reported bug: telling the app "no
// flights, we're going by train instead" produced a plan that still
// mentioned flights - both an untouched old "Flights & lodging" milestone,
// and a newly-added milestone whose own title still said "Flights, trains
// & hotel reservation lock". This is the deterministic backstop that
// applies regardless of how well the AI path itself honored the
// correction.
describe('applyMilestoneQualityGuardrails - explicit transport-mode negation', () => {
  const makeMilestone = (overrides: Partial<TMinusMilestone> = {}): TMinusMilestone => ({
    id: overrides.id || 'ms-1',
    eventId: 'evt-1',
    tMinusLabel: 'T-30d',
    tMinusOffsetMinutes: -43200,
    calculatedDate: '2026-10-01',
    title: 'Flights & lodging Booked & Confirmed',
    category: 'booking',
    status: 'pending',
    ...overrides,
  });

  it('scrubs a mixed title down to the surviving mode instead of leaving both', () => {
    const milestones = [makeMilestone({ title: 'Flights, trains & hotel reservation lock' })];
    const result = applyMilestoneQualityGuardrails(milestones, { rawText: 'No flights, we are going by train' });
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Trains & hotel reservation lock');
  });

  it('scrubs a leading mode word followed by an ampersand', () => {
    const milestones = [makeMilestone({ title: 'Flights & lodging Booked & Confirmed' })];
    const result = applyMilestoneQualityGuardrails(milestones, { rawText: 'No flights, we are going by train' });
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Lodging Booked & Confirmed');
  });

  it('drops a deliverable that is only about the negated mode', () => {
    const milestones = [
      makeMilestone({
        title: 'Travel Booked & Confirmed',
        deliverables: [
          { deliverable_id: 'd1', title: 'Book flight tickets and select seats', type: 'booking', is_completed: false },
          { deliverable_id: 'd2', title: 'Confirm hotel booking', type: 'booking', is_completed: false },
        ],
      } as Partial<TMinusMilestone>),
    ];
    const result = applyMilestoneQualityGuardrails(milestones, { rawText: 'No flights, we are going by train' });
    expect(result).toHaveLength(1);
    expect(result[0].deliverables?.map((d) => d.title)).toEqual(['Confirm hotel booking']);
  });

  it('drops a milestone entirely once every deliverable it had was about the negated mode', () => {
    const milestones = [
      makeMilestone({
        title: 'Flight Booked & Confirmed',
        deliverables: [
          { deliverable_id: 'd1', title: 'Book flight tickets and select seats', type: 'booking', is_completed: false },
        ],
      } as Partial<TMinusMilestone>),
    ];
    const result = applyMilestoneQualityGuardrails(milestones, { rawText: 'No flights, we are going by train' });
    expect(result).toHaveLength(0);
  });

  it('recognizes a "change X to Y" phrasing, not just a bare negation', () => {
    // Regression test for a real, live-reported gap: "change flight to
    // train" slipped straight past the guardrail because it only matched
    // bare negations like "no flights" / "not flying".
    const milestones = [makeMilestone({ title: 'Flights, trains & hotel reservation lock' })];
    const result = applyMilestoneQualityGuardrails(milestones, { rawText: 'change flight to train' });
    expect(result[0].title).toBe('Trains & hotel reservation lock');
  });

  it('leaves milestones untouched when no negation phrase is present', () => {
    const milestones = [makeMilestone({ title: 'Flights & lodging Booked & Confirmed' })];
    const result = applyMilestoneQualityGuardrails(milestones, { rawText: 'Also need a rental car' });
    expect(result[0].title).toBe('Flights & lodging Booked & Confirmed');
  });

  it('does not touch an unrelated mode mentioned elsewhere', () => {
    const milestones = [makeMilestone({ title: 'Train tickets Booked & Confirmed' })];
    const result = applyMilestoneQualityGuardrails(milestones, { rawText: 'No flights, we are going by train' });
    expect(result[0].title).toBe('Train tickets Booked & Confirmed');
  });
});

describe('isSameMilestoneTask', () => {
  const makeMilestone = (overrides: Partial<TMinusMilestone> = {}): TMinusMilestone => ({
    id: overrides.id || 'ms-1',
    eventId: 'evt-1',
    tMinusLabel: 'T-7d',
    tMinusOffsetMinutes: -10080,
    calculatedDate: '2026-10-08',
    title: 'Buy party supplies',
    category: 'shopping',
    status: 'pending',
    ...overrides,
  });

  it('matches two milestones sharing an explicit slot_key, regardless of title', () => {
    const a = makeMilestone({ title: 'Kennel booked', slotKey: 'dog_sitter' } as Partial<TMinusMilestone>);
    const b = makeMilestone({ title: 'Confirm kennel booking', slotKey: 'dog_sitter' } as Partial<TMinusMilestone>);
    expect(isSameMilestoneTask(a, b)).toBe(true);
  });

  it('does not match two milestones with different explicit slot_keys even if titles overlap', () => {
    const a = makeMilestone({ title: 'Book flights', slotKey: 'flights' } as Partial<TMinusMilestone>);
    const b = makeMilestone({ title: 'Book flights again', slotKey: 'flights_return' } as Partial<TMinusMilestone>);
    expect(isSameMilestoneTask(a, b)).toBe(false);
  });

  it('matches on shared significant title words when neither has a slot_key', () => {
    const a = makeMilestone({ title: 'Flights & Accommodations Locked' });
    const b = makeMilestone({ title: 'Book flights and accommodation' });
    expect(isSameMilestoneTask(a, b)).toBe(true);
  });

  it('does not match on a single shared generic word', () => {
    const a = makeMilestone({ title: 'Buy the gift' });
    const b = makeMilestone({ title: 'Buy the cake' });
    expect(isSameMilestoneTask(a, b)).toBe(false);
  });

  it('ignores words shared with the event title itself', () => {
    const a = makeMilestone({ title: 'Order birthday gift' });
    const b = makeMilestone({ title: 'Wrap birthday gift' });
    // Both share "birthday" (scaffolding from the event title) but only one
    // other significant word each ("order" / "wrap") - not the same task.
    expect(isSameMilestoneTask(a, b, "Maya's Birthday Party")).toBe(false);
  });
});

describe('preserveCompletedMilestones', () => {
  const makeMilestone = (overrides: Partial<TMinusMilestone> = {}): TMinusMilestone => ({
    id: overrides.id || 'ms-1',
    eventId: 'evt-1',
    tMinusLabel: 'T-7d',
    tMinusOffsetMinutes: -10080,
    calculatedDate: '2026-10-08',
    title: 'Buy party supplies',
    category: 'shopping',
    status: 'pending',
    ...overrides,
  });

  it('carries completed status onto the matching new milestone', () => {
    const oldMilestones = [
      makeMilestone({ id: 'old-1', title: 'Flights & Accommodations Locked', status: 'completed', completedAt: '2026-09-01T00:00:00.000Z' }),
    ];
    const newMilestones = [
      makeMilestone({ id: 'new-1', title: 'Book flights and accommodation', status: 'pending' }),
    ];
    const result = preserveCompletedMilestones(oldMilestones, newMilestones);
    expect(result[0].status).toBe('completed');
    expect(result[0].completedAt).toBe('2026-09-01T00:00:00.000Z');
    // The new milestone's own id/title are untouched - only status/completedAt carry over.
    expect(result[0].id).toBe('new-1');
  });

  it('leaves a genuinely new milestone (no match in the old list) pending', () => {
    const oldMilestones = [makeMilestone({ id: 'old-1', title: 'Flights booked', status: 'completed' })];
    const newMilestones = [makeMilestone({ id: 'new-1', title: 'Rental car reserved', status: 'pending' })];
    const result = preserveCompletedMilestones(oldMilestones, newMilestones);
    expect(result[0].status).toBe('pending');
  });

  it('does not touch a milestone the new plan already marks completed', () => {
    const oldMilestones = [makeMilestone({ id: 'old-1', title: 'Flights booked', status: 'completed', completedAt: '2026-09-01T00:00:00.000Z' })];
    const newMilestones = [makeMilestone({ id: 'new-1', title: 'Flights booked', status: 'completed', completedAt: '2026-09-05T00:00:00.000Z' })];
    const result = preserveCompletedMilestones(oldMilestones, newMilestones);
    expect(result[0].completedAt).toBe('2026-09-05T00:00:00.000Z');
  });

  it('returns the new list unchanged when there are no old milestones', () => {
    const newMilestones = [makeMilestone({ id: 'new-1', status: 'pending' })];
    expect(preserveCompletedMilestones([], newMilestones)).toBe(newMilestones);
  });

  it('returns the new list unchanged when nothing in the old list was completed', () => {
    const oldMilestones = [makeMilestone({ id: 'old-1', title: 'Flights booked', status: 'pending' })];
    const newMilestones = [makeMilestone({ id: 'new-1', title: 'Flights booked', status: 'pending' })];
    expect(preserveCompletedMilestones(oldMilestones, newMilestones)).toBe(newMilestones);
  });
});

describe('sanitizeMilestoneTitle', () => {
  it('strips a leading stray "or" left over from a bad hedge-phrase title', () => {
    expect(sanitizeMilestoneTitle('or brainstorm birthday gift Ordered & Tracked')).toBe('Brainstorm birthday gift Ordered & Tracked');
  });

  it('capitalizes the first letter of an otherwise normal title', () => {
    expect(sanitizeMilestoneTitle('flights booked & confirmed')).toBe('Flights booked & confirmed');
  });

  it('leaves a legitimate leading article untouched', () => {
    expect(sanitizeMilestoneTitle('The Great Gatsby Party Booked')).toBe('The Great Gatsby Party Booked');
  });
});

describe('sanitizeSlotKey', () => {
  it('lowercases and snake_cases a raw model-provided key', () => {
    expect(sanitizeSlotKey('Flights & Hotel')).toBe('flights_hotel');
  });

  it('collapses empty/garbage input to undefined', () => {
    expect(sanitizeSlotKey('   ')).toBeUndefined();
    expect(sanitizeSlotKey(undefined)).toBeUndefined();
    expect(sanitizeSlotKey(null as any)).toBeUndefined();
  });

  it('caps length at 40 characters', () => {
    const long = 'a'.repeat(80);
    expect(sanitizeSlotKey(long)!.length).toBe(40);
  });
});

describe('attachDeliverablesToMilestones - regression for the exact historical bug string', () => {
  it('does not produce "or brainstorm birthday gift Ordered & Tracked" from the bad source title', () => {
    const milestones: TMinusMilestone[] = [{
      id: 'ms-1',
      eventId: 'evt-1',
      tMinusLabel: 'T-14d',
      tMinusOffsetMinutes: -20160,
      calculatedDate: '2026-10-01',
      title: 'Order or brainstorm birthday gift',
      category: 'shopping',
      status: 'pending',
    }];
    const result = attachDeliverablesToMilestones(milestones);
    // The historical bug: stripping only the leading "Order " verb left "or
    // brainstorm birthday gift", then appended " Ordered & Tracked" onto it.
    // The guarded converter must refuse to mangle a hedge-phrase title at
    // all, leaving it a sensible (if unremarkable) title instead.
    expect(result[0].title).not.toBe('or brainstorm birthday gift Ordered & Tracked');
    expect(result[0].title).not.toMatch(/^or\s/i);
  });
});

describe('generateHeuristicMilestones - regression for the exact historical bug string', () => {
  it('never emits a milestone title starting with a stray "or" for a default birthday gift plan', () => {
    const milestones = generateHeuristicMilestones(
      { category: 'birthday_party', title: "Maya's birthday party", context: {} },
      'evt-test-gift',
      '2026-11-20',
      '19:00'
    );
    const badTitle = milestones.find((m) => /^or\s/i.test(m.title));
    expect(badTitle).toBeUndefined();
  });
});

describe('finalizeMilestonePlan', () => {
  it('composes deliverable attachment, slot_key dedup, and title sanitization in one call', () => {
    const milestones: TMinusMilestone[] = [{
      id: 'ms-1',
      eventId: 'evt-1',
      tMinusLabel: 'T-14d',
      tMinusOffsetMinutes: -20160,
      calculatedDate: '2026-10-01',
      title: 'or brainstorm birthday gift',
      category: 'shopping',
      status: 'pending',
    }];
    const result = finalizeMilestonePlan(milestones);
    expect(result[0].title).not.toMatch(/^or\s/i);
  });
});
