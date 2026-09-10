/**
 * Google Tasks API Integration
 * Handles creating, listing, and managing Google Tasks that appear in Google Calendar
 */

import { CalendarEvent, TMinusMilestone } from '../types';

export interface GoogleTaskItem {
  id: string;
  title: string;
  notes?: string;
  due?: string; // RFC 3339 timestamp e.g. "2026-04-15T00:00:00.000Z"
  status?: 'needsAction' | 'completed';
  completed?: string;
  updated?: string;
  selfLink?: string;
  webViewLink?: string;
  deleted?: boolean; // only present when the request was made with includeDeleted
}

export interface GoogleTaskList {
  id: string;
  title: string;
  updated?: string;
}

export interface TaskSyncSummary {
  updatedEvents: CalendarEvent[];
  completedCount: number;
  uncompletedCount: number;
  skippedCount: number;
  linkedTasksCount: number;
  syncedTaskTitles: string[];
}

/**
 * List all task lists for the user
 */
export async function fetchGoogleTaskLists(accessToken: string): Promise<GoogleTaskList[]> {
  const url = 'https://tasks.googleapis.com/tasks/v1/users/@me/lists';
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error?.message || `Failed to fetch task lists (${response.status})`);
  }

  const data = await response.json();
  return data.items || [];
}

/**
 * Fetch tasks from a task list, paging through all results (Google caps a
 * single page at maxResultsPerPage) instead of silently truncating at
 * whatever the first page returns - a sync that only ever sees the first
 * ~50-100 tasks will eventually stop noticing changes to older ones.
 */
export async function fetchGoogleTasks(
  accessToken: string,
  taskListId = '@default',
  maxResultsPerPage = 100,
  options: { includeDeleted?: boolean } = {}
): Promise<GoogleTaskItem[]> {
  const allItems: GoogleTaskItem[] = [];
  let pageToken: string | undefined;
  // Safety cap across all pages combined, so a runaway task list can't turn
  // this into an unbounded loop.
  const hardCap = 2000;

  do {
    const params = new URLSearchParams({
      showCompleted: 'true',
      showHidden: 'true',
      maxResults: String(maxResultsPerPage),
    });
    if (options.includeDeleted) {
      params.set('showDeleted', 'true');
    }
    if (pageToken) {
      params.set('pageToken', pageToken);
    }

    const url = `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(taskListId)}/tasks?${params.toString()}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error?.message || `Failed to fetch tasks (${response.status})`);
    }

    const data = await response.json();
    allItems.push(...(data.items || []));
    pageToken = data.nextPageToken;
  } while (pageToken && allItems.length < hardCap);

  return allItems;
}

/**
 * Create a new task in Google Tasks (which renders in Google Calendar task layer and Google Tasks app)
 */
export async function createGoogleTask(
  accessToken: string,
  task: {
    title: string;
    notes?: string;
    due?: string; // Must be RFC 3339 date/time e.g. "2026-04-15T00:00:00.000Z"
    taskListId?: string;
  }
): Promise<GoogleTaskItem> {
  const listId = task.taskListId || '@default';
  const url = `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(listId)}/tasks`;

  // Format due date to RFC 3339 strictly with T00:00:00.000Z (required by Google Tasks API)
  let dueRfc: string | undefined;
  if (task.due) {
    let dateStr = task.due.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
      const dateOnly = dateStr.substring(0, 10);
      dueRfc = `${dateOnly}T00:00:00.000Z`;
    } else {
      try {
        const d = new Date(task.due);
        if (!isNaN(d.getTime())) {
          const year = d.getUTCFullYear();
          const month = String(d.getUTCMonth() + 1).padStart(2, '0');
          const day = String(d.getUTCDate()).padStart(2, '0');
          dueRfc = `${year}-${month}-${day}T00:00:00.000Z`;
        }
      } catch {
        dueRfc = task.due;
      }
    }
  }

  const bodyPayload: any = {
    title: task.title,
    notes: task.notes || '',
  };

  if (dueRfc) {
    bodyPayload.due = dueRfc;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(bodyPayload),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error?.message || `Failed to create task in Google Tasks (${response.status})`);
  }

  return response.json();
}

/**
 * Delete a task from Google Tasks
 */
export async function deleteGoogleTask(
  accessToken: string,
  taskId: string,
  taskListId = '@default'
): Promise<boolean> {
  const url = `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(
    taskListId
  )}/tasks/${encodeURIComponent(taskId)}`;

  const response = await fetch(url, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok && response.status !== 404 && response.status !== 410) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error?.message || `Failed to delete task (${response.status})`);
  }

  return true;
}

/**
 * Delete all T-Minus test tasks from Google Tasks
 */
export async function wipeGoogleTestTasks(
  accessToken: string,
  taskListId = '@default'
): Promise<{ deletedCount: number; deletedTitles: string[] }> {
  try {
    const tasks = await fetchGoogleTasks(accessToken, taskListId, 100);
    const testTasks = tasks.filter((t) => {
      const title = (t.title || '').toLowerCase();
      const notes = (t.notes || '').toLowerCase();
      return (
        title.includes('t-minus') ||
        title.startsWith('[t-') ||
        notes.includes('t-minus')
      );
    });

    let deletedCount = 0;
    const deletedTitles: string[] = [];

    for (const task of testTasks) {
      try {
        await deleteGoogleTask(accessToken, task.id, taskListId);
        deletedCount++;
        deletedTitles.push(task.title || 'Task');
      } catch (e) {
        console.warn(`Could not delete task ${task.id}:`, e);
      }
    }

    return { deletedCount, deletedTitles };
  } catch (err) {
    console.warn('Could not wipe Google Tasks:', err);
    return { deletedCount: 0, deletedTitles: [] };
  }
}

/**
 * Update the status of a Google Task (e.g. mark as completed or needsAction)
 */
export async function updateGoogleTaskStatus(
  accessToken: string,
  taskId: string,
  status: 'completed' | 'needsAction',
  taskListId = '@default'
): Promise<GoogleTaskItem> {
  const url = `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(
    taskListId
  )}/tasks/${encodeURIComponent(taskId)}`;

  const bodyPayload: any = {
    status,
  };

  if (status === 'completed') {
    bodyPayload.completed = new Date().toISOString();
  } else {
    bodyPayload.completed = null;
  }

  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(bodyPayload),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error?.message || `Failed to update task status in Google Tasks (${response.status})`);
  }

  return response.json();
}

/**
 * Bidirectional Sync:
 * Fetches every Google Task from the user's task list (including completed
 * and deleted ones, across all pages), then reconciles each local
 * milestone against it:
 * 1. Already linked (googleTaskId) - reconcile status both ways:
 *    - completed in Google, still pending locally -> mark completed.
 *    - reopened in Google, still completed locally -> mark pending again.
 *    - deleted in Google -> mark skipped (never deleted locally; deleting
 *      the milestone outright would erase history and could make the
 *      planning engine think the action never existed).
 * 2. Not yet linked - try a one-time title-heuristic match to backfill the
 *    googleTaskId (only against non-deleted tasks, so a fresh milestone
 *    never gets linked straight to something already gone), then apply the
 *    same reconciliation above once linked.
 * googleTaskId is always the source of truth once a milestone has one;
 * title matching is only ever used to establish that link in the first
 * place, never to re-decide status for an already-linked milestone.
 */
export async function syncGoogleTasksWithLocalEvents(
  accessToken: string,
  events: CalendarEvent[],
  taskListId = '@default'
): Promise<TaskSyncSummary> {
  const summary: TaskSyncSummary = {
    updatedEvents: events,
    completedCount: 0,
    uncompletedCount: 0,
    skippedCount: 0,
    linkedTasksCount: 0,
    syncedTaskTitles: [],
  };

  try {
    const googleTasks = await fetchGoogleTasks(accessToken, taskListId, 100, { includeDeleted: true });
    if (!googleTasks || googleTasks.length === 0) {
      return summary;
    }

    // Build quick lookup maps: by ID (includes deleted stubs) and by
    // normalized title (non-deleted only - see doc comment above).
    const tasksById = new Map<string, GoogleTaskItem>();
    const tasksByTitle = new Map<string, GoogleTaskItem>();

    for (const t of googleTasks) {
      tasksById.set(t.id, t);
      if (t.title && !t.deleted) {
        const normalized = t.title.trim().toLowerCase();
        if (!tasksByTitle.has(normalized)) {
          tasksByTitle.set(normalized, t);
        }
      }
    }

    let modifiedAny = false;

    const nextEvents = events.map((evt) => {
      let eventChanged = false;
      const nextMilestones = (evt.milestones || []).map((ms) => {
        let matchedTask: GoogleTaskItem | undefined;

        if (ms.googleTaskId) {
          // Already linked - googleTaskId is authoritative. If Google no
          // longer returns it at all (can happen once a deleted task ages
          // out of Google's own deleted-item retention), there's nothing to
          // reconcile against this round.
          matchedTask = tasksById.get(ms.googleTaskId);
          if (!matchedTask) {
            return ms;
          }
        } else {
          // Title heuristic match, used only to establish the initial link.
          // Task titles look like: `[T-7d] Order birthday cake (Sarah's 30th Birthday)`
          // or contain milestone.title.
          const msTitleLower = ms.title.toLowerCase();
          for (const [normTitle, taskItem] of tasksByTitle.entries()) {
            if (
              normTitle.includes(msTitleLower) &&
              (normTitle.includes(ms.tMinusLabel.toLowerCase()) || normTitle.includes(evt.title.toLowerCase()))
            ) {
              matchedTask = taskItem;
              break;
            }
          }
          if (!matchedTask) {
            return ms;
          }
        }

        let updatedMs: TMinusMilestone = { ...ms };

        if (!ms.googleTaskId && matchedTask.id) {
          updatedMs.googleTaskId = matchedTask.id;
          summary.linkedTasksCount++;
          eventChanged = true;
        }

        if (matchedTask.deleted) {
          if (ms.status !== 'skipped') {
            updatedMs.status = 'skipped';
            summary.skippedCount++;
            eventChanged = true;
          }
          return updatedMs;
        }

        const isGoogleCompleted = matchedTask.status === 'completed';
        const isLocalCompleted = ms.status === 'completed';

        if (isGoogleCompleted && !isLocalCompleted) {
          updatedMs.status = 'completed';
          updatedMs.completedAt = matchedTask.completed || new Date().toISOString();
          summary.completedCount++;
          summary.syncedTaskTitles.push(`${ms.title} (${evt.title})`);
          eventChanged = true;
        } else if (!isGoogleCompleted && isLocalCompleted) {
          // Reopened in Google Tasks - reflect that back locally rather
          // than leaving AOT showing a task as done that the user un-did.
          updatedMs.status = 'pending';
          updatedMs.completedAt = undefined;
          summary.uncompletedCount++;
          eventChanged = true;
        }

        return updatedMs;
      });

      if (eventChanged) {
        modifiedAny = true;
        return {
          ...evt,
          milestones: nextMilestones,
          updatedAt: new Date().toISOString(),
        };
      }

      return evt;
    });

    summary.updatedEvents = modifiedAny ? nextEvents : events;
    return summary;
  } catch (err) {
    console.error('Error during syncGoogleTasksWithLocalEvents:', err);
    return summary;
  }
}

