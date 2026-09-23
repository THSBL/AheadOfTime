import { CalendarEvent, EventCategory, TMinusMilestone, UserEventRole } from '../types.js';
import { generateHeuristicMilestones } from './tminusRules.js';
import { generateConcreteEventMilestones, CanonicalCategory } from './creationStateMachine.js';
import { deepRefineEventLocally } from './deepRefine.js';

/**
 * Single entry point for every deterministic (no-Gemini) milestone
 * generation path - the wizard, the web/Telegram fallback, the quick-edit
 * category-change fallback, and Calendar scan/import all used to reach into
 * one of three different files directly (generateConcreteEventMilestones,
 * generateHeuristicMilestones, deepRefineEventLocally), each with its own
 * category taxonomy and its own idea of what evidence justifies what
 * content. This picks the right one of those for the inputs actually
 * available, so callers only ever need to know about this one function.
 *
 * This is intentionally a facade over the existing engines, not a rewrite
 * of them - each is a large, independently battle-tested body of category
 * logic (generateHeuristicMilestones alone is ~700 lines), and physically
 * merging their content carries real regression risk for uncertain benefit.
 * The architectural goal (one canonical call site, no caller reaching into
 * three different modules) is satisfied by delegation.
 */
export interface DeterministicGeneratorInput {
  eventId: string;
  title: string;
  eventDate: string;
  eventTime?: string;
  location?: string;
  category?: EventCategory;
  context?: CalendarEvent['context'];
  userRole?: UserEventRole;
  endDate?: string;
  macroEvent?: CalendarEvent['macroEvent'];
  /** Free text to scan for category/content signal when no category is known at all. */
  rawText?: string;
  /**
   * Wizard-only: when present, routes to the chip-answer-aware engine -
   * the only one of the three that reads a user's actual chip selections
   * directly, rather than inferring from a context object or free text.
   */
  wizardChipAnswers?: {
    canonicalCategory: CanonicalCategory;
    refinementAnswers: Record<string, string | string[]>;
  };
}

export function generateDeterministicMilestones(input: DeterministicGeneratorInput): TMinusMilestone[] {
  if (input.wizardChipAnswers) {
    return generateConcreteEventMilestones(
      input.title,
      input.eventDate,
      input.eventTime || '19:00',
      input.wizardChipAnswers.canonicalCategory,
      input.wizardChipAnswers.refinementAnswers,
      input.eventId
    );
  }

  if (input.category && input.category !== 'custom') {
    return generateHeuristicMilestones(
      {
        category: input.category,
        title: input.title,
        location: input.location,
        context: input.context,
        userRole: input.userRole,
        endDate: input.endDate,
        macroEvent: input.macroEvent,
      },
      input.eventId,
      input.eventDate,
      input.eventTime || '19:00'
    );
  }

  // No reliable category signal at all - fall back to the regex engine that
  // reads narrative text directly instead of a category label, the only one
  // of the three built for that case.
  return deepRefineEventLocally({
    id: input.eventId,
    title: input.rawText ? `${input.title} ${input.rawText}` : input.title,
    eventDate: input.eventDate,
    eventTime: input.eventTime,
    location: input.location,
    category: input.category || 'custom',
    context: input.context || {},
    status: 'milestones_active',
  } as CalendarEvent);
}
