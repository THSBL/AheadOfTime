import { describe, it, expect } from 'vitest';
import { zonedTimeToUtcMs, mostRecentScheduledMs, isUpdateDue, lookbackMs } from './notifySchedule';
import { mergeNotifyPrefs, parseChannelList, DEFAULT_NOTIFY_PREFS, isValidTimeZone } from './notifyPrefs';

const utc = (iso: string) => Date.parse(iso);

describe('zonedTimeToUtcMs', () => {
  it('converts wall-clock time in a zone to the right UTC instant, across DST', () => {
    // London is UTC+1 in summer (BST), UTC+0 in winter.
    expect(zonedTimeToUtcMs(2026, 9, 21, 8, 'Europe/London')).toBe(utc('2026-09-21T07:00:00Z'));
    expect(zonedTimeToUtcMs(2026, 12, 21, 8, 'Europe/London')).toBe(utc('2026-12-21T08:00:00Z'));
    expect(zonedTimeToUtcMs(2026, 9, 21, 8, 'UTC')).toBe(utc('2026-09-21T08:00:00Z'));
    // New York is UTC-4 in summer.
    expect(zonedTimeToUtcMs(2026, 9, 21, 8, 'America/New_York')).toBe(utc('2026-09-21T12:00:00Z'));
    // Sydney is UTC+10 in September (before DST starts in October).
    expect(zonedTimeToUtcMs(2026, 9, 21, 8, 'Australia/Sydney')).toBe(utc('2026-09-20T22:00:00Z'));
  });
});

describe('daily schedule', () => {
  const prefs = { frequency: 'daily' as const, hour: 8, weekday: 1, timezone: 'Europe/London' };

  it('before today\'s time the most recent slot is yesterday\'s; after it, today\'s', () => {
    expect(mostRecentScheduledMs(utc('2026-09-21T06:59:00Z'), prefs)).toBe(utc('2026-09-20T07:00:00Z'));
    expect(mostRecentScheduledMs(utc('2026-09-21T07:00:00Z'), prefs)).toBe(utc('2026-09-21T07:00:00Z'));
    expect(mostRecentScheduledMs(utc('2026-09-21T15:00:00Z'), prefs)).toBe(utc('2026-09-21T07:00:00Z'));
  });

  it('is due once the time has passed and nothing was sent since, and never twice', () => {
    const now = utc('2026-09-21T07:30:00Z');
    expect(isUpdateDue(now, prefs, null)).toBe(true);
    expect(isUpdateDue(now, prefs, utc('2026-09-20T07:05:00Z'))).toBe(true); // yesterday's send
    expect(isUpdateDue(now, prefs, utc('2026-09-21T07:10:00Z'))).toBe(false); // already sent this slot
  });

  it('is not due before the chosen time when today\'s slot has not arrived yet', () => {
    expect(isUpdateDue(utc('2026-09-21T06:00:00Z'), prefs, utc('2026-09-20T07:10:00Z'))).toBe(false);
  });

  it('a once-a-day 07:00 UTC job still serves a later chosen time, just on the next run', () => {
    const noon = { ...prefs, hour: 13 }; // 12:00 UTC in BST
    const run = utc('2026-09-21T07:00:00Z');
    expect(isUpdateDue(run, noon, utc('2026-09-20T12:05:00Z'))).toBe(false);
    expect(isUpdateDue(utc('2026-09-22T07:00:00Z'), noon, utc('2026-09-20T12:05:00Z'))).toBe(true);
  });
});

describe('weekly schedule', () => {
  const mondays = { frequency: 'weekly' as const, hour: 9, weekday: 1, timezone: 'UTC' };

  it('uses the most recent chosen weekday', () => {
    // 2026-09-21 is a Monday.
    expect(mostRecentScheduledMs(utc('2026-09-21T10:00:00Z'), mondays)).toBe(utc('2026-09-21T09:00:00Z'));
    expect(mostRecentScheduledMs(utc('2026-09-21T08:00:00Z'), mondays)).toBe(utc('2026-09-14T09:00:00Z'));
    expect(mostRecentScheduledMs(utc('2026-09-24T12:00:00Z'), mondays)).toBe(utc('2026-09-21T09:00:00Z'));
  });

  it('sends once per week', () => {
    expect(isUpdateDue(utc('2026-09-24T12:00:00Z'), mondays, utc('2026-09-21T09:05:00Z'))).toBe(false);
    expect(isUpdateDue(utc('2026-09-28T09:30:00Z'), mondays, utc('2026-09-21T09:05:00Z'))).toBe(true);
  });
});

describe('lookbackMs', () => {
  it('covers a full period for weekly updates', () => {
    expect(lookbackMs('weekly')).toBeGreaterThan(7 * 86_400_000);
    expect(lookbackMs('daily')).toBeGreaterThanOrEqual(2 * 86_400_000);
  });
});

describe('notify preferences validation', () => {
  it('accepts any combination of channels and normalises order/duplicates', () => {
    expect(parseChannelList(['email', 'telegram', 'email'])).toEqual(['telegram', 'email']);
    expect(parseChannelList('telegram,in_app')).toEqual(['telegram', 'in_app']);
    expect(parseChannelList(null)).toEqual([]);
  });

  it('merges valid changes and refuses invalid ones', () => {
    const merged = mergeNotifyPrefs({ channels: ['telegram', 'email'], frequency: 'weekly', hour: 18, weekday: 5, timezone: 'Europe/Brussels' }, DEFAULT_NOTIFY_PREFS);
    expect(merged).toEqual({ channels: ['telegram', 'email'], frequency: 'weekly', hour: 18, weekday: 5, timezone: 'Europe/Brussels' });
    expect(mergeNotifyPrefs({ hour: 24 }, DEFAULT_NOTIFY_PREFS)).toBeNull();
    expect(mergeNotifyPrefs({ hour: 7.5 }, DEFAULT_NOTIFY_PREFS)).toBeNull();
    expect(mergeNotifyPrefs({ frequency: 'hourly' }, DEFAULT_NOTIFY_PREFS)).toBeNull();
    expect(mergeNotifyPrefs({ channels: ['sms'] }, DEFAULT_NOTIFY_PREFS)).toBeNull();
    expect(mergeNotifyPrefs({ timezone: 'Mars/Olympus' }, DEFAULT_NOTIFY_PREFS)).toBeNull();
    expect(mergeNotifyPrefs('nope', DEFAULT_NOTIFY_PREFS)).toBeNull();
  });

  it('only changes the fields that were sent', () => {
    const current = { ...DEFAULT_NOTIFY_PREFS, hour: 9, channels: ['email' as const] };
    expect(mergeNotifyPrefs({ frequency: 'weekly' }, current)).toEqual({ ...current, frequency: 'weekly' });
  });

  it('knows valid time zones', () => {
    expect(isValidTimeZone('Europe/London')).toBe(true);
    expect(isValidTimeZone('Nope/Zone')).toBe(false);
    expect(isValidTimeZone('')).toBe(false);
  });
});
