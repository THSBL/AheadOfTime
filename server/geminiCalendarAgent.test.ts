import { describe, it, expect } from 'vitest';
import { reconcileMilestoneDeliverables } from './geminiCalendarAgent';
import { TMinusMilestone, Deliverable } from '../src/types';

function makeMilestone(overrides: Partial<TMinusMilestone> = {}): TMinusMilestone {
  return {
    id: overrides.id || 'ms-1',
    eventId: 'evt-1',
    tMinusLabel: 'T-14d',
    tMinusOffsetMinutes: -20160,
    calculatedDate: '2026-09-24',
    title: 'Untitled',
    category: 'logistics',
    status: 'pending',
    scope: 'macro',
    deliverables: [],
    ...overrides,
  };
}

function modelDeliverable(title: string): Deliverable {
  return { deliverable_id: 'del-model-1', title, type: 'coordination', is_completed: false };
}

describe('reconcileMilestoneDeliverables', () => {
  it('overrides mismatched model deliverables with topic-matched ones derived from the title', () => {
    // Regression test: a Telegram message covering both an international
    // trip and a kids' sports tournament could get the model to pair
    // football-kit deliverable text onto the passport milestone (and vice
    // versa) - this is the actual bug users saw ("Passport validity &
    // renewal check" milestone showing "Boots / cleats, shin guards..."
    // deliverables). The deterministic title-keyword matcher must win.
    const milestones = [makeMilestone({ id: 'passport', title: 'Passport validity & renewal check' })];
    const modelDeliverablesByIndex = new Map<number, Deliverable[]>([
      [0, [modelDeliverable('Clean uniform / jersey, shorts & socks packed in kit bag'), modelDeliverable('Boots / cleats, shin guards, filled water bottle & match snacks ready')]],
    ]);

    const result = reconcileMilestoneDeliverables(milestones, modelDeliverablesByIndex);

    expect(result[0].deliverables.map((d) => d.title)).not.toContain('Boots / cleats, shin guards, filled water bottle & match snacks ready');
    expect(result[0].deliverables.some((d) => d.title.toLowerCase().includes('passport'))).toBe(true);
  });

  it('does the same in the other direction: a football-kit milestone keeps football deliverables, not passport ones', () => {
    const milestones = [makeMilestone({ id: 'kit', title: 'Uniform & Shinguards Packed & Ready' })];
    const modelDeliverablesByIndex = new Map<number, Deliverable[]>([
      [0, [modelDeliverable('Passport validity verified'), modelDeliverable('Color scan / photo page copy stored securely offline')]],
    ]);

    const result = reconcileMilestoneDeliverables(milestones, modelDeliverablesByIndex);

    expect(result[0].deliverables.some((d) => d.title.toLowerCase().includes('passport'))).toBe(false);
    expect(result[0].deliverables.some((d) => d.title.toLowerCase().includes('shin guard') || d.title.toLowerCase().includes('cleat'))).toBe(true);
  });

  it('prefers the deterministic generic fallback over the model deliverables even for an uncategorized title', () => {
    // attachDeliverablesToMilestones always synthesizes at least one
    // title-derived deliverable via its own final catch-all branch, so in
    // practice the model-provided deliverables are never actually needed -
    // this locks that in as intended behavior (one authoritative source),
    // not an accident.
    const milestones = [makeMilestone({ id: 'custom', title: 'Confirm venue AV setup with the conference hall' })];
    const modelDeliverablesByIndex = new Map<number, Deliverable[]>([
      [0, [modelDeliverable('Test projector & microphone with venue staff')]],
    ]);

    const result = reconcileMilestoneDeliverables(milestones, modelDeliverablesByIndex);

    expect(result[0].deliverables.length).toBeGreaterThan(0);
    expect(result[0].deliverables.map((d) => d.title)).not.toContain('Test projector & microphone with venue staff');
  });

  it('keeps each milestone matched to its own title across a mixed multi-milestone list', () => {
    const milestones = [
      makeMilestone({ id: 'passport', title: 'Passport validity & renewal check' }),
      makeMilestone({ id: 'kit', title: 'Pack Uniform & Shinguards' }),
    ];
    const modelDeliverablesByIndex = new Map<number, Deliverable[]>([
      [0, [modelDeliverable('Boots / cleats, shin guards, filled water bottle & match snacks ready')]],
      [1, [modelDeliverable('Passport validity verified')]],
    ]);

    const result = reconcileMilestoneDeliverables(milestones, modelDeliverablesByIndex);

    const passportMilestone = result.find((m) => m.id === 'passport')!;
    const kitMilestone = result.find((m) => m.id === 'kit')!;
    expect(passportMilestone.deliverables.some((d) => d.title.toLowerCase().includes('passport'))).toBe(true);
    expect(kitMilestone.deliverables.some((d) => d.title.toLowerCase().includes('shin guard') || d.title.toLowerCase().includes('cleat'))).toBe(true);
  });
});
