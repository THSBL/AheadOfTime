import { describe, it, expect } from 'vitest';
import { applyPreparationLevelChange } from './preparationLevelActions';
import type { TMinusMilestone } from '../types';

function ms(id: string, tier: TMinusMilestone['tier']): TMinusMilestone {
  return {
    id,
    eventId: 'evt-1',
    tMinusLabel: 'T-7d',
    tMinusOffsetMinutes: -10080,
    calculatedDate: '2026-10-01',
    title: `Milestone ${id}`,
    category: 'prep',
    status: 'pending',
    tier,
    isActive: true,
  };
}

describe('applyPreparationLevelChange', () => {
  it('downgrading hides milestones tiered above the target level, never deletes them', () => {
    const milestones = [ms('a', 'essentials'), ms('b', 'balanced'), ms('c', 'extensive')];
    const result = applyPreparationLevelChange(milestones, 'essentials');
    expect(result.milestones).toHaveLength(3); // nothing deleted
    expect(result.milestones.find((m) => m.id === 'a')!.isActive).toBe(true);
    expect(result.milestones.find((m) => m.id === 'b')!.isActive).toBe(false);
    expect(result.milestones.find((m) => m.id === 'b')!.hiddenReason).toBe('level_downgrade');
    expect(result.milestones.find((m) => m.id === 'c')!.isActive).toBe(false);
    expect(result.needsReplan).toBe(false); // essentials content already exists
  });

  it('upgrading reactivates previously-hidden milestones at or below the target tier', () => {
    const milestones = [
      { ...ms('a', 'essentials'), isActive: true },
      { ...ms('b', 'balanced'), isActive: false, hiddenReason: 'level_downgrade' as const },
    ];
    const result = applyPreparationLevelChange(milestones, 'balanced');
    expect(result.milestones.find((m) => m.id === 'b')!.isActive).toBe(true);
    expect(result.milestones.find((m) => m.id === 'b')!.hiddenReason).toBeUndefined();
    expect(result.needsReplan).toBe(false);
  });

  it('flags needsReplan when nothing exists yet at the target tier', () => {
    const milestones = [ms('a', 'essentials')];
    const result = applyPreparationLevelChange(milestones, 'extensive');
    expect(result.needsReplan).toBe(true);
    // Still a safe no-op locally - nothing crashes, nothing is deleted.
    expect(result.milestones).toHaveLength(1);
  });

  it('treats a missing tier as essentials (pre-migration milestone objects)', () => {
    const milestones = [{ ...ms('a', undefined) }];
    const result = applyPreparationLevelChange(milestones, 'essentials');
    expect(result.milestones[0].isActive).toBe(true);
    expect(result.needsReplan).toBe(false);
  });

  describe('architecture reset Phase 7 - staleness against planningContextVersion', () => {
    it('flags needsReplan when the target tier exists but was generated under an older context version', () => {
      const milestones = [{ ...ms('a', 'balanced'), generatedFromContextVersion: 'v1' }];
      const result = applyPreparationLevelChange(milestones, 'balanced', 'v2');
      expect(result.needsReplan).toBe(true);
    });

    it('does not flag needsReplan when the target tier matches the current context version', () => {
      const milestones = [{ ...ms('a', 'balanced'), generatedFromContextVersion: 'v2' }];
      const result = applyPreparationLevelChange(milestones, 'balanced', 'v2');
      expect(result.needsReplan).toBe(false);
    });

    it('treats a milestone with no recorded generatedFromContextVersion as trustworthy (pre-Phase-7 data), not stale', () => {
      const milestones = [ms('a', 'balanced')];
      const result = applyPreparationLevelChange(milestones, 'balanced', 'v2');
      expect(result.needsReplan).toBe(false);
    });

    it('omitting currentPlanningContextVersion entirely preserves the exact Phase 6 behavior', () => {
      const milestones = [{ ...ms('a', 'balanced'), generatedFromContextVersion: 'v1' }];
      const result = applyPreparationLevelChange(milestones, 'balanced');
      expect(result.needsReplan).toBe(false);
    });
  });
});
