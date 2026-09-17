/**
 * Copy + status derivation for the recurring-user animated landing
 * ("The Road Ahead"). Deliberately split out of the component so the
 * counting/bucketing logic - the part most likely to have an off-by-one or
 * an empty-state bug - can be unit tested the same way readiness.ts is,
 * without needing to mount a component or fake framer-motion/localStorage.
 *
 * Reuses computeOverdueMilestones / computeWeeklyMilestonePreview
 * (readiness.ts) and getCountdownStatus (tminusRules.ts) rather than
 * re-implementing "what's overdue / what's due this week / what's coming
 * up" bucketing a third time - those two already back MyWeekAhead.tsx and
 * EventTimelineRadar.tsx.
 */
import { CalendarEvent } from '../types';
import { getCountdownStatus } from './tminusRules';
import { computeOverdueMilestones, computeWeeklyMilestonePreview } from './readiness';

export type StripeOneLevel = 'overdue' | 'due_soon' | 'clear';

export interface StripeOneStatus {
  /** Drives stripe 1's color: red / amber / sage-green (see RecurringUserLanding's STRIPE_ONE_STYLES). */
  level: StripeOneLevel;
  /** e.g. "1 task needs attention" / "3 tasks to finish the week" / "All clear this week". */
  copy: string;
}

/**
 * Stripe 1 ("THIS WEEK"): red if anything is overdue, amber if nothing
 * overdue but something is due within the next 7 days, sage-green if the
 * week is genuinely clear. Uses whichever count is "more true" - overdue
 * always wins over due-soon, matching the overdue-first framing already
 * used in MyWeekAhead (Overdue section before This Week section).
 */
export function computeStripeOneStatus(events: CalendarEvent[], referenceDateISO: string): StripeOneStatus {
  if (events.length === 0) {
    return { level: 'clear', copy: 'Nothing tracked yet' };
  }

  const overdueCount = computeOverdueMilestones(events, referenceDateISO).length;
  if (overdueCount > 0) {
    return {
      level: 'overdue',
      copy: `${overdueCount} task${overdueCount === 1 ? '' : 's'} need${overdueCount === 1 ? 's' : ''} attention`,
    };
  }

  const [thisWeekBucket] = computeWeeklyMilestonePreview(events, referenceDateISO, { weeks: 1 });
  const thisWeekCount = thisWeekBucket?.items.length ?? 0;
  if (thisWeekCount > 0) {
    return {
      level: 'due_soon',
      copy: `${thisWeekCount} task${thisWeekCount === 1 ? '' : 's'} to finish the week`,
    };
  }

  return { level: 'clear', copy: 'All clear this week' };
}

/**
 * Number of tracked events whose date falls within the next `windowDays`
 * days (default 30), excluding anything already overdue/past. Counts
 * events directly rather than milestones - "4 major events coming up"
 * reads as a count of things, not a count of prep steps.
 */
export function computeUpcomingEventCount(
  events: CalendarEvent[],
  referenceDateISO: string,
  windowDays: number = 30
): number {
  return events.filter((event) => {
    const countdown = getCountdownStatus(event.eventDate, referenceDateISO);
    return !countdown.isOverdue && countdown.diffDays <= windowDays;
  }).length;
}

/** Stripe 2 ("NEXT 30 DAYS"): e.g. "4 major events coming up". */
export function computeStripeTwoCopy(events: CalendarEvent[], referenceDateISO: string): string {
  if (events.length === 0) {
    return 'Nothing tracked yet';
  }

  const count = computeUpcomingEventCount(events, referenceDateISO);
  if (count === 0) {
    return 'Nothing on the horizon yet';
  }

  return `${count} major event${count === 1 ? '' : 's'} coming up`;
}
