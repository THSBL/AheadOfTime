import { CalendarEvent, TMinusMilestone } from '../types';
import { createGoogleTask, deleteGoogleTask, fetchGoogleTasks, updateGoogleTaskStatus, GoogleTaskItem } from './googleTasks';

declare const google: any;

export const DEFAULT_GOOGLE_CLIENT_ID = 
  import.meta.env?.VITE_GOOGLE_CLIENT_ID || 
  '705347156449-npiab082970nc26q27ln55g4ti4tj8i9.apps.googleusercontent.com';

export function getActiveClientId(): string {
  const custom = typeof window !== 'undefined' ? localStorage.getItem('gcal_custom_client_id') : null;
  return (custom && custom.trim().length > 0) ? custom.trim() : DEFAULT_GOOGLE_CLIENT_ID;
}

export function setActiveClientId(clientId: string): void {
  if (typeof window !== 'undefined') {
    if (clientId && clientId.trim().length > 0) {
      localStorage.setItem('gcal_custom_client_id', clientId.trim());
    } else {
      localStorage.removeItem('gcal_custom_client_id');
    }
  }
}

export const GOOGLE_CLIENT_ID = DEFAULT_GOOGLE_CLIENT_ID;

export const GOOGLE_CALENDAR_SCOPES = 'https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/tasks';

export interface GoogleCalendarEventItem {
  id: string;
  summary: string;
  description?: string;
  start?: {
    dateTime?: string;
    date?: string;
  };
  end?: {
    dateTime?: string;
    date?: string;
  };
  location?: string;
  htmlLink?: string;
  hangoutLink?: string;
  conferenceData?: any;
  status?: string;
}

export interface GoogleCalendarProfile {
  id: string; // Email or calendar ID
  summary: string;
  timeZone?: string;
}

export interface SyncResult {
  mainEventId?: string;
  mainEventLink?: string;
  milestoneEventIds: string[];
  googleTaskIds: string[];
  totalTasksPushed: number;
  totalSynced: number;
  updatedEvent?: CalendarEvent;
  error?: string;
}

/**
 * Fetch primary calendar details (email, summary, timezone)
 */
export async function fetchPrimaryCalendarProfile(
  accessToken: string
): Promise<GoogleCalendarProfile> {
  const url = 'https://www.googleapis.com/calendar/v3/calendars/primary';
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `Failed to fetch calendar profile (${response.status})`);
  }

  const data = await response.json();
  return {
    id: data.id || '',
    summary: data.summary || data.id || 'Primary Calendar',
    timeZone: data.timeZone,
  };
}

/**
 * Fetch upcoming Google Calendar events
 */
export async function fetchGoogleCalendarEvents(
  accessToken: string,
  maxResults = 25,
  timeMin?: string,
  timeMax?: string
): Promise<GoogleCalendarEventItem[]> {
  const min = timeMin || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // Include today/yesterday for test visibility
  let url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${encodeURIComponent(
    min
  )}&maxResults=${maxResults}&singleEvents=true&orderBy=startTime`;
  if (timeMax) {
    url += `&timeMax=${encodeURIComponent(timeMax)}`;
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `Google Calendar error (${response.status})`);
  }

  const data = await response.json();
  return data.items || [];
}

/**
 * Create a single custom or test event on Google Calendar
 */
export async function createCalendarEvent(
  accessToken: string,
  event: {
    summary: string;
    description?: string;
    start: { dateTime?: string; date?: string; timeZone?: string };
    end: { dateTime?: string; date?: string; timeZone?: string };
    reminders?: {
      useDefault?: boolean;
      overrides?: { method: 'email' | 'popup'; minutes: number }[];
    };
  }
): Promise<GoogleCalendarEventItem> {
  const response = await fetch(
    'https://www.googleapis.com/calendar/v3/calendars/primary/events',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(event),
    }
  );

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || `Failed to create event (${response.status})`);
  }

  return data;
}

/**
 * Delete an event from Google Calendar by its ID
 */
export async function deleteGoogleCalendarEvent(
  accessToken: string,
  eventId: string
): Promise<boolean> {
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  );

  if (!response.ok && response.status !== 404 && response.status !== 410) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error?.message || `Failed to delete event (${response.status})`);
  }

  return true;
}

/**
 * Delete all test events created by T-Minus from the primary calendar
 */
export async function wipeGoogleCalendarTestEvents(
  accessToken: string
): Promise<{ deletedCount: number; deletedTitles: string[] }> {
  const items = await fetchGoogleCalendarEvents(accessToken, 50);
  const testItems = items.filter((item) => {
    const sum = (item.summary || '').toLowerCase();
    const desc = (item.description || '').toLowerCase();
    return (
      sum.includes('t-minus') ||
      sum.startsWith('[t-') ||
      desc.includes('t-minus calendar') ||
      desc.includes('reverse-engineered lead time')
    );
  });

  let deletedCount = 0;
  const deletedTitles: string[] = [];

  for (const item of testItems) {
    try {
      await deleteGoogleCalendarEvent(accessToken, item.id);
      deletedCount++;
      deletedTitles.push(item.summary || 'Test Event');
    } catch (err) {
      console.warn(`Could not delete test event ${item.id}:`, err);
    }
  }

  return { deletedCount, deletedTitles };
}

/**
 * Utility to extract clean YYYY-MM-DD from any date string or ISO string
 */
export function extractDateOnly(dateStr: string): string {
  if (!dateStr) return new Date().toISOString().substring(0, 10);
  // If already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr.trim())) {
    return dateStr.trim();
  }
  try {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      const year = d.getUTCFullYear();
      const month = String(d.getUTCMonth() + 1).padStart(2, '0');
      const day = String(d.getUTCDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  } catch {
    // fallback
  }
  return dateStr.substring(0, 10);
}

/**
 * Get next day date string YYYY-MM-DD for exclusive all-day Google Calendar end date
 */
export function getNextDayDate(dateStr: string): string {
  const dateOnly = extractDateOnly(dateStr);
  const [y, m, d] = dateOnly.split('-').map(Number);
  const dateObj = new Date(Date.UTC(y, m - 1, d));
  dateObj.setUTCDate(dateObj.getUTCDate() + 1);
  const ny = dateObj.getUTCFullYear();
  const nm = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
  const nd = String(dateObj.getUTCDate()).padStart(2, '0');
  return `${ny}-${nm}-${nd}`;
}

/**
 * Format RFC3339 start and end dateTimes cleanly without double ISO suffixes
 */
export function formatStartEndDateTime(
  dateInput: string,
  preferredTime = '09:00',
  durationMinutes = 30
): { startDateTime: string; endDateTime: string; dateOnly: string } {
  const dateOnly = extractDateOnly(dateInput);
  const timeParts = preferredTime.split(':').map(Number);
  const startHrs = isNaN(timeParts[0]) ? 9 : Math.min(23, Math.max(0, timeParts[0]));
  const startMins = isNaN(timeParts[1]) ? 0 : Math.min(59, Math.max(0, timeParts[1]));

  const startHoursStr = String(startHrs).padStart(2, '0');
  const startMinsStr = String(startMins).padStart(2, '0');
  const startDateTime = `${dateOnly}T${startHoursStr}:${startMinsStr}:00`;

  // Calculate end time
  const totalMins = startHrs * 60 + startMins + durationMinutes;
  const endHrs = Math.min(23, Math.floor(totalMins / 60));
  const endMinutes = totalMins % 60;
  const endHoursStr = String(endHrs).padStart(2, '0');
  const endMinutesStr = String(endMinutes).padStart(2, '0');
  const endDateTime = `${dateOnly}T${endHoursStr}:${endMinutesStr}:00`;

  return { startDateTime, endDateTime, dateOnly };
}

export type MilestoneSyncFormat = 'tasks_only' | 'all_day' | 'timed';

export interface SyncOptions {
  milestoneFormat?: MilestoneSyncFormat; // 'tasks_only' (default, clean Google Tasks), 'all_day', or 'timed'
  createCalendarBlocksForMilestones?: boolean; // legacy alias
  taskListId?: string;
}

/**
 * Wipe ONLY the duplicate milestone calendar events (events starting with 📋 or containing [TASK] / [T-)
 * Keeps the main 🎯 [TARGET DEADLINE] calendar events intact.
 */
export async function wipeMilestoneCalendarEventsOnly(
  accessToken: string,
  timeMin = '2026-01-01T00:00:00Z',
  timeMax = '2027-12-31T23:59:59Z'
): Promise<{ deletedCount: number; deletedTitles: string[] }> {
  const items = await fetchGoogleCalendarEvents(accessToken, 250, timeMin, timeMax);
  const milestoneEvents = items.filter((item) => {
    const summary = (item.summary || '').toLowerCase();
    const desc = (item.description || '').toLowerCase();
    return (
      summary.startsWith('📋') ||
      summary.includes('[task]') ||
      (summary.includes('[t-') && !summary.includes('[target deadline]') && !summary.startsWith('🎯')) ||
      desc.includes('preparation task') ||
      desc.includes('reverse-engineered preparation task')
    );
  });

  let deletedCount = 0;
  const deletedTitles: string[] = [];

  for (const item of milestoneEvents) {
    try {
      await deleteGoogleCalendarEvent(accessToken, item.id);
      deletedCount++;
      deletedTitles.push(item.summary || 'Milestone Event');
    } catch (err) {
      console.warn(`Could not delete duplicate milestone calendar event ${item.id}:`, err);
    }
  }

  return { deletedCount, deletedTitles };
}

/**
 * Push an individual milestone reminder directly to Google Tasks
 */
export async function pushSingleMilestoneToGoogleCalendar(
  accessToken: string,
  eventTitle: string,
  milestone: TMinusMilestone,
  timeZone = 'Europe/Amsterdam',
  options?: SyncOptions & { createCalendarEventBlock?: boolean }
): Promise<{ calendarEvent?: GoogleCalendarEventItem; googleTaskId?: string }> {
  let createdCalEvent: GoogleCalendarEventItem | undefined;
  let createdTaskId: string | undefined;

  const dateOnly = extractDateOnly(milestone.calculatedDate);
  // Default to 'tasks_only' so tasks do NOT create duplicate calendar events
  const format: MilestoneSyncFormat = options?.milestoneFormat || (options?.createCalendarEventBlock ? 'timed' : 'tasks_only');

  // 1. Create as a Literal Google Task in Google Tasks API
  try {
    const taskRes = await createGoogleTask(accessToken, {
      title: `[${milestone.tMinusLabel}] ${milestone.title} (${eventTitle})`,
      notes: `T-Minus Preparation Task for "${eventTitle}"\nLead Time: ${milestone.tMinusLabel}\nDue Date: ${dateOnly}\nCategory: ${milestone.category}\nDetails: ${milestone.description || ''}`,
      due: `${dateOnly}T00:00:00.000Z`,
      taskListId: options?.taskListId || '@default',
    });
    createdTaskId = taskRes.id;
  } catch (tErr) {
    console.warn('Could not push to Google Tasks API:', tErr);
  }

  // 2. ONLY publish as an extra Calendar Event if explicitly requested (not 'tasks_only')
  if (format === 'all_day') {
    const nextDay = getNextDayDate(dateOnly);
    const calPayload = {
      summary: `📋 [TASK] [${milestone.tMinusLabel}] ${milestone.title}`,
      description: `T-Minus Preparation Task for "${eventTitle}".\n\nTask: ${milestone.title}\nDetails: ${milestone.description || ''}\nCategory: ${milestone.category}\nTarget Event Date: ${dateOnly}`,
      start: {
        date: dateOnly,
      },
      end: {
        date: nextDay,
      },
      transparency: 'transparent',
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'popup' as const, minutes: 540 },
        ],
      },
    };

    try {
      createdCalEvent = await createCalendarEvent(accessToken, calPayload);
    } catch (cErr) {
      console.error('Error creating all-day agenda task on Google Calendar:', cErr);
    }
  } else if (format === 'timed') {
    const { startDateTime, endDateTime } = formatStartEndDateTime(milestone.calculatedDate, '09:00', 30);

    const msBody = {
      summary: `📋 [${milestone.tMinusLabel} TASK] ${milestone.title} (${eventTitle})`,
      description: `T-Minus Preparation Task for "${eventTitle}".\n\nTask: ${milestone.title}\nDetails: ${milestone.description || ''}\nTag: ${milestone.category}\nDue Date: ${dateOnly}`,
      start: {
        dateTime: startDateTime,
        timeZone,
      },
      end: {
        dateTime: endDateTime,
        timeZone,
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'popup' as const, minutes: 0 },
          { method: 'popup' as const, minutes: 120 },
        ],
      },
    };

    try {
      createdCalEvent = await createCalendarEvent(accessToken, msBody);
    } catch (cErr) {
      console.error('Error creating timed calendar event for milestone:', cErr);
    }
  }

  return {
    calendarEvent: createdCalEvent,
    googleTaskId: createdTaskId,
  };
}

/**
 * Push an event and its calculated T-minus milestones into Google Calendar & Google Tasks
 * Model: 1 Target Deadline Event in Calendar + N Reverse-Engineered Tasks strictly in Google Tasks
 */
export async function syncEventToGoogleCalendar(
  accessToken: string,
  event: CalendarEvent,
  timeZone = 'Europe/Amsterdam',
  options?: SyncOptions
): Promise<SyncResult> {
  const result: SyncResult = {
    milestoneEventIds: [],
    googleTaskIds: [],
    totalTasksPushed: 0,
    totalSynced: 0,
  };

  // Default to 'tasks_only' so that milestones are created exclusively as Google Tasks,
  // preventing duplicate calendar event entries
  const format: MilestoneSyncFormat = options?.milestoneFormat || (options?.createCalendarBlocksForMilestones ? 'timed' : 'tasks_only');

  // 1. Create Main Event (The 1 Target Deadline on Google Calendar)
  const eventDateOnly = extractDateOnly(event.eventDate);
  const timeStr = event.eventTime || '19:00';
  const { startDateTime, endDateTime } = formatStartEndDateTime(eventDateOnly, timeStr, 120);

  const mainEventBody = {
    summary: `🎯 ${event.title} [TARGET DEADLINE]`,
    description: `Target Event organized with T-Minus Calendar Intelligence Agent.\nCategory: ${event.category}\n\nReverse-Engineered Preparation Tasks (in Google Tasks & Agenda):\n${
      event.milestones?.map((m) => `• ${m.tMinusLabel} (Due ${extractDateOnly(m.calculatedDate)}): ${m.title}`).join('\n') || 'None'
    }`,
    location: event.location || '',
    start: {
      dateTime: startDateTime,
      timeZone,
    },
    end: {
      dateTime: endDateTime,
      timeZone,
    },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup' as const, minutes: 60 },
        { method: 'popup' as const, minutes: 1440 }, // 1 day before
      ],
    },
  };

  try {
    const resMain = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(mainEventBody),
    });

    if (resMain.ok) {
      const createdMain = await resMain.json();
      result.mainEventId = createdMain.id;
      result.mainEventLink = createdMain.htmlLink;
      result.totalSynced += 1;
    } else {
      const errData = await resMain.json().catch(() => ({}));
      console.warn('Main event sync notice:', errData);
      result.error = errData.error?.message || `Failed to create main event (${resMain.status})`;
    }
  } catch (err: any) {
    console.error('Error creating main event on Google Calendar:', err);
    result.error = err.message || 'Network error creating main event';
  }

  // 2. Create All T-Minus Milestones as Tasks (Google Tasks + Agenda Items)
  const updatedMilestones: TMinusMilestone[] = [];

  if (event.milestones && event.milestones.length > 0) {
    for (const milestone of event.milestones) {
      const msDateOnly = extractDateOnly(milestone.calculatedDate);
      let msCalId: string | undefined = undefined;
      let msTaskId: string | undefined = undefined;

      // 2A. Push to Google Tasks API (Always created for Tasks app & sidebar)
      try {
        const taskItem = await createGoogleTask(accessToken, {
          title: `[${milestone.tMinusLabel}] ${milestone.title} (${event.title})`,
          notes: `T-Minus Task for "${event.title}"\nEvent Date: ${eventDateOnly}\nLead Time: ${milestone.tMinusLabel}\nDue Date: ${msDateOnly}\nCategory: ${milestone.category}\nAction: ${milestone.description || ''}`,
          due: `${msDateOnly}T00:00:00.000Z`,
          taskListId: options?.taskListId || '@default',
        });
        if (taskItem?.id) {
          msTaskId = taskItem.id;
          result.googleTaskIds.push(taskItem.id);
          result.totalTasksPushed += 1;
          result.totalSynced += 1;
        }
      } catch (gtErr) {
        console.warn('Notice pushing to Google Tasks API:', gtErr);
      }

      // 2B. Push to Google Calendar Agenda if requested (All-Day or Timed)
      if (format === 'all_day') {
        try {
          const nextDay = getNextDayDate(msDateOnly);
          const allDayBody = {
            summary: `📋 [TASK] [${milestone.tMinusLabel}] ${milestone.title} (${event.title})`,
            description: `T-Minus Preparation Task for "${event.title}".\n\nTask: ${milestone.title}\nDetails: ${milestone.description || ''}\nTag: ${milestone.category}\nDue Date: ${msDateOnly}`,
            start: {
              date: msDateOnly,
            },
            end: {
              date: nextDay,
            },
            transparency: 'transparent',
            reminders: {
              useDefault: false,
              overrides: [
                { method: 'popup' as const, minutes: 540 },
              ],
            },
          };

          const resMs = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(allDayBody),
          });

          if (resMs.ok) {
            const createdMs = await resMs.json();
            msCalId = createdMs.id;
            result.milestoneEventIds.push(createdMs.id);
          }
        } catch (msErr) {
          console.error('Error creating all-day milestone on Google Calendar:', msErr);
        }
      } else if (format === 'timed') {
        try {
          const { startDateTime: msStart, endDateTime: msEnd } = formatStartEndDateTime(msDateOnly, '09:00', 30);

          const msBody = {
            summary: `📋 [${milestone.tMinusLabel} TASK] ${milestone.title} (${event.title})`,
            description: `T-Minus Preparation Task for "${event.title}" (Event Date: ${eventDateOnly}).\n\nTask: ${milestone.title}\nDetails: ${milestone.description || ''}\nTag: ${milestone.category}\nDue Date: ${msDateOnly}`,
            start: {
              dateTime: msStart,
              timeZone,
            },
            end: {
              dateTime: msEnd,
              timeZone,
            },
            reminders: {
              useDefault: false,
              overrides: [
                { method: 'popup' as const, minutes: 0 },
                { method: 'popup' as const, minutes: 120 },
              ],
            },
          };

          const resMs = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(msBody),
          });

          if (resMs.ok) {
            const createdMs = await resMs.json();
            msCalId = createdMs.id;
            result.milestoneEventIds.push(createdMs.id);
          }
        } catch (msErr) {
          console.error('Error creating milestone block on Google Calendar:', msErr);
        }
      }

      updatedMilestones.push({
        ...milestone,
        googleCalendarEventId: msCalId || milestone.googleCalendarEventId,
        googleTaskId: msTaskId || milestone.googleTaskId,
      });
    }
  }

  // Construct updated event payload with IDs
  result.updatedEvent = {
    ...event,
    googleEventId: result.mainEventId || event.googleEventId,
    googleEventLink: result.mainEventLink || event.googleEventLink,
    syncedToGoogleAt: new Date().toISOString(),
    googleMilestoneCount: updatedMilestones.length,
    milestones: updatedMilestones.length > 0 ? updatedMilestones : event.milestones,
  };

  return result;
}

/**
 * Delete an entire event and all its associated preparation tasks from Google Calendar and Google Tasks.
 * This cleans up target deadlines, all-day task blocks, and Google Tasks items so the agenda remains clean.
 */
export async function deleteEventFromGoogleCalendar(
  accessToken: string,
  event: CalendarEvent
): Promise<{ deletedCalendarEvents: number; deletedTasks: number; success: boolean }> {
  let deletedCalendarEvents = 0;
  let deletedTasks = 0;

  // 1. Delete main event by stored ID
  if (event.googleEventId) {
    try {
      await deleteGoogleCalendarEvent(accessToken, event.googleEventId);
      deletedCalendarEvents++;
    } catch (e) {
      console.warn('Could not delete main event by direct ID:', e);
    }
  }

  // 2. Delete milestones by stored calendar IDs and task IDs
  if (event.milestones && event.milestones.length > 0) {
    for (const ms of event.milestones) {
      if (ms.googleCalendarEventId) {
        try {
          await deleteGoogleCalendarEvent(accessToken, ms.googleCalendarEventId);
          deletedCalendarEvents++;
        } catch (e) {
          console.warn('Could not delete milestone calendar event by direct ID:', e);
        }
      }
      if (ms.googleTaskId) {
        try {
          await deleteGoogleTask(accessToken, ms.googleTaskId);
          deletedTasks++;
        } catch (e) {
          console.warn('Could not delete google task by direct ID:', e);
        }
      }
    }
  }

  // 3. Fallback / thorough scan: query calendar for any matching items with this event title
  // to guarantee no lingering preparation milestones remain on the user's agenda
  try {
    const searchUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events?q=${encodeURIComponent(
      event.title
    )}&maxResults=50`;
    const res = await fetch(searchUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });
    if (res.ok) {
      const data = await res.json();
      const items: GoogleCalendarEventItem[] = data.items || [];
      for (const item of items) {
        const sum = (item.summary || '').toLowerCase();
        const desc = (item.description || '').toLowerCase();
        const eventTitleLower = event.title.toLowerCase();

        if (
          (sum.includes(eventTitleLower) || desc.includes(eventTitleLower)) &&
          (sum.includes('🎯') || sum.includes('[task]') || sum.includes('[t-') || desc.includes('t-minus'))
        ) {
          try {
            await deleteGoogleCalendarEvent(accessToken, item.id);
            deletedCalendarEvents++;
          } catch (delErr) {
            console.warn('Could not delete matched calendar item:', delErr);
          }
        }
      }
    }
  } catch (searchErr) {
    console.warn('Notice scanning calendar for matching items:', searchErr);
  }

  // 4. Scan Google Tasks for any tasks containing `(${event.title})`
  try {
    const tasks = await fetchGoogleTasks(accessToken, '@default', 100);
    for (const t of tasks) {
      if (t.title && t.title.toLowerCase().includes(`(${event.title.toLowerCase()})`)) {
        try {
          await deleteGoogleTask(accessToken, t.id);
          deletedTasks++;
        } catch (delTaskErr) {
          console.warn('Could not delete matched Google Task:', delTaskErr);
        }
      }
    }
  } catch (taskScanErr) {
    console.warn('Notice scanning tasks for matching items:', taskScanErr);
  }

  return {
    deletedCalendarEvents,
    deletedTasks,
    success: true,
  };
}

/**
 * Delete an individual preparation milestone from Google Calendar & Google Tasks
 */
export async function deleteSingleMilestoneFromGoogleCalendar(
  accessToken: string,
  milestone: TMinusMilestone,
  eventTitle?: string
): Promise<boolean> {
  let deleted = false;
  if (milestone.googleCalendarEventId) {
    try {
      await deleteGoogleCalendarEvent(accessToken, milestone.googleCalendarEventId);
      deleted = true;
    } catch (e) {
      console.warn('Could not delete single milestone by ID:', e);
    }
  }
  if (milestone.googleTaskId) {
    try {
      await deleteGoogleTask(accessToken, milestone.googleTaskId);
      deleted = true;
    } catch (e) {
      console.warn('Could not delete single task by ID:', e);
    }
  }

  // Scan calendar for matching task name if no ID was stored
  if (!deleted && milestone.title) {
    try {
      const searchUrl = `https://www.googleapis.com/calendar/v3/calendars/primary/events?q=${encodeURIComponent(
        milestone.title
      )}&maxResults=20`;
      const res = await fetch(searchUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });
      if (res.ok) {
        const data = await res.json();
        const items: GoogleCalendarEventItem[] = data.items || [];
        for (const item of items) {
          if (item.summary?.includes(milestone.title)) {
            await deleteGoogleCalendarEvent(accessToken, item.id);
            deleted = true;
          }
        }
      }
    } catch {}
  }

  return deleted;
}

/**
 * Patch an existing Google Calendar event
 */
export async function patchGoogleCalendarEvent(
  accessToken: string,
  eventId: string,
  patchData: Partial<{
    summary: string;
    description: string;
    colorId: string;
  }>
): Promise<GoogleCalendarEventItem> {
  const response = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(patchData),
    }
  );

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error?.message || `Failed to update calendar event (${response.status})`);
  }

  return response.json();
}

/**
 * Push local completion toggle to Google Tasks and Google Calendar
 */
export async function updateMilestoneCompletionOnGoogle(
  accessToken: string,
  eventTitle: string,
  milestone: TMinusMilestone,
  newStatus: 'completed' | 'pending'
): Promise<{ success: boolean; googleTaskUpdated?: boolean; calendarUpdated?: boolean }> {
  let googleTaskUpdated = false;
  let calendarUpdated = false;

  // 1. Update Google Task
  if (milestone.googleTaskId) {
    try {
      await updateGoogleTaskStatus(
        accessToken,
        milestone.googleTaskId,
        newStatus === 'completed' ? 'completed' : 'needsAction'
      );
      googleTaskUpdated = true;
    } catch (tErr) {
      console.warn('Could not update Google Task completion status:', tErr);
    }
  }

  // 2. If no googleTaskId was stored, search Google Tasks for a matching title
  if (!googleTaskUpdated && milestone.title) {
    try {
      const allTasks = await fetchGoogleTasks(accessToken, '@default', 50);
      const matched = allTasks.find(
        (t) =>
          t.title.toLowerCase().includes(milestone.title.toLowerCase()) &&
          (t.title.toLowerCase().includes(milestone.tMinusLabel.toLowerCase()) ||
            t.title.toLowerCase().includes(eventTitle.toLowerCase()))
      );
      if (matched) {
        await updateGoogleTaskStatus(
          accessToken,
          matched.id,
          newStatus === 'completed' ? 'completed' : 'needsAction'
        );
        googleTaskUpdated = true;
      }
    } catch (searchErr) {
      console.warn('Could not find task in Google Tasks to update:', searchErr);
    }
  }

  // 3. Update Calendar Block if it exists
  if (milestone.googleCalendarEventId) {
    try {
      const prefix = newStatus === 'completed' ? '✅ ' : '📋 ';
      const cleanTitle = milestone.title.replace(/^✅\s*/, '').replace(/^📋\s*/, '');
      await patchGoogleCalendarEvent(accessToken, milestone.googleCalendarEventId, {
        summary: `${prefix}[TASK] [${milestone.tMinusLabel}] ${cleanTitle}`,
      });
      calendarUpdated = true;
    } catch (cErr) {
      console.warn('Could not update Google Calendar event summary on completion:', cErr);
    }
  }

  return {
    success: googleTaskUpdated || calendarUpdated,
    googleTaskUpdated,
    calendarUpdated,
  };
}

