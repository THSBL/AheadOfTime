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
  completedCount: number;
  totalCount: number;
}

/**
 * A single, unambiguous "am I ahead of time?" reading for the whole
 * dashboard - exactly three states, each with one non-contradictory line.
 * computeOverallAheadStatus's six-level model is genuinely useful for
 * categorizing events into "needs attention"/"coming up"/"already ahead"
 * lists further down the page, but its summary text ("Nothing due yet." +
 * "One important item is still outstanding.") can read as self-
 * contradictory when both clauses fire at once. This collapses the same
 * underlying counts into a single clean verdict instead - deliberately
 * softened so a couple of barely-late items don't read as a crisis:
 * - "behind": 3+ items overdue, or any single item overdue by more than 3
 *   days - genuinely falling behind, not just a little late.
 * - "almost_ahead": otherwise, anything overdue (tolerated - 1-2 minor,
 *   recent items) or due within the week still needs wrapping up.
 * - "ahead": nothing overdue and nothing due this week either.
 */
export function computeSimpleAheadStatus(
  events: CalendarEvent[],
  referenceDateISO: string,
  withinDays: number = 7
): SimpleAheadStatus {
  let overdueCount = 0;
  let maxOverdueDays = 0;
  let dueSoonCount = 0;
  let completedCount = 0;
  let totalCount = 0;

  for (const event of events) {
    const actionable = actionableMilestones(event.milestones);
    totalCount += actionable.length;
    completedCount += actionable.filter((m) => m.status === 'completed').length;

    const outstanding = actionable.filter((m) => m.status !== 'completed');
    for (const milestone of outstanding) {
      const countdown = getCountdownStatus(milestone.calculatedDate, referenceDateISO);
      if (countdown.isOverdue) {
        overdueCount += 1;
        maxOverdueDays = Math.max(maxOverdueDays, Math.abs(countdown.diffDays));
      } else if (countdown.diffDays <= withinDays) {
        dueSoonCount += 1;
      }
    }
  }

  const base = { overdueCount, dueSoonCount, completedCount, totalCount };

  if (overdueCount >= 3 || maxOverdueDays > 3) {
    return {
      ...base,
      level: 'behind',
      label: 'You are falling behind',
      sub: `${overdueCount} item${overdueCount === 1 ? '' : 's'} need${overdueCount === 1 ? 's' : ''} attention before moving ahead`,
    };
  }

  const wrapUpCount = overdueCount + dueSoonCount;
  if (wrapUpCount > 0) {
    return {
      ...base,
      level: 'almost_ahead',
      label: 'You are almost ahead',
      sub: `${wrapUpCount} item${wrapUpCount === 1 ? '' : 's'} to wrap up this week`,
    };
  }

  return {
    ...base,
    level: 'ahead',
    label: 'You are Ahead of Time',
    sub: 'Nothing else due this week',
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
  theme: ActionTheme;
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
    diffDays: best.countdown.diffDays,
    importance: best.importance,
  };
}

export type ActionTheme =
  | 'bookings_logistics'
  | 'purchases_gifts_supplies'
  | 'deliverables_preparation'
  | 'outreach_communication'
  | 'administration'
  | 'packing_essentials'
  | 'other';

export const THEME_LABELS: Record<ActionTheme, string> = {
  bookings_logistics: 'Bookings & Logistics',
  purchases_gifts_supplies: 'Purchases, Gifts & Supplies',
  deliverables_preparation: 'Deliverables & Preparation',
  outreach_communication: 'Outreach & Communication',
  administration: 'Administration',
  packing_essentials: 'Packing & Essentials',
  other: 'Other',
};

// Checked in this order (first match wins) - most specific topics before
// the more generic ones. administration and deliverables_preparation go
// first since their keywords are the most distinctive; bookings_logistics
// is checked before outreach_communication so e.g. "Book flight tickets"
// lands in logistics rather than the broader outreach "book" keyword;
// purchases is checked before packing so e.g. "Buy hiking boots" lands in
// purchases rather than packing's bare "boots" keyword.
// A few keywords below are written to tolerate the past-participle titles
// this app's own milestone-naming convention favors (see
// SHARED_PLANNING_RULES's "MUST be named as past-participle or
// state-change achievements" rule, e.g. "Flights & Accommodations
// Locked", "Headcount & Group Costs Settled") - a bare stem like "settle"
// or "deposit" does NOT match its own "-ed" form under a trailing \b
// (the boundary fails between two word characters), so real titles using
// the completed/past form were silently falling through to no match at
// all and landing in the catch-all "Other" bucket instead of a real
// theme, even though the word is right there in the title.
const THEME_PATTERNS: Array<[ActionTheme, RegExp]> = [
  [
    'administration',
    /\b(cutoff|cancel(?:led|lation)?|membership|trial|budget|expense|settl(?:e[ds]?|ing)|invoic(?:e|ed|ing)|payment|deposit(?:ed|ing)?|passport|visa|esta|eta|permit|licen[cs]e|insurance|waiver|authorization|documents?|renew(?:ed|al)?)\b/i,
  ],
  [
    'deliverables_preparation',
    /\b(draft|peer[\s-]?review|rehearsal|dry[\s-]?run|a\/?v\s*check|agenda|scope|deck|slides?|presentation|recital|practice|demo)\b/i,
  ],
  [
    'bookings_logistics',
    /\b(flights?|hotels?|trains?|tours?|rental\s*(?:car|vehicle)|vehicle\s*rental|transit|transport|airport|departure|carpool|parking|directions?|\baddress\b|logistics|bookings?|venue|itinerary)\b/i,
  ],
  [
    'outreach_communication',
    /\b(rsvps?|invit(?:e|ation)s?|confirm(?:ed|ation)?|reservation|reserve[d]?|book(?:ing|ed)?|call|phone|appointment|stakeholders?|alignment|coordinate|headcount|guests?|dining)\b/i,
  ],
  ['purchases_gifts_supplies', /\b(gift|present|buy|purchase|order|cake|drinks?|grocery|groceries|supplies|adapters?|sunscreen|flowers|\bcard\b)\b/i],
  ['packing_essentials', /\b(pack(?:ing|ed)?|luggage|suitcase|kit\s*bag|gear|uniform|boots|cleats|shin\s*guards?|backpack|outfit|wardrobe|clothes|costume)\b/i],
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

export interface MilestoneCluster {
  theme: ActionTheme;
  label: string;
  items: UpcomingMilestoneItem[];
}

/**
 * Groups milestone items by inferred theme so similar tasks (e.g. four
 * separate "send invitations" items, or every flight/hotel booking) can be
 * presented as one "Calls and confirmations (4)" row instead of four
 * near-identical lines. A theme only becomes a real cluster (`items.length
 * > 1`, `label` = the theme name) once at least two items share it; a lone
 * item - or any 'other' item, too generic to name as a group - stays its
 * own single-item entry, so callers can render every item uniformly and
 * tell grouped from standalone apart via `items.length`.
 */
export function clusterMilestoneItemsByTheme(items: UpcomingMilestoneItem[]): MilestoneCluster[] {
  const byTheme = new Map<ActionTheme, UpcomingMilestoneItem[]>();
  for (const item of items) {
    const list = byTheme.get(item.theme) || [];
    list.push(item);
    byTheme.set(item.theme, list);
  }

  const clusters: MilestoneCluster[] = [];
  const standalone: UpcomingMilestoneItem[] = [];
  for (const [theme, list] of byTheme) {
    if (theme !== 'other' && list.length >= 2) {
      clusters.push({ theme, label: THEME_LABELS[theme], items: list });
    } else {
      standalone.push(...list);
    }
  }

  clusters.sort((a, b) => b.items.length - a.items.length);
  standalone
    .sort((a, b) => a.diffDays - b.diffDays)
    .forEach((item) => clusters.push({ theme: item.theme, label: item.title, items: [item] }));

  return clusters;
}

/**
 * Every overdue, outstanding milestone across active events - the concrete
 * list behind computeSimpleAheadStatus's "N tasks are overdue" count, so
 * that number is always backed by N visible, clickable items instead of a
 * single highlighted "next best action" that leaves the rest invisible.
 * Deliberately flat, not theme-clustered: this (and the "this week" bucket
 * of the weekly preview) is the "what should I focus on right now" view,
 * where folding items into a collapsed topic would hide exactly the detail
 * that matters most. Most-overdue first.
 */
export function computeOverdueMilestones(events: CalendarEvent[], referenceDateISO: string): UpcomingMilestoneItem[] {
  const items: UpcomingMilestoneItem[] = [];

  for (const event of events) {
    const outstanding = actionableMilestones(event.milestones).filter((m) => m.status !== 'completed');
    for (const milestone of outstanding) {
      const countdown = getCountdownStatus(milestone.calculatedDate, referenceDateISO);
      if (!countdown.isOverdue) continue;

      items.push({
        eventId: event.id,
        eventTitle: event.title,
        milestoneId: milestone.id,
        title: milestone.title,
        dueLabel: countdown.label,
        diffDays: countdown.diffDays,
        importance: inferMilestoneImportance(milestone),
        theme: inferActionTheme(milestone),
      });
    }
  }

  items.sort((a, b) => a.diffDays - b.diffDays);
  return items;
}

export interface WeeklyMilestoneBucket {
  key: string;
  label: string;
  items: UpcomingMilestoneItem[];
  clusters: MilestoneCluster[];
}

const WEEK_BUCKET_LABELS = ['This week', 'Next week'];

/**
 * A rolling, week-by-week preview of everything outstanding (overdue items
 * excluded - those belong to computeOverdueMilestones instead), out to
 * `weeks` weeks. A calendar-shaped view rather than one flat "coming up"
 * list, so planning further out still feels concrete ("3 things due the
 * week after next") instead of an undifferentiated pile - and each week's
 * items are theme-clustered the same way as the overdue list, so the
 * "batch similar tasks together" view isn't a separate, easy-to-miss
 * section anymore. Only weeks that actually have something in them produce
 * a bucket. Defaults to a full year: every week collapses to a single
 * label + count until opened, so a generous horizon costs nothing visually
 * and nothing genuinely outstanding silently falls off the edge.
 */
export function computeWeeklyMilestonePreview(
  events: CalendarEvent[],
  referenceDateISO: string,
  options: { weeks?: number } = {}
): WeeklyMilestoneBucket[] {
  const maxWeeks = options.weeks ?? 52;
  const buckets = new Map<number, UpcomingMilestoneItem[]>();

  for (const event of events) {
    const outstanding = actionableMilestones(event.milestones).filter((m) => m.status !== 'completed');
    for (const milestone of outstanding) {
      const countdown = getCountdownStatus(milestone.calculatedDate, referenceDateISO);
      if (countdown.isOverdue) continue;

      const weekIndex = Math.floor(countdown.diffDays / 7);
      if (weekIndex < 0 || weekIndex >= maxWeeks) continue;

      const list = buckets.get(weekIndex) || [];
      list.push({
        eventId: event.id,
        eventTitle: event.title,
        milestoneId: milestone.id,
        title: milestone.title,
        dueLabel: countdown.label,
        diffDays: countdown.diffDays,
        importance: inferMilestoneImportance(milestone),
        theme: inferActionTheme(milestone),
      });
      buckets.set(weekIndex, list);
    }
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a - b)
    .map(([index, rawItems]) => {
      const items = [...rawItems].sort((a, b) => a.diffDays - b.diffDays);
      return {
        key: `week-${index}`,
        label: WEEK_BUCKET_LABELS[index] ?? `In ${index + 1} weeks`,
        items,
        clusters: clusterMilestoneItemsByTheme(items),
      };
    });
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
