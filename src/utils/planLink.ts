import type { CalendarEvent, TMinusMilestone } from '../types.js';

/**
 * A plan link: one plan, on its own, for the owner's calendar and for the
 * people they share it with (server/sharedPlans.ts, SharePlanDialog,
 * PushPlanSheet, SharedPlanPage). Shared by the app and the server.
 *
 * The app decides what is an EVENT: the fixed moments of a plan (the day
 * itself; a trip's departure and return). Every other step is a prep task,
 * and the only choice the owner makes is how prep tasks show in their
 * calendar: as tasks, or as a reminder at a time and length they pick.
 */

export interface FixedMoment {
  key: 'event' | 'departure' | 'return';
  title: string;
  /** YYYY-MM-DD */
  date: string;
  /** Last day of a multi-day event (inclusive), when it has no time. */
  endDate?: string;
  /** HH:mm, when the moment has a time. */
  time?: string;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^\d{2}:\d{2}$/;
const day = (v: unknown): string => (typeof v === 'string' && DAY.test(v.slice(0, 10)) ? v.slice(0, 10) : '');
const time = (v: unknown): string | undefined => (typeof v === 'string' && TIME.test(v) ? v : undefined);

export function fixedMoments(event: Pick<CalendarEvent, 'title' | 'category' | 'eventDate' | 'endDate' | 'eventTime' | 'context'>): FixedMoment[] {
  const start = day(event.eventDate);
  if (!start) return [];
  const end = day(event.endDate);
  const title = (event.title || '').trim();
  if (event.category === 'travel_trip' && end && end > start) {
    return [
      { key: 'departure', title: `Departure: ${title}`, date: start, time: time(event.eventTime) },
      { key: 'return', title: `Return: ${title}`, date: end, time: time(event.context?.returnTime) },
    ];
  }
  // A multi-day event without a time is one all-day block over its days.
  if (end && end > start) return [{ key: 'event', title, date: start, endDate: end, time: time(event.eventTime) }];
  return [{ key: 'event', title, date: start, time: time(event.eventTime) }];
}

// ---- how prep tasks show in the owner's calendar ---------------------------

export type ReminderStyle = 'tasks' | 'events';

export interface ReminderPrefs {
  style: ReminderStyle;
  /** HH:mm - when an event reminder starts. */
  time: string;
  /** Length of an event reminder. */
  minutes: number;
}

export const DEFAULT_REMINDER_PREFS: ReminderPrefs = { style: 'tasks', time: '19:00', minutes: 30 };
export const REMINDER_MINUTES = [15, 30, 60] as const;

export function cleanReminderPrefs(raw: unknown): ReminderPrefs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const minutes = Number(r.minutes);
  return {
    style: r.style === 'events' ? 'events' : 'tasks',
    time: time(r.time) || DEFAULT_REMINDER_PREFS.time,
    minutes: (REMINDER_MINUTES as readonly number[]).includes(minutes) ? minutes : DEFAULT_REMINDER_PREFS.minutes,
  };
}

// ---- what guests see ---------------------------------------------------------

export type ShareAudience = 'guests' | 'all';

/** What the owner chose for a plan link. */
export interface PlanLinkSettings {
  audience: ShareAudience;
  /** Ids of the steps guests see. */
  everyone: string[];
  /** How prep steps show in the owner's own calendar feed. */
  reminders: ReminderPrefs;
}

/** Steps that concern everyone invited, not just the organiser. */
const GUEST_STEP = /\b(wish ?lists?|rsvps?|bring|your gifts?|buy (and wrap )?(a |the |your )?gifts?|wrap (your |the )?gifts?|costumes?|outfits?|dress code|pack your)\b/i;

/** The prep steps a plan shows, in date order. */
export function activeSteps(event: Pick<CalendarEvent, 'milestones'>): TMinusMilestone[] {
  return (event.milestones || [])
    .filter((m) => m && m.isActive !== false && m.status !== 'skipped' && (m.title || '').trim() && day(m.calculatedDate))
    .sort((a, b) => a.calculatedDate.localeCompare(b.calculatedDate));
}

/** Which steps start out as "Everyone" in the share window. */
export function defaultEveryoneStepIds(event: Pick<CalendarEvent, 'milestones'>): string[] {
  return activeSteps(event)
    .filter((m) => (m.applicableRoles || []).includes('guest') || GUEST_STEP.test(m.title))
    .map((m) => m.id);
}

export interface LinkStep {
  title: string;
  /** YYYY-MM-DD */
  date: string;
  done: boolean;
}

/** The first open step that isn't past yet. */
export function nextUpStep<T extends LinkStep>(steps: T[], today: string): T | null {
  return steps.find((s) => !s.done && s.date >= today) || null;
}

/** Steps a guest can still add to their calendar. */
export function upcomingSteps<T extends LinkStep>(steps: T[], today: string): T[] {
  return steps.filter((s) => !s.done && s.date >= today);
}

/** The text that goes with the link in WhatsApp and other apps. */
export function shareMessage(url: string, reminders: number): string {
  const cta =
    reminders <= 0
      ? 'Tap to add this event to your calendar:'
      : `Tap to add this event and ${reminders} more ${reminders === 1 ? 'reminder' : 'reminders'} to your calendar:`;
  return `${cta}\n\n${url}`;
}

/** "Sat 22 Nov" */
export function shortDay(date: string): string {
  const d = day(date);
  if (!d) return '';
  return new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

// ---- one-tap "add to calendar" links ------------------------------------------

export interface CalendarItem {
  title: string;
  date: string;
  endDate?: string;
  time?: string;
  /** Length when timed; 2 hours by default. */
  minutes?: number;
  details?: string;
}

const nextDay = (d: string) => new Date(Date.parse(`${d}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);

function timedRange(item: CalendarItem): { start: string; end: string } {
  const [h, m] = (item.time || '00:00').split(':').map(Number);
  const startMs = Date.parse(`${item.date}T00:00:00Z`) + (h * 60 + m) * 60_000;
  const endMs = startMs + (item.minutes || 120) * 60_000;
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 19);
  return { start: iso(startMs), end: iso(endMs) };
}

/** Google Calendar's "add event" page with the item filled in (local time of the guest's calendar). */
export function googleAddLink(item: CalendarItem): string {
  let dates: string;
  if (item.time) {
    const { start, end } = timedRange(item);
    dates = `${start.replace(/[-:]/g, '')}/${end.replace(/[-:]/g, '')}`;
  } else {
    dates = `${item.date.replace(/-/g, '')}/${nextDay(item.endDate || item.date).replace(/-/g, '')}`;
  }
  const p = new URLSearchParams({ action: 'TEMPLATE', text: item.title, dates });
  if (item.details) p.set('details', item.details);
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

/** Outlook on the web's "new event" page with the item filled in. */
export function outlookAddLink(item: CalendarItem): string {
  const p = new URLSearchParams({ path: '/calendar/action/compose', rru: 'addevent', subject: item.title });
  if (item.time) {
    const { start, end } = timedRange(item);
    p.set('startdt', start);
    p.set('enddt', end);
  } else {
    p.set('startdt', item.date);
    p.set('enddt', nextDay(item.endDate || item.date));
    p.set('allday', 'true');
  }
  if (item.details) p.set('body', item.details);
  return `https://outlook.live.com/calendar/0/deeplink/compose?${p.toString()}`;
}

/** webcal:// for a subscription link, so a phone opens its calendar app. */
export const webcalUrl = (httpsUrl: string) => httpsUrl.replace(/^https?:\/\//i, 'webcal://');

/** Google Calendar's "Add calendar" page for a subscription (it then follows the feed). */
export const googleSubscribeLink = (feedUrl: string) => `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl(feedUrl))}`;

/** Outlook on the web's "add calendar from the internet" for a subscription. */
export const outlookSubscribeLink = (feedUrl: string, name: string) =>
  `https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(feedUrl)}&name=${encodeURIComponent(name)}`;
