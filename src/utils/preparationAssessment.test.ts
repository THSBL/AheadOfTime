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
});
