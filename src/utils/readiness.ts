/**
 * AHEAD readiness + Next Best Action.
 *
 * Derived, read-only computations over the existing CalendarEvent/
 * TMinusMilestone data - deliberately NOT a new data model or schema
 * change. The goal is to answer "am I actually prepared?" and "what
 * should I do now?" without a large migration, so the concept can be
 * validated with real usage before (if ever) it's worth promoting to a
 * first-class Action model with its own backend fields.
 *
 * `importance` in particular is a heuristic stand-in for a field that
 * doesn't exist on TMinusMilestone yet (see inferMilestoneImportance) -
 * flagged there, not hidden.
 */
import { CalendarEvent, TMinusMilestone, MilestoneCategory } from '../types';
import { getCountdownStatus } from './tminusRules';

export type ActionImportance = 'critical' | 'important' | 'routine';

export type AheadLevel = 'ready' | 'ahead' | 'on_track' | 'attention' | 'at_risk';

export interface AheadStatus {
  level: AheadLevel;
  emoji: string;
  label: string;
  summary: string;
  completedCount: number;
  totalCount: number;
  overdueCount: number;
  criticalOutstandingCount: number;
}

export interface NextBestAction {
  eventId: string;
  eventTitle: string;
  milestoneId: string;
  title: string;
  reason: string;
  dueLabel: string;
  isOverdue: boolean;
  importance: ActionImportance;
}

// Categories with a hard external deadline/cost (a booking that can sell
// out, a ticket, a fixed submission date) outrank ones that are mostly
// flexible prep work.
const CRITICAL_CATEGORIES = new Set<MilestoneCategory>(['booking', 'tickets', 'project_deadline', 'qa']);
const ROUTINE_CATEGORIES = new Set<MilestoneCategory>(['shopping', 'prep', 'marketing', 'general', 'watchpoint']);

/**
 * Heuristic stand-in for a real `importance` field. Derived from category
 * (does this typically have a hard external deadline?) and scope (a macro/
 * event-level gate outranks a micro/day-of detail). Once the concept is
 * validated with real usage, this is the field that would graduate into an
 * explicit column on a canonical Action model instead of being inferred.
 */
export function inferMilestoneImportance(milestone: TMinusMilestone): ActionImportance {
  let base: ActionImportance = 'important';
  if (CRITICAL_CATEGORIES.has(milestone.category)) {
    base = 'critical';
  } else if (ROUTINE_CATEGORIES.has(milestone.category)) {
    base = 'routine';
  }

  if (milestone.scope === 'micro') {
    if (base === 'critical') return 'important';
    if (base === 'important') return 'routine';
  }

  return base;
}

/**
 * Skipped milestones (e.g. the linked Google Task was deleted) are no
 * longer outstanding actions - excluded the same way EventTimelineRadar
 * excludes them from its progress count.
 */
function actionableMilestones(milestones: TMinusMilestone[] | undefined): TMinusMilestone[] {
  return (milestones || []).filter((m) => m.status !== 'skipped');
}

export function computeAheadStatus(event: CalendarEvent, referenceDateISO: string): AheadStatus {
  const actionable = actionableMilestones(event.milestones);
  const totalCount = actionable.length;
  const completedCount = actionable.filter((m) => m.status === 'completed').length;
  const outstanding = actionable.filter((m) => m.status !== 'completed');

  const overdueOutstanding = outstanding.filter((m) => getCountdownStatus(m.calculatedDate, referenceDateISO).isOverdue);
  const overdueCount = overdueOutstanding.length;
  const criticalOutstandingCount = outstanding.filter((m) => inferMilestoneImportance(m) === 'critical').length;
  const overdueCriticalCount = overdueOutstanding.filter((m) => inferMilestoneImportance(m) === 'critical').length;

  const base = { completedCount, totalCount, overdueCount, criticalOutstandingCount };

  if (totalCount === 0 || completedCount === totalCount) {
    return {
      ...base,
      level: 'ready',
      emoji: '✓',
      label: 'Ready',
      summary: totalCount === 0 ? 'No preparation actions needed.' : `All ${totalCount} actions complete.`,
    };
  }

  if (overdueCriticalCount > 0) {
    return {
      ...base,
      level: 'at_risk',
      emoji: '🔴',
      label: "You're at risk",
      summary: `${overdueCount} overdue action${overdueCount > 1 ? 's' : ''}, including something critical.`,
    };
  }

  if (overdueCount > 0) {
    return {
      ...base,
      level: 'attention',
      emoji: '🟡',
      label: 'Needs attention',
      summary: `${overdueCount} action${overdueCount > 1 ? 's are' : ' is'} overdue.`,
    };
  }

  const completionRatio = completedCount / totalCount;
  const outstandingNote = criticalOutstandingCount > 0
    ? ` ${criticalOutstandingCount > 1 ? 'Some important items are' : 'One important item is'} still outstanding.`
    : '';

  if (completionRatio >= 0.7) {
    return {
      ...base,
      level: 'ahead',
      emoji: '🟢',
      label: "You're ahead",
      summary: `${completedCount} of ${totalCount} actions complete.${outstandingNote}`,
    };
  }

  return {
    ...base,
    level: 'on_track',
    emoji: '🟢',
    label: "You're on track",
    summary: `${completedCount} of ${totalCount} actions complete.${outstandingNote}`,
  };
}

/**
 * Aggregates computeAheadStatus across every active event into a single
 * dashboard-level reading - the answer to "am I prepared overall?" rather
 * than "am I prepared for this one thing?". Uses the same level-decision
 * rules as the per-event version, just applied to summed counts, so the
 * two stay consistent with each other.
 */
export function computeOverallAheadStatus(events: CalendarEvent[], referenceDateISO: string): AheadStatus {
  const perEvent = events.map((event) => computeAheadStatus(event, referenceDateISO));

  const totalCount = perEvent.reduce((sum, s) => sum + s.totalCount, 0);
  const completedCount = perEvent.reduce((sum, s) => sum + s.completedCount, 0);
  const overdueCount = perEvent.reduce((sum, s) => sum + s.overdueCount, 0);
  const criticalOutstandingCount = perEvent.reduce((sum, s) => sum + s.criticalOutstandingCount, 0);
  const hasOverdueCritical = perEvent.some((s) => s.level === 'at_risk');

  const base = { completedCount, totalCount, overdueCount, criticalOutstandingCount };

  if (totalCount === 0 || completedCount === totalCount) {
    return {
      ...base,
      level: 'ready',
      emoji: '✓',
      label: 'Ready',
      summary: totalCount === 0 ? 'No preparation actions needed right now.' : `All ${totalCount} actions complete.`,
    };
  }

  if (hasOverdueCritical) {
    return {
      ...base,
      level: 'at_risk',
      emoji: '🔴',
      label: "You're at risk",
      summary: `${overdueCount} overdue action${overdueCount > 1 ? 's' : ''} across your events, including something critical.`,
    };
  }

  if (overdueCount > 0) {
    return {
      ...base,
      level: 'attention',
      emoji: '🟡',
      label: 'Needs attention',
      summary: `${overdueCount} action${overdueCount > 1 ? 's are' : ' is'} overdue.`,
    };
  }

  const completionRatio = completedCount / totalCount;
  const outstandingNote = criticalOutstandingCount > 0
    ? ` ${criticalOutstandingCount > 1 ? 'Some important items are' : 'One important item is'} still outstanding.`
    : '';

  if (completionRatio >= 0.7) {
    return {
      ...base,
      level: 'ahead',
      emoji: '🟢',
      label: "You're ahead",
      summary: `${completedCount} of ${totalCount} actions complete.${outstandingNote}`,
    };
  }

  return {
    ...base,
    level: 'on_track',
    emoji: '🟢',
    label: "You're on track",
    summary: `${completedCount} of ${totalCount} actions complete.${outstandingNote}`,
  };
}

const IMPORTANCE_WEIGHT: Record<ActionImportance, number> = { critical: 0, important: 1, routine: 2 };

/**
 * The single most urgent outstanding action for one event: overdue items
 * first (most overdue first), then soonest-due, with importance as the
 * tie-break at equal urgency. Returns null once nothing outstanding remains.
 */
export function computeNextBestActionForEvent(event: CalendarEvent, referenceDateISO: string): NextBestAction | null {
  const outstanding = actionableMilestones(event.milestones).filter((m) => m.status !== 'completed');
  if (outstanding.length === 0) return null;

  const scored = outstanding.map((m) => {
    const countdown = getCountdownStatus(m.calculatedDate, referenceDateISO);
    const importance = inferMilestoneImportance(m);
    return { milestone: m, countdown, importance };
  });

  scored.sort((a, b) => {
    if (a.countdown.diffDays !== b.countdown.diffDays) {
      return a.countdown.diffDays - b.countdown.diffDays;
    }
    return IMPORTANCE_WEIGHT[a.importance] - IMPORTANCE_WEIGHT[b.importance];
  });

  const best = scored[0];
  return {
    eventId: event.id,
    eventTitle: event.title,
    milestoneId: best.milestone.id,
    title: best.milestone.title,
    reason: `Needed before your ${event.title}.`,
    dueLabel: best.countdown.label,
    isOverdue: best.countdown.isOverdue,
    importance: best.importance,
  };
}

/**
 * The single most urgent outstanding action across every active event -
 * the "what should I do now?" answer for a dashboard that spans more than
 * one event. Not yet wired into a global dashboard (that's the later "My
 * Week Ahead" phase); exposed now so per-event and cross-event callers can
 * share the same ranking logic.
 */
export function computeNextBestAction(events: CalendarEvent[], referenceDateISO: string): NextBestAction | null {
  const candidates = events
    .map((event) => computeNextBestActionForEvent(event, referenceDateISO))
    .filter((a): a is NextBestAction => a !== null);

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    const overdueDiff = Number(b.isOverdue) - Number(a.isOverdue);
    if (overdueDiff !== 0) return overdueDiff;
    return IMPORTANCE_WEIGHT[a.importance] - IMPORTANCE_WEIGHT[b.importance];
  });

  return candidates[0];
}
