import { query } from './db.js';
import { ensureEventSyncSchema } from './eventSyncSchema.js';
import type { UpdateTask, UpdateOpenDecision } from './dailyUpdateTemplate.js';

const WEEK_DAYS = 7;
const MAX_ROWS = 60;
// Architecture reset Phase 8 - an open decision on an event further out
// than this only nags once it's genuinely close (or high-impact, checked
// separately below) - matching "remind, don't pester" for something the
// user may not need to think about for weeks yet. Tunable, not fixed,
// same status as other heuristic horizons in this repo.
const OPEN_DECISION_HORIZON_DAYS = 30;

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

/**
 * Architecture reset Phase 8 - the user's own still-unanswered Open
 * Decisions (outstanding_gaps), for events happening soon enough to be
 * worth nagging about, or carrying a high-impact gap regardless of how
 * far out the event is (e.g. the role gap - who's actually responsible -
 * matters even months ahead).
 */
export async function listOpenDecisions(userId: string, todayIso: string): Promise<UpdateOpenDecision[]> {
  await ensureEventSyncSchema();
  const today = todayIso.substring(0, 10);
  const rows = await query<{ event_title: string; outstanding_gaps: Array<{ question: string; impact: string }> }>(
    `SELECT e.title AS event_title, e.outstanding_gaps
       FROM events e
      WHERE e.user_id = $1
        AND e.deleted_at IS NULL
        AND e.event_date >= $2::date
        AND jsonb_array_length(e.outstanding_gaps) > 0
        AND (
          e.event_date < ($2::date + $3::int + 1)
          OR EXISTS (
            SELECT 1 FROM jsonb_array_elements(e.outstanding_gaps) g WHERE g->>'impact' = 'high'
          )
        )
      ORDER BY e.event_date ASC
      LIMIT $4`,
    [userId, today, OPEN_DECISION_HORIZON_DAYS, MAX_ROWS]
  );

  const decisions: UpdateOpenDecision[] = [];
  for (const r of rows) {
    for (const gap of r.outstanding_gaps || []) {
      decisions.push({ eventTitle: r.event_title, question: gap.question });
    }
  }
  return decisions.slice(0, MAX_ROWS);
}
