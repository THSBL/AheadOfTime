import { describe, it, expect } from 'vitest';
import { generateDeterministicMilestones } from './deterministicMilestoneGenerator';

describe('generateDeterministicMilestones - routing', () => {
  it('routes to the chip-answer-aware engine when wizardChipAnswers is present', () => {
    const milestones = generateDeterministicMilestones({
      eventId: 'evt-1',
      title: 'Trip to Rome',
      eventDate: '2026-10-15',
      eventTime: '19:00',
      wizardChipAnswers: {
        canonicalCategory: 'trip',
        refinementAnswers: { transport: ['Train / Rail tickets'] },
      },
    });
    expect(milestones.length).toBeGreaterThan(0);
    // Only the chip-aware engine reads refinementAnswers directly - confirm
    // the train choice actually reached it (not a flight default). The
    // transport mode shows up in the deliverable text, not the milestone's
    // own title.
    const deliverableTitles = milestones.flatMap((m) => (m.deliverables || []).map((d) => d.title.toLowerCase()));
    expect(deliverableTitles.some((t) => /train|rail/.test(t))).toBe(true);
    expect(deliverableTitles.some((t) => /flight tickets/.test(t))).toBe(false);
  });

  it('routes to the category+context engine when a category is known and no chip answers are given', () => {
    const milestones = generateDeterministicMilestones({
      eventId: 'evt-2',
      title: 'Maya birthday',
      eventDate: '2026-11-20',
      eventTime: '19:00',
      category: 'birthday_party',
      context: {},
    });
    expect(milestones.length).toBeGreaterThan(0);
  });

  it('routes to the free-text regex engine when no category is known at all', () => {
    const milestones = generateDeterministicMilestones({
      eventId: 'evt-3',
      title: 'Dinner with the Smiths',
      eventDate: '2026-10-15',
      eventTime: '19:00',
    });
    expect(milestones.length).toBeGreaterThan(0);
    expect(milestones.some((m) => /reserve|restaurant/i.test(m.title))).toBe(true);
  });

  it('never assumes flights/hotel for a category-known travel_trip event with no travel-mode evidence', () => {
    // Same regression this phase fixed at the source
    // (generateHeuristicMilestones) - confirming it holds through the
    // facade too, since that's the path every real caller will use.
    const milestones = generateDeterministicMilestones({
      eventId: 'evt-4',
      title: 'Soccer Tournament Saturday',
      eventDate: '2026-10-15',
      eventTime: '19:00',
      category: 'travel_trip',
      context: {},
    });
    expect(milestones.some((m) => /flight|hotel/i.test(m.title))).toBe(false);
  });

  it('produces a non-empty plan for every routing path with no category and no chip answers (the Telegram/scan-agenda shape)', () => {
    const milestones = generateDeterministicMilestones({
      eventId: 'evt-5',
      title: 'Weekend camping trip to the Lake District',
      eventDate: '2026-10-15',
      eventTime: '19:00',
      rawText: 'need to book a campsite',
    });
    expect(milestones.length).toBeGreaterThan(0);
  });
});
