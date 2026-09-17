import { describe, it, expect } from 'vitest';
import { generateConcreteEventMilestones } from './creationStateMachine';

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
