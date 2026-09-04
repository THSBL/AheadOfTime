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
  extendedProperties?: {
    private?: Record<string, string>;
    shared?: Record<string, string>;
  };
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
  const min = timeMin || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
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
 * Format RFC3339 start and end dateTimes cleanly
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
  milestoneFormat?: MilestoneSyncFormat;
  createCalendarBlocksForMilestones?: boolean;
  taskListId?: string;
}

/**
 * Push an individual milestone reminder directly to Google Tasks (and optionally Google Calendar)
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
  const shouldCreateCalBlock = options?.createCalendarEventBlock || options?.milestoneFormat === 'timed' || options?.milestoneFormat === 'all_day';

  // 1. Create in Google Tasks (native Google Calendar task layer)
  try {
    const taskRes = await createGoogleTask(accessToken, {
      title: `[${milestone.tMinusLabel}] ${milestone.title} (${eventTitle})`,
      notes: `AheadOfTime Milestone for "${eventTitle}"\nLead Time: ${milestone.tMinusLabel}\nDue Date: ${dateOnly}\nCategory: ${milestone.category}\nDetails: ${milestone.description || ''}`,
      due: `${dateOnly}T00:00:00.000Z`,
      taskListId: options?.taskListId || '@default',
    });
    createdTaskId = taskRes.id;
  } catch (tErr) {
    console.warn('Could not push to Google Tasks API:', tErr);
  }

  // 2. Optionally create Calendar Event block if requested
  if (shouldCreateCalBlock) {
    const nextDay = getNextDayDate(dateOnly);
    const isTimed = options?.milestoneFormat === 'timed';
    const calPayload = {
      summary: `📋 [${milestone.tMinusLabel}] ${milestone.title}`,
      description: `Preparation milestone for "${eventTitle}".\n\nLead Time: ${milestone.tMinusLabel}\nCategory: ${milestone.category}\nAction Required: ${milestone.description || 'Complete advance preparation.'}\nTarget Event Date: ${dateOnly}`,
      start: isTimed 
        ? { dateTime: formatStartEndDateTime(dateOnly, '09:00', 30).startDateTime, timeZone }
        : { date: dateOnly },
      end: isTimed 
        ? { dateTime: formatStartEndDateTime(dateOnly, '09:00', 30).endDateTime, timeZone }
        : { date: nextDay },
      transparency: 'transparent',
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'popup' as const, minutes: 540 },
        ],
      },
    };

    try {
      const res = await fetch(
        'https://www.googleapis.com/calendar/v3/calendars/primary/events',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(calPayload),
        }
      );

      if (res.ok) {
        createdCalEvent = await res.json();
      }
    } catch (cErr) {
      console.error('Error creating calendar block for milestone:', cErr);
    }
  }

  return {
    calendarEvent: createdCalEvent,
    googleTaskId: createdTaskId,
  };
}

/**
 * Push an event and its calculated T-minus milestones into Google Calendar & Google Tasks
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

  const createCalBlocks = options?.createCalendarBlocksForMilestones || options?.milestoneFormat === 'all_day' || options?.milestoneFormat === 'timed';

  // 1. Create or verify Main Event on the Primary Calendar
  const eventDateOnly = extractDateOnly(event.eventDate);
  const timeStr = event.eventTime || '19:00';
  const { startDateTime, endDateTime } = formatStartEndDateTime(eventDateOnly, timeStr, 120);

  if (event.googleEventId && !event.googleEventId.startsWith('local_')) {
    result.mainEventId = event.googleEventId;
    result.mainEventLink = event.googleEventLink;
  } else {
    const mainEventBody = {
      summary: `🎯 ${event.title}`,
      description: `Target Event organized with Ahead Of Time.\nCategory: ${event.category}\n\nPreparation Countdown:\n${
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
          { method: 'popup' as const, minutes: 1440 },
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
        result.error = errData.error?.message || `Failed to create main event (${resMain.status})`;
      }
    } catch (err: any) {
      console.error('Error creating main event on Google Calendar:', err);
      result.error = err.message || 'Network error creating main event';
    }
  }

  // 2. Create All T-Minus Milestones as Google Tasks (and optionally calendar blocks)
  const updatedMilestones: TMinusMilestone[] = [];

  if (event.milestones && event.milestones.length > 0) {
    for (const milestone of event.milestones) {
      const msDateOnly = extractDateOnly(milestone.calculatedDate);
      let msCalId: string | undefined = undefined;
      let msTaskId: string | undefined = undefined;

      // Push to Google Tasks API (standard Google Calendar tasks sub-layer)
      try {
        const taskItem = await createGoogleTask(accessToken, {
          title: `[${milestone.tMinusLabel}] ${milestone.title} (${event.title})`,
          notes: `AheadOfTime Milestone for "${event.title}"\nEvent Date: ${eventDateOnly}\nLead Time: ${milestone.tMinusLabel}\nDue Date: ${msDateOnly}\nCategory: ${milestone.category}\nAction: ${milestone.description || ''}`,
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

      // If calendar event blocks requested, create on primary calendar
      if (createCalBlocks) {
        try {
          const nextDay = getNextDayDate(msDateOnly);
          const isTimed = options?.milestoneFormat === 'timed';
          const timedData = isTimed ? formatStartEndDateTime(msDateOnly, '09:00', 30) : null;

          const calBody = {
            summary: `📋 [${milestone.tMinusLabel}] ${milestone.title}`,
            description: `Preparation milestone for "${event.title}".\n\nLead Time: ${milestone.tMinusLabel}\nCategory: ${milestone.category}\nTask: ${milestone.title}\nDetails: ${milestone.description || ''}\nTarget Event: ${event.title} (${eventDateOnly})`,
            start: isTimed ? { dateTime: timedData?.startDateTime, timeZone } : { date: msDateOnly },
            end: isTimed ? { dateTime: timedData?.endDateTime, timeZone } : { date: nextDay },
            transparency: 'transparent',
            reminders: {
              useDefault: false,
              overrides: [
                { method: 'popup' as const, minutes: 540 },
              ],
            },
          };

          const resMs = await fetch(
            'https://www.googleapis.com/calendar/v3/calendars/primary/events',
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(calBody),
            }
          );

          if (resMs.ok) {
            const createdMs = await resMs.json();
            msCalId = createdMs.id;
            result.milestoneEventIds.push(createdMs.id);
          }
        } catch (msErr) {
          console.error('Error creating milestone calendar event:', msErr);
        }
      }

      updatedMilestones.push({
        ...milestone,
        googleCalendarEventId: msCalId || milestone.googleCalendarEventId,
        googleTaskId: msTaskId || milestone.googleTaskId,
      });
    }
  }

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
 * Delete an event and/or its associated preparation tasks from Google Calendar and Google Tasks.
 */
export async function deleteEventFromGoogleCalendar(
  accessToken: string,
  event: CalendarEvent,
  options: { deleteMainEvent?: boolean; deleteTasks?: boolean } = { deleteMainEvent: true, deleteTasks: true }
): Promise<{ deletedCalendarEvents: number; deletedTasks: number; success: boolean }> {
  let deletedCalendarEvents = 0;
  let deletedTasks = 0;

  const shouldDeleteMain = options.deleteMainEvent !== false;
  const shouldDeleteTasks = options.deleteTasks !== false;

  // 1. Delete main event by stored ID if requested
  if (shouldDeleteMain && event.googleEventId && !event.googleEventId.startsWith('local_')) {
    try {
      await deleteGoogleCalendarEvent(accessToken, event.googleEventId);
      deletedCalendarEvents++;
    } catch (e) {
      console.warn('Could not delete main event by direct ID:', e);
    }
  }

  // 2. Delete milestones by stored calendar IDs and task IDs if requested
  if (shouldDeleteTasks && event.milestones && event.milestones.length > 0) {
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

  // 3. Fallback scan: query Google Tasks for any tasks containing `(${event.title})` if tasks requested
  if (shouldDeleteTasks) {
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
  }

  return {
    deletedCalendarEvents,
    deletedTasks,
    success: true,
  };
}

/**
 * Safe Plan Deletion with granular flags
 */
export async function executeSafePlanDeletion(
  accessToken: string,
  event: CalendarEvent,
  options: { deleteFromPrimaryCalendar?: boolean; deleteMainEvent?: boolean; deleteTasks?: boolean }
): Promise<{ deletedTasksCount: number; deletedPrimaryEvent: boolean; success: boolean }> {
  const deleteMain = options.deleteMainEvent ?? options.deleteFromPrimaryCalendar ?? false;
  const deleteTasks = options.deleteTasks ?? true;
  const result = await deleteEventFromGoogleCalendar(accessToken, event, {
    deleteMainEvent: deleteMain,
    deleteTasks: deleteTasks,
  });
  return {
    deletedTasksCount: result.deletedTasks,
    deletedPrimaryEvent: result.deletedCalendarEvents > 0,
    success: result.success,
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

/**
 * Clean up legacy or duplicate milestone calendar events on the primary calendar
 * (so prep tasks live purely as Google Tasks)
 */
export async function wipeMilestoneCalendarEventsOnly(
  accessToken: string
): Promise<{ deletedCount: number }> {
  try {
    const listUrl = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
    listUrl.searchParams.set('maxResults', '250');
    listUrl.searchParams.set('q', '[TASK]');

    const res = await fetch(listUrl.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!res.ok) {
      return { deletedCount: 0 };
    }

    const data = await res.json();
    const items: GoogleCalendarEventItem[] = data.items || [];
    let deletedCount = 0;

    for (const item of items) {
      const isTaskEvent =
        item.summary?.startsWith('[TASK]') ||
        item.extendedProperties?.private?.aot_is_milestone === 'true' ||
        item.extendedProperties?.private?.aot_type === 'milestone';

      if (isTaskEvent && item.id) {
        try {
          await deleteGoogleCalendarEvent(accessToken, item.id);
          deletedCount++;
        } catch (delErr) {
          console.warn('Failed to delete milestone event block:', item.id, delErr);
        }
      }
    }

    return { deletedCount };
  } catch (err) {
    console.error('Error wiping milestone calendar events:', err);
    return { deletedCount: 0 };
  }
}


