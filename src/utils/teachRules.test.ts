import { describe, it, expect } from 'vitest';
import { learnFromAnswers } from './teachRules';
import { assessCalendarEntry } from './eventEligibility';

describe('Teach Ahead Of Time', () => {
  const now = new Date('2026-09-29T10:00:00Z');

  it('turns answers into rules the next scan follows', () => {
    const prefs = learnFromAnswers(
      { birthdays: 'skip' },
      [
        { title: 'BDAY Anna', guessedKind: 'birthday_reminder', kind: 'birthday_reminder', verdict: 'plan' },
        { title: 'Netflix renewal', guessedKind: 'subscription', kind: 'subscription', verdict: 'skip' },
        { title: 'Padel with Tom', guessedKind: 'kids_activity', kind: 'routine', verdict: 'skip' },
        { title: 'Tom', guessedKind: 'other', kind: 'other', verdict: 'unsure' },
      ],
      now
    );
    expect(prefs).toMatchObject({
      birthdays: 'plan',
      kindVerdicts: { subscription: 'skip' },
      lastTeachAt: now.toISOString(),
    });
    expect(prefs.titleRules?.map((r) => [r.key, r.kind, r.verdict, Boolean(r.exact)])).toEqual([
      ['padel', 'routine', 'skip', false],
      ['tom', 'other', 'unsure', true],
    ]);
    // "Tom" only matches "Tom", not "Tom's birthday".
    expect(assessCalendarEntry({ title: "Tom's birthday", daysAway: 10 }, prefs)).toMatchObject({ kind: 'birthday_reminder' });
    expect(assessCalendarEntry({ title: 'Tom', daysAway: 10 }, prefs)).toMatchObject({ reason: 'Your choice' });
    expect(assessCalendarEntry({ title: "Mila's birthday", daysAway: 10 }, prefs)).toMatchObject({ verdict: 'plan' });
    expect(assessCalendarEntry({ title: 'Spotify renewal', daysAway: 10 }, prefs)).toMatchObject({ verdict: 'skip' });
    expect(assessCalendarEntry({ title: 'Padel tournament', daysAway: 10 }, prefs)).toMatchObject({ kind: 'routine', verdict: 'skip' });
  });

  it('a newer answer for the same title replaces the old rule', () => {
    const first = learnFromAnswers({ birthdays: 'skip' }, [{ title: 'Padel', guessedKind: 'other', kind: 'other', verdict: 'skip' }], now);
    const second = learnFromAnswers(first, [{ title: 'Padel', guessedKind: 'other', kind: 'other', verdict: 'plan' }], now);
    expect(second.titleRules).toHaveLength(1);
    expect(second.titleRules![0].verdict).toBe('plan');
  });
});
