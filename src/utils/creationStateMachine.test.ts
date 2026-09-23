import { describe, it, expect } from 'vitest';
import { generateConcreteEventMilestones, mapCanonicalCategoryToEventCategory, CanonicalCategory } from './creationStateMachine';

// This is the milestone-generation path the main "Add New Event" wizard
// actually calls (EventCreationWizard.tsx's handleBuildAndSave) - a
// completely separate function/switch from tminusRules.ts's
// generateHeuristicMilestones, which only backs the AI-chat and
// scan-agenda creation paths. Any T-plus (post-event) milestone added only
// to generateHeuristicMilestones would never show up for an event created
// through the standard wizard, so this path needs its own coverage.
describe('generateConcreteEventMilestones - post-event follow-ups', () => {
  it('adds a post-trip follow-up milestone dated after the event for the trip category', () => {
    const milestones = generateConcreteEventMilestones(
      'Trip to Paris',
      '2026-10-15',
      '19:00',
      'trip',
      {},
      'evt-test-posttrip'
    );
    const postTrip = milestones.find((m) => m.tMinusLabel === 'Day +1');
    expect(postTrip).toBeDefined();
    expect(postTrip!.title).toMatch(/unpack/i);
    expect(postTrip!.category).toBe('logistics');
    expect(new Date(postTrip!.calculatedDate).getTime()).toBeGreaterThan(new Date('2026-10-15').getTime());
  });

  it('adds a post-launch review milestone dated after the deadline for project_management events', () => {
    const milestones = generateConcreteEventMilestones(
      'Launch v2',
      '2026-10-15',
      '19:00',
      'project_management',
      {},
      'evt-test-launch'
    );
    const postLaunch = milestones.find((m) => m.tMinusLabel === 'Day +3');
    expect(postLaunch).toBeDefined();
    expect(postLaunch!.title).toMatch(/review|retro/i);
    expect(postLaunch!.category).toBe('review');
    expect(new Date(postLaunch!.calculatedDate).getTime()).toBeGreaterThan(new Date('2026-10-15').getTime());
  });

  it('adds the same post-launch review milestone for the work_projects category alias', () => {
    const milestones = generateConcreteEventMilestones(
      'Ship the new onboarding flow',
      '2026-10-15',
      '19:00',
      'work_projects',
      {},
      'evt-test-launch-2'
    );
    const postLaunch = milestones.find((m) => m.tMinusLabel === 'Day +3');
    expect(postLaunch).toBeDefined();
  });
});

// Regression coverage for a real, confirmed bug: the 'trip' category's 3
// chip questions (Lodging, Transport Mode, Activities & Gear) used to have
// zero effect on the generated milestones - picking "Train" vs "Flight", or
// flagging a passport check, changed nothing about the output.
describe('generateConcreteEventMilestones - trip category actually reads its chip answers', () => {
  const allDeliverableTitles = (milestones: ReturnType<typeof generateConcreteEventMilestones>) =>
    milestones.flatMap((m) => (m.deliverables || []).map((d) => d.title));

  it('defaults to a flight-oriented booking task and no passport check when nothing has been answered', () => {
    const milestones = generateConcreteEventMilestones('Trip to Rome', '2026-10-15', '19:00', 'trip', {}, 'evt-default');
    const titles = allDeliverableTitles(milestones);
    expect(titles.some((t) => /flight/i.test(t))).toBe(true);
    expect(titles.some((t) => /passport/i.test(t))).toBe(false);
  });

  it('books train tickets instead of flights when Train / Rail is selected', () => {
    const milestones = generateConcreteEventMilestones(
      'Trip to Rome', '2026-10-15', '19:00', 'trip',
      { transport: ['Train / Rail tickets'] }, 'evt-train'
    );
    const titles = allDeliverableTitles(milestones);
    expect(titles.some((t) => /train/i.test(t))).toBe(true);
    expect(titles.some((t) => /flight/i.test(t))).toBe(false);
  });

  it('plans a driving route instead of flights when Road trip / Personal car is selected', () => {
    const milestones = generateConcreteEventMilestones(
      'Trip to Rome', '2026-10-15', '19:00', 'trip',
      { transport: ['Road trip / Personal car'] }, 'evt-roadtrip'
    );
    const titles = allDeliverableTitles(milestones);
    expect(titles.some((t) => /driving route/i.test(t))).toBe(true);
    expect(titles.some((t) => /flight/i.test(t))).toBe(false);
  });

  it('adds a rental car deliverable alongside flights when both are selected (multi-select)', () => {
    const milestones = generateConcreteEventMilestones(
      'Trip to Rome', '2026-10-15', '19:00', 'trip',
      { transport: ['Flight & boarding passes', 'Rental car needed'] }, 'evt-flight-rental'
    );
    const titles = allDeliverableTitles(milestones);
    expect(titles.some((t) => /flight/i.test(t))).toBe(true);
    expect(titles.some((t) => /rental car/i.test(t))).toBe(true);
  });

  it('drops the hotel/Airbnb booking deliverable when staying with friends or family', () => {
    const milestones = generateConcreteEventMilestones(
      'Trip to Rome', '2026-10-15', '19:00', 'trip',
      { lodging: ['Staying with friends / family'] }, 'evt-staying-with-friends'
    );
    const titles = allDeliverableTitles(milestones);
    expect(titles.some((t) => /hotel or airbnb/i.test(t))).toBe(false);
    expect(milestones.some((m) => m.title === 'Travel Booked')).toBe(true);
  });

  it('includes the passport/visa check only when that chip is actually selected', () => {
    const milestones = generateConcreteEventMilestones(
      'Trip to Rome', '2026-10-15', '19:00', 'trip',
      { activities: ['Passport validity & visa check'] }, 'evt-passport'
    );
    const titles = allDeliverableTitles(milestones);
    expect(titles.some((t) => /passport/i.test(t))).toBe(true);
  });
});

describe('mapCanonicalCategoryToEventCategory', () => {
  const ALL_CANONICAL_CATEGORIES: CanonicalCategory[] = [
    'party', 'friends_visiting', 'friends_family', 'hobbies', 'trip',
    'kids_school', 'kids_hobbies', 'subscription', 'maintenance',
    'project_management', 'work_projects',
  ];

  it('maps every canonical category to a defined event category (exhaustive, no silent fallback)', () => {
    for (const cat of ALL_CANONICAL_CATEGORIES) {
      expect(mapCanonicalCategoryToEventCategory(cat)).toBeTruthy();
    }
  });

  it('maps the legacy friends_family/work_projects aliases the same as the categories they normalize to', () => {
    expect(mapCanonicalCategoryToEventCategory('friends_family')).toBe(mapCanonicalCategoryToEventCategory('friends_visiting'));
    expect(mapCanonicalCategoryToEventCategory('work_projects')).toBe(mapCanonicalCategoryToEventCategory('project_management'));
  });

  it('maps the common categories to their expected event category', () => {
    expect(mapCanonicalCategoryToEventCategory('party')).toBe('birthday_party');
    expect(mapCanonicalCategoryToEventCategory('trip')).toBe('travel_trip');
    expect(mapCanonicalCategoryToEventCategory('friends_visiting')).toBe('hosting_visitors');
    expect(mapCanonicalCategoryToEventCategory('project_management')).toBe('project_deadline');
  });
});
