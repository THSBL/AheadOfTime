import { query } from './db.js';
import { ensureEventSyncSchema } from './eventSyncSchema.js';
import type { UpdateTask, UpdatePendingSync } from './dailyUpdateTemplate.js';

const WEEK_DAYS = 7;
const MAX_ROWS = 60;
export interface TasksNeedingAttention {
  overdue: UpdateTask[];
  dueThisWeek: UpdateTask[];
}

/** The first pending task after this week, for "Nothing due this week · Next up". */
export async function nextUpcomingTask(userId: string, todayIso: string): Promise<UpdateTask | null> {
  await ensureEventSyncSchema();
  const today = todayIso.substring(0, 10);
  const rows = await query<{ title: string; event_title: string; due: string | Date }>(
    `SELECT m.title, e.title AS event_title, m.calculated_date AS due
       FROM milestones m
       JOIN events e ON e.id = m.event_id
      WHERE e.user_id = $1
        AND e.deleted_at IS NULL
        AND m.status = 'pending'
        AND m.kind = 'milestone'
        AND COALESCE(m.is_active, true)
        AND m.calculated_date >= $2::date
      ORDER BY m.calculated_date ASC
      LIMIT 1`,
    [userId, today]
  );
  const r = rows[0];
  return r ? { title: r.title, eventTitle: r.event_title, dueDate: new Date(r.due).toISOString().substring(0, 10) } : null;
}

/**
 * The user's own pending tasks (from the synced event list) that are overdue
 * or due within a week, for events that have not happened yet. Events they
 * deleted, long-past events, and tasks that were already late when their
 * event was added, never nag.
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
        -- Hidden by a lower help level: not on the user's list, not in the update.
        AND COALESCE(m.is_active, true)
        AND m.calculated_date < ($2::date + $3::int + 1)
        -- Due before the event was even added: a one-time catch-up check in
        -- the app (isLateFromStart in src/utils/readiness.ts), not overdue.
        AND m.calculated_date >= e.created_at::date
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

/**
 * Plans with tasks that aren't in the user's calendar yet - only for people
 * who sync to Google (they have synced before). Calendar-feed users are
 * always in sync, so for them this is null.
 */
export async function countPendingSync(userId: string, todayIso: string): Promise<UpdatePendingSync | null> {
  await ensureEventSyncSchema();
  const today = todayIso.substring(0, 10);
  const uses = await query<{ syncs: boolean; feed: boolean }>(
    `SELECT EXISTS (
              SELECT 1 FROM milestones m JOIN events e ON e.id = m.event_id
               WHERE e.user_id = $1 AND m.google_task_id IS NOT NULL
            ) AS syncs,
            EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'calendar_feeds')
              AND EXISTS (SELECT 1 FROM calendar_feeds WHERE user_id = $1) AS feed`,
    [userId]
  ).catch(async () =>
    // calendar_feeds may not exist yet on an older database
    query<{ syncs: boolean; feed: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM milestones m JOIN events e ON e.id = m.event_id WHERE e.user_id = $1 AND m.google_task_id IS NOT NULL) AS syncs, false AS feed`,
      [userId]
    )
  );
  if (!uses[0]?.syncs || uses[0]?.feed) return null;
  const rows = await query<{ tasks: string }>(
    `SELECT count(*) AS tasks
       FROM milestones m JOIN events e ON e.id = m.event_id
      WHERE e.user_id = $1 AND e.deleted_at IS NULL
        AND COALESCE(e.end_date, e.event_date) >= $2::date
        AND m.status = 'pending' AND COALESCE(m.is_active, true)
        AND m.google_task_id IS NULL
      GROUP BY e.id`,
    [userId, today]
  );
  const tasks = rows.reduce((n, r) => n + Number(r.tasks), 0);
  return tasks > 0 ? { plans: rows.length, tasks } : null;
}
