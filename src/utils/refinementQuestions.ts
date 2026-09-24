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

const NAMED_PLACE = /\b(to|in) [A-Z][a-z]+/;
const ABROAD = /\b(abroad|overseas|international|flight|fly|flying)\b/i;
const MENTIONS_DOCUMENTS = /\b(visa|passport|esta|entry (permit|authori[sz]ation))\b/i;

/**
 * Visa / passport needs depend on nationality and destination, which we
 * can't reliably know - so for a trip somewhere we ask instead of guessing
 * (the planner adds these tasks only for a "needed" answer). Asked
 * whether or not Gemini is available or remembers to ask it.
 */
export function buildTripRefinementQuestions(message: string): RefinementQuestion[] {
  if (!message?.trim() || !isAwayFromHomeEvent(message) || MENTIONS_DOCUMENTS.test(message)) return [];
  if (!NAMED_PLACE.test(message) && !ABROAD.test(message)) return [];
  return [{
    id: 'travel_documents',
    question: 'Travel documents: anything to arrange?',
    options: ['Visa needed', 'Passport renewal needed', 'Visa and passport renewal', 'All sorted / not needed'],
    source: 'message',
  }];
}

/**
 * "Next Saturday" can mean the coming Saturday or the one after - asked,
 * with both real dates as options, instead of guessed. Asked whether or not
 * Gemini is available (see askRefinementQuestions).
 */
export function buildAmbiguousDateQuestion(message: string, currentReferenceDate: string): RefinementQuestion | null {
  const parsed = parseNaturalDateRange(message, currentReferenceDate);
  if (!parsed?.alternatives || parsed.alternatives.length < 2) return null;
  const label = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  const day = (parsed.matchedText || '').replace(/^\s*next\s+/i, '');
  return {
    id: 'which_date',
    question: `Which ${day.charAt(0).toUpperCase()}${day.slice(1).toLowerCase()} do you mean?`,
    options: parsed.alternatives.map(label),
    source: 'message',
  };
}

/**
 * Minimal where/when fallback for when Gemini is unavailable, so the
 * refinement step still covers the basics instead of silently vanishing.
 */
export function buildFallbackMessageQuestions(message: string, currentReferenceDate: string): RefinementQuestion[] {
  const questions: RefinementQuestion[] = [];
  const ambiguous = buildAmbiguousDateQuestion(message, currentReferenceDate);
  if (ambiguous) return [ambiguous];
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
const DATE_QUESTION = /\b(when|which (day|date|monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/i;
const DOCUMENTS_QUESTION = /\b(visa|passport|travel documents?|entry)\b/i;
const KIDS_QUESTION = /\b(kid|kids|child|children|childcare)\b/i;

/**
 * Gemini's message-based questions first, then any guaranteed question
 * (profile, travel documents) it didn't already cover, capped so the step stays quick to answer.
 */
export function mergeRefinementQuestions(messageQuestions: RefinementQuestion[], profileQuestions: RefinementQuestion[]): RefinementQuestion[] {
  const merged = [...messageQuestions];
  for (const pq of profileQuestions) {
    const topic = pq.id === 'pet_care' ? PET_QUESTION : pq.id === 'kids' ? KIDS_QUESTION : pq.id === 'travel_documents' ? DOCUMENTS_QUESTION : pq.id === 'which_date' ? DATE_QUESTION : null;
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

const NEEDS_VISA = /\b(visa needed|visa required|need (a |to get a |to arrange a |to apply for a )?visa|visa and passport)\b/i;
const NO_VISA = /\b(no visa|visa (is )?not (needed|required)|don'?t need (a )?visa)\b/i;
const NEEDS_PASSPORT = /\b(passport renewal|renew (my |our )?passports?|passports? (expires|expired|needs? renewing)|new passports?)\b/i;
const NO_PASSPORT = /\b(no passport renewal|passport renewal (is )?not (needed|required)|passports? (is |are )?(still )?(valid|fine|ok))\b/i;

/**
 * Visa / passport needs the user actually stated (an answer to the travel
 * documents question, or free text like "I also need a visa"). Never
 * guessed from the destination - the planner only adds these tasks when
 * the user said so. Question text is ignored.
 */
export function detectTravelDocumentNeeds(text: string): { needVisa?: true; needPassportRenewal?: true } {
  const statement = (text || '').replace(/[^.!?\n]*\?/g, ' ');
  const needs: { needVisa?: true; needPassportRenewal?: true } = {};
  if (NEEDS_VISA.test(statement) && !NO_VISA.test(statement)) needs.needVisa = true;
  if (NEEDS_PASSPORT.test(statement) && !NO_PASSPORT.test(statement)) needs.needPassportRenewal = true;
  return needs;
}
