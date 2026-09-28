import type { EventCategory } from '../types';
import { detectEventCategory } from './tminusRules.js';

/**
 * Which calendar entries are worth a prep plan, and what kind they are.
 * Shared by Scan agenda (browser) and the daily Background Sync scan
 * (server), so both judge an entry the same way.
 *
 *   plan    - clear kind that needs preparation: ticked by default
 *   unsure  - could go either way (vague title, reminder, subscription):
 *             shown, not ticked
 *   skip    - routine, public holiday, plain birthday reminder, too soon:
 *             folded away
 */

export type ScanVerdict = 'plan' | 'unsure' | 'skip';

export type EntryKind =
  | 'birthday_reminder'
  | 'party'
  | 'trip'
  | 'hosting'
  | 'dinner'
  | 'concert'
  | 'kids_school'
  | 'kids_activity'
  | 'work_deadline'
  | 'subscription'
  | 'medical'
  | 'home_car'
  | 'public_holiday'
  | 'routine'
  | 'other';

export const ENTRY_KIND_LABELS: Record<EntryKind, string> = {
  birthday_reminder: 'Birthday',
  party: 'Party',
  trip: 'Trip',
  hosting: 'Hosting',
  dinner: 'Dinner',
  concert: 'Concert & show',
  kids_school: 'School',
  kids_activity: 'Kids activity',
  work_deadline: 'Work deadline',
  subscription: 'Subscription',
  medical: 'Medical',
  home_car: 'Home & car',
  public_holiday: 'Public holiday',
  routine: 'Routine',
  other: 'Other',
};

/** The plan template each kind uses (the milestone generator works per category). */
const KIND_CATEGORY: Record<EntryKind, EventCategory> = {
  birthday_reminder: 'birthday_party',
  party: 'birthday_party',
  trip: 'travel_trip',
  hosting: 'hosting_visitors',
  dinner: 'dinner_social',
  concert: 'festival_concert',
  kids_school: 'kids_school',
  kids_activity: 'kids_hobbies',
  work_deadline: 'project_deadline',
  subscription: 'subscription',
  medical: 'maintenance',
  home_car: 'maintenance',
  public_holiday: 'custom',
  routine: 'custom',
  other: 'custom',
};

/** What the user taught us (Teach Ahead Of Time swipes, Scan agenda choices). */
export interface TitleRule {
  /** First meaningful word of the title ("padel"), or the whole title when `exact`. */
  key: string;
  /** Match the whole title only: vague titles like "Tom" must not catch "Tom's birthday". */
  exact?: boolean;
  kind: EntryKind;
  verdict: ScanVerdict;
  /** The entry it was learned from, to show in Settings. */
  example: string;
}

export interface ScanPrefs {
  /** Plain birthday reminders ("BDAY Anna"): left out unless the user wants them. */
  birthdays: 'skip' | 'plan';
  /** Per kind: always plan, always skip, or ask ("Right = plan things like this"). */
  kindVerdicts?: Partial<Record<EntryKind, ScanVerdict>>;
  /** Corrections for one kind of title ("Padel with Tom" is a hobby, not a trip). */
  titleRules?: TitleRule[];
  /** When the swipe round was last played or dismissed. */
  lastTeachAt?: string;
}

export const DEFAULT_SCAN_PREFS: ScanPrefs = { birthdays: 'skip' };

const KINDS = Object.keys(ENTRY_KIND_LABELS) as EntryKind[];
const VERDICTS: ScanVerdict[] = ['plan', 'unsure', 'skip'];
const STOPWORDS = new Set(['the', 'and', 'with', 'for', 'met', 'van', 'een', 'het', 'de', 'my', 'our', 'to', 'at', 'in', 'on']);

/** The word a title rule is keyed on: first word of 3+ letters that isn't filler. */
export function titleRuleKey(title: string): string | null {
  const words = (title || '').toLowerCase().normalize('NFKD').replace(/[^\p{L}\s]/gu, ' ').split(/\s+/);
  return words.find((w) => w.length >= 3 && !STOPWORDS.has(w)) || null;
}

/** The whole title, lower case, letters and spaces only (for exact rules). */
export function normalizedTitle(title: string): string {
  return (title || '').toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

/** Validates stored or submitted prefs; unknown values are dropped. */
export function sanitizeScanPrefs(raw: unknown): ScanPrefs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>;
  const prefs: ScanPrefs = { birthdays: r.birthdays === 'plan' ? 'plan' : 'skip' };
  if (r.kindVerdicts && typeof r.kindVerdicts === 'object') {
    const kv: Partial<Record<EntryKind, ScanVerdict>> = {};
    for (const [k, v] of Object.entries(r.kindVerdicts)) {
      if (KINDS.includes(k as EntryKind) && VERDICTS.includes(v as ScanVerdict)) kv[k as EntryKind] = v as ScanVerdict;
    }
    if (Object.keys(kv).length) prefs.kindVerdicts = kv;
  }
  if (Array.isArray(r.titleRules)) {
    const rules = r.titleRules
      .filter((t: any) => t && typeof t.key === 'string' && KINDS.includes(t.kind) && VERDICTS.includes(t.verdict))
      .slice(0, 100)
      .map((t: any) => ({
        key: t.key.slice(0, 80).toLowerCase(),
        ...(t.exact === true ? { exact: true } : {}),
        kind: t.kind,
        verdict: t.verdict,
        example: String(t.example || '').slice(0, 80),
      }));
    if (rules.length) prefs.titleRules = rules;
  }
  if (typeof r.lastTeachAt === 'string' && !isNaN(Date.parse(r.lastTeachAt))) prefs.lastTeachAt = r.lastTeachAt;
  return prefs;
}

export interface EntryInput {
  title: string;
  description?: string;
  /** Days from today to the start. */
  daysAway: number;
  /** Length in days (1 for a single day). */
  durationDays?: number;
  /** Business-only calendars keep work meetings. */
  calendarType?: 'personal' | 'mixed' | 'business' | string;
}

export interface EntryAssessment {
  kind: EntryKind;
  category: EventCategory;
  verdict: ScanVerdict;
  /** One short line on why, shown under the entry. */
  reason: string;
}

// Public / national holidays and days of the year that are markers, not plans.
const PUBLIC_HOLIDAY =
  /^(christmas( day| eve)?|boxing day|new year'?s?( day| eve)?|easter( sunday| monday)?|good friday|ascension( day)?|whit ?(sunday|monday)|pentecost|king'?s day|koningsdag|queen'?s day|liberation day|bevrijdingsdag|labou?r day|may day|bank holiday|public holiday|national holiday|thanksgiving( day)?|independence day|memorial day|veterans day|juneteenth|remembrance (day|sunday)|all saints'? day|carnival|carnaval|second christmas day|tweede kerstdag|eerste kerstdag|hemelvaartsdag|pinksteren|pasen)$/i;

// A birthday entry: "BDAY Anna", "Anna's birthday", "Verjaardag Tom", "🎂 Mila".
const BIRTHDAY = /\b(bday|b-day|birthday|verjaardag|jarig)\b|🎂/i;
// Words that make a birthday something to prepare for.
const BIRTHDAY_PREP = /\b(party|feest|gift|present|cadeau|prep|prepare|celebrat\w*|dinner|surprise|bbq|drinks|borrel|host\w*|organi[sz]e)\b|turns \d+.*(party|celebrat)/i;

const WORK_ROUTINE = /\b(standup|stand-up|1:1|one on one|sync|scrum|catch ?up|status (check|update)|office hours|all hands|retro(spective)?|weekly|daily|team meeting|check-?in)\b/i;
const PERSONAL_ROUTINE = /\b(haircut|hairdresser|kapper|dry clean\w*|cleaning lady|cleaner|gym|workout|yoga|pilates|run(ning)?|laundry|groceries)\b/i;
const MEDICAL = /\b(dentist|tandarts|doctor|huisarts|gp|hospital|ziekenhuis|physio\w*|fysio\w*|check-?up|appointment with dr|dermatolog\w*|orthodont\w*|optician|eye test|therap\w*|vet|veterinar\w*)\b/i;
const MEDICAL_PREP = /\b(surgery|operation|operatie|procedure|vaccin\w*|jab|shots?|mri|ct scan|colonoscopy|fasting|anaesthe\w*|anesthe\w*|biopsy)\b/i;
const HOME_CAR = /\b(car service|oil change|mot|apk|tyres?|tires?|garage|mechanic|plumber|electrician|hvac|boiler|movers?|moving|verhuizen|renovation|contractor)\b/i;
const SUBSCRIPTION = /\b(subscription|renewal|renews|membership|free trial|trial ends|billing|auto-?renew|abonnement|expires?)\b/i;
// Trips: planned holidays and getaways (not public holidays).
const TRIP =
  /\b(trip|vacation|holiday (to|in|at)|on holiday|getaway|city ?break|weekend (in|away|to)|travel|flight|fly(ing)? to|✈|hotel|airbnb|resort|camping|ski(ing)?|cruise|vakantie|reis)\b|✈️/i;
const HOSTING = /\b(hosting|staying with us|visiting us|in town|sleepover|guests?|logeren|house ?guests?|in-laws)\b/i;

export function assessCalendarEntry(input: EntryInput, prefs: ScanPrefs = DEFAULT_SCAN_PREFS): EntryAssessment {
  const base = assessByRules(input, prefs);
  // What the user taught us wins: a rule for this kind of title, then one
  // for the whole kind. Never plans something within 2 days.
  const key = titleRuleKey(input.title);
  const whole = normalizedTitle(input.title);
  const rule =
    prefs.titleRules?.find((t) => t.exact && t.key === whole) ||
    (key ? prefs.titleRules?.find((t) => !t.exact && t.key === key) : undefined);
  if (rule) {
    return withTiming({ kind: rule.kind, category: KIND_CATEGORY[rule.kind], verdict: rule.verdict, reason: 'Your choice' }, input);
  }
  const kindVerdict = prefs.kindVerdicts?.[base.kind];
  if (kindVerdict && kindVerdict !== base.verdict && base.reason !== 'Too soon to prepare') {
    return withTiming({ ...base, verdict: kindVerdict, reason: 'Your choice' }, input);
  }
  return base;
}

function assessByRules(input: EntryInput, prefs: ScanPrefs): EntryAssessment {
  const title = (input.title || '').trim();
  const text = `${title} ${input.description || ''}`;
  const bare = title.replace(/[^\p{L}\p{N}\s'-]/gu, '').trim();

  const result = (kind: EntryKind, verdict: ScanVerdict, reason: string): EntryAssessment => ({
    kind,
    category: KIND_CATEGORY[kind],
    verdict,
    reason,
  });

  if (!title) return result('other', 'skip', 'No title');

  // 1. Public holidays: markers, not plans (a planned holiday is a trip, below).
  if (PUBLIC_HOLIDAY.test(bare)) return result('public_holiday', 'skip', 'Public holiday');

  // 2. Birthdays: plain reminders are left out unless the user wants them,
  //    or the entry says there is something to prepare.
  if (BIRTHDAY.test(text)) {
    if (BIRTHDAY_PREP.test(text)) return withTiming(result('party', 'plan', 'Birthday with something to prepare'), input);
    return prefs.birthdays === 'plan'
      ? withTiming(result('birthday_reminder', 'plan', 'Birthday: a card or gift'), input)
      : result('birthday_reminder', 'skip', 'Birthday reminder');
  }

  // 3. Medical with something to prepare ("travel vaccinations" is not a trip).
  if (MEDICAL.test(text) && MEDICAL_PREP.test(text)) return withTiming(result('medical', 'plan', 'Medical, with preparation'), input);

  // 4. Trips before routine checks: "Flight to Lisbon" is not a routine.
  if (TRIP.test(text) || (/\bholiday\b/i.test(title) && (input.durationDays ?? 1) > 1)) {
    return withTiming(result('trip', 'plan', 'Trip'), input);
  }

  // 5. Subscriptions before routines: "Gym free trial ends" is a renewal.
  if (SUBSCRIPTION.test(text)) return withTiming(result('subscription', 'unsure', 'Renewal: keep or cancel?'), input);

  // 6. Medical otherwise routine, and other routines.
  if (MEDICAL.test(text)) return result('medical', 'skip', 'Routine appointment');
  if (input.calendarType !== 'business' && WORK_ROUTINE.test(title)) return result('routine', 'skip', 'Routine meeting');
  if (PERSONAL_ROUTINE.test(title)) return result('routine', 'skip', 'Routine');
  if (HOME_CAR.test(text)) return withTiming(result('home_car', 'plan', 'Home & car'), input);
  if (HOSTING.test(text)) return withTiming(result('hosting', 'plan', 'Hosting'), input);

  const category = detectEventCategory(title, input.description);
  const byCategory: Partial<Record<EventCategory, EntryKind>> = {
    birthday_party: 'party',
    travel_trip: 'trip',
    hosting_visitors: 'hosting',
    dinner_social: 'dinner',
    festival_concert: 'concert',
    kids_school: 'kids_school',
    kids_hobbies: 'kids_activity',
    project_deadline: 'work_deadline',
    subscription: 'subscription',
    maintenance: 'home_car',
  };
  const kind = byCategory[category];
  // Weekly sport practice etc. is routine; a tournament or recital needs prep.
  if (kind === 'kids_activity' && !/\b(tournament|championship|recital|performance|competition|meet|final|camp|show)\b/i.test(text)) {
    return result('kids_activity', 'unsure', 'Regular activity?');
  }
  if (kind) return withTiming(result(kind, 'plan', ENTRY_KIND_LABELS[kind]), input);

  // 7. Nothing recognisable: short or vague titles ("Tom", "Lunch?") need a human.
  const words = bare.split(/\s+/).filter(Boolean);
  if (words.length <= 2) return withTiming(result('other', 'unsure', 'Not sure what this is'), input);
  return withTiming(result('other', 'unsure', 'Not sure it needs preparation'), input);
}

/** Anything within 2 days is too late to plan ahead for. */
function withTiming(a: EntryAssessment, input: EntryInput): EntryAssessment {
  if (input.daysAway < 2 && a.verdict !== 'skip') return { ...a, verdict: 'skip', reason: 'Too soon to prepare' };
  return a;
}

/**
 * A birthday reminder ("Tom's birthday") gets a small plan, not a party:
 * only the gift and card steps of whatever plan was generated.
 */
export function trimToBirthdayReminderPlan<T extends { title: string }>(milestones: T[]): T[] {
  const keep = milestones.filter((m) => /\b(gift|present|cadeau|card|kaart|wish\w*|congratulat\w*)\b/i.test(m.title));
  return keep.length > 0 ? keep : milestones.slice(0, 2);
}
