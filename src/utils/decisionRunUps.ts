import type { CalendarEvent, TMinusMilestone } from '../types.js';

/**
 * The rhythm for things you arrange - only where the user asks for it.
 * A plan starts lean: each booking (flights, a place to stay, a table, a
 * sitter) is one step. The app then asks which bookings to decide together
 * with the group (or, solo, which need more headroom), and only those get
 * three stages:
 *
 *   1. Explore & share  look at options; send a shortlist when others have a say
 *   2. Decide & book    revisit the options and make the final choice
 *   3. Check & verify   arrival times, check-in, transport - how it fits the rest
 *
 * The choice lives on the event (context.stagedBookings, keyed by what is
 * booked, so it survives the planner rewording a step); applyStaging adds
 * or removes the stages to match it. One-step things (packing, buying,
 * ordering) are never staged. Adding stages twice is a no-op (slotKey).
 */

export type StageMode = 'group' | 'headroom';

const DECISION_WORDS =
  /\b(book|booked|booking|reserve|reserved|reservation|hire|hired|rent|rental|arrange|arranged|secure|secured|lock|locked|sign up|register|decide)\b/i;
/** One-step things: never staged, even when phrased like a booking. */
const ONE_STEP_WORDS = /\b(pack|packing|packed|buy|bought|order|ordered|purchase|shopping|groceries|wrap|gift|card|passport|visa|esta|document)\b/i;
const LEADING_VERB = /^(explore|look at|book|reserve|buy|order|purchase|choose|select|pick|decide on|decide|hire|sign up for|register for|secure|lock in|lock|rent|arrange|shortlist\s*(?:&|and)\s*book|shortlist)\s+/i;
/** Outcome words: fine on the decision, wrong while still exploring. */
const STATE_WORDS = /\b(secured|verified|approved|reserved|booked|confirmed|finali[sz]ed|selected|chosen|locked(?:\s+in)?|sorted|arranged|done|ready|in place|completed)\b/gi;
const GROUP_WORDS = /\b(friends|family|team|group|party|colleagues|guests|with)\b/i;

const EXPLORE_WORDS = /\b(options|compare|shortlist|research|look at|browse|explore)\b/i;
const CHECK_WORDS = /\b(check|verify|confirm times|double-check|reconfirm)\b/i;

const RUNUP_PREFIX = 'runup:';
const MAX_DECISIONS = 5;
const DECIDE_PREFIX = 'Decide & book: ';

export function isRunUp(m: TMinusMilestone): boolean {
  return Boolean(m.slotKey?.startsWith(RUNUP_PREFIX));
}

export function isDecisionMilestone(m: TMinusMilestone): boolean {
  if (isRunUp(m) || m.status !== 'pending' || m.isActive === false) return false;
  const title = m.decisionBaseTitle || m.title;
  const bookingLike = m.category === 'booking' || m.deliverableType === 'booking' || m.deliverableType === 'reservation' || DECISION_WORDS.test(title);
  if (!bookingLike) return false;
  // "Buy the cake" / "Pack & passports" are one step, unless they also book something.
  return !(ONE_STEP_WORDS.test(title) && !DECISION_WORDS.test(title));
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

/**
 * What is being arranged, without the verb or the outcome:
 * "Book flights and hotel" -> "flights and hotel",
 * "Flights & Brooklyn Lodging Secured" -> "flights & Brooklyn lodging".
 * Words that are capitalised in `keepCase` (the event's title and place)
 * keep their capital; other Title Case words are lowered.
 */
export function decisionTopic(title: string, keepCase = ''): string {
  let clean = title.replace(new RegExp(`^${DECIDE_PREFIX}`), '').replace(/^[^:]{1,30}:\s*/, '').trim();
  clean = clean.replace(LEADING_VERB, '').replace(/^(?:the|a|an|our|my|your)\s+/i, '').trim();
  clean = clean
    .replace(STATE_WORDS, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s*(?:&|and)\s*(?:&|and)\s*/gi, ' & ')
    .replace(/^\s*(?:&|and)\s+|\s+(?:&|and)\s*$/gi, '')
    .trim();
  const topic = clean || title;
  const keep = new Set((keepCase.match(/\b[A-Z][\p{L}'-]+/gu) || []).map((w) => w.toLowerCase()));
  return topic
    .split(' ')
    .map((w) => (/^[A-Z][a-z]/.test(w) && !/[A-Z]{2}/.test(w) && !keep.has(w.toLowerCase()) ? w.toLowerCase() : w))
    .join(' ');
}

/** What to check once it's booked, by what it is ("arrival times, check-in, transfers"). */
export function checkPoints(topic: string): string {
  const t = topic.toLowerCase();
  const points: string[] = [];
  const add = (...p: string[]) => p.forEach((x) => !points.includes(x) && points.push(x));
  if (/flight|plane|train|ferry|bus\b|coach/.test(t)) add('arrival times', 'transfers');
  if (/lodging|hotel|stay|accommodation|airbnb|apartment|room|villa|cabin|hostel/.test(t)) add('check-in');
  if (/car|rental|taxi|transport|shuttle|parking/.test(t)) add('pick-up');
  if (/restaurant|dinner|table|dining|lunch|brunch/.test(t)) add('booking time', 'getting there');
  if (/activit|ticket|tour|show|concert|excursion|museum|class|lesson/.test(t)) add('times', 'meeting point');
  if (/sitter|pet|dog|cat|care|babysit|nanny/.test(t)) add('dates', 'handover');
  if (/venue|hall|location|space/.test(t)) add('access', 'setup time');
  if (points.length === 0) add('details', 'timing');
  return points.slice(0, 3).join(', ');
}

const words = (text: string) => new Set(text.toLowerCase().match(/[a-z]{4,}/g) || []);

/** The plan already has this stage for the decision (e.g. the AI wrote one), so don't add it again. */
function planAlreadyHas(milestones: TMinusMilestone[], decision: TMinusMilestone, pattern: RegExp, after: boolean): boolean {
  const topicWords = words(decisionTopic(decision.decisionBaseTitle || decision.title));
  return milestones.some(
    (m) =>
      m !== decision &&
      !isRunUp(m) &&
      (after ? m.calculatedDate >= decision.calculatedDate : m.calculatedDate <= decision.calculatedDate) &&
      pattern.test(m.title) &&
      [...words(m.title)].some((w) => topicWords.has(w))
  );
}

const DAY_MS = 86_400_000;
const dayOf = (iso: string) => iso.slice(0, 10);
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${dayOf(b)}T12:00:00Z`) - Date.parse(`${dayOf(a)}T12:00:00Z`)) / DAY_MS);
const shiftDay = (iso: string, days: number) => new Date(Date.parse(`${dayOf(iso)}T12:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

/**
 * How many days before the decision exploring starts, scaled to the time
 * there is: a roomy decision gets a week, a close one a day or two. Null
 * when there's no room at all.
 */
export function runUpSpacing(daysUntilDecision: number, headroom = false): { look: number } | null {
  if (daysUntilDecision >= 17 && headroom) return { look: 14 };
  if (daysUntilDecision >= 10) return { look: headroom ? 9 : 7 };
  if (daysUntilDecision >= 5) return { look: headroom ? 4 : 4 };
  if (daysUntilDecision >= 2) return { look: 2 };
  return null;
}

/** What a booking is about, as a stable key ("flights & lodging") - survives rewording and new ids. */
export function stagingKey(m: Pick<TMinusMilestone, 'title' | 'decisionBaseTitle'>): string {
  return decisionTopic(m.decisionBaseTitle || m.title)
    .toLowerCase()
    .replace(/[^a-z0-9&\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** How the user wants this booking handled, if they picked it. */
export function stageModeFor(event: Pick<CalendarEvent, 'context'>, m: TMinusMilestone): StageMode | undefined {
  const map = (event.context?.stagedBookings || {}) as Record<string, StageMode>;
  return map[stagingKey(m)];
}

/** The plan's bookings the user can choose to stage: key, label ("Flights & lodging"), id. */
export function stageableBookings(event: Pick<CalendarEvent, 'title' | 'location' | 'context'>, milestones: TMinusMilestone[]): Array<{ key: string; label: string; id: string }> {
  const keepCase = `${event.title || ''} ${event.location || ''} ${event.context?.destination || ''}`;
  const seen = new Set<string>();
  return milestones
    // A booking that is still an open choice is asked about on its own first.
    .filter((m) => m.isActive !== false && isDecisionMilestone(m) && !m.needsRefinement)
    .sort((a, b) => a.calculatedDate.localeCompare(b.calculatedDate))
    .flatMap((m) => {
      const key = stagingKey(m);
      if (!key || seen.has(key)) return [];
      seen.add(key);
      const topic = decisionTopic(m.decisionBaseTitle || m.title, keepCase);
      return [{ key, label: topic.charAt(0).toUpperCase() + topic.slice(1), id: m.id }];
    })
    .slice(0, MAX_DECISIONS);
}

/**
 * Days after the decision to check and verify: a week before the event when
 * there's room, else halfway between booking and the event. Null when the
 * decision is (almost) the day itself.
 */
export function checkOffset(daysFromDecisionToEvent: number): number | null {
  if (daysFromDecisionToEvent < 2) return null;
  if (daysFromDecisionToEvent >= 9) return daysFromDecisionToEvent - 7;
  return Math.max(1, Math.floor(daysFromDecisionToEvent / 2));
}

export function buildDecisionRunUps(event: CalendarEvent, milestones: TMinusMilestone[], referenceDate: string): TMinusMilestone[] {
  const today = dayOf(new Date(referenceDate).toISOString());
  const existing = new Set(milestones.filter(isRunUp).map((m) => m.slotKey));
  const keepCase = `${event.title || ''} ${event.location || ''} ${event.context?.destination || ''}`;
  // Only the bookings the user picked.
  const decisions = milestones
    .filter((m) => isDecisionMilestone(m) && stageModeFor(event, m))
    .sort((a, b) => a.calculatedDate.localeCompare(b.calculatedDate))
    .slice(0, MAX_DECISIONS);

  const added: TMinusMilestone[] = [];
  for (const d of decisions) {
    const mode = stageModeFor(event, d);
    const share = mode === 'group';
    const topic = decisionTopic(d.decisionBaseTitle || d.title, keepCase);
    const step = (key: 'look' | 'check', date: string, title: string, description: string) => {
      const slotKey = `${RUNUP_PREFIX}${d.id}:${key}`;
      if (existing.has(slotKey) || planAlreadyHas(milestones, d, key === 'look' ? EXPLORE_WORDS : CHECK_WORDS, key === 'check')) return;
      const daysToEvent = Math.max(0, daysBetween(date, event.eventDate));
      added.push({
        id: `${d.id}-runup-${key}`,
        eventId: d.eventId,
        title,
        description,
        category: d.category,
        status: 'pending',
        tMinusOffsetMinutes: -daysToEvent * 1440,
        tMinusLabel: `T-${daysToEvent}d`,
        calculatedDate: `${date}${d.calculatedDate.slice(10) || 'T09:00:00'}`,
        // The user asked for these, so they show at every help level.
        tier: d.tier,
        isActive: true,
        slotKey,
        kind: 'milestone',
        deliverables: [],
        phase: d.phase,
      });
    };

    // 1. Explore & share - only while there's time before the decision.
    const spacing = daysBetween(today, d.calculatedDate) >= 2 ? runUpSpacing(daysBetween(today, d.calculatedDate), mode === 'headroom') : null;
    if (spacing) {
      step(
        'look',
        shiftDay(d.calculatedDate, -spacing.look),
        share ? `Explore & share options: ${topic}` : `Explore options: ${topic}`,
        share
          ? `Shortlist a few options and send them to the group. Ask for a reply before ${dayLabel(d.calculatedDate)}, when you decide and book.`
          : `Shortlist a few options so the choice on ${dayLabel(d.calculatedDate)} is easy. Nothing to book yet.`
      );
    }

    // 3. Check & verify - after booking, in time to fix what doesn't fit.
    // A trip has one "Check the whole trip" step for all bookings together
    // (tripBasics.ts); other events check each picked booking.
    const after = event.category === 'travel_trip' ? null : checkOffset(daysBetween(d.calculatedDate, event.eventDate));
    if (after !== null) {
      const points = checkPoints(topic);
      step(
        'check',
        shiftDay(d.calculatedDate, after),
        `Check & verify: ${topic} (${points})`,
        `Look at the confirmations together: do ${points} line up with the rest of the plan?`
      );
    }
  }
  return added;
}

function dayLabel(iso: string): string {
  return new Date(`${dayOf(iso)}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
}

/**
 * The milestones with the three stages around each decision, in date order:
 * run-ups added, and each decision named "Decide & book: ..." (its own title
 * kept in decisionBaseTitle, restored by restoreDecisionTitles).
 */
export function withDecisionRunUps(event: CalendarEvent, milestones: TMinusMilestone[], referenceDate: string): TMinusMilestone[] {
  const added = buildDecisionRunUps(event, milestones, referenceDate);
  const keepCase = `${event.title || ''} ${event.location || ''} ${event.context?.destination || ''}`;
  const decisionIds = new Set(
    milestones
      .filter((m) => isDecisionMilestone(m) && stageModeFor(event, m))
      .sort((a, b) => a.calculatedDate.localeCompare(b.calculatedDate))
      .slice(0, MAX_DECISIONS)
      .map((m) => m.id)
  );
  let renamed = false;
  const named = milestones.map((m) => {
    if (!decisionIds.has(m.id) || m.decisionBaseTitle) return m;
    renamed = true;
    const topic = decisionTopic(m.title, keepCase);
    return { ...m, decisionBaseTitle: m.title, title: `${DECIDE_PREFIX}${topic}` };
  });
  if (added.length === 0 && !renamed) return milestones;
  return [...named, ...added].sort((a, b) => a.calculatedDate.localeCompare(b.calculatedDate));
}

/**
 * Plans saved before the three-stage rhythm had "Look at options: X Secured"
 * and a separate "Share X options with the group". Open ones become one
 * "Explore & share options: X" step (the share step is folded in), and the
 * booking itself becomes "Decide & book: X". Done or ticked-off steps stay as
 * they were. Returns the same array when there is nothing to upgrade.
 */
export function upgradeLegacyRunUps(event: CalendarEvent): CalendarEvent {
  const milestones = event.milestones || [];
  const legacy = milestones.some((m) => isRunUp(m) && m.status === 'pending' && /^(Look at options: |Share .* options with the group$)/.test(m.title));
  if (!legacy) return event;
  const keepCase = `${event.title || ''} ${event.location || ''} ${event.context?.destination || ''}`;
  const share = involvesOthers(event);
  const byId = new Map(milestones.map((m) => [m.id, m]));
  const upgraded = milestones.map((m) => {
    if (!isRunUp(m) || m.status !== 'pending') return m;
    const [, decisionId, key] = (m.slotKey || '').match(/^runup:(.+):(look|share)$/) || [];
    if (!decisionId) return m;
    const decision = byId.get(decisionId);
    const topic = decisionTopic(decision?.decisionBaseTitle || decision?.title || m.title.replace(/^Look at options: /, ''), keepCase);
    if (key === 'share') return { ...m, isActive: false, status: 'skipped' as const };
    return { ...m, title: share ? `Explore & share options: ${topic}` : `Explore options: ${topic}` };
  });
  const decisionIds = new Set(
    upgraded.filter((m) => isRunUp(m) && m.slotKey?.endsWith(':look')).map((m) => (m.slotKey || '').replace(/^runup:|:look$/g, ''))
  );
  const named = upgraded.map((m) =>
    decisionIds.has(m.id) && !m.decisionBaseTitle && m.status === 'pending'
      ? { ...m, decisionBaseTitle: m.title, title: `${DECIDE_PREFIX}${decisionTopic(m.title, keepCase)}` }
      : m
  );
  return { ...event, milestones: named };
}

/**
 * Makes the plan match the user's picks (context.stagedBookings): open stages
 * of bookings no longer picked are removed and those bookings get their own
 * titles back; picked bookings get their stages. Only once the user has
 * answered (context.stagingAnswered) - older plans are left as they are.
 */
export function applyStaging(event: CalendarEvent, milestones: TMinusMilestone[], referenceDate: string): TMinusMilestone[] {
  if (!event.context?.stagingAnswered) return milestones;
  const byId = new Map(milestones.map((m) => [m.id, m]));
  const staged = (m: TMinusMilestone | undefined) => Boolean(m && stageModeFor(event, m));
  const cleaned = milestones
    .filter((m) => {
      if (!isRunUp(m) || m.status !== 'pending') return true;
      const decisionId = (m.slotKey || '').replace(/^runup:/, '').replace(/:(look|share|check)$/, '');
      return staged(byId.get(decisionId));
    })
    .map((m) => {
      if (!m.decisionBaseTitle || staged(m) || m.status !== 'pending') return m;
      const { decisionBaseTitle, ...rest } = m;
      return { ...rest, title: decisionBaseTitle };
    });
  return withDecisionRunUps(event, cleaned, referenceDate);
}

/** Back from Extensive: bookings staged automatically by older versions get their own titles again. */
export function restoreDecisionTitles(milestones: TMinusMilestone[]): TMinusMilestone[] {
  const autoStaged = new Set(
    milestones
      .filter((m) => isRunUp(m) && m.tier === 'extensive')
      .map((m) => (m.slotKey || '').replace(/^runup:/, '').replace(/:(look|share|check)$/, ''))
  );
  return milestones.map((m) => {
    if (!m.decisionBaseTitle || !autoStaged.has(m.id)) return m;
    const { decisionBaseTitle, ...rest } = m;
    return { ...rest, title: decisionBaseTitle };
  });
}
