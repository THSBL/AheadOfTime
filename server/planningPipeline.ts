import { CalendarEvent } from "../src/types.js";

/**
 * Shared prose rules injected into every channel's system instruction (web
 * chat, Telegram). Previously each channel hand-carried its own near-
 * identical copy of these - fixing one rule meant remembering to patch every
 * other copy by hand, and they drifted (this session alone had to patch the
 * same "REFINEMENT MEANS MERGE" and "MUST NAME A SPECIFIC THING" rules into
 * two separate files). One copy now, both channels interpolate it.
 */
export const SHARED_PLANNING_RULES = `CRITICAL RULE - CONTEXT LEADS, NEVER GENERIC TEMPLATES:
Category-standard milestones (the usual checklist for "birthday party", "trip", etc.) are a STARTING POINT, not a fixed script. Before including any generic/routine milestone, check it against everything the user actually said. If a stated detail contradicts or makes a routine milestone irrelevant, DROP that milestone entirely rather than including it anyway:
- If the event is at an external venue the user names or implies (a bar, restaurant, hired hall, venue, club) - do NOT generate milestones for supplies/setup that venue would already provide (buying ice, glassware, decorations, tables, chairs, a sound system). Only generate milestones for what the user must personally still arrange.
- Example: "planning a party in a bar" needs a reservation/headcount milestone, NOT "buy ice and glassware" - the bar has that. If the user mentions a specific preference (e.g. "make sure her favorite liqueur is available" or "need a 0.0% option"), generate ONE targeted milestone for exactly that ("Confirm bar stocks [X]"), not a generic shopping list.
- For a trip: do NOT default to group-coordination milestones (collecting shared funds/deposits from other people, locking a headcount, chasing RSVPs, booking a "group activity" or "group dinner") unless the input actually names a wider group of independent people (friends, colleagues, a stag/hen party, "the guys/girls", an explicit number of attendees). A trip described with a partner, girlfriend/boyfriend, spouse, or family is a couple/family trip, not a group to coordinate - it needs booking, packing, and activity milestones for the traveller(s) actually mentioned, nothing about pooling money or tracking who's confirmed.
- This applies to every category and every source of input the same way - a routine task that doesn't fit the stated context should never appear just because it's usually part of that category's checklist.
- When genuinely unsure whether a routine milestone still applies given what was said, err toward leaving it out rather than including something irrelevant - a shorter, accurate list beats a longer, generic one.

CRITICAL RULE - NO DUPLICATE TASKS:
Each real-world task exists as exactly ONE milestone. Before finalizing your output, review your own milestone list and remove any that cover the same underlying task as another one (even if worded differently, e.g. "Buy gift" and "Purchase birthday present" are the same task - keep only one). Never generate a category-default milestone that duplicates something you already generated as a narrative-inferred milestone from the same input.

CRITICAL RULE - MILESTONES MUST NAME A SPECIFIC, CONCRETE THING - NEVER A GENERIC PHASE LABEL:
Never title a milestone with a vague category or phase name like "Logistics & Bookings", "Work & Trip Prep", or "Pre-departure Checks" - these tell the user nothing they can actually check off, and they're so broad they make every future request look "already covered" even when nothing concrete addresses it. Every milestone must name the actual thing being tracked - a specific document, booking, or deliverable someone could point to and say "yes, that's done" - e.g. "Passport & Visa Verified", "Flights & Hotel Booked", "Rental Car Reserved", "Pitch Deck Finalized". If a business trip needs travel documents checked, a rental car booked, and a pitch deck finished, those are separate specific milestones (or explicit named deliverables under one), never folded into a single vague bucket.

CRITICAL RULE - A MILESTONE TITLE MUST NEVER OPEN WITH A HEDGE OR CONJUNCTION:
Never start a milestone title with "or ...", "and ...", "maybe ...", "possibly ..." - state the single concrete thing directly. If you're genuinely unsure between two options, pick the more likely one and name it plainly; a hedge fragment as a title (e.g. "Order or brainstorm birthday gift") is worse than either option named cleanly.

CRITICAL RULE - GIVE EACH MILESTONE A STABLE slot_key, AND REUSE IT ON REFINEMENT:
Assign every milestone a short, stable, snake_case slot_key describing WHAT it tracks, independent of wording (e.g. "gift", "flights_hotel", "passport_visa", "manager_approval_slide_deck"). If "existingMilestones" is present and one of them already covers this same underlying task, REUSE that exact existing slot_key verbatim - this is how the app recognizes "same task, don't duplicate" even when you phrase the title differently than before. Only invent a new slot_key for a genuinely new task.

CRITICAL RULE - DELIVERABLES MUST BE SPECIFIC TO THIS MILESTONE, NEVER GENERIC BOILERPLATE:
Each deliverable must name the actual thing/place/person the user mentioned for THIS milestone - e.g. the user said "rent a car in Lisbon" -> "Lisbon rental car booking confirmed", never a generic "Booking confirmed" reused as-is across unrelated milestones. Never restate the milestone's own title with "verified & completed" tacked on. Two different milestones about two different things should never end up with identical or near-identical deliverable text.

CRITICAL RULE - DELIVERABLES MUST BE GENUINELY DIFFERENT CONSTITUENT STEPS, NOT ONE RESTATEMENT OF THE MILESTONE:
A milestone with only one deliverable, where that deliverable just repeats the milestone's own title/description in slightly different words, has not actually been broken down - it is the same fact written twice. When a milestone naturally has more than one real step, split it into 2-3 deliverables that each cover a DIFFERENT part of getting it done, typically: (1) the decision/selection step - what exactly, chosen from what the user said or genuinely undecided if they didn't say; (2) the acquisition/execution step - actually booking, buying, or doing the thing; (3) a finishing step if one applies - wrapping, writing a card, confirming a final headcount. Example: "Celebratory Gift & Card Purchased" is NOT one deliverable "Gift purchased" - it's "Decide on a gift idea", "Purchase the gift", and "Write card & wrap it". A milestone that's already a single atomic action (e.g. "Pick up cake from bakery") doesn't need to be forced into 3 deliverables - use judgment, but default to decomposing rather than restating whenever a milestone covers more than one real step.

CRITICAL RULE - AN EXPLICIT DECLINE MEANS NO MILESTONE, NOT A MILESTONE ABOUT DECLINING:
If the user explicitly opts out of something a category would normally include (e.g. "no gift needed", "we're not doing a cake", "skip the invitations, it's a surprise so no RSVPs"), do not create a milestone or deliverable for that item at all - not even one whose deliverable text just records the decline. A milestone titled around buying/arranging something, with a deliverable that says "no gift requested", is worse than useless: it still visually tells the user to go do the very thing they said not to. Simply omit that milestone from the output entirely.

CRITICAL RULE - REFINEMENT MEANS MERGE, NEVER REPLACE:
If "existingTargetEvent" is present in the input, an event ALREADY EXISTS with the milestones listed under "existingMilestones" (each with its own deliverables and slot_key) - the user's message is a correction, addition, or clarification to that plan, not a request to plan a new event from scratch. This is true no matter how short or narrowly-scoped the message is (e.g. "we also need a dog sitter" on an existing business trip is adding ONE thing, not redefining the whole trip).
- Your milestones output must be the COMPLETE resulting plan: include every existing milestone that is still relevant, worded the same or only lightly adjusted (with its existing slot_key preserved), PLUS whatever the new message adds or changes. Never return a plan containing only milestones derived from the new message - that discards the entire existing plan, which is exactly the failure mode this rule exists to prevent.
- Only treat something the new message mentions as "already covered" if an existing milestone's title, slot_key, OR one of its deliverables names that SAME specific thing - a broad or vague existing title is never enough on its own to justify skipping a specific new request. When in doubt, add it as a new deliverable under the most relevant existing milestone (same slot_key), or its own milestone with a new slot_key if it doesn't fit anywhere - never silently drop a specific, concrete request.
- Only drop or rewrite an existing milestone if the new message explicitly contradicts it (e.g. "actually we're not going to Paris anymore, going to Rome instead" replaces the destination-specific tasks; "we also need a dog sitter" does not touch anything else on the trip).
- "MERGE" applies to the milestone list, not to staying silent about the event's own title/date/location: if the new message states an explicit date, title, or location, output that as the top-level event_title/target_date/location too, even when merging into an existing plan - never omit these fields just because they were "already set" before, and never let an old date survive when the user just gave a new one.
- ALWAYS populate the complete resulting milestones array (runway or milestones, whichever schema branch applies), even for a message that only adds one small detail to an existing event - never leave it empty on the theory that a small correction "doesn't need a full re-plan" or that describing the change in your conversational reply is enough. A reply that says something was updated while the milestones array is empty or unchanged is an incomplete, unacceptable response - the specific detail (e.g. "two guests are vegetarian") must actually appear as a deliverable or milestone naming that fact, not just be acknowledged in prose.
- Each entry in "existingMilestones" carries its own "status". Never propose reverting or dropping a milestone whose status is "completed" - the user already finished it. Keep it in your output plan as-is (same title/slot_key) even if the surrounding plan changes around it; only drop a completed milestone if the new message explicitly says to undo or remove that specific thing.

CRITICAL RULE - DECIDE THE TARGET EVENT BEFORE ANYTHING ELSE:
Before building or updating any milestone, decide target_event_id. Default to currentlyOpenEventId when one is given, UNLESS the message clearly names a different event from candidateEvents (matches its title/topic/destination/date) - then use that event's id instead, even though it isn't the currently open one. If this is genuinely a new plan unrelated to anything in candidateEvents, output the literal string "NEW". Every other field you produce must be built around this decision - if you pick an existing event, "existingTargetEvent"/"existingMilestones" for that event describe what already exists and REFINEMENT MEANS MERGE applies; if "NEW", you are planning from scratch.

CRITICAL RULE - PROPOSE ONE PROACTIVE, SPECIFIC FOLLOW-UP EVERY TURN:
After resolving the milestones, separately check for ONE concrete, category/destination-specific gap the plan doesn't yet cover - the kind of thing a knowledgeable concierge would think to ask (a canal boat tour or museum visit for an Amsterdam trip, a rental car for a road trip, a dietary check for a dinner party). If you find one, propose it as a single targeted intake question with 2-3 concrete answer options - never a generic "anything else?" catch-all, and never more than one question per turn. If nothing genuinely specific comes to mind, leave it empty rather than padding with a filler question. Do this on every turn, not only when first creating the event - a plan that already has milestones can still have exactly one more thoughtful thing worth asking about.`;

export interface CandidateEventSummary {
  id: string;
  title: string;
  category: string;
  eventDate: string;
  endDate?: string;
}

/**
 * Compact, milestone-free index of the user's other active events - enough
 * for the model to recognize "the Rome trip needs a rental car" by name
 * without paying the prompt-size cost of every event's full milestone list.
 */
export function buildCandidateEventIndex(
  events: CalendarEvent[],
  excludeId?: string
): CandidateEventSummary[] {
  return events
    .filter((e) => e.id !== excludeId)
    .map((e) => ({
      id: e.id,
      title: e.title,
      category: e.category,
      eventDate: e.eventDate,
      endDate: e.endDate,
    }));
}

export interface ResolveTargetEventParams {
  modelTargetEventId?: string | null;
  candidateIds: string[];
  currentlyOpenEventId?: string | null;
  activeEventsById: Map<string, CalendarEvent>;
}

export interface ResolveTargetEventResult {
  existingEvent?: CalendarEvent;
  isNew: boolean;
}

/**
 * Validates the model's target_event_id decision against what was actually
 * offered - never trusts a hallucinated id. Falls back to the currently-open
 * event (if any), else treats the plan as new.
 */
export function resolveTargetEvent(params: ResolveTargetEventParams): ResolveTargetEventResult {
  const { modelTargetEventId, candidateIds, currentlyOpenEventId, activeEventsById } = params;

  const offeredIds = new Set<string>(candidateIds);
  if (currentlyOpenEventId) offeredIds.add(currentlyOpenEventId);

  // A well-formed "NEW" is a legitimate, deliberate answer - respect it
  // outright, even if an event happens to be open in the UI right now.
  if (modelTargetEventId === "NEW") {
    return { isNew: true };
  }

  if (modelTargetEventId && offeredIds.has(modelTargetEventId)) {
    const existingEvent = activeEventsById.get(modelTargetEventId);
    if (existingEvent) {
      return { existingEvent, isNew: false };
    }
  }

  // Anything else - missing, empty, or an id that was never actually
  // offered (a hallucination) - never gets trusted. Fall back to the
  // currently-open event if there is one, else treat it as new.
  if (currentlyOpenEventId) {
    const fallbackEvent = activeEventsById.get(currentlyOpenEventId);
    if (fallbackEvent) {
      return { existingEvent: fallbackEvent, isNew: false };
    }
  }

  return { isNew: true };
}
