import type { NotifyPrefs } from './notifyPrefs.js';

/**
 * "Is this user's update due?" for a scheduler that may only run once a day
 * (Vercel Hobby) or hourly (an external ping): the update is due when the most
 * recent scheduled moment has passed and nothing has been sent since it. So a
 * user who picked 08:00 gets it on the first run after 08:00, and never twice.
 */

const DAY_MS = 86_400_000;

interface LocalParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function localParts(ms: number, timeZone: string): LocalParts {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  }).formatToParts(new Date(ms));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour'), minute: get('minute'), second: get('second') };
}

/** Offset of `timeZone` from UTC at that instant, in ms (positive = ahead of UTC). */
function offsetMs(ms: number, timeZone: string): number {
  const p = localParts(ms, timeZone);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
}

/** The UTC instant at which the wall clock in `timeZone` reads y-m-d hour:00. */
export function zonedTimeToUtcMs(year: number, month: number, day: number, hour: number, timeZone: string): number {
  const guess = Date.UTC(year, month - 1, day, hour);
  const first = guess - offsetMs(guess, timeZone);
  const second = guess - offsetMs(first, timeZone);
  return second;
}

/** The latest scheduled send time that is not in the future (searches back a week+). */
export function mostRecentScheduledMs(nowMs: number, prefs: Pick<NotifyPrefs, 'frequency' | 'hour' | 'weekday' | 'timezone'>): number {
  const today = localParts(nowMs, prefs.timezone);
  for (let back = 0; back <= 8; back++) {
    const d = new Date(Date.UTC(today.year, today.month - 1, today.day - back));
    if (prefs.frequency === 'weekly' && d.getUTCDay() !== prefs.weekday) continue;
    const scheduled = zonedTimeToUtcMs(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), prefs.hour, prefs.timezone);
    if (scheduled <= nowMs) return scheduled;
  }
  // Unreachable for valid prefs; a day ago keeps the caller safe.
  return nowMs - DAY_MS;
}

export function isUpdateDue(
  nowMs: number,
  prefs: Pick<NotifyPrefs, 'frequency' | 'hour' | 'weekday' | 'timezone'>,
  lastSentMs: number | null
): boolean {
  const scheduled = mostRecentScheduledMs(nowMs, prefs);
  return lastSentMs === null || lastSentMs < scheduled;
}

/** How far back "new" calendar events count: a full period plus a day of slack. */
export function lookbackMs(frequency: NotifyPrefs['frequency']): number {
  return frequency === 'weekly' ? 8 * DAY_MS : 3 * DAY_MS;
}
