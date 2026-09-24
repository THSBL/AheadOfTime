import { describe, it, expect } from 'vitest';
import {
  buildProfileRefinementQuestions,
  buildFallbackMessageQuestions,
  mergeRefinementQuestions,
  composeConversationBrief,
  describePlanningProfile,
  sanitizePlanningProfile,
  isAwayFromHomeEvent,
  buildTripRefinementQuestions,
  detectTravelDocumentNeeds,
  MAX_REFINEMENT_QUESTIONS,
} from './refinementQuestions';
import { RefinementQuestion } from '../types';

const REF = '2026-09-24T10:00:00.000Z';

describe('isAwayFromHomeEvent', () => {
  it('recognises trips', () => {
    expect(isAwayFromHomeEvent('Divetrip to Egypt')).toBe(true);
    expect(isAwayFromHomeEvent('Ski holiday in February')).toBe(true);
    expect(isAwayFromHomeEvent('Flying to Lisbon for a conference')).toBe(true);
  });

  it('does not treat a local event as a trip', () => {
    expect(isAwayFromHomeEvent('Dinner to Celebrate Anna')).toBe(false);
    expect(isAwayFromHomeEvent("Maya's birthday party at home")).toBe(false);
  });
});

describe('buildProfileRefinementQuestions', () => {
  it('asks about the pet for a trip when the user has one', () => {
    const qs = buildProfileRefinementQuestions('Divetrip to Egypt', { hasPet: true });
    expect(qs.map((q) => q.id)).toEqual(['pet_care']);
    expect(qs[0].source).toBe('profile');
    expect(qs[0].options.length).toBeGreaterThanOrEqual(2);
  });

  it('skips the pet question when the message already covers it', () => {
    expect(buildProfileRefinementQuestions('Divetrip to Egypt, the dog goes to my parents', { hasPet: true })).toEqual([]);
  });

  it('asks about kids for a family trip', () => {
    const qs = buildProfileRefinementQuestions('Ski holiday in Austria', { familyStructure: 'family_with_kids', hasPet: true });
    expect(qs.map((q) => q.id)).toEqual(['pet_care', 'kids']);
  });

  it('asks nothing for a local event or with no profile', () => {
    expect(buildProfileRefinementQuestions('Birthday dinner at home', { hasPet: true })).toEqual([]);
    expect(buildProfileRefinementQuestions('Divetrip to Egypt', null)).toEqual([]);
  });
});

describe('buildFallbackMessageQuestions', () => {
  it('asks "when" only if there is no date', () => {
    expect(buildFallbackMessageQuestions('Divetrip to Egypt', REF).map((q) => q.id)).toEqual(['when']);
    expect(buildFallbackMessageQuestions('Divetrip to Egypt 12 November', REF)).toEqual([]);
    expect(buildFallbackMessageQuestions('Dinner next Friday', REF)).toEqual([]);
  });
});

describe('mergeRefinementQuestions', () => {
  const q = (id: string, question: string, source: RefinementQuestion['source'] = 'message'): RefinementQuestion => ({ id, question, options: [], source });

  it('appends a profile question Gemini did not already ask', () => {
    const merged = mergeRefinementQuestions([q('when', 'When do you leave?')], [q('pet_care', 'Who looks after your pet?', 'profile')]);
    expect(merged.map((m) => m.id)).toEqual(['when', 'pet_care']);
  });

  it('does not duplicate a pet question Gemini already asked in its own words', () => {
    const merged = mergeRefinementQuestions([q('dog', 'Who takes care of the dog?')], [q('pet_care', 'Who looks after your pet?', 'profile')]);
    expect(merged.map((m) => m.id)).toEqual(['dog']);
  });

  it('makes duplicate ids unique so answers do not collide', () => {
    const merged = mergeRefinementQuestions([q('when', 'When do you leave?'), q('when', 'When do you come back?')], []);
    expect(merged.map((m) => m.id)).toEqual(['when', 'when_2']);
  });

  it('caps the number of questions', () => {
    const many = Array.from({ length: 8 }, (_, i) => q(`q${i}`, `Question ${i}?`));
    expect(mergeRefinementQuestions(many, [])).toHaveLength(MAX_REFINEMENT_QUESTIONS);
  });
});

describe('composeConversationBrief', () => {
  it('keeps the original message first, then answers, then later additions', () => {
    const brief = composeConversationBrief({
      originalMessage: 'Divetrip to Egypt',
      answers: [
        { question: 'When do you leave?', answer: '12-19 November' },
        { question: 'Need a visa?', answer: '' },
        { question: 'Who looks after your pet?', answer: 'Pet sitter' },
      ],
      additions: ['I also need a visa'],
    });
    expect(brief).toBe([
      'Divetrip to Egypt',
      '',
      'Details:',
      '- When do you leave? 12-19 November',
      '- Who looks after your pet? Pet sitter',
      '',
      'Added later:',
      '- I also need a visa',
    ].join('\n'));
  });

  it('is just the original message when nothing else was said', () => {
    expect(composeConversationBrief({ originalMessage: '  Divetrip to Egypt ' })).toBe('Divetrip to Egypt');
  });
});

describe('profile helpers', () => {
  it('describes the profile in plain language', () => {
    const text = describePlanningProfile({ hasPet: true, familyStructure: 'family_with_kids', homeZipOrLocation: 'Ghent' });
    expect(text).toContain('Ghent');
    expect(text).toContain('pet');
    expect(text).toContain('kids');
    expect(describePlanningProfile(undefined)).toBe('');
  });

  it('sanitizes an untrusted profile', () => {
    expect(sanitizePlanningProfile({ hasPet: 'yes', familyStructure: 'aliens', homeZipOrLocation: ' Ghent ', extra: 1 })).toEqual({ homeZipOrLocation: 'Ghent' });
    expect(sanitizePlanningProfile({ hasPet: true, familyStructure: 'couple' })).toEqual({ hasPet: true, familyStructure: 'couple' });
    expect(sanitizePlanningProfile(null)).toBeUndefined();
    expect(sanitizePlanningProfile({})).toBeUndefined();
  });
});

describe('travel documents are asked, never guessed', () => {
  it('asks about travel documents for a trip to a named place', () => {
    expect(buildTripRefinementQuestions('Divetrip to Egypt').map((q) => q.id)).toEqual(['travel_documents']);
    expect(buildTripRefinementQuestions('Flying abroad for a wedding').map((q) => q.id)).toEqual(['travel_documents']);
  });

  it('does not ask when documents were already mentioned, or for a local event', () => {
    expect(buildTripRefinementQuestions('Divetrip to Egypt, visa already sorted')).toEqual([]);
    expect(buildTripRefinementQuestions('Birthday dinner at home')).toEqual([]);
    expect(buildTripRefinementQuestions('Camping this weekend')).toEqual([]);
  });

  it('reads the chosen answer, ignoring the question text', () => {
    const q = 'Travel documents: anything to arrange?';
    expect(detectTravelDocumentNeeds(`${q} Visa needed`)).toEqual({ needVisa: true });
    expect(detectTravelDocumentNeeds(`${q} Passport renewal needed`)).toEqual({ needPassportRenewal: true });
    expect(detectTravelDocumentNeeds(`${q} Visa and passport renewal`)).toEqual({ needVisa: true, needPassportRenewal: true });
    expect(detectTravelDocumentNeeds(`${q} All sorted / not needed`)).toEqual({});
    expect(detectTravelDocumentNeeds('Do you need a visa? No visa needed')).toEqual({});
  });

  it('reads free text too', () => {
    expect(detectTravelDocumentNeeds('I also need a visa')).toEqual({ needVisa: true });
    expect(detectTravelDocumentNeeds("We don't need a visa, both of us have one")).toEqual({});
    expect(detectTravelDocumentNeeds('My passport expires in December')).toEqual({ needPassportRenewal: true });
  });

  it('keeps the guaranteed documents question unless Gemini already asked it', () => {
    const docs = buildTripRefinementQuestions('Divetrip to Egypt');
    const gemini: RefinementQuestion[] = [{ id: 'visa', question: 'Do you need a visa for Egypt?', options: [], source: 'message' }];
    expect(mergeRefinementQuestions(gemini, docs).map((q) => q.id)).toEqual(['visa']);
    expect(mergeRefinementQuestions([], docs).map((q) => q.id)).toEqual(['travel_documents']);
  });
});
