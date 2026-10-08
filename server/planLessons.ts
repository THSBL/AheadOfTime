import type { CalendarEvent, EventCategory, TMinusMilestone } from '../src/types.js';

/**
 * Plan lessons: small, approved rules that improve every new plan of one
 * kind ("house moves: add 'Transfer internet and utilities' 3 weeks
 * before"). They come from what users tell us (server/lessonsStore.ts
 * proposes them weekly; the owner approves each one on /admin/lessons).
 *
 * SAFETY, by construction:
 * - A rule is never text for a model. It is data - a category, an action
 *   (add / drop / move), a short step title and a number of days - applied
 *   by the code below AFTER the AI has answered. No rule is ever put in a
 *   prompt, so a rule can't instruct the AI to do anything.
 * - The only free text, the step title, must pass isSafeStepTitle: short,
 *   plain words, no links, addresses, handles, code or instruction words.
 *   It's checked when proposed, when edited, when approved, and again
 *   every time a rule is applied.
 * - At most MAX_PER_PLAN rules touch one plan, and only a new plan (never
 *   an existing one being changed).
 */

export const LESSON_CATEGORIES: EventCategory[] = [
  'birthday_party',
  'hosting_visitors',
  'friends_family',
  'hobbies',
  'festival_concert',
  'travel_trip',
  'dinner_social',
  'project_deadline',
  'booking_trip',
  'subscription',
  'maintenance',
  'kids_school',
  'kids_hobbies',
  'custom',
];

export type LessonAction = 'add' | 'drop' | 'move';

export interface PlanLesson {
  id: string;
  category: EventCategory;
  action: LessonAction;
  /** add: the new step's title. drop/move: the step it's about (for people). */
  stepTitle: string;
  /** drop/move: the words a step's title must all contain to match. */
  match: string[];
  /** add/move: days before the event (negative = after it). */
  daysBefore: number | null;
  /** Only for events whose title has one of these words (required for "Other"). */
  eventWords: string[];
}

export const MAX_PER_PLAN = 3;
export const MAX_APPROVED = 30;

const TITLE_MAX = 60;
const ALLOWED = /^[\p{L}\p{N} ,.'’&()/:+-]+$/u;
/** Words that have no business in a task title and smell of instructions, links or scams. */
const BLOCKED = /\b(ignore|instruction|instructions|prompt|system|assistant|developer|disregard|override|jailbreak|pretend|roleplay|json|script|html|click|link|url|password|login|log in|sign in|verify your|bitcoin|crypto|wallet|gift card|call now|whatsapp|telegram|dm me|http|https|www)\b/i;

/** A plain task title: short words a person would write in a to-do list, nothing else. */
export function isSafeStepTitle(title: unknown): title is string {
  if (typeof title !== 'string') return false;
  const t = title.trim();
  if (t.length < 3 || t.length > TITLE_MAX || t !== title.replace(/\s+/g, ' ').trim()) return false;
  if (!ALLOWED.test(t)) return false;
  if (BLOCKED.test(t)) return false;
  // Domains ("example.com"), long digit runs (phone numbers), too many words.
  if (/[a-z0-9]\.[a-z]{2,}/i.test(t) || /\d{5,}/.test(t.replace(/\s/g, ''))) return false;
  if (t.split(' ').length > 10) return false;
  return true;
}

/** Match words: 1-4 lowercase words of 3+ letters. */
export function cleanMatch(raw: unknown): string[] | null {
  const words = (Array.isArray(raw) ? raw : typeof raw === 'string' ? raw.split(/[\s,]+/) : [])
    .map((w) => String(w).toLowerCase().trim())
    .filter(Boolean);
  if (words.length < 1 || words.length > 4) return null;
  return words.every((w) => /^\p{L}{3,20}$/u.test(w)) ? Array.from(new Set(words)) : null;
}

/**
 * A rule as stored or proposed, checked field by field. Returns null when
 * anything is off - a rule is either fully valid or not used at all.
 */
export function validateLesson(raw: any): Omit<PlanLesson, 'id'> | null {
  const wordsGiven = Array.isArray(raw?.eventWords) ? raw.eventWords.length > 0 : typeof raw?.eventWords === 'string' && raw.eventWords.trim() !== '';
  const eventWords = wordsGiven ? cleanMatch(raw.eventWords) : [];
  if (!eventWords) return null;
  // "Other" is too broad to change every plan in it.
  if (raw?.category === 'custom' && eventWords.length === 0) return null;
  if (!raw || typeof raw !== 'object') return null;
  const category = LESSON_CATEGORIES.includes(raw.category) ? (raw.category as EventCategory) : null;
  const action: LessonAction | null = raw.action === 'add' || raw.action === 'drop' || raw.action === 'move' ? raw.action : null;
  // Exactly what was given (ends trimmed): a title with line breaks or odd spacing is refused, not repaired.
  const stepTitle = typeof raw.stepTitle === 'string' ? raw.stepTitle.trim() : '';
  if (!category || !action || !isSafeStepTitle(stepTitle)) return null;
  const days = Number(raw.daysBefore);
  const daysBefore = Number.isInteger(days) && days >= -60 && days <= 365 ? days : null;
  if ((action === 'add' || action === 'move') && daysBefore === null) return null;
  let match: string[] = [];
  if (action !== 'add') {
    const m = cleanMatch(raw.match);
    if (!m) return null;
    match = m;
  }
  return { category, action, stepTitle, match, daysBefore: action === 'drop' ? null : daysBefore, eventWords };
}

const DAY_MS = 86_400_000;
const dayOf = (iso: string) => String(iso).slice(0, 10);
const shiftDay = (iso: string, days: number) => new Date(Date.parse(`${dayOf(iso)}T12:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
const words = (s: string) => s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3);
const matches = (title: string, match: string[]) => {
  const w = new Set(words(title));
  return match.every((m) => w.has(m) || Array.from(w).some((x) => x.startsWith(m)));
};
/** Is there already a step like this one (most of its words)? */
const hasSimilar = (milestones: TMinusMilestone[], title: string) => {
  const want = words(title);
  if (!want.length) return false;
  return milestones.some((m) => {
    const have = new Set(words(m.title || ''));
    return want.filter((w) => have.has(w)).length / want.length >= 0.6;
  });
};

/**
 * The approved rules for this plan's kind, applied to a NEW plan. Pure:
 * returns the same event object when nothing applies. `onApplied` hears
 * which rules changed something (for the counts on /admin/lessons).
 */
export function applyLessons(event: CalendarEvent, lessons: PlanLesson[], referenceDateIso: string, onApplied?: (ids: string[]) => void): CalendarEvent {
  if (!event?.milestones?.length || !event.eventDate) return event;
  const today = dayOf(referenceDateIso);
  const relevant = lessons.filter((l) => l.category === event.category && (!l.eventWords?.length || l.eventWords.some((w) => matches(event.title || '', [w])))).slice(0, MAX_PER_PLAN);
  if (!relevant.length) return event;
  let milestones = [...event.milestones];
  const applied: string[] = [];
  for (const raw of relevant) {
    // Re-checked on every use: a rule that isn't fully valid does nothing.
    const lesson = validateLesson(raw);
    if (!lesson) continue;
    if (lesson.action === 'drop') {
      const kept = milestones.filter((m) => !(matches(m.title || '', lesson.match) && m.status !== 'completed'));
      // Never empty a plan.
      if (kept.length !== milestones.length && kept.length > 0) {
        milestones = kept;
        applied.push(raw.id);
      }
    } else if (lesson.action === 'move') {
      const date = shiftDay(event.eventDate, -lesson.daysBefore!);
      if (date < today) continue;
      let changed = false;
      milestones = milestones.map((m) => {
        if (!matches(m.title || '', lesson.match) || m.status === 'completed') return m;
        changed = true;
        return { ...m, calculatedDate: `${date}T09:00:00`, tMinusOffsetMinutes: -lesson.daysBefore! * 1440, tMinusLabel: lesson.daysBefore! >= 0 ? `T-${lesson.daysBefore}d` : `Day +${-lesson.daysBefore!}` };
      });
      if (changed) applied.push(raw.id);
    } else {
      const date = shiftDay(event.eventDate, -lesson.daysBefore!);
      if (date < today || hasSimilar(milestones, lesson.stepTitle)) continue;
      milestones.push({
        id: `${event.id}-lesson-${raw.id}`,
        eventId: event.id,
        title: lesson.stepTitle,
        description: '',
        category: 'prep',
        status: 'pending',
        tMinusOffsetMinutes: -lesson.daysBefore! * 1440,
        tMinusLabel: lesson.daysBefore! >= 0 ? `T-${lesson.daysBefore}d` : `Day +${-lesson.daysBefore!}`,
        calculatedDate: `${date}T09:00:00`,
        tier: 'balanced',
        isActive: true,
        slotKey: `lesson:${raw.id}`,
        kind: 'milestone',
        deliverables: [],
      } as TMinusMilestone);
      applied.push(raw.id);
    }
  }
  if (!applied.length) return event;
  milestones.sort((a, b) => String(a.calculatedDate).localeCompare(String(b.calculatedDate)));
  onApplied?.(applied);
  return { ...event, milestones };
}
