import { describe, it, expect } from 'vitest';
import { formatMilestoneCalendarTitle } from './googleCalendar';

describe('formatMilestoneCalendarTitle', () => {
  it('puts the task first and the event name after an em-dash, with no marker when on track', () => {
    expect(formatMilestoneCalendarTitle('Slide deck finalized', 'NY Client Trip')).toBe(
      'Slide deck finalized — NY Client Trip'
    );
  });

  it('drops the legacy "AheadOfTime:" prefix entirely', () => {
    expect(formatMilestoneCalendarTitle('AheadOfTime: Slide deck finalized', 'NY Client Trip')).toBe(
      'Slide deck finalized — NY Client Trip'
    );
  });

  it('prefixes a single warning glyph when overdue/at-risk', () => {
    expect(formatMilestoneCalendarTitle('Slide deck finalized', 'NY Client Trip', { isOverdue: true })).toBe(
      '⚠ Slide deck finalized — NY Client Trip'
    );
  });

  it('prefixes a checkmark when completed, taking priority over the overdue marker', () => {
    expect(
      formatMilestoneCalendarTitle('Slide deck finalized', 'NY Client Trip', {
        isOverdue: true,
        isCompleted: true,
      })
    ).toBe('✅ Slide deck finalized — NY Client Trip');
  });

  it('is stable across a completion toggle instead of switching to a different format', () => {
    // Regression test: the old completion-patch path rewrote the title into
    // an entirely different "📋 [TASK] [T-7d] <title>" format the first time
    // a milestone's status changed, so a synced milestone's title was not
    // even stable over its own lifecycle. Toggling status now only ever
    // changes the leading marker, never the overall shape of the string.
    const pending = formatMilestoneCalendarTitle('Slide deck finalized', 'NY Client Trip', { isCompleted: false });
    const completed = formatMilestoneCalendarTitle('Slide deck finalized', 'NY Client Trip', { isCompleted: true });
    expect(pending).toBe('Slide deck finalized — NY Client Trip');
    expect(completed).toBe('✅ Slide deck finalized — NY Client Trip');
  });

  it('strips a previously-applied marker or bracket format before reformatting, so re-syncing does not stack prefixes', () => {
    expect(formatMilestoneCalendarTitle('✅ [TASK] [T-7d] Slide deck finalized', 'NY Client Trip')).toBe(
      'Slide deck finalized — NY Client Trip'
    );
    expect(formatMilestoneCalendarTitle('📋 [TASK] [T-Day] Slide deck finalized', 'NY Client Trip')).toBe(
      'Slide deck finalized — NY Client Trip'
    );
  });
});
