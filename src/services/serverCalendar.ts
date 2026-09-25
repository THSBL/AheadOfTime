import type { CalendarEvent } from '../types';
import type { GoogleCalendarEventItem, GoogleCalendarProfile, MilestoneSyncFormat, SyncResult } from './googleCalendar';
import { getStoredAccessToken, isTokenExpired } from './googleAuth';
import { bearerHeader, canUseAppSession } from './appSession';
import { getCurrentUser } from './accountManager';

/**
 * Push to Cal and Scan agenda through the server, which uses the Google
 * grant stored for Background Sync. Unlike the browser's Google token
 * (one hour, one browser), that grant keeps working, so linked users never
 * see "Google session expired" or a sign-in popup for these actions.
 *
 * Every call throws ServerCalendarUnavailable when the server can't do it
 * (not signed in, Background Sync not linked, grant revoked); callers then
 * fall back to the browser's own Google token, exactly as before.
 */
export class ServerCalendarUnavailable extends Error {
  constructor(message = 'Server calendar access is not available') {
    super(message);
    this.name = 'ServerCalendarUnavailable';
  }
}

/** A live browser token identifies the user; otherwise the session cookie does. */
function authHeaders(): Record<string, string> {
  const token = getStoredAccessToken();
  return bearerHeader(token && !isTokenExpired() ? token : null);
}

/** Whether this account has Background Sync linked, so the server can act for it. */
export async function isServerCalendarLinked(): Promise<boolean> {
  const hasToken = Object.keys(authHeaders()).length > 0;
  if (!hasToken && !(await canUseAppSession(getCurrentUser()?.email))) return false;
  try {
    const res = await fetch('/api/auth/google/status', { headers: authHeaders(), cache: 'no-store' });
    const data = await res.json().catch(() => null);
    return res.ok && data?.ok === true && data.linked === true;
  } catch {
    return false;
  }
}

async function readResponse<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => null);
  if (res.status === 401 || res.status === 409) throw new ServerCalendarUnavailable(data?.error);
  if (!res.ok || !data?.ok) throw new Error(data?.error || `Server responded ${res.status}`);
  return data as T;
}

export async function pushEventViaServer(
  event: CalendarEvent,
  timeZone: string,
  milestoneFormat: MilestoneSyncFormat
): Promise<SyncResult> {
  const res = await fetch('/api/auth/google/calendar-push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ event, timeZone, milestoneFormat }),
    cache: 'no-store',
  });
  const data = await readResponse<{ result: SyncResult }>(res);
  return data.result;
}

export async function scanAgendaViaServer(
  timeMin: string,
  timeMax: string,
  maxResults = 150
): Promise<{ profile: GoogleCalendarProfile; items: GoogleCalendarEventItem[] }> {
  const params = new URLSearchParams({ timeMin, timeMax, maxResults: String(maxResults) });
  const res = await fetch(`/api/auth/google/calendar-events?${params}`, {
    headers: authHeaders(),
    cache: 'no-store',
  });
  const data = await readResponse<{ profile: GoogleCalendarProfile; items: GoogleCalendarEventItem[] }>(res);
  return { profile: data.profile, items: data.items || [] };
}
