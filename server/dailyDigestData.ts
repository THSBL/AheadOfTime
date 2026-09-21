import { query } from './db.js';
import { ensureEventSyncSchema } from './eventSyncSchema.js';
import type { UpdateTask } from './dailyUpdateTemplate.js';

const WEEK_DAYS = 7;
const MAX_ROWS = 60;

export interface TasksNeedingAttention {
  overdue: UpdateTask[];
  dueThisWeek: UpdateTask[];
}

/**
 * The user's own pending tasks (from the synced event list) that are overdue
 * or due within a week, for events that have not happened yet. Events they
 * deleted, and long-past events, never nag.
 */
export async function listTasksNeedingAttention(userId: string, todayIso: string): Promise<TasksNeedingAttention> {
  await ensureEventSyncSchema();
  const today = todayIso.substring(0, 10);
  const rows = await query<{ title: string; event_title: string; due: string | Date }>(
    `SELECT m.title, e.title AS event_title, m.calculated_date AS due
       FROM milestones m
       JOIN events e ON e.id = m.event_id
      WHERE e.user_id = $1
        AND e.deleted_at IS NULL
        AND e.event_date >= $2::date
        AND m.status = 'pending'
        AND m.kind = 'milestone'
        AND m.calculated_date < ($2::date + $3::int + 1)
      ORDER BY m.calculated_date ASC
      LIMIT $4`,
    [userId, today, WEEK_DAYS, MAX_ROWS]
  );

  const result: TasksNeedingAttention = { overdue: [], dueThisWeek: [] };
  for (const r of rows) {
    const dueDate = new Date(r.due).toISOString().substring(0, 10);
    const task: UpdateTask = { title: r.title, eventTitle: r.event_title, dueDate };
    (dueDate < today ? result.overdue : result.dueThisWeek).push(task);
  }
  return result;
}
