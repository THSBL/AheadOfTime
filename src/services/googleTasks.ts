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
 * Fetch tasks from the primary default task list
 */
export async function fetchGoogleTasks(
  accessToken: string,
  taskListId = '@default',
  maxResults = 50
): Promise<GoogleTaskItem[]> {
  const url = `https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(
    taskListId
  )}/tasks?showCompleted=true&showHidden=true&maxResults=${maxResults}`;

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
  return data.items || [];
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
 * Fetches all Google Tasks from the user's primary/default task list (including completed ones),
 * inspects all active T-Minus events and their milestones:
 * 1. If a milestone has a matching googleTaskId or matching title in Google Tasks and is completed in Google -> marks local milestone as completed!
 * 2. If a local milestone doesn't have a googleTaskId yet, links it with the Google Task if titles match.
 * 3. Returns the updated events array and a breakdown of completed/updated counts.
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
    linkedTasksCount: 0,
    syncedTaskTitles: [],
  };

  try {
    const googleTasks = await fetchGoogleTasks(accessToken, taskListId, 100);
    if (!googleTasks || googleTasks.length === 0) {
      return summary;
    }

    // Build quick lookup maps: by ID and by normalized title
    const tasksById = new Map<string, GoogleTaskItem>();
    const tasksByTitle = new Map<string, GoogleTaskItem>();

    for (const t of googleTasks) {
      tasksById.set(t.id, t);
      if (t.title) {
        // Clean title for matching
        const normalized = t.title.trim().toLowerCase();
        tasksByTitle.set(normalized, t);
      }
    }

    let modifiedAny = false;

    const nextEvents = events.map((evt) => {
      let eventChanged = false;
      const nextMilestones = (evt.milestones || []).map((ms) => {
        let matchedTask: GoogleTaskItem | undefined;

        // 1. Direct ID match
        if (ms.googleTaskId && tasksById.has(ms.googleTaskId)) {
          matchedTask = tasksById.get(ms.googleTaskId);
        } else {
          // 2. Title heuristic match
          // Task titles look like: `[T-7d] Order birthday cake (Sarah's 30th Birthday)`
          // or contain milestone.title
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
        }

        if (!matchedTask) {
          return ms;
        }

        let updatedMs: TMinusMilestone = { ...ms };

        // Link ID if missing
        if (!ms.googleTaskId && matchedTask.id) {
          updatedMs.googleTaskId = matchedTask.id;
          summary.linkedTasksCount++;
          eventChanged = true;
        }

        // Check completion status from Google Tasks
        const isGoogleCompleted = matchedTask.status === 'completed';
        const isLocalCompleted = ms.status === 'completed';

        if (isGoogleCompleted && !isLocalCompleted) {
          updatedMs.status = 'completed';
          updatedMs.completedAt = matchedTask.completed || new Date().toISOString();
          summary.completedCount++;
          summary.syncedTaskTitles.push(`${ms.title} (${evt.title})`);
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

