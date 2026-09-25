import { query } from './db.js';
import {
  getValidAccessToken,
  ensureBackgroundSyncSchema,
  hasBackgroundSyncLinked,
  backgroundSyncHasTasksScope,
  markTasksScopeMissing,
} from './googleOAuthTokenStore.js';
import { TelegramSessionStore } from './telegramStore.js';
import { extractDateOnly, formatStartEndDateTime, formatMilestoneCalendarTitle } from '../src/utils/googleSyncFormat.js';
import type { CalendarEvent, TMinusMilestone } from '../src/types.js';

/**
 * Server-side counterpart of the browser's "Push to Cal" for events that were
 * created while no browser was open (Telegram): writes the event to the
 * user's primary Google Calendar and its prep milestones to Google Tasks,
 * using the refresh token stored for Background Sync.
 *
 * Idempotent and resumable: every Google id is written back to Postgres the
 * moment it exists, and anything already carrying an id is skipped, so a
 * retry (or a later refine that adds milestones) only creates what is
 * missing. The web app reads the ids back, so it shows the event as already
 * synced instead of pushing it a second time.
 *
 * Payloads mirror src/services/googleCalendar.ts's syncEventToGoogleCalendar
 * (default 'tasks_only' format: milestones become Google Tasks, not calendar
 * blocks). The user's chosen format lives in the browser, out of reach here.
 */

const DEFAULT_TIME_ZONE = 'Europe/Amsterdam'; // same default as the browser push
const TASK_CONCURRENCY = 4;

export interface BackgroundPushResult {
  status: 'pushed' | 'skipped' | 'failed';
  /** True when the main calendar event was created by this call. */
  createdCalendarEvent: boolean;
  tasksCreated: number;
  error?: string;
  /** Google Tasks access wasn't granted when Background Sync was linked. */
  tasksScopeMissing?: boolean;
}

const skipped = (): BackgroundPushResult => ({ status: 'skipped', createdCalendarEvent: false, tasksCreated: 0 });

function googleHeaders(accessToken: string) {
  return { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };
}

async function createMainCalendarEvent(
  accessToken: string,
  event: CalendarEvent,
  timeZone: string
): Promise<{ id: string; htmlLink?: string }> {
  const { startDateTime, endDateTime } = formatStartEndDateTime(
    extractDateOnly(event.eventDate),
    event.eventTime || '19:00',
    120
  );
  const body = {
    summary: `🎯 ${event.title}`,
    description: `Target Event organized with Ahead Of Time.\nCategory: ${event.category}\n\nPreparation Countdown:\n${
      event.milestones?.map((m) => `• ${m.tMinusLabel} (Due ${extractDateOnly(m.calculatedDate)}): ${m.title}`).join('\n') || 'None'
    }`,
    location: event.location || '',
    start: { dateTime: startDateTime, timeZone },
    end: { dateTime: endDateTime, timeZone },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: 60 },
        { method: 'popup', minutes: 1440 },
      ],
    },
  };
  const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST',
    headers: googleHeaders(accessToken),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `Google Calendar responded ${res.status}`);
  return { id: data.id, htmlLink: data.htmlLink };
}

type TaskInsertResult = { id: string } | { error: string; scopeMissing: boolean };

async function createTaskForMilestone(
  accessToken: string,
  eventTitle: string,
  milestone: TMinusMilestone
): Promise<TaskInsertResult> {
  const dueDate = extractDateOnly(milestone.calculatedDate);
  const cleanTitle = milestone.title.replace(/^AheadOfTime:\s*/i, '').trim();
  const checklist =
    milestone.deliverables && milestone.deliverables.length > 0
      ? milestone.deliverables.map((d) => `[${d.is_completed ? 'x' : ' '}] ${d.title}`).join('\n')
      : milestone.description && milestone.description.trim()
        ? `[ ] ${milestone.description.trim()}`
        : `[ ] ${cleanTitle}`;
  const isOverdue = milestone.status === 'pending' && new Date(`${dueDate}T23:59:59`) < new Date();

  const res = await fetch('https://tasks.googleapis.com/tasks/v1/lists/@default/tasks', {
    method: 'POST',
    headers: googleHeaders(accessToken),
    body: JSON.stringify({
      title: formatMilestoneCalendarTitle(milestone.title, eventTitle, dueDate, {
        isOverdue,
        isCompleted: milestone.status === 'completed',
      }),
      notes: `Checklist for ${eventTitle}:\n${checklist}\n\n--\nPlanned with AheadOfTime`,
      due: `${dueDate}T00:00:00.000Z`,
    }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.id) {
    const message: string = data?.error?.message || `Google Tasks responded ${res.status}`;
    const reasons = JSON.stringify(data?.error?.details || data?.error?.errors || '');
    // 403 "insufficient authentication scopes": Tasks wasn't ticked on
    // Google's consent screen. Other failures (API disabled for the Cloud
    // project, quota) are logged so they show up in the function logs.
    const scopeMissing = res.status === 403 && /insufficient.*scope|SCOPE_INSUFFICIENT/i.test(`${message} ${reasons}`);
    console.warn('Google Tasks insert failed:', res.status, message, reasons);
    return { error: message, scopeMissing };
  }
  return { id: data.id };
}

export async function pushEventToGoogleInBackground(eventId: string): Promise<BackgroundPushResult> {
  try {
    await ensureBackgroundSyncSchema();

    // Callers pass the public id (the web app's client_id, e.g. 'evt_...'),
    // while events.id is a uuid: resolve it once and use the uuid below.
    const eventUuid = await TelegramSessionStore.resolveEventUuid(eventId);
    if (!eventUuid) return skipped();

    const owner = await query<{ user_id: string; timezone: string | null }>(
      `SELECT e.user_id, u.timezone FROM events e JOIN users u ON u.id = e.user_id WHERE e.id = $1`,
      [eventUuid]
    );
    if (owner.length === 0) return skipped();

    // No stored grant (never opted in, or revoked) means nothing to do here:
    // the manual "Push to Cal" in the app stays the way in.
    const accessToken = await getValidAccessToken(owner[0].user_id);
    if (!accessToken) return skipped();

    const event = await TelegramSessionStore.getEvent(eventId);
    if (!event) return skipped();

    const tasksAllowed = await backgroundSyncHasTasksScope(owner[0].user_id);
    const timeZone = owner[0].timezone || DEFAULT_TIME_ZONE;
    const result: BackgroundPushResult = { status: 'pushed', createdCalendarEvent: false, tasksCreated: 0 };
    let firstError: string | undefined;

    if (!event.googleEventId) {
      try {
        const main = await createMainCalendarEvent(accessToken, event, timeZone);
        await query(
          `UPDATE events SET google_event_id = $2, google_event_link = $3, synced_to_google_at = now(), updated_at = now() WHERE id = $1`,
          [eventUuid, main.id, main.htmlLink || null]
        );
        result.createdCalendarEvent = true;
      } catch (err: any) {
        firstError = err?.message || 'Could not create the calendar event';
      }
    }

    // A milestone hidden by a preparation-level downgrade (architecture
    // reset Phase 6, isActive/hiddenReason) is never auto-pushed either -
    // same rule the browser's manual "Push to Cal" path follows.
    const pending = (event.milestones || []).filter((m) => !m.googleTaskId && m.isActive !== false);
    if (pending.length > 0 && !tasksAllowed) {
      result.tasksScopeMissing = true;
    }
    let taskError: string | undefined;
    let refusedByGoogle = false;
    for (let i = 0; i < pending.length && !result.tasksScopeMissing; i += TASK_CONCURRENCY) {
      const batch = pending.slice(i, i + TASK_CONCURRENCY);
      const outcomes = await Promise.all(
        batch.map((m) =>
          createTaskForMilestone(accessToken, event.title, m).catch(
            (err: any): TaskInsertResult => ({ error: err?.message || 'Google Tasks request failed', scopeMissing: false })
          )
        )
      );
      for (let j = 0; j < batch.length; j++) {
        const outcome = outcomes[j];
        if ('error' in outcome) {
          taskError = taskError || outcome.error;
          if (outcome.scopeMissing) {
            result.tasksScopeMissing = true;
            refusedByGoogle = true;
          }
          continue;
        }
        const taskId = outcome.id;
        // Milestone ids are public too (client_id, else the uuid as text).
        await query(
          `UPDATE milestones SET google_task_id = $2 WHERE event_id = $3 AND (id::text = $1 OR client_id = $1)`,
          [batch[j].id, taskId, eventUuid]
        );
        result.tasksCreated++;
      }
    }

    if (result.tasksCreated > 0) {
      // updated_at too: other devices' incremental pulls only see changed rows.
      await query(`UPDATE events SET synced_to_google_at = now(), updated_at = now() WHERE id = $1`, [eventUuid]);
    }
    if (refusedByGoogle) {
      await markTasksScopeMissing(owner[0].user_id);
    }
    console.info('Background push to Google:', {
      event: eventUuid,
      milestones: event.milestones?.length ?? 0,
      pending: pending.length,
      createdCalendarEvent: result.createdCalendarEvent,
      tasksCreated: result.tasksCreated,
      tasksScopeMissing: !!result.tasksScopeMissing,
      taskError,
    });
    if (firstError && !result.createdCalendarEvent && result.tasksCreated === 0) {
      return { ...result, status: 'failed', error: firstError };
    }
    if (pending.length > result.tasksCreated) {
      // Some tasks did not go through: still worth reporting what did, and a
      // later refine/retry only has to create the missing ones.
      result.error = result.tasksScopeMissing
        ? 'Google Tasks access was not granted.'
        : `Some tasks could not be added to Google Tasks${taskError ? ` (${taskError})` : ''}.`;
    }
    return result;
  } catch (err: any) {
    console.warn('Background push to Google failed (non-fatal):', err);
    return { status: 'failed', createdCalendarEvent: false, tasksCreated: 0, error: err?.message || 'Push failed' };
  }
}

/** Whether this user's events get pushed to Google automatically. */
export async function isAutoPushEnabledForUser(userId: string | undefined | null): Promise<boolean> {
  if (!userId) return false;
  try {
    return await hasBackgroundSyncLinked(userId);
  } catch {
    return false;
  }
}
