import { PREP_KNOWLEDGE_DATABASE, PrepTaskRule } from './prepTimelineDatabase';

/**
 * Hand-picked groupings of PREP_KNOWLEDGE_DATABASE rules used to render
 * "T-minus runway" marketing graphics (see scripts/generate-marketing-graphics.ts).
 * Ids must exist in PREP_KNOWLEDGE_DATABASE — the generator script fails loudly if not.
 */
export interface MarketingScenario {
  id: string;
  title: string;
  emoji: string;
  subtitle: string;
  ruleIds: string[];
}

export const MARKETING_SCENARIOS: MarketingScenario[] = [
  {
    id: 'wedding',
    title: 'Planning a Wedding',
    emoji: '💍',
    subtitle: 'The reverse-engineered runway, 9 months out',
    ruleIds: [
      'wedding-venue',
      'wedding-photographer',
      'wedding-dress',
      'wedding-caterer',
      'wedding-save-the-dates',
      'wedding-fittings',
      'marriage-license',
    ],
  },
  {
    id: 'trip',
    title: 'Booking a Trip Abroad',
    emoji: '✈️',
    subtitle: "Don't find out the passport rule at the airport",
    ruleIds: ['passport-visa', 'international-flights', 'vacation-lodging', 'rental-car-idp', 'high-demand-tickets'],
  },
  {
    id: 'party',
    title: 'Throwing a Party',
    emoji: '🎉',
    subtitle: 'From venue lock-in to the day-of checklist',
    ruleIds: ['party-venue-dj', 'party-invitations', 'custom-cake-catering', 'party-outfit-styling'],
  },
  {
    id: 'kids',
    title: 'Kids: School & Camp',
    emoji: '🎒',
    subtitle: 'Costume day should never be an 11pm surprise',
    ruleIds: ['kids-camp-registration', 'kids-school-project'],
  },
  {
    id: 'pet',
    title: 'Traveling With a Pet at Home',
    emoji: '🐾',
    subtitle: 'The part of the trip checklist people forget',
    ruleIds: ['pet-sitter-booking', 'pet-vet-check', 'pet-instructions-prep'],
  },
];

export function getScenarioRules(scenario: MarketingScenario): PrepTaskRule[] {
  const byId = new Map(PREP_KNOWLEDGE_DATABASE.map((rule) => [rule.id, rule]));
  return scenario.ruleIds.map((id) => {
    const rule = byId.get(id);
    if (!rule) {
      throw new Error(`marketingScenarios: rule id "${id}" not found in PREP_KNOWLEDGE_DATABASE`);
    }
    return rule;
  });
}
