import { describe, it, expect } from 'vitest';
import { getActiveAssessor, AOTPreparationAssessment, AssessmentInput } from './preparationAssessment';

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
