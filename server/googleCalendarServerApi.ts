import { getValidAccessToken, backgroundSyncHasTasksScope } from './googleOAuthTokenStore.js';
import {
  syncEventToGoogleCalendar,
  fetchGoogleCalendarEvents,
  fetchPrimaryCalendarProfile,
  type MilestoneSyncFormat,
} from '../src/services/googleCalendar.js';
import type { CalendarEvent } from '../src/types.js';

/**
 * "Push to Cal" and "Scan agenda" run on the server with the refresh token
 * stored for Background Sync, so they keep working after the browser's
 * one-hour Google token has expired (or was never granted in this browser)
 * and no Google popup is needed. The Google calls are the same functions
 * the browser uses (src/services/googleCalendar.ts), so both paths create
 * identical calendar entries and tasks.
 *
 * 409 { linked: false } means no stored grant: the app then falls back to
 * the browser's own Google token.
 */

const MILESTONE_FORMATS: MilestoneSyncFormat[] = ['tasks_only', 'all_day', 'timed'];
const MAX_SCAN_RESULTS = 250;
const MAX_SCAN_WINDOW_MS = 400 * 24 * 60 * 60 * 1000;

export interface CalendarApiResult {
  status: number;
  body: Record<string, unknown>;
}

const notLinked = (): CalendarApiResult => ({
  status: 409,
  body: { ok: false, linked: false, error: 'Background Sync is not linked for this account.' },
});

function isValidTimeZone(tz: unknown): tz is string {
  if (typeof tz !== 'string' || tz.length === 0 || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function isAuthError(err: unknown): boolean {
  const msg = String((err as any)?.message || err || '');
  return /invalid (authentication )?credentials|401|unauthenticated|invalid_grant/i.test(msg);
}

function looksLikeEvent(value: unknown): value is CalendarEvent {
  const e = value as CalendarEvent;
  return (
    !!e &&
    typeof e === 'object' &&
    typeof e.id === 'string' &&
    typeof e.title === 'string' &&
    typeof e.eventDate === 'string' &&
    (e.milestones === undefined || Array.isArray(e.milestones)) &&
    (e.milestones?.length ?? 0) <= 200
  );
}

/** POST /api/auth/google/calendar-push { event, timeZone?, milestoneFormat? } */
export async function handleCalendarPush(userId: string, method: string, body: any): Promise<CalendarApiResult> {
  if (method !== 'POST') return { status: 405, body: { ok: false, error: 'Method not allowed' } };
  const event = body?.event;
  if (!looksLikeEvent(event)) return { status: 400, body: { ok: false, error: 'A valid event is required.' } };

  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) return notLinked();
  // A grant without Google Tasks would push the event but silently drop
  // every prep task: let the browser's token (which has Tasks) do it instead.
  if (!(await backgroundSyncHasTasksScope(userId))) {
    return { status: 409, body: { ok: false, linked: true, tasksGranted: false, error: 'Google Tasks access was not granted for Background Sync.' } };
  }

  const timeZone = isValidTimeZone(body?.timeZone) ? body.timeZone : 'Europe/Amsterdam';
  const milestoneFormat = MILESTONE_FORMATS.includes(body?.milestoneFormat) ? body.milestoneFormat : 'tasks_only';
  try {
    const result = await syncEventToGoogleCalendar(accessToken, event, timeZone, { milestoneFormat });
    return { status: 200, body: { ok: true, result } };
  } catch (err: any) {
    // A grant Google no longer honours behaves like no grant at all, so the
    // app falls back to the browser token instead of showing an error.
    if (isAuthError(err)) return notLinked();
    return { status: 502, body: { ok: false, error: err?.message || 'Google Calendar push failed' } };
  }
}

/** GET /api/auth/google/calendar-events?timeMin=&timeMax=&maxResults= */
export async function handleCalendarEvents(userId: string, method: string, query: any): Promise<CalendarApiResult> {
  if (method !== 'GET') return { status: 405, body: { ok: false, error: 'Method not allowed' } };
  const timeMin = new Date(String(query?.timeMin || ''));
  const timeMax = new Date(String(query?.timeMax || ''));
  if (isNaN(timeMin.getTime()) || isNaN(timeMax.getTime()) || timeMax <= timeMin || timeMax.getTime() - timeMin.getTime() > MAX_SCAN_WINDOW_MS) {
    return { status: 400, body: { ok: false, error: 'timeMin and timeMax must form a valid window of at most 400 days.' } };
  }
  const requested = parseInt(String(query?.maxResults || '150'), 10);
  const maxResults = Math.min(Math.max(Number.isFinite(requested) ? requested : 150, 1), MAX_SCAN_RESULTS);

  const accessToken = await getValidAccessToken(userId);
  if (!accessToken) return notLinked();

  try {
    const [profile, items] = await Promise.all([
      fetchPrimaryCalendarProfile(accessToken),
      fetchGoogleCalendarEvents(accessToken, maxResults, timeMin.toISOString(), timeMax.toISOString()),
    ]);
    return { status: 200, body: { ok: true, profile, items } };
  } catch (err: any) {
    if (isAuthError(err)) return notLinked();
    return { status: 502, body: { ok: false, error: err?.message || 'Could not read Google Calendar' } };
  }
}
