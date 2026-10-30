import { CalendarEvent, TMinusMilestone } from '../types.js';
import { createGoogleTask, deleteGoogleTask, fetchGoogleTasks, updateGoogleTaskStatus, GoogleTaskItem } from './googleTasks.js';
import { extractDateOnly, formatStartEndDateTime, formatMilestoneCalendarTitle } from '../utils/googleSyncFormat.js';
import { fixedMoments } from '../utils/planLink.js';
import { eventFingerprint, planSyncStatus, shownSteps, stepFingerprint, syncedSteps } from '../utils/googleSyncPlan.js';
// Re-exported so existing importers of these helpers keep working; the implementations
// live in utils/googleSyncFormat.ts so the server's background push can share them.
export { extractDateOnly, formatStartEndDateTime, formatMilestoneCalendarTitle };

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
  /** Number of items (main event + milestones) newly created this call, as opposed to already-synced items that were left untouched. */
  newItemsCount: number;
  /** Items already in Google that this sync brought up to date. */
  updatedItemsCount?: number;
  /** Items this sync took out of Google (no longer in the plan). */
  removedItemsCount?: number;
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

export type MilestoneSyncFormat = 'tasks_only' | 'all_day' | 'timed';

export interface SyncOptions {
  milestoneFormat?: MilestoneSyncFormat;
  createCalendarBlocksForMilestones?: boolean;
  taskListId?: string;
  /** 'timed' reminders: start (HH:mm) and length, the user's choice (PushPlanSheet). */
  reminderTime?: string;
  reminderMinutes?: number;
}

const MILESTONE_SYNC_FORMAT_KEY = 'aot_milestone_sync_format';

/**
 * User-facing preference for how prep milestones show up in Google:
 * as checkable Google Tasks (recommended - they don't compete for space on
 * the calendar grid) or as 30-minute timed Calendar Events. Every push call
 * used to hardcode 'tasks_only' with no way for a user to choose otherwise,
 * even though buildMilestoneCalendarPayload already fully supports a timed
 * block - this just exposes that existing capability as a real preference.
 */
export function getMilestoneSyncFormat(): MilestoneSyncFormat {
  if (typeof window === 'undefined') return 'tasks_only';
  const stored = localStorage.getItem(MILESTONE_SYNC_FORMAT_KEY);
  return stored === 'timed' || stored === 'all_day' ? stored : 'tasks_only';
}

export function setMilestoneSyncFormat(format: MilestoneSyncFormat): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(MILESTONE_SYNC_FORMAT_KEY, format);
  }
}

/**
 * Builds Google Calendar event payload for milestone synchronization
 * Summary: Concrete Milestone title (e.g. Slide deck finalized · NY Client Trip · 12/10)
 * Description: Actionable Markdown/plaintext checklist of all deliverables
 */
export function buildMilestoneCalendarPayload(
  milestone: TMinusMilestone,
  eventTitle: string,
  dateOnly: string,
  timeZone: string,
  isTimed: boolean = false,
  reminderTime: string = '09:00',
  reminderMinutes: number = 30
) {
  const cleanTitle = milestone.title.replace(/^AheadOfTime:\s*/i, '').trim();
  const isOverdue = milestone.status === 'pending' && new Date(`${dateOnly}T23:59:59`) < new Date();
  const summary = formatMilestoneCalendarTitle(milestone.title, eventTitle, dateOnly, {
    isOverdue,
    isCompleted: milestone.status === 'completed',
  });

  let checklistItems = '';
  if (milestone.deliverables && milestone.deliverables.length > 0) {
    checklistItems = milestone.deliverables
      .map(d => `[${d.is_completed ? 'x' : ' '}] ${d.title}`)
      .join('\n');
  } else if (milestone.description && milestone.description.trim()) {
    checklistItems = `[ ] ${milestone.description.trim()}`;
  } else {
    checklistItems = `[ ] ${cleanTitle}`;
  }

  const description = `Checklist for ${eventTitle}:\n${checklistItems}\n\n--\nPlanned with Ahead Of Time`;
  const nextDay = getNextDayDate(dateOnly);
  const timedData = isTimed ? formatStartEndDateTime(dateOnly, reminderTime, reminderMinutes) : null;

  return {
    summary,
    description,
    start: isTimed ? { dateTime: timedData?.startDateTime, timeZone } : { date: dateOnly },
    end: isTimed ? { dateTime: timedData?.endDateTime, timeZone } : { date: nextDay },
    // A timed reminder is time the user set aside: it shows as busy.
    transparency: isTimed ? 'opaque' : 'transparent',
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup' as const, minutes: isTimed ? 10 : 540 },
      ],
    },
    // Lets a milestone event be identified reliably (e.g. by
    // wipeMilestoneCalendarEventsOnly below) regardless of whatever text is
    // currently in the title - the title format is free to change without
    // breaking anything that depends on "is this one of ours."
    extendedProperties: {
      private: {
        aot_is_milestone: 'true',
      },
    },
  };
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
  const cleanTitle = milestone.title.replace(/^AheadOfTime:\s*/i, '').trim();
  let taskChecklist = '';
  if (milestone.deliverables && milestone.deliverables.length > 0) {
    taskChecklist = milestone.deliverables
      .map(d => `[${d.is_completed ? 'x' : ' '}] ${d.title}`)
      .join('\n');
  } else if (milestone.description && milestone.description.trim()) {
    taskChecklist = `[ ] ${milestone.description.trim()}`;
  } else {
    taskChecklist = `[ ] ${cleanTitle}`;
  }

  const taskNotes = `Checklist for ${eventTitle}:\n${taskChecklist}\n\n--\nPlanned with Ahead Of Time`;

  const isOverdue = milestone.status === 'pending' && new Date(`${dateOnly}T23:59:59`) < new Date();
  // Timed reminders replace the task: the user chose events, not tasks.
  if (options?.milestoneFormat !== 'timed') try {
    const taskRes = await createGoogleTask(accessToken, {
      title: formatMilestoneCalendarTitle(milestone.title, eventTitle, dateOnly, {
        isOverdue,
        isCompleted: milestone.status === 'completed',
      }),
      notes: taskNotes,
      due: `${dateOnly}T00:00:00.000Z`,
      taskListId: options?.taskListId || '@default',
    });
    createdTaskId = taskRes.id;
  } catch (tErr) {
    console.warn('Could not push to Google Tasks API:', tErr);
  }

  // 2. Optionally create Calendar Event block if requested
  if (shouldCreateCalBlock) {
    const isTimed = options?.milestoneFormat === 'timed';
    const calPayload = buildMilestoneCalendarPayload(
      milestone,
      eventTitle,
      dateOnly,
      timeZone,
      isTimed,
      options?.reminderTime,
      options?.reminderMinutes
    );

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

const GCAL_EVENTS = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

/** A Calendar API call; null when the item is gone from Google (deleted there). */
async function gcalRequest(accessToken: string, method: 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<any | null> {
  const res = await fetch(`${GCAL_EVENTS}${path}`, {
    method,
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 404 || res.status === 410) return null;
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error?.message || `Google Calendar error (${res.status})`);
  }
  return method === 'DELETE' ? {} : res.json();
}

/** Brings a Google Task in line with its step; null when it's gone from Google. */
async function patchGoogleTask(
  accessToken: string,
  taskId: string,
  task: { title: string; notes: string; due: string; done: boolean },
  taskListId = '@default'
): Promise<any | null> {
  const res = await fetch(`https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(taskListId)}/tasks/${encodeURIComponent(taskId)}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: task.title,
      notes: task.notes,
      due: task.due,
      status: task.done ? 'completed' : 'needsAction',
      completed: task.done ? new Date().toISOString() : null,
    }),
  });
  if (res.status === 404 || res.status === 410) return null;
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error?.message || `Failed to update the task in Google Tasks (${res.status})`);
  }
  const updated = await res.json();
  // A task deleted in Google can still answer, marked deleted: treat it as gone.
  return updated?.deleted ? null : updated;
}

function stepTask(milestone: TMinusMilestone, eventTitle: string) {
  const date = extractDateOnly(milestone.calculatedDate);
  const cleanTitle = milestone.title.replace(/^AheadOfTime:\s*/i, '').trim();
  const checklist =
    milestone.deliverables && milestone.deliverables.length > 0
      ? milestone.deliverables.map((d) => `[${d.is_completed ? 'x' : ' '}] ${d.title}`).join('\n')
      : milestone.description && milestone.description.trim()
        ? `[ ] ${milestone.description.trim()}`
        : `[ ] ${cleanTitle}`;
  return {
    title: formatMilestoneCalendarTitle(milestone.title, eventTitle, date, {
      isOverdue: milestone.status === 'pending' && new Date(`${date}T23:59:59`) < new Date(),
      isCompleted: milestone.status === 'completed',
    }),
    notes: `Checklist for ${eventTitle}:\n${checklist}\n\n--\nPlanned with Ahead Of Time`,
    due: `${date}T00:00:00.000Z`,
    done: milestone.status === 'completed',
  };
}

/** A step's own copy in Google from before the plan kept a record: "Step · Plan title · DD/MM". */
function isLegacyStepCopy(title: string | undefined, eventTitle: string): boolean {
  if (!title || !eventTitle) return false;
  const t = title.replace(/^(?:✅|⚠)\s*/, '');
  const escaped = eventTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(` · ${escaped}( · \\d{2}/\\d{2})?$`).test(t);
}

/**
 * Plans pushed before they kept a record of their Google copies lost track
 * of them when a correction replaced the steps. Once, those old copies are
 * found by the plan's title and removed, so the plan's current steps
 * replace them instead of adding duplicates next to them.
 */
async function removeLegacyStepCopies(accessToken: string, event: CalendarEvent, keep: Set<string>, taskListId = '@default'): Promise<number> {
  let removed = 0;
  try {
    const tasks = await fetchGoogleTasks(accessToken, taskListId, 100);
    for (const t of tasks) {
      if (keep.has(t.id) || !isLegacyStepCopy(t.title, event.title)) continue;
      await deleteGoogleTask(accessToken, t.id, taskListId).then(() => (removed += 1)).catch(() => undefined);
    }
  } catch (err) {
    console.warn('Could not look for older copies in Google Tasks:', err);
  }
  try {
    const dates = (event.milestones || []).map((m) => extractDateOnly(m.calculatedDate)).filter(Boolean).sort();
    const from = new Date(Date.parse(`${dates[0] || event.eventDate}T00:00:00Z`) - 120 * 86_400_000).toISOString();
    const to = new Date(Date.parse(`${event.endDate || event.eventDate}T00:00:00Z`) + 30 * 86_400_000).toISOString();
    const params = new URLSearchParams({ privateExtendedProperty: 'aot_is_milestone=true', timeMin: from, timeMax: to, singleEvents: 'true', maxResults: '250' });
    const res = await fetch(`${GCAL_EVENTS}?${params}`, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (res.ok) {
      const items: Array<{ id: string; summary?: string }> = (await res.json()).items || [];
      for (const e of items) {
        if (keep.has(e.id) || !isLegacyStepCopy(e.summary, event.title)) continue;
        await gcalRequest(accessToken, 'DELETE', `/${encodeURIComponent(e.id)}`).then(() => (removed += 1)).catch(() => undefined);
      }
    }
  } catch (err) {
    console.warn('Could not look for older copies in Google Calendar:', err);
  }
  return removed;
}

function mainEventBody(event: CalendarEvent, title: string, timeZone: string) {
  const { startDateTime, endDateTime } = formatStartEndDateTime(extractDateOnly(event.eventDate), event.eventTime || '19:00', 120);
  return {
    summary: `🎯 ${title}`,
    description: `Target Event organized with Ahead Of Time.\nCategory: ${event.category}\n\nPreparation Countdown:\n${
      shownSteps(event).map((m) => `• ${m.tMinusLabel} (Due ${extractDateOnly(m.calculatedDate)}): ${m.title}`).join('\n') || 'None'
    }`,
    location: event.location || '',
    start: { dateTime: startDateTime, timeZone },
    end: { dateTime: endDateTime, timeZone },
  };
}

function returnEventBody(moment: { title: string; date: string; time?: string }, location: string, timeZone: string) {
  const timed = moment.time ? formatStartEndDateTime(moment.date, moment.time, 60) : null;
  return {
    summary: `🎯 ${moment.title}`,
    description: 'Planned with Ahead Of Time',
    location,
    start: timed ? { dateTime: timed.startDateTime, timeZone } : { date: moment.date },
    end: timed ? { dateTime: timed.endDateTime, timeZone } : { date: getNextDayDate(moment.date) },
  };
}

/**
 * Brings one plan's Google Calendar and Google Tasks in line with the plan:
 * the event itself (and a trip's return), then every shown step - added
 * when new, updated when its title, date, ideas or done changed (or the
 * way steps show changed: tasks or timed reminders), removed when it's no
 * longer in the plan. What went in is recorded on the plan (googleSynced),
 * so a correction that replaces the steps still updates the same Google
 * copies instead of adding new ones next to them.
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
    newItemsCount: 0,
    updatedItemsCount: 0,
    removedItemsCount: 0,
  };
  const format: MilestoneSyncFormat = options?.milestoneFormat || 'tasks_only';
  const wantTask = format !== 'timed';
  const wantEvent = Boolean(options?.createCalendarBlocksForMilestones) || format === 'all_day' || format === 'timed';
  const style = format === 'timed' ? { format, time: options?.reminderTime || '09:00', minutes: options?.reminderMinutes || 30 } : { format };
  const styleChanged = Boolean(event.googleSyncStyle) && JSON.stringify(event.googleSyncStyle) !== JSON.stringify(style);
  const taskListId = options?.taskListId || '@default';
  const status = planSyncStatus(event, style);

  // 1. The plan's own events. A trip: its departure here, its return below.
  const moments = fixedMoments(event);
  const eventHash = eventFingerprint(event);
  const eventChanged = !event.googleEventHash || event.googleEventHash !== eventHash;
  let mainEventId = event.googleEventId && !event.googleEventId.startsWith('local_') ? event.googleEventId : undefined;
  let mainEventLink = event.googleEventLink;
  const mainBody = mainEventBody(event, moments[0]?.title || event.title, timeZone);
  // Only the app's own pushes are kept in step: an event imported by Scan
  // agenda belongs to the user's calendar as it is.
  let ownsEvent = Boolean(event.googleEventHash) || (Boolean(event.syncedToGoogleAt) && Boolean(event.googleMilestoneCount));
  if (mainEventId && ownsEvent && eventChanged) {
    try {
      const patched = await gcalRequest(accessToken, 'PATCH', `/${encodeURIComponent(mainEventId)}`, mainBody);
      if (patched) {
        if (event.googleEventHash) result.updatedItemsCount = (result.updatedItemsCount || 0) + 1;
      } else {
        mainEventId = undefined;
      }
    } catch (err) {
      console.warn('Could not update the event in Google Calendar:', err);
    }
  }
  if (!mainEventId) {
    try {
      const created = await gcalRequest(accessToken, 'POST', '', {
        ...mainBody,
        reminders: { useDefault: false, overrides: [{ method: 'popup' as const, minutes: 60 }, { method: 'popup' as const, minutes: 1440 }] },
      });
      mainEventId = created?.id;
      mainEventLink = created?.htmlLink;
      ownsEvent = Boolean(mainEventId);
      result.totalSynced += 1;
      result.newItemsCount += 1;
    } catch (err: any) {
      console.error('Error creating main event on Google Calendar:', err);
      result.error = err?.message || 'Could not create the event in Google Calendar';
    }
  }
  result.mainEventId = mainEventId;
  result.mainEventLink = mainEventLink;

  const returnMoment = moments.find((m) => m.key === 'return');
  let returnEventId = event.googleReturnEventId;
  try {
    if (returnEventId && !returnMoment) {
      await gcalRequest(accessToken, 'DELETE', `/${encodeURIComponent(returnEventId)}`);
      returnEventId = undefined;
      result.removedItemsCount = (result.removedItemsCount || 0) + 1;
    } else if (returnMoment) {
      const body = returnEventBody(returnMoment, event.location || '', timeZone);
      if (returnEventId && eventChanged) {
        if (!(await gcalRequest(accessToken, 'PATCH', `/${encodeURIComponent(returnEventId)}`, body))) returnEventId = undefined;
      }
      if (!returnEventId) {
        const created = await gcalRequest(accessToken, 'POST', '', { ...body, reminders: { useDefault: false, overrides: [{ method: 'popup' as const, minutes: 1440 }] } });
        returnEventId = created?.id;
        result.totalSynced += 1;
        result.newItemsCount += 1;
      }
    }
  } catch (err) {
    console.error('Error syncing the return event on Google Calendar:', err);
  }

  // 2. Steps no longer in the plan (removed, hidden, skipped, or replaced by
  // a correction) come out of Google.
  const record = syncedSteps(event);
  const shown = shownSteps(event);
  const shownIds = new Set(shown.map((m) => m.id));
  for (const id of Object.keys(record)) {
    if (shownIds.has(id)) continue;
    const entry = record[id];
    if (entry.task) await deleteGoogleTask(accessToken, entry.task, taskListId).catch(() => undefined);
    if (entry.event) await gcalRequest(accessToken, 'DELETE', `/${encodeURIComponent(entry.event)}`).catch(() => undefined);
    if (entry.task || entry.event) result.removedItemsCount = (result.removedItemsCount || 0) + 1;
    delete record[id];
  }
  if (status.legacyCleanup) {
    const keep = new Set(Object.values(record).flatMap((e) => [e.task, e.event].filter(Boolean) as string[]));
    result.removedItemsCount = (result.removedItemsCount || 0) + (await removeLegacyStepCopies(accessToken, event, keep, taskListId));
  }

  // 3. Every shown step: added, updated or left as it is.
  for (const milestone of shown) {
    const entry = { ...record[milestone.id] };
    const hash = stepFingerprint(milestone, event.title);
    // Pushed before fingerprints existed: brought up to date once.
    const changed = !entry.hash || entry.hash !== hash || styleChanged;
    let added = false;
    let updated = false;
    const task = stepTask(milestone, event.title);

    try {
      if (wantTask) {
        if (entry.task && changed) {
          if (await patchGoogleTask(accessToken, entry.task, task, taskListId)) updated = true;
          else entry.task = undefined;
        }
        if (!entry.task) {
          const created = await createGoogleTask(accessToken, { title: task.title, notes: task.notes, due: task.due, taskListId });
          if (created?.id) {
            entry.task = created.id;
            if (task.done) await updateGoogleTaskStatus(accessToken, created.id, 'completed', taskListId).catch(() => undefined);
            result.googleTaskIds.push(created.id);
            result.totalTasksPushed += 1;
            added = true;
          }
        }
      } else if (entry.task) {
        // Shown as timed reminders now: the task goes.
        await deleteGoogleTask(accessToken, entry.task, taskListId).catch(() => undefined);
        entry.task = undefined;
        updated = true;
      }
    } catch (err) {
      console.warn('Notice syncing a step to Google Tasks:', err);
    }

    try {
      if (wantEvent) {
        const body = buildMilestoneCalendarPayload(
          milestone,
          event.title,
          extractDateOnly(milestone.calculatedDate),
          timeZone,
          format === 'timed',
          options?.reminderTime,
          options?.reminderMinutes
        );
        if (entry.event && changed) {
          if (await gcalRequest(accessToken, 'PATCH', `/${encodeURIComponent(entry.event)}`, body)) updated = true;
          else entry.event = undefined;
        }
        if (!entry.event) {
          const created = await gcalRequest(accessToken, 'POST', '', body);
          if (created?.id) {
            entry.event = created.id;
            result.milestoneEventIds.push(created.id);
            added = true;
          }
        }
      } else if (entry.event) {
        // Shown as tasks now: the timed reminder goes.
        await gcalRequest(accessToken, 'DELETE', `/${encodeURIComponent(entry.event)}`).catch(() => undefined);
        entry.event = undefined;
        updated = true;
      }
    } catch (err) {
      console.error('Error syncing a step to Google Calendar:', err);
    }

    if (added) result.newItemsCount += 1;
    else if (updated && record[milestone.id]?.hash) result.updatedItemsCount = (result.updatedItemsCount || 0) + 1;
    if (entry.task || entry.event) {
      result.totalSynced += 1;
      record[milestone.id] = { ...entry, hash };
    } else {
      delete record[milestone.id];
    }
  }

  // Each step keeps its own Google ids too (Google Tasks sync, single-step delete).
  const milestones = (event.milestones || []).map((m) => {
    const entry = record[m.id];
    return { ...m, googleTaskId: entry?.task, googleCalendarEventId: entry?.event };
  });

  result.updatedEvent = {
    ...event,
    googleEventId: mainEventId || event.googleEventId,
    googleEventLink: mainEventLink || event.googleEventLink,
    googleReturnEventId: returnEventId,
    googleSynced: record,
    googleEventHash: mainEventId && ownsEvent ? eventHash : event.googleEventHash,
    googleSyncStyle: style,
    syncedToGoogleAt: new Date().toISOString(),
    googleMilestoneCount: Object.keys(record).length,
    milestones,
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
  // Anything Google didn't confirm removing: the caller must not report a clean delete.
  let failures = 0;

  const shouldDeleteMain = options.deleteMainEvent !== false;
  const shouldDeleteTasks = options.deleteTasks !== false;

  // 1. Delete main event by stored ID if requested
  if (shouldDeleteMain && event.googleEventId && !event.googleEventId.startsWith('local_')) {
    try {
      await deleteGoogleCalendarEvent(accessToken, event.googleEventId);
      deletedCalendarEvents++;
    } catch (e) {
      console.warn('Could not delete main event by direct ID:', e);
      failures++;
    }
  }
  if (shouldDeleteMain && event.googleReturnEventId) {
    try {
      await deleteGoogleCalendarEvent(accessToken, event.googleReturnEventId);
      deletedCalendarEvents++;
    } catch (e) {
      console.warn('Could not delete the return event by direct ID:', e);
      failures++;
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
      failures++;
        }
      }
      if (ms.googleTaskId) {
        try {
          await deleteGoogleTask(accessToken, ms.googleTaskId);
          deletedTasks++;
        } catch (e) {
          console.warn('Could not delete google task by direct ID:', e);
      failures++;
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
      failures++;
          }
        }
      }
    } catch (taskScanErr) {
      console.warn('Notice scanning tasks for matching items:', taskScanErr);
      failures++;
    }
  }

  return {
    deletedCalendarEvents,
    deletedTasks,
    success: failures === 0,
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
      await patchGoogleCalendarEvent(accessToken, milestone.googleCalendarEventId, {
        summary: formatMilestoneCalendarTitle(milestone.title, eventTitle, milestone.calculatedDate, {
          isCompleted: newStatus === 'completed',
        }),
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


