import { describe, it, expect } from 'vitest';
import { rowToCalendarEvent, rowToMilestone } from './telegramStore';

// Confirms the "existing events still load fine, new columns default
// sensibly" requirement from the architecture reset's Phase 4 - rows
// written before ensurePreparationSchema existed have the new columns
// entirely absent (undefined), not just NULL, so the read path must not
// assume the DB's own column defaults apply to in-memory row objects.
describe('rowToCalendarEvent / rowToMilestone - pre-migration rows default sensibly', () => {
  const oldMilestoneRow: any = {
    id: 'ms-uuid-1',
    event_id: 'evt-uuid-1',
    title: 'Old milestone',
    description: null,
    category: 'booking',
    calculated_date: '2025-12-01',
    status: 'pending',
    kind: 'milestone',
    confirmed_at: null,
    confirmed_via: null,
    deliverables: [],
    // No tier / is_active / hidden_reason / generated_from_context_version /
    // phase / client_payload at all - the exact shape of a row written
    // before this migration.
  };

  const oldEventRow: any = {
    id: 'evt-uuid-1',
    user_id: 'user-uuid-1',
    title: 'Old event',
    category: 'birthday_party',
    event_date: '2026-01-01',
    end_date: null,
    event_time: '19:00',
    location: null,
    status: 'milestones_active',
    source_channel: 'telegram',
    context: {},
    structured_payload: null,
    raw_input: null,
    created_at: '2025-01-01T00:00:00.000Z',
    updated_at: '2025-01-01T00:00:00.000Z',
    // No preparation_level / planning_context / outstanding_gaps at all.
  };

  it('defaults a pre-migration milestone row to tier "essentials" and isActive true', () => {
    const milestone = rowToMilestone(oldMilestoneRow, '2026-01-01', '19:00');
    expect(milestone.tier).toBe('essentials');
    expect(milestone.isActive).toBe(true);
    expect(milestone.hiddenReason).toBeUndefined();
    expect(milestone.title).toBe('Old milestone');
  });

  it('defaults a pre-migration event row to preparationLevel "balanced" and empty gaps/context', () => {
    const event = rowToCalendarEvent(oldEventRow, [oldMilestoneRow]);
    expect(event.preparationLevel).toBe('balanced');
    expect(event.preparationLevelReasons).toEqual([]);
    expect(event.preparationLevelSetBy).toBeUndefined();
    expect(event.planningContext).toBeUndefined();
    expect(event.outstandingGaps).toEqual([]);
    expect(event.title).toBe('Old event');
    expect(event.milestones).toHaveLength(1);
    expect(event.milestones[0].tier).toBe('essentials');
  });

  it('reads a post-migration row correctly once the columns are populated', () => {
    const milestone = rowToMilestone(
      { ...oldMilestoneRow, tier: 'extensive', is_active: false, hidden_reason: 'level_downgrade' },
      '2026-01-01',
      '19:00'
    );
    expect(milestone.tier).toBe('extensive');
    expect(milestone.isActive).toBe(false);
    expect(milestone.hiddenReason).toBe('level_downgrade');

    const event = rowToCalendarEvent(
      { ...oldEventRow, preparation_level: 'extensive', preparation_level_set_by: 'user', outstanding_gaps: [{ key: 'user_responsibility', question: 'q', impact: 'high', requiredBeforePlanning: false }] },
      [oldMilestoneRow]
    );
    expect(event.preparationLevel).toBe('extensive');
    expect(event.preparationLevelSetBy).toBe('user');
    expect(event.outstandingGaps).toHaveLength(1);
  });
});
