import { describe, it, expect } from 'vitest';
import { formatMilestoneCalendarTitle } from './googleCalendar';

describe('formatMilestoneCalendarTitle', () => {
  it('puts the task first, then the event name, then the due date (DD/MM), with no marker when on track', () => {
    expect(formatMilestoneCalendarTitle('Slide deck finalized', 'NY Client Trip', '2026-10-12')).toBe(
      'Slide deck finalized · NY Client Trip · 12/10'
    );
  });

  it('drops the legacy "AheadOfTime:" prefix entirely', () => {
    expect(formatMilestoneCalendarTitle('AheadOfTime: Slide deck finalized', 'NY Client Trip', '2026-10-12')).toBe(
      'Slide deck finalized · NY Client Trip · 12/10'
    );
  });

  it('prefixes a single warning glyph when overdue/at-risk', () => {
    expect(formatMilestoneCalendarTitle('Slide deck finalized', 'NY Client Trip', '2026-10-12', { isOverdue: true })).toBe(
      '⚠ Slide deck finalized · NY Client Trip · 12/10'
    );
  });

  it('prefixes a checkmark when completed, taking priority over the overdue marker', () => {
    expect(
      formatMilestoneCalendarTitle('Slide deck finalized', 'NY Client Trip', '2026-10-12', {
        isOverdue: true,
        isCompleted: true,
      })
    ).toBe('✅ Slide deck finalized · NY Client Trip · 12/10');
  });

  it('is stable across a completion toggle instead of switching to a different format', () => {
    // Regression test: the old completion-patch path rewrote the title into
    // an entirely different "📋 [TASK] [T-7d] <title>" format the first time
    // a milestone's status changed, so a synced milestone's title was not
    // even stable over its own lifecycle. Toggling status now only ever
    // changes the leading marker, never the overall shape of the string.
    const pending = formatMilestoneCalendarTitle('Slide deck finalized', 'NY Client Trip', '2026-10-12', { isCompleted: false });
    const completed = formatMilestoneCalendarTitle('Slide deck finalized', 'NY Client Trip', '2026-10-12', { isCompleted: true });
    expect(pending).toBe('Slide deck finalized · NY Client Trip · 12/10');
    expect(completed).toBe('✅ Slide deck finalized · NY Client Trip · 12/10');
  });

  it('strips a previously-applied marker or bracket format before reformatting, so re-syncing does not stack prefixes', () => {
    expect(formatMilestoneCalendarTitle('✅ [TASK] [T-7d] Slide deck finalized', 'NY Client Trip', '2026-10-12')).toBe(
      'Slide deck finalized · NY Client Trip · 12/10'
    );
    expect(formatMilestoneCalendarTitle('📋 [TASK] [T-Day] Slide deck finalized', 'NY Client Trip', '2026-10-12')).toBe(
      'Slide deck finalized · NY Client Trip · 12/10'
    );
  });

  it('extracts DD/MM directly from the date string, immune to timezone-driven off-by-one-day shifts', () => {
    // A full ISO timestamp near a UTC day boundary must not roll back a day
    // just because Date getters would read it in the local timezone.
    expect(formatMilestoneCalendarTitle('Book dog sitter', 'Ibiza trip', '2026-09-24T00:00:00.000Z')).toBe(
      'Book dog sitter · Ibiza trip · 24/09'
    );
  });

  it('omits the trailing date segment entirely if given an unparseable date', () => {
    expect(formatMilestoneCalendarTitle('Slide deck finalized', 'NY Client Trip', '')).toBe(
      'Slide deck finalized · NY Client Trip'
    );
  });
});
