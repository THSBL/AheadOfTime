import { PreparationLevel, TMinusMilestone } from '../types.js';

const TIER_RANK: Record<PreparationLevel, number> = { essentials: 0, balanced: 1, extensive: 2 };

export interface ApplyPreparationLevelChangeResult {
  milestones: TMinusMilestone[];
  /** True when nothing exists at the target tier yet - the caller should trigger a scoped replan to produce it. */
  needsReplan: boolean;
}

/**
 * Pure hide/restore logic for a preparation-level change - architecture
 * reset Phase 6. Never deletes a milestone, only toggles isActive/
 * hiddenReason, per "downgrading shouldn't destroy the richer plan": a
 * downgrade hides milestones tiered above the target level, an upgrade
 * reveals whatever already exists at or below it. Levels are cumulative
 * (Essentials content stays visible at Balanced and Extensive too), matching
 * how agentProcessor.ts tags freshly-generated milestones with the level
 * they were actually planned at.
 */
/**
 * `currentPlanningContextVersion` (architecture reset Phase 7, optional -
 * omit it to get exactly the Phase 6 behavior) lets an upgrade tell "trust
 * the cached tier" apart from "the user has since stated something new,
 * this cached content is stale, do a scoped replan instead of just
 * reactivating it."
 */
export function applyPreparationLevelChange(
  milestones: TMinusMilestone[],
  targetLevel: PreparationLevel,
  currentPlanningContextVersion?: string
): ApplyPreparationLevelChangeResult {
  const targetRank = TIER_RANK[targetLevel];
  const updated = milestones.map((m) => {
    const shouldBeActive = TIER_RANK[m.tier || 'essentials'] <= targetRank;
    return {
      ...m,
      isActive: shouldBeActive,
      hiddenReason: shouldBeActive ? undefined : ('level_downgrade' as const),
    };
  });
  const targetTierMilestones = milestones.filter((m) => TIER_RANK[m.tier || 'essentials'] === targetRank);
  const hasContentAtTargetTier = targetTierMilestones.length > 0;
  // A milestone with no recorded generatedFromContextVersion (pre-Phase-7
  // data, or a tier that's never been regenerated since) is treated as
  // "unknown - trust the cached content" rather than forcing a replan on
  // data that predates this check entirely.
  const isStale = Boolean(
    currentPlanningContextVersion &&
    hasContentAtTargetTier &&
    targetTierMilestones.some((m) => m.generatedFromContextVersion && m.generatedFromContextVersion !== currentPlanningContextVersion)
  );
  return { milestones: updated, needsReplan: !hasContentAtTargetTier || isStale };
}
