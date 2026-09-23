import { query } from './db.js';

/**
 * Additive-only columns for the architecture reset's preparation-level
 * work (Phases 4-7). Nothing reads or writes these yet - Phase 5 wires up
 * persistence, Phase 6 wires up the pipeline/UI, Phase 7 wires up
 * provenance-aware replanning. Landing them now, inert, means each later
 * phase is a pure logic change with no schema risk of its own.
 *
 *  - events.preparation_level / _reasons / _set_by: the event's current
 *    AOT-or-user-decided level. Defaults to 'balanced' (never a bare NULL)
 *    so a row with no opinion yet still has a valid level to display.
 *  - events.planning_context / _version: the provenance-tagged fact bag
 *    Phase 7 builds ("user_stated" vs "ai_inferred" etc.) and the hash of
 *    its user-provenance subset, used to decide whether a hidden tier's
 *    content is still valid or needs a fresh replan.
 *  - events.outstanding_gaps: the narrow role-only gap from Phase 3/6 today;
 *    the shape a future, fuller gap tracker (Phase 8) generalizes rather
 *    than replaces.
 *  - milestones.tier: which preparation level this milestone belongs to.
 *  - milestones.is_active / hidden_reason: downgrade hides higher-tier rows
 *    instead of deleting them (never a separate cached-plan table - that
 *    would be exactly the second parallel representation the reset is
 *    meant to remove). Upgrade reactivates a hidden row only if it's still
 *    valid for the current planning_context_version (see
 *    generated_from_context_version below); otherwise Phase 7's scoped
 *    replan generates fresh content instead of trusting a stale row.
 *  - milestones.generated_from_context_version: which planning_context
 *    version this milestone's content was generated against.
 *  - milestones.phase: a lightweight, optional UI-grouping label only (e.g.
 *    "Booking", "Documents") - no ordering or gating is enforced by this
 *    column; see the architecture-reset plan's Open Decisions for why.
 *
 * Idempotent and memoised per instance, same convention as
 * ensureEventSyncSchema/ensureBackgroundSyncSchema - never depends on a
 * migration being run by hand against production (also mirrored in
 * server/db/schema.sql).
 */

let ready: Promise<void> | null = null;

export function ensurePreparationSchema(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      await query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS preparation_level TEXT NOT NULL DEFAULT 'balanced'`);
      await query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS preparation_level_reasons JSONB NOT NULL DEFAULT '[]'`);
      await query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS preparation_level_set_by TEXT`);
      await query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS planning_context JSONB NOT NULL DEFAULT '{}'`);
      await query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS planning_context_version TEXT`);
      await query(`ALTER TABLE events ADD COLUMN IF NOT EXISTS outstanding_gaps JSONB NOT NULL DEFAULT '[]'`);
      await query(`ALTER TABLE milestones ADD COLUMN IF NOT EXISTS tier TEXT NOT NULL DEFAULT 'essentials'`);
      await query(`ALTER TABLE milestones ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true`);
      await query(`ALTER TABLE milestones ADD COLUMN IF NOT EXISTS hidden_reason TEXT`);
      await query(`ALTER TABLE milestones ADD COLUMN IF NOT EXISTS generated_from_context_version TEXT`);
      await query(`ALTER TABLE milestones ADD COLUMN IF NOT EXISTS phase TEXT`);
      await query(`CREATE INDEX IF NOT EXISTS idx_milestones_event_active ON milestones(event_id) WHERE is_active = true`);
    })().catch((err) => {
      ready = null; // retry next call instead of caching a failure
      throw err;
    });
  }
  return ready;
}

/** Test hook. */
export function resetPreparationSchemaForTests(): void {
  ready = null;
}
