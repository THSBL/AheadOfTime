export type OperationalMode = 'CREATE_AND_INTAKE' | 'RESOLVE_MILESTONES' | 'RESEARCH_REQUIRED' | 'NORMAL';

export type EventCategory = 
  | 'birthday_party' 
  | 'hosting_visitors' 
  | 'friends_family'
  | 'hobbies'
  | 'festival_concert' 
  | 'travel_trip' 
  | 'dinner_social' 
  | 'project_deadline'
  | 'booking_trip'
  | 'subscription'
  | 'maintenance'
  | 'kids_school'
  | 'kids_hobbies'
  | 'custom';

// Architecture reset: preparation level is an AOT-owned, deterministic
// property of an event, not a Gemini judgment call - see
// src/utils/preparationAssessment.ts. Deliberately distinct names from
// AheadLevel/SimpleAheadLevel (src/utils/readiness.ts) - those describe
// deadline proximity (how close/late a task is), an unrelated concept.
export type PreparationLevel = 'essentials' | 'balanced' | 'extensive';

// What the user is actually responsible for in this event - the primary
// driver of PreparationLevel, per "preparation level = what the event
// requires x what the user is responsible for" (never event type alone).
// 'unknown' only occurs for a category where role genuinely changes the
// plan and no signal (explicit statement, or a later answered question)
// has resolved it yet.
export type UserResponsibility = 'independent' | 'co_responsible' | 'primary_organizer' | 'unknown';

export type MilestoneCategory = 
  | 'logistics' 
  | 'gift' 
  | 'booking' 
  | 'shopping' 
  | 'prep' 
  | 'watchpoint' 
  | 'costume'
  | 'tickets'
  | 'review'
  | 'marketing'
  | 'work'
  | 'admin'
  | 'project_deadline'
  | 'qa'
  | 'operations'
  | 'general';

export interface IntakeOption {
  label: string;
  value: string;
  description?: string;
}

export interface IntakeQuestion {
  id: string;
  question: string;
  parameterKey: string;
  options?: IntakeOption[];
  answered?: boolean;
  selectedAnswer?: string;
}

export interface MacroEventData {
  title: string;
  start_date: string; // YYYY-MM-DD
  end_date?: string; // YYYY-MM-DD
  type: string; // e.g. "Trip", "Stag Party", "Conference", "Celebration"
  destination?: string;
  archetype?: string;
}

export interface SubEvent {
  id?: string;
  title: string;
  relative_day?: string; // e.g. "Day 2", "Saturday night"
  target_date: string; // YYYY-MM-DD
  description?: string;
}

export type UserEventRole = 'organiser' | 'co_organiser' | 'guest';
export type TaskItemKind = 'milestone' | 'deliverable';
export type DeliverableType = 'booking' | 'purchase' | 'document' | 'coordination';

export interface Deliverable {
  deliverable_id: string;
  title: string; // Tangible output (e.g., "Confirmed Airbnb reservation code")
  type: DeliverableType;
  is_completed: boolean;
  // Architecture reset Phase 8 - mirrors TMinusMilestone's own
  // needsRefinement/refinementOptions (previously milestone-only), now also
  // settable on an individual deliverable so a decision buried in a
  // sub-task (e.g. "home dinner or restaurant reservation") gets the same
  // interactive Refine treatment a milestone-level one already does.
  needsRefinement?: boolean;
  refinementOptions?: string[];
}

export interface RunwayMilestoneGate {
  milestone_title: string; // State checkpoint (e.g., "Lodging & Transit Locked")
  t_minus_days: number;
  target_date: string; // YYYY-MM-DD
  status: 'pending' | 'completed';
  deliverables: Deliverable[];
}

export interface EventRunwayPlan {
  event_title: string;
  target_date: string;
  runway: RunwayMilestoneGate[];
}

export interface StructuredMilestone {
  task: string;
  target_date: string;
  t_minus_days: number;
  scope: 'macro' | 'micro';
  tag: 'Logistics' | 'Activity' | 'Reservations' | 'Supplies' | string;
  description?: string;
  kind?: TaskItemKind;
  needsRefinement?: boolean;
  deliverableType?: 'reservation' | 'activity' | 'booking' | 'shopping' | 'logistics' | 'general' | string;
  refinementOptions?: string[];
  applicableRoles?: UserEventRole[];
  deliverables?: Deliverable[];
  source?: 'category_default' | 'narrative_inferred';
  // Short stable snake_case identity for WHAT this milestone tracks (e.g.
  // "gift", "flights_hotel"), independent of wording - lets a later
  // refinement recognize "this is the same task" even when the model
  // phrases the title completely differently the second time. Optional:
  // absent on legacy/local-heuristic milestones, which fall back to the
  // older title/category/timing-based dedup heuristic.
  slotKey?: string;
}

export interface StructuredPlanningPayload {
  macro_event: MacroEventData;
  sub_events: SubEvent[];
  milestones: StructuredMilestone[];
  conversational_response: string;
  tailored_options?: string[];
  runway?: RunwayMilestoneGate[];
}

export interface TMinusMilestone {
  id: string;
  eventId: string;
  tMinusLabel: string; // e.g. "T-60d", "T-30d", "T-14d", "T-10d", "T-7d", "T-3d", "T-2d", "T-1d", "T-2h", "WATCHPOINT"
  tMinusOffsetMinutes: number; // e.g. -43200 for T-30d
  calculatedDate: string; // ISO date format YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss
  title: string;
  description?: string;
  category: MilestoneCategory;
  status: 'pending' | 'completed' | 'skipped';
  completedAt?: string;
  googleCalendarEventId?: string;
  googleTaskId?: string;
  scope?: 'macro' | 'micro';
  tag?: 'Logistics' | 'Activity' | 'Reservations' | 'Supplies' | string;
  relativeDay?: string;
  kind?: TaskItemKind;
  needsRefinement?: boolean;
  deliverableType?: 'reservation' | 'activity' | 'booking' | 'shopping' | 'logistics' | 'general' | string;
  refinementOptions?: string[];
  applicableRoles?: UserEventRole[];
  deliverables?: Deliverable[];
  source?: 'category_default' | 'narrative_inferred';
  // See StructuredMilestone.slotKey - same field, carried through once a
  // milestone is finalized into the app's persisted shape.
  slotKey?: string;
  // Architecture reset (Phases 4-6) - which PreparationLevel this milestone
  // belongs to, and whether it's currently shown. Optional so old
  // in-memory/Telegram-sourced objects from before this migration stay
  // valid; readers default tier to 'essentials' and isActive to true.
  // Downgrading a level hides higher-tier rows (isActive: false) instead of
  // deleting them - never a separate cached-plan representation.
  tier?: PreparationLevel;
  isActive?: boolean;
  hiddenReason?: 'level_downgrade' | 'superseded_by_replan';
  // Which planning_context_version (CalendarEvent.planningContextVersion)
  // this milestone's content was generated against - lets an upgrade
  // reactivate a hidden row only when it's still valid, per Phase 4/7.
  generatedFromContextVersion?: string;
  // Lightweight, optional UI-grouping label only (e.g. "Booking",
  // "Documents") - no ordering or gating is implied by this field.
  phase?: string;
}

export interface WatchpointData {
  targetAnnouncementWindow: string;
  expectedAction: string;
  checkDate: string;
  historicalContext?: string;
}

export type FocusMode = 'welcome' | 'new-event' | 'adjust-event';

export type RecurrenceFrequency = 'weekly' | 'biweekly' | 'monthly' | 'custom_dates' | 'custom_interval';

export interface EventRecurrenceConfig {
  isRecurring: boolean;
  frequency?: RecurrenceFrequency;
  recurrencePatternText?: string; // e.g., "Every Saturday", "Every 2 weeks", "Every month on the 1st"
  dayOfWeek?: number; // 0 = Sunday, 1 = Monday, ... 6 = Saturday
  customDates?: string[]; // list of exact YYYY-MM-DD dates for the recurring occurrences
  intervalWeeks?: number;
  occurrencesCount?: number; // how many cycles to project (default e.g. 4)
}

// Architecture reset Phase 7 - who/what actually asserted a planning fact,
// so a replan can tell "the user explicitly decided this" (never silently
// drop or contradict it) apart from "Gemini's own guess this turn" (fine to
// reconsider freely). user_decision is a strict subset of user_stated: an
// explicit choice/decline (e.g. "no gift needed") vs. any other user-typed
// detail (e.g. a destination mentioned in passing).
export type ContextProvenance = 'user_stated' | 'user_decision' | 'ai_inferred' | 'ai_generated';

export interface PlanningContextEntry {
  value: unknown;
  provenance: ContextProvenance;
  updatedAt: string;
}

export interface CalendarEvent {
  id: string;
  title: string;
  category: EventCategory;
  eventDate: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
  eventTime?: string; // HH:mm
  location?: string;
  userRole?: UserEventRole;
  status: 'intake_pending' | 'milestones_active' | 'research_watchpoint' | 'completed';
  needsRefinement?: boolean;
  refinedAt?: string;
  googleEventId?: string;
  googleEventLink?: string;
  syncedToGoogleAt?: string;
  googleMilestoneCount?: number;
  macroEvent?: MacroEventData;
  subEvents?: SubEvent[];
  structuredPayload?: StructuredPlanningPayload;
  tailoredOptions?: string[];
  recurrence?: EventRecurrenceConfig;
  context: {
    userRole?: UserEventRole;
    giftType?: 'group' | 'solo' | 'none' | string;
    theme?: string;
    isThemed?: boolean | string;
    cakeStrategy?: string;
    neededItems?: string[] | string;
    guestCount?: number;
    isCamping?: boolean;
    travelNeeded?: boolean;
    diningPlan?: string;
    notes?: string;
    [key: string]: any;
  };
  intakeQuestions?: IntakeQuestion[];
  milestones: TMinusMilestone[];
  watchpoint?: WatchpointData;
  rawInputSnippet?: string;
  createdAt: string;
  updatedAt: string;
  // Architecture reset (Phases 4-7) - the event's current preparation
  // level and why. Optional for the same reason as TMinusMilestone's tier
  // field; defaults to 'balanced' at the DB layer (server/preparationSchema.ts),
  // never a bare unset level.
  preparationLevel?: PreparationLevel;
  preparationLevelReasons?: string[];
  preparationLevelSetBy?: 'aot' | 'user';
  // Provenance-tagged fact bag Phase 7 builds (which facts are user-stated
  // vs. AI-inferred) and a hash of its user-provenance subset, used to
  // decide whether a hidden tier's milestones are still valid or need a
  // fresh replan on upgrade.
  planningContext?: Record<string, PlanningContextEntry>;
  planningContextVersion?: string;
  // Architecture reset Phase 8 - every still-open decision on this event:
  // the narrow role-only gap from Phase 3/6, plus one entry per milestone/
  // deliverable flagged as an open decision (key = that item's own id).
  // Mirrors preparationAssessment.ts's InformationGap shape (duplicated
  // here rather than imported, to avoid a types.ts <-> utils/
  // preparationAssessment.ts cycle). `options`, when present, are 2-3
  // concrete choices a chip UI can offer directly; absent means "answer
  // free text, no fixed options fit."
  outstandingGaps?: Array<{ key: string; question: string; impact: 'high' | 'medium' | 'low'; requiredBeforePlanning: boolean; options?: string[] }>;
}

export interface AgentMessage {
  id: string;
  sender: 'user' | 'agent' | 'system';
  text: string;
  focusText?: string;
  additionText?: string;
  timestamp: string;
  mode?: OperationalMode;
  associatedEventId?: string;
  intakeQuestions?: IntakeQuestion[];
  generatedMilestones?: TMinusMilestone[];
  structuredPayload?: StructuredPlanningPayload;
  conversationalResponse?: string;
  tailoredOptions?: string[];
  isVoiceMemo?: boolean;
  voiceAudioUrl?: string;
  voiceDurationSeconds?: number;
}

export interface ProcessAgentInputPayload {
  message: string;
  audioBase64?: string;
  mimeType?: string;
  currentReferenceDate: string; // ISO string
  activeEvents?: CalendarEvent[];
  targetEventId?: string;
  intakeAnswer?: {
    questionId: string;
    parameterKey: string;
    answerValue: string;
  };
  batchAnswers?: {
    parameterKey: string;
    answerValue: string;
  }[];
  // Subset of the user's OnboardingProfile relevant to planning (e.g. home
  // location for international-destination / travel-distance detection in
  // tminusRules.ts). Only the fields the planner actually consumes belong
  // here - not the full profile.
  userProfile?: PlanningUserProfile;
  // Everything the user already told us in this creation conversation
  // (first message, answers to the refinement questions, earlier
  // additions), so a follow-up turn is planned against the whole brief
  // rather than the newest message alone. See composeConversationBrief.
  conversationBrief?: string;
  // Set by callers that are, by construction, refining one specific event
  // (the Timeline & Tasks correction box, the New Event conversation after
  // its plan exists): targetEventId is then always the event refined, and
  // the model's own "NEW"/other-event routing is ignored. Without it, a
  // "NEW" answer produced an event with a fresh id that the caller's
  // update-by-id silently discarded.
  lockToTargetEvent?: boolean;
  // True only for the app's own synthetic "expand this into a full X
  // preparation plan" message (a preparation-level upgrade), never a real
  // user message - see processWithGemini's doc comment in agentProcessor.ts
  // for why this needs to be flagged explicitly.
  isLevelExpansion?: boolean;
}

export interface ProcessAgentResponsePayload {
  mode: OperationalMode;
  replyText: string;
  focusText?: string;
  additionText?: string;
  event: CalendarEvent;
  structuredPayload?: StructuredPlanningPayload;
  tailoredOptions?: string[];
  transcribedText?: string;
  explanation?: string;
  // Whether this response actually came from a live Gemini call vs. the
  // deterministic rules fallback (no GEMINI_API_KEY, or Gemini errored/
  // timed out) - added after live testing showed hardcoded fallback
  // wording ("Flights, trains & hotel reservation lock") appearing in a
  // response whose conversational reply read as if Gemini had handled it,
  // with no way to tell from the client which path actually ran.
  usedAi?: boolean;
}

export interface UserOnboardingProfile {
  has_kids: boolean;
  track_trips: boolean;
  track_hosting: boolean;
  custom_focus_areas: string[]; // e.g. ["marathons", "music festivals"]
}

export type EventTopicKey = 
  | 'parties_celebrations'
  | 'trips_getaways'
  | 'hosting_guests'
  | 'kids_school'
  | 'custom_focus'
  | 'projects_milestones'
  | 'routine_ignored';

export interface EvaluatedCalendarEvent {
  id: string;
  rawTitle: string;
  cleanTitle: string;
  eventDate: string; // YYYY-MM-DD
  eventTime?: string;
  location?: string;
  topic: EventTopicKey;
  topicLabel: string;
  topicIcon: string;
  diffDays: number;
  isBeyondMinHorizon: boolean; // >= 7 days
  should_track: boolean;
  reasoning: string;
  withheld: boolean; // user selectable to withhold app interaction
  intake_needed: boolean;
  intake_prompt?: string;
  milestones: TMinusMilestone[];
  messaging_dispatch: {
    whatsapp_text: string;
    telegram_text: string;
    app_link: string;
  };
  originalCalendarItem?: any;
}

export interface EvaluationTopicGroup {
  topicKey: EventTopicKey;
  label: string;
  icon: string;
  description: string;
  events: EvaluatedCalendarEvent[];
  allSelected: boolean;
}

export type AgeRange = '18–25' | '26–35' | '36–50' | '51+';

// Technical specification schema types
export type FamilyStructure = 'single' | 'couple' | 'family_with_kids';
export type CalendarTypeScope = 'personal' | 'mixed' | 'business';

// Questionnaire & UI display labels
export type FamilyStatus = 'Single' | 'Couple' | 'Family with kids' | 'Couple with kids';
export type CalendarType = 'Personal' | 'Mixed (Personal & Work)' | 'Business' | 'Personal only' | 'Business only';

// The slice of OnboardingProfile the planner uses: home location for
// travel-distance detection, plus household facts (pet, kids) that decide
// which refinement questions get asked and what the plan must cover.
export interface PlanningUserProfile {
  homeZipOrLocation?: string;
  hasPet?: boolean;
  familyStructure?: FamilyStructure;
}

// A pre-plan question from /api/agent/clarify. Options are quick picks;
// the user can always type their own answer instead, or skip it.
export interface RefinementQuestion {
  id: string;
  question: string;
  options: string[];
  // 'profile' = asked because of the user's onboarding profile (e.g. they
  // have a pet), not because the message itself left something open.
  source: 'message' | 'profile';
  // 'date' / 'dateRange' render date pickers (the answer becomes an exact
  // ISO date or "start to end" range); a free-text answer is still allowed.
  kind?: 'choice' | 'date' | 'dateRange';
}

export interface OnboardingProfile {
  ageRange?: AgeRange;
  // Core technical schema
  family_structure?: FamilyStructure;
  calendar_type?: CalendarTypeScope;

  // Location / home base for travel distance & drive buffer estimation
  homeZipOrLocation?: string;

  // Feeds the pet-sitter/pet-care prep milestones in tminusRules.ts
  // (travel_trip category) so trips get "Book pet sitter" style tasks
  // without the user having to mention a pet by name every time.
  hasPet?: boolean;

  // Display & legacy backwards compatibility
  familyStatus?: FamilyStatus;
  calendarType?: CalendarType;
  privacyConsentAccepted?: boolean;
  completedAt?: string;
}

export interface CookieConsentSettings {
  hasConsented: boolean;
  functional: boolean;
  analytics: boolean;
  timestamp?: string;
}

// Custom T-Minus Template Presets & Spreadsheet Importer Types
export interface CustomPresetMilestone {
  id: string;
  task: string;
  t_minus_days: number; // e.g. 30 for T-30d, 0 for launch day, -7 for Day +7
  tag: string; // e.g. "QA", "Legal", "Design", "Marketing", "Logistics", "Operations"
  description?: string;
  kind?: TaskItemKind;
  scope?: 'macro' | 'micro';
  deliverableType?: string;
}

export interface CustomPreset {
  id: string;
  title: string;
  name?: string; // friendly alias for title
  description?: string;
  category: MilestoneCategory | string;
  tags: string[];
  milestones: CustomPresetMilestone[];
  createdAt: string;
  updatedAt: string;
  isBuiltIn?: boolean;
  author?: string;
}

export interface SpreadsheetColumnMapping {
  taskCol: string;
  offsetCol?: string;
  tagCol?: string;
  descCol?: string;
}

