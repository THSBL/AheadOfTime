import type { CalendarEvent, TMinusMilestone } from '../types.js';

/**
 * Extensive help = time to decide. Before each decision (a booking, a
 * purchase, a choice), add a run-up: look at the options first, share them
 * with the group when others are involved, and decide on the day of the
 * decision itself. Run-ups are tagged tier 'extensive', so switching down
 * to Balanced hides them again. Adding them twice is a no-op (slotKey).
 */

const DECISION_WORDS = /\b(book|booked|booking|reserve|reserved|reservation|buy|bought|order|purchase|choose|chosen|select|selected|pick|decide|hire|sign up|register|secure|lock|locked|rent)\b/i;
const LEADING_VERB = /^(book|reserve|buy|order|purchase|choose|select|pick|decide on|decide|hire|sign up for|register for|secure|lock in|lock|rent|arrange)\s+/i;
const GROUP_WORDS = /\b(friends|family|team|group|party|colleagues|guests|with)\b/i;

const LOOK_WORDS = /\b(options|compare|shortlist|research|look at|browse|explore)\b/i;
const SHARE_WORDS = /\b(share|send|ask|poll|vote|check with|discuss)\b/i;

const RUNUP_PREFIX = 'runup:';
const MAX_DECISIONS = 4;

export function isRunUp(m: TMinusMilestone): boolean {
  return Boolean(m.slotKey?.startsWith(RUNUP_PREFIX));
}

export function isDecisionMilestone(m: TMinusMilestone): boolean {
  if (isRunUp(m) || m.status !== 'pending' || m.isActive === false) return false;
  return m.category === 'booking' || m.deliverableType === 'booking' || m.deliverableType === 'reservation' || DECISION_WORDS.test(m.title);
}

/** Whether other people have a say, so sharing the options makes sense. */
export function involvesOthers(event: Pick<CalendarEvent, 'title' | 'context' | 'userRole' | 'category'>): boolean {
  const ctx = event.context || {};
  if (typeof ctx.guestCount === 'number' && ctx.guestCount > 1) return true;
  if (ctx.giftType === 'group') return true;
  const role = event.userRole || ctx.userRole;
  if (role === 'organiser' || role === 'co_organiser') return true;
  return GROUP_WORDS.test(event.title || '');
}

/** "Book flights and hotel" -> "flights and hotel"; state-style titles stay whole. */
export function decisionTopic(title: string): string {
  const clean = title.replace(/^[^:]{1,30}:\s*/, '').trim();
  const stripped = clean.replace(LEADING_VERB, '').trim();
  const topic = stripped || clean;
  return topic.charAt(0).toLowerCase() + topic.slice(1);
}

const words = (text: string) => new Set(text.toLowerCase().match(/[a-z]{4,}/g) || []);

/** The plan already has this step for the decision (e.g. the AI wrote one), so don't add it again. */
function planAlreadyHas(milestones: TMinusMilestone[], decision: TMinusMilestone, pattern: RegExp): boolean {
  const topicWords = words(decisionTopic(decision.title));
  return milestones.some(
    (m) =>
      m !== decision &&
      !isRunUp(m) &&
      m.calculatedDate <= decision.calculatedDate &&
      pattern.test(m.title) &&
      [...words(m.title)].some((w) => topicWords.has(w))
  );
}

const DAY_MS = 86_400_000;
const dayOf = (iso: string) => iso.slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${dayOf(b)}T12:00:00Z`) - Date.parse(`${dayOf(a)}T12:00:00Z`)) / DAY_MS);
const shiftDay = (iso: string, days: number) => new Date(Date.parse(`${dayOf(iso)}T12:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

/**
 * How many days before the decision each run-up step lands, scaled to the
 * time there is: a roomy decision gets a week to look and two days to hear
 * back; a close one gets a day or two. Null when there's no room at all.
 */
export function runUpSpacing(daysUntilDecision: number): { look: number; share: number } | null {
  if (daysUntilDecision >= 10) return { look: 7, share: 2 };
  if (daysUntilDecision >= 5) return { look: 4, share: 2 };
  if (daysUntilDecision >= 2) return { look: 2, share: 1 };
  return null;
}

export function buildDecisionRunUps(event: CalendarEvent, milestones: TMinusMilestone[], referenceDate: string): TMinusMilestone[] {
  const today = dayOf(new Date(referenceDate).toISOString());
  const existing = new Set(milestones.filter(isRunUp).map((m) => m.slotKey));
  const share = involvesOthers(event);
  const decisions = milestones
    .filter(isDecisionMilestone)
    .filter((m) => daysBetween(today, m.calculatedDate) >= 2)
    .sort((a, b) => a.calculatedDate.localeCompare(b.calculatedDate))
    .slice(0, MAX_DECISIONS);

  const added: TMinusMilestone[] = [];
  for (const d of decisions) {
    const spacing = runUpSpacing(daysBetween(today, d.calculatedDate));
    if (!spacing) continue;
    const topic = decisionTopic(d.title);
    const step = (key: 'look' | 'share', daysBefore: number, title: string, description: string) => {
      const slotKey = `${RUNUP_PREFIX}${d.id}:${key}`;
      if (existing.has(slotKey) || planAlreadyHas(milestones, d, key === 'look' ? LOOK_WORDS : SHARE_WORDS)) return;
      const offset = d.tMinusOffsetMinutes - daysBefore * 1440;
      const date = shiftDay(d.calculatedDate, -daysBefore);
      const daysToEvent = Math.max(0, daysBetween(date, event.eventDate));
      added.push({
        id: `${d.id}-runup-${key}`,
        eventId: d.eventId,
        title,
        description,
        category: d.category,
        status: 'pending',
        tMinusOffsetMinutes: offset,
        tMinusLabel: `T-${daysToEvent}d`,
        calculatedDate: `${date}${d.calculatedDate.slice(10) || 'T09:00:00'}`,
        tier: 'extensive',
        isActive: true,
        slotKey,
        kind: 'milestone',
        deliverables: [],
        phase: d.phase,
      });
    };
    step('look', spacing.look, `Look at options: ${topic}`, `Compare a few options so the decision on ${shiftLabel(d.calculatedDate)} is easy. Nothing to book yet.`);
    if (share) step('share', spacing.share, `Share ${topic} options with the group`, `Send the shortlist and ask for a reply before ${shiftLabel(d.calculatedDate)}, when you decide and book.`);
  }
  return added;
}

function shiftLabel(iso: string): string {
  return new Date(`${dayOf(iso)}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
}

/** The milestones with run-ups added before each decision, in date order. */
export function withDecisionRunUps(event: CalendarEvent, milestones: TMinusMilestone[], referenceDate: string): TMinusMilestone[] {
  const added = buildDecisionRunUps(event, milestones, referenceDate);
  if (added.length === 0) return milestones;
  return [...milestones, ...added].sort((a, b) => a.calculatedDate.localeCompare(b.calculatedDate));
}
