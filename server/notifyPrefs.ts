/**
 * How and when a user wants their update: which channels (any combination),
 * how often (daily / weekly), and at what local time. Pure types and
 * validation, shared by the API, the scheduler and the tests.
 */

export type NotifyChannel = 'telegram' | 'email' | 'in_app';
export const NOTIFY_CHANNELS: readonly NotifyChannel[] = ['telegram', 'email', 'in_app'];
export type NotifyFrequency = 'daily' | 'weekly';

export interface NotifyPrefs {
  /** Empty = automatic: Telegram if paired, otherwise the in-app notice. */
  channels: NotifyChannel[];
  frequency: NotifyFrequency;
  /** Local hour of day, 0-23. */
  hour: number;
  /** Weekly only: 0 = Sunday ... 6 = Saturday. */
  weekday: number;
  /** IANA time zone the hour is in, e.g. Europe/London. */
  timezone: string;
}

/** What a user who never touched the preferences gets: daily, early morning UTC. */
export const DEFAULT_NOTIFY_PREFS: NotifyPrefs = {
  channels: [],
  frequency: 'daily',
  hour: 7,
  weekday: 1,
  timezone: 'UTC',
};

export function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || !tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export function parseChannelList(value: unknown): NotifyChannel[] {
  const raw = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  const seen = new Set<NotifyChannel>();
  for (const item of raw) {
    const c = String(item).trim() as NotifyChannel;
    if (NOTIFY_CHANNELS.includes(c)) seen.add(c);
  }
  return NOTIFY_CHANNELS.filter((c) => seen.has(c));
}

/**
 * Validates a client-supplied preferences object over the current ones.
 * Returns null when a field is present but invalid, so bad input is refused
 * rather than silently replaced.
 */
export function mergeNotifyPrefs(input: any, current: NotifyPrefs): NotifyPrefs | null {
  if (!input || typeof input !== 'object') return null;
  const next: NotifyPrefs = { ...current, channels: [...current.channels] };

  if (input.channels !== undefined) {
    if (!Array.isArray(input.channels)) return null;
    if (input.channels.some((c: unknown) => !NOTIFY_CHANNELS.includes(c as NotifyChannel))) return null;
    next.channels = parseChannelList(input.channels);
  }
  if (input.frequency !== undefined) {
    if (input.frequency !== 'daily' && input.frequency !== 'weekly') return null;
    next.frequency = input.frequency;
  }
  if (input.hour !== undefined) {
    if (!Number.isInteger(input.hour) || input.hour < 0 || input.hour > 23) return null;
    next.hour = input.hour;
  }
  if (input.weekday !== undefined) {
    if (!Number.isInteger(input.weekday) || input.weekday < 0 || input.weekday > 6) return null;
    next.weekday = input.weekday;
  }
  if (input.timezone !== undefined) {
    if (!isValidTimeZone(input.timezone)) return null;
    next.timezone = input.timezone;
  }
  return next;
}
