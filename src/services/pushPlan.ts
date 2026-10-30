import type { CalendarEvent } from '../types';
import { DEFAULT_CLIENT_ID, getStoredAccessToken, isTokenExpired, requestGoogleCalendarToken } from './googleAuth';
import { getMilestoneSyncFormat, setMilestoneSyncFormat, syncEventToGoogleCalendar, type SyncResult } from './googleCalendar';
import { isServerCalendarLinked, pushEventViaServer, ServerCalendarUnavailable } from './serverCalendar';
import { cleanReminderPrefs, type ReminderPrefs } from '../utils/planLink';

/**
 * Putting one plan in the owner's Google Calendar (PushPlanSheet), the way
 * they chose to see prep tasks: as Google Tasks, or as reminders at their
 * hour and length. The choice is remembered for the next plan.
 */

const PREFS = 'aot_reminder_prefs';

export function getReminderPrefs(): ReminderPrefs {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS) || 'null');
    if (saved) return cleanReminderPrefs(saved);
  } catch {
    // Storage blocked or unreadable: the older setting decides.
  }
  return cleanReminderPrefs({ style: getMilestoneSyncFormat() === 'timed' ? 'events' : 'tasks' });
}

export function setReminderPrefs(prefs: ReminderPrefs): void {
  try {
    localStorage.setItem(PREFS, JSON.stringify(prefs));
    // Kept in step with the older setting the batch sync window reads.
    setMilestoneSyncFormat(prefs.style === 'events' ? 'timed' : 'tasks_only');
  } catch {
    // Storage blocked: the choice applies to this push only.
  }
}

const timeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Amsterdam';

/** Server first (Background Sync grant); the browser's own Google token when the server can't act for this account. */
export async function pushPlanToGoogle(event: CalendarEvent, prefs: ReminderPrefs): Promise<SyncResult> {
  const format = prefs.style === 'events' ? 'timed' : 'tasks_only';
  const reminder = { time: prefs.time, minutes: prefs.minutes };
  if (await isServerCalendarLinked().catch(() => false)) {
    try {
      return await pushEventViaServer(event, timeZone(), format, reminder);
    } catch (err) {
      if (!(err instanceof ServerCalendarUnavailable)) throw err;
    }
  }
  let token = getStoredAccessToken();
  if (!token || isTokenExpired()) token = (await requestGoogleCalendarToken(DEFAULT_CLIENT_ID)).accessToken;
  return syncEventToGoogleCalendar(token, event, timeZone(), { milestoneFormat: format, reminderTime: reminder.time, reminderMinutes: reminder.minutes });
}

// A push asked for before signing in, picked up once the account is there.
const PENDING = 'aot_pending_push';

export function setPendingPush(eventId: string): void {
  try {
    sessionStorage.setItem(PENDING, eventId);
  } catch {
    // Storage blocked: after signing in the plan opens without the push window.
  }
}

export function takePendingPush(): string | null {
  try {
    const id = sessionStorage.getItem(PENDING);
    sessionStorage.removeItem(PENDING);
    return id;
  } catch {
    return null;
  }
}
