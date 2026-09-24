import { PlanningUserProfile, RefinementQuestion } from "../types.js";
import { parseNaturalDateRange } from "./tminusRules.js";

export const MAX_REFINEMENT_QUESTIONS = 5;

// Anything that takes the user away from home for a while - the cases where
// a pet or kids left at home need a plan of their own.
const AWAY_FROM_HOME = /\b(trip|travel|travell?ing|vacation|holiday|getaway|dive|diving|divetrip|scuba|ski|skiing|hike|hiking|trek|camping|festival|cruise|abroad|flight|fly|flying|hotel|conference|retreat|honeymoon|backpack\w*|road ?trip|city ?trip|weekend away|visit(ing)? (my |our )?(family|parents|friends) in)\b/i;
const GOING_TO_PLACE = /\b(go|going|fly|flying|travel\w*|trip|heading|off|drive|driving) to [A-Z][a-z]+/;
const MENTIONS_PET = /\b(pet|pets|dog|dogs|puppy|cat|cats|kitten|pet ?sitter|dog ?sitter|kennel|cattery)\b/i;
const MENTIONS_KIDS = /\b(kid|kids|child|children|son|daughter|baby|babysitter|childcare|nanny|grandparents)\b/i;
const RELATIVE_DATE = /\b(today|tonight|tomorrow|this (week|weekend|month)|next (week|weekend|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|in \d+ (days?|weeks?|months?)|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;

export function isAwayFromHomeEvent(text: string): boolean {
  return AWAY_FROM_HOME.test(text) || GOING_TO_PLACE.test(text);
}

/**
 * Questions that come from the user's onboarding profile rather than from
 * the message itself (e.g. they told us they have a dog, so a trip needs a
 * plan for the dog). Deterministic on purpose: these must be asked whether
 * or not Gemini is available or remembers to ask them.
 */
export function buildProfileRefinementQuestions(message: string, profile?: PlanningUserProfile | null): RefinementQuestion[] {
  if (!profile || !message?.trim() || !isAwayFromHomeEvent(message)) return [];
  const questions: RefinementQuestion[] = [];
  if (profile.hasPet && !MENTIONS_PET.test(message)) {
    questions.push({
      id: 'pet_care',
      question: 'Who looks after your pet while you’re away?',
      options: ['Pet sitter', 'Kennel / pet hotel', 'Family or friends', 'Pet comes along'],
      source: 'profile',
    });
  }
  if (profile.familyStructure === 'family_with_kids' && !MENTIONS_KIDS.test(message)) {
    questions.push({
      id: 'kids',
      question: 'Are the kids coming along?',
      options: ['Yes, kids come along', 'No, need childcare', 'Childcare already arranged'],
      source: 'profile',
    });
  }
  return questions;
}

/**
 * Minimal where/when fallback for when Gemini is unavailable, so the
 * refinement step still covers the basics instead of silently vanishing.
 */
export function buildFallbackMessageQuestions(message: string, currentReferenceDate: string): RefinementQuestion[] {
  const questions: RefinementQuestion[] = [];
  const hasDate = Boolean(parseNaturalDateRange(message, currentReferenceDate)) || RELATIVE_DATE.test(message) || /\b\d{4}-\d{2}-\d{2}\b/.test(message);
  if (!hasDate) {
    questions.push({
      id: 'when',
      question: 'When is it?',
      options: [],
      source: 'message',
    });
  }
  return questions;
}

const PET_QUESTION = /\b(pet|dog|cat)\b/i;
const KIDS_QUESTION = /\b(kid|kids|child|children|childcare)\b/i;

/**
 * Gemini's message-based questions first, then any profile question it
 * didn't already cover, capped so the step stays quick to answer.
 */
export function mergeRefinementQuestions(messageQuestions: RefinementQuestion[], profileQuestions: RefinementQuestion[]): RefinementQuestion[] {
  const merged = [...messageQuestions];
  for (const pq of profileQuestions) {
    const topic = pq.id === 'pet_care' ? PET_QUESTION : pq.id === 'kids' ? KIDS_QUESTION : null;
    const alreadyCovered = merged.some((q) => q.id === pq.id || (topic && topic.test(q.question)));
    if (!alreadyCovered) merged.push(pq);
  }
  const seenQuestions = new Set<string>();
  const seenIds = new Set<string>();
  return merged
    .filter((q) => {
      const key = q.question.trim().toLowerCase();
      if (!key || seenQuestions.has(key)) return false;
      seenQuestions.add(key);
      return true;
    })
    .slice(0, MAX_REFINEMENT_QUESTIONS)
    // Answers are keyed by id in the UI, so ids must be unique.
    .map((q, idx) => {
      const id = seenIds.has(q.id) ? `${q.id}_${idx + 1}` : q.id;
      seenIds.add(id);
      return id === q.id ? q : { ...q, id };
    });
}

/** Plain-language profile facts for a Gemini prompt; empty string when none. */
export function describePlanningProfile(profile?: PlanningUserProfile | null): string {
  if (!profile) return '';
  const facts: string[] = [];
  if (profile.homeZipOrLocation) facts.push(`Lives in/near ${profile.homeZipOrLocation}.`);
  if (profile.hasPet) facts.push('Has a pet that needs care whenever they are away from home.');
  if (profile.familyStructure === 'family_with_kids') facts.push('Has kids - trips and evenings out may need childcare or kid-specific prep.');
  else if (profile.familyStructure === 'couple') facts.push('Lives with a partner.');
  return facts.join(' ');
}

export interface ConversationBriefInput {
  originalMessage: string;
  answers?: { question: string; answer: string }[];
  additions?: string[];
}

/**
 * One prompt-ready text holding everything the user said in the creation
 * conversation. Used both as the message for the first plan generation and
 * as context on every later turn, so Gemini always plans against the whole
 * brief ("dive trip to Egypt" + every answer) and never against a single
 * follow-up answer on its own.
 */
export function composeConversationBrief(input: ConversationBriefInput): string {
  const lines = [input.originalMessage.trim()];
  const answered = (input.answers || []).filter((a) => a.answer.trim());
  if (answered.length > 0) {
    lines.push('', 'Details:');
    for (const a of answered) lines.push(`- ${a.question.trim()} ${a.answer.trim()}`);
  }
  const additions = (input.additions || []).map((a) => a.trim()).filter(Boolean);
  if (additions.length > 0) {
    lines.push('', 'Added later:');
    for (const a of additions) lines.push(`- ${a}`);
  }
  return lines.join('\n');
}

/** Keeps only known, well-typed profile fields from an untrusted request body. */
export function sanitizePlanningProfile(raw: unknown): PlanningUserProfile | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const profile: PlanningUserProfile = {};
  if (typeof r.homeZipOrLocation === 'string' && r.homeZipOrLocation.trim()) profile.homeZipOrLocation = r.homeZipOrLocation.trim().slice(0, 120);
  if (typeof r.hasPet === 'boolean') profile.hasPet = r.hasPet;
  if (r.familyStructure === 'single' || r.familyStructure === 'couple' || r.familyStructure === 'family_with_kids') profile.familyStructure = r.familyStructure;
  return Object.keys(profile).length > 0 ? profile : undefined;
}
