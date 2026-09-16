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

export type AheadLevel = 'ready' | 'ahead' | 'on_track' | 'not_yet_due' | 'attention' | 'at_risk';

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
  diffDays: number;
  importance: ActionImportance;
}

/** Whether a NextBestAction is due soon enough to treat as urgent right now. */
export function isNextBestActionThisWeek(action: NextBestAction, withinDays: number = 7): boolean {
  return action.isOverdue || action.diffDays <= withinDays;
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

  // Nothing has actually been completed yet - too early to call this
  // "on track" (that reads as a positive judgment on progress that
  // hasn't happened). Neutral until there's a real completed action to
  // point to.
  if (completedCount === 0) {
    return {
      ...base,
      level: 'not_yet_due',
      emoji: '🔵',
      label: 'Nothing due yet',
      summary: `${totalCount} action${totalCount > 1 ? 's' : ''} planned, none due yet.${outstandingNote}`,
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

  if (completedCount === 0) {
    return {
      ...base,
      level: 'not_yet_due',
      emoji: '🔵',
      label: 'Nothing due yet',
      summary: `${totalCount} action${totalCount > 1 ? 's' : ''} planned across your events, none due yet.${outstandingNote}`,
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

export type SimpleAheadLevel = 'ahead' | 'almost_ahead' | 'behind';

export interface SimpleAheadStatus {
  level: SimpleAheadLevel;
  label: string;
  sub: string;
  overdueCount: number;
  dueSoonCount: number;
}

/**
 * A single, unambiguous "am I ahead of time?" reading for the whole
 * dashboard - exactly three states, each with one non-contradictory line.
 * computeOverallAheadStatus's six-level model is genuinely useful for
 * categorizing events into "needs attention"/"coming up"/"already ahead"
 * lists further down the page, but its summary text ("Nothing due yet." +
 * "One important item is still outstanding.") can read as self-
 * contradictory when both clauses fire at once. This collapses the same
 * underlying counts into a single clean verdict instead:
 * - "behind": anything is overdue, full stop.
 * - "almost_ahead": nothing overdue, but something is due within the week.
 * - "ahead": nothing overdue and nothing due this week either.
 */
export function computeSimpleAheadStatus(
  events: CalendarEvent[],
  referenceDateISO: string,
  withinDays: number = 7
): SimpleAheadStatus {
  let overdueCount = 0;
  let dueSoonCount = 0;

  for (const event of events) {
    const outstanding = actionableMilestones(event.milestones).filter((m) => m.status !== 'completed');
    for (const milestone of outstanding) {
      const countdown = getCountdownStatus(milestone.calculatedDate, referenceDateISO);
      if (countdown.isOverdue) {
        overdueCount += 1;
      } else if (countdown.diffDays <= withinDays) {
        dueSoonCount += 1;
      }
    }
  }

  if (overdueCount > 0) {
    return {
      level: 'behind',
      label: "You're behind",
      sub: `${overdueCount} task${overdueCount > 1 ? 's are' : ' is'} overdue`,
      overdueCount,
      dueSoonCount,
    };
  }

  if (dueSoonCount > 0) {
    return {
      level: 'almost_ahead',
      label: "You're almost ahead",
      sub: `${dueSoonCount} item${dueSoonCount > 1 ? 's need' : ' needs'} your attention`,
      overdueCount,
      dueSoonCount,
    };
  }

  return {
    level: 'ahead',
    label: "You're ahead",
    sub: 'Nothing else due this week',
    overdueCount,
    dueSoonCount,
  };
}

export interface UpcomingMilestoneItem {
  eventId: string;
  eventTitle: string;
  milestoneId: string;
  title: string;
  dueLabel: string;
  diffDays: number;
  importance: ActionImportance;
}

export interface UpcomingMilestones {
  thisWeek: UpcomingMilestoneItem[];
  nextMonth: UpcomingMilestoneItem[];
  further: UpcomingMilestoneItem[];
}

const IMPORTANCE_WEIGHT: Record<ActionImportance, number> = { critical: 0, important: 1, routine: 2 };

/**
 * Buckets every outstanding, non-overdue milestone by how far out it is due
 * - overdue items are deliberately excluded here, since those already
 * surface as "behind" in computeSimpleAheadStatus and under Needs Attention;
 * this is only for the calm, forward-looking view of what's still ahead.
 * `further` (beyond nextMonthDays) is meant for a "want to get further
 * ahead?" prompt, so it's sorted by importance first - a lone routine task
 * six months out isn't worth surfacing, but a critical one is.
 */
export function computeUpcomingMilestones(
  events: CalendarEvent[],
  referenceDateISO: string,
  options: { thisWeekDays?: number; nextMonthDays?: number } = {}
): UpcomingMilestones {
  const thisWeekDays = options.thisWeekDays ?? 7;
  const nextMonthDays = options.nextMonthDays ?? 30;

  const thisWeek: UpcomingMilestoneItem[] = [];
  const nextMonth: UpcomingMilestoneItem[] = [];
  const further: UpcomingMilestoneItem[] = [];

  for (const event of events) {
    const outstanding = actionableMilestones(event.milestones).filter((m) => m.status !== 'completed');
    for (const milestone of outstanding) {
      const countdown = getCountdownStatus(milestone.calculatedDate, referenceDateISO);
      if (countdown.isOverdue) continue;

      const item: UpcomingMilestoneItem = {
        eventId: event.id,
        eventTitle: event.title,
        milestoneId: milestone.id,
        title: milestone.title,
        dueLabel: countdown.label,
        diffDays: countdown.diffDays,
        importance: inferMilestoneImportance(milestone),
      };

      if (countdown.diffDays <= thisWeekDays) {
        thisWeek.push(item);
      } else if (countdown.diffDays <= nextMonthDays) {
        nextMonth.push(item);
      } else {
        further.push(item);
      }
    }
  }

  const byDueDate = (a: UpcomingMilestoneItem, b: UpcomingMilestoneItem) => a.diffDays - b.diffDays;
  thisWeek.sort(byDueDate);
  nextMonth.sort(byDueDate);
  further.sort((a, b) => IMPORTANCE_WEIGHT[a.importance] - IMPORTANCE_WEIGHT[b.importance] || byDueDate(a, b));

  return { thisWeek, nextMonth, further };
}

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
    diffDays: best.countdown.diffDays,
    importance: best.importance,
  };
}

export type ActionTheme = 'documents' | 'packing' | 'gifts' | 'money' | 'calls_confirmations' | 'logistics' | 'other';

const THEME_LABELS: Record<ActionTheme, string> = {
  documents: 'Documents',
  packing: 'Packing',
  gifts: 'Gifts',
  money: 'Money',
  calls_confirmations: 'Calls and confirmations',
  logistics: 'Logistics',
  other: 'Other',
};

// Checked in this order (first match wins) - most specific topics before
// the more generic ones, so e.g. "Book flight" lands in logistics rather
// than the broader calls_confirmations bucket.
const THEME_PATTERNS: Array<[ActionTheme, RegExp]> = [
  ['documents', /\b(passport|visa|esta|eta|permit|licen[cs]e|insurance|waiver|entry\s*authorization|travel\s*authorization)\b/i],
  ['packing', /\b(pack(?:ing|ed)?|luggage|suitcase|kit\s*bag|gear|uniform|boots|cleats|shin\s*guards?|backpack|outfit|wardrobe|clothes|costume)\b/i],
  ['gifts', /\b(gift|present|flowers|\bcard\b)\b/i],
  ['money', /\b(budget|payment|deposit|invoice|kitty|expense)\b/i],
  ['logistics', /\b(transport|travel|flight|flights|carpool|parking|directions?|address|departure|airport)\b/i],
  ['calls_confirmations', /\b(confirm(?:ed|ation)?|book(?:ing|ed)?|rsvp|reservation|reserve[d]?|call|phone|appointment)\b/i],
];

/**
 * Infers which "kind of thing you'd batch together" an action falls under
 * (packing, calls, documents...) - the GTD "context" idea (@calls,
 * @errands) applied to this data, so actions across different events but
 * of the same practical type can be surfaced together instead of only
 * grouped per-event.
 */
export function inferActionTheme(milestone: TMinusMilestone): ActionTheme {
  const text = `${milestone.title} ${milestone.description || ''}`.toLowerCase();
  for (const [theme, pattern] of THEME_PATTERNS) {
    if (pattern.test(text)) return theme;
  }
  return 'other';
}

export interface ThemeClusterAction {
  eventId: string;
  eventTitle: string;
  milestoneId: string;
  title: string;
  dueLabel: string;
  isOverdue: boolean;
}

export interface ThemeCluster {
  theme: ActionTheme;
  label: string;
  count: number;
  eventTitles: string[];
  actions: ThemeClusterAction[];
}

/**
 * Groups outstanding actions across every active event by inferred theme -
 * "This week, focus on: Packing (3 items across 2 trips)" instead of
 * listing the same kind of task separately under each event. Only themes
 * with at least `minClusterSize` items are returned (a lone item isn't a
 * batching opportunity), sorted largest-first and capped at `maxClusters`
 * so this stays a short, actionable suggestion rather than a full taxonomy.
 * `other` is never returned - it's a catch-all with no coherent batching
 * value by definition.
 */
export function computeThisWeekFocus(
  events: CalendarEvent[],
  referenceDateISO: string,
  options: { withinDays?: number; minClusterSize?: number; maxClusters?: number } = {}
): ThemeCluster[] {
  const withinDays = options.withinDays ?? 14;
  const minClusterSize = options.minClusterSize ?? 2;
  const maxClusters = options.maxClusters ?? 3;

  const clusters = new Map<ActionTheme, ThemeCluster>();

  for (const event of events) {
    const outstanding = actionableMilestones(event.milestones).filter((m) => m.status !== 'completed');
    for (const milestone of outstanding) {
      const countdown = getCountdownStatus(milestone.calculatedDate, referenceDateISO);
      const withinHorizon = countdown.isOverdue || countdown.diffDays <= withinDays;
      if (!withinHorizon) continue;

      const theme = inferActionTheme(milestone);
      if (theme === 'other') continue;

      const existing = clusters.get(theme) || {
        theme,
        label: THEME_LABELS[theme],
        count: 0,
        eventTitles: [],
        actions: [],
      };
      existing.count += 1;
      if (!existing.eventTitles.includes(event.title)) {
        existing.eventTitles.push(event.title);
      }
      existing.actions.push({
        eventId: event.id,
        eventTitle: event.title,
        milestoneId: milestone.id,
        title: milestone.title,
        dueLabel: countdown.label,
        isOverdue: countdown.isOverdue,
      });
      clusters.set(theme, existing);
    }
  }

  return Array.from(clusters.values())
    .filter((c) => c.count >= minClusterSize)
    .map((c) => ({
      ...c,
      // Most urgent action in the cluster first, so opening it up shows
      // what actually needs doing soonest rather than insertion order.
      actions: [...c.actions].sort((a, b) => Number(b.isOverdue) - Number(a.isOverdue)),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, maxClusters);
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
