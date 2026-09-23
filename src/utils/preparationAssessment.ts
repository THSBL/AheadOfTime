import { CalendarEvent, EventCategory, PreparationLevel, UserResponsibility } from '../types.js';

/**
 * AOT's deterministic assessment of how much preparation help a user needs
 * for an event - architecture reset Phase 3. The core principle (per
 * explicit correction during design): preparation level is NOT event
 * complexity read off a category label. It is "what the event requires x
 * what the user is responsible for" - the same event produces different
 * levels for different roles (a child going to a tournament independently
 * vs. a parent driving them vs. a parent organizing it). Never implement a
 * category-to-level lookup table.
 *
 * This module is pure logic - nothing here touches date arithmetic,
 * persistence, or validation, and nothing outside this file is meant to
 * import AOTPreparationAssessment directly (see getActiveAssessor below).
 * Not yet wired into the planning pipeline or UI - that's Phase 6.
 */

export interface PreparationSignals {
  userResponsibility: UserResponsibility;
  logisticsDomainCount: number;
  hasExternalDependencies: boolean;
  requiresDocuments: boolean;
  groupCoordinationRequired: boolean;
  financialComplexity: 'none' | 'moderate' | 'high';
}

export interface InformationGap {
  key: string;
  /** AOT's plain description of what's needed; Gemini rephrases it naturally when this reaches a conversation. */
  question: string;
  impact: 'high' | 'medium' | 'low';
  requiredBeforePlanning: boolean;
}

export interface PreparationLevelAssessment {
  level: PreparationLevel;
  reasons: string[];
  signals: PreparationSignals;
}

export interface AssessmentInput {
  category?: EventCategory;
  title: string;
  location?: string;
  context?: CalendarEvent['context'];
  rawText?: string;
}

export interface PreparationAssessor {
  assessPreparationLevel(input: AssessmentInput): PreparationLevelAssessment;
  identifyInformationGaps(input: AssessmentInput): InformationGap[];
  isSufficientToProceed(input: AssessmentInput): boolean;
}

// Categories where the user's role genuinely changes the plan enough to be
// worth one clarifying question. Everywhere else, asking would violate the
// doc's own "ask the minimum number of high-value questions" principle - a
// subscription renewal review doesn't meaningfully change shape based on
// who's responsible for it, so it isn't here.
const CATEGORIES_WHERE_ROLE_MATTERS = new Set<EventCategory>([
  'travel_trip', 'booking_trip', 'kids_hobbies', 'kids_school', 'hosting_visitors', 'project_deadline',
]);

const INDEPENDENT_RE = /\b(on (his|her|their|my) own|by (him|her|them|my)self|independently|doesn'?t need me|does not need me|no help needed|just (attending|going|taking part)|i'?m (just )?(a guest|attending|invited))\b/i;
const PRIMARY_ORGANIZER_RE = /\b(i'?m organi[sz]ing|i am organi[sz]ing|i'?m running|i'?m hosting|i'?m planning|i'?m in charge of|as the organi[sz]er|my responsibility to organi[sz]e)\b/i;
const CO_RESPONSIBLE_RE = /\b(i'?m taking|i'?ll be taking|driving (him|her|them)|i'?m helping|co-?organi[sz]ing|helping (out )?with|responsible for (my|our) (kid|child|son|daughter))\b/i;

function textBlob(input: AssessmentInput): string {
  return `${input.title || ''} ${input.rawText || ''} ${input.context?.customNote || ''}`;
}

interface RoleInference {
  responsibility: UserResponsibility;
  /** True only when a real signal was found in text - false when defaulted (category-driven or safe-fallback). */
  wasExplicit: boolean;
}

/**
 * Deterministic, testable role inference - extends the same lexical-signal
 * approach already used elsewhere in this codebase (src/utils/deepRefine.ts's
 * keyword blocks) rather than inventing a new technique. A first pass:
 * these patterns need validation against real historical events before the
 * exact wording is treated as final (see the architecture-reset plan's
 * Open Decisions).
 */
function inferUserResponsibility(input: AssessmentInput): RoleInference {
  const text = textBlob(input);
  if (INDEPENDENT_RE.test(text)) return { responsibility: 'independent', wasExplicit: true };
  if (PRIMARY_ORGANIZER_RE.test(text)) return { responsibility: 'primary_organizer', wasExplicit: true };
  if (CO_RESPONSIBLE_RE.test(text)) return { responsibility: 'co_responsible', wasExplicit: true };

  const categoryAsksRole = Boolean(input.category) && CATEGORIES_WHERE_ROLE_MATTERS.has(input.category as EventCategory);
  if (categoryAsksRole) return { responsibility: 'unknown', wasExplicit: false };
  // Role rarely changes the plan for this category - don't interrupt to
  // ask. co_responsible is the safe middle default; assessPreparationLevel
  // still lets complexity signals (not this default) decide the tier when
  // the default was never explicitly confirmed - see there for why.
  return { responsibility: 'co_responsible', wasExplicit: false };
}

function deriveSignals(input: AssessmentInput, userResponsibility: UserResponsibility): PreparationSignals {
  const text = textBlob(input).toLowerCase();

  const hasExternalDependencies = Boolean(input.location) || Boolean(input.context?.destination) ||
    /\b(book|booking|booked|venue|vendor|caterer|photographer|dj|flight|hotel|airbnb|reservation|rsvp|deposit)\b/.test(text);

  const requiresDocuments = /\b(passport|visa|esta|licen[cs]e|permit|contract|terms|paperwork|renew|cancel|downgrade|upgrade|plan change|billing|agreement|form|application)\b/.test(text);

  const groupCoordinationRequired =
    /\b(group|friends|family|guests?|attendees?|everyone|team|players|tournament|party|headcount|coordinate|coordinating)\b/.test(text) ||
    (typeof input.context?.guestCount === 'number' && input.context.guestCount > 1);

  const financialComplexity: PreparationSignals['financialComplexity'] =
    /\b(money pool|shared cost|deposit|split the bill|fund(raising)?|budget|large purchase|wedding)\b/.test(text) ? 'high'
      : /\b(gift|purchase|buy|order|pay|cost|price|ticket)\b/.test(text) ? 'moderate'
        : 'none';

  const logisticsDomainCount = [hasExternalDependencies, requiresDocuments, groupCoordinationRequired, financialComplexity !== 'none']
    .filter(Boolean).length;

  return { userResponsibility, logisticsDomainCount, hasExternalDependencies, requiresDocuments, groupCoordinationRequired, financialComplexity };
}

/**
 * The only implementation today. The rest of the app should never import
 * this class directly - go through getActiveAssessor() so a future
 * JEVPreparationAssessment can be substituted in for the role/level/gap
 * decisions without any caller needing to change. JEV must never be handed
 * date arithmetic, persistence, or validation - this interface simply never
 * grants those capabilities to any implementer.
 */
export class AOTPreparationAssessment implements PreparationAssessor {
  assessPreparationLevel(input: AssessmentInput): PreparationLevelAssessment {
    const { responsibility, wasExplicit } = inferUserResponsibility(input);
    const signals = deriveSignals(input, responsibility);
    const domainCount = signals.logisticsDomainCount;

    if (responsibility === 'independent') {
      return {
        level: 'essentials',
        reasons: ['You are not responsible for organizing this - only your own participation.'],
        signals,
      };
    }

    if (responsibility === 'unknown') {
      return {
        level: 'balanced',
        reasons: ["We don't know your role in this yet, so we're starting with a balanced plan - tell us more to sharpen it."],
        signals,
      };
    }

    if (!wasExplicit) {
      // Defaulted responsibility for a category where role rarely matters -
      // no real role signal exists, so let what the event actually
      // requires decide the tier instead of the default itself.
      const level: PreparationLevel = domainCount === 0 ? 'essentials' : domainCount >= 3 ? 'extensive' : 'balanced';
      return {
        level,
        reasons: [domainCount === 0
          ? 'This looks like a simple, self-contained task with nothing else to coordinate.'
          : 'There are some real logistics here to track.'],
        signals,
      };
    }

    if (responsibility === 'primary_organizer') {
      const level: PreparationLevel = domainCount === 0 ? 'balanced' : 'extensive';
      return {
        level,
        reasons: ['You are organizing this' + (level === 'extensive' ? ' - broad preparation coverage, including dependencies and contingencies.' : '.')],
        signals,
      };
    }

    // Explicit co_responsible.
    const level: PreparationLevel = domainCount >= 3 ? 'extensive' : 'balanced';
    return {
      level,
      reasons: ['You are sharing responsibility for this - key steps and logistics, not just your own part.'],
      signals,
    };
  }

  identifyInformationGaps(input: AssessmentInput): InformationGap[] {
    const { responsibility } = inferUserResponsibility(input);
    if (responsibility !== 'unknown') return [];
    return [{
      key: 'user_responsibility',
      question: "Who's actually responsible for this - are you the one organizing it, helping out, or just taking part?",
      impact: 'high',
      // Never blocks planning outright - a plan still generates at the
      // Balanced safe default while this is unresolved; the doc's
      // sufficiency threshold is about when to STOP asking, not a gate on
      // producing a plan at all.
      requiredBeforePlanning: false,
    }];
  }

  isSufficientToProceed(input: AssessmentInput): boolean {
    return !this.identifyInformationGaps(input).some((g) => g.requiredBeforePlanning);
  }
}

let activeAssessor: PreparationAssessor = new AOTPreparationAssessment();

/** The one seam the rest of the app should depend on - see the class doc comment above. */
export function getActiveAssessor(): PreparationAssessor {
  return activeAssessor;
}
