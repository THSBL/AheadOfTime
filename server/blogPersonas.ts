/**
 * The guests of "T-minus Talks" (server/blogEpisodes.ts): every week one
 * fictional person, drawn from a few fixed lists, who uses the real app for
 * a situation in their life. The lists keep a guest believable (a swim meet
 * only for someone with kids, a launch only for someone with a job that has
 * launches); the draw keeps the weeks different (no event, role or city
 * that was on in the last few episodes).
 *
 * The guests are always presented as AI personas - on every post - so
 * nothing here can read as a real customer's testimonial.
 */

export type Household = 'single' | 'couple' | 'family_with_kids';
export type CalendarApp = 'Google Calendar' | 'Outlook' | 'Apple Calendar';

export interface Scenario {
  key: string;
  /** What's coming up, in the guest's own terms (no date: the episode adds one). */
  event: string;
  weeksOut: number;
  nights?: number;
  /** Only for these households (any when left out). */
  households?: Household[];
  /** Only for these roles (any when left out). */
  roles?: string[];
}

export interface Persona {
  name: string;
  age: number;
  role: string;
  city: string;
  household: Household;
  /** e.g. "two kids (6 and 9)" - empty for single/couple without detail. */
  householdDetail: string;
  calendar: CalendarApp;
  /** How they like to hear from the app. */
  updates: 'Telegram' | 'email';
  planningStyle: string;
  constraint: string;
  temperament: string;
  scenario: Scenario;
  /** Retold from a real question (blogEpisodes.ts): the situation in our own words. */
  story?: string;
}

const ROLES = [
  'ICU nurse on rotating shifts',
  'secondary school teacher',
  'freelance graphic designer',
  'product manager at a fintech start-up',
  'owner of a small bakery',
  'PhD student in marine biology',
  'sales manager who travels most weeks',
  'primary school headteacher',
  'software engineer, fully remote',
  'physiotherapist with a private practice',
  'train driver',
  'event coordinator at a museum',
  'junior lawyer',
  'stay-at-home parent restarting a career',
  'restaurant chef',
  'HR business partner',
  'retired engineer who volunteers at a food bank',
  'marketing lead at a mid-sized brand',
  'founder of a two-person app studio',
  'pharmacist',
];

/** Roles whose work has launches, offsites and talks. */
const OFFICE_ROLES = [
  'product manager at a fintech start-up',
  'sales manager who travels most weeks',
  'software engineer, fully remote',
  'HR business partner',
  'marketing lead at a mid-sized brand',
  'founder of a two-person app studio',
  'event coordinator at a museum',
];

const CITIES = [
  'Rotterdam', 'Leeds', 'Lyon', 'Austin', 'Toronto', 'Melbourne', 'Dublin', 'Ghent', 'Manchester', 'Denver',
  'Copenhagen', 'Cape Town', 'Glasgow', 'Portland', 'Utrecht', 'Bristol', 'Auckland', 'Antwerp', 'Chicago', 'Edinburgh',
];

const NAMES = [
  'Priya', 'Tom', 'Amara', 'Lukas', 'Sofia', 'Daniel', 'Mei', 'Jonas', 'Fatima', 'Ruben', 'Hannah', 'Kwame', 'Elena', 'Sam',
  'Noor', 'Mateo', 'Ingrid', 'Jamal', 'Chloé', 'Oliver', 'Yuki', 'Femke', 'Diego', 'Aisha', 'Pieter', 'Grace', 'Arjun', 'Lena',
];

const PLANNING_STYLES = [
  'last-minute by nature, then panics',
  'makes lists, then loses them',
  'plans everything in a spreadsheet',
  'relies on a partner to remember things',
  'good at work deadlines, bad at personal ones',
  'starts early but stalls halfway',
];

const CONSTRAINTS = [
  'a tight budget this year',
  'shift work that changes every week',
  'a partner who is away for work a lot',
  'a group chat where nobody decides anything',
  'a dog that needs looking after',
  'a hard deadline at work the same month',
  'family abroad who need to be involved',
  'little free time on weekdays',
  'an elderly parent who needs regular help',
  'just moved and doesn\'t know local suppliers yet',
];

const TEMPERAMENTS = [
  'dry humour, a bit sceptical of apps',
  'enthusiastic and talks fast',
  'calm and precise',
  'honest to the point of blunt',
  'self-deprecating and warm',
  'practical, no patience for fluff',
];

export const SCENARIOS: Scenario[] = [
  { key: 'hen-weekend', event: "my sister's hen weekend in Lisbon, I'm organising it for 9 friends", weeksOut: 6, nights: 2 },
  { key: 'swim-meet', event: "my daughter's first swimming competition, away from home, early start", weeksOut: 4, households: ['family_with_kids'] },
  { key: 'house-move', event: 'moving house across town', weeksOut: 9 },
  { key: 'wedding-guest-abroad', event: "a friend's wedding in Tuscany, flying out with my partner", weeksOut: 10, nights: 3, households: ['couple', 'family_with_kids'] },
  { key: 'product-launch', event: 'the launch of our new app version, with a launch email and app store review', weeksOut: 6, roles: ['product manager at a fintech start-up', 'founder of a two-person app studio', 'software engineer, fully remote', 'marketing lead at a mid-sized brand'] },
  { key: 'team-offsite', event: 'a two-day team offsite for 14 people outside the city', weeksOut: 7, nights: 1, roles: OFFICE_ROLES },
  { key: 'conference-talk', event: 'giving a 25-minute talk at a conference in another city, travelling the day before', weeksOut: 6, roles: OFFICE_ROLES },
  { key: 'surprise-50th', event: "a surprise 50th birthday dinner for my partner, about 14 people at a restaurant", weeksOut: 5, households: ['couple', 'family_with_kids'] },
  { key: 'kids-party', event: "my son's 7th birthday party at home, 12 kids", weeksOut: 4, households: ['family_with_kids'] },
  { key: 'family-trip', event: 'a family trip to the coast with the kids, by car', weeksOut: 8, nights: 5, households: ['family_with_kids'] },
  { key: 'marathon', event: 'my first half marathon', weeksOut: 12 },
  { key: 'family-dinner', event: 'hosting a big family dinner for 16 at our place', weeksOut: 5 },
  { key: 'parents-visit', event: 'my parents visiting from abroad for a week, staying with us', weeksOut: 5, nights: 7 },
  { key: 'exam', event: 'a professional certification exam', weeksOut: 10 },
  { key: 'housewarming', event: 'a housewarming party for about 25 people, two vegetarians', weeksOut: 5 },
  { key: 'school-trip-parent', event: "my kid's school camp, three nights away, first time", weeksOut: 5, nights: 3, households: ['family_with_kids'] },
  { key: 'job-start', event: 'starting a new job in a new city', weeksOut: 6 },
  { key: 'bakery-market', event: 'a stall at the big Christmas market for the bakery', weeksOut: 8, roles: ['owner of a small bakery', 'restaurant chef'] },
];

type Rng = () => number;
const pick = <T,>(list: T[], rng: Rng): T => list[Math.floor(rng() * list.length) % list.length];

function householdFor(scenario: Scenario, rng: Rng): Household {
  const allowed: Household[] = scenario.households || ['single', 'couple', 'family_with_kids'];
  return pick(allowed, rng);
}

function householdDetail(h: Household, rng: Rng): string {
  if (h === 'family_with_kids') {
    const n = rng() < 0.5 ? 1 : 2;
    const a = 4 + Math.floor(rng() * 9);
    return n === 1 ? `a partner and one kid (${a})` : `a partner and two kids (${a} and ${Math.min(a + 2 + Math.floor(rng() * 4), 16)})`;
  }
  return h === 'couple' ? 'lives with a partner' : 'lives alone';
}

function ageFor(h: Household, rng: Rng): number {
  const [lo, hi] = h === 'family_with_kids' ? [31, 49] : h === 'couple' ? [26, 64] : [23, 58];
  return lo + Math.floor(rng() * (hi - lo + 1));
}

/** What was on in recent episodes - not drawn again soon. */
export interface RecentGuest {
  scenarioKey: string;
  role: string;
  city: string;
  name: string;
}

/**
 * Draws this week's guest. Retries until the scenario, role, city and name
 * all differ from the recent ones (gives up after a while rather than loop).
 */
export function drawPersona(recent: RecentGuest[] = [], rng: Rng = Math.random): Persona {
  let best: Persona | null = null;
  for (let attempt = 0; attempt < 60; attempt++) {
    const scenario = pick(SCENARIOS, rng);
    const role = pick(scenario.roles || ROLES, rng);
    const household = householdFor(scenario, rng);
    const persona: Persona = {
      name: pick(NAMES, rng),
      age: ageFor(household, rng),
      role,
      city: pick(CITIES, rng),
      household,
      householdDetail: householdDetail(household, rng),
      calendar: pick<CalendarApp>(['Google Calendar', 'Outlook', 'Apple Calendar'], rng),
      updates: rng() < 0.5 ? 'Telegram' : 'email',
      planningStyle: pick(PLANNING_STYLES, rng),
      constraint: pick(CONSTRAINTS, rng),
      temperament: pick(TEMPERAMENTS, rng),
      scenario,
    };
    best = persona;
    const clash = recent.some(
      (r) => r.scenarioKey === scenario.key || r.role === role || r.city === persona.city || r.name === persona.name
    );
    if (!clash) return persona;
  }
  return best!;
}

export const recentGuestOf = (p: Persona): RecentGuest => ({ scenarioKey: p.scenario.key, role: p.role, city: p.city, name: p.name });

/** One line for cards and emails: "Priya, 34, ICU nurse on rotating shifts in Rotterdam". */
export const personaLine = (p: Persona) => `${p.name}, ${p.age}, ${p.role} in ${p.city}`;

/** The planner's profile fields this guest would have filled in at onboarding. */
export const personaProfile = (p: Persona) => ({
  homeZipOrLocation: p.city,
  familyStructure: p.household,
  hasPet: /dog/.test(p.constraint),
});
