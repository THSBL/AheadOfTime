import { describe, it, expect } from 'vitest';
import { getActiveAssessor, AOTPreparationAssessment, AssessmentInput, deriveOutstandingGaps } from './preparationAssessment';
import type { TMinusMilestone } from '../types';

const assessor = getActiveAssessor();

describe('getActiveAssessor', () => {
  it('returns an AOTPreparationAssessment today - the JEV swap point', () => {
    expect(assessor).toBeInstanceOf(AOTPreparationAssessment);
  });
});

// Fixtures straight from the design doc's own worked example: the same
// event, three different levels, driven entirely by the user's role -
// never a category-to-level lookup table.
describe('assessPreparationLevel - soccer tournament (role-driven, not category-driven)', () => {
  const base: Omit<AssessmentInput, 'rawText'> = {
    category: 'kids_hobbies',
    title: 'Soccer Tournament Saturday',
  };

  it('child goes independently -> Essentials', () => {
    const result = assessor.assessPreparationLevel({
      ...base,
      rawText: "My son is going to the soccer tournament on his own, he doesn't need me there.",
    });
    expect(result.level).toBe('essentials');
    expect(result.signals.userResponsibility).toBe('independent');
  });

  it('parent takes child -> Balanced', () => {
    const result = assessor.assessPreparationLevel({
      ...base,
      rawText: "I'm taking my son to his soccer tournament on Saturday.",
    });
    expect(result.level).toBe('balanced');
    expect(result.signals.userResponsibility).toBe('co_responsible');
  });

  it('parent organizes the tournament -> Extensive', () => {
    const result = assessor.assessPreparationLevel({
      ...base,
      rawText: "I'm organizing the soccer tournament this weekend - need to sort teams, schedule, and venue.",
    });
    expect(result.level).toBe('extensive');
    expect(result.signals.userResponsibility).toBe('primary_organizer');
  });

  it('no role stated at all, category where role matters -> Balanced safe default, with a gap raised', () => {
    const result = assessor.assessPreparationLevel(base);
    expect(result.level).toBe('balanced');
    expect(result.signals.userResponsibility).toBe('unknown');
    const gaps = assessor.identifyInformationGaps(base);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].key).toBe('user_responsibility');
    expect(gaps[0].requiredBeforePlanning).toBe(false);
    expect(assessor.isSufficientToProceed(base)).toBe(true);
  });
});

// Second fixture pair from the doc: a category where role rarely matters,
// so no question is asked - the level comes from what the event actually
// requires instead.
describe('assessPreparationLevel - subscription (role rarely matters here, never asked)', () => {
  it('subscription trial -> Essentials (a simple decision, nothing to coordinate)', () => {
    const result = assessor.assessPreparationLevel({
      category: 'subscription',
      title: 'Gym membership free trial ends',
    });
    expect(result.level).toBe('essentials');
    expect(assessor.identifyInformationGaps({ category: 'subscription', title: 'Gym membership free trial ends' })).toHaveLength(0);
  });

  it('changing a subscription contract -> Balanced (real paperwork/terms to handle)', () => {
    const result = assessor.assessPreparationLevel({
      category: 'subscription',
      title: 'Change internet subscription contract',
      rawText: 'Need to review the new contract terms before switching plans.',
    });
    expect(result.level).toBe('balanced');
  });

  it('a realistically-worded trial cancellation still scores Essentials', () => {
    // Regression test, live-reported: the bare fixture phrase above always
    // passed, but how a trial cancellation actually gets typed ("free
    // trial ends Friday, need to cancel before I get charged") includes
    // the word "cancel" - which also flags a genuine contract change - and
    // was pushing every real trial-cancellation message to Balanced.
    const result = assessor.assessPreparationLevel({
      category: 'subscription',
      title: 'Gym free trial',
      rawText: 'My gym free trial ends Friday, need to cancel before I get charged.',
    });
    expect(result.level).toBe('essentials');
  });

  it('"cancel" still counts as real paperwork when paired with contract language', () => {
    const result = assessor.assessPreparationLevel({
      category: 'subscription',
      title: 'Cancel gym contract',
      rawText: 'Need to cancel my gym contract before the renewal date.',
    });
    expect(result.level).toBe('balanced');
  });
});

describe('assessPreparationLevel - never a category-to-level lookup table', () => {
  it('the same category produces different levels depending on role alone', () => {
    const input = { category: 'kids_hobbies' as const, title: 'Dance Recital' };
    const independent = assessor.assessPreparationLevel({ ...input, rawText: 'My daughter is going on her own.' });
    const organizing = assessor.assessPreparationLevel({ ...input, rawText: "I'm organizing the recital, booking the venue and coordinating with all the families." });
    expect(independent.level).not.toBe(organizing.level);
  });

  it('never uses time-until-event as an input signal', () => {
    // assessPreparationLevel doesn't even accept a date/time-horizon field -
    // structurally enforced by AssessmentInput not having one.
    const result = assessor.assessPreparationLevel({ category: 'birthday_party', title: 'Birthday party' });
    expect(result.signals).not.toHaveProperty('daysUntilEvent');
  });
});

describe('deriveOutstandingGaps (architecture reset Phase 8)', () => {
  function ms(id: string, overrides: Partial<TMinusMilestone> = {}): TMinusMilestone {
    return {
      id,
      eventId: 'evt-1',
      tMinusLabel: 'T-7d',
      tMinusOffsetMinutes: -10080,
      calculatedDate: '2026-11-13',
      title: `Milestone ${id}`,
      category: 'prep',
      status: 'pending',
      ...overrides,
    };
  }

  const noRoleGapInput: AssessmentInput = {
    category: 'dinner_social', // not in CATEGORIES_WHERE_ROLE_MATTERS, so no role gap
    title: "Maya's dinner",
  };

  it('returns nothing when nothing is flagged and no role gap applies', () => {
    const gaps = deriveOutstandingGaps([ms('a')], noRoleGapInput);
    expect(gaps).toEqual([]);
  });

  it('adds one entry per milestone flagged needsRefinement, carrying its options', () => {
    const milestones = [
      ms('a'),
      ms('b', { needsRefinement: true, title: 'Decide: home dinner or restaurant reservation', refinementOptions: ['Home dinner', 'Restaurant reservation'] }),
    ];
    const gaps = deriveOutstandingGaps(milestones, noRoleGapInput);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({
      key: 'b',
      question: 'Decide: Decide: home dinner or restaurant reservation',
      options: ['Home dinner', 'Restaurant reservation'],
    });
  });

  it('adds one entry per DELIVERABLE flagged needsRefinement, not just milestones', () => {
    const milestones = [
      ms('a', {
        deliverables: [
          { deliverable_id: 'd1', title: 'Confirm headcount', type: 'coordination', is_completed: false },
          {
            deliverable_id: 'd2',
            title: 'Decide between home dinner or restaurant reservation',
            type: 'coordination',
            is_completed: false,
            needsRefinement: true,
            refinementOptions: ['Home dinner', 'Restaurant reservation'],
          },
        ],
      }),
    ];
    const gaps = deriveOutstandingGaps(milestones, noRoleGapInput);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].key).toBe('d2');
    expect(gaps[0].options).toEqual(['Home dinner', 'Restaurant reservation']);
  });

  it('a milestone/deliverable the user already resolved (needsRefinement: false) never appears', () => {
    const milestones = [ms('a', { needsRefinement: false, refinementOptions: ['X', 'Y'] })];
    expect(deriveOutstandingGaps(milestones, noRoleGapInput)).toEqual([]);
  });

  it('combines the role gap with milestone/deliverable gaps when both apply', () => {
    const roleGapInput: AssessmentInput = { category: 'kids_hobbies', title: 'Soccer Tournament Saturday' };
    const milestones = [ms('a', { needsRefinement: true, refinementOptions: ['X', 'Y'] })];
    const gaps = deriveOutstandingGaps(milestones, roleGapInput);
    expect(gaps.some((g) => g.key === 'user_responsibility')).toBe(true);
    expect(gaps.some((g) => g.key === 'a')).toBe(true);
  });

  it('excludes an ordinary already-actionable task the model incorrectly flagged, even when needsRefinement is true', () => {
    // Regression test for a real, live-reported bug: even after tightening
    // SHARED_PLANNING_RULES's own instructions, the model still flagged
    // "Order cake from local bakery" as an open decision - it's a normal
    // task with a known objective, not a genuine unresolved fork like
    // "home dinner or a restaurant reservation." A prompt rule alone isn't
    // reliable enough for something this user-visible.
    const milestones = [
      ms('a', {
        deliverables: [
          {
            deliverable_id: 'cake_order',
            title: 'Order cake from local bakery',
            type: 'purchase',
            is_completed: false,
            needsRefinement: true,
          },
          {
            deliverable_id: 'confirm_location',
            title: 'Confirm if celebration is at home or a restaurant',
            type: 'coordination',
            is_completed: false,
            needsRefinement: true,
            refinementOptions: ['Home', 'Restaurant'],
          },
        ],
      }),
    ];
    const gaps = deriveOutstandingGaps(milestones, noRoleGapInput);
    expect(gaps.some((g) => g.key === 'cake_order')).toBe(false);
    expect(gaps.some((g) => g.key === 'confirm_location')).toBe(true);
  });

  it('trusts an "X or Y" phrasing as a genuine decision even when the model gave no decision_options', () => {
    // Regression test for a real, live-reported bug found fixing the one
    // above: the verb-only fallback then wrongly excluded a genuine
    // decision the model DID flag correctly ("Confirm restaurant or home
    // setting for the Sunday afternoon") just because it opened with
    // "Confirm" and had no options - "confirm" alone can't distinguish a
    // real fork from an ordinary task, but the sentence's own "X or Y"
    // phrasing can.
    const milestones = [
      ms('a', {
        deliverables: [
          {
            deliverable_id: 'venue_confirmation',
            title: 'Confirm restaurant or home setting for the Sunday afternoon',
            type: 'coordination',
            is_completed: false,
            needsRefinement: true,
            // No refinementOptions - exactly the observed live case.
          },
          {
            deliverable_id: 'confirm_headcount',
            title: 'Confirm the final headcount',
            type: 'coordination',
            is_completed: false,
            needsRefinement: true,
          },
        ],
      }),
    ];
    const gaps = deriveOutstandingGaps(milestones, noRoleGapInput);
    expect(gaps.some((g) => g.key === 'venue_confirmation')).toBe(true);
    expect(gaps.some((g) => g.key === 'confirm_headcount')).toBe(false);
  });

  it('excludes a flagged safety instruction with no actual choice in it, even though it names no ordinary-task verb', () => {
    // Regression test for a real, live-reported bug: an earlier version of
    // this filter excluded by VERB (order/book/confirm/...), which let
    // through anything that didn't start with one of those - "Wait at
    // least 18-24 hours after final dive before boarding return flight"
    // has no options and no "or", but "Wait" wasn't on the verb list, so it
    // slipped through as a false "open decision" despite being a plain
    // safety fact with nothing to choose between. The filter must require
    // POSITIVE evidence of a real fork (options or "X or Y"), not merely
    // the absence of a recognized task verb.
    const milestones = [
      ms('a', {
        deliverables: [
          {
            deliverable_id: 'post_trip_cooldown',
            title: 'Wait at least 18-24 hours after final dive before boarding return flight',
            type: 'coordination',
            is_completed: false,
            needsRefinement: true,
          },
        ],
      }),
    ];
    const gaps = deriveOutstandingGaps(milestones, noRoleGapInput);
    expect(gaps.some((g) => g.key === 'post_trip_cooldown')).toBe(false);
  });
});

describe('assessPreparationLevel - trips are never a self-contained task', () => {
  it('scores a solo business trip that names no bookings above Essentials', () => {
    const result = new AOTPreparationAssessment().assessPreparationLevel({
      title: 'Business Trip to New York',
      category: 'travel_trip',
      rawText: 'Business trip to NYC for a presentation',
    } as AssessmentInput);
    expect(result.level).not.toBe('essentials');
  });
});
